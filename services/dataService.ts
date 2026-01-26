import { AttendanceRecord, Member, WeeklyStats, AttendanceType, GroupStats } from '../types';

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

export const getAttendanceStatusByMember = (member: Member, records: AttendanceRecord[]): Record<string, AttendanceType[]> => {
  const memberRecords = records.filter(r => r.memberId === member.id);
  const status: Record<string, AttendanceType[]> = {};
  memberRecords.forEach(r => {
    status[r.date] = r.types;
  });
  return status;
};