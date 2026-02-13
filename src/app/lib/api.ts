import { projectId, publicAnonKey } from "../../../utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-aa3c5c88`;

const parseResponse = async (response: Response) => {
  const text = await response.text();
  let payload: any = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    const message =
      payload?.error ??
      payload?.message ??
      `Request failed with status ${response.status}`;

    throw new Error(
      `${message} (HTTP ${response.status})`,
    );
  }

  return payload;
};

const authorizedFetch = async (
  path: string,
  accessToken: string,
  init: RequestInit = {},
) => {
  const headers = new Headers(init.headers ?? {});
  headers.set("apikey", publicAnonKey);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  return parseResponse(response);
};

export const api = {
  async testAuth(accessToken: string) {
    return authorizedFetch("/test-auth", accessToken);
  },

  async saveUserInfo(
    accessToken: string,
    weight: number,
    height: number,
    age: number,
    bodyFat?: number,
  ) {
    return authorizedFetch("/user-info", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ weight, height, age, bodyFat }),
    });
  },

  async getUserInfo(accessToken: string) {
    return authorizedFetch("/user-info", accessToken);
  },

  async saveWorkoutPlan(accessToken: string, workoutPlan: any) {
    return authorizedFetch("/workout-plan", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workoutPlan }),
    });
  },

  async getWorkoutPlan(accessToken: string) {
    return authorizedFetch("/workout-plan", accessToken);
  },

  async startWorkout(accessToken: string, workoutDay: string, exercises: any[]) {
    return authorizedFetch("/start-workout", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workoutDay, exercises }),
    });
  },

  async logExercise(
    accessToken: string,
    sessionId: string,
    exerciseName: string,
    setsData: any[],
    weight: number,
    restTakenSeconds = 0,
  ) {
    return authorizedFetch("/log-exercise", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        exerciseName,
        setsData,
        weight,
        restTakenSeconds,
      }),
    });
  },

  async completeWorkout(accessToken: string, sessionId: string) {
    return authorizedFetch("/complete-workout", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });
  },

  async getWorkoutHistory(accessToken: string) {
    return authorizedFetch("/workout-history", accessToken);
  },

  async getStreak(accessToken: string) {
    return authorizedFetch("/streak", accessToken);
  },

  async getExerciseWeights(accessToken: string, exerciseName: string) {
    return authorizedFetch(
      `/exercise-weights/${encodeURIComponent(exerciseName)}`,
      accessToken,
    );
  },
};
