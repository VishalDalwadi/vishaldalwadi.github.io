import path from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "excalidraw-converter";
import { runBuildCli } from "./build.js";
import { runDevServer } from "./dev.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error(`Usage:
  blog init <name>.excalidraw [--template <path>] [--dir posts|.]
  blog build
  blog dev`);
  process.exit(1);
}

async function runInit(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) usage();

  let template: string | undefined;
  let dir = "posts";
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--template") template = args[++i];
    else if (args[i] === "--dir") dir = args[++i];
  }

  const outputPath =
    dir === "."
      ? path.join(rootDir, "pages", name)
      : path.join(rootDir, "pages", dir, name);

  await init({
    outputPath,
    template: template ? path.resolve(template) : path.join(rootDir, "pages", "templates", "base.excalidraw"),
  });
  console.log(`created ${path.relative(rootDir, outputPath)} — open it in the Excalidraw app and fill it in.`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "init":
      await runInit(args);
      break;
    case "build":
      await runBuildCli();
      break;
    case "dev":
      await runDevServer();
      break;
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
