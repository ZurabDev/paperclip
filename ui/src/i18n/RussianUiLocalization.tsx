import { useLayoutEffect } from "react";
import russianUiMessages from "./ru-ui.json";
import { i18n } from "./index";

const messages = russianUiMessages as Record<string, string>;
const runtimeOverrides: Record<string, string> = {
  "· updated": "· обновлено",
  "backend files changed since this server booted": "файлы сервера изменились после запуска",
  "Command Palette": "Палитра команд",
  "Search for a command to run...": "Найдите команду для запуска…",
  "environment lease acquired": "среда выполнения выделена",
  "just now": "только что",
  Zworker: "Zworker",
};
const translatedAttributes = ["alt", "aria-label", "placeholder", "title"] as const;
const skippedSelector = [
  "[data-no-localize]",
  "[contenteditable='true']",
  "code",
  "pre",
  "script",
  "style",
  "textarea",
  ".xterm",
].join(",");

export const ZWORKER_UI_LOCALE =
  import.meta.env.VITE_ZWORKER_LOCALE ?? (import.meta.env.MODE === "test" ? "en" : "ru");

function preserveOuterWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

export function translateRussianUiText(source: string) {
  const trimmed = source.trim();
  if (!trimmed) return source;

  let translated = runtimeOverrides[trimmed] ?? messages[trimmed];
  if (!translated) {
    const rules: Array<[RegExp, (...values: string[]) => string]> = [
      [/^(\d+) live$/, (count) => `${count} активных`],
      [/^for (\d+) seconds?$/, (seconds) => `${seconds} сек.`],
      [/^· called (\d+) tools?$/, (count) => `· вызвано инструментов: ${count}`],
      [/^(\d+) running, (\d+) paused, (\d+) errors?$/, (running, paused, errors) => `${running} выполняется, ${paused} приостановлено, ${errors} с ошибкой`],
      [/^(\d+) open, (\d+) blocked$/, (open, blocked) => `${open} открыто, ${blocked} заблокировано`],
      [/^(\d+) blockers? need attention$/, (count) => `требуют внимания: ${count}`],
      [/^(\d+)m ago$/, (count) => `${count} мин. назад`],
      [/^(\d+)h ago$/, (count) => `${count} ч. назад`],
      [/^(\d+)d ago$/, (count) => `${count} дн. назад`],
      [/^(\d+)mo ago$/, (count) => `${count} мес. назад`],
      [/^\+(\d+) more$/, (count) => `+ ещё ${count}`],
      [/^· updated (.+)$/, (when) => `· обновлено ${translateRussianUiText(when)}`],
      [/^Open (.+) company switcher$/, (company) => `Открыть переключатель компании ${company}`],
      [/^backend files changed since this server booted · updated (.+)$/, (when) => `файлы сервера изменились после запуска · обновлено ${translateRussianUiText(when)}`],
    ];
    for (const [pattern, render] of rules) {
      const match = trimmed.match(pattern);
      if (!match) continue;
      translated = render(...match.slice(1));
      break;
    }
  }
  if (!translated && trimmed.includes(" • ")) {
    translated = trimmed
      .split(" • ")
      .map((part) => translateRussianUiText(part).trim())
      .join(" • ");
  }
  translated ??= trimmed.replaceAll("Paperclip", "Zworker");
  if (translated === trimmed) return source;
  return preserveOuterWhitespace(source, translated);
}

function isSkipped(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest(skippedSelector) !== null;
}

function localizeElement(element: Element) {
  if (element.matches(skippedSelector) || element.closest(skippedSelector)) return;
  for (const attribute of translatedAttributes) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const translated = translateRussianUiText(value);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

function localizeTree(root: Node) {
  if (isSkipped(root)) return;

  if (root.nodeType === Node.TEXT_NODE) {
    const value = root.nodeValue;
    if (!value) return;
    const translated = translateRussianUiText(value);
    if (translated !== value) root.nodeValue = translated;
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) localizeElement(root as Element);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) localizeElement(current as Element);
    else if (!isSkipped(current) && current.nodeValue) {
      const translated = translateRussianUiText(current.nodeValue);
      if (translated !== current.nodeValue) current.nodeValue = translated;
    }
    current = walker.nextNode();
  }
}

/**
 * CNT's Zworker fork is Russian-first while upstream finishes converting every
 * React call site to explicit i18next keys. This bridge localizes the complete
 * rendered operator surface from the checked-in catalog and leaves user-authored
 * markdown, code, terminals, and editable content untouched.
 */
export function RussianUiLocalization() {
  useLayoutEffect(() => {
    if (ZWORKER_UI_LOCALE !== "ru") return;

    document.documentElement.lang = "ru";
    void i18n.changeLanguage("ru");
    localizeTree(document.documentElement);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeTree(mutation.target);
        else for (const node of mutation.addedNodes) localizeTree(node);
      }
    });
    observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
