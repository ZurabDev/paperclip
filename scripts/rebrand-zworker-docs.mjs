#!/usr/bin/env node

/** Rebrand current user/contributor documentation and static metadata. */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const supportedExtensions = new Set([".html", ".json", ".md", ".mdx", ".txt"]);
const excludedDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "releases",
  "skills-releases",
  "storybook-static",
]);
const excludedPrefixes = ["doc/logs/", "doc/plans/", "report/"];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
    if (excludedPrefixes.some((prefix) => relative.startsWith(prefix))) continue;
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (supportedExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

let filesChanged = 0;
let replacements = 0;
for (const file of await walk(repoRoot)) {
  const source = await readFile(file, "utf8");
  const next = source.replace(/\bPaperclip\b/g, (match, offset, full) => {
    const surrounding = full.slice(Math.max(0, offset - 3), offset + match.length + 20);
    if (/X-Paperclip-|Paperclip-(?:Run|Invite|Responsible|Api|API)-/i.test(surrounding)) return match;
    replacements += 1;
    return "Zworker";
  });
  if (next === source) continue;
  if (!checkOnly) await writeFile(file, next, "utf8");
  filesChanged += 1;
}

process.stderr.write(`Rebranded ${replacements} documentation strings across ${filesChanged} files.\n`);
if (checkOnly && filesChanged > 0) process.exitCode = 1;
