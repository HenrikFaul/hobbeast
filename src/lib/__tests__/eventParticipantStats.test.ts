import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const inMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (...args: unknown[]) => {
        selectMock(...args);
        return { in: (...a: unknown[]) => inMock(...a) };
      },
    }),
  },
}));

import { getParticipantStatsMap } from "@/lib/eventParticipantStats";

describe("getParticipantStatsMap", () => {
  beforeEach(() => {
    selectMock.mockReset();
    inMock.mockReset();
  });

  it("returns an empty map when no ids are provided", async () => {
    const result = await getParticipantStatsMap([]);
    expect(result.size).toBe(0);
    expect(inMock).not.toHaveBeenCalled();
  });

  it("aggregates statuses into per-event totals", async () => {
    inMock.mockResolvedValueOnce({
      data: [
        { event_id: "a", status: "going" },
        { event_id: "a", status: "going" },
        { event_id: "a", status: "waitlist" },
        { event_id: "b", status: "checked_in" },
        { event_id: "b", status: "cancelled" },
        { event_id: "b", status: "no_show" },
      ],
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
      total: 3,
      going: 0,
      waitlist: 0,
      checkedIn: 1,
      cancelled: 2,
    });
  });

  it("returns zeroed entries when the query errors out", async () => {
    inMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
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
