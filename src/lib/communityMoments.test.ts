import { describe, expect, it } from "vitest";
import { selectCommunityMomentIndex } from "@/lib/communityMoments";

describe("selectCommunityMomentIndex", () => {
  it("maps the full random range to the available editorial moments", () => {
    expect(selectCommunityMomentIndex(0, 4)).toBe(0);
    expect(selectCommunityMomentIndex(0.26, 4)).toBe(1);
    expect(selectCommunityMomentIndex(0.74, 4)).toBe(2);
    expect(selectCommunityMomentIndex(0.9999, 4)).toBe(3);
  });

  it("fails closed for invalid values and empty collections", () => {
    expect(selectCommunityMomentIndex(Number.NaN, 4)).toBe(0);
    expect(selectCommunityMomentIndex(0.5, 0)).toBe(0);
    expect(selectCommunityMomentIndex(-1, 4)).toBe(0);
  });
});
