import { describe, expect, it } from "vitest";
import { buildOnboardingGreeting } from "./onboarding-greeting.js";

describe("buildOnboardingGreeting", () => {
  it("reflects the team name and goals with a propose-not-decide line and questions-coming", () => {
    const greeting = buildOnboardingGreeting({
      teamName: "Acme",
      goals: "Launch a marketplace for local makers.",
    });

    expect(greeting).toContain("Welcome — I'm your Paperclip agent for Acme.");
    expect(greeting).toContain("Here's what I understand you're aiming for:");
    expect(greeting).toContain("> Launch a marketplace for local makers.");
    expect(greeting).toContain("propose, not decide");
    expect(greeting).toContain("few focused questions");
  });

  it("collapses whitespace in the reflected goals", () => {
    const greeting = buildOnboardingGreeting({
      teamName: "Acme",
      goals: "  Build\n\n  a  SaaS product.  ",
    });

    expect(greeting).toContain("> Build a SaaS product.");
  });

  it("omits the reflect-back block when no goals are provided", () => {
    const greeting = buildOnboardingGreeting({ teamName: "Acme", goals: null });

    expect(greeting).toContain("Welcome — I'm your Paperclip agent for Acme.");
    expect(greeting).not.toContain("aiming for");
    expect(greeting).toContain("propose, not decide");
  });

  it("falls back to a generic welcome when the team name is missing", () => {
    const greeting = buildOnboardingGreeting({ teamName: null, goals: null });

    expect(greeting).toContain("Welcome — I'm your Paperclip agent.");
    expect(greeting).not.toContain("for null");
  });
});
