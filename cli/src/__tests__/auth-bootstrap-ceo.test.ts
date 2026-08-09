import { afterEach, describe, expect, it } from "vitest";
import { resolveBootstrapDeploymentMode } from "../commands/auth-bootstrap-ceo.js";

describe("bootstrap CEO deployment mode", () => {
  const originalDeploymentMode = process.env.PAPERCLIP_DEPLOYMENT_MODE;

  afterEach(() => {
    if (originalDeploymentMode === undefined) {
      delete process.env.PAPERCLIP_DEPLOYMENT_MODE;
    } else {
      process.env.PAPERCLIP_DEPLOYMENT_MODE = originalDeploymentMode;
    }
  });

  it("supports environment-only authenticated self-host deployments", () => {
    process.env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";

    expect(resolveBootstrapDeploymentMode(null)).toBe("authenticated");
  });

  it("falls back to config when the environment does not specify a valid mode", () => {
    process.env.PAPERCLIP_DEPLOYMENT_MODE = "unsupported";

    expect(
      resolveBootstrapDeploymentMode({
        server: { deploymentMode: "local_trusted" },
      } as NonNullable<Parameters<typeof resolveBootstrapDeploymentMode>[0]>),
    ).toBe("local_trusted");
  });
});
