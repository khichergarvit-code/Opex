import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Lock, Layers, SlidersHorizontal } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroDiagram from "@/components/HeroDiagram";

// Three small trust badges under the hero copy.
const BADGES = [
  { icon: Lock, title: "Secure", note: "Your data stays yours" },
  { icon: Layers, title: "Scalable", note: "Built for any workload" },
  { icon: SlidersHorizontal, title: "Customizable", note: "Tailored to your needs" },
];

const FLOW = ["Build", "Deploy", "Control", "Own your AI"];

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-6xl px-5 py-5">
        <Navbar />

        <section className="relative mt-6 overflow-hidden rounded-3xl border border-line bg-surface px-6 py-12 shadow-soft sm:px-10 lg:py-16">
          {/* soft dotted texture in the corner */}
          <div className="dot-grid pointer-events-none absolute right-0 top-0 h-64 w-64 opacity-40" />

          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* Left: copy */}
            <div className="relative">
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-700"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                Private AI Infrastructure
              </motion.span>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl"
              >
                AI that never leaves your infrastructure.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.12 }}
                className="mt-5 max-w-md text-[15px] leading-relaxed text-muted"
              >
                Run powerful AI workflows on your own infrastructure, with
                complete control over models, data, tools and execution.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.18 }}
                className="mt-7 flex flex-wrap gap-3"
              >
                <Link
                  to="/signup"
                  className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-brand-700"
                >
                  Get Started <ArrowRight size={16} />
                </Link>
                <Link
                  to="/architecture"
                  className="rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
                >
                  View Architecture
                </Link>
              </motion.div>

              <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {BADGES.map((b, i) => {
                  const Icon = b.icon;
                  return (
                    <motion.div
                      key={b.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.25 + i * 0.08 }}
                      className="flex items-center gap-3"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Icon size={17} />
                      </span>
                      <div className="leading-tight">
                        <p className="text-sm font-semibold text-ink">
                          {b.title}
                        </p>
                        <p className="text-xs text-muted">{b.note}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Right: node diagram */}
            <HeroDiagram />
          </div>

          {/* Flow strip along the bottom */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3 border-t border-line pt-6 text-xs font-semibold uppercase tracking-widest text-muted">
            {FLOW.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <span>{step}</span>
                {i < FLOW.length - 1 && (
                  <ArrowRight size={13} className="text-brand-400" />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
