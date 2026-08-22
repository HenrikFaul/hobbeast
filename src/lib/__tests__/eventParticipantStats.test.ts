import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { getParticipantStatsMap } from "@/lib/eventParticipantStats";

describe("getParticipantStatsMap", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns an empty map when no ids are provided", async () => {
    const result = await getParticipantStatsMap([]);
    expect(result.size).toBe(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("aggregates statuses into per-event totals", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { counts: [
        { event_id: "a", total: 3, going: 2, waitlist: 1, checked_in: 0, completed: 0, cancelled: 0 },
        { event_id: "b", total: 1, going: 0, waitlist: 0, checked_in: 0, completed: 1, cancelled: 2 },
      ] },
      error: null,
    });

    const result = await getParticipantStatsMap(["a", "b", "a"]);
    expect(result.get("a")).toEqual({
      total: 3,
      going: 2,
      waitlist: 1,
      checkedIn: 0,
      cancelled: 0,
    });
    expect(result.get("b")).toEqual({
      total: 1,
      going: 0,
      waitlist: 0,
      checkedIn: 1,
      cancelled: 2,
    });
  });

  it("returns zeroed entries when the query errors out", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const result = await getParticipantStatsMap(["x"]);
    expect(result.get("x")).toEqual({
      total: 0,
      going: 0,
      waitlist: 0,
      checkedIn: 0,
      cancelled: 0,
    });
  });
});
