import { motion, useReducedMotion } from 'motion/react';
import { Button } from '../components/ui/Button';
import { navigate } from '../lib/router';

const BLOBS = [
  { className: 'h-80 w-80 bg-accent-200 -left-24 -top-20', duration: 22 },
  { className: 'h-72 w-72 bg-accent-100 right-0 top-1/4', duration: 28 },
  { className: 'h-96 w-96 bg-accent-300 left-1/3 bottom-0', duration: 34 },
];

const FEATURES = [
  { title: 'Secure', body: 'Documents and prompts never leave your network. No runtime egress, no telemetry.' },
  { title: 'Access-controlled', body: 'Classification and ACL filters run inside the retrieval query itself.' },
  { title: 'Auditable', body: 'Every model, retrieval, tool, and policy action is recorded as a trace.' },
];

const NODES = [
  { label: 'Models', className: 'left-0 top-4' },
  { label: 'Tools', className: 'left-2 bottom-10' },
  { label: 'Your Data', className: 'right-0 top-8' },
  { label: 'Workflows', className: 'right-2 bottom-14' },
];

function ArchitectureDiagram() {
  return (
    <div className="relative mx-auto h-80 w-full max-w-md" role="img" aria-label="Models, tools, your data and workflows connected through OpeX, running on your infrastructure">
      <svg className="absolute inset-0 h-full w-full text-accent-300" viewBox="0 0 400 320" fill="none" aria-hidden="true">
        <path d="M70 40 C 130 40, 130 130, 190 140" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M70 270 C 130 270, 130 190, 190 180" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M330 50 C 270 50, 270 130, 215 140" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M330 250 C 270 250, 270 190, 215 180" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
      </svg>
      <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 shadow-lg">
        <span className="-rotate-45 text-lg font-bold text-on-accent">OpeX</span>
      </div>
      {NODES.map((n) => (
        <div key={n.label} className={`absolute ${n.className} rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg-2 shadow-card`}>
          {n.label}
        </div>
      ))}
      <div className="absolute inset-x-10 bottom-0 rounded-xl border border-accent-100 bg-accent-50 px-4 py-2 text-center text-sm font-medium text-accent-700">
        Your Infrastructure
      </div>
    </div>
  );
}

export function LandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const goLogin = () => navigate({ name: 'login' });

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-canvas via-accent-50 to-canvas">
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full opacity-70 blur-3xl ${blob.className}`}
          animate={prefersReducedMotion ? undefined : { x: [0, 50, -30, 0], y: [0, -40, 30, 0], scale: [1, 1.1, 0.95, 1] }}
          transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <nav className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-accent-500" aria-hidden="true" />
            <span className="text-xl font-medium text-fg">OpeX</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={goLogin}>
              Login
            </Button>
            <Button variant="primary" onClick={goLogin}>
              Get Started →
            </Button>
          </div>
        </nav>

        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}>
            <span className="inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-700">
              Private AI infrastructure
            </span>
            <h1 className="mt-4 text-5xl font-normal leading-[1.08] tracking-tight text-fg md:text-6xl">
              AI that never leaves your infrastructure.
            </h1>
            <p className="mt-4 max-w-lg text-fg-2">
              OpeX is an offline agentic workbench for confidential industrial documents. Open-weight models run on your own
              hardware, so questions, documents and answers stay in the room.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="primary" onClick={goLogin}>
                Get Started →
              </Button>
              <Button
                variant="secondary"
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })}
              >
                View Architecture
              </Button>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.15, ease: [0.2, 0, 0, 1] }}>
            <ArchitectureDiagram />
          </motion.div>
        </section>

        <section className="grid gap-4 pb-12 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface/80 p-5 shadow-card">
              <p className="font-semibold text-fg">{f.title}</p>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </section>

        <section id="how-it-works" className="rounded-2xl border border-line bg-surface/80 p-6 shadow-card md:p-8">
          <h2 className="text-2xl font-normal text-fg">How it works</h2>
          <ol className="mt-4 grid gap-4 text-sm text-fg-2 md:grid-cols-3">
            <li>
              <span className="font-semibold text-fg">1. Ingest.</span> Upload documents; they are parsed and OCR'd on-prem and tagged with a classification level.
            </li>
            <li>
              <span className="font-semibold text-fg">2. Ask.</span> A router picks the right agent. Answers cite the exact page and region of the source.
            </li>
            <li>
              <span className="font-semibold text-fg">3. Control.</span> Admins govern users, policies, approvals and audit logs from one console.
            </li>
          </ol>
        </section>

        <p className="py-10 text-center text-xs font-medium uppercase tracking-[0.25em] text-faint">
          Build &nbsp;›&nbsp; Deploy &nbsp;›&nbsp; Control &nbsp;›&nbsp; Own your AI
        </p>
      </div>
    </div>
  );
}
