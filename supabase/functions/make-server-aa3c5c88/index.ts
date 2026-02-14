import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

const BASE_PATH = "/make-server-aa3c5c88";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const authClientKey = serviceRoleKey || anonKey;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

const supabase = createClient(supabaseUrl, authClientKey);

const getProjectRefFromUrl = (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
};

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
  if (!supabaseUrl || !authClientKey) {
    return {
      user: null,
      status: 500,
      error:
        "Function auth client is not configured. Missing SUPABASE_URL and/or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.",
      code: "missing_supabase_env",
      claims: null,
      debug: {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
        hasAnonKey: Boolean(anonKey),
      },
    };
  }

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
      debug: {
        projectRefFromUrl: getProjectRefFromUrl(supabaseUrl),
        authClientKeyType: serviceRoleKey ? "service_role" : "anon",
      },
    };
  }

  return { user, status: 200, error: null, code: null, claims: null };
};

type UserInfoSnapshot = {
  weight: number;
  height: number;
  age: number;
  bodyFat: number | null;
};

type UserInfoHistoryEntry = UserInfoSnapshot & {
  entryId: string;
  recordedAt: string;
  updatedAt: string;
};

const userInfoLatestKey = (userId: string) => `user_info_${userId}`;
const userInfoHistoryPrefix = (userId: string) => `user_info_history:${userId}:`;
const userInfoHistoryKey = (userId: string, entryId: string) =>
  `${userInfoHistoryPrefix(userId)}${entryId}`;

const parseUserInfoPayload = (
  payload: Record<string, unknown>,
): { data: UserInfoSnapshot | null; error: string | null } => {
  const weight = Number(payload.weight);
  const height = Number(payload.height);
  const age = Number(payload.age);

  if (!Number.isFinite(weight) || weight <= 0) {
    return { data: null, error: "Invalid weight" };
  }

  if (!Number.isFinite(height) || height <= 0) {
    return { data: null, error: "Invalid height" };
  }

  if (!Number.isFinite(age) || age <= 0) {
    return { data: null, error: "Invalid age" };
  }

  const bodyFatRaw = payload.bodyFat;
  let bodyFat: number | null = null;

  if (bodyFatRaw !== undefined && bodyFatRaw !== null && bodyFatRaw !== "") {
    const parsedBodyFat = Number(bodyFatRaw);
    if (
      !Number.isFinite(parsedBodyFat) ||
      parsedBodyFat < 0 ||
      parsedBodyFat > 100
    ) {
      return { data: null, error: "Invalid body fat percentage" };
    }
    bodyFat = parsedBodyFat;
  }

  return {
    data: {
      weight,
      height,
      age: Math.round(age),
      bodyFat,
    },
    error: null,
  };
};

const asHistoryEntry = (
  value: unknown,
): UserInfoHistoryEntry | null => {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Partial<UserInfoHistoryEntry>;

  if (
    typeof entry.entryId !== "string" ||
    typeof entry.recordedAt !== "string" ||
    typeof entry.updatedAt !== "string" ||
    typeof entry.weight !== "number" ||
    typeof entry.height !== "number" ||
    typeof entry.age !== "number"
  ) {
    return null;
  }

  return {
    entryId: entry.entryId,
    recordedAt: entry.recordedAt,
    updatedAt: entry.updatedAt,
    weight: entry.weight,
    height: entry.height,
    age: entry.age,
    bodyFat:
      typeof entry.bodyFat === "number" ? entry.bodyFat : null,
  };
};

const sortHistoryDesc = (entries: UserInfoHistoryEntry[]) =>
  [...entries].sort(
    (a, b) =>
      new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  );

const ensureUserInfoHistory = async (
  userId: string,
): Promise<UserInfoHistoryEntry[]> => {
  const historyRaw = await kv.getByPrefix(userInfoHistoryPrefix(userId));
  const parsedHistory = historyRaw
    .map((item) => asHistoryEntry(item))
    .filter((item): item is UserInfoHistoryEntry => Boolean(item));

  if (parsedHistory.length > 0) {
    return sortHistoryDesc(parsedHistory);
  }

  const latest = await kv.get(userInfoLatestKey(userId));
  if (!latest) {
    return [];
  }

  const now = new Date().toISOString();
  const latestObj = latest as Record<string, unknown>;
  const snapshotParse = parseUserInfoPayload({
    weight: latestObj.weight,
    height: latestObj.height,
    age: latestObj.age,
    bodyFat: latestObj.bodyFat ?? null,
  });

  if (!snapshotParse.data) {
    return [];
  }

  const recordedAt =
    typeof latestObj.updatedAt === "string" ? latestObj.updatedAt : now;
  const entryId = `legacy_${Date.now()}`;
  const legacyEntry: UserInfoHistoryEntry = {
    entryId,
    ...snapshotParse.data,
    recordedAt,
    updatedAt: recordedAt,
  };

  await kv.set(userInfoHistoryKey(userId, entryId), legacyEntry);
  return [legacyEntry];
};

const latestProfileFromEntry = (entry: UserInfoHistoryEntry) => ({
  weight: entry.weight,
  height: entry.height,
  age: entry.age,
  bodyFat: entry.bodyFat,
  updatedAt: entry.updatedAt,
});

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

      const parseResult = parseUserInfoPayload(await req.json());
      if (!parseResult.data) {
        return jsonResponse({ error: parseResult.error }, 400);
      }

      await ensureUserInfoHistory(auth.user.id);
      const now = new Date().toISOString();
      const entryId = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const historyEntry: UserInfoHistoryEntry = {
        entryId,
        ...parseResult.data,
        recordedAt: now,
        updatedAt: now,
      };

      await kv.set(userInfoHistoryKey(auth.user.id, entryId), historyEntry);
      await kv.set(userInfoLatestKey(auth.user.id), latestProfileFromEntry(historyEntry));

      console.log("User info saved successfully for user:", auth.user.id);
      return jsonResponse({ success: true, entry: historyEntry });
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

      let profile = await kv.get(userInfoLatestKey(auth.user.id));

      if (!profile) {
        const history = await ensureUserInfoHistory(auth.user.id);
        const latestEntry = sortHistoryDesc(history)[0];
        if (latestEntry) {
          profile = latestProfileFromEntry(latestEntry);
          await kv.set(userInfoLatestKey(auth.user.id), profile);
        }
      }

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

  if (pathname === `${BASE_PATH}/user-info-history` && req.method === "GET") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const history = await ensureUserInfoHistory(auth.user.id);
      return jsonResponse({ history: sortHistoryDesc(history) });
    } catch (error) {
      console.log("Get user info history error:", error);
      return jsonResponse(
        { error: `Failed to get user info history: ${getErrorMessage(error)}` },
        500,
      );
    }
  }

  const userInfoHistoryMatch = pathname.match(
    new RegExp(`^${BASE_PATH}/user-info-history/([^/]+)$`),
  );
  if (userInfoHistoryMatch && req.method === "PUT") {
    try {
      const auth = await getAuthenticatedUser(req);

      if (!auth.user?.id) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const entryId = decodeURIComponent(userInfoHistoryMatch[1]);
      const historyKey = userInfoHistoryKey(auth.user.id, entryId);
      const existing = asHistoryEntry(await kv.get(historyKey));

      if (!existing) {
        return jsonResponse({ error: "History entry not found" }, 404);
      }

      const parseResult = parseUserInfoPayload(await req.json());
      if (!parseResult.data) {
        return jsonResponse({ error: parseResult.error }, 400);
      }

      const updatedEntry: UserInfoHistoryEntry = {
        ...existing,
        ...parseResult.data,
        updatedAt: new Date().toISOString(),
      };

      await kv.set(historyKey, updatedEntry);

      const history = await ensureUserInfoHistory(auth.user.id);
      const latestEntry = sortHistoryDesc(history)[0] ?? updatedEntry;
      await kv.set(userInfoLatestKey(auth.user.id), latestProfileFromEntry(latestEntry));

      return jsonResponse({ success: true, entry: updatedEntry });
    } catch (error) {
      console.log("Update user info history entry error:", error);
      return jsonResponse(
        { error: `Failed to update user info history entry: ${getErrorMessage(error)}` },
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
