import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logActivityMock = vi.fn();

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    accessService: () => ({
      isInstanceAdmin: vi.fn(),
      canUser: vi.fn(),
      hasPermission: vi.fn(),
    }),
    agentService: () => ({
      getById: vi.fn(),
    }),
    boardAuthService: () => ({
      createChallenge: vi.fn(),
      resolveBoardAccess: vi.fn(),
      assertCurrentBoardKey: vi.fn(),
      revokeBoardApiKey: vi.fn(),
    }),
    deduplicateAgentName: vi.fn(),
    logActivity: (...args: unknown[]) => logActivityMock(...args),
    notifyHireApproved: vi.fn(),
  }));
}

function createDbStub() {
  const updatedValues: unknown[] = [];
  const createdInvite = {
    id: "invite-1",
    companyId: "company-1",
    inviteType: "company_join",
    allowedJoinTypes: "human",
    tokenHash: "hash",
    defaultsPayload: { humanRole: "viewer" },
    expiresAt: new Date("2027-03-10T00:00:00.000Z"),
    invitedByUserId: null,
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date("2026-03-07T00:00:00.000Z"),
    updatedAt: new Date("2026-03-07T00:00:00.000Z"),
  };

  return {
    insert() {
      return {
        values() {
          return {
            returning() {
              return Promise.resolve([createdInvite]);
            },
          };
        },
      };
    },
    select(_shape?: unknown) {
      return {
        from() {
          const query = {
            leftJoin() {
              return query;
            },
            where() {
              return Promise.resolve([{
                name: "Acme Robotics",
                brandColor: "#114488",
                logoAssetId: "logo-1",
              }]);
            },
          };
          return query;
        },
      };
    },
    update() {
      return {
        set(values: unknown) {
          updatedValues.push(values);
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      };
    },
    updatedValues,
  };
}

async function createApp(options: {
  deploymentMode?: "local_trusted" | "authenticated";
  inviteEmailService?: { sendCompanyInvite: ReturnType<typeof vi.fn> };
} = {}) {
  const [{ accessRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/access.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      source: "local_implicit",
      userId: null,
      companyIds: ["company-1"],
    };
    next();
  });
  app.use(
    "/api",
    accessRoutes(createDbStub() as any, {
      deploymentMode: options.deploymentMode ?? "local_trusted",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
      inviteEmailService: options.inviteEmailService,
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("POST /companies/:companyId/invites", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../services/index.js");
    vi.doUnmock("../routes/access.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    logActivityMock.mockReset();
  });

  it("returns an absolute invite URL using the request base URL", async () => {
    const app = await createApp();

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .set("host", "paperclip.example")
      .set("x-forwarded-proto", "https")
      .send({
        allowedJoinTypes: "human",
        humanRole: "viewer",
      });

    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe("Acme Robotics");
    expect(res.body.invitePath).toMatch(/^\/invite\/pcp_invite_/);
    expect(res.body.inviteUrl).toMatch(/^https:\/\/paperclip\.example\/invite\/pcp_invite_/);
  });

  it("delivers a targeted invitation before reporting success", async () => {
    const sendCompanyInvite = vi.fn().mockResolvedValue({
      provider: "smtp",
      messageId: "message-1",
    });
    const app = await createApp({
      deploymentMode: "authenticated",
      inviteEmailService: { sendCompanyInvite },
    });

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .set("host", "paperclip.example")
      .set("x-forwarded-proto", "https")
      .send({
        allowedJoinTypes: "human",
        inviteeEmail: "Invitee@Example.com ",
        humanRole: "viewer",
      });

    expect(res.status).toBe(201);
    expect(res.body.inviteeEmail).toBe("invitee@example.com");
    expect(res.body.emailProvider).toBe("smtp");
    expect(res.body.emailDeliveredAt).toBeTruthy();
    expect(res.body.emailMessageId).toBe("message-1");
    expect(sendCompanyInvite).toHaveBeenCalledWith(expect.objectContaining({
      to: "invitee@example.com",
      companyName: "Acme Robotics",
      inviteUrl: expect.stringMatching(/^https:\/\/paperclip\.example\/invite\/pcp_invite_/),
    }));
  });

  it("requires an email for human invitations in authenticated deployments", async () => {
    const app = await createApp({ deploymentMode: "authenticated" });
    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", humanRole: "viewer" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("inviteeEmail is required for human invitations");
  });

  it("revokes the token when email delivery fails", async () => {
    const sendCompanyInvite = vi.fn().mockRejectedValue(new Error("SMTP unavailable"));
    const app = await createApp({
      deploymentMode: "authenticated",
      inviteEmailService: { sendCompanyInvite },
    });
    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({
        allowedJoinTypes: "human",
        inviteeEmail: "invitee@example.com",
        humanRole: "viewer",
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("invite was revoked");
  });
});
