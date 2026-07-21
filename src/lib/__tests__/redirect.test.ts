import { describe, it, expect } from "vitest";
import { sanitizeRedirectPath } from "@/lib/redirect";

describe("sanitizeRedirectPath", () => {
  it("returns '/' for empty inputs", () => {
    expect(sanitizeRedirectPath(null)).toBe("/");
    expect(sanitizeRedirectPath(undefined)).toBe("/");
    expect(sanitizeRedirectPath("")).toBe("/");
  });

  it("passes safe internal paths through", () => {
    expect(sanitizeRedirectPath("/events")).toBe("/events");
    expect(sanitizeRedirectPath("/organizer?event=abc")).toBe("/organizer?event=abc");
    expect(sanitizeRedirectPath("/profile#tab=security")).toBe("/profile#tab=security");
  });

  it("blocks protocol-relative and absolute URLs", () => {
    expect(sanitizeRedirectPath("//evil.com")).toBe("/");
    expect(sanitizeRedirectPath("https://evil.com")).toBe("/");
    expect(sanitizeRedirectPath("http://evil.com/x")).toBe("/");
  });

  it("blocks javascript: and other schemes", () => {
    expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeRedirectPath(" javascript:alert(1)")).toBe("/");
    expect(sanitizeRedirectPath("data:text/html,<script>")).toBe("/");
  });

  it("blocks backslash tricks", () => {
    expect(sanitizeRedirectPath("/\\evil.com")).toBe("/");
  });

  it("rejects non-slash-prefixed paths", () => {
    expect(sanitizeRedirectPath("events")).toBe("/");
    expect(sanitizeRedirectPath("./events")).toBe("/");
  });

  it("returns '/' when the value is malformed URI", () => {
    expect(sanitizeRedirectPath("%E0%A4%A")).toBe("/");
  });

  it("decodes percent-encoded internal paths", () => {
    expect(sanitizeRedirectPath("%2Fevents%2F123")).toBe("/events/123");
  });

  it("blocks percent-encoded protocol-relative", () => {
    // decodeURIComponent turns %2F%2F into //
    expect(sanitizeRedirectPath("%2F%2Fevil.com")).toBe("/");
  });
});
