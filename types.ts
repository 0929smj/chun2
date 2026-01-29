export enum AttendanceType {
  Worship = '예배',
  Gathering = '집회',
  Wool = '울모임'
}

export interface Member {
  id: string;
  name: string;
  group: string; // 소그룹/울 (Combined concept)
  wool: string; // Kept for internal structure if needed, but treated same as group in UI
  phoneNumber?: string; // 연락처
  role?: string; // 직분 (e.g. 성도, 집사, etc.)
  status?: string; // 상태 (e.g. ACTIVE)
  specialNotes?: string;
  latestPrayerRequest?: string; 
}

export interface PrayerRecord {
  id: string;
  memberId: string;
  date: string; // YYYY-MM-DD
  content: string;
  note?: string; // Date-specific special note from attendance sheet
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  date: string; // YYYY-MM-DD
  types: AttendanceType[]; // A member can attend multiple types on one day
}

// New interface to track if a meeting was canceled/not held
export interface MeetingStatus {
  date: string;
  type: AttendanceType;
  isCanceled: boolean;
}

export interface JoinedRecord extends Member {
  attendanceDate?: string;
  attendanceTypes?: AttendanceType[];
}

export interface WeeklyStats {
  date: string;
  worshipCount: number;
  gatheringCount: number;
  woolCount: number;
}

export interface GroupStats {
  groupName: string;
  totalWorship: number;
  totalGathering: number;
  totalWool: number;
  members: number;
}