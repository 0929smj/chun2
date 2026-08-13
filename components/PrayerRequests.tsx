import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Member, PrayerRecord, AttendanceRecord, MeetingStatus, AttendanceType } from '../types';
import { Quote, AlertCircle, Calendar, User, Search, FileText, X, Maximize2, Phone, CalendarDays, TrendingUp } from 'lucide-react';
import { SUNDAYS_2026 } from '../services/mockData';
import { getClosestSunday, hasActualPrayerContent, parsePrayerRequests } from '../services/utils';
import { matchKoreanFuzzy } from '../services/searchAlgorithm';

const isNewFamily = (member?: Member | null) => {
  if (!member) return false;
  const regDate = member.MemberRegistration || (member as any).registrationDate;
  if (!regDate) return false;
  return String(regDate).trim().startsWith('2026');
};

interface PrayerRequestsProps {
  members: Member[];
  prayerRecords: PrayerRecord[];
  availableGroups: string[];
  attendanceRecords?: AttendanceRecord[];
  meetingStatus?: MeetingStatus[];
}

const PrayerRequests: React.FC<PrayerRequestsProps> = ({ members, prayerRecords, availableGroups, attendanceRecords, meetingStatus }) => {
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

  const [viewMode, setViewMode] = useState<'member' | 'date'>(() => loadSessionState<'member' | 'date'>('prayer_viewMode', 'date'));
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const closestPast = getClosestSunday();
    const stored = loadSessionState<string>('prayer_selectedDate', closestPast);
    return stored > closestPast ? closestPast : stored;
  });
  
  // Member View State
  const [selectedGroup, setSelectedGroup] = useState<string>(() => loadSessionState<string>('prayer_selectedGroup', ''));
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => loadSessionState<string>('prayer_selectedMemberId', ''));
  const [searchQuery, setSearchQuery] = useState<string>(() => loadSessionState<string>('prayer_searchQuery', ''));

  // Photo Enlarge Modal State for Prayer View
  const [photoModal, setPhotoModal] = useState<{ member: Member; recordContent?: string; recordNote?: string; date?: string } | null>(null);

  // Photo Scale Mode: 'large' (default for iPad/mobile face prayer) or 'normal'
  const [photoScaleMode, setPhotoScaleMode] = useState<'large' | 'normal'>(() => loadSessionState<'large' | 'normal'>('prayer_photoScaleMode', 'large'));

  // Sync state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('prayer_viewMode', JSON.stringify(viewMode));
  }, [viewMode]);

  useEffect(() => {
    sessionStorage.setItem('prayer_photoScaleMode', JSON.stringify(photoScaleMode));
  }, [photoScaleMode]);

  useEffect(() => {
    sessionStorage.setItem('prayer_selectedDate', JSON.stringify(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    sessionStorage.setItem('prayer_selectedGroup', JSON.stringify(selectedGroup));
  }, [selectedGroup]);

  useEffect(() => {
    sessionStorage.setItem('prayer_selectedMemberId', JSON.stringify(selectedMemberId));
  }, [selectedMemberId]);

  useEffect(() => {
    sessionStorage.setItem('prayer_searchQuery', JSON.stringify(searchQuery));
  }, [searchQuery]);

  // Calculate attendance rate and stats for all members
  const attendanceStatsMap = useMemo(() => {
    if (!attendanceRecords || attendanceRecords.length === 0) return {};
    
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const passedSundays = SUNDAYS_2026.filter(d => d <= todayStr);

    const stats: Record<string, { totalCount: number; expectedCount: number; totalRate: number }> = {};

    members.forEach(member => {
      let totalCount = 0;
      let expectedCount = 0;
      passedSundays.forEach(sunday => {
        const isCanceled = (meetingStatus || []).some(s => s.date === sunday && s.type === AttendanceType.Worship && s.isCanceled);
        if (isCanceled) return;
        expectedCount++;
        const rec = attendanceRecords.find(r => r.memberId === member.id && r.date === sunday);
        if (rec && rec.types && rec.types.length > 0) {
          totalCount++;
        }
      });

      stats[member.id] = {
        totalCount,
        expectedCount,
        totalRate: expectedCount > 0 ? Math.round((totalCount / expectedCount) * 100) : 100
      };
    });

    return stats;
  }, [members, attendanceRecords, meetingStatus]);

  // Sort function to be reused
  const sortMembers = (a: Member, b: Member) => {
    // Priority: Leader -> Alphabetical
    
    // 1. Leader Check
    const roleA = (a.role || '').toString().toUpperCase().trim();
    const roleB = (b.role || '').toString().toUpperCase().trim();
    
    const isALeader = roleA === 'LEADER' || roleA === '리더';
    const isBLeader = roleB === 'LEADER' || roleB === '리더';

    if (isALeader && !isBLeader) return -1;
    if (!isALeader && isBLeader) return 1;

    // 2. Alphabetical Check
    const nameA = String(a.name || '').replace(/\*/g, '').trim();
    const nameB = String(b.name || '').replace(/\*/g, '').trim();

    return nameA.localeCompare(nameB);
  };

  // Filter members based on selected group (for dropdown)
  const membersInGroup = useMemo(() => {
    if (!selectedGroup) return [];
    return members
      .filter(m => m.group === selectedGroup)
      .sort(sortMembers);
  }, [members, selectedGroup]);

  // View 1: By Date - Group by Small Group/Wool directly (Flattened)
  const recordsByDate = useMemo<Record<string, { member: Member; record: PrayerRecord }[]>>(() => {
    const records = prayerRecords.filter(r => r.date === selectedDate);
    const groups: Record<string, { member: Member; record: PrayerRecord }[]> = {};

    members.forEach(member => {
       const record = records.find(r => r.memberId === member.id);
       const gName = member.group && String(member.group).trim() ? String(member.group).trim() : '미소속';
       if (!groups[gName]) groups[gName] = [];
       
       // Only show if there is an actual record for this date.
       if (record) {
         groups[gName].push({ member, record });
       }
    });
    return groups;
  }, [selectedDate, prayerRecords, members]);

  // Check if there are any records to display for the Empty State
  const hasAnyRecords = useMemo(() => {
    return Object.values(recordsByDate).some((items: { member: Member; record: PrayerRecord }[]) => items.length > 0);
  }, [recordsByDate]);

  // View 2: By Member - Search Query OR Single Member OR All in Group
  const memberHistoryData = useMemo<{ member: Member; records: PrayerRecord[] }[] | null>(() => {
    let targetMembers: Member[] = [];

    // Priority 1: Search Query (utilizing Korean initial & 2-digit birth year match/sort)
    if (searchQuery.trim()) {
       const matched = members.filter(m => matchKoreanFuzzy(searchQuery, String(m.name || '')));
       const twoDigitNums = searchQuery.match(/\d{2}/g) || [];
       if (twoDigitNums.length > 0) {
         targetMembers = matched.sort((a, b) => {
           const aHas = twoDigitNums.some(num => String(a.name || '').includes(num));
           const bHas = twoDigitNums.some(num => String(b.name || '').includes(num));
           if (aHas && !bHas) return -1;
           if (!aHas && bHas) return 1;
           return String(a.name || '').localeCompare(String(b.name || ''));
         });
       } else {
         targetMembers = matched.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
       }
    }
    // Priority 2: Specific Member Selected via Dropdown
    else if (selectedMemberId) {
      const m = members.find(m => m.id === selectedMemberId);
      if (m) targetMembers = [m];
    } 
    // Priority 3: Group Selected
    else if (selectedGroup) {
      targetMembers = members
        .filter(m => m.group === selectedGroup)
        .sort(sortMembers);
    } 
    else {
      return null;
    }

    if (targetMembers.length === 0) return [];

    return targetMembers.map(member => {
       const myRecords = prayerRecords
        .filter(r => r.memberId === member.id)
        .sort((a, b) => b.date.localeCompare(a.date));
       return { member, records: myRecords };
    });
  }, [searchQuery, selectedMemberId, selectedGroup, members, prayerRecords]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val) {
      setSelectedGroup('');
      setSelectedMemberId('');
    }
  };

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGroup(e.target.value);
    setSelectedMemberId(''); 
    setSearchQuery('');
  };

  const handleMemberChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMemberId(e.target.value);
    setSearchQuery(''); 
  };

  return (
    <div className="space-y-3">
      <header className="border-b border-slate-100 dark:border-slate-850 pb-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full inline-block"></span>
            기도 제목 및 특이사항
          </h2>
          <p className="hidden md:block text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
            {viewMode === 'date' 
              ? '매주 입력되는 기도제목과 특이사항을 소그룹/울별로 확인합니다.' 
              : '각 성도님의 기도제목 및 특이사항 히스토리를 확인합니다.'}
          </p>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-0.5 rounded-lg w-full sm:w-auto shrink-0">
           <button
             onClick={() => setViewMode('date')}
             className={`flex-1 sm:flex-none flex items-center justify-center px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
               viewMode === 'date' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
             }`}
           >
             <Calendar size={12} className="mr-1.5" /> 날짜별
           </button>
           <button
             onClick={() => setViewMode('member')}
             className={`flex-1 sm:flex-none flex items-center justify-center px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
               viewMode === 'member' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
             }`}
           >
             <User size={12} className="mr-1.5" /> 멤버별
           </button>
        </div>
      </header>

      {viewMode === 'date' && (
        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap flex items-center gap-1.5">
              <Calendar size={13} className="text-indigo-500" /> 날짜 선택:
            </label>
            <select
              className="w-36 sm:w-44 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3 h-9 text-xs sm:text-sm bg-slate-50/80 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer font-bold"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              {SUNDAYS_2026.slice().reverse().map(d => ( 
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
            사진 터치 시 큰 화면으로 확대
          </div>
        </div>
      )}

      {viewMode === 'member' && (
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-[0_1px_3px_rgba(0,0,0,0.01)] flex flex-col md:flex-row gap-3 items-start md:items-end">
          <div className="w-full md:flex-1">
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center">
              <Search size={10} className="mr-1" /> 이름 직접 검색 (추천)
            </label>
            <div className="relative">
              <input 
                type="text" 
                className="w-full border border-indigo-200 dark:border-indigo-900/60 rounded-lg pl-8 pr-8 h-8 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 text-slate-800 dark:text-slate-200 outline-none transition-all"
                placeholder="이름을 입력하세요 (예: 91홍길동)"
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-indigo-400">
                <Search size={12} />
              </div>
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center pb-2.5 px-1 text-slate-300 dark:text-slate-700 font-bold text-xs">OR</div>

          <div className="w-full md:flex-1 flex gap-2">
            <div className="flex-1">
               <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">소그룹 선택</label>
               <select
                 className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-2 h-8 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                 value={selectedGroup}
                 onChange={handleGroupChange}
               >
                 <option value="">선택 안 함</option>
                 {availableGroups.map(g => (
                   <option key={g} value={g}>{g}</option>
                 ))}
               </select>
            </div>
            <div className="flex-1">
               <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">멤버 선택</label>
               <select
                 className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-2 h-8 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-950/60 disabled:text-slate-400"
                 value={selectedMemberId}
                 onChange={handleMemberChange}
                 disabled={!selectedGroup}
               >
                 <option value="">전체 보기</option>
                 {membersInGroup.map(m => (
                   <option key={m.id} value={m.id}>{m.name}</option>
                 ))}
               </select>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'date' && (
        <div className="space-y-4 sm:space-y-6">
          {Object.entries(recordsByDate).map(([groupName, items]) => {
            const groupItems = items as { member: Member; record: PrayerRecord }[];
            if (groupItems.length === 0) return null;
            return (
               <div key={groupName} className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)] border border-slate-200/50 dark:border-slate-800/80 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5 mb-3.5">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                      {groupName}
                    </h3>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 px-2.5 py-0.5 rounded-full">
                      {groupItems.length}명
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                    {groupItems.map(({ member, record }) => (
                      <div key={member.id} className={`relative p-3.5 sm:p-4 rounded-2xl border transition-all hover:shadow-md ${isNewFamily(member) ? 'border-lime-400/80 bg-lime-50/20 dark:bg-lime-950/10' : 'border-slate-200/80 dark:border-slate-800 hover:border-indigo-300/80 bg-slate-50/40 dark:bg-slate-950/30'}`}>
                        <div className="flex items-start gap-3.5 mb-2.5">
                          {/* Face Avatar Photo with Enlarge click */}
                          <div 
                            onClick={() => setPhotoModal({ member, recordContent: record.content, recordNote: record.note, date: selectedDate })}
                            className="relative group cursor-pointer shrink-0"
                            title="얼굴 확대해서 크게 보기"
                          >
                            {member.photoUrl ? (
                              <img 
                                src={member.photoUrl} 
                                alt={member.name} 
                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shrink-0 shadow-sm transition-transform group-hover:scale-105 ring-2 ring-indigo-100 dark:ring-indigo-900/60" 
                                referrerPolicy="no-referrer" 
                              />
                            ) : (
                              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl text-base font-extrabold flex items-center justify-center shrink-0 shadow-sm bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 ring-2 ring-indigo-100 dark:ring-indigo-900/60">
                                {member.name.substring(0, 1)}
                              </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white p-1 rounded-full shadow-xs group-hover:scale-110 transition-transform">
                              <Maximize2 size={10} />
                            </div>
                          </div>

                          <div className="flex-1 min-w-0 pt-0.5">
                            <div 
                              onClick={() => navigate('/profile', { state: { memberId: member.id, from: '/prayer' } })}
                              className="cursor-pointer group/name hover:opacity-85 transition-opacity"
                              title={`${member.name}님의 개인별 현황 보기`}
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-extrabold text-base text-slate-900 dark:text-slate-100 group-hover/name:text-indigo-600 dark:group-hover/name:text-indigo-400 transition-colors">
                                  {member.name}
                                </h4>
                                {member.role && (
                                  <span className="text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700">
                                    {member.role}
                                  </span>
                                )}
                                {isNewFamily(member) && (
                                  <span className="text-[10px] bg-lime-500 text-white font-bold px-1.5 py-0.5 rounded leading-none">
                                    새가족
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{member.group}</span>
                                
                                {attendanceStatsMap[member.id] && (
                                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                                    attendanceStatsMap[member.id].totalRate >= 80 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60' 
                                      : attendanceStatsMap[member.id].totalRate >= 50 
                                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60' 
                                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60'
                                  }`}>
                                    <CalendarDays size={11} className="shrink-0" />
                                    출석률 {attendanceStatsMap[member.id].totalRate}% ({attendanceStatsMap[member.id].totalCount}/{attendanceStatsMap[member.id].expectedCount}회)
                                  </span>
                                )}

                                {member.phoneNumber && (
                                  <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs">
                                    <Phone size={11} className="shrink-0" /> {member.phoneNumber}
                                  </span>
                                )}

                                {(member.MemberRegistration || (member as any).registrationDate) && (
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    등반: {member.MemberRegistration || (member as any).registrationDate}
                                  </span>
                                )}
                              </div>
                            </div>

                            {member.specialNotes && (
                              <div 
                                onClick={() => navigate('/profile', { state: { memberId: member.id, from: '/prayer' } })}
                                className="mt-1.5 inline-flex items-center text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-900/30 max-w-full truncate cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                              >
                                <AlertCircle size={10} className="mr-1 shrink-0 text-rose-500" />
                                <span className="truncate font-medium">{member.specialNotes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Always show content since we filtered by record existence */}
                         <>
                           {hasActualPrayerContent(record.content) && (
                             <div className="mt-2 text-sm sm:text-xs text-slate-800 dark:text-slate-200 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/80 dark:border-indigo-900/40 p-3 rounded-xl flex items-start gap-2">
                               <Quote size={13} className="text-indigo-500 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                               <div className="flex-1 space-y-1.5 sm:space-y-1 leading-relaxed">
                                 {parsePrayerRequests(record.content).map((line, idx) => {
                                   if (!line.text && !line.marker) return null;
                                   if (line.marker) {
                                     return (
                                       <div key={idx} className="flex items-start gap-1.5 leading-relaxed">
                                         <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 min-w-[18px] sm:min-w-[14px] text-sm sm:text-xs">{line.marker}</span>
                                         <span className="flex-1">{line.text}</span>
                                       </div>
                                     );
                                   }
                                   return (
                                     <div key={idx} className="leading-relaxed">
                                       {line.text}
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           )}
                           {record.note && (
                             <div className="mt-2 text-sm sm:text-xs text-slate-800 dark:text-slate-200 flex items-start bg-amber-50/70 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/40 leading-relaxed gap-2">
                               <FileText size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                               <p className="flex-1">{record.note}</p>
                             </div>
                           )}
                         </>
                      </div>
                    ))}
                  </div>
               </div>
            );
          })}
          {!hasAnyRecords && (
             <div className="col-span-full text-center py-8 text-slate-400 dark:text-slate-600 text-xs">
               해당 날짜에 등록된 내용이 없습니다.
             </div>
          )}
        </div>
      )}
      
      {/* Member View */}
      {viewMode === 'member' && (
         <div className="space-y-3">
            {!memberHistoryData ? (
               <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-800/80 min-h-[250px] flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-500 text-xs">
                  <Search size={32} className="mb-2 opacity-20 text-indigo-400" />
                  <p>위에서 이름을 검색하거나, 소그룹을 선택하여 기록을 확인하세요.</p>
               </div>
            ) : memberHistoryData.length === 0 ? (
               <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-800/80 min-h-[200px] flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-500 text-xs">
                  <AlertCircle size={32} className="mb-2 opacity-20 text-indigo-400" />
                  <p>검색 결과가 없습니다.</p>
               </div>
            ) : (
               memberHistoryData.map(({ member, records }) => (
                 <div key={member.id} className={`rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.01)] overflow-hidden ${isNewFamily(member) ? 'border-lime-400 bg-lime-50/5 dark:bg-lime-950/5' : 'bg-white dark:bg-slate-900 border-slate-200/50 dark:border-slate-800/80'}`}>
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/20">
                       <div className="flex justify-between items-center gap-4">
                          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
                            {/* Larger Avatar Photo with enlarge click handler */}
                            <div 
                              onClick={() => setPhotoModal({ member, recordContent: records[0]?.content, recordNote: records[0]?.note, date: records[0]?.date })}
                              className="relative group cursor-pointer shrink-0"
                              title="얼굴 크게 보기"
                            >
                              {member.photoUrl ? (
                                <img 
                                  src={member.photoUrl} 
                                  alt={member.name} 
                                  className={`${
                                    photoScaleMode === 'large'
                                      ? 'w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-3xl'
                                      : 'w-14 h-14 sm:w-16 sm:h-16 rounded-xl'
                                  } object-cover shadow-lg shrink-0 transition-transform group-hover:scale-105 ${
                                    isNewFamily(member) 
                                      ? 'ring-3 ring-lime-400 dark:ring-lime-500' 
                                      : 'ring-2 ring-indigo-100 dark:ring-indigo-900/60'
                                  }`} 
                                  referrerPolicy="no-referrer" 
                                />
                              ) : (
                                <div className={`${
                                  photoScaleMode === 'large'
                                    ? 'w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-3xl text-3xl font-black'
                                    : 'w-14 h-14 sm:w-16 sm:h-16 rounded-xl text-lg font-bold'
                                } flex items-center justify-center shadow-lg shrink-0 ${
                                  isNewFamily(member)
                                    ? 'bg-lime-100 dark:bg-lime-950/60 text-lime-800 dark:text-lime-300 ring-3 ring-lime-400'
                                    : 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 ring-2 ring-indigo-100'
                                }`}>
                                  {member.name.substring(0, 1)}
                                </div>
                              )}
                              <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white p-1.5 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                <Maximize2 size={12} />
                              </div>
                            </div>

                            <div 
                              onClick={() => navigate('/profile', { state: { memberId: member.id, from: '/prayer' } })}
                              className="cursor-pointer group/name hover:opacity-85 transition-opacity min-w-0"
                              title={`${member.name}님의 개인별 현황 보기`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-extrabold text-xl sm:text-2xl text-slate-800 dark:text-slate-100 group-hover/name:text-indigo-600 dark:group-hover/name:text-indigo-400 group-hover/name:underline transition-colors">
                                  {member.name}
                                </h3>
                                {member.role && (
                                  <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                    {member.role}
                                  </span>
                                )}
                                {isNewFamily(member) && <span className="text-xs bg-lime-500 text-white font-black px-2 py-0.5 rounded leading-none animate-pulse">새가족</span>}
                              </div>

                              <div className="flex items-center gap-2.5 flex-wrap text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{member.group}</span>

                                {attendanceStatsMap[member.id] && (
                                  <span className={`inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-0.5 rounded-md border ${
                                    attendanceStatsMap[member.id].totalRate >= 80 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60' 
                                      : attendanceStatsMap[member.id].totalRate >= 50 
                                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60' 
                                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60'
                                  }`}>
                                    <CalendarDays size={12} className="shrink-0" />
                                    출석률 {attendanceStatsMap[member.id].totalRate}% ({attendanceStatsMap[member.id].totalCount}/{attendanceStatsMap[member.id].expectedCount}회)
                                  </span>
                                )}

                                {member.phoneNumber && (
                                  <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                    <Phone size={12} className="shrink-0" /> {member.phoneNumber}
                                  </span>
                                )}

                                {(member.MemberRegistration || (member as any).registrationDate) && (
                                  <span className="text-slate-400 dark:text-slate-500">
                                    등반: {member.MemberRegistration || (member as any).registrationDate}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {member.specialNotes && (
                             <div 
                               onClick={() => navigate('/profile', { state: { memberId: member.id, from: '/prayer' } })}
                               className="bg-rose-50/40 dark:bg-rose-950/15 border border-rose-100/50 dark:border-rose-900/20 text-rose-600 dark:text-rose-400 px-2.5 py-1.5 rounded-lg max-w-xs text-xs sm:text-[11px] cursor-pointer hover:bg-rose-100/50 dark:hover:bg-rose-900/30 transition-colors"
                               title={`${member.name}님의 개인별 현황 보기`}
                             >
                                <p className="text-xs sm:text-[9px] font-bold flex items-center mb-0.5">
                                   <AlertCircle size={10} className="mr-1 shrink-0" /> 기본 비고
                                </p>
                                <p className="text-xs sm:text-[11px] leading-relaxed">{member.specialNotes}</p>
                             </div>
                          )}
                       </div>
                    </div>
                    
                    <div className="p-3.5 sm:p-3">
                       <h4 className="text-xs sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">히스토리</h4>
                       <div className="space-y-3.5">
                          {records.length > 0 ? (
                             records.map(record => (
                                <div key={record.id} className="relative pl-4 border-l-2 border-indigo-100 dark:border-indigo-900/30">
                                   <div className="absolute -left-[4.5px] top-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900"></div>
                                   <span className="text-xs sm:text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1.5">{record.date}</span>
                                   <div className="space-y-2 sm:space-y-1.5">
                                      {hasActualPrayerContent(record.content) && (
                                        <div className="bg-indigo-50/30 dark:bg-indigo-950/20 p-3 sm:p-2.5 rounded-lg text-slate-800 dark:text-slate-200 text-sm sm:text-xs leading-relaxed border border-indigo-100/60 dark:border-indigo-900/30">
                                           <div className="flex items-center text-xs sm:text-[10px] text-indigo-600 dark:text-indigo-400 mb-1.5 font-bold">
                                             <Quote size={12} className="mr-1 shrink-0"/> 기도제목
                                           </div>
                                           <div className="space-y-1.5 sm:space-y-0.5">
                                             {parsePrayerRequests(record.content).map((line, idx) => {
                                               if (!line.text && !line.marker) return null;
                                               if (line.marker) {
                                                 return (
                                                   <div key={idx} className="flex items-start gap-1.5 sm:gap-1 leading-relaxed">
                                                     <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 min-w-[18px] sm:min-w-[14px] text-sm sm:text-xs">{line.marker}</span>
                                                     <span className="flex-1 text-slate-800 dark:text-slate-200">{line.text}</span>
                                                   </div>
                                                 );
                                               }
                                               return (
                                                 <div key={idx} className="leading-relaxed text-slate-800 dark:text-slate-200">
                                                   {line.text}
                                                 </div>
                                               );
                                             })}
                                           </div>
                                        </div>
                                      )}
                                      {record.note && (
                                        <div className="bg-amber-50/60 dark:bg-amber-950/20 p-2.5 sm:p-2 rounded-lg text-slate-800 dark:text-slate-200 text-sm sm:text-xs leading-relaxed border border-amber-100 dark:border-amber-900/30">
                                           <div className="flex items-center text-xs sm:text-[10px] text-amber-600 dark:text-amber-400 mb-1 font-bold">
                                             <FileText size={12} className="mr-1 shrink-0"/> 특이사항
                                           </div>
                                           <p className="leading-relaxed">{record.note}</p>
                                        </div>
                                      )}
                                   </div>
                                </div>
                             ))
                          ) : (
                             <div className="text-center py-2 text-slate-400 dark:text-slate-600 text-[11px]">
                                <p>등록된 이력이 없습니다.</p>
                             </div>
                          )}
                       </div>
                    </div>
                 </div>
               ))
            )}
         </div>
      )}

      {/* Photo & Prayer Focus Modal */}
      {photoModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setPhotoModal(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm sm:max-w-md md:max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Close */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-900/50">
                  얼굴 보며 기도하기
                </span>
                {photoModal.date && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {photoModal.date}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setPhotoModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title="닫기"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-center flex-1">
              {/* Photo - Tap/Click to close modal */}
              <div 
                onClick={() => setPhotoModal(null)}
                className="flex justify-center cursor-pointer group/modalphoto"
                title="사진을 터치하면 창이 닫힙니다"
              >
                {photoModal.member.photoUrl ? (
                  <img 
                    src={photoModal.member.photoUrl} 
                    alt={photoModal.member.name} 
                    className={`w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 rounded-3xl object-cover shadow-xl border-4 transition-transform active:scale-95 group-hover/modalphoto:scale-102 ${
                      isNewFamily(photoModal.member) ? 'border-lime-400' : 'border-indigo-100 dark:border-indigo-950'
                    }`}
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <div className={`w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 rounded-3xl flex items-center justify-center text-7xl font-black shadow-xl border-4 transition-transform active:scale-95 group-hover/modalphoto:scale-102 ${
                    isNewFamily(photoModal.member) 
                      ? 'bg-lime-100 dark:bg-lime-950 text-lime-800 dark:text-lime-300 border-lime-400' 
                      : 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border-indigo-100 dark:border-indigo-950'
                  }`}>
                    {photoModal.member.name.substring(0, 1)}
                  </div>
                )}
              </div>

              {/* Name & Info */}
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                    {photoModal.member.name}
                  </h3>
                  {photoModal.member.role && (
                    <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {photoModal.member.role}
                    </span>
                  )}
                  {isNewFamily(photoModal.member) && (
                    <span className="text-xs bg-lime-500 text-white font-black px-2 py-0.5 rounded-md">
                      새가족
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                  <span className="font-bold text-slate-700 dark:text-slate-200">{photoModal.member.group}</span>
                  {photoModal.member.phoneNumber && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} /> {photoModal.member.phoneNumber}
                    </span>
                  )}
                  {(photoModal.member.MemberRegistration || (photoModal.member as any).registrationDate) && (
                    <span>등반: {photoModal.member.MemberRegistration || (photoModal.member as any).registrationDate}</span>
                  )}
                </div>

                {/* Attendance Rate Badge in Modal */}
                {attendanceStatsMap[photoModal.member.id] && (
                  <div className="pt-1 flex justify-center">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full border ${
                      attendanceStatsMap[photoModal.member.id].totalRate >= 80 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' 
                        : attendanceStatsMap[photoModal.member.id].totalRate >= 50 
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' 
                          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                    }`}>
                      <CalendarDays size={13} className="shrink-0" />
                      2026년 예배 출석률 {attendanceStatsMap[photoModal.member.id].totalRate}% ({attendanceStatsMap[photoModal.member.id].totalCount}/{attendanceStatsMap[photoModal.member.id].expectedCount}회 출석)
                    </span>
                  </div>
                )}

                {photoModal.member.specialNotes && (
                  <div className="pt-1 flex justify-center">
                    <div className="inline-flex items-center text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-3 py-1 rounded-lg border border-rose-100 dark:border-rose-900/30">
                      <AlertCircle size={12} className="mr-1.5 shrink-0 text-rose-500" />
                      <span className="font-medium">{photoModal.member.specialNotes}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Prayer content if present */}
              {photoModal.recordContent && hasActualPrayerContent(photoModal.recordContent) && (
                <div className="text-left bg-indigo-50/50 dark:bg-indigo-950/30 p-4 rounded-2xl border border-indigo-100/80 dark:border-indigo-900/40 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    <Quote size={14} />
                    <span>기도제목</span>
                  </div>
                  <div className="space-y-1 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {parsePrayerRequests(photoModal.recordContent).map((line, idx) => {
                      if (!line.text && !line.marker) return null;
                      if (line.marker) {
                        return (
                          <div key={idx} className="flex items-start gap-1.5">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 min-w-[16px]">{line.marker}</span>
                            <span>{line.text}</span>
                          </div>
                        );
                      }
                      return <div key={idx}>{line.text}</div>;
                    })}
                  </div>
                </div>
              )}

              {/* Note if present */}
              {photoModal.recordNote && (
                <div className="text-left bg-amber-50/70 dark:bg-amber-950/30 p-3.5 rounded-2xl border border-amber-100 dark:border-amber-900/40 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400 mb-1">
                    <FileText size={14} />
                    <span>특이사항</span>
                  </div>
                  <p className="leading-relaxed">{photoModal.recordNote}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <button 
                onClick={() => {
                  const memberId = photoModal.member.id;
                  setPhotoModal(null);
                  navigate('/profile', { state: { memberId, from: '/prayer' } });
                }}
                className="flex-1 py-2.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-xl transition-colors"
              >
                개인 프로필 보기
              </button>
              <button 
                onClick={() => setPhotoModal(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs rounded-xl transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrayerRequests;
