import { CheckCircle2, Clock, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import type { WorkoutCompletionSummary } from './ActiveWorkout';

interface WorkoutSummaryProps {
  summary: WorkoutCompletionSummary;
  onBackToDashboard: () => void;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function WorkoutSummary({ summary, onBackToDashboard }: WorkoutSummaryProps) {
  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-medium">Workout Completed</h2>
          <p className="text-muted-foreground mt-2">{summary.workoutDay}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="border border-border rounded-xl p-5">
            <div className="text-sm text-muted-foreground">Total Workout Time</div>
            <div className="text-2xl font-medium mt-1">{formatTime(summary.totalWorkoutSeconds)}</div>
          </div>
          <div className="border border-border rounded-xl p-5">
            <div className="text-sm text-muted-foreground">Total Rest Time</div>
            <div className="text-2xl font-medium mt-1">{formatTime(summary.totalRestSeconds)}</div>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-lg font-medium mb-4">What You Actually Did</h3>
          <div className="space-y-3">
            {summary.exercises.map((exercise, index) => (
              <div key={`${exercise.exerciseName}-${index}`} className="border border-border rounded-xl p-4">
                <div className="font-medium">{exercise.exerciseName}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Weight: {exercise.weight} kg
                </div>
                <div className="text-sm text-muted-foreground">
                  Reps: {exercise.setsData.join(' / ')}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  Rest taken: {formatTime(exercise.restTakenSeconds)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button onClick={onBackToDashboard} className="w-full" size="lg">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
