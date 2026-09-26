import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import type { MeResponse } from '@opex/shared';
import { ApiError, login } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Logo, LogoMark } from '../components/ui/Logo';
import { inputClass } from '../components/ui/Field';
import { navigate } from '../lib/router';

const POINTS = ['Runs on your hardware', 'Answers cite the page they came from', 'Every action is logged'];

export function LoginPage({ onLoggedIn }: { onLoggedIn: (user: MeResponse) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      {/* Brand panel: ink background, one statement, a receipt-style list of guarantees. Hidden on small screens. */}
      <aside className="hidden flex-col justify-between bg-fg p-12 text-canvas md:flex">
        <button type="button" onClick={() => navigate({ name: 'landing' })} className="flex w-fit items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-xl font-semibold tracking-tight">
            Ope<span className="text-ember-500">X</span>
          </span>
        </button>
        <div className="max-w-md">
          <p className="font-serif text-4xl italic leading-snug">Ask over your own documents. Nothing leaves the room.</p>
          <ul className="mt-10 divide-y divide-canvas/15 border-y border-canvas/15 font-mono text-xs uppercase tracking-[0.08em] text-canvas/70">
            {POINTS.map((p) => (
              <li key={p} className="py-3">
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-canvas/50">Local models only · no telemetry · no cloud calls</p>
      </aside>

      <main className="relative flex items-center justify-center px-6 py-12">
        <button
          type="button"
          onClick={() => navigate({ name: 'landing' })}
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-fg-2 hover:bg-raised md:left-8 md:top-8"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          Home
        </button>

        <motion.div className="w-full max-w-sm" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}>
          <div className="mb-8 md:hidden">
            <Logo markClassName="h-10 w-10" textClassName="text-2xl" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted">Use the account your administrator created for you.</p>

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
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-xs font-medium text-fg-2 hover:bg-raised"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
                <Icon name="alert" className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" loading={submitting} className="w-full !py-3">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-faint">Offline by design. No telemetry.</p>
        </motion.div>
      </main>
    </div>
  );
}
