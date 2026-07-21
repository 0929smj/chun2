import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Member, AttendanceRecord, AttendanceType, MeetingStatus } from '../types';
import { SUNDAYS_2026 } from '../services/mockData';
import { Check, Search, MessageSquare } from 'lucide-react';
import { sortAndFilterMembersByName, matchKoreanFuzzy } from '../services/searchAlgorithm';

const isNewFamily = (member?: Member | null) => {
  if (!member) return false;
  const regDate = member.MemberRegistration || (member as any).registrationDate;
  if (!regDate) return false;
  return String(regDate).trim().startsWith('2026');
};

interface AttendanceMatrixProps {
  members: Member[];
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
  availableGroups: string[];
  onToggleAttendance: (memberId: string, date: string, type: AttendanceType) => void;
  isVisitationMode?: boolean;
}

const AttendanceMatrix: React.FC<AttendanceMatrixProps> = ({ 
  members, 
  records, 
  meetingStatus, 
  availableGroups, 
  onToggleAttendance,
  isVisitationMode = false
}) => {
  const navigate = useNavigate();

  // Helper to load state from sessionStorage
  const loadSessionState = <T,>(key: string, defaultValue: T): T => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch (e) {
      console.warn("Failed to parse sessionStorage key:", key, e);
    }
    return defaultValue;
  };

  // Store selectedMonth as string to handle 'all'
  const [selectedMonth, setSelectedMonth] = useState<string>(() => loadSessionState<string>('attendance_selectedMonth', String(new Date().getMonth()))); 
  const [filterGroup, setFilterGroup] = useState<string>(() => loadSessionState<string>('attendance_filterGroup', 'all'));
  const [searchQuery, setSearchQuery] = useState<string>(() => loadSessionState<string>('attendance_searchQuery', ''));
  const [excludeZeroAttendance, setExcludeZeroAttendance] = useState<boolean>(() => loadSessionState<boolean>('attendance_excludeZeroAttendance', false));
  const [sortBy, setSortBy] = useState<'group' | 'attendance' | 'age'>(() => loadSessionState<'group' | 'attendance' | 'age'>('attendance_sortBy', 'group'));

  // Sync to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('attendance_selectedMonth', JSON.stringify(selectedMonth));
  }, [selectedMonth]);

  useEffect(() => {
    sessionStorage.setItem('attendance_filterGroup', JSON.stringify(filterGroup));
  }, [filterGroup]);

  useEffect(() => {
    sessionStorage.setItem('attendance_searchQuery', JSON.stringify(searchQuery));
  }, [searchQuery]);

  useEffect(() => {
    sessionStorage.setItem('attendance_excludeZeroAttendance', JSON.stringify(excludeZeroAttendance));
  }, [excludeZeroAttendance]);

  useEffect(() => {
    sessionStorage.setItem('attendance_sortBy', JSON.stringify(sortBy));
  }, [sortBy]);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Filter Sundays for the selected month or all year
  const currentMonthSundays = useMemo(() => {
    if (selectedMonth === 'all') {
      return SUNDAYS_2026;
    }
    const monthIndex = parseInt(selectedMonth, 10);
    return SUNDAYS_2026.filter(date => (parseInt(date.substring(5, 7), 10) - 1) === monthIndex);
  }, [selectedMonth]);

  // Filter Members
  // Filter Members
  const filteredMembers = useMemo(() => {
    let result = members;

    // Filter by Group
    if (filterGroup !== 'all') {
      result = result.filter(m => m.group === filterGroup);
    }

    // Filter by Search Query (utilizing Korean initial & 2-digit birth year match/sort)
    if (searchQuery.trim()) {
      result = result.filter(m => matchKoreanFuzzy(searchQuery, String(m.name || '')));
    }

    // Filter by Zero Attendance if active and inside visitation mode (Admin)
    if (isVisitationMode && excludeZeroAttendance) {
      result = result.filter(member => {
        const worshipCount = records.filter(r => r.memberId === member.id && currentMonthSundays.includes(r.date) && r.types.includes(AttendanceType.Worship)).length;
        const gatheringCount = records.filter(r => r.memberId === member.id && currentMonthSundays.includes(r.date) && r.types.includes(AttendanceType.Gathering)).length;
        const woolCount = records.filter(r => r.memberId === member.id && currentMonthSundays.includes(r.date) && r.types.includes(AttendanceType.Wool)).length;
        return (worshipCount + gatheringCount + woolCount) > 0;
      });
    }

    return result;
  }, [members, filterGroup, searchQuery, isVisitationMode, excludeZeroAttendance, records, currentMonthSundays]);

  // Helper to parse birth year from member name (e.g., "91홍길동" -> 1991, "01김철수" -> 2001)
  const parseBirthYear = (name: string): number | null => {
    const match = name.match(/^(\d{2})/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    return num >= 50 ? 1900 + num : 2000 + num;
  };

  // Map to store total attendance count for each member in the selected period (currentMonthSundays)
  const memberAttendanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    filteredMembers.forEach(m => {
      const worshipCount = records.filter(r => r.memberId === m.id && currentMonthSundays.includes(r.date) && r.types.includes(AttendanceType.Worship)).length;
      const gatheringCount = records.filter(r => r.memberId === m.id && currentMonthSundays.includes(r.date) && r.types.includes(AttendanceType.Gathering)).length;
      const woolCount = records.filter(r => r.memberId === m.id && currentMonthSundays.includes(r.date) && r.types.includes(AttendanceType.Wool)).length;
      map[m.id] = worshipCount + gatheringCount + woolCount;
    });
    return map;
  }, [filteredMembers, records, currentMonthSundays]);

  // Sorting based on selected sortBy state
  const sortedMembers = useMemo(() => {
    const twoDigitNums = searchQuery ? searchQuery.match(/\d{2}/g) || [] : [];

    return [...filteredMembers].sort((a, b) => {
      // Prioritize members whose name contains the searched 2-digit number
      if (twoDigitNums.length > 0) {
        const aHas = twoDigitNums.some(num => String(a.name || '').includes(num));
        const bHas = twoDigitNums.some(num => String(b.name || '').includes(num));
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
      }

      if (sortBy === 'attendance') {
        const totalA = memberAttendanceMap[a.id] || 0;
        const totalB = memberAttendanceMap[b.id] || 0;
        if (totalA !== totalB) return totalB - totalA; // Descending (high to low)
        return String(a.name || '').localeCompare(String(b.name || ''));
      }

      if (sortBy === 'age') {
        const yearA = parseBirthYear(a.name);
        const yearB = parseBirthYear(b.name);
        if (yearA !== null && yearB !== null) {
          if (yearA !== yearB) return yearA - yearB; // Ascending (older first: e.g. 1991 before 1995)
          return String(a.name || '').localeCompare(String(b.name || ''));
        }
        if (yearA !== null) return -1; // Keep numeric prefix ahead
        if (yearB !== null) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      }

      // Default: 'group' (Group -> Name)
      const groupA = String(a.group || '');
      const groupB = String(b.group || '');
      if (groupA !== groupB) return groupA.localeCompare(groupB);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [filteredMembers, sortBy, memberAttendanceMap, searchQuery]);

  const getStatus = (memberId: string, date: string, type: AttendanceType) => {
    const record = records.find(r => r.memberId === memberId && r.date === date && r.types.includes(type));
    return !!record;
  };

  const isMeetingCanceled = (date: string, type: AttendanceType) => {
    return meetingStatus.some(s => s.date === date && s.type === type && s.isCanceled);
  };
  
  const getEventName = (date: string) => {
    return meetingStatus.find(s => s.date === date)?.event || '';
  };

  const calculateTotal = (memberId: string, type: AttendanceType) => {
    // Count records regardless of 'canceled' status (Actual data takes precedence)
    return records.filter(r => {
      return r.memberId === memberId && currentMonthSundays.includes(r.date) && r.types.includes(type);
    }).length;
  };

  const overallTotals = useMemo(() => {
    return currentMonthSundays.map(date => {
      // Find all records on this date for active members
      const activeMemberIds = new Set(members.map(m => m.id));
      const dateRecords = records.filter(r => r.date === date && activeMemberIds.has(r.memberId));

      const worshipCount = dateRecords.filter(r => r.types.includes(AttendanceType.Worship)).length;
      
      const statusGathering = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Gathering);
      const mCount = statusGathering?.manualAssemblyCount || 0;
      const dbGatheringCount = dateRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length;
      const gatheringCount = Math.max(dbGatheringCount, mCount);
      const isManualCount = mCount > dbGatheringCount && !statusGathering?.isCanceled;

      const woolCount = dateRecords.filter(r => r.types.includes(AttendanceType.Wool)).length;

      const worshipCanceled = isMeetingCanceled(date, AttendanceType.Worship);
      const gatheringCanceled = isMeetingCanceled(date, AttendanceType.Gathering);
      const woolCanceled = isMeetingCanceled(date, AttendanceType.Wool);

      return {
        date,
        worshipCount: worshipCanceled ? 0 : worshipCount,
        worshipCanceled,
        gatheringCount: gatheringCanceled ? 0 : gatheringCount,
        gatheringCanceled,
        isManualCount,
        woolCount: woolCanceled ? 0 : woolCount,
        woolCanceled
      };
    });
  }, [members, records, currentMonthSundays, meetingStatus]);

  const overallSums = useMemo(() => {
    let worshipSum = 0;
    let gatheringSum = 0;
    let woolSum = 0;

    overallTotals.forEach(t => {
      if (!t.worshipCanceled) worshipSum += t.worshipCount;
      if (!t.gatheringCanceled) gatheringSum += t.gatheringCount;
      if (!t.woolCanceled) woolSum += t.woolCount;
    });

    return { worshipSum, gatheringSum, woolSum };
  }, [overallTotals]);

  // Render Cell Logic
  const renderCell = (memberId: string, date: string, type: AttendanceType, activeColorClass: string, hoverClass: string) => {
    const attended = getStatus(memberId, date, type);
    const canceled = isMeetingCanceled(date, type);
    
    // Priority: If attended, show CHECK (even if config says canceled). 
    // If not attended, check if canceled.
    
    if (attended) {
       return (
        <td 
          key={`${memberId}-${date}-${type}`} 
          onClick={() => onToggleAttendance(memberId, date, type)}
          className={`px-1 md:px-2 py-2 border border-slate-200 dark:border-slate-800 text-center cursor-pointer transition-colors ${hoverClass}`}
        >
          <div className={`flex justify-center ${activeColorClass}`}>
             <Check size={16} strokeWidth={3} />
          </div>
        </td>
       );
    }

    if (canceled) {
      return (
        <td key={`${memberId}-${date}-${type}`} className="px-1 md:px-2 py-2 border border-slate-200 dark:border-slate-800 text-center bg-slate-100 dark:bg-slate-850 text-slate-400 dark:text-slate-600">
           -
        </td>
      );
    }

    return (
      <td 
        key={`${memberId}-${date}-${type}`}
        onClick={() => onToggleAttendance(memberId, date, type)}
        className={`px-1 md:px-2 py-2 border border-slate-200 dark:border-slate-800 text-center cursor-pointer transition-colors ${hoverClass}`}
      >
      </td>
    );
  };

  return (
    <div className="space-y-2.5">
      <header className="border-b border-slate-100 dark:border-slate-850 pb-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full inline-block"></span>
            출석 상세 현황
          </h2>
          <p className="hidden md:block text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">클릭하여 각 모임별 출석 여부를 바로 등록하거나 수정할 수 있습니다.</p>
        </div>
        
        {/* Modern & Compact Filters Layout */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {/* Compact Name Search */}
          <div className="relative flex-1 min-w-[120px] sm:flex-initial sm:w-36">
            <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
              <Search size={12} className="text-slate-400 dark:text-slate-500" />
            </div>
            <input 
              type="text" 
              className="bg-slate-50 dark:bg-slate-900 hover:bg-white dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-800 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-[11px] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-7 pr-2 h-8 transition-all outline-none" 
              placeholder="이름 검색" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Compact Month Select */}
          <div className="w-[80px] sm:w-20">
            <select
              className="bg-slate-50 dark:bg-slate-900 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-[11px] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full px-1.5 h-8 transition-all cursor-pointer outline-none"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="all" className="dark:bg-slate-900">전체 월</option>
              {months.map((m, idx) => (
                <option key={m} value={idx} className="dark:bg-slate-900">{m}월</option>
              ))}
            </select>
          </div>

          {/* Compact Group Select */}
          <div className="flex-1 min-w-[110px] sm:flex-initial sm:w-32">
            <select
              className="bg-slate-50 dark:bg-slate-900 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-[11px] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full px-1.5 h-8 truncate transition-all cursor-pointer outline-none"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="all" className="dark:bg-slate-900">전체 소그룹/울</option>
              {availableGroups.map(g => (
                <option key={g} value={g} className="dark:bg-slate-900">{g}</option>
              ))}
            </select>
          </div>

          {/* Compact Sort Select */}
          {isVisitationMode && (
            <div className="w-[100px] sm:w-28">
              <select
                className="bg-slate-50 dark:bg-slate-900 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-[11px] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full px-1.5 h-8 transition-all cursor-pointer outline-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'group' | 'attendance' | 'age')}
              >
                <option value="group" className="dark:bg-slate-900">소그룹 정렬</option>
                <option value="attendance" className="dark:bg-slate-900">출석 높은 순</option>
                <option value="age" className="dark:bg-slate-900">또래 순(나이순)</option>
              </select>
            </div>
          )}

          {/* Aesthetic Toggle Switch for Exclude Zero */}
          {isVisitationMode && (
            <div 
              onClick={() => setExcludeZeroAttendance(!excludeZeroAttendance)}
              className="flex items-center gap-1.5 px-2.5 h-8 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-lg cursor-pointer transition-all select-none"
            >
              <span className="text-slate-600 dark:text-slate-400 font-semibold text-[10px] whitespace-nowrap">출석 0회 제외</span>
              <button 
                type="button" 
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${excludeZeroAttendance ? 'bg-indigo-600 border-indigo-600' : 'bg-slate-200 dark:bg-slate-700 border-slate-200 dark:border-slate-700'}`}
              >
                <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${excludeZeroAttendance ? 'translate-x-3' : 'translate-x-0'}`} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.015)] border border-slate-200/50 dark:border-slate-800/85 overflow-hidden">
        <div className="max-h-[calc(100vh-270px)] sm:max-h-[calc(100vh-240px)] overflow-auto custom-scrollbar">
          <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400 border-collapse">
            <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-35">
              <tr>
                <th scope="col" className="px-1 py-2.5 sticky top-0 left-0 bg-slate-100 dark:bg-slate-800 z-40 w-[98px] min-w-[98px] max-w-[98px] border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 text-center text-xs">이름</th>
                <th scope="col" className="hidden sm:table-cell px-1 py-2.5 sm:sticky top-0 sm:left-[98px] bg-slate-100 dark:bg-slate-800 sm:z-40 w-[80px] min-w-[80px] max-w-[80px] border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 text-center text-xs">소그룹</th>
                <th scope="col" className="px-1 py-2.5 sticky sm:sticky top-0 left-[98px] sm:left-[178px] bg-slate-100 dark:bg-slate-800 z-40 sm:z-40 w-[44px] min-w-[44px] max-w-[44px] border border-slate-200 dark:border-slate-700 text-center font-semibold text-slate-700 dark:text-slate-300 text-xs">구분</th>
                {currentMonthSundays.map(date => (
                  <th key={date} scope="col" className="px-1 py-2.5 sticky top-0 bg-slate-100 dark:bg-slate-800 z-30 text-center border border-slate-200 dark:border-slate-700 min-w-[48px] font-semibold text-slate-600 dark:text-slate-400">
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-[10px] md:text-xs">{date.substring(5)}</span>
                      {getEventName(date) && (
                        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-normal mt-0.5 truncate max-w-[44px]">{getEventName(date)}</span>
                      )}
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-1 py-2.5 sticky top-0 right-0 bg-slate-100 dark:bg-slate-800 z-40 text-center border border-slate-200 dark:border-slate-700 w-[44px] min-w-[44px] max-w-[44px] font-semibold text-slate-700 dark:text-slate-300 text-xs">계</th>
              </tr>

              {/* Total Stats Rows */}
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 normal-case">
                <td rowSpan={3} className="px-1 py-2 font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-30 text-center align-middle whitespace-nowrap w-[98px] min-w-[98px] max-w-[98px] text-xs">전체</td>
                <td rowSpan={3} className="hidden sm:table-cell px-1 py-2 border border-slate-200 dark:border-slate-700 sm:sticky sm:left-[98px] bg-slate-50 dark:bg-slate-900/20 sm:z-25 text-center align-middle whitespace-nowrap text-xs text-slate-400 dark:text-slate-500 w-[80px] min-w-[80px] max-w-[80px]">-</td>
                <td className="px-1 py-1.5 text-center text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 bg-[#eff6ff] dark:bg-blue-950/20 sticky sm:sticky left-[98px] sm:left-[178px] z-25 sm:z-25 w-[44px] min-w-[44px] max-w-[44px]">예배</td>
                {overallTotals.map(t => (
                  <td key={`overall-worship-${t.date}`} className={`px-1 py-1.5 text-center border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-900/30 text-xs`}>
                    {t.worshipCanceled ? '-' : t.worshipCount}
                  </td>
                ))}
                <td className="px-1 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 sticky right-0 z-30 text-xs w-[44px] min-w-[44px] max-w-[44px]">
                  {overallSums.worshipSum}
                </td>
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 normal-case">
                <td className="px-1 py-1.5 text-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 bg-[#e0e7ff] dark:bg-indigo-950/20 sticky sm:sticky left-[98px] sm:left-[178px] z-25 sm:z-25 w-[44px] min-w-[44px] max-w-[44px]">집회</td>
                {overallTotals.map(t => (
                  <td key={`overall-gathering-${t.date}`} className={`px-1 py-1.5 text-center border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-900/30 text-xs`}>
                    {t.gatheringCanceled ? '-' : (
                      <>
                        {t.gatheringCount}
                        {t.isManualCount && (
                          <span className="text-[8px] text-slate-400 dark:text-slate-500 block font-normal normal-case leading-none mt-0.5">(계수)</span>
                        )}
                      </>
                    )}
                  </td>
                ))}
                <td className="px-1 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 sticky right-0 z-30 text-xs w-[44px] min-w-[44px] max-w-[44px]">
                  {overallSums.gatheringSum}
                </td>
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b-2 border-slate-200 dark:border-slate-700 normal-case">
                <td className="px-1 py-1.5 text-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 bg-[#ecfdf5] dark:bg-emerald-950/20 sticky sm:sticky left-[98px] sm:left-[178px] z-25 sm:z-25 w-[44px] min-w-[44px] max-w-[44px]">울</td>
                {overallTotals.map(t => (
                  <td key={`overall-wool-${t.date}`} className={`px-1 py-1.5 text-center border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-900/30 text-xs`}>
                    {t.woolCanceled ? '-' : t.woolCount}
                  </td>
                ))}
                <td className="px-1 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 sticky right-0 z-30 text-xs w-[44px] min-w-[44px] max-w-[44px]">
                  {overallSums.woolSum}
                </td>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member, mIdx) => (
                <React.Fragment key={member.id}>
                  {/* Row 1: Worship */}
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td rowSpan={3} className={`px-1 py-2 font-medium sticky left-0 z-30 border border-slate-200 dark:border-slate-700 group relative w-[98px] min-w-[98px] max-w-[98px] ${isNewFamily(member) ? 'bg-lime-50/40 dark:bg-lime-950/20 border-l-4 border-l-lime-500 text-lime-950 dark:text-lime-200' : mIdx % 2 === 0 ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100' : 'bg-[#fafafa] dark:bg-slate-900/60 text-slate-900 dark:text-slate-100'}`}>
                      <div className="flex flex-col items-start gap-0.5 min-w-0">
                        <div 
                          onClick={() => navigate('/profile', { state: { memberId: member.id } })}
                          className="flex items-center gap-1 min-w-0 w-full cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 group/name"
                        >
                           {member.photoUrl ? (
                             <img src={member.photoUrl} alt={member.name} className="w-4 h-4 md:w-5 md:h-5 rounded-full object-cover border-2 border-lime-400 dark:border-lime-500 shrink-0" referrerPolicy="no-referrer" />
                           ) : (
                             <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-lime-50 dark:bg-lime-950/40 flex items-center justify-center text-[8px] text-lime-700 dark:text-lime-400 font-extrabold border-2 border-lime-400 shrink-0">
                               {member.name.substring(0, 1)}
                             </div>
                           )}
                           <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap group-hover/name:underline flex items-center gap-0.5" title={member.name}>{member.name}{isNewFamily(member) && <span className="text-[8px] bg-lime-500 text-white font-black px-0.5 rounded leading-none">NEW</span>}</span>
                        </div>
                        {/* Mobile-only group display under the name */}
                        <span className="block sm:hidden text-[9px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-full pl-5" title={member.group}>
                          {member.group}
                        </span>
                      </div>
                      
                      {/* Modern Tooltip for Memo - Adjusted for mobile position */}
                      {member.specialNotes && (
                        <div className="hidden sm:block absolute left-full top-0 ml-2 w-56 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                            <div className="bg-slate-850 dark:bg-slate-800 text-white text-xs rounded-lg py-2 px-3 shadow-xl border border-slate-750 dark:border-slate-700">
                               <div className="flex items-center gap-1.5 mb-1 text-slate-300 font-bold border-b border-slate-700 pb-1">
                                  <MessageSquare size={10} /> 비고 (Memo)
                                </div>
                                <p className="leading-relaxed text-slate-200">{member.specialNotes}</p>
                                {/* Arrow */}
                                <div className="absolute top-4 -left-1 w-2 h-2 bg-slate-850 dark:bg-slate-800 transform rotate-45"></div>
                            </div>
                        </div>
                      )}
                    </td>
                    <td rowSpan={3} className={`hidden sm:table-cell px-1 py-2 border border-slate-200 dark:border-slate-700 sm:sticky sm:left-[98px] sm:z-25 ${mIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#fafafa] dark:bg-slate-900/60'} w-[80px] min-w-[80px] max-w-[80px] text-center`}>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 text-[10px] md:text-xs truncate" title={member.group}>{member.group}</div>
                    </td>
                    <td className={`px-1 py-1.5 text-center text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 bg-[#eff6ff] dark:bg-blue-950/20 sticky sm:sticky left-[98px] sm:left-[178px] z-25 sm:z-25 w-[44px] min-w-[44px] max-w-[44px]`}>예배</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Worship, 'text-blue-600 dark:text-blue-400', 'hover:bg-blue-50 dark:hover:bg-blue-950/20')
                    )}
                    <td className={`px-1 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky right-0 z-20 w-[44px] min-w-[44px] max-w-[44px] text-xs`}>
                      {calculateTotal(member.id, AttendanceType.Worship)}
                    </td>
                  </tr>
                  
                  {/* Row 2: Gathering */}
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className={`px-1 py-1.5 text-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 bg-[#e0e7ff] dark:bg-indigo-950/20 sticky sm:sticky left-[98px] sm:left-[178px] z-25 sm:z-25 w-[44px] min-w-[44px] max-w-[44px]`}>집회</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Gathering, 'text-indigo-600 dark:text-indigo-400', 'hover:bg-indigo-50 dark:hover:bg-indigo-950/20')
                    )}
                    <td className={`px-1 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky right-0 z-20 w-[44px] min-w-[44px] max-w-[44px] text-xs`}>
                      {calculateTotal(member.id, AttendanceType.Gathering)}
                    </td>
                  </tr>

                  {/* Row 3: Wool */}
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className={`px-1 py-1.5 text-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 bg-[#ecfdf5] dark:bg-emerald-950/20 sticky sm:sticky left-[98px] sm:left-[178px] z-25 sm:z-25 w-[44px] min-w-[44px] max-w-[44px]`}>울</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Wool, 'text-emerald-600 dark:text-emerald-400', 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20')
                    )}
                    <td className={`px-1 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky right-0 z-20 w-[44px] min-w-[44px] max-w-[44px] text-xs`}>
                      {calculateTotal(member.id, AttendanceType.Wool)}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AttendanceMatrix;