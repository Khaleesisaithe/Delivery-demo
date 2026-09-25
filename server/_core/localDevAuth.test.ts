import { describe, expect, it } from "vitest";
import { createLocalDevUser, isLocalDevAuthEnabled } from "./localDevAuth";

describe("local VS Code auth", () => {
  it("is disabled unless both development mode and the explicit flag are set", () => {
    expect(isLocalDevAuthEnabled({ NODE_ENV: "production", LOCAL_DEV_AUTH: "true" })).toBe(false);
    expect(isLocalDevAuthEnabled({ NODE_ENV: "development", LOCAL_DEV_AUTH: "false" })).toBe(false);
    expect(isLocalDevAuthEnabled({ NODE_ENV: "development", LOCAL_DEV_AUTH: "true" })).toBe(true);
  });

  it("defaults to owner/admin and accepts staff or customer testing roles", () => {
    expect(createLocalDevUser({ LOCAL_DEV_ROLE: "admin" }).role).toBe("admin");
    expect(createLocalDevUser({ LOCAL_DEV_ROLE: "staff" }).role).toBe("staff");
    expect(createLocalDevUser({ LOCAL_DEV_ROLE: "user" }).role).toBe("user");
    expect(createLocalDevUser({ LOCAL_DEV_ROLE: "anything-else" }).role).toBe("admin");
  });
});
