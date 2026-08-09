import { describe, expect, it } from "vitest";
import { translateRussianUiText, ZWORKER_UI_LOCALE } from "./RussianUiLocalization";

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
});
