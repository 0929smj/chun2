import { AttendanceRecord, Member, WeeklyStats, AttendanceType, GroupStats, MonthlyStats } from '../types';

export const getWeeklyStats = (records: AttendanceRecord[], dates: string[]): WeeklyStats[] => {
  return dates.map(date => {
    const dailyRecords = records.filter(r => r.date === date);
    return {
      date,
      worshipCount: dailyRecords.filter(r => r.types.includes(AttendanceType.Worship)).length,
      gatheringCount: dailyRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length,
      woolCount: dailyRecords.filter(r => r.types.includes(AttendanceType.Wool)).length,
    };
  });
};

export const getMonthlyStats = (records: AttendanceRecord[], dates: string[]): MonthlyStats[] => {
  const stats: MonthlyStats[] = [];
  
  for (let i = 1; i <= 12; i++) {
    const monthName = `${i}월`;
    
    // Get sundays in this month using string manipulation (YYYY-MM-DD) to avoid timezone issues
    const sundaysInMonth = dates.filter(date => {
      const m = parseInt(date.substring(5, 7), 10);
      return m === i;
    });

    if (sundaysInMonth.length === 0) {
      stats.push({ month: monthName, worshipAverage: 0, gatheringAverage: 0, woolAverage: 0 });
      continue;
    }

    let sumWorship = 0;
    let sumGathering = 0;
    let sumWool = 0;

    sundaysInMonth.forEach(date => {
       const dailyRecords = records.filter(r => r.date === date);
       sumWorship += dailyRecords.filter(r => r.types.includes(AttendanceType.Worship)).length;
       sumGathering += dailyRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length;
       sumWool += dailyRecords.filter(r => r.types.includes(AttendanceType.Wool)).length;
    });

    stats.push({
      month: monthName,
      worshipAverage: parseFloat((sumWorship / sundaysInMonth.length).toFixed(1)),
      gatheringAverage: parseFloat((sumGathering / sundaysInMonth.length).toFixed(1)),
      woolAverage: parseFloat((sumWool / sundaysInMonth.length).toFixed(1))
    });
  }
  
  return stats;
};

export const getGroupStats = (members: Member[], records: AttendanceRecord[]): GroupStats[] => {
  const groups = Array.from(new Set(members.map(m => m.group)));
  
  return groups.map(group => {
    const groupMemberIds = members.filter(m => m.group === group).map(m => m.id);
    const groupRecords = records.filter(r => groupMemberIds.includes(r.memberId));
    
    return {
      groupName: group,
      members: groupMemberIds.length,
      totalWorship: groupRecords.filter(r => r.types.includes(AttendanceType.Worship)).length,
      totalGathering: groupRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length,
      totalWool: groupRecords.filter(r => r.types.includes(AttendanceType.Wool)).length,
    };
  });
};

export const getWeeklyGroupStats = (members: Member[], records: AttendanceRecord[], dates: string[]) => {
  const groups = Array.from(new Set(members.map(m => m.group))).filter(Boolean);
  
  return groups.map(group => {
    const groupMemberIds = members.filter(m => m.group === group).map(m => m.id);
    const groupRecords = records.filter(r => groupMemberIds.includes(r.memberId));
    
    const weeklyData = dates.map(date => {
      const dailyRecords = groupRecords.filter(r => r.date === date);
      return {
        date,
        worshipCount: dailyRecords.filter(r => r.types.includes(AttendanceType.Worship)).length,
        gatheringCount: dailyRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length,
        woolCount: dailyRecords.filter(r => r.types.includes(AttendanceType.Wool)).length,
      };
    });
    
    return {
      groupName: group,
      weeklyData
    };
  });
};

export const getAttendanceStatusByMember = (member: Member, records: AttendanceRecord[]): Record<string, AttendanceType[]> => {
  const memberRecords = records.filter(r => r.memberId === member.id);
  const status: Record<string, AttendanceType[]> = {};
  memberRecords.forEach(r => {
    status[r.date] = r.types;
  });
  return status;
};