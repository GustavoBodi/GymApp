import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

interface UserInfoScreenProps {
  accessToken: string;
  onComplete: () => void;
  isUpdating?: boolean;
}

interface UserInfoHistoryEntry {
  entryId: string;
  weight: number;
  height: number;
  age: number;
  bodyFat: number | null;
  recordedAt: string;
  updatedAt: string;
}

export function UserInfoScreen({ accessToken, onComplete, isUpdating = false }: UserInfoScreenProps) {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [history, setHistory] = useState<UserInfoHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editBodyFat, setEditBodyFat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (isUpdating) {
      loadUpdateData();
    }
  }, [isUpdating, accessToken]);

  const loadUpdateData = async () => {
    await Promise.all([loadUserInfo(), loadHistory()]);
  };

  const loadUserInfo = async () => {
    try {
      const result = await api.getUserInfo(accessToken);
      if (result.profile) {
        setWeight(result.profile.weight?.toString() || '');
        setHeight(result.profile.height?.toString() || '');
        setAge(result.profile.age?.toString() || '');
        setBodyFat(result.profile.bodyFat?.toString() || '');
      }
    } catch (err) {
      console.error('Load user info error:', err);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const result = await api.getUserInfoHistory(accessToken);
      const historyData = Array.isArray(result.history) ? result.history : [];
      setHistory(historyData);
    } catch (err) {
      console.error('Load user info history error:', err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const startEditEntry = (entry: UserInfoHistoryEntry) => {
    setEditingEntryId(entry.entryId);
    setEditWeight(entry.weight.toString());
    setEditHeight(entry.height.toString());
    setEditAge(entry.age.toString());
    setEditBodyFat(entry.bodyFat?.toString() || '');
    setError('');
    setSuccessMessage('');
  };

  const cancelEditEntry = () => {
    setEditingEntryId(null);
    setEditWeight('');
    setEditHeight('');
    setEditAge('');
    setEditBodyFat('');
  };

  const handleSaveEntryFix = async (entryId: string) => {
    setError('');
    setSuccessMessage('');

    try {
      const result = await api.updateUserInfoHistory(
        accessToken,
        entryId,
        parseFloat(editWeight),
        parseFloat(editHeight),
        parseInt(editAge),
        editBodyFat ? parseFloat(editBodyFat) : undefined,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      cancelEditEntry();
      setSuccessMessage('History entry updated.');
      await loadUpdateData();
    } catch (err: any) {
      console.error('Update history entry error:', err);
      setError(err.message || 'Failed to update history entry');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const result = await api.saveUserInfo(
        accessToken,
        parseFloat(weight),
        parseFloat(height),
        parseInt(age),
        bodyFat ? parseFloat(bodyFat) : undefined
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (isUpdating) {
        setSuccessMessage('New metrics snapshot saved.');
        await loadUpdateData();
      } else {
        onComplete();
      }
    } catch (err: any) {
      console.error('Save user info error:', err);
      setError(err.message || 'Failed to save information');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-8">
        {isUpdating && (
          <Button variant="ghost" onClick={onComplete} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to dashboard
          </Button>
        )}
        
        <div className="text-center">
          <h2 className="text-2xl font-medium text-foreground">
            {isUpdating ? 'Update Your Information' : 'Tell us about yourself'}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {isUpdating 
              ? 'Update your current stats'
              : 'This helps us personalize your experience'
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input
                id="weight"
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
                placeholder="70"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="height">Height (cm)</Label>
              <Input
                id="height"
                type="number"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                required
                placeholder="175"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
                placeholder="25"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="bodyFat">Body Fat % (optional)</Label>
              <Input
                id="bodyFat"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                placeholder="15"
                className="mt-1"
              />
            </div>
          </div>

          {successMessage && (
            <div className="text-sm text-primary text-center">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Saving...' : isUpdating ? 'Save New Snapshot' : 'Continue'}
          </Button>
        </form>

        {isUpdating && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium">Body Metrics History</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Every update creates a new snapshot. Use "Fix entry" to correct old data.
              </p>
            </div>

            {historyLoading ? (
              <div className="text-sm text-muted-foreground">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-sm text-muted-foreground">No history entries yet.</div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-auto pr-1">
                {history.map((entry, index) => {
                  const isEditing = editingEntryId === entry.entryId;
                  return (
                    <div key={entry.entryId} className="border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {new Date(entry.recordedAt).toLocaleDateString()} {new Date(entry.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last corrected: {new Date(entry.updatedAt).toLocaleString()}
                          </div>
                        </div>
                        {index === 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                            Latest
                          </span>
                        )}
                      </div>

                      {!isEditing ? (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                            <div>Weight: <span className="text-foreground font-medium">{entry.weight} kg</span></div>
                            <div>Height: <span className="text-foreground font-medium">{entry.height} cm</span></div>
                            <div>Age: <span className="text-foreground font-medium">{entry.age}</span></div>
                            <div>Body Fat: <span className="text-foreground font-medium">{entry.bodyFat ?? '-'}{entry.bodyFat !== null ? '%' : ''}</span></div>
                          </div>
                          <Button type="button" variant="outline" onClick={() => startEditEntry(entry)}>
                            Fix entry
                          </Button>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor={`edit-weight-${entry.entryId}`}>Weight (kg)</Label>
                              <Input
                                id={`edit-weight-${entry.entryId}`}
                                type="number"
                                step="0.1"
                                value={editWeight}
                                onChange={(e) => setEditWeight(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`edit-height-${entry.entryId}`}>Height (cm)</Label>
                              <Input
                                id={`edit-height-${entry.entryId}`}
                                type="number"
                                step="0.1"
                                value={editHeight}
                                onChange={(e) => setEditHeight(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`edit-age-${entry.entryId}`}>Age</Label>
                              <Input
                                id={`edit-age-${entry.entryId}`}
                                type="number"
                                value={editAge}
                                onChange={(e) => setEditAge(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`edit-body-fat-${entry.entryId}`}>Body Fat %</Label>
                              <Input
                                id={`edit-body-fat-${entry.entryId}`}
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={editBodyFat}
                                onChange={(e) => setEditBodyFat(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" onClick={() => handleSaveEntryFix(entry.entryId)}>
                              Save Fix
                            </Button>
                            <Button type="button" variant="outline" onClick={cancelEditEntry}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
