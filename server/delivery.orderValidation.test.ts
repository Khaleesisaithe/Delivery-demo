import { describe, expect, it } from "vitest";
import { isFullName, isValidBrazilianCep } from "./delivery/orderValidation";

describe("Brazilian checkout identity and postal-code validation", () => {
  it("requires a first and second name", () => {
    expect(isFullName("Ana Silva")).toBe(true);
    expect(isFullName("  Ana   da Silva ")).toBe(true);
    expect(isFullName("Ana")).toBe(false);
    expect(isFullName("A B")).toBe(false);
  });

  it("accepts eight CEP digits with or without a hyphen", () => {
    expect(isValidBrazilianCep("01001-000")).toBe(true);
    expect(isValidBrazilianCep("01001000")).toBe(true);
    expect(isValidBrazilianCep("0100A-000")).toBe(false);
    expect(isValidBrazilianCep("0100100")).toBe(false);
  });
});
