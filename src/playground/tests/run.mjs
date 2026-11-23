// Bundles sim.test.ts with esbuild and runs it with node's test runner.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), "pg-test-")), "sim.test.mjs");
const esbuild = process.env.ESBUILD || "esbuild";
execFileSync(esbuild, [join(here, "sim.test.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`, "--log-level=warning"], {
  stdio: "inherit",
});
execFileSync(process.execPath, ["--test", out], { stdio: "inherit" });
