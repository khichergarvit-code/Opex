import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { navigate } from '../lib/router';

const QUESTION = 'What is the torque spec for the discharge flange bolts?';
const ANSWER = 'The discharge flange bolts are tightened to 460 Nm in a cross pattern, in two passes.';

const PILLARS = [
  {
    label: 'Documents',
    title: 'Every answer shows where it came from',
    body: 'Upload manuals, reports and scans. Answers cite the exact page and region, and say plainly when they are not based on your files.',
  },
  {
    label: 'Access',
    title: 'Clearance is checked inside the search',
    body: 'Classification levels, groups and workspaces are enforced in the database query itself, so restricted text is never fetched, let alone shown.',
  },
  {
    label: 'Audit',
    title: 'Everything is on the record',
    body: 'Model calls, searches, approvals and admin actions are logged with timings. Changes to the log are blocked by the database.',
  },
];

const STEPS = [
  ['01', 'Add documents', 'PDFs, spreadsheets and scans are read on your machine and tagged with a classification.'],
  ['02', 'Ask in plain language', 'The right specialist handles it: documents, images, calculations, files.'],
  ['03', 'Approve what changes things', 'Writing a file or running a command always waits for your yes.'],
];

type Phase = 0 | 1 | 2 | 3 | 4;

/**
 * A looping, self-playing demo of the product (built from real UI pieces, no images): a document is read, a question
 * is typed, and an answer streams in with its source. It pauses off-screen and shows the finished state for reduced motion.
 */
function ProductDemo() {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.3 });
  const [phase, setPhase] = useState<Phase>(reduceMotion ? 4 : 0);
  const [typed, setTyped] = useState(reduceMotion ? QUESTION.length : 0);
  const [streamed, setStreamed] = useState(reduceMotion ? ANSWER.length : 0);
  const [pages, setPages] = useState(reduceMotion ? 3 : 0);

  useEffect(() => {
    if (reduceMotion || !visible) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));
    (async () => {
      while (!cancelled) {
        setPhase(0);
        setTyped(0);
        setStreamed(0);
        setPages(0);
        await wait(700);
        setPhase(1);
        for (let p = 1; p <= 3 && !cancelled; p++) {
          await wait(520);
          setPages(p);
        }
        await wait(400);
        setPhase(2);
        for (let i = 1; i <= QUESTION.length && !cancelled; i++) {
          await wait(28);
          setTyped(i);
        }
        await wait(500);
        setPhase(3);
        for (let i = 1; i <= ANSWER.length && !cancelled; i++) {
          await wait(22);
          setStreamed(i);
        }
        setPhase(4);
        await wait(4200);
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [visible, reduceMotion]);

  const reading = phase === 1;
  return (
    <div ref={ref} className="w-full max-w-md rounded-xl border border-line bg-surface" role="img" aria-label="Demo: a manual is read, a question about torque is asked, and the answer cites page 1">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
        <span>Default project</span>
        <span className="flex items-center gap-2">
          Network closed <span className="h-1.5 w-1.5 rounded-full bg-success-600" />
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
          <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">PDF</span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg">pump-manual.pdf</span>
          <span className={`text-xs ${reading ? 'text-ember-600' : phase === 0 ? 'text-faint' : 'text-muted'}`}>
            {phase === 0 ? 'Queued' : pages < 3 ? `Reading p.${Math.max(pages, 1)}/3` : 'Ready'}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-ember-500 transition-[width] duration-500" style={{ width: `${(pages / 3) * 100}%` }} />
        </div>

        <div className="ml-auto w-fit max-w-[90%] rounded-2xl bg-raised px-3.5 py-2 text-sm text-fg" style={{ opacity: typed > 0 ? 1 : 0 }}>
          {QUESTION.slice(0, typed)}
          {phase === 2 && <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-fg align-middle" />}
        </div>

        <div className="min-h-[4.5rem] text-sm leading-6 text-fg" style={{ opacity: streamed > 0 ? 1 : 0 }}>
          {ANSWER.slice(0, streamed)}
          {phase === 3 && <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-fg align-middle" />}
          {phase === 4 && (
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="ml-2 inline-block rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted"
            >
              pump-manual.pdf · p.1
            </motion.span>
          )}
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const reduceMotion = useReducedMotion();
  const goLogin = () => navigate({ name: 'login' });
  const reveal = (delay = 0) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-40px' },
    transition: { duration: 0.5, delay, ease: [0.2, 0, 0, 1] as [number, number, number, number] },
  });

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo markClassName="h-7 w-7" textClassName="text-lg" />
          <div className="flex items-center gap-1">
            <a href="#pillars" className="hidden rounded-lg px-3 py-2 text-sm text-fg-2 hover:bg-raised sm:block">Product</a>
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm text-fg-2 hover:bg-raised sm:block">How it works</a>
            <Button variant="primary" size="sm" onClick={goLogin} className="ml-2">Sign in</Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-14 py-16 md:grid-cols-[1.1fr_1fr] md:py-28">
          <div>
            <motion.p {...reveal()} className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              Runs on your hardware · no cloud
            </motion.p>
            <motion.h1 {...reveal(0.05)} className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-fg md:text-5xl">
              Ask your documents.
              <br />
              <span className="font-serif font-normal italic text-fg-2">Nothing leaves the room.</span>
            </motion.h1>
            <motion.p {...reveal(0.1)} className="mt-6 max-w-lg text-lg leading-relaxed text-fg-2">
              OpeX is a private assistant for confidential industrial documents. Local models read your files, cite the page, and ask before they change anything.
            </motion.p>
            <motion.div {...reveal(0.15)} className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" onClick={goLogin} className="!px-5 !py-2.5">Sign in</Button>
              <Button variant="secondary" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })} className="!px-5 !py-2.5">
                How it works
              </Button>
            </motion.div>
          </div>
          <motion.div {...reveal(0.1)} className="flex justify-center md:justify-end">
            <ProductDemo />
          </motion.div>
        </section>

        <section id="pillars" className="scroll-mt-20 border-t border-line py-16">
          <div className="grid gap-10 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <motion.div key={p.label} {...reveal(i * 0.06)}>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ember-600">{p.label}</p>
                <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-fg">{p.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-20 border-t border-line py-16">
          <motion.h2 {...reveal()} className="max-w-md text-2xl font-semibold tracking-tight text-fg">From files to a cited answer in three steps</motion.h2>
          <ol className="mt-10 divide-y divide-line border-y border-line">
            {STEPS.map(([n, title, body], i) => (
              <motion.li key={n} {...reveal(i * 0.06)} className="grid gap-2 py-6 md:grid-cols-[6rem_16rem_1fr] md:items-baseline md:gap-6">
                <span className="font-mono text-sm text-ember-600">{n}</span>
                <span className="font-medium text-fg">{title}</span>
                <span className="text-sm leading-relaxed text-muted">{body}</span>
              </motion.li>
            ))}
          </ol>
        </section>

        <section className="py-20">
          <motion.div {...reveal()} className="flex flex-col items-start justify-between gap-6 rounded-xl bg-fg p-8 text-canvas md:flex-row md:items-center md:p-10">
            <p className="max-w-md font-serif text-2xl italic leading-snug">Try it on a document you cannot upload anywhere else.</p>
            <button type="button" onClick={goLogin} className="rounded-lg bg-canvas px-5 py-2.5 text-sm font-medium text-fg transition-opacity hover:opacity-90">
              Sign in
            </button>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
        OpeX · offline by design · no telemetry
      </footer>
    </div>
  );
}
