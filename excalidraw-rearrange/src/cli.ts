#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { rearrangeToFile, RearrangeError } from "./index.js";
import type { RearrangeReport } from "./types.js";

interface ParsedArgs {
  input: string;
  width: number;
  out?: string;
  proximityThreshold?: number;
  minFontSize?: number;
  groupGap?: number;
  force: boolean;
}

function printUsage(): void {
  console.log(`Usage: excalidraw-rearrange <input.excalidraw> --width <px> [options]

Options:
  --out <path>                 Output file path (default: overwrite input, i.e. add frame in place)
  --proximity-threshold <px>   Override default proximity grouping threshold
  --min-font-size <px>         Font-size floor during scaling (default: 12)
  --group-gap <px>             Vertical gap between stacked groups (default: 40)
  --force                      Regenerate canvas-{width} frame if one already exists
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let width: number | undefined;
  let out: string | undefined;
  let proximityThreshold: number | undefined;
  let minFontSize: number | undefined;
  let groupGap: number | undefined;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--width":
        width = Number(argv[++i]);
        break;
      case "--out":
        out = argv[++i];
        break;
      case "--proximity-threshold":
        proximityThreshold = Number(argv[++i]);
        break;
      case "--min-font-size":
        minFontSize = Number(argv[++i]);
        break;
      case "--group-gap":
        groupGap = Number(argv[++i]);
        break;
      case "--force":
        force = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        positional.push(arg);
    }
  }

  if (positional.length === 0) {
    throw new RearrangeError("Missing required <input.excalidraw> argument.");
  }
  if (width === undefined || Number.isNaN(width)) {
    throw new RearrangeError("Missing or invalid required --width <px> option.");
  }

  return {
    input: positional[0],
    width,
    out,
    proximityThreshold,
    minFontSize,
    groupGap,
    force,
  };
}

function printReport(report: RearrangeReport, targetWidth: number, outPath: string): void {
  console.log("");
  console.log(`excalidraw-rearrange summary (target width: ${targetWidth}px)`);
  console.log("----------------------------------------------------------");
  console.log(`Groups detected: ${report.groupCount}`);

  if (report.fontFloorGroups.length > 0) {
    console.log("");
    console.log("Groups that hit the font-size floor (may overflow slightly narrower than target width — review manually):");
    for (const g of report.fontFloorGroups) {
      console.log(`  - Group ${g.groupId}: elements [${g.elementIds.join(", ")}]`);
    }
  } else {
    console.log("Groups that hit the font-size floor: none");
  }

  if (report.overflowingText.length > 0) {
    console.log("");
    console.log("Text elements still exceeding target width after scaling (consider shortening or manually rewrapping):");
    for (const t of report.overflowingText) {
      console.log(`  - ${t.elementId}: "${t.textPreview}"`);
    }
  } else {
    console.log("Text elements overflowing target width: none");
  }

  console.log("");
  console.log(`Final computed height of new canvas: ${Math.round(report.newCanvasHeight)}px`);
  console.log(`Output written to: ${outPath}`);
  console.log("");
  console.log(
    "Reminder: Open the output file in Excalidraw to review and adjust — this is a starting point, not a final layout."
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const outPath = args.out ?? args.input;

  try {
    const result = await rearrangeToFile(
      {
        filePath: args.input,
        targetWidth: args.width,
        proximityThreshold: args.proximityThreshold,
        minFontSize: args.minFontSize,
        groupGap: args.groupGap,
        force: args.force,
      },
      outPath
    );
    printReport(result.report, args.width, outPath);
  } catch (err) {
    if (err instanceof RearrangeError) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(`Unexpected error: ${(err as Error).message}`);
    }
    process.exitCode = 1;
  }
}

const isMainModule =
  process.argv[1] && import.meta.url === `file://${realpathSync(process.argv[1])}`;
if (isMainModule) {
  main();
}
