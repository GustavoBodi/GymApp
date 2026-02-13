import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

const BASE_PATH = "/make-server-aa3c5c88";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

const supabase = createClient(supabaseUrl, serviceRoleKey);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const optionsResponse = () =>
  new Response(null, {
    status: 204,
    headers: corsHeaders,
  });

const parseJwtPayload = (token: string) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
};

const getAuthenticatedUser = async (req: Request) => {
  const authorizationHeader = req.headers.get("Authorization");

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return {
      user: null,
      status: 401,
      error: "No token provided",
      code: "missing_authorization_header",
    };
  }

  const accessToken = authorizationHeader.slice("Bearer ".length).trim();
  const claims = parseJwtPayload(accessToken);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return {
      user: null,
      status: 401,
      error: error?.message || "Unauthorized",
      code: error?.code || "invalid_jwt",
      claims: claims
        ? {
            iss: claims.iss,
            ref: claims.ref,
            aud: claims.aud,
            role: claims.role,
          }
        : null,
    };
  }

  return { user, status: 200, error: null, code: null, claims: null };
};

const handleRequest = async (req: Request) => {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  if (pathname === `${BASE_PATH}/health` && req.method === "GET") {
    return jsonResponse({ status: "ok" });
  }

  if (pathname === `${BASE_PATH}/test-auth` && req.method === "GET") {
    try {
      const auth = await getAuthenticatedUser(req);
      console.log("Test auth - Validation result:", {
        hasUser: !!auth.user,
        userId: auth.user?.id,
        error: auth.error,
        errorCode: auth.code,
      });

      if (!auth.user) {
        return jsonResponse(
          {
            error: auth.error,
            code: auth.code,
            claims: auth.claims,
            expectedProjectRef: "xqnnboswmrmrzyfvejmq",
            debug: "JWT validation failed on server",
            hint: "Ensure client and function use the same Supabase project ref",
          },
          auth.status,
        );
      }

      return jsonResponse({
        success: true,
        userId: auth.user.id,
        email: auth.user.email,
        message: "Authentication working correctly",
      });
    } catch (error) {
      console.log("Test auth exception:", error);
      return jsonResponse(
        {
          error: getErrorMessage(error),
          debug: "Server exception during auth test",
        },
        500,
      );
    }
  }

  if (pathname === `${BASE_PATH}/signup` && req.method === "POST") {
    try {
      const { email, password, name } = await req.json();

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: { name },
        // Automatically confirm the user's email since an email server hasn't been configured.
        // For production, set this to false and configure SMTP in Supabase dashboard.
        email_confirm: true,
      });

      if (error) {
        console.log("Sign up error:", error);
        return jsonResponse({ error: error.message }, 400);
      }

      return jsonResponse({ user: data.user });
    } catch (error) {
      console.log("Sign up exception:", error);
      return jsonResponse({ error: "Sign up failed" }, 500);
    }
  }

  if (pathname === `${BASE_PATH}/user-info` && req.method === "POST") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user) {
        console.log("Save user info - Authorization error:", auth.error);
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const { weight, height, age, bodyFat } = await req.json();

      const userInfo = {
        weight,
        height,
        age,
        bodyFat: bodyFat || null,
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`user_info_${auth.user.id}`, userInfo);

      console.log("User info saved successfully for user:", auth.user.id);
      return jsonResponse({ success: true });
    } catch (error) {
      console.log("Save user info error:", error);
      return jsonResponse(
        { error: `Failed to save user info: ${getErrorMessage(error)}` },
        500,
      );
    }
  }

  if (pathname === `${BASE_PATH}/user-info` && req.method === "GET") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user) {
        console.log("Get user info - Authorization error:", auth.error);
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const profile = await kv.get(`user_info_${auth.user.id}`);

      console.log(
        "User info retrieved for user:",
        auth.user.id,
        "Profile exists:",
        !!profile,
      );
      return jsonResponse({ profile });
    } catch (error) {
      console.log("Get user info error:", error);
      return jsonResponse(
        { error: `Failed to get user info: ${getErrorMessage(error)}` },
        500,
      );
    }
  }

  if (pathname === `${BASE_PATH}/workout-plan` && req.method === "POST") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        console.log("Save workout plan - Authorization error:", auth.error);
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const { workoutPlan } = await req.json();

      const planData = {
        workoutPlan,
        userId: auth.user.id,
        createdAt: new Date().toISOString(),
      };

      await kv.set(`workout_plan:${auth.user.id}`, planData);

      console.log(
        "Workout plan saved successfully for user:",
        auth.user.id,
        "Days:",
        workoutPlan.length,
      );
      return jsonResponse({ success: true });
    } catch (error) {
      console.log("Save workout plan error:", error);
      return jsonResponse(
        { error: `Failed to save workout plan: ${getErrorMessage(error)}` },
        500,
      );
    }
  }

  if (pathname === `${BASE_PATH}/workout-plan` && req.method === "GET") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        console.log("Get workout plan - Authorization error:", auth.error);
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const data = await kv.get(`workout_plan:${auth.user.id}`);

      console.log(
        "Workout plan retrieved for user:",
        auth.user.id,
        "Plan exists:",
        !!data,
      );
      return jsonResponse({ workoutPlan: data?.workoutPlan || null });
    } catch (error) {
      console.log("Get workout plan error:", error);
      return jsonResponse(
        { error: `Failed to get workout plan: ${getErrorMessage(error)}` },
        500,
      );
    }
  }

  if (pathname === `${BASE_PATH}/start-workout` && req.method === "POST") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const { workoutDay, exercises } = await req.json();
      const sessionId = `${auth.user.id}_${Date.now()}`;

      await kv.set(`workout_session:${sessionId}`, {
        userId: auth.user.id,
        workoutDay,
        exercises,
        startedAt: new Date().toISOString(),
        completedExercises: [],
      });

      return jsonResponse({ sessionId });
    } catch (error) {
      console.log("Start workout error:", error);
      return jsonResponse({ error: "Failed to start workout" }, 500);
    }
  }

  if (pathname === `${BASE_PATH}/log-exercise` && req.method === "POST") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const { sessionId, exerciseName, setsData, weight, restTakenSeconds } = await req.json();

      const session = await kv.get(`workout_session:${sessionId}`);
      if (!session) {
        return jsonResponse({ error: "Session not found" }, 404);
      }

      session.completedExercises.push({
        exerciseName,
        setsData,
        weight,
        restTakenSeconds: Number(restTakenSeconds) || 0,
        completedAt: new Date().toISOString(),
      });

      await kv.set(`workout_session:${sessionId}`, session);

      const weightHistory = (await kv.get(`exercise_weights:${auth.user.id}:${exerciseName}`)) || { history: [] };
      weightHistory.history.push({
        weight,
        date: new Date().toISOString(),
      });
      await kv.set(`exercise_weights:${auth.user.id}:${exerciseName}`, weightHistory);

      return jsonResponse({ success: true });
    } catch (error) {
      console.log("Log exercise error:", error);
      return jsonResponse({ error: "Failed to log exercise" }, 500);
    }
  }

  if (pathname === `${BASE_PATH}/complete-workout` && req.method === "POST") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const { sessionId } = await req.json();

      const session = await kv.get(`workout_session:${sessionId}`);
      if (!session) {
        return jsonResponse({ error: "Session not found" }, 404);
      }

      const completedAt = new Date().toISOString();
      const dateKey = completedAt.split("T")[0];
      const workoutDayKey = String(session.workoutDay || "unknown").replaceAll(":", "_");
      const completedAtKey = completedAt.replaceAll(":", "_");
      const totalRestSeconds = Array.isArray(session.completedExercises)
        ? session.completedExercises.reduce(
          (sum: number, exercise: { restTakenSeconds?: number }) =>
            sum + (Number(exercise.restTakenSeconds) || 0),
          0,
        )
        : 0;
      const totalWorkoutSeconds = session.startedAt
        ? Math.max(
          0,
          Math.round(
            (new Date(completedAt).getTime() - new Date(session.startedAt).getTime()) /
              1000,
          ),
        )
        : 0;

      await kv.set(`workout_history:${auth.user.id}:${workoutDayKey}:${dateKey}:${completedAtKey}`, {
        ...session,
        completedAt,
        totalRestSeconds,
        totalWorkoutSeconds,
      });

      await kv.del(`workout_session:${sessionId}`);

      return jsonResponse({ success: true, completedAt, totalRestSeconds, totalWorkoutSeconds });
    } catch (error) {
      console.log("Complete workout error:", error);
      return jsonResponse({ error: "Failed to complete workout" }, 500);
    }
  }

  if (pathname === `${BASE_PATH}/workout-history` && req.method === "GET") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const historyDataRaw = await kv.getByPrefix(`workout_history:${auth.user.id}:`);
      const historyData = historyDataRaw
        .filter((item: { completedAt?: string; workoutDay?: string }) => item?.completedAt && item?.workoutDay)
        .sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
      );

      return jsonResponse({ history: historyData });
    } catch (error) {
      console.log("Get workout history error:", error);
      return jsonResponse({ error: "Failed to get workout history" }, 500);
    }
  }

  if (pathname === `${BASE_PATH}/streak` && req.method === "GET") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const historyData = await kv.getByPrefix(`workout_history:${auth.user.id}:`);
      const uniqueDates = new Set(
        historyData
          .map((item: { completedAt?: string }) => item.completedAt?.split("T")[0])
          .filter((date: string | undefined): date is string => Boolean(date)),
      );
      const dates = Array.from(uniqueDates).sort().reverse();

      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < dates.length; i++) {
        const expectedDate = new Date(today);
        expectedDate.setDate(today.getDate() - i);
        const expectedDateStr = expectedDate.toISOString().split("T")[0];

        if (dates[i] === expectedDateStr) {
          streak++;
        } else {
          break;
        }
      }

      return jsonResponse({ streak });
    } catch (error) {
      console.log("Get streak error:", error);
      return jsonResponse({ error: "Failed to get streak" }, 500);
    }
  }

  const exerciseWeightsMatch = pathname.match(
    new RegExp(`^${BASE_PATH}/exercise-weights/(.+)$`),
  );
  if (exerciseWeightsMatch && req.method === "GET") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const exerciseName = decodeURIComponent(exerciseWeightsMatch[1]);
      const weightHistory =
        (await kv.get(`exercise_weights:${auth.user.id}:${exerciseName}`)) || { history: [] };

      return jsonResponse({ weightHistory: weightHistory.history });
    } catch (error) {
      console.log("Get exercise weights error:", error);
      return jsonResponse({ error: "Failed to get exercise weights" }, 500);
    }
  }

  return jsonResponse({ error: "Not Found" }, 404);
};

Deno.serve(async (req) => {
  const { pathname } = new URL(req.url);
  console.log(`${req.method} ${pathname}`);

  const response = await handleRequest(req);
  console.log(`${req.method} ${pathname} -> ${response.status}`);

  return response;
});
