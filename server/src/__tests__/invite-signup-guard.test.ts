import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { inviteOnlySignUpGuard } from "../middleware/invite-signup-guard.js";

function appWithRows(rows: unknown[], enabled = true) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => Promise.resolve(rows)),
  };
  const db = { select: vi.fn(() => query) };
  const app = express();
  app.use(express.json());
  app.post(
    "/api/auth/sign-up/email",
    inviteOnlySignUpGuard(db as never, { enabled }),
    (_req, res) => res.status(200).json({ created: true }),
  );
  return { app, db };
}

describe("invite-only sign-up guard", () => {
  it("blocks public sign-up when invite-only mode is enabled", async () => {
    const { app, db } = appWithRows([]);
    const response = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email: "person@example.com", password: "long-enough" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("INVITE_REQUIRED");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("allows sign-up only after a matching active invite is found", async () => {
    const { app, db } = appWithRows([{ id: "invite-1" }]);
    const response = await request(app)
      .post("/api/auth/sign-up/email")
      .set("x-paperclip-invite-token", "pcp_invite_secret")
      .send({ email: "Person@Example.com", password: "long-enough" });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(true);
    expect(db.select).toHaveBeenCalledOnce();
  });

  it("leaves normal sign-up unchanged when invite-only mode is disabled", async () => {
    const { app, db } = appWithRows([], false);
    const response = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email: "person@example.com", password: "long-enough" });

    expect(response.status).toBe(200);
    expect(db.select).not.toHaveBeenCalled();
  });
});
