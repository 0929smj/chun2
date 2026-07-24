import { SUNDAYS_2026 } from './mockData';

export const getClosestSunday = (): string => {
  const now = new Date();
  // Target date mapped to 2026 calendar at end of day
  const targetDate = new Date(2026, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  // Find all Sundays in 2026 on or before targetDate
  const pastSundays = SUNDAYS_2026.filter(dateStr => {
    const d = new Date(dateStr);
    return d <= targetDate;
  });

  if (pastSundays.length > 0) {
    return pastSundays[pastSundays.length - 1];
  }

  return SUNDAYS_2026[0];
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

