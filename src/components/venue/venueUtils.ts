/** Haversine distance in km */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DAY_NAMES_HU: Record<string, number> = {
  hétfő: 1, kedd: 2, szerda: 3, csütörtök: 4, péntek: 5, szombat: 6, vasárnap: 0,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
  mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 0,
};

/**
 * Best-effort check if a venue is open right now based on opening_hours_text.
 * Returns true if we can't determine (benefit of the doubt).
 */
export function isLikelyOpenNow(hoursText: string[] | null): boolean {
  if (!hoursText || hoursText.length === 0) return true; // unknown → show

  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const line of hoursText) {
    const lower = line.toLowerCase().trim();

    // Find which day this line is about
    let lineDay: number | null = null;
    for (const [name, dayNum] of Object.entries(DAY_NAMES_HU)) {
      if (lower.startsWith(name)) {
        lineDay = dayNum;
        break;
      }
    }
    if (lineDay === null || lineDay !== currentDay) continue;

    // Extract time ranges like "09:00-18:00" or "9:00 - 22:00"
    const timeRanges = lower.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g);
    if (!timeRanges) {
      if (lower.includes('zárva') || lower.includes('closed')) return false;
      continue;
    }

    for (const range of timeRanges) {
      const parts = range.split(/[-–]/).map(s => s.trim());
      if (parts.length !== 2) continue;
      const [startStr, endStr] = parts;
      const [sh, sm] = startStr.split(':').map(Number);
      const [eh, em] = endStr.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (currentMinutes >= startMin && currentMinutes <= endMin) return true;
    }
    return false; // Found today's line but not in any range
  }

  return true; // Couldn't find today → show
}
