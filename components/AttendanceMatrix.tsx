import React, { useState, useMemo } from 'react';
import { Member, AttendanceRecord, AttendanceType, MeetingStatus } from '../types';
import { SUNDAYS_2026 } from '../services/mockData';
import { Check, Search, MessageSquare } from 'lucide-react';

interface AttendanceMatrixProps {
  members: Member[];
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
  availableGroups: string[];
  onToggleAttendance: (memberId: string, date: string, type: AttendanceType) => void;
}

const AttendanceMatrix: React.FC<AttendanceMatrixProps> = ({ members, records, meetingStatus, availableGroups, onToggleAttendance }) => {
  // Store selectedMonth as string to handle 'all'
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth())); 
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Filter Sundays for the selected month or all year
  const currentMonthSundays = useMemo(() => {
    if (selectedMonth === 'all') {
      return SUNDAYS_2026;
    }
    const monthIndex = parseInt(selectedMonth, 10);
    return SUNDAYS_2026.filter(date => new Date(date).getMonth() === monthIndex);
  }, [selectedMonth]);

  // Filter Members
  const filteredMembers = useMemo(() => {
    let result = members;

    // Filter by Group
    if (filterGroup !== 'all') {
      result = result.filter(m => m.group === filterGroup);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(m => m.name.toLowerCase().includes(query));
    }

    return result;
  }, [members, filterGroup, searchQuery]);

  // Sorting: Group -> Name
  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      return a.name.localeCompare(b.name);
    });
  }, [filteredMembers]);

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
          className={`px-1 md:px-2 py-2 border border-slate-200 text-center cursor-pointer transition-colors ${hoverClass}`}
        >
          <div className={`flex justify-center ${activeColorClass}`}>
             <Check size={16} strokeWidth={3} />
          </div>
        </td>
       );
    }

    if (canceled) {
      return (
        <td key={`${memberId}-${date}-${type}`} className="px-1 md:px-2 py-2 border border-slate-200 text-center bg-slate-100 text-slate-400">
           -
        </td>
      );
    }

    return (
      <td 
        key={`${memberId}-${date}-${type}`} 
        onClick={() => onToggleAttendance(memberId, date, type)}
        className={`px-1 md:px-2 py-2 border border-slate-200 text-center cursor-pointer transition-colors ${hoverClass}`}
      >
      </td>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800">출석 상세 현황</h2>
          <p className="text-sm text-slate-500">클릭하여 출석 상태를 바로 수정할 수 있습니다.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-none">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search size={16} className="text-slate-400" />
              </div>
              <input 
                type="text" 
                className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:w-40 pl-10 p-2.5" 
                placeholder="이름 검색" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <select
                className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:w-32 p-2.5 flex-1"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="all">1년 전체</option>
                {months.map((m, idx) => (
                  <option key={m} value={idx}>{m}월</option>
                ))}
              </select>

              <select
                className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:w-40 p-2.5 flex-1"
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
              >
                <option value="all">전체 소그룹/울</option>
                {availableGroups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left text-slate-500 border-collapse">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
              <tr>
                <th scope="col" className="px-2 md:px-4 py-3 sticky left-0 bg-slate-50 z-20 w-20 md:w-24 border border-slate-200">이름</th>
                <th scope="col" className="px-2 md:px-4 py-3 w-24 md:w-32 border border-slate-200">소그룹</th>
                <th scope="col" className="px-2 py-3 w-12 md:w-16 border border-slate-200 text-center">구분</th>
                {currentMonthSundays.map(date => (
                  <th key={date} scope="col" className="px-1 md:px-2 py-3 text-center border border-slate-200 min-w-[50px]">
                    <div className="flex flex-col items-center">
                      <span>{date.substring(5)}</span>
                      {getEventName(date) && (
                        <span className="text-[10px] text-slate-400 font-normal mt-1 truncate max-w-[50px]">{getEventName(date)}</span>
                      )}
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-1 md:px-2 py-3 text-center border border-slate-200 min-w-[40px] md:min-w-[50px]">계</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member, mIdx) => (
                <React.Fragment key={member.id}>
                  {/* Row 1: Worship */}
                  <tr className="bg-white border-b hover:bg-slate-50">
                    <td rowSpan={3} className={`px-2 md:px-4 py-3 font-medium text-slate-900 sticky left-0 bg-white z-10 border border-slate-200 ${mIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} group relative`}>
                      <div className="flex items-center gap-2">
                         {member.photoUrl ? (
                           <img src={member.photoUrl} alt={member.name} className="w-6 h-6 md:w-8 md:h-8 rounded-full object-cover border border-slate-200" referrerPolicy="no-referrer" />
                         ) : (
                           <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] md:text-xs text-slate-500 font-bold border border-slate-300 shrink-0">
                             {member.name.substring(0, 1)}
                           </div>
                         )}
                         <span className="cursor-default decoration-dotted underline underline-offset-4 decoration-slate-300 whitespace-nowrap">{member.name}</span>
                      </div>
                      
                      {/* Modern Tooltip for Memo - Adjusted for mobile position */}
                      {member.specialNotes && (
                        <div className="hidden sm:block absolute left-full top-0 ml-2 w-56 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                           <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 shadow-xl">
                              <div className="flex items-center gap-1.5 mb-1 text-slate-300 font-bold border-b border-slate-600 pb-1">
                                 <MessageSquare size={10} /> 비고 (Memo)
                              </div>
                              <p className="leading-relaxed">{member.specialNotes}</p>
                              {/* Arrow */}
                              <div className="absolute top-4 -left-1 w-2 h-2 bg-slate-800 transform rotate-45"></div>
                           </div>
                        </div>
                      )}
                    </td>
                    <td rowSpan={3} className="px-2 md:px-4 py-3 border border-slate-200">
                      <div className="font-semibold text-slate-700 text-xs md:text-sm">{member.group}</div>
                    </td>
                    <td className="px-1 md:px-2 py-2 text-center text-[10px] md:text-xs font-bold text-blue-600 border border-slate-200 bg-blue-50">예배</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Worship, 'text-blue-600', 'hover:bg-blue-50')
                    )}
                    <td className="px-1 md:px-2 py-2 text-center font-bold text-slate-700 border border-slate-200 bg-slate-50">
                      {calculateTotal(member.id, AttendanceType.Worship)}
                    </td>
                  </tr>
                  
                  {/* Row 2: Gathering */}
                  <tr className="bg-white border-b hover:bg-slate-50">
                    <td className="px-1 md:px-2 py-2 text-center text-[10px] md:text-xs font-bold text-indigo-600 border border-slate-200 bg-indigo-50">집회</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Gathering, 'text-indigo-600', 'hover:bg-indigo-50')
                    )}
                    <td className="px-1 md:px-2 py-2 text-center font-bold text-slate-700 border border-slate-200 bg-slate-50">
                      {calculateTotal(member.id, AttendanceType.Gathering)}
                    </td>
                  </tr>

                  {/* Row 3: Wool */}
                  <tr className="bg-white border-b hover:bg-slate-50">
                    <td className="px-1 md:px-2 py-2 text-center text-[10px] md:text-xs font-bold text-emerald-600 border border-slate-200 bg-emerald-50">울</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Wool, 'text-emerald-600', 'hover:bg-emerald-50')
                    )}
                    <td className="px-1 md:px-2 py-2 text-center font-bold text-slate-700 border border-slate-200 bg-slate-50">
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