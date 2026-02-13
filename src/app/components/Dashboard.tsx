import { useEffect, useState } from 'react';
import { Dumbbell, TrendingUp, Calendar, Settings, CheckCircle2, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { api } from '../lib/api';
import { UserInfoScreen } from './UserInfoScreen';

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

interface CompletedExerciseLog {
  exerciseName: string;
  setsData: number[];
  weight: number;
  restTakenSeconds?: number;
}

interface WorkoutHistoryEntry {
  workoutDay: string;
  completedAt: string;
  startedAt?: string;
  totalWorkoutSeconds?: number;
  totalRestSeconds?: number;
  completedExercises?: CompletedExerciseLog[];
}

interface DashboardProps {
  accessToken: string;
  onStartWorkout: (workout: WorkoutDay) => void;
  onViewWorkout: (workout: WorkoutDay, isCompletedToday: boolean) => void;
  onLogout: () => Promise<void> | void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function Dashboard({ accessToken, onStartWorkout, onViewWorkout, onLogout }: DashboardProps) {
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutDay[]>([]);
  const [streak, setStreak] = useState(0);
  const [completedDaysThisWeek, setCompletedDaysThisWeek] = useState<Set<string>>(new Set());
  const [completedDaysToday, setCompletedDaysToday] = useState<Set<string>>(new Set());
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [showHistoryAnalysis, setShowHistoryAnalysis] = useState(false);
  const [selectedHistoryCompletedAt, setSelectedHistoryCompletedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingWorkout, setPendingWorkout] = useState<WorkoutDay | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [planResult, streakResult, historyResult] = await Promise.all([
        api.getWorkoutPlan(accessToken),
        api.getStreak(accessToken),
        api.getWorkoutHistory(accessToken),
      ]);

      if (planResult.workoutPlan) {
        setWorkoutPlan(planResult.workoutPlan);
      }

      if (streakResult.streak !== undefined) {
        setStreak(streakResult.streak);
      }

      const history = Array.isArray(historyResult.history) ? historyResult.history : [];
      const normalizedHistory = history
        .filter((entry): entry is WorkoutHistoryEntry => Boolean(entry?.completedAt && entry?.workoutDay))
        .sort(
          (a, b) =>
            new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
        );
      const weekCompletedDays = new Set<string>();
      const todayCompletedDays = new Set<string>();
      const now = new Date();
      const todayString = now.toDateString();
      const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday=0
      const weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - dayIndex);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      for (const entry of history) {
        if (!entry?.completedAt || !entry?.workoutDay) continue;
        const completedAt = new Date(entry.completedAt);
        if (completedAt >= weekStart && completedAt < weekEnd) {
          weekCompletedDays.add(entry.workoutDay);
        }
        if (completedAt.toDateString() === todayString) {
          todayCompletedDays.add(entry.workoutDay);
        }
      }

      setCompletedDaysThisWeek(weekCompletedDays);
      setCompletedDaysToday(todayCompletedDays);
      setWorkoutHistory(normalizedHistory);
      setSelectedHistoryCompletedAt((currentSelected) => {
        if (currentSelected && normalizedHistory.some((entry) => entry.completedAt === currentSelected)) {
          return currentSelected;
        }
        return normalizedHistory[0]?.completedAt ?? '';
      });
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTodayWorkout = () => {
    const today = DAYS_OF_WEEK[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    return workoutPlan.find(w => w.day === today);
  };

  const handleStartWorkout = (workout: WorkoutDay) => {
    const today = DAYS_OF_WEEK[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    
    if (workout.day !== today) {
      // Show warning for non-today workout
      setPendingWorkout(workout);
      setShowWarning(true);
    } else {
      onStartWorkout(workout);
    }
  };

  const confirmStartWorkout = () => {
    if (pendingWorkout) {
      onStartWorkout(pendingWorkout);
      setPendingWorkout(null);
      setShowWarning(false);
    }
  };

  const handleUpdateInfo = () => {
    setShowSettings(false);
    // Reload data after update
    loadData();
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await onLogout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (showSettings) {
    return (
      <UserInfoScreen
        accessToken={accessToken}
        onComplete={handleUpdateInfo}
        isUpdating={true}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const todayWorkout = getTodayWorkout();
  const todayDay = DAYS_OF_WEEK[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const todayCompleted = completedDaysToday.has(todayDay);
  const selectedHistory = workoutHistory.find((entry) => entry.completedAt === selectedHistoryCompletedAt) ?? null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTotalWorkoutSeconds = (entry: WorkoutHistoryEntry) => {
    if (typeof entry.totalWorkoutSeconds === 'number') {
      return entry.totalWorkoutSeconds;
    }
    if (entry.startedAt && entry.completedAt) {
      return Math.max(
        0,
        Math.round(
          (new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()) / 1000,
        ),
      );
    }
    return 0;
  };

  const getTotalRestSeconds = (entry: WorkoutHistoryEntry) => {
    if (typeof entry.totalRestSeconds === 'number') {
      return entry.totalRestSeconds;
    }
    return (entry.completedExercises ?? []).reduce(
      (sum, exercise) => sum + (Number(exercise.restTakenSeconds) || 0),
      0,
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <Dumbbell className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-medium">FitTrack</h1>
                <p className="text-sm text-muted-foreground">Your workout companion</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Settings className="w-5 h-5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  Update Info
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleLogout()} disabled={isLoggingOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  {isLoggingOut ? 'Signing out...' : 'Log out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Streak Card */}
        {streak > 0 && (
          <div className="mb-8 p-6 rounded-xl border border-border bg-accent">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Current Streak</div>
                <div className="text-2xl font-medium">
                  {streak} day{streak !== 1 ? 's' : ''}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  You haven't missed a single day in the gym for the last {streak} day{streak !== 1 ? 's' : ''}! 🔥
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Today's Workout */}
        {todayWorkout && (
          <div className="mb-8">
            <h2 className="text-lg font-medium mb-4">Today's Workout</h2>
            <div className="border border-border rounded-xl p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-medium">{todayWorkout.day}</h3>
                  <p className="text-muted-foreground mt-1">
                    {todayWorkout.exercises.length} exercise{todayWorkout.exercises.length !== 1 ? 's' : ''}
                  </p>
                  {todayCompleted && (
                    <div className="mt-2 text-sm text-primary flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Completed today
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onViewWorkout(todayWorkout, todayCompleted)}>
                    View
                  </Button>
                  {!todayCompleted && (
                    <Button onClick={() => handleStartWorkout(todayWorkout)}>
                      Start Workout
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {todayWorkout.exercises.map((exercise, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-accent flex justify-between items-center"
                  >
                    <span className="font-medium">{exercise.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {exercise.sets} × {exercise.minReps}-{exercise.maxReps}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Weekly Schedule */}
        <div>
          <h2 className="text-lg font-medium mb-4">Weekly Schedule</h2>
          <div className="space-y-3">
            {DAYS_OF_WEEK.map(day => {
              const workout = workoutPlan.find(w => w.day === day);
              const isToday = day === DAYS_OF_WEEK[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
              const isCompleted = completedDaysThisWeek.has(day);
              const isCompletedToday = completedDaysToday.has(day);

              return (
                <div
                  key={day}
                  className={`border rounded-xl p-4 transition-colors ${
                    isCompleted
                      ? 'border-primary bg-accent'
                      : isToday
                        ? 'border-primary bg-accent'
                        : 'border-border'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {day}
                          {isToday && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                              Today
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Done
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {workout ? (
                            `${workout.exercises.length} exercise${workout.exercises.length !== 1 ? 's' : ''}`
                          ) : (
                            'Rest day'
                          )}
                        </div>
                      </div>
                    </div>

                    {workout && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewWorkout(workout, isCompletedToday)}
                        >
                          View
                        </Button>
                        {!isCompletedToday && (
                          <Button
                            size="sm"
                            onClick={() => handleStartWorkout(workout)}
                          >
                            Start
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Last Workouts Analysis */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Last Workouts</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryAnalysis((prev) => !prev)}
            >
              {showHistoryAnalysis ? 'Hide' : 'View Last Workouts'}
            </Button>
          </div>

          {showHistoryAnalysis && (
            <div className="border border-border rounded-xl p-6 space-y-5">
              {workoutHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No completed workouts yet.
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Select finished workout</div>
                    <Select
                      value={selectedHistoryCompletedAt}
                      onValueChange={setSelectedHistoryCompletedAt}
                    >
                      <SelectTrigger className="w-full md:w-[420px]">
                        <SelectValue placeholder="Choose a workout" />
                      </SelectTrigger>
                      <SelectContent>
                        {workoutHistory.map((entry) => {
                          const completedDate = new Date(entry.completedAt);
                          const label = `${entry.workoutDay} · ${completedDate.toLocaleDateString()} ${completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                          return (
                            <SelectItem key={entry.completedAt} value={entry.completedAt}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedHistory && (
                    <div className="space-y-4">
                      <div className="grid md:grid-cols-3 gap-3">
                        <div className="border border-border rounded-lg p-4">
                          <div className="text-xs text-muted-foreground">Total Workout Time</div>
                          <div className="text-lg font-medium mt-1">
                            {formatTime(getTotalWorkoutSeconds(selectedHistory))}
                          </div>
                        </div>
                        <div className="border border-border rounded-lg p-4">
                          <div className="text-xs text-muted-foreground">Total Rest Time</div>
                          <div className="text-lg font-medium mt-1">
                            {formatTime(getTotalRestSeconds(selectedHistory))}
                          </div>
                        </div>
                        <div className="border border-border rounded-lg p-4">
                          <div className="text-xs text-muted-foreground">Completed Exercises</div>
                          <div className="text-lg font-medium mt-1">
                            {(selectedHistory.completedExercises ?? []).length}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {(selectedHistory.completedExercises ?? []).map((exercise, index) => (
                          <div key={`${exercise.exerciseName}-${index}`} className="border border-border rounded-lg p-3">
                            <div className="font-medium">{exercise.exerciseName}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Reps: {(exercise.setsData ?? []).join(' / ') || '-'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Weight: {Number(exercise.weight) || 0} kg
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Rest: {formatTime(Number(exercise.restTakenSeconds) || 0)}
                            </div>
                          </div>
                        ))}
                        {(selectedHistory.completedExercises ?? []).length === 0 && (
                          <div className="text-sm text-muted-foreground">
                            No detailed exercise logs found for this workout.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Warning Dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to start a workout for a day other than today?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStartWorkout}>Start</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
