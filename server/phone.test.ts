import { describe, expect, it } from "vitest";
import { isSupportedBrazilPhone, normalizeBrazilPhone } from "./phone";

describe("Brazilian phone normalization", () => {
  it("adds the country code to valid local numbers", () => {
    expect(normalizeBrazilPhone("(11) 99999-1234")).toBe("5511999991234");
    expect(normalizeBrazilPhone("11 3333-1234")).toBe("551133331234");
    expect(normalizeBrazilPhone("+55 (11) 99999-1234")).toBe("5511999991234");
  });
  it("rejects incomplete or unsupported numbers", () => {
    expect(isSupportedBrazilPhone("9999-1234")).toBe(false);
    expect(() => normalizeBrazilPhone("123")).toThrow(RangeError);
  });
});
