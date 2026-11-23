import { describe, expect, it } from "vitest";
import type { StoredCallGraph } from "../../src/indexer/store.js";
import { traceCallees, traceCallers } from "../../src/trace/engine.js";

const graph: StoredCallGraph = {
  version: 1,
  functions: [
    { id: "routes.ts#handler@1", name: "handler", file: "routes.ts", startLine: 1, endLine: 4 },
    { id: "service.ts#save@1", name: "save", file: "service.ts", startLine: 1, endLine: 3 },
    { id: "jobs.ts#nightly@1", name: "nightly", file: "jobs.ts", startLine: 1, endLine: 5 },
  ],
  edges: [{ callerId: "routes.ts#handler@1", calleeId: "service.ts#save@1" }],
  unresolved: [
    { callerId: "routes.ts#handler@1", calleeText: "res.json", line: 3 },
    { callerId: "jobs.ts#nightly@1", calleeText: "this.repo.save", line: 2 },
  ],
};

describe("traceCallees", () => {
  it("lists the target's unresolved calls alongside resolved callees", () => {
    const outcome = traceCallees(graph, "handler");
    expect(outcome.results.map((r) => r.functionName)).toEqual(["save"]);
    expect(outcome.unresolved).toEqual([{ calleeText: "res.json", inFunction: "handler", file: "routes.ts", line: 3 }]);
  });

  it("returns no unresolved calls for an unknown function", () => {
    expect(traceCallees(graph, "missing")).toEqual({ results: [], unresolved: [] });
  });
});

describe("traceCallers", () => {
  it("lists unresolved call sites whose final name matches as possible callers", () => {
    const outcome = traceCallers(graph, "save");
    expect(outcome.results.map((r) => r.functionName)).toEqual(["handler"]);
    expect(outcome.unresolved).toEqual([{ calleeText: "this.repo.save", inFunction: "nightly", file: "jobs.ts", line: 2 }]);
  });

  it("ignores unresolved calls whose final name differs from the target", () => {
    expect(traceCallers(graph, "handler").unresolved).toEqual([]);
  });
});
