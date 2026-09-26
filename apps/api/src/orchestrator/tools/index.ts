import { codeExecTool } from './codeExec.js';
import { docSearchTool } from './docSearch.js';
import { generateImageTool } from './generateImage.js';
import { makeChartTool } from './makeChart.js';
import type { ToolDefinition } from './types.js';

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  code_exec: codeExecTool,
  make_chart: makeChartTool,
  doc_search: docSearchTool,
  generate_image: generateImageTool,
  // memory_search is registered once B2 builds it (apps/api/src/memory/) —
  // the `research` agent's allowlist already names it; until then a call
  // hits executor.ts's "unknown tool" branch, which is a safe, visible
  // failure (a tool_result the model sees), not a crash.
};

export * from './types.js';
export * from './sandboxClient.js';
