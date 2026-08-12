import { describe, expect, it } from "vitest";
import russianUiMessages from "./ru-ui.json";
// @vitest-environment jsdom

import {
  localizeRussianUiTree,
  translateRussianUiText,
  ZWORKER_UI_LOCALE,
} from "./RussianUiLocalization";

describe("RussianUiLocalization", () => {
  it("keeps the automated test locale in English", () => {
    expect(ZWORKER_UI_LOCALE).toBe("en");
  });

  it("uses the reviewed Russian product vocabulary", () => {
    expect(translateRussianUiText("Dashboard")).toBe("Панель управления");
    expect(translateRussianUiText("New Task")).toBe("Новая задача");
  });

  it("preserves layout whitespace around translated text nodes", () => {
    expect(translateRussianUiText("  Loading…\n")).toBe("  Загрузка…\n");
  });

  it("rebrands dynamic copy even when it has no catalog entry", () => {
    expect(translateRussianUiText("Paperclip build custom-7")).toBe("Zworker build custom-7");
  });

  it("localizes dynamic status and activity fragments", () => {
    expect(translateRussianUiText("called 2 tools")).toBe("вызвано инструментов: 2");
    expect(translateRussianUiText("Blocked · 3 blockers need attention")).toBe(
      "Заблокировано · блокировок требуют внимания: 3",
    );
    expect(translateRussianUiText("Queued...")).toBe("В очереди...");
    expect(translateRussianUiText("running")).toBe("выполняются");
    expect(translateRussianUiText("updated 4mo ago")).toBe("обновлено 4 мес. назад");
    expect(translateRussianUiText("4 artifacts")).toBe("артефактов: 4");
    expect(translateRussianUiText("1 blocker needs attention")).toBe("требуют внимания: 1");
    expect(translateRussianUiText("2 blockers need attention")).toBe("требуют внимания: 2");
  });

  it("localizes visible text and accessibility attributes", () => {
    const root = document.createElement("section");
    root.innerHTML = '<button aria-label="Switch to dark mode" title="Switch to light mode">Loading…</button>';

    localizeRussianUiTree(root);

    const button = root.querySelector("button")!;
    expect(button.textContent).toBe("Загрузка…");
    expect(button.getAttribute("aria-label")).toBe("Переключиться на тёмную тему");
    expect(button.getAttribute("title")).toBe("Переключиться на светлую тему");
  });

  it("localizes textarea placeholders without changing editable content", () => {
    const textarea = document.createElement("textarea");
    textarea.placeholder = "Search";
    textarea.value = "Dashboard";

    localizeRussianUiTree(textarea);

    expect(textarea.placeholder).toBe("Поиск");
    expect(textarea.value).toBe("Dashboard");
  });

  it("localizes copy split around dynamic JSX values", () => {
    const root = document.createElement("p");
    const count = document.createElement("strong");
    count.textContent = "3";
    root.append(
      "The ",
      count,
      " ",
      "routines",
      " in this folder won't be deleted. They'll move to Unfiled.",
    );

    localizeRussianUiTree(root);

    expect(root.textContent).toBe(
      "Все 3 сценарии в этой папке не будут удалены. Они переедут в «Неподшитое».",
    );
  });

  it("leaves explicitly excluded content and attributes untouched", () => {
    const root = document.createElement("section");
    root.setAttribute("data-no-localize", "");
    root.innerHTML = '<span title="New Task">Dashboard</span>';

    localizeRussianUiTree(root);

    expect(root.textContent).toBe("Dashboard");
    expect(root.querySelector("span")!.getAttribute("title")).toBe("New Task");
  });

  it("keeps the reviewed product vocabulary consistent", () => {
    const catalog = russianUiMessages as Record<string, string>;

    expect(catalog.Run).toBe("Запустить");
    expect(catalog.Running).toBe("Выполняется");
    expect(catalog.Issue).toBe("Задача");
    expect(catalog.Case).toBe("Кейс");
    expect(catalog.Pipelines).toBe("Процессы");
    expect(catalog.Routines).toBe("Сценарии");
    expect(catalog.Watchdog).toBe("Контролёр");
    expect(catalog.Assignee).toBe("Исполнитель");
    expect(catalog.Email).toBe("Электронная почта");
    expect(catalog["Create one"]).toBe("Создать аккаунт");
    expect(catalog["Switch to dark mode"]).toBe("Переключиться на тёмную тему");
    expect(catalog["Switch to light mode"]).toBe("Переключиться на светлую тему");
  });

  it("does not contain known machine-translation failures", () => {
    const values = Object.values(russianUiMessages as Record<string, string>);
    const forbidden = [
      "беги",
      "бухгалтерскую книгу",
      "детский труд",
      "дешевый профиль",
      "живые забеги",
      "кодекс",
      "конвейер",
      "правопреемник",
      "пробег",
      "сборник рассказов",
      "сердцебиение",
      "сторожевой таймер",
      "товар",
      "частоты вращения педалей",
      "уценка",
      "жетон",
    ];

    for (const fragment of forbidden) {
      expect(values.some((value) => value.toLocaleLowerCase("ru").includes(fragment))).toBe(false);
    }
  });

  it("preserves placeholders and technical identifiers", () => {
    const catalog = russianUiMessages as Record<string, string>;
    const tokenPatterns = [
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
    const mismatches: string[] = [];

    for (const [source, translated] of Object.entries(catalog)) {
      if (source === "<empty>") continue;
      for (const pattern of tokenPatterns) {
        const sourceTokens = source.match(pattern)?.sort() ?? [];
        const translatedTokens = translated.match(pattern)?.sort() ?? [];
        if (JSON.stringify(sourceTokens) !== JSON.stringify(translatedTokens)) {
          mismatches.push(
            `${source}: expected ${JSON.stringify(sourceTokens)}, got ${JSON.stringify(translatedTokens)}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("does not allow empty translations", () => {
    const emptySources = Object.entries(russianUiMessages as Record<string, string>)
      .filter(([, translated]) => !translated.trim())
      .map(([source]) => source);

    expect(emptySources).toEqual([]);
    expect((russianUiMessages as Record<string, string>)["<empty>"]).toBe("<пусто>");
  });
});
