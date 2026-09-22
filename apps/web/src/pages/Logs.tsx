import { motion } from "motion/react";
import {
  Download,
  ChevronDown,
  Calendar,
  Check,
  X,
  MoreHorizontal,
} from "lucide-react";
import AppShell from "@/components/AppShell";

// One row of the logs table.
type Run = {
  time: string;
  workflow: string;
  model: string;
  latency: string;
  tokens: string;
  status: "success" | "failed";
};

const RUNS: Run[] = [
  { time: "Sep 20, 18:42", workflow: "RAG Pipeline", model: "GPT-4o", latency: "2.3s", tokens: "1.2K", status: "success" },
  { time: "Sep 20, 17:11", workflow: "Document Q&A", model: "Claude 3.5", latency: "3.1s", tokens: "2.4K", status: "success" },
  { time: "Sep 20, 16:03", workflow: "Code Analysis", model: "GPT-4o", latency: "1.8s", tokens: "892", status: "success" },
  { time: "Sep 19, 14:22", workflow: "Data Extraction", model: "Llama 3", latency: "4.6s", tokens: "3.1K", status: "failed" },
  { time: "Sep 19, 22:11", workflow: "Summarization", model: "GPT-4o", latency: "2.0s", tokens: "1.0K", status: "success" },
  { time: "Sep 19, 09:47", workflow: "Web Research", model: "Claude 3.5", latency: "6.2s", tokens: "5.4K", status: "success" },
  { time: "Sep 18, 20:15", workflow: "RAG Pipeline", model: "Llama 3", latency: "3.9s", tokens: "2.7K", status: "failed" },
  { time: "Sep 18, 11:30", workflow: "Image Caption", model: "GPT-4o", latency: "1.4s", tokens: "640", status: "success" },
];

function Filter({ label }: { label: string }) {
  return (
    <button className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-canvas">
      {label}
      <ChevronDown size={14} className="text-muted" />
    </button>
  );
}

function StatusPill({ status }: { status: Run["status"] }) {
  const ok = status === "success";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold " +
        (ok ? "bg-ok/10 text-ok" : "bg-fail/10 text-fail")
      }
    >
      {ok ? <Check size={12} /> : <X size={12} />}
      {ok ? "Success" : "Failed"}
    </span>
  );
}

export default function Logs() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Logs / Activity
            </h1>
            <p className="mt-1 text-sm text-muted">
              Track, debug and analyze all AI workflow runs.
            </p>
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas">
            <Download size={15} />
            Export
          </button>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Filter label="All Workflows" />
          <Filter label="All Models" />
          <Filter label="All Status" />
          <button className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-canvas">
            <Calendar size={14} className="text-muted" />
            Jul 1, 2024 - Now
          </button>
        </div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-3.5">Time</th>
                <th className="px-5 py-3.5">Workflow</th>
                <th className="px-5 py-3.5">Model</th>
                <th className="px-5 py-3.5">Latency</th>
                <th className="px-5 py-3.5">Tokens</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {RUNS.map((r, i) => (
                <tr
                  key={i}
                  className="border-b border-line last:border-0 transition-colors hover:bg-canvas/60"
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">
                    {r.time}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-ink">
                    {r.workflow}
                  </td>
                  <td className="px-5 py-3.5 text-muted">{r.model}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-ink">
                    {r.latency}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-ink">
                    {r.tokens}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <button className="text-muted hover:text-ink">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </AppShell>
  );
}
