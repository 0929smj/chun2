import { AttendanceType, Member, AttendanceRecord, PrayerRecord, MeetingStatus } from '../types';

// Treating these as the unified "Small Group/Wool" names
const GROUPS = ['사랑A', '사랑B', '소망A', '소망B', '믿음A', '믿음B', '화평A'];
const NAMES = ['김철수', '이영희', '박지성', '최동원', '정우성', '한지민', '강동원', '송혜교', '유재석', '강호동'];

// Helper to generate Sundays
export const getSundays = (year: number) => {
  const sundays: string[] = [];
  const date = new Date(year, 0, 1);
  
  // Find the first Sunday
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }

  // Loop through the year
  while (date.getFullYear() === year) {
    // Manually format YYYY-MM-DD to avoid UTC timezone shifts causing "Saturday" issues
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    sundays.push(`${y}-${m}-${d}`);
    
    date.setDate(date.getDate() + 7);
  }
  return sundays;
};

export const SUNDAYS_2026 = getSundays(2026);

// Generate Members with Mxxxx IDs
export const generateMembers = (): Member[] => {
  const members: Member[] = [];
  let idCounter = 1000;

  GROUPS.forEach(group => {
    // 3-5 members per group
    const memberCount = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < memberCount; i++) {
      const name = NAMES[Math.floor(Math.random() * NAMES.length)] + (i + 1);
      members.push({
        id: `M${idCounter}`,
        name: name,
        group: group,
        wool: group,
        phoneNumber: `010-${Math.floor(Math.random()*9000)+1000}-${Math.floor(Math.random()*9000)+1000}`,
        role: '성도',
        status: 'ACTIVE',
        specialNotes: Math.random() > 0.8 ? '최근 이사함' : '',
      });
      idCounter++;
    }
  });
  return members;
};

// Generate Meeting Status (Simulate some canceled meetings)
export const generateMeetingStatus = (): MeetingStatus[] => {
  const statuses: MeetingStatus[] = [];
  // Example: No Wool meeting on the first Sunday
  if (SUNDAYS_2026.length > 0) {
    statuses.push({
      date: SUNDAYS_2026[0],
      type: AttendanceType.Wool,
      isCanceled: true
    });
  }
  // Example: No Gathering on the 4th Sunday
  if (SUNDAYS_2026.length > 3) {
    statuses.push({
      date: SUNDAYS_2026[3],
      type: AttendanceType.Gathering,
      isCanceled: true
    });
  }
  // Example: No Wool on the 5th Sunday
  if (SUNDAYS_2026.length > 4) {
    statuses.push({
      date: SUNDAYS_2026[4],
      type: AttendanceType.Wool,
      isCanceled: true
    });
  }
  return statuses;
};

export const INITIAL_MEETING_STATUS = generateMeetingStatus();

// Generate Attendance
export const generateAttendance = (members: Member[], year: number): AttendanceRecord[] => {
  const records: AttendanceRecord[] = [];
  const sundays = SUNDAYS_2026;
  let idCounter = 1;

  sundays.forEach(date => {
    members.forEach(member => {
      // Random attendance
      const types: AttendanceType[] = [];
      
      // Check if meeting is canceled before adding attendance
      const isWorshipCanceled = INITIAL_MEETING_STATUS.some(s => s.date === date && s.type === AttendanceType.Worship && s.isCanceled);
      const isGatheringCanceled = INITIAL_MEETING_STATUS.some(s => s.date === date && s.type === AttendanceType.Gathering && s.isCanceled);
      const isWoolCanceled = INITIAL_MEETING_STATUS.some(s => s.date === date && s.type === AttendanceType.Wool && s.isCanceled);

      if (!isWorshipCanceled && Math.random() > 0.2) types.push(AttendanceType.Worship);
      if (!isGatheringCanceled && Math.random() > 0.4) types.push(AttendanceType.Gathering);
      if (!isWoolCanceled && Math.random() > 0.3) types.push(AttendanceType.Wool);

      if (types.length > 0) {
        records.push({
          id: `a-${idCounter}`,
          memberId: member.id,
          date: date,
          types: types
        });
        idCounter++;
      }
    });
  });

  return records;
};

// Generate Prayer Records
export const generatePrayerRecords = (members: Member[]): PrayerRecord[] => {
  const records: PrayerRecord[] = [];
  let idCounter = 1;
  
  // Generate distinct requests for random sundays
  SUNDAYS_2026.forEach((date, idx) => {
    // Only generate for past/current dates (simulated by index < 10 for demo)
    if (idx < 10) { 
      members.forEach(member => {
        if (Math.random() > 0.7) { // 30% chance to have a prayer request that week
           const requests = [
             "가족의 건강을 위해 기도해주세요.",
             "이번 주 중요한 시험이 있습니다.",
             "직장 동료와의 관계 회복을 위해.",
             "새로운 사업 구상이 잘 진행되길.",
             "영적인 회복과 평안을 위해.",
             "부모님의 수술이 잘 되길.",
             "자녀의 학업 진로를 위해.",
             "전도 대상자가 마음을 열도록."
           ];
           records.push({
             id: `p-${idCounter++}`,
             memberId: member.id,
             date: date,
             content: requests[Math.floor(Math.random() * requests.length)]
           });
        }
      });
    }
  });
  return records;
};

export const INITIAL_MEMBERS = generateMembers();
export const INITIAL_ATTENDANCE = generateAttendance(INITIAL_MEMBERS, 2026);
export const INITIAL_PRAYER_RECORDS = generatePrayerRecords(INITIAL_MEMBERS);