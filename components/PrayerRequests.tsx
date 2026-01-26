import React, { useState, useMemo } from 'react';
import { Member, PrayerRecord } from '../types';
import { Quote, AlertCircle, Calendar, User, Search } from 'lucide-react';
import { SUNDAYS_2026 } from '../services/mockData';

interface PrayerRequestsProps {
  members: Member[];
  prayerRecords: PrayerRecord[];
}

const PrayerRequests: React.FC<PrayerRequestsProps> = ({ members, prayerRecords }) => {
  const [viewMode, setViewMode] = useState<'member' | 'date'>('date');
  const [selectedDate, setSelectedDate] = useState<string>(SUNDAYS_2026[0]);
  const [searchTerm, setSearchTerm] = useState('');

  // View 1: By Date - Group by Small Group/Wool directly (Flattened)
  const recordsByDate = useMemo(() => {
    const records = prayerRecords.filter(r => r.date === selectedDate);
    // Group: "Love A" -> [Members...]
    const groups: Record<string, { member: Member; record: PrayerRecord | undefined }[]> = {};

    members.forEach(member => {
       const record = records.find(r => r.memberId === member.id);
       if (!groups[member.group]) groups[member.group] = [];
       
       if (record || member.specialNotes) {
         groups[member.group].push({ member, record });
       }
    });
    return groups;
  }, [selectedDate, prayerRecords, members]);

  // View 2: By Member - Timeline
  const recordsByMember = useMemo(() => {
    return members
      .filter(m => m.name.includes(searchTerm) || m.group.includes(searchTerm))
      .map(member => {
        const myRecords = prayerRecords
          .filter(r => r.memberId === member.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { member, records: myRecords };
      });
  }, [members, prayerRecords, searchTerm]);

  return (
    <div className="space-y-6">
       <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">기도 제목 및 특이사항</h2>
          <p className="text-slate-500">
            {viewMode === 'date' 
              ? '매주 입력되는 기도제목을 소그룹/울별로 모아서 확인합니다.' 
              : '각 성도님의 기도제목 히스토리를 확인합니다.'}
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
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search size={20} className="text-slate-400" />
          </div>
          <input 
            type="text"
            className="block w-full p-4 pl-10 text-sm text-slate-900 border border-slate-300 rounded-xl bg-white focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="이름 또는 소그룹/울 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {/* Content Area - Date View */}
      {viewMode === 'date' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(recordsByDate).map(([groupName, items]) => {
            if (items.length === 0) return null;
            return (
               <div key={groupName} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>
                    {groupName}
                  </h3>
                  
                  <div className="space-y-4">
                    {items.map(({ member, record }) => (
                      <div key={member.id} className="relative pl-4 border-l-2 border-slate-100 hover:border-indigo-300 transition-colors">
                        <div className="flex items-baseline justify-between">
                          <h4 className="font-semibold text-slate-800">{member.name}</h4>
                          {member.specialNotes && (
                            <span className="flex items-center text-xs text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                              <AlertCircle size={10} className="mr-1" />
                              {member.specialNotes}
                            </span>
                          )}
                        </div>
                        
                        {record ? (
                          <div className="mt-2 text-sm text-slate-600 flex items-start">
                            <Quote size={14} className="text-slate-300 mr-2 mt-1 flex-shrink-0" />
                            <p>{record.content}</p>
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400 italic">이번 주 기도제목 없음</p>
                        )}
                      </div>
                    ))}
                  </div>
              </div>
            );
          })}
          {Object.keys(recordsByDate).length === 0 && (
             <div className="col-span-full text-center py-12 text-slate-400">
               해당 날짜에 등록된 기도제목이 없습니다.
             </div>
          )}
        </div>
      )}

      {/* Content Area - Member View */}
      {viewMode === 'member' && (
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {recordsByMember.map(({ member, records }) => (
               <div key={member.id} className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[400px]">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                     <div className="flex justify-between items-start">
                        <div>
                           <h3 className="font-bold text-lg text-slate-800">{member.name}</h3>
                           <p className="text-xs text-slate-500 mt-1">{member.group}</p>
                        </div>
                        {member.specialNotes && (
                           <div className="bg-rose-50 text-rose-500 p-2 rounded-full" title={member.specialNotes}>
                              <AlertCircle size={16} />
                           </div>
                        )}
                     </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
                     {records.length > 0 ? (
                        records.map(record => (
                           <div key={record.id} className="relative pl-4 border-l-2 border-indigo-100">
                              <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-400"></div>
                              <span className="text-xs font-bold text-indigo-600 block mb-1">{record.date}</span>
                              <p className="text-sm text-slate-600">{record.content}</p>
                           </div>
                        ))
                     ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                           <Quote size={24} className="mb-2 opacity-20" />
                           <p>등록된 기도제목 이력이 없습니다.</p>
                        </div>
                     )}
                  </div>
               </div>
            ))}
         </div>
      )}
    </div>
  );
};

export default PrayerRequests;