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
  "environment lease released": "среда выполнения освобождена",
  "issue productivity review created": "создана задача проверки продуктивности",
  "commented on": "прокомментировал задачу",
  "All Time": "За всё время",
  agent: "агент",
  agents: "агенты",
  "Checkbox confirmations": "Подтверждения с флажками",
  Confirmations: "Подтверждения",
  created: "создано",
  error: "ошибка",
  failed: "с ошибкой",
  idle: "ожидает работу",
  in: "в",
  "Item verdicts": "Решения по элементам",
  "just now": "только что",
  "Last 7 Days": "Последние 7 дней",
  "Last 30 Days": "Последние 30 дней",
  "Month to Date": "С начала месяца",
  "No monthly cap configured": "Месячный лимит не задан",
  "Older than a day": "Старше одного дня",
  "Older than a week": "Старше одной недели",
  live: "активные",
  blocked: "заблокированы",
  errors: "ошибки",
  open: "открыты",
  paused: "приостановлены",
  pending: "ожидает",
  planned: "запланирован",
  project: "проект",
  running: "выполняются",
  routine: "сценарий",
  routines: "сценарии",
  skills: "навыки",
  task: "задача",
  Terminal: "Терминал",
  "To Do": "К выполнению",
  "Queued...": "В очереди...",
  "Suggested tasks": "Предложенные задачи",
  updated: "обновлено",
  usage: "использование",
  "Year to Date": "С начала года",
  "Refunds, offsets, and credit returns": "Возвраты, корректировки и погашение кредитов",
  "Debit minus credit for the selected period": "Списания за вычетом возвратов за выбранный период",
  "Estimated debits that are not yet invoice-authoritative": "Оценочные списания, ещё не подтверждённые счётом",
  "No finance events yet. Add account-level charges once biller invoices or credits land.": "Финансовых событий пока нет. Добавьте расходы аккаунта после получения счёта или возврата от плательщика.",
  "No active routines. Use Create routine to define the first recurring workflow.": "Активных сценариев нет. Нажмите «Создать сценарий», чтобы настроить первый повторяющийся процесс.",
  "issue cross issue influence observed": "обнаружено влияние между задачами",
  "changed status from in progress to done on": "изменил статус задачи с «В работе» на «Готово»",
  Zworker: "Zworker",
};
const translatedAttributes = ["alt", "aria-description", "aria-label", "aria-placeholder", "placeholder", "title"] as const;
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
const skippedAttributeSelector = [
  "[data-no-localize]",
  "code",
  "pre",
  "script",
  "style",
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
      [/^called (\d+) tools?$/, (count) => `вызвано инструментов: ${count}`],
      [/^Blocked · (\d+) blockers? need attention$/, (count) => `Заблокировано · блокировок требуют внимания: ${count}`],
      [/^(\d+) more active\/recent runs?$/, (count) => `Ещё активных или недавних запусков: ${count}`],
      [/^updated (.+)$/, (when) => `обновлено ${translateRussianUiText(when)}`],
      [/^Updated (.+)$/, (when) => `Обновлено ${translateRussianUiText(when)}`],
      [/^(\d+) running, (\d+) paused, (\d+) errors?$/, (running, paused, errors) => `${running} выполняется, ${paused} приостановлено, ${errors} с ошибкой`],
      [/^(\d+) open, (\d+) blocked$/, (open, blocked) => `${open} открыто, ${blocked} заблокировано`],
      [/^(\d+) blockers? need attention$/, (count) => `требуют внимания: ${count}`],
      [/^(\d+)m ago$/, (count) => `${count} мин. назад`],
      [/^(\d+)h ago$/, (count) => `${count} ч. назад`],
      [/^(\d+)d ago$/, (count) => `${count} дн. назад`],
      [/^(\d+)w ago$/, (count) => `${count} нед. назад`],
      [/^(\d+)mo ago$/, (count) => `${count} мес. назад`],
      [/^(\d+) artifacts?$/, (count) => `артефактов: ${count}`],
      [/^View ([A-Z]+-\d+)$/, (identifier) => `Открыть ${identifier}`],
      [/^(\d+(?:\.\d+)?[KMB]?) tokens across request-scoped events$/, (count) => `${count} токенов в событиях отдельных запросов`],
      [/^(\$[\d.,]+) debits · (\$[\d.,]+) credits$/, (debits, credits) => `списания: ${debits} · возвраты: ${credits}`],
      [/^(\$[\d.,]+) estimated in range$/, (amount) => `оценка за период: ${amount}`],
      [/^(\d+) total events? in range$/, (count) => `событий за период: ${count}`],
      [/^(\d+) subscriptions?$/, (count) => `подписок: ${count}`],
      [/^(\d+) subscription runs?$/, (count) => `запусков по подписке: ${count}`],
      [/^for (\d+) minutes?$/, (minutes) => `${minutes} мин.`],
      [/^for (\d+) hours?$/, (hours) => `${hours} ч.`],
      [/^(.+) created ([A-Z]+-\d+)$/, (actor, identifier) => `${actor} · создано ${identifier}`],
      [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(, \d{4})?$/, (month, day, year = "") => `${({ Jan: "янв.", Feb: "февр.", Mar: "мар.", Apr: "апр.", May: "мая", Jun: "июн.", Jul: "июл.", Aug: "авг.", Sep: "сент.", Oct: "окт.", Nov: "нояб.", Dec: "дек." } as Record<string, string>)[month]} ${day}${year}`],
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
  if (element.matches(skippedAttributeSelector) || element.closest(skippedAttributeSelector)) return;
  for (const attribute of translatedAttributes) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const translated = translateRussianUiText(value);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

export function localizeRussianUiTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (isSkipped(root)) return;
    const value = root.nodeValue;
    if (!value) return;
    const translated = translateRussianUiText(value);
    if (translated !== value) root.nodeValue = translated;
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) localizeElement(root as Element);
  if (isSkipped(root)) return;

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
    localizeRussianUiTree(document.documentElement);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeRussianUiTree(mutation.target);
        else if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
          localizeElement(mutation.target as Element);
        } else {
          for (const node of mutation.addedNodes) localizeRussianUiTree(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      attributeFilter: [...translatedAttributes],
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
