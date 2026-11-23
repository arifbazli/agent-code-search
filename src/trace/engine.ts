import { buildCallGraph } from "../callgraph/graph.js";
import { buildProjectFiles } from "../indexer/pipeline.js";
import { loadConfig } from "../config/loader.js";
import { readCallGraphFile, type StoredCallGraph, type StoredFunctionInfo } from "../indexer/store.js";
import type { UnresolvedCall } from "../callgraph/types.js";

export interface TraceMatch {
  functionName: string;
  file: string;
  startLine: number;
  endLine: number;
}

export interface TraceOutcome {
  /** Populated when the target function name resolved unambiguously. */
  results: TraceMatch[];
  /** Populated instead of `results` when the name matched more than one function and no `file` filter disambiguated it — caller should re-invoke with a specific file. */
  ambiguous?: TraceMatch[];
  /**
   * Call sites the resolver could not follow, so an empty `results` is never mistaken for "nothing there".
   * For callees: calls made inside the target that weren't resolved to a local function.
   * For callers: unresolved call sites elsewhere whose final name matches the target — possible callers.
   */
  unresolved: UnresolvedSite[];
}

export interface UnresolvedSite {
  /** The call as written, flattened (for example `res.json` or `this.repo.save`). */
  calleeText: string;
  /** Function the call sits in, or the raw caller id if that function isn't in the graph. */
  inFunction: string;
  file: string;
  line: number;
}

/** Uses the persisted callgraph.json if `init` has run; otherwise builds one on the fly scoped to `dir` — trace has no embedding cost, so it deliberately doesn't require indexing first. */
export function loadOrBuildGraph(dir: string): StoredCallGraph {
  try {
    const config = loadConfig(dir);
    const stored = readCallGraphFile(dir, config);
    if (stored) return stored;
  } catch {
    // No config yet — fall through to building live.
  }
  const files = buildProjectFiles(dir);
  const graph = buildCallGraph(files);
  return {
    version: 1,
    functions: [...graph.functions.values()].map((f) => ({ id: f.id, name: f.name, file: f.file, startLine: f.startLine, endLine: f.endLine })),
    edges: graph.edges,
    unresolved: graph.unresolved,
  };
}

function findTargets(graph: StoredCallGraph, functionName: string, file?: string): StoredFunctionInfo[] {
  const matches = graph.functions.filter((f) => f.name === functionName && (!file || f.file === file || f.file.endsWith(file)));
  return matches;
}

function toMatch(fn: StoredFunctionInfo): TraceMatch {
  return { functionName: fn.name, file: fn.file, startLine: fn.startLine, endLine: fn.endLine };
}

function toSite(call: UnresolvedCall, functionsById: Map<string, StoredFunctionInfo>): UnresolvedSite {
  const caller = functionsById.get(call.callerId);
  return { calleeText: call.calleeText, inFunction: caller?.name ?? call.callerId, file: caller?.file ?? "", line: call.line };
}

/** `this.repo.save` -> `save`; `getItemById(id).then` -> `then`. */
function finalName(calleeText: string): string {
  const parts = calleeText.split(".");
  return parts[parts.length - 1];
}

export function traceCallers(graph: StoredCallGraph, functionName: string, file?: string): TraceOutcome {
  const targets = findTargets(graph, functionName, file);
  if (targets.length === 0) return { results: [], unresolved: [] };
  if (targets.length > 1) return { results: [], ambiguous: targets.map(toMatch), unresolved: [] };

  const targetId = targets[0].id;
  const functionsById = new Map(graph.functions.map((f) => [f.id, f]));
  const callerIds = graph.edges.filter((e) => e.calleeId === targetId).map((e) => e.callerId);
  const results = callerIds.map((id) => functionsById.get(id)).filter((f): f is StoredFunctionInfo => f != null).map(toMatch);
  const unresolved = graph.unresolved.filter((u) => finalName(u.calleeText) === functionName).map((u) => toSite(u, functionsById));
  return { results, unresolved };
}

export function traceCallees(graph: StoredCallGraph, functionName: string, file?: string): TraceOutcome {
  const targets = findTargets(graph, functionName, file);
  if (targets.length === 0) return { results: [], unresolved: [] };
  if (targets.length > 1) return { results: [], ambiguous: targets.map(toMatch), unresolved: [] };

  const targetId = targets[0].id;
  const functionsById = new Map(graph.functions.map((f) => [f.id, f]));
  const calleeIds = graph.edges.filter((e) => e.callerId === targetId).map((e) => e.calleeId);
  const results = calleeIds.map((id) => functionsById.get(id)).filter((f): f is StoredFunctionInfo => f != null).map(toMatch);
  const unresolved = graph.unresolved.filter((u) => u.callerId === targetId).map((u) => toSite(u, functionsById));
  return { results, unresolved };
}
