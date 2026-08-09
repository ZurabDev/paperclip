import assert from "node:assert/strict";
import test from "node:test";

import { executable, normalizeRemote, parseArguments } from "./sync-upstream.mjs";

test("normalizes supported GitHub remote forms", () => {
  assert.equal(normalizeRemote("git@github.com:ZurabDev/paperclip.git"), "github.com/zurabdev/paperclip");
  assert.equal(normalizeRemote("https://github.com/paperclipai/paperclip.git"), "github.com/paperclipai/paperclip");
});

test("selects the Windows pnpm shim only on Windows", () => {
  assert.equal(executable("pnpm", "win32"), "pnpm.cmd");
  assert.equal(executable("pnpm", "darwin"), "pnpm");
  assert.equal(executable("git", "win32"), "git");
});

test("parses command and dry-run independently", () => {
  assert.deepEqual(parseArguments(["merge", "--dry-run"]), { command: "merge", dryRun: true });
  assert.deepEqual(parseArguments([]), { command: "status", dryRun: false });
});
