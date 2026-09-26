import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { MeResponse } from '@opex/shared';
import { ApiError, login } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Logo, LogoMark } from '../components/ui/Logo';
import { inputClass } from '../components/ui/Field';
import { navigate } from '../lib/router';

const POINTS = [
  'Your documents and questions never leave your network.',
  'Answers cite the exact page they came from.',
  'One assistant for chat, documents, images and calculations.',
];

export function LoginPage({ onLoggedIn }: { onLoggedIn: (user: MeResponse) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reduceMotion = useReducedMotion();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      onLoggedIn(await login({ email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas md:grid-cols-[1.05fr_1fr]">
      {/* Brand panel: calm, one gradient, three plain promises. Hidden on small screens. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-accent-700 via-accent-600 to-accent-800 p-12 text-white md:flex">
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
          animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <button type="button" onClick={() => navigate({ name: 'landing' })} className="relative z-10 flex w-fit items-center gap-3 text-white">
          <LogoMark className="h-10 w-10" />
          <span className="text-2xl font-semibold tracking-tight">OpeX</span>
        </button>
        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-normal leading-tight tracking-tight">AI that stays inside your walls.</h2>
          <ul className="mt-8 flex flex-col gap-4 text-base text-white/85">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-sm text-white/60">Offline by design. No telemetry, no cloud calls.</p>
      </aside>

      <main className="relative flex items-center justify-center px-6 py-12">
        <button
          type="button"
          onClick={() => navigate({ name: 'landing' })}
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-fg-2 hover:bg-raised md:left-8 md:top-8"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          Home
        </button>

        <motion.div className="w-full max-w-sm" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}>
          <div className="mb-8 md:hidden">
            <Logo markClassName="h-10 w-10" textClassName="text-2xl" />
          </div>
          <h1 className="text-3xl font-normal tracking-tight text-fg">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in to your workspace.</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg-2">
              Email
              <input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg-2">
              Password
              <span className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${inputClass} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
                <Icon name="alert" className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" loading={submitting} className="w-full !py-3">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-faint">Accounts are provisioned by your OpeX administrator.</p>
        </motion.div>
      </main>
    </div>
  );
}
