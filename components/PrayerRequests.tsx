import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Member, PrayerRecord } from '../types';
import { Quote, AlertCircle, Calendar, User, Search, FileText, X } from 'lucide-react';
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
}

const PrayerRequests: React.FC<PrayerRequestsProps> = ({ members, prayerRecords, availableGroups }) => {
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
  const [selectedDate, setSelectedDate] = useState<string>(() => loadSessionState<string>('prayer_selectedDate', getClosestSunday()));
  
  // Member View State
  const [selectedGroup, setSelectedGroup] = useState<string>(() => loadSessionState<string>('prayer_selectedGroup', ''));
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => loadSessionState<string>('prayer_selectedMemberId', ''));
  const [searchQuery, setSearchQuery] = useState<string>(() => loadSessionState<string>('prayer_searchQuery', ''));

  // Sync state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('prayer_viewMode', JSON.stringify(viewMode));
  }, [viewMode]);

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
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-[0_1px_3px_rgba(0,0,0,0.01)] flex items-center gap-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">날짜 선택:</label>
          <select
            className="w-full sm:w-44 border border-slate-200 dark:border-slate-800 rounded-lg px-2 h-8 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {SUNDAYS_2026.slice().reverse().map(d => ( 
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
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
        <div className="columns-1 sm:columns-[310px] gap-3.5 space-y-0">
          {Object.entries(recordsByDate).map(([groupName, items]) => {
            const groupItems = items as { member: Member; record: PrayerRecord }[];
            if (groupItems.length === 0) return null;
            return (
               <div key={groupName} className="break-inside-avoid mb-3.5 bg-white dark:bg-slate-900 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.01)] border border-slate-200/50 dark:border-slate-800/80 p-3.5">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-2"></span>
                    {groupName}
                  </h3>
                  
                  <div className="space-y-3">
                    {groupItems.map(({ member, record }) => (
                      <div key={member.id} className={`relative pl-3 border-l-2 transition-colors ${isNewFamily(member) ? 'border-lime-400 bg-lime-50/10 dark:bg-lime-950/5' : 'border-slate-100 dark:border-slate-800/60 hover:border-indigo-300'}`}>
                        <div className="flex items-center justify-between">
                          <div 
                            onClick={() => navigate('/profile', { state: { memberId: member.id } })}
                            className="flex items-center gap-1.5 cursor-pointer group/name hover:opacity-80 transition-opacity"
                            title={`${member.name}님의 개인별 현황 보기`}
                          >
                             {member.photoUrl ? (
                               <img 
                                 src={member.photoUrl} 
                                 alt={member.name} 
                                 className={`w-5 h-5 rounded-full object-cover ${isNewFamily(member) ? 'border-2 border-lime-400 dark:border-lime-500' : 'border border-slate-200 dark:border-slate-700'}`} 
                                 referrerPolicy="no-referrer" 
                               />
                             ) : (
                               <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                 isNewFamily(member) 
                                   ? 'bg-lime-100 dark:bg-lime-950/60 text-lime-800 dark:text-lime-300 border-2 border-lime-400 dark:border-lime-500' 
                                   : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                               }`}>
                                 {member.name.substring(0, 1)}
                               </div>
                             )}
                            <h4 className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover/name:text-indigo-600 dark:group-hover/name:text-indigo-400 group-hover/name:underline flex items-center gap-1 transition-colors">
                              {member.name}
                              {isNewFamily(member) && <span className="text-[8px] bg-lime-500 text-white font-black px-1 rounded leading-none">새가족</span>}
                            </h4>
                          </div>
                          {member.specialNotes && (
                            <span 
                              onClick={() => navigate('/profile', { state: { memberId: member.id } })}
                              className="flex items-center text-[9px] text-rose-500 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/25 px-1.5 py-0.5 rounded-full border border-rose-100/40 dark:border-rose-900/30 max-w-[50%] truncate cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                              title={`${member.name}님의 개인별 현황 보기`}
                            >
                              <AlertCircle size={8} className="mr-0.5" />
                              {member.specialNotes}
                            </span>
                          )}
                        </div>
                        
                        {/* Always show content since we filtered by record existence */}
                         <>
                           {hasActualPrayerContent(record.content) && (
                             <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                               <Quote size={10} className="text-slate-300 dark:text-slate-700 mt-0.5 flex-shrink-0" />
                               <div className="flex-1 space-y-0.5 text-xs leading-snug">
                                 {parsePrayerRequests(record.content).map((line, idx) => {
                                   if (!line.text && !line.marker) return null;
                                   if (line.marker) {
                                     return (
                                       <div key={idx} className="flex items-start gap-1 leading-snug">
                                         <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 min-w-[14px]">{line.marker}</span>
                                         <span className="flex-1">{line.text}</span>
                                       </div>
                                     );
                                   }
                                   return (
                                     <div key={idx} className="leading-snug">
                                       {line.text}
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           )}
                           {record.note && (
                             <div className="mt-1.5 text-xs text-slate-700 dark:text-slate-350 flex items-start bg-yellow-50/50 dark:bg-yellow-950/15 p-1.5 rounded border border-yellow-100/50 dark:border-yellow-900/20">
                               <FileText size={10} className="text-yellow-600 dark:text-yellow-400 mr-1.5 mt-0.5 flex-shrink-0" />
                               <p>{record.note}</p>
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
                          <div 
                            onClick={() => navigate('/profile', { state: { memberId: member.id } })}
                            className="flex items-center gap-3 cursor-pointer group/name hover:opacity-80 transition-opacity"
                            title={`${member.name}님의 개인별 현황 보기`}
                          >
                             {member.photoUrl ? (
                               <img 
                                 src={member.photoUrl} 
                                 alt={member.name} 
                                 className={`w-8 h-8 rounded-full object-cover shadow-xs ${
                                   isNewFamily(member) 
                                     ? 'border-2 border-lime-400 dark:border-lime-500' 
                                     : 'border border-slate-200 dark:border-slate-700'
                                 }`} 
                                 referrerPolicy="no-referrer" 
                               />
                             ) : (
                               <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-xs shrink-0 ${
                                 isNewFamily(member)
                                   ? 'bg-lime-100 dark:bg-lime-950/60 text-lime-800 dark:text-lime-300 border-2 border-lime-400 dark:border-lime-500'
                                   : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                               }`}>
                                 {member.name.substring(0, 1)}
                               </div>
                             )}
                             <div>
                                 <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover/name:text-indigo-600 dark:group-hover/name:text-indigo-400 group-hover/name:underline flex items-center gap-1.5 transition-colors">{member.name}{isNewFamily(member) && <span className="text-[9px] bg-lime-500 text-white font-black px-1.5 py-0.2 rounded leading-none animate-pulse">새가족</span>}</h3>
                                 <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{member.group}</p>
                             </div>
                          </div>
                          {member.specialNotes && (
                             <div 
                               onClick={() => navigate('/profile', { state: { memberId: member.id } })}
                               className="bg-rose-50/40 dark:bg-rose-950/15 border border-rose-100/50 dark:border-rose-900/20 text-rose-600 dark:text-rose-400 px-2.5 py-1.5 rounded-lg max-w-xs text-xs cursor-pointer hover:bg-rose-100/50 dark:hover:bg-rose-900/30 transition-colors"
                               title={`${member.name}님의 개인별 현황 보기`}
                             >
                                <p className="text-[9px] font-bold flex items-center mb-0.5">
                                   <AlertCircle size={10} className="mr-1" /> 기본 비고
                                </p>
                                <p className="text-[11px] leading-normal">{member.specialNotes}</p>
                             </div>
                          )}
                       </div>
                    </div>
                    
                    <div className="p-3">
                       <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">히스토리</h4>
                       <div className="space-y-3.5">
                          {records.length > 0 ? (
                             records.map(record => (
                                <div key={record.id} className="relative pl-4 border-l-2 border-indigo-100 dark:border-indigo-900/30">
                                   <div className="absolute -left-[4.5px] top-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900"></div>
                                   <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1">{record.date}</span>
                                   <div className="space-y-1.5">
                                      {hasActualPrayerContent(record.content) && (
                                        <div className="bg-slate-50/50 dark:bg-slate-950/20 p-2.5 rounded-lg text-slate-700 dark:text-slate-300 text-xs leading-snug border border-slate-100 dark:border-slate-800/60">
                                           <div className="flex items-center text-[10px] text-slate-400 dark:text-slate-500 mb-1 font-bold">
                                             <Quote size={10} className="mr-1"/> 기도제목
                                           </div>
                                           <div className="space-y-0.5">
                                             {parsePrayerRequests(record.content).map((line, idx) => {
                                               if (!line.text && !line.marker) return null;
                                               if (line.marker) {
                                                 return (
                                                   <div key={idx} className="flex items-start gap-1 leading-snug">
                                                     <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 min-w-[14px]">{line.marker}</span>
                                                     <span className="flex-1">{line.text}</span>
                                                   </div>
                                                 );
                                               }
                                               return (
                                                 <div key={idx} className="leading-snug">
                                                   {line.text}
                                                 </div>
                                               );
                                             })}
                                           </div>
                                        </div>
                                      )}
                                      {record.note && (
                                        <div className="bg-yellow-50/50 dark:bg-yellow-950/15 p-2 rounded-lg text-slate-700 dark:text-slate-300 text-xs leading-relaxed border border-yellow-100/40 dark:border-yellow-900/20">
                                           <div className="flex items-center text-[10px] text-yellow-600 dark:text-yellow-400 mb-0.5 font-bold">
                                             <FileText size={10} className="mr-1"/> 특이사항
                                           </div>
                                           {record.note}
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
    </div>
  );
};

export default PrayerRequests;
