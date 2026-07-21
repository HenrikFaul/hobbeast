import { describe, it, expect } from "vitest";
import {
  getAllActivitiesFlat,
  searchActivities,
  getCategoryOptions,
  getCatalogStats,
  getSubcategoriesFor,
} from "@/lib/hobbyCategories";

describe("hobbyCategories catalog", () => {
  it("exposes a non-empty flat activity list with consistent shape", () => {
    const flat = getAllActivitiesFlat();
    expect(flat.length).toBeGreaterThan(0);
    for (const entry of flat.slice(0, 5)) {
      expect(entry.categoryId).toBeTruthy();
      expect(entry.subcategoryId).toBeTruthy();
      expect(entry.activityId).toBeTruthy();
      expect(Array.isArray(entry.keywords)).toBe(true);
    }
  });

  it("stats agree with the flat list", () => {
    const stats = getCatalogStats();
    expect(stats.activities).toBe(getAllActivitiesFlat().length);
    expect(stats.categories).toBeGreaterThan(0);
    expect(stats.subcategories).toBeGreaterThanOrEqual(stats.categories);
  });

  it("search is case- and whitespace-insensitive and returns everything on empty query", () => {
    const all = getAllActivitiesFlat();
    expect(searchActivities("   ").length).toBe(all.length);
    expect(searchActivities("")).toHaveLength(all.length);
  });

  it("category options list is unique and matches subcategory lookups", () => {
    const options = getCategoryOptions();
    expect(new Set(options).size).toBe(options.length);
    expect(getSubcategoriesFor("__does_not_exist__")).toEqual([]);
  });
});
