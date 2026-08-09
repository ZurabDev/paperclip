import nodemailer from "nodemailer";
import { Resend } from "resend";

export type InviteEmailProvider = "none" | "smtp" | "resend";

export type CompanyInviteEmailInput = {
  to: string;
  inviterName: string | null;
  companyName: string;
  inviteUrl: string;
  expiresAt: Date;
  idempotencyKey?: string;
};

export type CompanyInviteEmailResult = {
  provider: Exclude<InviteEmailProvider, "none">;
  messageId: string | null;
};

export interface CompanyInviteEmailService {
  sendCompanyInvite(input: CompanyInviteEmailInput): Promise<CompanyInviteEmailResult>;
}

type EmailEnvironment = NodeJS.ProcessEnv | Record<string, string | undefined>;

type EmailConfig =
  | { provider: "none" }
  | {
      provider: "smtp";
      from: string;
      host: string;
      port: number;
      secure: boolean;
      requireTls: boolean;
      rejectUnauthorized: boolean;
      servername?: string;
      username?: string;
      password?: string;
    }
  | {
      provider: "resend";
      from: string;
      apiKey: string;
    };

type ResendClient = {
  emails: {
    send(
      payload: {
        from: string;
        to: string[];
        subject: string;
        html: string;
        text: string;
      },
      options?: { idempotencyKey?: string },
    ): Promise<{
      data: { id: string } | null;
      error: { message?: string; name?: string } | null;
    }>;
  };
};

export class InviteEmailConfigurationError extends Error {}

function firstValue(env: EmailEnvironment, ...keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function booleanValue(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

function positivePort(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new InviteEmailConfigurationError(`Invalid SMTP port: ${value}`);
  }
  return port;
}

export function resolveInviteEmailConfig(env: EmailEnvironment = process.env): EmailConfig {
  const explicitProvider = firstValue(env, "PAPERCLIP_EMAIL_PROVIDER")?.toLowerCase();
  if (explicitProvider && !["none", "smtp", "resend"].includes(explicitProvider)) {
    throw new InviteEmailConfigurationError(
      `Unsupported PAPERCLIP_EMAIL_PROVIDER: ${explicitProvider}`,
    );
  }

  const smtpHost = firstValue(env, "PAPERCLIP_SMTP_HOST", "SMTP_HOST");
  const resendApiKey = firstValue(env, "PAPERCLIP_RESEND_API_KEY", "RESEND_API_KEY");
  const provider = (explicitProvider ?? (smtpHost ? "smtp" : resendApiKey ? "resend" : "none")) as InviteEmailProvider;
  if (provider === "none") return { provider };

  if (provider === "smtp") {
    if (!smtpHost) {
      throw new InviteEmailConfigurationError("SMTP email delivery requires PAPERCLIP_SMTP_HOST");
    }
    const port = positivePort(firstValue(env, "PAPERCLIP_SMTP_PORT", "SMTP_PORT"), 587);
    const from = firstValue(
      env,
      "PAPERCLIP_EMAIL_FROM",
      "PAPERCLIP_SMTP_FROM_EMAIL",
      "SMTP_FROM_EMAIL",
    );
    if (!from) {
      throw new InviteEmailConfigurationError("SMTP email delivery requires PAPERCLIP_EMAIL_FROM");
    }
    const username = firstValue(env, "PAPERCLIP_SMTP_USERNAME", "SMTP_USERNAME");
    const password = firstValue(env, "PAPERCLIP_SMTP_PASSWORD", "SMTP_PASSWORD");
    if (Boolean(username) !== Boolean(password)) {
      throw new InviteEmailConfigurationError(
        "SMTP username and password must either both be configured or both be omitted",
      );
    }
    const secure = booleanValue(
      firstValue(env, "PAPERCLIP_SMTP_SECURE"),
      port === 465,
    );
    return {
      provider,
      from,
      host: smtpHost,
      port,
      secure,
      requireTls: booleanValue(firstValue(env, "PAPERCLIP_SMTP_REQUIRE_TLS"), !secure),
      rejectUnauthorized: !booleanValue(
        firstValue(env, "PAPERCLIP_SMTP_TLS_INSECURE", "SMTP_TLS_INSECURE"),
        false,
      ),
      servername: firstValue(env, "PAPERCLIP_SMTP_SERVERNAME", "SMTP_SERVERNAME"),
      username,
      password,
    };
  }

  const from = firstValue(env, "PAPERCLIP_EMAIL_FROM", "RESEND_FROM_EMAIL");
  if (!resendApiKey || !from) {
    throw new InviteEmailConfigurationError(
      "Resend email delivery requires PAPERCLIP_RESEND_API_KEY and PAPERCLIP_EMAIL_FROM",
    );
  }
  return {
    provider,
    from,
    apiKey: resendApiKey,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function renderCompanyInviteEmail(input: CompanyInviteEmailInput) {
  const companyName = cleanHeaderValue(input.companyName) || "вашу компанию";
  const inviterName = cleanHeaderValue(input.inviterName ?? "Администратор Zworker");
  const subject = `Вас пригласили присоединиться к ${companyName} в Zworker`;
  const expiry = input.expiresAt.toISOString();
  const text = [
    `${inviterName} приглашает вас присоединиться к ${companyName} в Zworker.`,
    "",
    `Принять приглашение: ${input.inviteUrl}`,
    "",
    `Одноразовое приглашение действует до ${expiry}.`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#18181b;line-height:1.5">
  <h1 style="font-size:20px">Присоединяйтесь к ${escapeHtml(companyName)} в Zworker</h1>
  <p>${escapeHtml(inviterName)} приглашает вас присоединиться к <strong>${escapeHtml(companyName)}</strong>.</p>
  <p><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Принять приглашение</a></p>
  <p style="color:#71717a;font-size:13px">Одноразовое приглашение действует до ${escapeHtml(expiry)}.</p>
</body></html>`;
  return { subject, text, html };
}

export function createCompanyInviteEmailService(
  env: EmailEnvironment = process.env,
  deps: { resendClient?: ResendClient } = {},
): CompanyInviteEmailService {
  const config = resolveInviteEmailConfig(env);
  if (config.provider === "none") {
    return {
      async sendCompanyInvite() {
        throw new InviteEmailConfigurationError(
          "Email delivery is not configured on this Zworker instance",
        );
      },
    };
  }

  if (config.provider === "smtp") {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      auth: config.username
        ? { user: config.username, pass: config.password! }
        : undefined,
      tls: {
        rejectUnauthorized: config.rejectUnauthorized,
        servername: config.servername,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return {
      async sendCompanyInvite(input) {
        const rendered = renderCompanyInviteEmail(input);
        const result = await transporter.sendMail({
          from: config.from,
          to: input.to,
          ...rendered,
        });
        return { provider: "smtp", messageId: result.messageId || null };
      },
    };
  }

  const resend = deps.resendClient ?? (new Resend(config.apiKey) as ResendClient);
  return {
    async sendCompanyInvite(input) {
      const rendered = renderCompanyInviteEmail(input);
      const { data, error } = await resend.emails.send(
        {
          from: config.from,
          to: [input.to],
          ...rendered,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      if (error) {
        throw new Error(`Resend rejected the invitation email: ${error.message ?? error.name}`);
      }
      return {
        provider: "resend",
        messageId: data?.id ?? null,
      };
    },
  };
}
