// Deterministic, template-driven greeting seeded as an agent-authored comment on
// the onboarding first task. No LLM call: it reflects back the onboarding context
// (team name + goals) so the user lands on a waiting greeting instead of a
// right-aligned "user" bubble showing the agent's own seeded instructions.

export const ONBOARDING_GREETING_AUTHORIZATION_REASON = "onboarding first-task greeting";

export function buildOnboardingGreeting(input: {
  teamName?: string | null;
  goals?: string | null;
}): string {
  const teamName = input.teamName?.trim();
  const goals = input.goals?.replace(/\s+/g, " ").trim();

  const lines: string[] = [];
  lines.push(
    teamName
      ? `Welcome — I'm your Paperclip agent for ${teamName}.`
      : "Welcome — I'm your Paperclip agent.",
  );

  if (goals) {
    lines.push("");
    lines.push("Here's what I understand you're aiming for:");
    lines.push("");
    lines.push(`> ${goals}`);
  }

  lines.push("");
  lines.push(
    "My job is to propose, not decide — I'll lay out options and a plan, and you make the calls.",
  );
  lines.push("");
  lines.push(
    "Give me a moment: I'm putting together a few focused questions so we can settle on one concrete goal to tackle first.",
  );

  return lines.join("\n");
}
