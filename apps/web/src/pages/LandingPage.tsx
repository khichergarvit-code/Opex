import { motion, useReducedMotion } from 'motion/react';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { Icon, type IconName } from '../components/ui/Icon';
import { navigate } from '../lib/router';

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'shield', title: 'Fully offline', body: 'Models run on your own hardware. No cloud calls, no telemetry, no outside fonts or scripts.' },
  { icon: 'file', title: 'Answers with citations', body: 'Ask about your documents and see the exact page and region each answer came from.' },
  { icon: 'bot', title: 'Specialist agents', body: 'Chat, documents, images, calculations and drawing each go to the agent best suited to them.' },
  { icon: 'layers', title: 'Access-controlled', body: 'Clearance levels and group rules are enforced inside every search, not after it.' },
  { icon: 'check', title: 'You stay in charge', body: 'Anything that changes something asks for your approval first.' },
  { icon: 'list', title: 'Fully auditable', body: 'Every model call, search and tool action is recorded for review.' },
];

const STEPS = [
  { n: '1', title: 'Add your documents', body: 'Upload PDFs, spreadsheets and scans. They are read and tagged with a classification level on your machine.' },
  { n: '2', title: 'Ask anything', body: 'OpeX routes each question to the right agent and shows its sources.' },
  { n: '3', title: 'Stay in control', body: 'Admins manage people, policies and audit logs from one console.' },
];

/** A static preview of the product, so the page shows what OpeX looks like instead of an abstract diagram. */
function ChatPreview() {
  return (
    <div className="mx-auto w-full max-w-md rounded-[28px] border border-line bg-surface p-5 shadow-lift" role="img" aria-label="Preview of a chat where OpeX answers a question with a page citation">
      <div className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-lg bg-accent-100 px-4 py-2.5 text-sm text-fg">What is the torque spec for the discharge flange bolts?</div>
      <div className="mt-3 max-w-[92%] rounded-3xl rounded-bl-lg bg-canvas px-4 py-3 text-sm leading-6 text-fg">
        The discharge flange bolts are tightened to <b>460 Nm</b> in a cross pattern.
        <span className="ml-1 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700">pump-manual.pdf · p.1</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span className="rounded-full border border-line px-2.5 py-0.5">Grounded in your documents</span>
        <span>8 s</span>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2.5 text-sm text-faint">
        Ask anything…
        <span className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-accent-600 text-white">
          <Icon name="send" className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

export function LandingPage() {
  const reduceMotion = useReducedMotion();
  const goLogin = () => navigate({ name: 'login' });
  const fade = (delay = 0) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-40px' },
    transition: { duration: 0.45, delay, ease: [0.2, 0, 0, 1] as [number, number, number, number] },
  });

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line/50 bg-canvas/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Logo />
          <div className="flex items-center gap-2">
            <a href="#features" className="hidden rounded-full px-4 py-2 text-sm text-fg-2 hover:bg-raised sm:block">Features</a>
            <a href="#how-it-works" className="hidden rounded-full px-4 py-2 text-sm text-fg-2 hover:bg-raised sm:block">How it works</a>
            <Button variant="primary" onClick={goLogin}>Sign in</Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
          <motion.div {...fade()}>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-3.5 py-1 text-xs font-semibold text-accent-700">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-600" aria-hidden="true" />
              Private AI workbench
            </span>
            <h1 className="mt-5 text-4xl font-normal leading-[1.1] tracking-tight text-fg md:text-6xl">AI that never leaves your infrastructure.</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-fg-2">
              Ask questions about confidential documents, read images, run calculations and draw pictures, all on your own hardware.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" onClick={goLogin} className="!px-6 !py-3">Get started</Button>
              <Button variant="secondary" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })} className="!px-6 !py-3">
                See how it works
              </Button>
            </div>
          </motion.div>
          <motion.div {...fade(0.1)}>
            <ChatPreview />
          </motion.div>
        </section>

        <section id="features" className="scroll-mt-20 pb-20">
          <motion.h2 {...fade()} className="text-3xl font-normal tracking-tight text-fg">Built for work that cannot leave the room</motion.h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} {...fade(i * 0.05)} className="rounded-3xl border border-line bg-surface p-6">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-100 text-accent-700">
                  <Icon name={f.icon} />
                </span>
                <p className="mt-4 font-medium text-fg">{f.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 rounded-[32px] bg-raised/70 p-8 md:p-12">
          <motion.h2 {...fade()} className="text-3xl font-normal tracking-tight text-fg">How it works</motion.h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.li key={s.n} {...fade(i * 0.08)} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-600 text-sm font-semibold text-white">{s.n}</span>
                <div>
                  <p className="font-medium text-fg">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </section>

        <section className="py-20 text-center">
          <motion.div {...fade()}>
            <h2 className="text-3xl font-normal tracking-tight text-fg">Ready to try it on your own documents?</h2>
            <Button variant="primary" onClick={goLogin} className="mt-6 !px-8 !py-3">Sign in</Button>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-line/60 py-8 text-center text-xs text-faint">OpeX · offline by design · no telemetry</footer>
    </div>
  );
}
