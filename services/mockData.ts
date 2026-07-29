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

  GROUPS.forEach((group, idx) => {
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
        MemberRegistration: idx === 0 && i === 0 ? '2026-03-01' : (idx === 1 && i === 1 ? '2026-04-12' : ''),
        specialNotes: Math.random() > 0.8 ? '최근 이사함' : '',
      });
      idCounter++;
    }
  });
  return members;
};

// Generate Meeting Status (Simulate some canceled meetings and Events)
export const generateMeetingStatus = (): MeetingStatus[] => {
  const statuses: MeetingStatus[] = [];
  
  SUNDAYS_2026.forEach((date, idx) => {
    let eventName = '';
    
    // Cancellation Flags
    let wCanceled = false; // Worship
    let gCanceled = false; // Gathering
    let lCanceled = false; // Wool (Small Group)

    // Specific Logic based on User Request
    if (idx === 0) { // 01-04
       eventName = '울 미편성';
       wCanceled = true;
       gCanceled = true;
       lCanceled = true;
    }
    else if (idx === 6) { // 02-15
       eventName = '설연휴';
       gCanceled = true; 
       lCanceled = true;
       // Worship exists
    }
    else if (idx === 12) { // 03-29
       eventName = '봄 수련회';
       gCanceled = true; 
       lCanceled = true;
       // Worship exists
    }
    else if (idx === 14) eventName = '부활절';
    else if (idx === 26) eventName = '전교인수련회';
    else if (idx === 48) eventName = '성탄절';

    // 1. Wool
    statuses.push({
      date: date,
      type: AttendanceType.Wool,
      isCanceled: lCanceled,
      event: eventName
    });

    // 2. Gathering
    statuses.push({
      date: date,
      type: AttendanceType.Gathering,
      isCanceled: gCanceled,
      event: eventName
    });
    
    // 3. Worship
    statuses.push({
      date: date,
      type: AttendanceType.Worship,
      isCanceled: wCanceled,
      event: eventName,
      manualAssemblyCount: undefined // Mock headcount between 40-60
    });
  });

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
      const wStatus = INITIAL_MEETING_STATUS.find(s => s.date === date && s.type === AttendanceType.Worship);
      const gStatus = INITIAL_MEETING_STATUS.find(s => s.date === date && s.type === AttendanceType.Gathering);
      const lStatus = INITIAL_MEETING_STATUS.find(s => s.date === date && s.type === AttendanceType.Wool);
      
      const isWorshipCanceled = wStatus?.isCanceled;
      const isGatheringCanceled = gStatus?.isCanceled;
      const isWoolCanceled = lStatus?.isCanceled;

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