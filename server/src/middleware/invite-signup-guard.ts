import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { invites } from "@paperclipai/db";

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteOnlySignUpGuard(
  db: Db,
  options: { enabled: boolean },
): RequestHandler {
  return async (req, res, next) => {
    if (!options.enabled) {
      next();
      return;
    }

    const token = req.header("x-paperclip-invite-token")?.trim() ?? "";
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!token || !email) {
      res.status(403).json({
        code: "INVITE_REQUIRED",
        message: "Account creation requires an active invitation",
      });
      return;
    }

    const invite = await db
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.tokenHash, hashInviteToken(token)),
          eq(invites.inviteeEmail, email),
          inArray(invites.allowedJoinTypes, ["human", "both"]),
          isNull(invites.revokedAt),
          isNull(invites.acceptedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!invite) {
      res.status(403).json({
        code: "INVITE_REQUIRED",
        message: "Account creation requires an active invitation for this email",
      });
      return;
    }
    next();
  };
}
