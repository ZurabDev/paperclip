import { describe, expect, it, vi } from "vitest";
import {
  createCompanyInviteEmailService,
  InviteEmailConfigurationError,
  renderCompanyInviteEmail,
  resolveInviteEmailConfig,
} from "../services/company-invite-email.js";

describe("company invite email", () => {
  it("auto-selects SMTP and validates paired credentials", () => {
    expect(resolveInviteEmailConfig({
      SMTP_HOST: "mail.example.test",
      SMTP_PORT: "465",
      SMTP_FROM_EMAIL: "Paperclip <noreply@example.test>",
      SMTP_USERNAME: "mailer",
      SMTP_PASSWORD: "secret",
    })).toMatchObject({
      provider: "smtp",
      host: "mail.example.test",
      port: 465,
      secure: true,
      username: "mailer",
    });

    expect(() => resolveInviteEmailConfig({
      PAPERCLIP_EMAIL_PROVIDER: "smtp",
      PAPERCLIP_SMTP_HOST: "mail.example.test",
      PAPERCLIP_EMAIL_FROM: "noreply@example.test",
      PAPERCLIP_SMTP_USERNAME: "mailer",
    })).toThrow(InviteEmailConfigurationError);
  });

  it("escapes HTML and strips header newlines", () => {
    const rendered = renderCompanyInviteEmail({
      to: "invitee@example.test",
      inviterName: "Alice\r\nBcc: bad@example.test",
      companyName: "Acme <Robotics>",
      inviteUrl: "https://paperclip.example/invite/a&b",
      expiresAt: new Date("2027-03-10T00:00:00.000Z"),
    });

    expect(rendered.subject).not.toContain("\n");
    expect(rendered.html).toContain("Acme &lt;Robotics&gt;");
    expect(rendered.html).toContain("a&amp;b");
    expect(rendered.text).toContain("https://paperclip.example/invite/a&b");
  });

  it("sends through Resend with the rendered invitation", async () => {
    const send = vi.fn(async () => ({ data: { id: "mail-1" }, error: null }));
    const service = createCompanyInviteEmailService({
      PAPERCLIP_EMAIL_PROVIDER: "resend",
      PAPERCLIP_RESEND_API_KEY: "re_test",
      PAPERCLIP_EMAIL_FROM: "Paperclip <noreply@example.test>",
    }, { resendClient: { emails: { send } } });

    await expect(service.sendCompanyInvite({
      to: "invitee@example.test",
      inviterName: "Alice",
      companyName: "Acme",
      inviteUrl: "https://paperclip.example/invite/token",
      expiresAt: new Date("2027-03-10T00:00:00.000Z"),
      idempotencyKey: "paperclip-invite-invite-1",
    })).resolves.toEqual({ provider: "resend", messageId: "mail-1" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["invitee@example.test"],
        subject: "You're invited to join Acme on Paperclip",
      }),
      { idempotencyKey: "paperclip-invite-invite-1" },
    );
  });
});
