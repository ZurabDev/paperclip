#!/usr/bin/env node

/**
 * Extract operator-facing English copy from the React UI and build the checked-in
 * Russian fallback catalog used by the CNT Zworker fork.
 *
 * Translation is intentionally a maintainer command, never a build step. It uses
 * Google's public translate endpoint in bounded batches, preserves reviewed
 * entries by default, and applies the product vocabulary overrides below.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const uiRoot = path.join(repoRoot, "ui", "src");
const catalogPath = path.join(uiRoot, "i18n", "ru-ui.json");
const separator = "<<<ZWORKER_TRANSLATION_SEPARATOR>>>";
const shouldTranslate = process.argv.includes("--translate");
const checkOnly = process.argv.includes("--check");

const translatableAttributes = new Set([
  "alt",
  "aria-label",
  "label",
  "placeholder",
  "title",
]);

const translatableProperties = new Set([
  "body",
  "cancelLabel",
  "caption",
  "confirmLabel",
  "description",
  "detail",
  "emptyMessage",
  "errorMessage",
  "hint",
  "label",
  "message",
  "placeholder",
  "successMessage",
  "summary",
  "text",
  "title",
  "tooltip",
]);

const productOverrides = {
  Paperclip: "Zworker",
  paperclip: "Zworker",
  Zworker: "Zworker",
  "New Task": "Новая задача",
  Tasks: "Задачи",
  Task: "Задача",
  Dashboard: "Панель управления",
  Inbox: "Входящие",
  Decisions: "Решения",
  Status: "Статус",
  Work: "Работа",
  Cases: "Кейсы",
  Routines: "Сценарии",
  Pipelines: "Процессы",
  Goals: "Цели",
  Projects: "Проекты",
  Agents: "Агенты",
  Approvals: "Согласования",
  Settings: "Настройки",
  Search: "Поиск",
  Loading: "Загрузка",
  "Loading…": "Загрузка…",
  Save: "Сохранить",
  Cancel: "Отмена",
  Delete: "Удалить",
  Edit: "Изменить",
  Create: "Создать",
  Add: "Добавить",
  Remove: "Удалить",
  Close: "Закрыть",
  Back: "Назад",
  Next: "Далее",
  Done: "Готово",
  Active: "Активен",
  Paused: "Приостановлен",
  Blocked: "Заблокирован",
  "In progress": "В работе",
  "In review": "На проверке",
  Company: "Компания",
  Companies: "Компании",
  Project: "Проект",
  Agent: "Агент",
  Goal: "Цель",
  Activity: "Активность",
  Costs: "Расходы",
  General: "Общие",
  Experimental: "Экспериментальные",
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["fixtures", "storybook-static"].includes(entry.name)) files.push(...(await walk(absolute)));
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name)) continue;
    if (/\.(?:test|spec|stories)\.(?:ts|tsx)$/.test(entry.name)) continue;
    files.push(absolute);
  }
  return files;
}

function propertyName(node, sourceFile) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return node.getText(sourceFile).replace(/^['"]|['"]$/g, "");
}

function isWithinJsx(node) {
  let current = node.parent;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parent) {
    if (ts.isJsxExpression(current) || ts.isJsxElement(current) || ts.isJsxFragment(current)) return true;
    if (ts.isCallExpression(current) || ts.isVariableStatement(current) || ts.isReturnStatement(current)) break;
  }
  return false;
}

function isCopyBearingCallArgument(node) {
  const parent = node.parent;
  if (!ts.isCallExpression(parent) || !parent.arguments.includes(node)) return false;
  const callee = parent.expression.getText();
  return /(?:^|\.)(?:alert|confirm|prompt|setError|showToast|toast|notify|Error)$/.test(callee);
}

function isCopyBearingVariable(node, sourceFile) {
  const parent = node.parent;
  if (!ts.isVariableDeclaration(parent) || parent.initializer !== node || !ts.isIdentifier(parent.name)) return false;
  return /(?:Label|Title|Description|Message|Text|Copy|Hint|Placeholder|Tooltip|Summary)$/.test(
    parent.name.text,
  );
}

function isCopyBearingParameterDefault(node) {
  const parent = node.parent;
  return Boolean(
    ts.isParameter(parent) &&
      parent.initializer === node &&
      ts.isIdentifier(parent.name) &&
      /^(?:description|label|message|placeholder|summary|text|title|tooltip)$/.test(parent.name.text),
  );
}

function looksLikeOperatorCopy(value, strongContext) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 1_800 || !/[A-Za-z]{2}/.test(text)) return false;
  if (/^(?:https?:|mailto:|data:|\/|\.\/|\.\.\/|@|[A-Za-z]:\\)/.test(text)) return false;
  if (/^[a-z0-9_.:/@-]+$/.test(text)) return false;
  if (/^[A-Z0-9_./:-]+$/.test(text) && !strongContext) return false;
  if (/^(?:GET|POST|PUT|PATCH|DELETE)\s+\//.test(text)) return false;
  if (/\b(?:className|node_modules|application\/json|text\/html)\b/.test(text)) return false;
  if (/^(?:flex|grid|inline|block|hidden|absolute|relative|fixed|sticky)(?:\s|$)/.test(text)) return false;
  if (/[{}][{}]|=>|\b(?:const|let|function|interface|SELECT|INSERT|UPDATE)\b/.test(text) && !strongContext) return false;
  return strongContext || /\s/.test(text) || /^[A-ZА-Я][A-Za-zА-Яа-я'-]{1,32}$/.test(text);
}

function extractCopy(sourceFile) {
  const values = new Set();
  const add = (raw, strongContext = false) => {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (looksLikeOperatorCopy(normalized, strongContext)) values.add(normalized);
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) add(node.text, true);

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = propertyName(node.name, sourceFile);
      if (name && translatableAttributes.has(name)) add(node.initializer.text, true);
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name, sourceFile);
      if (
        name &&
        translatableProperties.has(name) &&
        (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
      ) {
        add(node.initializer.text, true);
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const jsxAttributeName = ts.isJsxAttribute(parent) ? propertyName(parent.name, sourceFile) : null;
      const objectPropertyName = ts.isPropertyAssignment(parent) ? propertyName(parent.name, sourceFile) : null;
      const isImportPath =
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword);
      const isNonCopyJsxAttribute = jsxAttributeName !== null && !translatableAttributes.has(jsxAttributeName);
      const isNonCopyObjectProperty =
        objectPropertyName !== null && !translatableProperties.has(objectPropertyName);
      const strongContext =
        isWithinJsx(node) ||
        isCopyBearingCallArgument(node) ||
        isCopyBearingVariable(node, sourceFile) ||
        isCopyBearingParameterDefault(node);
      if (!isImportPath && !isNonCopyJsxAttribute && !isNonCopyObjectProperty && strongContext) add(node.text, true);
    }

    if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (isWithinJsx(node)) add(node.text, true);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

async function readExistingCatalog() {
  try {
    return JSON.parse(await readFile(catalogPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function chunks(values, maxItems = 24, maxChars = 5_000) {
  const result = [];
  let current = [];
  let length = 0;
  for (const value of values) {
    const addition = value.length + separator.length + 2;
    if (current.length > 0 && (current.length >= maxItems || length + addition > maxChars)) {
      result.push(current);
      current = [];
      length = 0;
    }
    current.push(value);
    length += addition;
  }
  if (current.length > 0) result.push(current);
  return result;
}

async function translateBatch(values) {
  const source = values.map((value) => value.replaceAll("Paperclip", "Zworker")).join(`\n${separator}\n`);
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "ru");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", source);

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Translation request failed: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  const translated = payload[0].map((part) => part[0]).join("");
  const parts = translated.split(separator).map((part) => part.trim());
  if (parts.length !== values.length) {
    throw new Error(`Translation batch split mismatch: expected ${values.length}, received ${parts.length}`);
  }
  return Object.fromEntries(values.map((value, index) => [value, parts[index].replaceAll("Скрепка", "Zworker")]));
}

async function mapConcurrent(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

const files = await walk(uiRoot);
const extracted = new Set();
for (const file of files) {
  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const value of extractCopy(sourceFile)) extracted.add(value);
}

const existing = await readExistingCatalog();
const sortedSources = [...extracted].sort((left, right) => left.localeCompare(right, "en"));
const pending = sortedSources.filter(
  (source) => !(source in existing) || (existing[source] === source && !(source in productOverrides)),
);
let generated = {};

if (shouldTranslate && pending.length > 0) {
  const batches = chunks(pending);
  process.stderr.write(`Translating ${pending.length} strings in ${batches.length} batches…\n`);
  const translatedBatches = await mapConcurrent(batches, 4, async (batch, index) => {
    const result = await translateBatch(batch);
    process.stderr.write(`Translated batch ${index + 1}/${batches.length}\n`);
    return result;
  });
  generated = Object.assign({}, ...translatedBatches);
}

const nextCatalog = Object.fromEntries(
  sortedSources.map((source) => [
    source,
    (productOverrides[source] ?? generated[source] ?? existing[source] ?? source.replaceAll("Paperclip", "Zworker"))
      .replace(/Зворкер(?:а|у|ом|е)?/gi, "Zworker"),
  ]),
);

const serializedCatalog = `${JSON.stringify(nextCatalog, null, 2)}\n`;
const existingSerializedCatalog = `${JSON.stringify(existing, null, 2)}\n`;
if (checkOnly) {
  if (serializedCatalog !== existingSerializedCatalog) {
    process.stderr.write("Russian UI catalog is stale. Run `pnpm i18n:ru:generate`.\n");
    process.exitCode = 1;
  }
} else {
  await writeFile(catalogPath, serializedCatalog, "utf8");
}
process.stderr.write(
  `${checkOnly ? "Checked" : "Wrote"} ${Object.keys(nextCatalog).length} Russian UI entries at ${path.relative(repoRoot, catalogPath)}` +
    `${shouldTranslate ? "" : " (run with --translate to fill new English fallbacks)"}.\n`,
);
