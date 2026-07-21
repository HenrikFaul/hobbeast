import { describe, it, expect } from "vitest";
import { validatePassword, isPasswordValid } from "@/lib/passwordValidation";

describe("validatePassword", () => {
  it("flags each rule independently", () => {
    expect(validatePassword("")).toEqual({
      minLength: false,
      hasLower: false,
      hasUpper: false,
      hasNumber: false,
      hasSpecial: false,
    });
    expect(validatePassword("abcdefgh")).toMatchObject({
      minLength: true,
      hasLower: true,
      hasUpper: false,
    });
    expect(validatePassword("Abcdefg1!")).toEqual({
      minLength: true,
      hasLower: true,
      hasUpper: true,
      hasNumber: true,
      hasSpecial: true,
    });
  });

  it("isPasswordValid requires every check", () => {
    expect(isPasswordValid("Abcdefg1!")).toBe(true);
    expect(isPasswordValid("Abcdefg1")).toBe(false);
    expect(isPasswordValid("short1!A")).toBe(true);
    expect(isPasswordValid("short")).toBe(false);
  });
});
