import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { MeResponse } from '@opex/shared';
import { ApiError, login } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const BLOBS = [
  { className: 'h-72 w-72 bg-accent-300 -left-20 -top-16', duration: 20 },
  { className: 'h-64 w-64 bg-accent-200 right-0 top-1/3', duration: 26 },
  { className: 'h-80 w-80 bg-accent-100 left-1/3 bottom-0', duration: 32 },
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-accent-50 via-white to-accent-100">
      {/* Slow-drifting blurred blobs — purely decorative, disabled under prefers-reduced-motion. */}
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full opacity-40 blur-3xl ${blob.className}`}
          animate={
            prefersReducedMotion
              ? undefined
              : { x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.08, 0.95, 1] }
          }
          transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <Card className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-accent-500" aria-hidden="true" />
          <span className="text-lg font-semibold text-gray-900">OpeX</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900">Welcome back</h1>
        <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </label>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <Button type="submit" variant="primary" loading={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Login'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">Accounts are provisioned by your OpeX administrator.</p>
      </Card>
    </div>
  );
}
