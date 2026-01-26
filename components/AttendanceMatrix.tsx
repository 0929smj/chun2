import React, { useState, useMemo } from 'react';
import { Member, AttendanceRecord, AttendanceType, MeetingStatus } from '../types';
import { SUNDAYS_2024 } from '../services/mockData';
import { Check } from 'lucide-react';

interface AttendanceMatrixProps {
  members: Member[];
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
  onToggleAttendance: (memberId: string, date: string, type: AttendanceType) => void;
}

const AttendanceMatrix: React.FC<AttendanceMatrixProps> = ({ members, records, meetingStatus, onToggleAttendance }) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [filterGroup, setFilterGroup] = useState<string>('all');

  const groups = useMemo(() => Array.from(new Set(members.map(m => m.group))), [members]);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Filter Sundays for the selected month
  const currentMonthSundays = useMemo(() => {
    return SUNDAYS_2024.filter(date => new Date(date).getMonth() === selectedMonth);
  }, [selectedMonth]);

  // Filter Members
  const filteredMembers = useMemo(() => {
    return filterGroup === 'all' ? members : members.filter(m => m.group === filterGroup);
  }, [members, filterGroup]);

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

  const calculateTotal = (memberId: string, type: AttendanceType) => {
    // Only count if meeting was NOT canceled
    return records.filter(r => {
      const canceled = isMeetingCanceled(r.date, type);
      return !canceled && r.memberId === memberId && currentMonthSundays.includes(r.date) && r.types.includes(type);
    }).length;
  };

  // Render Cell Logic
  const renderCell = (memberId: string, date: string, type: AttendanceType, activeColorClass: string, hoverClass: string) => {
    const canceled = isMeetingCanceled(date, type);
    
    if (canceled) {
      return (
        <td key={`${memberId}-${date}-${type}`} className="px-2 py-2 border border-slate-200 text-center bg-slate-100 text-slate-400">
           -
        </td>
      );
    }

    const attended = getStatus(memberId, date, type);

    return (
      <td 
        key={`${memberId}-${date}-${type}`} 
        onClick={() => onToggleAttendance(memberId, date, type)}
        className={`px-2 py-2 border border-slate-200 text-center cursor-pointer transition-colors ${hoverClass}`}
      >
        {attended && (
          <div className={`flex justify-center ${activeColorClass}`}>
             <Check size={16} strokeWidth={3} />
          </div>
        )}
      </td>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">출석 상세 현황</h2>
          <p className="text-slate-500">클릭하여 출석 상태를 바로 수정할 수 있습니다. (회색 칸은 모임 없음)</p>
        </div>
        
        <div className="flex gap-4">
            <select
              className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-32 p-2.5"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {months.map((m, idx) => (
                <option key={m} value={idx}>{m}월</option>
              ))}
            </select>

            <select
              className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-40 p-2.5"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="all">전체 소그룹/울</option>
              {groups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left text-slate-500 border-collapse">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 sticky left-0 bg-slate-50 z-20 w-24 border border-slate-200">이름</th>
                <th scope="col" className="px-4 py-3 w-32 border border-slate-200">소그룹/울</th>
                <th scope="col" className="px-2 py-3 w-16 border border-slate-200 text-center">구분</th>
                {currentMonthSundays.map(date => (
                  <th key={date} scope="col" className="px-2 py-3 text-center border border-slate-200 min-w-[50px]">
                    {date.substring(5)}
                  </th>
                ))}
                <th scope="col" className="px-2 py-3 text-center border border-slate-200 min-w-[50px]">계</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member, mIdx) => (
                <React.Fragment key={member.id}>
                  {/* Row 1: Worship */}
                  <tr className="bg-white border-b hover:bg-slate-50">
                    <td rowSpan={3} className={`px-4 py-3 font-medium text-slate-900 sticky left-0 bg-white z-10 border border-slate-200 ${mIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      {member.name}
                    </td>
                    <td rowSpan={3} className="px-4 py-3 border border-slate-200">
                      <div className="font-semibold text-slate-700">{member.group}</div>
                    </td>
                    <td className="px-2 py-2 text-center text-xs font-bold text-blue-600 border border-slate-200 bg-blue-50">예배</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Worship, 'text-blue-600', 'hover:bg-blue-50')
                    )}
                    <td className="px-2 py-2 text-center font-bold text-slate-700 border border-slate-200 bg-slate-50">
                      {calculateTotal(member.id, AttendanceType.Worship)}
                    </td>
                  </tr>
                  
                  {/* Row 2: Gathering */}
                  <tr className="bg-white border-b hover:bg-slate-50">
                    <td className="px-2 py-2 text-center text-xs font-bold text-indigo-600 border border-slate-200 bg-indigo-50">집회</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Gathering, 'text-indigo-600', 'hover:bg-indigo-50')
                    )}
                    <td className="px-2 py-2 text-center font-bold text-slate-700 border border-slate-200 bg-slate-50">
                      {calculateTotal(member.id, AttendanceType.Gathering)}
                    </td>
                  </tr>

                  {/* Row 3: Wool */}
                  <tr className="bg-white border-b hover:bg-slate-50">
                    <td className="px-2 py-2 text-center text-xs font-bold text-emerald-600 border border-slate-200 bg-emerald-50">울</td>
                    {currentMonthSundays.map(date => 
                      renderCell(member.id, date, AttendanceType.Wool, 'text-emerald-600', 'hover:bg-emerald-50')
                    )}
                    <td className="px-2 py-2 text-center font-bold text-slate-700 border border-slate-200 bg-slate-50">
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