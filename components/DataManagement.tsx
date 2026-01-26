import React, { useState, useMemo } from 'react';
import { Member, AttendanceRecord, AttendanceType, MeetingStatus } from '../types';
import { Plus, Edit2, Save, Trash2, X, Phone, ArrowUpDown } from 'lucide-react';
import { SUNDAYS_2024 } from '../services/mockData';

interface DataManagementProps {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
  onToggleAttendance: (memberId: string, date: string, type: AttendanceType) => void;
}

const DataManagement: React.FC<DataManagementProps> = ({ members, setMembers, records, meetingStatus, onToggleAttendance }) => {
  const [activeTab, setActiveTab] = useState<'members' | 'attendance'>('members');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  
  // New Member State
  const [newMember, setNewMember] = useState<Partial<Member>>({ group: '', name: '', phoneNumber: '' });
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: keyof Member; direction: 'asc' | 'desc' } | null>(null);

  // Attendance Filter States
  const [selectedDate, setSelectedDate] = useState<string>(SUNDAYS_2024[SUNDAYS_2024.length - 1]);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

  // Get unique groups and sort them for the dropdown
  const allGroups = useMemo(() => Array.from(new Set(members.map(m => m.group))).sort(), [members]);

  const handleUpdateMember = (id: string, field: keyof Member, value: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleAddMember = () => {
    if (!newMember.name || !newMember.group) return;
    const id = `m-${Date.now()}`;
    setMembers(prev => [...prev, { 
      id, 
      name: newMember.name!, 
      group: newMember.group!, 
      wool: newMember.group!, // Keeping them synced
      phoneNumber: newMember.phoneNumber || '',
      latestPrayerRequest: '', 
      specialNotes: '' 
    }]);
    setNewMember({ group: '', name: '', phoneNumber: '' });
  };

  // Disabled per requirement
  const handleDeleteMember = (id: string) => {
    // Logic kept but button will be disabled
    if (confirm('정말로 삭제하시겠습니까? 관련된 출석 데이터도 함께 삭제되지 않습니다 (유지됨).')) {
      setMembers(prev => prev.filter(m => m.id !== id));
    }
  };

  // Sorting Logic
  const handleSort = (key: keyof Member) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedMembers = useMemo(() => {
    let sortableItems = [...members];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [members, sortConfig]);

  // Filter members for attendance view
  const filteredMembersForAttendance = useMemo(() => {
    if (selectedGroupFilter === 'all') return members;
    return members.filter(m => m.group === selectedGroupFilter);
  }, [members, selectedGroupFilter]);

  // Check if meeting is canceled
  const isMeetingCanceled = (date: string, type: AttendanceType) => {
    return meetingStatus.some(s => s.date === date && s.type === type && s.isCanceled);
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">데이터 관리</h2>
           <p className="text-slate-500">멤버 정보를 수정하거나 새로운 출석을 입력합니다.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <ul className="flex flex-wrap -mb-px text-sm font-medium text-center text-slate-500">
          <li className="mr-2">
            <button
              onClick={() => setActiveTab('members')}
              className={`inline-block p-4 rounded-t-lg border-b-2 ${activeTab === 'members' ? 'text-indigo-600 border-indigo-600' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}
            >
              멤버 관리
            </button>
          </li>
          <li className="mr-2">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`inline-block p-4 rounded-t-lg border-b-2 ${activeTab === 'attendance' ? 'text-indigo-600 border-indigo-600' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}
            >
              출석 입력
            </button>
          </li>
        </ul>
      </div>

      {activeTab === 'members' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <div className="flex flex-col md:flex-row gap-4 mb-6 items-end bg-slate-50 p-4 rounded-lg">
             <div className="flex-1 w-full">
               <label className="block text-xs font-medium text-slate-700 mb-1">이름</label>
               <input 
                  type="text" 
                  className="w-full border border-slate-300 rounded p-2 text-sm" 
                  value={newMember.name || ''} 
                  onChange={e => setNewMember({...newMember, name: e.target.value})}
                  placeholder="이름 입력"
                />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-xs font-medium text-slate-700 mb-1">소그룹/울</label>
               <select 
                  className="w-full border border-slate-300 rounded p-2 text-sm bg-white" 
                  value={newMember.group || ''} 
                  onChange={e => setNewMember({...newMember, group: e.target.value, wool: e.target.value})}
                >
                  <option value="">선택하세요</option>
                  {allGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
             </div>
             <div className="flex-1 w-full">
               <label className="block text-xs font-medium text-slate-700 mb-1">연락처</label>
               <input 
                  type="text" 
                  className="w-full border border-slate-300 rounded p-2 text-sm" 
                  value={newMember.phoneNumber || ''} 
                  onChange={e => setNewMember({...newMember, phoneNumber: e.target.value})}
                  placeholder="010-0000-0000"
                />
             </div>
             <button 
                onClick={handleAddMember}
                className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 flex items-center justify-center w-full md:w-auto"
             >
               <Plus size={16} className="mr-1" /> 추가
             </button>
           </div>

           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                  <tr>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center">
                        이름
                        <ArrowUpDown size={14} className="ml-1 text-slate-400" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('group')}
                    >
                      <div className="flex items-center">
                        소그룹/울
                        <ArrowUpDown size={14} className="ml-1 text-slate-400" />
                      </div>
                    </th>
                    <th className="px-6 py-3">연락처</th>
                    <th className="px-6 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map(member => (
                    <tr key={member.id} className="bg-white border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{member.name}</td>
                      <td className="px-6 py-4">
                        {editingMember?.id === member.id ? (
                           <select 
                             className="w-full border p-1 rounded bg-white" 
                             value={editingMember.group || ''} 
                             onChange={e => setEditingMember({...editingMember, group: e.target.value, wool: e.target.value})}
                           >
                             {allGroups.map(g => (
                               <option key={g} value={g}>{g}</option>
                             ))}
                           </select>
                        ) : (
                          member.group
                        )}
                      </td>
                      <td className="px-6 py-4">
                         {editingMember?.id === member.id ? (
                           <input 
                             type="text" 
                             className="w-full border p-1 rounded" 
                             value={editingMember.phoneNumber || ''} 
                             onChange={e => setEditingMember({...editingMember, phoneNumber: e.target.value})}
                           />
                        ) : (
                          <div className="flex items-center">
                            <Phone size={14} className="mr-2 text-slate-400" />
                            {member.phoneNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingMember?.id === member.id ? (
                           <div className="flex justify-end gap-2">
                              <button onClick={() => {
                                handleUpdateMember(member.id, 'group', editingMember.group);
                                handleUpdateMember(member.id, 'wool', editingMember.group);
                                handleUpdateMember(member.id, 'phoneNumber', editingMember.phoneNumber || '');
                                setEditingMember(null);
                              }} className="text-emerald-600 hover:text-emerald-900"><Save size={18} /></button>
                              <button onClick={() => setEditingMember(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                           </div>
                        ) : (
                           <div className="flex justify-end gap-2">
                             <button onClick={() => setEditingMember(member)} className="text-indigo-600 hover:text-indigo-900"><Edit2 size={18} /></button>
                             <button 
                               className="text-slate-300 cursor-not-allowed" 
                               disabled={true}
                               title="DB에서 관리되므로 삭제가 비활성화되었습니다."
                             >
                               <Trash2 size={18} />
                             </button>
                           </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <div className="mb-6 space-y-4">
              {/* Date Selector */}
              <div className="flex items-center gap-4">
                <label className="font-bold text-slate-700 w-24">날짜 선택:</label>
                <select 
                  className="border border-slate-300 rounded p-2 text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                >
                  {SUNDAYS_2024.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Group Checklist Selector */}
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <label className="font-bold text-slate-700 w-24 mt-2">소그룹/울:</label>
                <div className="flex flex-wrap gap-2">
                   <button
                     onClick={() => setSelectedGroupFilter('all')}
                     className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                       selectedGroupFilter === 'all' 
                         ? 'bg-slate-800 text-white border-slate-800' 
                         : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                     }`}
                   >
                     전체 보기
                   </button>
                   {allGroups.map(g => (
                     <button
                       key={g}
                       onClick={() => setSelectedGroupFilter(g)}
                       className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                         selectedGroupFilter === g 
                           ? 'bg-indigo-600 text-white border-indigo-600' 
                           : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                       }`}
                     >
                       {g}
                     </button>
                   ))}
                </div>
              </div>
           </div>

           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                   <tr>
                     <th className="px-6 py-3">이름</th>
                     <th className="px-6 py-3">소그룹/울</th>
                     <th className="px-6 py-3 text-center">예배</th>
                     <th className="px-6 py-3 text-center">집회</th>
                     <th className="px-6 py-3 text-center">울모임</th>
                   </tr>
                </thead>
                <tbody>
                  {filteredMembersForAttendance.map(member => {
                    const record = records.find(r => r.memberId === member.id && r.date === selectedDate);
                    const types = record?.types || [];
                    
                    return (
                      <tr key={member.id} className="bg-white border-b hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{member.name}</td>
                        <td className="px-6 py-4">{member.group}</td>
                        <td className="px-6 py-4 text-center">
                          {isMeetingCanceled(selectedDate, AttendanceType.Worship) ? (
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">모임 없음</span>
                          ) : (
                            <button 
                              onClick={() => onToggleAttendance(member.id, selectedDate, AttendanceType.Worship)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors mx-auto ${types.includes(AttendanceType.Worship) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}
                            >
                              <span className="text-xs font-bold">예</span>
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isMeetingCanceled(selectedDate, AttendanceType.Gathering) ? (
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">모임 없음</span>
                          ) : (
                             <button 
                              onClick={() => onToggleAttendance(member.id, selectedDate, AttendanceType.Gathering)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors mx-auto ${types.includes(AttendanceType.Gathering) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}
                            >
                              <span className="text-xs font-bold">집</span>
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isMeetingCanceled(selectedDate, AttendanceType.Wool) ? (
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">모임 없음</span>
                          ) : (
                             <button 
                              onClick={() => onToggleAttendance(member.id, selectedDate, AttendanceType.Wool)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors mx-auto ${types.includes(AttendanceType.Wool) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}
                            >
                              <span className="text-xs font-bold">울</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMembersForAttendance.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400">
                        해당 소그룹에 속한 멤버가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
             </table>
           </div>
        </div>
      )}
    </div>
  );
};

export default DataManagement;