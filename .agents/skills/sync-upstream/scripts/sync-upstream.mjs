#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED = {
  origin: "github.com/ZurabDev/paperclip",
  upstream: "github.com/paperclipai/paperclip",
};

export function normalizeRemote(value) {
  return value
    .trim()
    .replace(/^git@github\.com:/i, "github.com/")
    .replace(/^https?:\/\/(?:[^@/]+@)?github\.com\//i, "github.com/")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

export function executable(name, platform = process.platform) {
  return platform === "win32" && name === "pnpm" ? "pnpm.cmd" : name;
}

export function parseArguments(argv) {
  const dryRun = argv.includes("--dry-run");
  const command = argv.includes("--help")
    ? "help"
    : (argv.find((item) => !item.startsWith("-")) ?? "status");
  return { command, dryRun };
}

function run(command, args, { capture = false, dryRun = false } = {}) {
  const rendered = [command, ...args].join(" ");
  if (dryRun) {
    console.log(`[dry-run] ${rendered}`);
    return "";
  }
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `${result.stderr || result.stdout}`.trim() : "";
    throw new Error(`${rendered} failed${detail ? `: ${detail}` : ""}`);
  }
  return capture ? result.stdout.trim() : "";
}

function git(args, options) {
  return run("git", args, options);
}

function assertRepository() {
  const root = git(["rev-parse", "--show-toplevel"], { capture: true });
  process.chdir(root);
}

function assertRemotes() {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const actual = normalizeRemote(git(["remote", "get-url", name], { capture: true }));
    if (actual !== expected.toLowerCase()) {
      throw new Error(`Unexpected ${name} remote: ${actual}; expected ${expected}`);
    }
  }
}

function assertAllowedBranch() {
  const branch = git(["branch", "--show-current"], { capture: true });
  if (branch !== "master" && !branch.startsWith("sync/upstream-")) {
    throw new Error(`Run from master or sync/upstream-*: current branch is ${branch || "detached HEAD"}`);
  }
}

function assertClean() {
  const status = git(["status", "--porcelain"], { capture: true });
  if (status) throw new Error("Working tree is not clean; commit or stash intentional work first");
}

function fetchRemotes(dryRun) {
  git(["fetch", "--prune", "origin", "master"], { dryRun });
  git(["fetch", "--prune", "upstream", "master"], { dryRun });
}

function showStatus(dryRun) {
  assertRepository();
  assertRemotes();
  assertAllowedBranch();
  fetchRemotes(dryRun);
  if (dryRun) return;
  const counts = git(["rev-list", "--left-right", "--count", "origin/master...upstream/master"], {
    capture: true,
  }).split(/\s+/);
  console.log(`origin-only commits: ${counts[0]}; upstream-only commits: ${counts[1]}`);
  console.log(`current branch: ${git(["branch", "--show-current"], { capture: true })}`);
}

function merge(dryRun) {
  assertRepository();
  assertRemotes();
  assertAllowedBranch();
  assertClean();
  fetchRemotes(dryRun);
  git(["merge", "--no-ff", "--no-edit", "upstream/master"], { dryRun });
}

function verify(dryRun) {
  assertRepository();
  const pnpm = executable("pnpm");
  run(pnpm, ["install", "--frozen-lockfile"], { dryRun });
  run(pnpm, ["-r", "typecheck"], { dryRun });
  run(pnpm, ["test:run"], { dryRun });
  run(pnpm, ["build"], { dryRun });
}

export function main(argv = process.argv.slice(2)) {
  const { command, dryRun } = parseArguments(argv);
  if (command === "help") {
    console.log("Usage: sync-upstream.mjs [status|merge|verify|all] [--dry-run]");
    return;
  }
  if (command === "status") return showStatus(dryRun);
  if (command === "merge") return merge(dryRun);
  if (command === "verify") return verify(dryRun);
  if (command === "all") {
    showStatus(dryRun);
    merge(dryRun);
    return verify(dryRun);
  }
  throw new Error(`Unknown command: ${command}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`sync-upstream: ${error.message}`);
    process.exitCode = 1;
  }
}
