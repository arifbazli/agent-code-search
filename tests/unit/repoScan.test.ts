import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { walkSourceFiles } from "../../src/parser/repoScan.js";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("walkSourceFiles", () => {
  it("skips a broken symlink instead of aborting the scan", () => {
    dir = mkdtempSync(join(tmpdir(), "semantic-index-scan-"));
    writeFileSync(join(dir, "kept.ts"), "export const kept = 1;\n");
    symlinkSync(join(dir, "does-not-exist.ts"), join(dir, "dangling.ts"));

    expect(walkSourceFiles(dir)).toEqual([join(dir, "kept.ts")]);
  });

  it("returns only source files outside excluded directories", () => {
    dir = mkdtempSync(join(tmpdir(), "semantic-index-scan-"));
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "dep.ts"), "export const dep = 1;\n");
    writeFileSync(join(dir, "app.tsx"), "export const App = () => null;\n");
    writeFileSync(join(dir, "notes.md"), "# notes\n");

    expect(walkSourceFiles(dir)).toEqual([join(dir, "app.tsx")]);
  });
});
