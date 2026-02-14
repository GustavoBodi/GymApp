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
import { AnimatePresence, motion } from 'motion/react';

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
    let cancelled = false;

    // Listen for auth state changes (handles initial session, login and token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, 'Has session:', !!session);
      if (cancelled) return;

      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.access_token) {
        setAccessToken(session.access_token);
        await handleOnboardingCheck(session.access_token);
        if (!cancelled) setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.access_token) {
        console.log('Token refreshed successfully');
        setAccessToken(session.access_token);
      } else if (event === 'INITIAL_SESSION' && !session) {
        setAccessToken(null);
        setScreen('auth');
        if (!cancelled) setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setAccessToken(null);
        setScreen('auth');
        if (!cancelled) setLoading(false);
      }
    });

    // Fallback for browsers/environments where INITIAL_SESSION event can be flaky.
    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (cancelled) return;
        const token = data.session?.access_token;
        if (token) {
          setAccessToken(token);
          await handleOnboardingCheck(token);
        } else {
          setScreen('auth');
        }
      })
      .catch((error) => {
        console.error('Initial session check error:', error);
        if (!cancelled) {
          setScreen('auth');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
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

  const handleAuthSuccess = async (token: string) => {
    setAccessToken(token);
    await handleOnboardingCheck(token);
    setLoading(false);
  };

  const renderCurrentScreen = () => {
    if (screen === 'auth') {
      return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
    }

    if (screen === 'user-info' && accessToken) {
      return (
        <UserInfoScreen
          accessToken={accessToken}
          onComplete={handleUserInfoComplete}
        />
      );
    }

    if (screen === 'workout-setup' && accessToken) {
      return (
        <WorkoutPlanSetup
          accessToken={accessToken}
          onComplete={handleWorkoutSetupComplete}
        />
      );
    }

    if (screen === 'dashboard' && accessToken) {
      return (
        <Dashboard
          accessToken={accessToken}
          onStartWorkout={handleStartWorkout}
          onViewWorkout={handleViewWorkout}
          onLogout={resetToAuth}
        />
      );
    }

    if (screen === 'workout-preview' && accessToken && selectedWorkout) {
      return (
        <WorkoutPreview
          accessToken={accessToken}
          workout={selectedWorkout}
          isCompletedToday={selectedWorkoutCompletedToday}
          onStart={(updatedWorkout) => {
            setSelectedWorkout(updatedWorkout);
            setScreen('active-workout');
          }}
          onBack={handleBackToDashboard}
        />
      );
    }

    if (screen === 'active-workout' && accessToken && selectedWorkout) {
      return (
        <ActiveWorkout
          accessToken={accessToken}
          workout={selectedWorkout}
          onComplete={handleWorkoutComplete}
          onBack={handleBackToDashboard}
        />
      );
    }

    if (screen === 'workout-summary' && workoutSummary) {
      return (
        <WorkoutSummary
          summary={workoutSummary}
          onBackToDashboard={handleBackToDashboard}
        />
      );
    }

    return null;
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
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${screen}-${selectedWorkout?.day ?? 'none'}-${workoutSummary ? 'summary' : 'nosummary'}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          {renderCurrentScreen()}
        </motion.div>
      </AnimatePresence>

      <Toaster />
    </>
  );
}
