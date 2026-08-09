import pc from "picocolors";

const ZWORKER_ART = [
  "█████  █   █   ███   ████   █  █  █████  ████ ",
  "   █   █   █  █   █  █   █  █ █   █      █   █",
  "  █    █ █ █  █   █  ████   ██    ████   ████ ",
  " █     ██ ██  █   █  █ █    █ █   █      █ █  ",
  "█████  █   █   ███   █  ██  █  █  █████  █  ██",
] as const;

const TAGLINE = "Платформа управления ИИ-агентами для работы";

export function printZworkerCliBanner(): void {
  const lines = [
    "",
    ...ZWORKER_ART.map((line) => pc.cyan(line)),
    pc.blue("  ───────────────────────────────────────────────────────"),
    pc.bold(pc.white(`  ${TAGLINE}`)),
    "",
  ];

  console.log(lines.join("\n"));
}
