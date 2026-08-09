// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZworkerLoading } from "./ZworkerLogo";

describe("ZworkerLoading", () => {
  it("renders an accessible full-page branded loading state", () => {
    const html = renderToStaticMarkup(<ZworkerLoading />);

    expect(html).toContain('role="status"');
    expect(html).toContain("min-h-dvh");
    expect(html).toContain('src="/zworker-logo.png"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<span class="sr-only">Загрузка…</span>');
  });

  it("allows containing layouts to override the full-page height", () => {
    const html = renderToStaticMarkup(<ZworkerLoading className="min-h-0" />);

    expect(html).toContain("min-h-0");
    expect(html).not.toContain("min-h-dvh");
  });
});
