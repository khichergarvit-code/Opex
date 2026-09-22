import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Sun, SlidersHorizontal, Boxes, MessageSquareText, Wrench, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import Toggle from "@/components/Toggle";

// Left sub-navigation inside Settings.
const TABS: { label: string; icon: LucideIcon }[] = [
  { label: "Preferences", icon: SlidersHorizontal },
  { label: "Models", icon: Boxes },
  { label: "System Prompts", icon: MessageSquareText },
  { label: "Tools", icon: Wrench },
  { label: "Users", icon: Users },
];

// A row with a label, a helper line, and some control on the right.
function Row({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-4 last:border-0">
      <div className="leading-tight">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted">{note}</p>
      </div>
      {children}
    </div>
  );
}

function Select({ options }: { options: string[] }) {
  return (
    <select className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand-400">
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

export default function Settings() {
  const [active, setActive] = useState("Preferences");

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Settings
            </h1>
            <p className="mt-1 text-sm text-muted">
              Manage your preferences and workspace configuration.
            </p>
          </div>
          <button className="rounded-lg border border-line bg-surface p-2.5 text-muted hover:text-ink">
            <Sun size={17} />
          </button>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr]">
          {/* Sub-nav */}
          <nav className="flex flex-col gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = active === t.label;
              return (
                <button
                  key={t.label}
                  onClick={() => setActive(t.label)}
                  className={
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                    (on
                      ? "bg-brand-50 text-brand-700"
                      : "text-muted hover:bg-surface hover:text-ink")
                  }
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Panel */}
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border border-line bg-surface p-6 shadow-soft"
          >
            <h2 className="text-lg font-bold text-ink">{active}</h2>
            <p className="mb-2 text-sm text-muted">Customize your experience</p>

            {active === "Preferences" ? (
              <div>
                <Row title="Theme" note="Choose your preferred theme">
                  <Select options={["Light", "Dark", "System"]} />
                </Row>
                <Row title="Language" note="Interface language">
                  <Select options={["English", "Hindi", "Spanish"]} />
                </Row>
                <Row title="Auto-save chats" note="Automatically save your conversations">
                  <Toggle defaultOn />
                </Row>
                <Row
                  title="Show code with syntax highlighting"
                  note="Better code readability"
                >
                  <Toggle defaultOn />
                </Row>
                <Row
                  title="Enable sound notifications"
                  note="Get notified on completion"
                >
                  <Toggle />
                </Row>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted">
                {active} settings would appear here.
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </AppShell>
  );
}
