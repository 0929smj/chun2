import React, { useState, useMemo, useEffect } from 'react';
import { Member, PrayerRecord } from '../types';
import { Quote, AlertCircle, Calendar, User, Search, FileText, X } from 'lucide-react';
import { SUNDAYS_2026 } from '../services/mockData';
import { getClosestSunday } from '../services/utils';

interface PrayerRequestsProps {
  members: Member[];
  prayerRecords: PrayerRecord[];
  availableGroups: string[];
}

const PrayerRequests: React.FC<PrayerRequestsProps> = ({ members, prayerRecords, availableGroups }) => {
  const [viewMode, setViewMode] = useState<'member' | 'date'>('date');
  const [selectedDate, setSelectedDate] = useState<string>(getClosestSunday());
  
  // Member View State
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Initial load effect
  useEffect(() => {
    setSelectedDate(getClosestSunday());
  }, []);

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

    // Priority 1: Search Query
    if (searchQuery.trim()) {
       const query = searchQuery.toLowerCase().trim();
       targetMembers = members.filter(m => String(m.name || '').toLowerCase().includes(query));
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
    <div className="space-y-6">
       <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800">기도 제목 및 특이사항</h2>
          <p className="text-sm md:text-base text-slate-500">
            {viewMode === 'date' 
              ? '매주 입력되는 기도제목과 특이사항을 소그룹/울별로 확인합니다.' 
              : '각 성도님의 기도제목 및 특이사항 히스토리를 확인합니다.'}
          </p>
        </div>
        
        <div className="flex bg-slate-200 p-1 rounded-lg w-full md:w-auto">
           <button
             onClick={() => setViewMode('date')}
             className={`flex-1 md:flex-none flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
               viewMode === 'date' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
             }`}
           >
             <Calendar size={16} className="mr-2" /> 날짜별
           </button>
           <button
             onClick={() => setViewMode('member')}
             className={`flex-1 md:flex-none flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
               viewMode === 'member' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
             }`}
           >
             <User size={16} className="mr-2" /> 멤버별
           </button>
        </div>
      </header>

      {viewMode === 'date' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <label className="font-bold text-slate-700 whitespace-nowrap">날짜 선택:</label>
          <select
            className="w-full sm:w-auto border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500"
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
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 md:gap-6 items-start md:items-end">
          <div className="w-full md:flex-1">
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center text-indigo-700">
              <Search size={14} className="mr-1" /> 이름 직접 검색 (추천)
            </label>
            <div className="relative">
              <input 
                type="text" 
                className="w-full border border-indigo-200 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/30"
                placeholder="이름을 입력하세요 (예: 김철수)"
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-indigo-400">
                <Search size={18} />
              </div>
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center pb-3 px-2 text-slate-300 font-bold text-sm">OR</div>
          <div className="md:hidden w-full text-center text-xs text-slate-400 my-0">- 또는 소그룹으로 찾기 -</div>

          <div className="w-full md:flex-1 flex gap-3">
            <div className="flex-1">
               <label className="block text-xs font-bold text-slate-500 mb-2">소그룹 선택</label>
               <select
                 className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500"
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
               <label className="block text-xs font-bold text-slate-500 mb-2">멤버 선택</label>
               <select
                 className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(recordsByDate).map(([groupName, items]) => {
            const groupItems = items as { member: Member; record: PrayerRecord }[];
            if (groupItems.length === 0) return null;
            return (
               <div key={groupName} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>
                    {groupName}
                  </h3>
                  
                  <div className="space-y-4">
                    {groupItems.map(({ member, record }) => (
                      <div key={member.id} className="relative pl-4 border-l-2 border-slate-100 hover:border-indigo-300 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             {member.photoUrl ? (
                               <img src={member.photoUrl} alt={member.name} className="w-6 h-6 rounded-full object-cover border border-slate-200" referrerPolicy="no-referrer" />
                             ) : (
                               <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500 font-bold border border-slate-300 shrink-0">
                                 {member.name.substring(0, 1)}
                               </div>
                             )}
                            <h4 className="font-semibold text-slate-800">{member.name}</h4>
                          </div>
                          {member.specialNotes && (
                            <span className="flex items-center text-xs text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 max-w-[50%] truncate">
                              <AlertCircle size={10} className="mr-1" />
                              {member.specialNotes}
                            </span>
                          )}
                        </div>
                        
                        {/* Always show content since we filtered by record existence */}
                         <>
                           {record.content && (
                             <div className="mt-2 text-sm text-slate-600 flex items-start">
                               <Quote size={14} className="text-slate-300 mr-2 mt-1 flex-shrink-0" />
                               <p>{record.content}</p>
                             </div>
                           )}
                           {record.note && (
                             <div className="mt-2 text-sm text-slate-700 flex items-start bg-yellow-50 p-2 rounded border border-yellow-100">
                               <FileText size={14} className="text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
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
             <div className="col-span-full text-center py-12 text-slate-400">
               해당 날짜에 등록된 내용이 없습니다.
             </div>
          )}
        </div>
      )}
      
      {/* ... Member View ... */}
      {viewMode === 'member' && (
         <div className="space-y-6">
            {!memberHistoryData ? (
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[400px] flex flex-col items-center justify-center p-12 text-slate-400">
                  <Search size={48} className="mb-4 opacity-10" />
                  <p>위에서 이름을 검색하거나, 소그룹을 선택하여 기록을 확인하세요.</p>
               </div>
            ) : memberHistoryData.length === 0 ? (
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[300px] flex flex-col items-center justify-center p-12 text-slate-400">
                  <AlertCircle size={48} className="mb-4 opacity-10" />
                  <p>검색 결과가 없습니다.</p>
               </div>
            ) : (
               memberHistoryData.map(({ member, records }) => (
                 <div key={member.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                       <div className="flex justify-between items-start">
                          <div className="flex items-center gap-4">
                             {member.photoUrl ? (
                               <img src={member.photoUrl} alt={member.name} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
                             ) : (
                               <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-lg text-slate-500 font-bold border-2 border-white shadow-sm shrink-0">
                                 {member.name.substring(0, 1)}
                               </div>
                             )}
                             <div>
                                <h3 className="font-bold text-2xl text-slate-800">{member.name}</h3>
                                <p className="text-sm text-slate-500 mt-1">{member.group}</p>
                             </div>
                          </div>
                          {member.specialNotes && (
                             <div className="bg-rose-50 border border-rose-100 text-rose-600 px-4 py-2 rounded-lg max-w-md">
                                <p className="text-xs font-bold flex items-center mb-1">
                                   <AlertCircle size={12} className="mr-1" /> 기본 비고
                                </p>
                                <p className="text-sm">{member.specialNotes}</p>
                             </div>
                          )}
                       </div>
                    </div>
                    
                    <div className="p-6">
                       <h4 className="text-sm font-bold text-slate-600 mb-4 uppercase tracking-wider">히스토리</h4>
                       <div className="space-y-6">
                          {records.length > 0 ? (
                             records.map(record => (
                                <div key={record.id} className="relative pl-6 border-l-2 border-indigo-100">
                                   <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-white"></div>
                                   <span className="text-sm font-bold text-indigo-600 block mb-1">{record.date}</span>
                                   <div className="space-y-2">
                                       {record.content && (
                                         <div className="bg-slate-50 p-4 rounded-lg text-slate-700 text-sm leading-relaxed border border-slate-100">
                                            <div className="flex items-center text-xs text-slate-400 mb-1">
                                              <Quote size={12} className="mr-1"/> 기도제목
                                            </div>
                                            {record.content}
                                         </div>
                                       )}
                                       {record.note && (
                                         <div className="bg-yellow-50 p-3 rounded-lg text-slate-700 text-sm leading-relaxed border border-yellow-100">
                                            <div className="flex items-center text-xs text-yellow-600 mb-1 font-bold">
                                              <FileText size={12} className="mr-1"/> 특이사항
                                            </div>
                                            {record.note}
                                         </div>
                                       )}
                                   </div>
                                </div>
                             ))
                          ) : (
                             <div className="text-center py-4 text-slate-400 text-sm">
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