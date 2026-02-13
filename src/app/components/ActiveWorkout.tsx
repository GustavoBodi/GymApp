import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowLeft, Clock, CheckCircle2, Play } from 'lucide-react';
import { api } from '../lib/api';

interface Exercise {
  name: string;
  sets: number;
  minReps: number;
  maxReps: number;
  restTime: number;
}

interface WorkoutDay {
  day: string;
  exercises: Exercise[];
}

export interface WorkoutExerciseSummary {
  exerciseName: string;
  setsData: number[];
  weight: number;
  restTakenSeconds: number;
}

export interface WorkoutCompletionSummary {
  workoutDay: string;
  completedAt: string;
  totalWorkoutSeconds: number;
  totalRestSeconds: number;
  exercises: WorkoutExerciseSummary[];
}

interface ActiveWorkoutProps {
  accessToken: string;
  workout: WorkoutDay;
  onComplete: (summary: WorkoutCompletionSummary) => void;
  onBack: () => void;
}

export function ActiveWorkout({ accessToken, workout, onComplete, onBack }: ActiveWorkoutProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState<number | null>(null);
  const [completedExercises, setCompletedExercises] = useState<Set<number>>(new Set());
  const [completedExerciseLogs, setCompletedExerciseLogs] = useState<WorkoutExerciseSummary[]>([]);
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null);
  const [restTimer, setRestTimer] = useState<number>(0);
  const [isResting, setIsResting] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [totalRestSeconds, setTotalRestSeconds] = useState(0);
  const [exerciseRestSeconds, setExerciseRestSeconds] = useState<Record<number, number>>({});
  const [showSetLogger, setShowSetLogger] = useState(false);
  const [setsData, setSetsData] = useState<number[]>([]);
  const [weight, setWeight] = useState<string>('');
  const [error, setError] = useState('');

  const finalizeRestTracking = (exerciseIndex: number | null) => {
    if (exerciseIndex === null || restStartedAt === null) {
      return;
    }

    const elapsedSeconds = Math.max(0, Math.round((Date.now() - restStartedAt) / 1000));
    setTotalRestSeconds((prev) => prev + elapsedSeconds);
    setExerciseRestSeconds((prev) => ({
      ...prev,
      [exerciseIndex]: (prev[exerciseIndex] ?? 0) + elapsedSeconds,
    }));
    setRestStartedAt(null);
  };

  useEffect(() => {
    startSession();
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!isResting) {
      return;
    }

    const interval = setInterval(() => {
      setRestTimer((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isResting]);

  useEffect(() => {
    if (isResting && restTimer === 0) {
      finalizeRestTracking(currentExerciseIndex);
      setIsResting(false);
      sendNotification('Rest complete!', 'Time to continue your workout');
    }
  }, [isResting, restTimer, currentExerciseIndex, restStartedAt]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const sendNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' });
    }
  };

  const startSession = async () => {
    try {
      const startedAt = Date.now();
      const result = await api.startWorkout(accessToken, workout.day, workout.exercises);
      if (result.sessionId) {
        setSessionId(result.sessionId);
        setWorkoutStartedAt(startedAt);
      }
    } catch (err) {
      console.error('Start session error:', err);
      setError('Failed to start workout session');
    }
  };

  const startExercise = (index: number) => {
    setCurrentExerciseIndex(index);
    const exercise = workout.exercises[index];
    const defaultReps = Math.round((exercise.minReps + exercise.maxReps) / 2);
    setSetsData(new Array(exercise.sets).fill(defaultReps));
    setWeight('');
    setShowSetLogger(false);
  };

  const finishSet = () => {
    if (currentExerciseIndex === null) return;
    setShowSetLogger(true);
  };

  const logExercise = async () => {
    if (currentExerciseIndex === null || !sessionId) return;

    const exercise = workout.exercises[currentExerciseIndex];
    const parsedWeight = parseFloat(weight) || 0;
    const restTakenSeconds = exerciseRestSeconds[currentExerciseIndex] ?? 0;

    try {
      await api.logExercise(
        accessToken,
        sessionId,
        exercise.name,
        setsData,
        parsedWeight,
        restTakenSeconds,
      );

      setCompletedExercises(new Set([...completedExercises, currentExerciseIndex]));
      setCompletedExerciseLogs((prev) => [
        ...prev,
        {
          exerciseName: exercise.name,
          setsData: [...setsData],
          weight: parsedWeight,
          restTakenSeconds,
        },
      ]);
      setCurrentExerciseIndex(null);
      setShowSetLogger(false);
    } catch (err) {
      console.error('Log exercise error:', err);
      setError('Failed to log exercise');
    }
  };

  const startRest = () => {
    if (currentExerciseIndex === null) return;
    const exercise = workout.exercises[currentExerciseIndex];
    setRestTimer(exercise.restTime);
    setRestStartedAt(Date.now());
    setIsResting(true);
  };

  const completeWorkout = async () => {
    if (!sessionId) return;

    try {
      if (isResting) {
        finalizeRestTracking(currentExerciseIndex);
        setIsResting(false);
        setRestTimer(0);
      }

      const result = await api.completeWorkout(accessToken, sessionId);
      const now = Date.now();
      const totalWorkoutSeconds = workoutStartedAt
        ? Math.max(0, Math.round((now - workoutStartedAt) / 1000))
        : 0;

      onComplete({
        workoutDay: workout.day,
        completedAt: result.completedAt ?? new Date(now).toISOString(),
        totalWorkoutSeconds: result.totalWorkoutSeconds ?? totalWorkoutSeconds,
        totalRestSeconds: result.totalRestSeconds ?? totalRestSeconds,
        exercises: completedExerciseLogs,
      });
    } catch (err) {
      console.error('Complete workout error:', err);
      setError('Failed to complete workout');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (showSetLogger && currentExerciseIndex !== null) {
    const exercise = workout.exercises[currentExerciseIndex];

    return (
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-medium">{exercise.name}</h2>
            <p className="text-muted-foreground mt-1">Log your sets</p>
          </div>

          <div className="space-y-6">
            <div>
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="mb-3 block">Reps per set</Label>
              <div className="space-y-3">
                {setsData.map((reps, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="text-muted-foreground w-16">Set {index + 1}</span>
                    <Input
                      type="number"
                      value={reps}
                      onChange={(e) => {
                        const newSetsData = [...setsData];
                        newSetsData[index] = parseInt(e.target.value) || 0;
                        setSetsData(newSetsData);
                      }}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive text-center">{error}</div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowSetLogger(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button onClick={logExercise} className="flex-1">
                Save Exercise
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentExerciseIndex !== null) {
    const exercise = workout.exercises[currentExerciseIndex];

    return (
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            onClick={() => setCurrentExerciseIndex(null)}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to exercises
          </Button>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-medium">{exercise.name}</h2>
            <div className="mt-4 text-muted-foreground">
              <div className="text-5xl font-medium text-foreground mb-2">
                {exercise.sets} × {exercise.minReps}-{exercise.maxReps}
              </div>
              <div>Sets × Reps</div>
            </div>
          </div>

          {isResting && (
            <div className="mb-8 p-8 rounded-xl border-2 border-primary bg-accent text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-primary" />
              <div className="text-4xl font-medium mb-2">{formatTime(restTimer)}</div>
              <div className="text-muted-foreground">Rest time remaining</div>
            </div>
          )}

          <div className="space-y-3">
            {!isResting && (
              <>
                <Button
                  onClick={startRest}
                  className="w-full"
                  size="lg"
                >
                  <Clock className="w-5 h-5 mr-2" />
                  Start Rest Timer ({exercise.restTime}s)
                </Button>

                <Button
                  onClick={finishSet}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Finish Exercise
                </Button>
              </>
            )}

            {isResting && (
              <Button
                onClick={() => {
                  finalizeRestTracking(currentExerciseIndex);
                  setIsResting(false);
                  setRestTimer(0);
                }}
                variant="outline"
                className="w-full"
              >
                Skip Rest
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to dashboard
        </Button>

        <div className="mb-8">
          <h2 className="text-2xl font-medium">{workout.day} Workout</h2>
          <p className="text-muted-foreground mt-1">
            {completedExercises.size} of {workout.exercises.length} exercises completed
          </p>
        </div>

        <div className="space-y-3 mb-8">
          {workout.exercises.map((exercise, index) => {
            const isCompleted = completedExercises.has(index);

            return (
              <div
                key={index}
                className={`border rounded-xl p-4 transition-colors ${
                  isCompleted ? 'border-primary bg-accent' : 'border-border'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {isCompleted && (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    )}
                    <div>
                      <div className="font-medium">{exercise.name}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {exercise.sets} sets × {exercise.minReps}-{exercise.maxReps} reps · {exercise.restTime}s rest
                      </div>
                    </div>
                  </div>

                  {!isCompleted && (
                    <Button
                      onClick={() => startExercise(index)}
                      size="sm"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {completedExercises.size === workout.exercises.length && (
          <Button onClick={completeWorkout} className="w-full" size="lg">
            Complete Workout
          </Button>
        )}

        {error && (
          <div className="text-sm text-destructive text-center mt-4">{error}</div>
        )}
      </div>
    </div>
  );
}
