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

export function UserInfoScreen({ accessToken, onComplete, isUpdating = false }: UserInfoScreenProps) {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isUpdating) {
      loadUserInfo();
    }
  }, [isUpdating]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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

      onComplete();
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
            {loading ? 'Saving...' : isUpdating ? 'Update' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}