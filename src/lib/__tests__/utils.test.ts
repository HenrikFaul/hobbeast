import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and dedupes tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "hidden", undefined, "font-bold"))
      .toBe("text-sm font-bold");
    expect(cn(["flex", "items-center"], { "gap-2": true, "gap-4": false }))
      .toBe("flex items-center gap-2");
  });
});
