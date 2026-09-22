import { codeExecTool } from './codeExec.js';
import { describeImageTool } from './describeImage.js';
import { makeChartTool } from './makeChart.js';
import type { ToolDefinition } from './types.js';

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  code_exec: codeExecTool,
  make_chart: makeChartTool,
  describe_image: describeImageTool,
};

export * from './types.js';
export * from './sandboxClient.js';
