#!/usr/bin/env node

/**
 * Extract operator-facing English copy from the React UI and build the checked-in
 * Russian fallback catalog used by the CNT Zworker fork.
 *
 * Translation is intentionally a manual maintainer responsibility. This script
 * never calls a translation service: it extracts source copy, preserves reviewed
 * entries, applies the product vocabulary overrides below, and reports every new
 * English fallback that still needs a human-authored Russian translation.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const uiRoot = path.join(repoRoot, "ui", "src");
const catalogPath = path.join(uiRoot, "i18n", "ru-ui.json");
const checkOnly = process.argv.includes("--check");

const translatableAttributes = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
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
  "macOS (Finder)": "macOS (Finder)",
  "<empty>": "<пусто>",
  "<timestamp>": "<timestamp>",
  "Authorization: Bearer <token>": "Authorization: Bearer <token>",
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
  The: "Все",
};

const technicalSources = new Set([
  "API",
  "API ·",
  "(deny_missing_membership)",
  "(RESPONSIBLE_USER_UNAUTHORIZED)",
  "(RESPONSIBLE_USER_UNAVAILABLE)",
  "08 10px 20px)",
  "CloudAccessGate",
  "Codex",
  "Codex CLI",
  "CSS",
  "ctx (",
  "Dotta",
  "EnvInputsList",
  "Esc",
  "HTML",
  "HTTP",
  "JSON",
  "LG",
  "macOS",
  "Markdown",
  "MiB",
  "MiB.",
  "IssueChatUserMessage",
  "IssueReferencePill",
  'modelProfile: "cheap"',
  "originHash",
  "PDF",
  "SKILL.md",
  "SQL",
  "SSH",
  "XML",
  "zip)",
  "Zworker",
  "Zworker v",
]);

function isTechnicalSource(value) {
  if (technicalSources.has(value)) return true;
  if (/^<\/?[A-Z][A-Za-z0-9]*(?:\s+[^<>]*)?\s*\/?>$/.test(value)) return true;
  if (/^(?:[A-Z][A-Z0-9]*_){1,}[A-Z0-9]+$/.test(value)) return true;
  if (/^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/.test(value)) return true;
  if (/^(?:--|-\w+\s|\?|#|~\/|\.?\.\/)/.test(value)) return true;
  if (/^\{[\s\S]*\}$/.test(value) || /^\{\{[^}]+\}\}$/.test(value)) return true;
  if (/^(?:bash|cd|npm|npx|pnpm|yarn)\s/.test(value)) return true;
  if (/^(?:await|const|if|let|return|router\.)\b/.test(value)) return true;
  if (/(?:===|!==|=>)/.test(value)) return true;
  if (/^[A-Za-z_$][\w$]*\(/.test(value)) return true;
  if (/\b(?:req\.body|res\.status|var\(--|calc\(var\(|presentation\.kind)\b/.test(value)) return true;
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(value)) return true;
  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(value)) return true;
  if (/^\[\d{2}:\d{2}:\d{2}\]\s+(?:INFO|WARN|ERROR|SYS)\b/.test(value)) return true;
  if (/\{\{\s*[A-Za-z0-9_.]+\s*\}\}/.test(value)) return true;
  if (/\b(?:&&|\basync\s*\(|\.tsx?:?\b|\.md\b|\.json\b)/.test(value) && /[(){};`]/.test(value)) return true;
  if (/^(?:url\(#|(?:repeating-)?linear-gradient\(|color-mix\(|\)?\s*scale\()/.test(value)) return true;
  if (/^(?:\d+(?:\.\d+)?(?:px|rem|%)?[,)]|px\s+\d|\)\s+(?:constraints|shows)\b)/.test(value)) return true;

  const tokens = value.split(/\s+/);
  const tailwindTokens = tokens.filter((token) =>
    /^(?:(?:[a-z-]+):)*!?(?:-?[a-z]+(?:-[A-Za-z0-9_./%*:\[\]()-]+)+|absolute|block|flex|grid|hidden|inline|relative|uppercase)$/.test(
      token,
    ),
  );
  if (tokens.length >= 2 && tailwindTokens.length === tokens.length) return true;
  if (
    /^(?:bg|border|font|leading|line-clamp|max-[hw]|min-[hw]|p[trblxy]?|ring|rounded|shadow|space-[xy]|text|tracking|[wh])-[A-Za-z0-9_./%*\[\]():-]+$/.test(
      value,
    )
  ) {
    return true;
  }

  const utilityTokens = value.match(
    /(?:^|\s)(?:-?[a-z]+:)*(?:absolute|border|dark|duration|ease|flex|gap|grid|group|h|hover|inline|items|max|min|ml|mr|mx|no-underline|opacity|p|px|py|relative|rounded|shadow|shrink|sm|text|transition|w)(?:-|:|\s|$)/g,
  );
  return (utilityTokens?.length ?? 0) >= 2;
}

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

const htmlEntities = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  middot: "·",
  nbsp: "\u00a0",
  quot: '"',
  rdquo: "”",
  rarr: "→",
  rsaquo: "›",
  rsquo: "’",
  times: "×",
};

function decodeHtmlEntities(value) {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, name) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return htmlEntities[name.toLowerCase()] ?? entity;
  });
}

function normalizeCopy(value) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function isWithinJsx(node) {
  let current = node.parent;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parent) {
    if (ts.isJsxExpression(current) || ts.isJsxElement(current) || ts.isJsxFragment(current)) return true;
    if (ts.isCallExpression(current) || ts.isVariableStatement(current) || ts.isReturnStatement(current)) break;
  }
  return false;
}

function jsxAttributeAncestor(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) return propertyName(current.name, sourceFile);
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function isCopyBearingCallArgument(node) {
  const parent = node.parent;
  if (!ts.isCallExpression(parent) || !parent.arguments.includes(node)) return false;
  const callee = parent.expression.getText();
  return /(?:^|\.)(?:alert|confirm|prompt|setError|showToast|toast|notify|Error)$/.test(callee);
}

function isCopyBearingVariable(node, sourceFile) {
  let current = node.parent;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return /(?:^|_)(?:label|title|description|message|text|copy|hint|placeholder|tooltip|summary)$/i.test(
        current.name.text,
      ) || /(?:Label|Title|Description|Message|Text|Copy|Hint|Placeholder|Tooltip|Summary)$/.test(current.name.text);
    }
    if (ts.isVariableStatement(current) || ts.isStatement(current)) return false;
  }
  return false;
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
  if (isTechnicalSource(text)) return false;
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
    const normalized = normalizeCopy(raw);
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
      const jsxAttributeName = jsxAttributeAncestor(node, sourceFile);
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
const normalizedExisting = Object.fromEntries(
  Object.entries(existing).map(([source, translated]) => [
    normalizeCopy(source),
    decodeHtmlEntities(translated),
  ]),
);
const sortedSources = [...extracted].sort((left, right) => left.localeCompare(right, "en"));
const pending = sortedSources.filter(
  (source) =>
    !isTechnicalSource(source) &&
    !(source in productOverrides) &&
    (!(source in normalizedExisting) ||
      !normalizedExisting[source]?.trim() ||
      normalizedExisting[source] === source),
);

const nextCatalog = Object.fromEntries(
  sortedSources.map((source) => [
    source,
    (isTechnicalSource(source)
      ? source
      : productOverrides[source] ??
        normalizedExisting[source] ??
        source.replaceAll("Paperclip", "Zworker"))
      .replace(/Зворкер(?:а|у|ом|е)?/gi, "Zworker"),
  ]),
);

const serializedCatalog = `${JSON.stringify(nextCatalog, null, 2)}\n`;
const existingSerializedCatalog = `${JSON.stringify(existing, null, 2)}\n`;
const invalid = Object.entries(nextCatalog).filter(([, translated]) => !translated.trim());
const preservedTokenPatterns = [
  /`[^`]+`/g,
  /\{\{\s*[^}]+?\s*\}\}/g,
  /\$\{[^}]+\}/g,
  /\{[A-Za-z_][A-Za-z0-9_.-]*\}/g,
  /<\/?[A-Za-z_][A-Za-z0-9_.:/-]*>/g,
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g,
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g,
  /\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g,
  /\b[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+\b/g,
  /--[a-z][a-z0-9-]*(?:=[^\s,]+)?/g,
  /\b[A-Za-z0-9_.-]+\.(?:md|json|ya?ml|tsx?|jsx?|mjs|cjs|sh|py|css|html|csv|zip)\b/g,
  /https?:\/\/[^\s"'<>]+/g,
];
const technicalTokenExceptions = new Set(["<empty>"]);
const invalidTokens = [];
for (const [source, translated] of Object.entries(nextCatalog)) {
  if (technicalTokenExceptions.has(source)) continue;
  for (const pattern of preservedTokenPatterns) {
    const sourceTokens = source.match(pattern)?.sort() ?? [];
    const translatedTokens = translated.match(pattern)?.sort() ?? [];
    if (JSON.stringify(sourceTokens) !== JSON.stringify(translatedTokens)) {
      invalidTokens.push({ source, sourceTokens, translatedTokens });
      break;
    }
  }
}
if (checkOnly) {
  if (serializedCatalog !== existingSerializedCatalog) {
    process.stderr.write("Russian UI catalog is stale. Run `pnpm i18n:ru:generate`.\n");
    process.exitCode = 1;
  }
} else {
  await writeFile(catalogPath, serializedCatalog, "utf8");
}
if (invalid.length > 0) {
  process.stderr.write(`\n${invalid.length} entries have an empty Russian translation:\n`);
  for (const [source] of invalid) process.stderr.write(`- ${JSON.stringify(source)}\n`);
  process.exitCode = 1;
}
if (invalidTokens.length > 0) {
  process.stderr.write(`\n${invalidTokens.length} translations changed technical tokens:\n`);
  for (const { source, sourceTokens, translatedTokens } of invalidTokens) {
    process.stderr.write(
      `- ${JSON.stringify(source)}: expected ${JSON.stringify(sourceTokens)}, got ${JSON.stringify(translatedTokens)}\n`,
    );
  }
  process.exitCode = 1;
}
if (pending.length > 0) {
  process.stderr.write(`\n${pending.length} entries still need a manual Russian translation:\n`);
  for (const source of pending) process.stderr.write(`- ${JSON.stringify(source)}\n`);
  process.exitCode = 1;
}
process.stderr.write(
  `${checkOnly ? "Checked" : "Wrote"} ${Object.keys(nextCatalog).length} Russian UI entries at ${path.relative(repoRoot, catalogPath)}.\n`,
);
