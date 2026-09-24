import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { MeResponse } from '@opex/shared';
import { ApiError, login } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { navigate } from '../lib/router';

const BLOBS = [
  { className: 'h-72 w-72 bg-accent-200 -left-20 -top-16', duration: 20 },
  { className: 'h-64 w-64 bg-accent-100 right-0 top-1/3', duration: 26 },
  { className: 'h-80 w-80 bg-accent-300 left-1/3 bottom-0', duration: 32 },
];

export function LoginPage({ onLoggedIn }: { onLoggedIn: (user: MeResponse) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login({ email, password });
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-canvas via-accent-50 to-canvas">
      {/* Slow-drifting blurred blobs — purely decorative, disabled under prefers-reduced-motion. */}
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full opacity-70 blur-3xl ${blob.className}`}
          animate={
            prefersReducedMotion
              ? undefined
              : { x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.08, 0.95, 1] }
          }
          transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <button
        type="button"
        onClick={() => navigate({ name: 'landing' })}
        className="absolute left-4 top-4 z-10 rounded-lg px-3 py-1.5 text-sm text-fg-2 hover:bg-surface/70"
      >
        ← Back to home
      </button>

      <motion.div className="relative z-10 w-full max-w-sm" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}>
      <Card className="w-full rounded-[32px] p-8 shadow-lift">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-accent-500" aria-hidden="true" />
          <span className="text-xl font-medium text-fg">OpeX</span>
        </div>
        <h1 className="text-3xl font-normal tracking-tight text-fg">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-fg-2">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-2xl border border-line px-4 py-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-fg-2">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-2xl border border-line px-4 py-3 text-sm"
            />
          </label>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <Button type="submit" variant="primary" loading={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Login'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-faint">Accounts are provisioned by your OpeX administrator.</p>
      </Card>
      </motion.div>
    </div>
  );
}
