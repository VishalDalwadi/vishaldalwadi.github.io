#!/usr/bin/env node
import { init } from "./init.js";

function printUsage(): void {
  console.error("Usage: excalidraw-site init <output-file.excalidraw> [--template <path>]");
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command !== "init") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const positional: string[] = [];
  let template: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--template") {
      template = rest[++i];
      if (!template) {
        console.error("--template requires a path argument");
        process.exitCode = 1;
        return;
      }
    } else {
      positional.push(arg);
    }
  }

  const outputPath = positional[0];
  if (!outputPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    await init({ outputPath, template });
    console.log(`Created ${outputPath}`);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

main();
