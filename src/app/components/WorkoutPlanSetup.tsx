import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { api } from '../lib/api';
import { COMMON_EXERCISES } from '../lib/exercises';

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

interface WorkoutPlanSetupProps {
  accessToken: string;
  onComplete: () => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function WorkoutPlanSetup({ accessToken, onComplete }: WorkoutPlanSetupProps) {
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutDay[]>([]);
  const [currentDay, setCurrentDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dayToRemove, setDayToRemove] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      // Check if day has exercises
      const workout = workoutPlan.find(w => w.day === day);
      if (workout && workout.exercises.length > 0) {
        // Show confirmation dialog
        setDayToRemove(day);
        setShowRemoveConfirm(true);
      } else {
        // Remove immediately if no exercises
        removeDay(day);
      }
    } else {
      // Select day
      setSelectedDays([...selectedDays, day]);
      setWorkoutPlan([...workoutPlan, { day, exercises: [] }]);
      setCurrentDay(day);
    }
  };

  const removeDay = (day: string) => {
    setSelectedDays(selectedDays.filter(d => d !== day));
    setWorkoutPlan(workoutPlan.filter(w => w.day !== day));
    if (currentDay === day) {
      setCurrentDay(selectedDays.find(d => d !== day) || null);
    }
    setDayToRemove(null);
    setShowRemoveConfirm(false);
  };

  const addExercise = () => {
    if (!currentDay) return;
    
    const updatedPlan = workoutPlan.map(workout => {
      if (workout.day === currentDay) {
        return {
          ...workout,
          exercises: [
            ...workout.exercises,
            { name: '', sets: 3, minReps: 8, maxReps: 12, restTime: 60 }
          ]
        };
      }
      return workout;
    });
    setWorkoutPlan(updatedPlan);
  };

  const updateExercise = (dayIndex: number, exerciseIndex: number, field: keyof Exercise, value: any) => {
    const updatedPlan = [...workoutPlan];
    updatedPlan[dayIndex].exercises[exerciseIndex] = {
      ...updatedPlan[dayIndex].exercises[exerciseIndex],
      [field]: value
    };
    setWorkoutPlan(updatedPlan);
  };

  const removeExercise = (dayIndex: number, exerciseIndex: number) => {
    const updatedPlan = [...workoutPlan];
    updatedPlan[dayIndex].exercises.splice(exerciseIndex, 1);
    setWorkoutPlan(updatedPlan);
  };

  const handleSubmit = async () => {
    // Validate
    const hasEmptyExercises = workoutPlan.some(day => 
      day.exercises.some(ex => !ex.name.trim())
    );

    if (hasEmptyExercises) {
      setError('Please fill in all exercise names');
      return;
    }

    if (workoutPlan.length === 0) {
      setError('Please add at least one workout day');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await api.saveWorkoutPlan(accessToken, workoutPlan);

      if (result.error) {
        throw new Error(result.error);
      }

      onComplete();
    } catch (err: any) {
      console.error('Save workout plan error:', err);
      setError(err.message || 'Failed to save workout plan');
    } finally {
      setLoading(false);
    }
  };

  const currentDayIndex = workoutPlan.findIndex(w => w.day === currentDay);

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-medium text-foreground">Create Your Workout Plan</h2>
          <p className="mt-2 text-muted-foreground">
            Set up your weekly workout routine
          </p>
        </div>

        <div className="space-y-6">
          {/* Day Selection */}
          <div>
            <Label className="mb-3 block">Select Workout Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    selectedDays.includes(day)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {day.substring(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise Configuration */}
          {currentDay && currentDayIndex !== -1 && (
            <div className="border border-border rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">{currentDay}</h3>
                <Button
                  type="button"
                  onClick={addExercise}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Exercise
                </Button>
              </div>

              <div className="space-y-4">
                {workoutPlan[currentDayIndex].exercises.map((exercise, exerciseIndex) => (
                  <div key={exerciseIndex} className="border border-border rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Exercise Name</Label>
                        <ExerciseAutocomplete
                          value={exercise.name}
                          onChange={(value) => updateExercise(currentDayIndex, exerciseIndex, 'name', value)}
                        />
                      </div>
                      
                      <div>
                        <Label>Sets</Label>
                        <Input
                          type="number"
                          value={exercise.sets}
                          onChange={(e) => updateExercise(currentDayIndex, exerciseIndex, 'sets', parseInt(e.target.value))}
                          className="mt-1"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Min Reps</Label>
                          <Input
                            type="number"
                            value={exercise.minReps}
                            onChange={(e) => updateExercise(currentDayIndex, exerciseIndex, 'minReps', parseInt(e.target.value))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Max Reps</Label>
                          <Input
                            type="number"
                            value={exercise.maxReps}
                            onChange={(e) => updateExercise(currentDayIndex, exerciseIndex, 'maxReps', parseInt(e.target.value))}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Rest Time (seconds)</Label>
                        <Input
                          type="number"
                          value={exercise.restTime}
                          onChange={(e) => updateExercise(currentDayIndex, exerciseIndex, 'restTime', parseInt(e.target.value))}
                          className="mt-1"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeExercise(currentDayIndex, exerciseIndex)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {workoutPlan[currentDayIndex].exercises.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No exercises added yet. Click "Add Exercise" to start.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Other Days Summary */}
          {selectedDays.length > 0 && (
            <div>
              <Label className="mb-3 block">Your Workout Week</Label>
              <div className="space-y-2">
                {workoutPlan.map((workout, index) => (
                  <button
                    key={workout.day}
                    type="button"
                    onClick={() => setCurrentDay(workout.day)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      currentDay === workout.day
                        ? 'border-primary bg-accent'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    <div className="font-medium">{workout.day}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={loading || workoutPlan.length === 0}
          >
            {loading ? 'Saving...' : 'Complete Setup'}
          </Button>
        </div>
      </div>

      {/* Remove Day Confirmation Dialog */}
      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Day</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {dayToRemove} from your workout plan? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeDay(dayToRemove || '')}>Remove</AlertDialogAction>
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
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (inputValue) {
      const filtered = COMMON_EXERCISES.filter(ex =>
        ex.toLowerCase().includes(inputValue.toLowerCase())
      ).slice(0, 10); // Limit to 10 suggestions
      setFilteredExercises(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredExercises([]);
      setShowSuggestions(false);
    }
    setSelectedIndex(-1);
  }, [inputValue]);

  const handleSelect = (exercise: string) => {
    setInputValue(exercise);
    onChange(exercise);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < filteredExercises.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredExercises.length) {
        handleSelect(filteredExercises[selectedIndex]);
      } else {
        onChange(inputValue);
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
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
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => {
          if (inputValue && filteredExercises.length > 0) {
            setShowSuggestions(true);
          }
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Type to search exercises..."
        autoComplete="off"
      />
      
      {showSuggestions && filteredExercises.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-[240px] overflow-y-auto"
        >
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