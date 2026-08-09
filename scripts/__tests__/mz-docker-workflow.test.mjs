import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(repoRoot, ".github/workflows/docker.yml"), "utf8");

test("Docker publication lowercases every OCI image and cache repository", () => {
  const lowercaseSteps = workflow.match(/id: image\n\s+run: echo "repository=ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}"/g) ?? [];
  assert.equal(lowercaseSteps.length, 2, "both image jobs must compute a lowercase repository");

  assert.doesNotMatch(workflow, /ref=ghcr\.io\/\$\{\{ github\.repository \}\}/);
  assert.doesNotMatch(workflow, /images: ghcr\.io\/\$\{\{ github\.repository \}\}/);
  assert.equal(
    (workflow.match(/images: \$\{\{ steps\.image\.outputs\.repository \}\}/g) ?? []).length,
    2,
  );
  assert.equal(
    (workflow.match(/ref=\$\{\{ steps\.image\.outputs\.repository \}\}:buildcache(?:-cloud)?/g) ?? [])
      .length,
    4,
  );
});
