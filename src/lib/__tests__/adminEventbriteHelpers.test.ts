import { describe, it, expect } from "vitest";
import {
  enrichMapperRow,
  formatDbCell,
  matchesColumnFilters,
} from "@/features/external-events/admin/databaseDomain";

describe("adminEventbriteHelpers", () => {
  describe("formatDbCell", () => {
    it("renders empty-ish values as em-dash", () => {
      expect(formatDbCell(null)).toBe("—");
      expect(formatDbCell(undefined)).toBe("—");
      expect(formatDbCell("")).toBe("—");
    });
    it("joins arrays and stringifies objects", () => {
      expect(formatDbCell(["a", "b"])).toBe("a, b");
      expect(formatDbCell({ x: 1 })).toBe('{"x":1}');
    });
    it("localizes booleans to Hungarian", () => {
      expect(formatDbCell(true)).toBe("igen");
      expect(formatDbCell(false)).toBe("nem");
    });
    it("stringifies primitives", () => {
      expect(formatDbCell(42)).toBe("42");
      expect(formatDbCell("Budapest")).toBe("Budapest");
    });
  });

  describe("matchesColumnFilters", () => {
    const row = { name: "Central Café", city: "Budapest", tags: ["coffee", "wifi"] };
    it("returns true when all filters are empty", () => {
      expect(matchesColumnFilters(row, { name: "", city: "" })).toBe(true);
    });
    it("performs case-insensitive substring match", () => {
      expect(matchesColumnFilters(row, { name: "central" })).toBe(true);
      expect(matchesColumnFilters(row, { name: "CENTRAL" })).toBe(true);
    });
    it("matches formatted array values", () => {
      expect(matchesColumnFilters(row, { tags: "coffee" })).toBe(true);
      expect(matchesColumnFilters(row, { tags: "beer" })).toBe(false);
    });
    it("requires every non-empty filter to match", () => {
      expect(matchesColumnFilters(row, { name: "central", city: "vienna" })).toBe(false);
      expect(matchesColumnFilters(row, { name: "central", city: "budapest" })).toBe(true);
    });
  });

  describe("enrichMapperRow", () => {
    it("adds catalog + translation columns without dropping the original row", () => {
      const row = { id: 1, name: "Test Cafe", categories: ["catering.cafe"] };
      const enriched = enrichMapperRow(row) as Record<string, unknown>;
      expect(enriched.id).toBe(1);
      expect(enriched.name).toBe("Test Cafe");
      expect(typeof enriched.categories_en).toBe("string");
      expect(typeof enriched.categories_hu).toBe("string");
      expect(typeof enriched.local_catalog_path_hu).toBe("string");
      expect(typeof enriched.local_catalog_slug).toBe("string");
      expect(typeof enriched.translation_source).toBe("string");
    });
    it("accepts a comma-separated categories string", () => {
      const enriched = enrichMapperRow({ categories: "sport.fitness, leisure.park" }) as Record<
        string,
        unknown
      >;
      expect(String(enriched.categories_en)).toContain("sport");
    });
    it("falls back gracefully when categories are missing", () => {
      const enriched = enrichMapperRow({ id: 5 }) as Record<string, unknown>;
      expect(enriched.categories_en).toBe("—");
      expect(enriched.translation_source).toBe("no confident match");
    });
  });
});
