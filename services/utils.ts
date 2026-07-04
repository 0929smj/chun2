import { SUNDAYS_2026 } from './mockData';

export const getClosestSunday = (): string => {
  const today = new Date();
  // Since the app is built for 2026, we might want to simulate 'today' relative to 2026
  // Or if we are actually in 2025/2026, find the closest one in the list.
  
  // Find the date in SUNDAYS_2026 that is closest to today (ignoring year if needed, or mapping strictly)
  // For this specific app context (2026 target), let's find the Sunday closest to 'now' but mapped to 2026 dates
  // if we are testing.
  
  // Simple logic: Find the Sunday in the list closest to current system date.
  // If system date is far from 2026, default to the first or last valid Sunday to avoid empty screens?
  // User asked: "If today is Jan 25, Jan 25 should appear". Jan 25, 2026 is a Sunday.
  
  const now = new Date();
  
  // Construct a date in 2026 with same month/day as today to find closest match in list
  // Note: This is a heuristic for the requested behavior in a demo app context
  const targetDate = new Date(2026, now.getMonth(), now.getDate());
  
  let closestDate = SUNDAYS_2026[0];
  let minDiff = Infinity;

  SUNDAYS_2026.forEach(dateStr => {
    const d = new Date(dateStr);
    const diff = Math.abs(d.getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestDate = dateStr;
    }
  });

  return closestDate;
};

export function hasActualPrayerContent(text: string | null | undefined): boolean {
  if (!text) return false;
  // Remove numbers, whitespace, dots, brackets, newlines and common formatting chars
  const cleaned = text.replace(/[\s\d.,;:\-\[\]\(\)\/\\*~!@#$%^&_+=]+/g, '');
  return cleaned.length > 0;
}

export interface ParsedPrayerLine {
  marker?: string;
  text: string;
}

export function parsePrayerRequests(text: string | null | undefined): ParsedPrayerLine[] {
  if (!text) return [];
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      return { text: '' };
    }
    const match = line.match(/^(\s*)([0-9]+[\.\)]|[\*\-\•])\s*(.*)$/);
    if (match) {
      return {
        marker: match[2],
        text: match[3]
      };
    }
    return {
      text: line
    };
  });
}

