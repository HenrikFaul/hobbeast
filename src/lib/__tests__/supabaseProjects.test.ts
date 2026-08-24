import { describe, it, expect } from "vitest";
import {
  extractProjectRef,
  classifyProjectRef,
  assertTargetProject,
  TARGET_SUPABASE_PROJECT_REF,
} from "@/lib/supabaseProjects";

describe("supabaseProjects", () => {
  describe("extractProjectRef", () => {
    it("pulls the ref out of a supabase.co URL", () => {
      expect(extractProjectRef("https://bqdvqmpwccsxumzijspj.supabase.co")).toBe(
        "bqdvqmpwccsxumzijspj",
      );
      expect(extractProjectRef("https://olzvughcoqnfkdpvbwjy.supabase.co/rest/v1")).toBe(
        "olzvughcoqnfkdpvbwjy",
      );
    });

    it("returns null for non-supabase hosts or invalid URLs", () => {
      expect(extractProjectRef("https://example.com")).toBeNull();
      expect(extractProjectRef("not-a-url")).toBeNull();
      expect(extractProjectRef(null)).toBeNull();
      expect(extractProjectRef(undefined)).toBeNull();
    });
  });

  describe("classifyProjectRef", () => {
    it("recognizes the target and lovable-cloud refs", () => {
      expect(classifyProjectRef("bqdvqmpwccsxumzijspj")).toBe("target");
      expect(classifyProjectRef("olzvughcoqnfkdpvbwjy")).toBe("lovableCloud");
    });
    it("returns 'unknown' otherwise", () => {
      expect(classifyProjectRef("abcdef")).toBe("unknown");
      expect(classifyProjectRef(null)).toBe("unknown");
    });
  });

  describe("assertTargetProject", () => {
    it("passes when the URL is the target", () => {
      const r = assertTargetProject(`https://${TARGET_SUPABASE_PROJECT_REF}.supabase.co`);
      expect(r.ok).toBe(true);
      expect(r.role).toBe("target");
      expect(r.ref).toBe(TARGET_SUPABASE_PROJECT_REF);
    });

    it("flags the Lovable Cloud project with a specific message", () => {
      const r = assertTargetProject("https://olzvughcoqnfkdpvbwjy.supabase.co");
      expect(r.ok).toBe(false);
      expect(r.role).toBe("lovableCloud");
      expect(r.message).toMatch(/Lovable Cloud/);
    });

    it("flags unknown projects generically", () => {
      const r = assertTargetProject("https://random.supabase.co");
      expect(r.ok).toBe(false);
      expect(r.role).toBe("unknown");
      expect(r.message).toMatch(/unknown/i);
    });

    it("never returns the URL in the message", () => {
      const r = assertTargetProject("https://olzvughcoqnfkdpvbwjy.supabase.co");
      expect(r.message).not.toContain("https://");
    });
  });
});
