#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function output(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  return result.stdout.trim();
}

function requireCommand(command, args = ["--version"]) {
  output(command, args);
  console.log(`ok: ${command}`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const paperclipRoot = path.resolve(scriptDir, "../../../..");
const infraArgIndex = process.argv.indexOf("--infra");
const infraRoot = infraArgIndex >= 0
  ? path.resolve(process.argv[infraArgIndex + 1])
  : path.resolve(paperclipRoot, "../connect-ai");
const chartDir = path.join(infraRoot, "k8s", "zworkers");

try {
  requireCommand("git");
  requireCommand("kubectl", ["version", "--client"]);
  requireCommand("nelm", ["version"]);
  const context = output("kubectl", ["config", "current-context"]);
  const expectedContext = process.env.PAPERCLIP_CNT_CONTEXT || "admin-api.cnt.app";
  if (context !== expectedContext) throw new Error(`Kubernetes context is ${context}; expected ${expectedContext}`);
  if (!existsSync(path.join(chartDir, "Chart.yaml"))) throw new Error(`Missing CNT chart: ${chartDir}`);
  const branch = output("git", ["-C", paperclipRoot, "branch", "--show-current"]);
  if (branch !== "master" && !branch.startsWith("release/")) {
    throw new Error(`Paperclip release must run from master or release/*, got ${branch || "detached HEAD"}`);
  }
  console.log(`ok: context ${context}`);
  console.log(`ok: chart ${chartDir}`);
  console.log("preflight complete; continue with backup and immutable-image verification");
} catch (error) {
  console.error(`deploy-cnt preflight: ${error.message}`);
  process.exitCode = 1;
}
