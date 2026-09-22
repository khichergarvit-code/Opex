import { motion } from "motion/react";
import {
  Search,
  Bell,
  BellRing,
  Plus,
  Gauge,
  BarChart3,
  SendHorizontal,
  ImagePlus,
  PenLine,
  FileSearch,
  Globe,
  Check,
  Loader2,
  Circle,
  Cpu,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AppShell from "@/components/AppShell";

// Quick-action cards under the chat box.
const ACTIONS: { icon: LucideIcon; title: string; note: string }[] = [
  { icon: ImagePlus, title: "Create an image or sticker", note: "Generate visuals with AI" },
  { icon: PenLine, title: "Write or edit", note: "Draft, edit or improve text" },
  { icon: FileSearch, title: "Analyze a file", note: "Upload and analyze documents" },
  { icon: Globe, title: "Search the web", note: "Get real-time information" },
];

// Steps in the right-hand Activity Run panel.
type Step = { label: string; time: string; state: "done" | "running" | "idle" };
const STEPS: Step[] = [
  { label: "Initializing workflow", time: "2s", state: "done" },
  { label: "Loading tools", time: "3s", state: "done" },
  { label: "Retrieving context", time: "12s", state: "running" },
  { label: "Running inference", time: "—", state: "idle" },
  { label: "Post-processing", time: "—", state: "idle" },
  { label: "Completing", time: "—", state: "idle" },
];

function StepIcon({ state }: { state: Step["state"] }) {
  if (state === "done")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ok/15 text-ok">
        <Check size={13} />
      </span>
    );
  if (state === "running")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-run/15 text-run">
        <Loader2 size={13} className="animate-spin" />
      </span>
    );
  return <Circle size={20} className="text-line" strokeWidth={1.5} />;
}

export default function Dashboard() {
  return (
    <AppShell>
      {/* Top search bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas/80 px-6 py-3 backdrop-blur">
        <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <Search size={16} className="text-muted" />
          <input
            placeholder="Search or start a new chat..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted/70"
          />
          <kbd className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted">
            ⌘ K
          </kbd>
        </div>
        <button className="rounded-lg border border-line bg-surface p-2.5 text-muted hover:text-ink">
          <Bell size={17} />
        </button>
        <button className="rounded-lg border border-line bg-surface p-2.5 text-muted hover:text-ink">
          <BellRing size={17} />
        </button>
      </div>

      <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="mx-auto w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="pt-6 text-center"
          >
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              Good evening, Garvit <span className="align-middle">👋</span>
            </h1>
            <p className="mt-1.5 text-sm text-muted">How can I help you today?</p>
          </motion.div>

          {/* Chat input */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="mt-8 rounded-2xl border border-line bg-surface p-4 shadow-soft"
          >
            <input
              placeholder="Ask anything..."
              className="w-full bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted/70"
            />
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:text-ink">
                  <Plus size={16} />
                </button>
                <button className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink">
                  <Gauge size={14} /> Token per sec
                </button>
                <button className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink">
                  <BarChart3 size={14} /> Model Breakdown
                </button>
              </div>
              <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-lift hover:bg-brand-700">
                <SendHorizontal size={16} />
              </button>
            </div>
          </motion.div>

          {/* Quick actions */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ACTIONS.map((a, i) => {
              const Icon = a.icon;
              return (
                <motion.button
                  key={a.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}
                  className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon size={17} />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold text-ink">
                      {a.title}
                    </span>
                    <span className="block text-xs text-muted">{a.note}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>

          <p className="mt-8 text-center text-xs italic text-muted">
            "Build for deeper work. On your infrastructure."
          </p>
        </div>

        {/* Right column: activity + current model */}
        <div className="flex flex-col gap-5">
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45 }}
            className="rounded-2xl border border-line bg-surface p-5 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">Activity Run</h2>
              <a href="#" className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                View all <ArrowRight size={12} />
              </a>
            </div>

            <div className="mt-4 flex flex-col gap-3.5">
              {STEPS.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <StepIcon state={s.state} />
                  <span
                    className={
                      "flex-1 text-sm " +
                      (s.state === "idle" ? "text-muted/60" : "text-ink")
                    }
                  >
                    {s.label}
                  </span>
                  <span className="font-mono text-xs text-muted">{s.time}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Cpu size={18} />
            </span>
            <div className="leading-tight">
              <p className="text-xs text-muted">Current Model</p>
              <p className="font-mono text-sm font-semibold text-ink">
                opex-llama-3-70b{" "}
                <span className="font-sans font-normal text-muted">(internal)</span>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </AppShell>
  );
}
