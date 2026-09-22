import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  Bot,
  Hexagon,
  Network,
  Database,
  Blocks,
  Wrench,
  ArrowLeft,
  FolderClosed,
  Cpu,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The whole diagram is drawn on a fixed pixel "stage" so the arrows
// (SVG) and the boxes (divs) always line up. On small screens the
// stage just scrolls sideways.
const W = 1040;
const H = 720;

// A single labelled node box, positioned by top-left pixel coords.
function Node({
  x,
  y,
  icon: Icon,
  label,
  accent = false,
}: {
  x: number;
  y: number;
  icon: LucideIcon;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "absolute flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold shadow-soft " +
        (accent
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink")
      }
      style={{ left: x, top: y }}
    >
      <Icon size={16} className={accent ? "text-brand-600" : "text-muted"} />
      {label}
    </div>
  );
}

// A group container (the big rounded regions) with a title.
function Group({
  x,
  y,
  w,
  h,
  icon: Icon,
  title,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div
      className="absolute rounded-2xl border border-line bg-canvas/60"
      style={{ left: x, top: y, width: w, height: h }}
    >
      <div className="flex items-center gap-2 px-4 pt-3 text-sm font-bold text-ink">
        <Icon size={16} className="text-brand-600" />
        {title}
      </div>
    </div>
  );
}

// Arrow helper: a path plus an arrowhead marker. `brand` swaps the colour.
function Arrow({ d, brand = false }: { d: string; brand?: boolean }) {
  const color = brand ? "#5B5BF0" : "#B4B4C6";
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2}
      markerEnd={brand ? "url(#headBrand)" : "url(#head)"}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.8 }}
    />
  );
}

export default function Architecture() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft size={16} /> Back
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Live Infrastructure
          </span>
        </div>

        <div className="mt-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Model / Infrastructure
          </h1>
          <p className="mt-1 text-sm text-muted">
            A unified architecture for private, controlled and scalable AI.
          </p>
        </div>

        {/* Scrollable stage */}
        <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-surface p-6 shadow-soft">
          <div className="relative dot-grid" style={{ width: W, height: H }}>
            {/* Arrow layer */}
            <svg
              className="absolute inset-0"
              width={W}
              height={H}
              fill="none"
            >
              <defs>
                <marker
                  id="head"
                  markerWidth="9"
                  markerHeight="9"
                  refX="6"
                  refY="4.5"
                  orient="auto"
                >
                  <path d="M0 0 L9 4.5 L0 9 z" fill="#B4B4C6" />
                </marker>
                <marker
                  id="headBrand"
                  markerWidth="9"
                  markerHeight="9"
                  refX="6"
                  refY="4.5"
                  orient="auto"
                >
                  <path d="M0 0 L9 4.5 L0 9 z" fill="#5B5BF0" />
                </marker>
              </defs>

              {/* Inside Agent */}
              <Arrow d="M 150 108 L 244 108" />
              <Arrow d="M 300 132 L 300 150" />
              <Arrow d="M 360 108 L 384 108" />

              {/* Agent <-> Core (two directions, offset) */}
              <Arrow d="M 260 232 C 260 270, 265 300, 270 336" brand />
              <Arrow d="M 330 336 C 335 300, 340 270, 340 232" />

              {/* Inside Core */}
              <Arrow d="M 288 372 L 288 448" />
              <Arrow d="M 330 356 C 400 356, 430 400, 452 432" />
              <Arrow d="M 300 488 C 360 500, 420 490, 452 472" />
              <Arrow d="M 300 552 C 380 552, 440 500, 470 476" brand />

              {/* Core -> Customer Internal Data */}
              <Arrow d="M 560 452 C 660 440, 700 400, 792 384" />
              <Arrow d="M 560 460 C 660 500, 700 510, 792 500" />

              {/* Core -> bottom infra */}
              <Arrow d="M 250 604 L 210 640" />
              <Arrow d="M 420 604 L 470 640" brand />
            </svg>

            {/* Group containers */}
            <Group x={30} y={24} w={440} h={210} icon={Bot} title="Opex Agent" />
            <Group x={30} y={280} w={560} h={324} icon={Hexagon} title="Opex Core" />
            <Group
              x={760}
              y={250}
              w={250}
              h={300}
              icon={Database}
              title="Customer Internal Data"
            />

            {/* Agent nodes */}
            <Node x={60} y={92} icon={Blocks} label="Intensity" />
            <Node x={244} y={92} icon={Bot} label="LL Agent" accent />
            <Node x={384} y={92} icon={Package} label="..." />
            <Node x={244} y={150} icon={Wrench} label="Tools" />

            {/* Core nodes */}
            <Node x={210} y={340} icon={Network} label="Inference" accent />
            <Node x={190} y={452} icon={Database} label="Knowledge Base" />
            <Node x={440} y={432} icon={Network} label="API Gateway" accent />
            <Node x={210} y={540} icon={Network} label="API Gateway" />

            {/* Customer data nodes */}
            <Node x={800} y={352} icon={Database} label="Database" />
            <Node x={800} y={472} icon={FolderClosed} label="File Storage" />

            {/* Bottom infra */}
            <Node x={120} y={648} icon={Package} label="Model Repository" />
            <Node x={400} y={648} icon={Cpu} label="Compute Cluster" accent />
          </div>
        </div>
      </div>
    </div>
  );
}
