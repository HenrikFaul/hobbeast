import { describe, expect, it } from "vitest";
import { selectHeroVariant } from "@/lib/heroMedia";

describe("selectHeroVariant", () => {
  it("uses season-aware daylight windows", () => {
    expect(selectHeroVariant(new Date(2026, 0, 15, 17), 0.8)).toBe("night");
    expect(selectHeroVariant(new Date(2026, 6, 15, 20), 0.8)).toBe("day");
    expect(selectHeroVariant(new Date(2026, 9, 15, 18), 0.8)).toBe("night");
  });

  it("keeps a small editorial variation without requiring a carousel", () => {
    expect(selectHeroVariant(new Date(2026, 6, 15, 12), 0.1)).toBe("night");
    expect(selectHeroVariant(new Date(2026, 0, 15, 22), 0.1)).toBe("day");
  });
});
