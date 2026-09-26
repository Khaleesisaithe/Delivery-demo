import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("application password hashing", () => {
  it("stores a salted scrypt hash and verifies the matching password", async () => {
    const encoded = await hashPassword("correct-horse-battery-staple");
    expect(encoded).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(encoded).not.toContain("correct-horse");
    await expect(verifyPassword("correct-horse-battery-staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("incorrect-password", encoded)).resolves.toBe(false);
  });

  it("fails closed on malformed or unsupported hashes", async () => {
    await expect(verifyPassword("anything", "plaintext-password")).resolves.toBe(false);
    await expect(verifyPassword("anything", "scrypt$1$1$1$YQ$Yg")).resolves.toBe(false);
  });
});
