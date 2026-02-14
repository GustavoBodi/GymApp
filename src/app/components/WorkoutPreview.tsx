import { ArrowLeft, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from './ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { COMMON_EXERCISES } from '../lib/exercises';

interface WorkoutDay {
  day: string;
  exercises: Exercise[];
}

interface Exercise {
  name: string;
  sets: number;
  minReps: number;
  maxReps: number;
  restTime: number;
}

interface WorkoutPreviewProps {
  accessToken: string;
  workout: WorkoutDay;
  isCompletedToday: boolean;
  onBack: () => void;
  onStart: (workout: WorkoutDay) => void;
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

type UnsavedExitAction = 'cancel-edit' | 'back' | 'start' | null;

interface ExerciseAnalyticsPoint {
  session: string;
  sessionFull: string;
  weight: number | null;
  avgReps: number | null;
  consistency: number;
}

const weightChartConfig = {
  weight: {
    label: 'Weight (kg)',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const repsChartConfig = {
  avgReps: {
    label: 'Avg Reps',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

const consistencyChartConfig = {
  consistency: {
    label: 'Consistency (%)',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig;

export function WorkoutPreview({ accessToken, workout, isCompletedToday, onBack, onStart }: WorkoutPreviewProps) {
  const [currentWorkout, setCurrentWorkout] = useState<WorkoutDay>(workout);
  const [showConfirmRestart, setShowConfirmRestart] = useState(false);
  const [historyForWorkout, setHistoryForWorkout] = useState<WorkoutHistoryEntry[]>([]);
  const [selectedHistoryCompletedAt, setSelectedHistoryCompletedAt] = useState('');
  const [selectedExerciseName, setSelectedExerciseName] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isEditingWorkout, setIsEditingWorkout] = useState(false);
  const [editableExercises, setEditableExercises] = useState<Exercise[]>([]);
  const [saveWorkoutLoading, setSaveWorkoutLoading] = useState(false);
  const [saveWorkoutError, setSaveWorkoutError] = useState('');
  const [saveWorkoutMessage, setSaveWorkoutMessage] = useState('');
  const [showUnsavedEditConfirm, setShowUnsavedEditConfirm] = useState(false);
  const [pendingUnsavedExitAction, setPendingUnsavedExitAction] = useState<UnsavedExitAction>(null);

  const hasUnsavedWorkoutEdits = useMemo(() => {
    if (!isEditingWorkout) return false;
    if (editableExercises.length !== currentWorkout.exercises.length) return true;

    return editableExercises.some((exercise, index) => {
      const currentExercise = currentWorkout.exercises[index];
      if (!currentExercise) return true;
      return (
        exercise.name.trim() !== currentExercise.name.trim() ||
        Number(exercise.sets) !== Number(currentExercise.sets) ||
        Number(exercise.minReps) !== Number(currentExercise.minReps) ||
        Number(exercise.maxReps) !== Number(currentExercise.maxReps) ||
        Number(exercise.restTime) !== Number(currentExercise.restTime)
      );
    });
  }, [isEditingWorkout, editableExercises, currentWorkout.exercises]);

  const handleStartClick = () => {
    if (isEditingWorkout && hasUnsavedWorkoutEdits) {
      setPendingUnsavedExitAction('start');
      setShowUnsavedEditConfirm(true);
      return;
    }

    if (isCompletedToday) {
      setShowConfirmRestart(true);
      return;
    }

    onStart(currentWorkout);
  };

  useEffect(() => {
    setCurrentWorkout(workout);
    setIsEditingWorkout(false);
    setEditableExercises([]);
    setSaveWorkoutError('');
    setSaveWorkoutMessage('');
  }, [workout]);

  useEffect(() => {
    setSelectedExerciseName((currentSelected) => {
      if (currentSelected && currentWorkout.exercises.some((exercise) => exercise.name === currentSelected)) {
        return currentSelected;
      }
      return currentWorkout.exercises[0]?.name ?? '';
    });
  }, [currentWorkout.exercises]);

  useEffect(() => {
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const result = await api.getWorkoutHistory(accessToken);
        const history = Array.isArray(result.history) ? result.history : [];
        const filtered = history
          .filter((entry): entry is WorkoutHistoryEntry => (
            Boolean(entry?.completedAt) && entry?.workoutDay === currentWorkout.day
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
  }, [accessToken, currentWorkout.day]);

  const selectedHistory = historyForWorkout.find(
    (entry) => entry.completedAt === selectedHistoryCompletedAt,
  ) ?? null;
  const selectedExercisePlan = currentWorkout.exercises.find(
    (exercise) => exercise.name === selectedExerciseName,
  ) ?? currentWorkout.exercises[0] ?? null;

  const analyticsData = useMemo<ExerciseAnalyticsPoint[]>(() => {
    if (!selectedExercisePlan) return [];

    const sessionsAsc = [...historyForWorkout].sort(
      (a, b) =>
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    );

    return sessionsAsc.map((entry, index) => {
      const matchingLog = (entry.completedExercises ?? []).find((exerciseLog) => {
        if (!exerciseLog?.exerciseName) return false;
        if (exerciseLog.exerciseName === selectedExercisePlan.name) return true;
        return exerciseLog.exerciseName.toLowerCase() === selectedExercisePlan.name.toLowerCase();
      });

      const setsData = Array.isArray(matchingLog?.setsData)
        ? matchingLog.setsData.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];
      const totalReps = setsData.reduce((sum, reps) => sum + reps, 0);
      const avgReps = setsData.length > 0 ? Math.round((totalReps / setsData.length) * 10) / 10 : null;
      const completedSets = setsData.length;
      const consistency = selectedExercisePlan.sets > 0
        ? Math.round((Math.min(completedSets, selectedExercisePlan.sets) / selectedExercisePlan.sets) * 100)
        : 0;

      let weight: number | null = null;
      if (matchingLog) {
        const parsedWeight = Number(matchingLog.weight);
        weight = Number.isFinite(parsedWeight) ? parsedWeight : 0;
      }

      return {
        session: `#${index + 1}`,
        sessionFull: new Date(entry.completedAt).toLocaleString(),
        weight,
        avgReps,
        consistency,
      };
    });
  }, [historyForWorkout, selectedExercisePlan]);

  const completedSessionsWithExerciseData = analyticsData.filter(
    (point) => point.weight !== null || point.avgReps !== null,
  ).length;

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

  const toPositiveInt = (value: string, fallback: number) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  };

  const startWorkoutEdit = () => {
    setEditableExercises(currentWorkout.exercises.map((exercise) => ({ ...exercise })));
    setIsEditingWorkout(true);
    setSaveWorkoutError('');
    setSaveWorkoutMessage('');
  };

  const cancelWorkoutEdit = () => {
    setEditableExercises([]);
    setIsEditingWorkout(false);
    setSaveWorkoutError('');
  };

  const handleCancelEditClick = () => {
    if (hasUnsavedWorkoutEdits) {
      setPendingUnsavedExitAction('cancel-edit');
      setShowUnsavedEditConfirm(true);
      return;
    }
    cancelWorkoutEdit();
  };

  const handleBackClick = () => {
    if (isEditingWorkout && hasUnsavedWorkoutEdits) {
      setPendingUnsavedExitAction('back');
      setShowUnsavedEditConfirm(true);
      return;
    }
    onBack();
  };

  const confirmDiscardUnsavedEdits = () => {
    const action = pendingUnsavedExitAction;
    setShowUnsavedEditConfirm(false);
    setPendingUnsavedExitAction(null);
    cancelWorkoutEdit();

    if (action === 'back') {
      onBack();
      return;
    }

    if (action === 'start') {
      if (isCompletedToday) {
        setShowConfirmRestart(true);
      } else {
        onStart(currentWorkout);
      }
    }
  };

  const addEditableExercise = () => {
    setEditableExercises((current) => [
      ...current,
      { name: '', sets: 3, minReps: 8, maxReps: 12, restTime: 60 },
    ]);
  };

  const updateEditableExercise = <K extends keyof Exercise>(
    index: number,
    field: K,
    value: Exercise[K],
  ) => {
    setEditableExercises((current) =>
      current.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? { ...exercise, [field]: value }
          : exercise,
      ),
    );
  };

  const removeEditableExercise = (index: number) => {
    setEditableExercises((current) =>
      current.filter((_, exerciseIndex) => exerciseIndex !== index),
    );
  };

  const saveWorkoutEdits = async () => {
    setSaveWorkoutError('');
    setSaveWorkoutMessage('');

    const hasEmptyName = editableExercises.some((exercise) => !exercise.name.trim());
    if (hasEmptyName) {
      setSaveWorkoutError('Please fill in all exercise names before saving.');
      return;
    }

    if (editableExercises.length === 0) {
      setSaveWorkoutError('Please keep at least one exercise for this workout day.');
      return;
    }

    const normalizedExercises = editableExercises.map((exercise) => {
      const minReps = toPositiveInt(String(exercise.minReps), 1);
      const maxRepsRaw = toPositiveInt(String(exercise.maxReps), minReps);
      const maxReps = Math.max(maxRepsRaw, minReps);

      return {
        name: exercise.name.trim(),
        sets: toPositiveInt(String(exercise.sets), 1),
        minReps,
        maxReps,
        restTime: toPositiveInt(String(exercise.restTime), 30),
      };
    });

    setSaveWorkoutLoading(true);
    try {
      const workoutPlanResult = await api.getWorkoutPlan(accessToken);
      const existingPlan: WorkoutDay[] = Array.isArray(workoutPlanResult.workoutPlan)
        ? workoutPlanResult.workoutPlan
        : [];

      const dayExists = existingPlan.some((dayPlan) => dayPlan.day === currentWorkout.day);
      const updatedPlan = dayExists
        ? existingPlan.map((dayPlan) =>
            dayPlan.day === currentWorkout.day
              ? { ...dayPlan, exercises: normalizedExercises }
              : dayPlan,
          )
        : [...existingPlan, { day: currentWorkout.day, exercises: normalizedExercises }];

      const saveResult = await api.saveWorkoutPlan(accessToken, updatedPlan);
      if (saveResult.error) {
        throw new Error(saveResult.error);
      }

      const updatedWorkout = { ...currentWorkout, exercises: normalizedExercises };
      setCurrentWorkout(updatedWorkout);
      setIsEditingWorkout(false);
      setEditableExercises([]);
      setSaveWorkoutMessage('Workout updated successfully.');
    } catch (error: unknown) {
      console.error('Save workout day edits error:', error);
      const message = error instanceof Error ? error.message : 'Failed to update workout.';
      setSaveWorkoutError(message);
    } finally {
      setSaveWorkoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={handleBackClick} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to dashboard
        </Button>

        <div className="mb-8">
          <h2 className="text-2xl font-medium">{currentWorkout.day} Workout</h2>
          <p className="text-muted-foreground mt-1">
            {currentWorkout.exercises.length} exercise{currentWorkout.exercises.length !== 1 ? 's' : ''}
          </p>
          {isCompletedToday && (
            <p className="text-sm text-primary mt-2">You already completed this workout today.</p>
          )}
        </div>

        <Tabs defaultValue="sessions" className="mb-8">
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="sessions" className="flex-1 md:flex-none">Sessions</TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1 md:flex-none">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="space-y-6 pt-2">
            <div className="border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-medium">Workout Structure</h3>
                  <p className="text-sm text-muted-foreground">
                    Update the exercises configured for {currentWorkout.day}.
                  </p>
                </div>
                {!isEditingWorkout && (
                  <Button variant="outline" onClick={startWorkoutEdit}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit Workout
                  </Button>
                )}
              </div>

              {saveWorkoutMessage && (
                <div className="text-sm text-primary">{saveWorkoutMessage}</div>
              )}

              {isEditingWorkout ? (
                <div className="space-y-3">
                  {editableExercises.map((exercise, index) => (
                    <div key={index} className="border border-border rounded-lg p-4 space-y-3">
                      <div>
                        <Label>Exercise Name</Label>
                        <ExerciseAutocomplete
                          value={exercise.name}
                          onChange={(value) => updateEditableExercise(index, 'name', value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <Label>Sets</Label>
                          <Input
                            type="number"
                            min={1}
                            value={exercise.sets}
                            onChange={(e) => updateEditableExercise(index, 'sets', toPositiveInt(e.target.value, 1))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Min Reps</Label>
                          <Input
                            type="number"
                            min={1}
                            value={exercise.minReps}
                            onChange={(e) => updateEditableExercise(index, 'minReps', toPositiveInt(e.target.value, 1))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Max Reps</Label>
                          <Input
                            type="number"
                            min={1}
                            value={exercise.maxReps}
                            onChange={(e) => updateEditableExercise(index, 'maxReps', toPositiveInt(e.target.value, 1))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Rest (sec)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={exercise.restTime}
                            onChange={(e) => updateEditableExercise(index, 'restTime', toPositiveInt(e.target.value, 30))}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeEditableExercise(index)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove Exercise
                      </Button>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={addEditableExercise}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Exercise
                    </Button>
                    <Button
                      onClick={saveWorkoutEdits}
                      disabled={saveWorkoutLoading}
                    >
                      {saveWorkoutLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleCancelEditClick}
                      disabled={saveWorkoutLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentWorkout.exercises.map((exercise, index) => (
                    <div key={index} className="border border-border rounded-xl p-4">
                      <div className="font-medium">{exercise.name}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {exercise.sets} sets × {exercise.minReps}-{exercise.maxReps} reps · {exercise.restTime}s rest
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {saveWorkoutError && (
                <div className="text-sm text-destructive">{saveWorkoutError}</div>
              )}
            </div>

            <div className="border border-border rounded-xl p-6">
              <h3 className="text-lg font-medium mb-4">Last Sessions For {currentWorkout.day}</h3>
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
          </TabsContent>

          <TabsContent value="analytics" className="pt-2">
            <div className="border border-border rounded-xl p-6">
              <h3 className="text-lg font-medium">Analytics For {currentWorkout.day}</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Track progression per exercise for weight, average reps, and set consistency.
              </p>

              {historyLoading ? (
                <div className="text-sm text-muted-foreground">Loading analytics...</div>
              ) : historyForWorkout.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Complete this workout day at least once to unlock analytics.
                </div>
              ) : !selectedExercisePlan ? (
                <div className="text-sm text-muted-foreground">
                  No exercises configured for this workout day.
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Exercise</div>
                    <Select
                      value={selectedExercisePlan.name}
                      onValueChange={setSelectedExerciseName}
                    >
                        <SelectTrigger className="w-full md:w-[360px]">
                          <SelectValue placeholder="Choose an exercise" />
                        </SelectTrigger>
                      <SelectContent>
                        {currentWorkout.exercises.map((exercise) => (
                          <SelectItem key={exercise.name} value={exercise.name}>
                            {exercise.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground mt-2">
                      Planned sets: {selectedExercisePlan.sets} · Sessions with data: {completedSessionsWithExerciseData}/{analyticsData.length}
                    </div>
                  </div>

                  <div className="grid gap-5">
                    <div>
                      <div className="text-sm font-medium mb-2">Weight Progression</div>
                      <ChartContainer config={weightChartConfig} className="h-56 w-full aspect-auto">
                        <LineChart data={analyticsData}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="session" tickLine={false} axisLine={false} />
                          <YAxis width={46} tickLine={false} axisLine={false} />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                labelFormatter={(_, payload) => {
                                  const point = payload?.[0]?.payload as ExerciseAnalyticsPoint | undefined;
                                  return point?.sessionFull ?? '';
                                }}
                              />
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="weight"
                            stroke="var(--color-weight)"
                            strokeWidth={2}
                            connectNulls={false}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ChartContainer>
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Average Reps Progression</div>
                      <ChartContainer config={repsChartConfig} className="h-56 w-full aspect-auto">
                        <LineChart data={analyticsData}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="session" tickLine={false} axisLine={false} />
                          <YAxis width={46} tickLine={false} axisLine={false} />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                labelFormatter={(_, payload) => {
                                  const point = payload?.[0]?.payload as ExerciseAnalyticsPoint | undefined;
                                  return point?.sessionFull ?? '';
                                }}
                              />
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="avgReps"
                            stroke="var(--color-avgReps)"
                            strokeWidth={2}
                            connectNulls={false}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ChartContainer>
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Consistency Progression</div>
                      <ChartContainer config={consistencyChartConfig} className="h-56 w-full aspect-auto">
                        <LineChart data={analyticsData}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="session" tickLine={false} axisLine={false} />
                          <YAxis width={46} tickLine={false} axisLine={false} domain={[0, 100]} />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                labelFormatter={(_, payload) => {
                                  const point = payload?.[0]?.payload as ExerciseAnalyticsPoint | undefined;
                                  return point?.sessionFull ?? '';
                                }}
                              />
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="consistency"
                            stroke="var(--color-consistency)"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ChartContainer>
                      <div className="text-xs text-muted-foreground mt-2">
                        Consistency = completed sets for this exercise divided by planned sets.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

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
                onStart(currentWorkout);
              }}
            >
              Start Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showUnsavedEditConfirm}
        onOpenChange={(open) => {
          setShowUnsavedEditConfirm(open);
          if (!open) {
            setPendingUnsavedExitAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved workout edits for this day. If you continue, those changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardUnsavedEdits}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ExerciseAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
}

function ExerciseAutocomplete({ value, onChange }: ExerciseAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredExercises, setFilteredExercises] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const normalized = inputValue.trim().toLowerCase();
    const filtered = normalized
      ? COMMON_EXERCISES.filter((exercise) =>
          exercise.toLowerCase().includes(normalized),
        ).slice(0, 10)
      : COMMON_EXERCISES.slice(0, 10);

    setFilteredExercises(filtered);
    setSelectedIndex(-1);
  }, [inputValue]);

  const handleSelect = (exercise: string) => {
    setInputValue(exercise);
    onChange(exercise);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredExercises.length - 1 ? prev + 1 : prev,
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredExercises.length) {
        handleSelect(filteredExercises[selectedIndex]);
      } else {
        onChange(inputValue);
        setShowSuggestions(false);
      }
      return;
    }

    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      setSelectedIndex(-1);
      onChange(inputValue);
    }, 200);
  };

  return (
    <div className="relative mt-1">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => {
          if (filteredExercises.length > 0) {
            setShowSuggestions(true);
          }
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Type to search exercises..."
        autoComplete="off"
      />

      {showSuggestions && filteredExercises.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-[240px] overflow-y-auto">
          {filteredExercises.map((exercise, index) => (
            <button
              key={exercise}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(exercise);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {exercise}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
