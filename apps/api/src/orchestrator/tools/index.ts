import { codeExecTool } from './codeExec.js';
import { docSearchTool } from './docSearch.js';
import { createFolderTool, deleteFileTool, editFileTool, listFilesTool, moveFileTool, readFileTool, readMemoriesTool, writeFileTool } from './fileTools.js';
import { runShellTool } from './shell.js';
import { generateImageTool } from './generateImage.js';
import { makeChartTool } from './makeChart.js';
import type { ToolDefinition } from './types.js';

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  code_exec: codeExecTool,
  make_chart: makeChartTool,
  doc_search: docSearchTool,
  generate_image: generateImageTool,
  list_files: listFilesTool,
  create_folder: createFolderTool,
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  delete_file: deleteFileTool,
  move_file: moveFileTool,
  read_memories: readMemoriesTool,
  run_shell: runShellTool,
  // memory_search is registered once B2 builds it (apps/api/src/memory/) —
  // the `research` agent's allowlist already names it; until then a call
  // hits executor.ts's "unknown tool" branch, which is a safe, visible
  // failure (a tool_result the model sees), not a crash.
};

export * from './types.js';
export * from './sandboxClient.js';
