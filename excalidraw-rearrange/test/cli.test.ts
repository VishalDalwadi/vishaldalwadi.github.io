import { mkdtemp, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import type { ExcalidrawFile } from "../src/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "excalidraw-rearrange-cli-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function copyFixture(name: string): Promise<string> {
  const dest = join(workDir, name);
  await copyFile(join(FIXTURES, name), dest);
  return dest;
}

describe("cli main()", () => {
  it("runs end-to-end against a fixture and prints a summary report", async () => {
    const file = await copyFixture("simple.excalidraw");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main([file, "--width", "400"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Groups detected");
    expect(output).toContain("Open the output file in Excalidraw");

    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as ExcalidrawFile;
    const canvas400 = parsed.elements.find((e) => e.type === "frame" && e.name === "canvas-400");
    expect(canvas400).toBeDefined();
  });

  it("prints an error and sets exit code on failure instead of throwing", async () => {
    const file = await copyFixture("no-canvas.excalidraw");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;

    await main([file, "--width", "400"]);

    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
