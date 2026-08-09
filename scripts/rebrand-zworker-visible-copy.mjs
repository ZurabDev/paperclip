#!/usr/bin/env node

/**
 * Reapply the CNT fork's visible Zworker brand after upstream synchronization.
 * Internal compatibility identifiers (paperclipai, PAPERCLIP_*, .paperclip,
 * X-Paperclip-* headers, package/type names) intentionally remain unchanged.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const roots = ["ui/src", "server/src", "cli/src", "packages"].map((entry) => path.join(repoRoot, entry));
const supportedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const checkOnly = process.argv.includes("--check");
const legacyCompatibilityFixtures = new Map([
  ["server/src/__tests__/auth-session-route.test.ts", new Set(["stack-purple-rain Paperclip"])],
]);
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["dist", "node_modules", "coverage"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (supportedExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function rebrandToken(token, relativeFile) {
  if (!/\bPaperclip\b/.test(token)) return token;
  if (/X-Paperclip-|Paperclip-(?:Run|Invite|Responsible|Api|API)-/i.test(token)) return token;
  if ([...(legacyCompatibilityFixtures.get(relativeFile) ?? [])].some((fixture) => token.includes(fixture))) {
    return token;
  }
  return token.replace(/\bPaperclip\b/g, "Zworker");
}

let changedFiles = 0;
let replacements = 0;
const changedPaths = [];
for (const root of roots) {
  for (const file of await walk(root)) {
    if (file.includes(`${path.sep}ui${path.sep}src${path.sep}i18n${path.sep}RussianUiLocalization.`)) continue;
    const relativeFile = path.relative(repoRoot, file);
    const source = await readFile(file, "utf8");
    const scriptKind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
    const edits = [];
    const visit = (node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      ) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const original = source.slice(start, end);
        const branded = rebrandToken(original, relativeFile);
        if (branded !== original) {
          edits.push({ start, end, branded });
          replacements += (original.match(/\bPaperclip\b/g) ?? []).length;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (edits.length === 0) continue;
    changedPaths.push(relativeFile);
    let next = source;
    for (const edit of edits.reverse()) next = next.slice(0, edit.start) + edit.branded + next.slice(edit.end);
    if (!checkOnly) await writeFile(file, next, "utf8");
    changedFiles += 1;
  }
}

process.stderr.write(`Rebranded ${replacements} visible strings across ${changedFiles} source files.\n`);
if (checkOnly && changedPaths.length > 0) process.stderr.write(`${changedPaths.join("\n")}\n`);
if (checkOnly && changedFiles > 0) process.exitCode = 1;
