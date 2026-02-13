import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dumbbell, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AuthMode = 'login' | 'signup' | 'reset-password' | 'check-email';

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        // Sign in with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      } else if (mode === 'signup') {
        // Sign up with Supabase
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
            },
          }
        });

        if (error) throw error;
        if (!data.session?.access_token) {
          // If no session, email confirmation might be required
          setMessage('Account created! You can now sign in.');
          setMode('login');
        }
      } else if (mode === 'reset-password') {
        // Password reset with Supabase
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) throw error;

        setMessage('Password reset link sent! Please check your email.');
        setMode('check-email');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      // Configure Google OAuth in Supabase dashboard
      // Follow: https://supabase.com/docs/guides/auth/social-login/auth-google
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        }
      });

      if (error) throw error;
    } catch (err: any) {
      console.error('Google login error:', err);
      setError(err.message || 'Google login failed. Configure Google OAuth in Supabase dashboard.');
    } finally {
      setLoading(false);
    }
  };

  // Check Email Screen
  if (mode === 'check-email') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl font-medium text-foreground">Check Your Email</h1>
            <p className="mt-4 text-muted-foreground">{message}</p>
          </div>

          <Button
            onClick={() => {
              setMode('login');
              setMessage('');
              setEmail('');
              setPassword('');
            }}
            variant="outline"
            className="w-full"
          >
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  // Password Reset Screen
  if (mode === 'reset-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
                <Dumbbell className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-medium text-foreground">Reset Password</h1>
            <p className="mt-2 text-muted-foreground">
              Enter your email to receive a password reset link
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="mt-1"
              />
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
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Login/Signup Screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
              <Dumbbell className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-medium text-foreground">FitTrack</h1>
          <p className="mt-2 text-muted-foreground">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            {mode === 'signup' && (
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={mode === 'signup'}
                  placeholder="Your name"
                  className="mt-1"
                />
              </div>
            )}
            
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <Label htmlFor="password">Password</Label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset-password');
                      setError('');
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="mt-1"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive text-center">
              {error}
            </div>
          )}

          {message && (
            <div className="text-sm text-primary text-center">
              {message}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Loading...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
              setMessage('');
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>

        <div className="text-center text-xs text-muted-foreground mt-4 p-3 bg-accent rounded-lg space-y-2">
          <div>
            <strong>Setup Required:</strong>
          </div>
          <div>
            1. <strong>Redirect URLs:</strong> Add <code className="bg-white px-1 rounded">{window.location.origin}</code> to your Supabase dashboard under Authentication → URL Configuration → Redirect URLs
          </div>
          <div>
            2. <strong>Google OAuth (optional):</strong> Configure in Supabase dashboard following{' '}
            <a
              href="https://supabase.com/docs/guides/auth/social-login/auth-google"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              these instructions
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
