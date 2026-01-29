import React, { useState, useMemo, useEffect } from 'react';
import { Member, PrayerRecord } from '../types';
import { Quote, AlertCircle, Calendar, User, Search, FileText } from 'lucide-react';
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

  // Initial load effect
  useEffect(() => {
    setSelectedDate(getClosestSunday());
  }, []);

  // When group changes, reset member selection
  useEffect(() => {
    setSelectedMemberId('');
  }, [selectedGroup]);

  // Filter members based on selected group
  const membersInGroup = useMemo(() => {
    if (!selectedGroup) return [];
    return members.filter(m => m.group === selectedGroup).sort((a, b) => a.name.localeCompare(b.name));
  }, [members, selectedGroup]);

  // View 1: By Date - Group by Small Group/Wool directly (Flattened)
  const recordsByDate = useMemo(() => {
    const records = prayerRecords.filter(r => r.date === selectedDate);
    const groups: Record<string, { member: Member; record: PrayerRecord | undefined }[]> = {};

    members.forEach(member => {
       const record = records.find(r => r.memberId === member.id);
       if (!groups[member.group]) groups[member.group] = [];
       
       // Show if there is a record OR special notes OR date-specific notes
       if (record || member.specialNotes) {
         groups[member.group].push({ member, record });
       }
    });
    return groups;
  }, [selectedDate, prayerRecords, members]);

  // View 2: By Member - Single Member History OR All in Group History
  const memberHistoryData = useMemo(() => {
    // Determine which members to show
    let targetMembers: Member[] = [];
    if (selectedMemberId) {
      const m = members.find(m => m.id === selectedMemberId);
      if (m) targetMembers = [m];
    } else if (selectedGroup) {
      targetMembers = membersInGroup;
    } else {
      return null;
    }

    if (targetMembers.length === 0) return null;

    // Build data for each target member
    return targetMembers.map(member => {
       const myRecords = prayerRecords
        .filter(r => r.memberId === member.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
       return { member, records: myRecords };
    });
  }, [selectedMemberId, selectedGroup, membersInGroup, members, prayerRecords]);

  return (
    <div className="space-y-6">
       <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">기도 제목 및 특이사항</h2>
          <p className="text-slate-500">
            {viewMode === 'date' 
              ? '매주 입력되는 기도제목과 특이사항을 소그룹/울별로 확인합니다.' 
              : '각 성도님의 기도제목 및 특이사항 히스토리를 확인합니다.'}
          </p>
        </div>
        
        <div className="flex bg-slate-200 p-1 rounded-lg">
           <button
             onClick={() => setViewMode('date')}
             className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
               viewMode === 'date' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
             }`}
           >
             <Calendar size={16} className="mr-2" /> 날짜별 보기
           </button>
           <button
             onClick={() => setViewMode('member')}
             className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
               viewMode === 'member' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
             }`}
           >
             <User size={16} className="mr-2" /> 멤버별 보기
           </button>
        </div>
      </header>

      {/* Date View Controls */}
      {viewMode === 'date' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <label className="font-bold text-slate-700">날짜 선택:</label>
          <select
            className="border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {SUNDAYS_2026.slice().reverse().map(d => ( // Show newest first
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      )}

      {/* Member View Controls */}
      {viewMode === 'member' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
             <label className="block text-xs font-bold text-slate-700 mb-1">1. 소그룹/울 선택</label>
             <select
               className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500"
               value={selectedGroup}
               onChange={(e) => setSelectedGroup(e.target.value)}
             >
               <option value="">소그룹을 선택하세요</option>
               {availableGroups.map(g => (
                 <option key={g} value={g}>{g}</option>
               ))}
             </select>
          </div>
          <div className="flex-1">
             <label className="block text-xs font-bold text-slate-700 mb-1">2. 울원(멤버) 선택 (선택 안 함: 전체 보기)</label>
             <select
               className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
               value={selectedMemberId}
               onChange={(e) => setSelectedMemberId(e.target.value)}
               disabled={!selectedGroup}
             >
               <option value="">전체 보기</option>
               {membersInGroup.map(m => (
                 <option key={m.id} value={m.id}>{m.name}</option>
               ))}
             </select>
          </div>
        </div>
      )}

      {/* Content Area - Date View */}
      {viewMode === 'date' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(recordsByDate).map(([groupName, items]) => {
            const groupItems = items as { member: Member; record: PrayerRecord | undefined }[];
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
                        <div className="flex items-baseline justify-between">
                          <h4 className="font-semibold text-slate-800">{member.name}</h4>
                          {member.specialNotes && (
                            <span className="flex items-center text-xs text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 max-w-[50%] truncate">
                              <AlertCircle size={10} className="mr-1" />
                              {member.specialNotes}
                            </span>
                          )}
                        </div>
                        
                        {record && (
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
                        )}
                        {(!record || (!record.content && !record.note)) && (
                          <p className="mt-1 text-xs text-slate-400 italic">기록 없음</p>
                        )}
                      </div>
                    ))}
                  </div>
              </div>
            );
          })}
          {Object.keys(recordsByDate).length === 0 && (
             <div className="col-span-full text-center py-12 text-slate-400">
               해당 날짜에 등록된 내용이 없습니다.
             </div>
          )}
        </div>
      )}

      {/* Content Area - Member View */}
      {viewMode === 'member' && (
         <div className="space-y-6">
            {!memberHistoryData ? (
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[400px] flex flex-col items-center justify-center p-12 text-slate-400">
                  <Search size={48} className="mb-4 opacity-10" />
                  <p>소그룹과 멤버를 선택하여 기록을 확인하세요.</p>
               </div>
            ) : (
               memberHistoryData.map(({ member, records }) => (
                 <div key={member.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                       <div className="flex justify-between items-start">
                          <div>
                             <h3 className="font-bold text-2xl text-slate-800">{member.name}</h3>
                             <p className="text-sm text-slate-500 mt-1">{member.group}</p>
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