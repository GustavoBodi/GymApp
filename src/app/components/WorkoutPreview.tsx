import { ArrowLeft, Play } from 'lucide-react';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
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
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

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

interface WorkoutPreviewProps {
  accessToken: string;
  workout: WorkoutDay;
  isCompletedToday: boolean;
  onBack: () => void;
  onStart: () => void;
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

export function WorkoutPreview({ accessToken, workout, isCompletedToday, onBack, onStart }: WorkoutPreviewProps) {
  const [showConfirmRestart, setShowConfirmRestart] = useState(false);
  const [historyForWorkout, setHistoryForWorkout] = useState<WorkoutHistoryEntry[]>([]);
  const [selectedHistoryCompletedAt, setSelectedHistoryCompletedAt] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);

  const handleStartClick = () => {
    if (isCompletedToday) {
      setShowConfirmRestart(true);
      return;
    }

    onStart();
  };

  useEffect(() => {
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const result = await api.getWorkoutHistory(accessToken);
        const history = Array.isArray(result.history) ? result.history : [];
        const filtered = history
          .filter((entry): entry is WorkoutHistoryEntry => (
            Boolean(entry?.completedAt) && entry?.workoutDay === workout.day
          ))
          .sort(
            (a, b) =>
              new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
          );

        setHistoryForWorkout(filtered);
        setSelectedHistoryCompletedAt(filtered[0]?.completedAt ?? '');
      } catch (error) {
        console.error('Load workout-specific history error:', error);
        setHistoryForWorkout([]);
        setSelectedHistoryCompletedAt('');
      } finally {
        setHistoryLoading(false);
      }
    };

    loadHistory();
  }, [accessToken, workout.day]);

  const selectedHistory = historyForWorkout.find(
    (entry) => entry.completedAt === selectedHistoryCompletedAt,
  ) ?? null;

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
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to dashboard
        </Button>

        <div className="mb-8">
          <h2 className="text-2xl font-medium">{workout.day} Workout</h2>
          <p className="text-muted-foreground mt-1">
            {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
          </p>
          {isCompletedToday && (
            <p className="text-sm text-primary mt-2">You already completed this workout today.</p>
          )}
        </div>

        <div className="space-y-3 mb-8">
          {workout.exercises.map((exercise, index) => (
            <div key={index} className="border border-border rounded-xl p-4">
              <div className="font-medium">{exercise.name}</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {exercise.sets} sets × {exercise.minReps}-{exercise.maxReps} reps · {exercise.restTime}s rest
              </div>
            </div>
          ))}
        </div>

        <div className="border border-border rounded-xl p-6 mb-8">
          <h3 className="text-lg font-medium mb-4">Last Sessions For {workout.day}</h3>
          {historyLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : historyForWorkout.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No completed sessions for this workout yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-2">Select session</div>
                <Select
                  value={selectedHistoryCompletedAt}
                  onValueChange={setSelectedHistoryCompletedAt}
                >
                  <SelectTrigger className="w-full md:w-[420px]">
                    <SelectValue placeholder="Choose a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {historyForWorkout.map((entry) => {
                      const completedDate = new Date(entry.completedAt);
                      const label = `${completedDate.toLocaleDateString()} ${completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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
                <div className="space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
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
                        No detailed exercise logs found for this session.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <Button onClick={handleStartClick} className="w-full" size="lg">
          <Play className="w-4 h-4 mr-2" />
          {isCompletedToday ? 'Do Workout Again' : 'Start Workout'}
        </Button>
      </div>

      <AlertDialog open={showConfirmRestart} onOpenChange={setShowConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start this workout again?</AlertDialogTitle>
            <AlertDialogDescription>
              You already completed this workout today. Do you want to start it again?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfirmRestart(false);
                onStart();
              }}
            >
              Start Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
