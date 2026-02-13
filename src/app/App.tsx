import { useState, useEffect, useRef } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { UserInfoScreen } from './components/UserInfoScreen';
import { WorkoutPlanSetup } from './components/WorkoutPlanSetup';
import { Dashboard } from './components/Dashboard';
import { ActiveWorkout, type WorkoutCompletionSummary } from './components/ActiveWorkout';
import { WorkoutPreview } from './components/WorkoutPreview';
import { WorkoutSummary } from './components/WorkoutSummary';
import { supabase } from './lib/supabase';
import { api } from './lib/api';
import { Toaster } from './components/ui/sonner';

type Screen = 
  | 'auth'
  | 'user-info'
  | 'workout-setup'
  | 'dashboard'
  | 'workout-preview'
  | 'workout-summary'
  | 'active-workout';

interface WorkoutDay {
  day: string;
  exercises: Array<{
    name: string;
    sets: number;
    minReps: number;
    maxReps: number;
    restTime: number;
  }>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('auth');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDay | null>(null);
  const [selectedWorkoutCompletedToday, setSelectedWorkoutCompletedToday] = useState(false);
  const [workoutSummary, setWorkoutSummary] = useState<WorkoutCompletionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const onboardingInProgress = useRef(false);
  const lastOnboardingToken = useRef<string | null>(null);

  useEffect(() => {
    // Listen for auth state changes (handles initial session, login and token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, 'Has session:', !!session);

      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.access_token) {
        setAccessToken(session.access_token);
        await handleOnboardingCheck(session.access_token);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.access_token) {
        console.log('Token refreshed successfully');
        setAccessToken(session.access_token);
      } else if (event === 'INITIAL_SESSION' && !session) {
        setAccessToken(null);
        setScreen('auth');
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setAccessToken(null);
        setScreen('auth');
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const isAuthError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('HTTP 401') ||
      message.toLowerCase().includes('invalid jwt') ||
      message.toLowerCase().includes('unauthorized')
    );
  };

  const resetToAuth = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out after auth failure error:', error);
    }

    setAccessToken(null);
    setSelectedWorkout(null);
    setSelectedWorkoutCompletedToday(false);
    setWorkoutSummary(null);
    lastOnboardingToken.current = null;
    setScreen('auth');
  };

  const handleOnboardingCheck = async (token: string, force = false) => {
    if (!force && (onboardingInProgress.current || lastOnboardingToken.current === token)) {
      return;
    }

    onboardingInProgress.current = true;

    try {
      // Check if user has completed onboarding
      const [userInfoResult, workoutPlanResult] = await Promise.all([
        api.getUserInfo(token),
        api.getWorkoutPlan(token)
      ]);

      console.log('Onboarding check - User info exists:', !!userInfoResult.profile, 'Workout plan exists:', !!workoutPlanResult.workoutPlan);

      if (userInfoResult.error && userInfoResult.error !== 'Unauthorized') {
        console.error('Error checking user info:', userInfoResult.error);
      }

      if (workoutPlanResult.error && workoutPlanResult.error !== 'Unauthorized') {
        console.error('Error checking workout plan:', workoutPlanResult.error);
      }

      if (!userInfoResult.profile) {
        setScreen('user-info');
      } else if (!workoutPlanResult.workoutPlan) {
        setScreen('workout-setup');
      } else {
        setScreen('dashboard');
      }
      lastOnboardingToken.current = token;
    } catch (err) {
      console.error('Onboarding check error:', err);
      if (isAuthError(err)) {
        await resetToAuth();
      } else {
        setScreen('user-info');
      }
    } finally {
      onboardingInProgress.current = false;
    }
  };

  const handleUserInfoComplete = async () => {
    console.log('User info completed');
    if (accessToken) {
      await handleOnboardingCheck(accessToken, true);
    } else {
      setScreen('workout-setup');
    }
  };

  const handleWorkoutSetupComplete = async () => {
    console.log('Workout setup completed');
    if (accessToken) {
      await handleOnboardingCheck(accessToken, true);
    } else {
      setScreen('dashboard');
    }
  };

  const handleStartWorkout = (workout: WorkoutDay) => {
    setSelectedWorkout(workout);
    setSelectedWorkoutCompletedToday(false);
    setScreen('active-workout');
  };

  const handleViewWorkout = (workout: WorkoutDay, isCompletedToday: boolean) => {
    setSelectedWorkout(workout);
    setSelectedWorkoutCompletedToday(isCompletedToday);
    setScreen('workout-preview');
  };

  const handleWorkoutComplete = (summary: WorkoutCompletionSummary) => {
    setWorkoutSummary(summary);
    setSelectedWorkout(null);
    setSelectedWorkoutCompletedToday(false);
    setScreen('workout-summary');
  };

  const handleBackToDashboard = () => {
    setSelectedWorkout(null);
    setSelectedWorkoutCompletedToday(false);
    setWorkoutSummary(null);
    setScreen('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {screen === 'auth' && (
        <AuthScreen />
      )}

      {screen === 'user-info' && accessToken && (
        <UserInfoScreen
          accessToken={accessToken}
          onComplete={handleUserInfoComplete}
        />
      )}

      {screen === 'workout-setup' && accessToken && (
        <WorkoutPlanSetup
          accessToken={accessToken}
          onComplete={handleWorkoutSetupComplete}
        />
      )}

      {screen === 'dashboard' && accessToken && (
        <Dashboard
          accessToken={accessToken}
          onStartWorkout={handleStartWorkout}
          onViewWorkout={handleViewWorkout}
          onLogout={resetToAuth}
        />
      )}

      {screen === 'workout-preview' && accessToken && selectedWorkout && (
        <WorkoutPreview
          accessToken={accessToken}
          workout={selectedWorkout}
          isCompletedToday={selectedWorkoutCompletedToday}
          onStart={() => setScreen('active-workout')}
          onBack={handleBackToDashboard}
        />
      )}

      {screen === 'active-workout' && accessToken && selectedWorkout && (
        <ActiveWorkout
          accessToken={accessToken}
          workout={selectedWorkout}
          onComplete={handleWorkoutComplete}
          onBack={handleBackToDashboard}
        />
      )}

      {screen === 'workout-summary' && workoutSummary && (
        <WorkoutSummary
          summary={workoutSummary}
          onBackToDashboard={handleBackToDashboard}
        />
      )}

      <Toaster />
    </>
  );
}
