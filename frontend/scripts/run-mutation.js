import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(frontendDirectory, "..");
const strykerCli = path.join(
  frontendDirectory,
  "node_modules",
  "@stryker-mutator",
  "core",
  "bin",
  "stryker.js",
);

const result = spawnSync(
  process.execPath,
  [strykerCli, "run"],
  { cwd: projectRoot, stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
