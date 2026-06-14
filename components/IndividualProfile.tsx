import React, { useState, useMemo } from 'react';
import { Member, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus } from '../types';
import { Search, User, Phone, StickyNote, Calendar, Quote, TrendingUp, AlertCircle, FileText } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as RechartsTooltip } from 'recharts';
import { SUNDAYS_2026 } from '../services/mockData';

interface IndividualProfileProps {
  members: Member[];
  records: AttendanceRecord[];
  prayerRecords: PrayerRecord[];
  meetingStatus: MeetingStatus[];
  availableGroups: string[];
}

const IndividualProfile: React.FC<IndividualProfileProps> = ({ members, records, prayerRecords, meetingStatus, availableGroups }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');

  // 1. Resolve Target Member
  const targetMember = useMemo(() => {
    if (selectedMemberId) {
      return members.find(m => m.id === selectedMemberId) || null;
    }
    return null;
  }, [selectedMemberId, members]);

  // Helper to parse Name (Separate Number Prefix and Name for specific display requirement)
  const memberDisplay = useMemo(() => {
    if (!targetMember) return { avatarText: '', displayName: '' };
    
    // Check if name starts with numbers (e.g., "91류지선" or "91 류지선")
    // Use a robust regex to capture digits at start, optional space, and the rest
    const match = targetMember.name.match(/^(\d+)\s*(.*)$/);
    if (match) {
       // match[1] is the digits ("91"), match[2] is the rest ("류지선")
       return { avatarText: match[1], displayName: `${match[1]} ${match[2].trim()}` };
    }
    // Fallback for names like '김철수' -> Avatar: '김', Name: '김철수'
    return { avatarText: targetMember.name.charAt(0), displayName: targetMember.name };
  }, [targetMember]);

  // 2. Filter Members for Dropdown based on Group
  const filteredMembers = useMemo(() => {
    if (!selectedGroup) return [];
    
    return members
      .filter(m => m.group === selectedGroup)
      .sort((a, b) => {
        // Priority: Leader -> Alphabetical
        
        // 1. Leader Check
        // Normalize role to Uppercase to handle 'Leader', 'LEADER', 'leader' etc.
        const roleA = (a.role || '').toString().toUpperCase().trim();
        const roleB = (b.role || '').toString().toUpperCase().trim();
        
        // Check for 'LEADER' (English) or '리더' (Korean)
        const isALeader = roleA === 'LEADER' || roleA === '리더';
        const isBLeader = roleB === 'LEADER' || roleB === '리더';

        if (isALeader && !isBLeader) return -1;
        if (!isALeader && isBLeader) return 1;

        // 2. Alphabetical Check
        // Remove '*' from name for sorting comparison
        const nameA = a.name.replace(/\*/g, '').trim();
        const nameB = b.name.replace(/\*/g, '').trim();

        return nameA.localeCompare(nameB);
      });
  }, [selectedGroup, members]);

  // 3. Search Handler
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    // Clear dropdowns if typing
    if (val) {
      setSelectedGroup('');
      setSelectedMemberId('');
      
      // Auto-select if perfect match and unique
      const matched = members.filter(m => m.name.toLowerCase() === val.toLowerCase());
      if (matched.length === 1) {
        setSelectedMemberId(matched[0].id);
      }
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

  // 4. Calculate Statistics for Target Member
  const stats = useMemo(() => {
    if (!targetMember) return null;

    const now = new Date();
    const targetDate = new Date(2026, now.getMonth(), now.getDate()); 
    const comparisonDate = now.getFullYear() >= 2026 ? now : targetDate;

    // 1. Filter Sundays that have passed so far AND are on or after registration date
    let passedSundays = SUNDAYS_2026.filter(d => new Date(d) <= comparisonDate);
    
    // Apply registration date filter if exists
    const regDate = targetMember.MemberRegistration || (targetMember as any).registrationDate;
    if (regDate) {
      // Normalize to a searchable date (YYYY-MM-DD)
      let normReg = String(regDate).trim();
      if (/^\d{4}$/.test(normReg)) {
        normReg = `${normReg}-01-01`;
      } else if (/^\d{4}-\d{2}$/.test(normReg)) {
        normReg = `${normReg}-01`;
      }
      
      passedSundays = passedSundays.filter(d => d >= normReg);
    }

    // 2. Calculate Total Possible Attendance (Denominator) excluding Canceled Meetings
    let possibleWorship = 0;
    let possibleGathering = 0;
    let possibleWool = 0;

    passedSundays.forEach(date => {
      // Check if meetings were canceled on this specific date
      const wCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Worship && s.isCanceled);
      const gCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Gathering && s.isCanceled);
      const lCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Wool && s.isCanceled);

      if (!wCanceled) possibleWorship++;
      if (!gCanceled) possibleGathering++;
      if (!lCanceled) possibleWool++;
    });

    // 3. Calculate Actual Attendance (Numerator) for passed dates only
    const myRecords = records.filter(r => r.memberId === targetMember.id && passedSundays.includes(r.date));
    
    const worshipCount = myRecords.filter(r => r.types.includes(AttendanceType.Worship)).length;
    const gatheringCount = myRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length;
    const woolCount = myRecords.filter(r => r.types.includes(AttendanceType.Wool)).length;
    
    const prayerCount = prayerRecords.filter(r => r.memberId === targetMember.id).length;

    // Helper for safe division
    const calcRate = (count: number, total: number) => total === 0 ? 0 : Math.round((count / total) * 100);

    return {
      worshipCount,
      gatheringCount,
      woolCount,
      prayerCount,
      possibleWorship,
      possibleGathering,
      possibleWool,
      worshipRate: calcRate(worshipCount, possibleWorship),
      gatheringRate: calcRate(gatheringCount, possibleGathering),
      woolRate: calcRate(woolCount, possibleWool),
      passedWeeksCount: passedSundays.length
    };
  }, [targetMember, records, prayerRecords, meetingStatus]);

  // 5. Radar Chart Data
  const radarData = useMemo(() => {
    if (!stats) return [];
    return [
      { subject: '예배', A: stats.worshipRate, fullMark: 100 },
      { subject: '집회', A: stats.gatheringRate, fullMark: 100 },
      { subject: '울모임', A: stats.woolRate, fullMark: 100 },
      { subject: '기도', A: Math.min((stats.prayerCount / 20) * 100, 100), fullMark: 100 }, 
      { subject: '성실도', A: Math.round((stats.worshipRate + stats.woolRate + stats.gatheringRate) / 3), fullMark: 100 },
    ];
  }, [stats]);

  // 6. Member Prayer History
  const myPrayerHistory = useMemo(() => {
    if (!targetMember) return [];
    return prayerRecords
      .filter(r => r.memberId === targetMember.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [targetMember, prayerRecords]);

  return (
    <div className="space-y-4 md:space-y-6">
      <header>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800">개인별 종합 현황</h2>
        <p className="text-sm md:text-base text-slate-500">개인의 출석 현황, 통계, 기도제목을 한눈에 확인합니다.</p>
      </header>

      {/* Search & Filter Section */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4 md:items-end">
           {/* Direct Search */}
           <div className="w-full md:flex-1">
             <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center text-indigo-700">
                <Search size={14} className="mr-1" /> 이름 검색
             </label>
             <div className="relative">
                <input 
                  type="text" 
                  className="w-full border border-indigo-200 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/30"
                  placeholder="성도 이름 입력..."
                  value={searchQuery}
                  onChange={handleSearch}
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-indigo-400">
                  <Search size={18} />
                </div>
                {/* Search Suggestions */}
                {searchQuery && !targetMember && (
                  <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-auto">
                    {members.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                      <div 
                        key={m.id} 
                        className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm flex justify-between"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedGroup(m.group);
                          setSelectedMemberId(m.id);
                        }}
                      >
                        <span className="font-bold text-slate-700">{m.name}</span>
                        <span className="text-slate-400 text-xs">{m.group}</span>
                      </div>
                    ))}
                    {members.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                      <div className="px-4 py-2 text-sm text-slate-400">검색 결과가 없습니다.</div>
                    )}
                  </div>
                )}
             </div>
           </div>

           <div className="hidden md:flex justify-center pb-2 text-slate-300 font-bold text-sm">OR</div>
           <div className="md:hidden text-center text-xs text-slate-400 -my-1">- 또는 소그룹으로 찾기 -</div>

           {/* Dropdowns */}
           <div className="w-full md:flex-1 flex gap-3">
              <div className="flex-1">
                 <label className="block text-xs font-bold text-slate-500 mb-2">소그룹 선택</label>
                 <select
                   className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500"
                   value={selectedGroup}
                   onChange={handleGroupChange}
                 >
                   <option value="">선택</option>
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
                   <option value="">선택</option>
                   {filteredMembers.map(m => (
                     <option key={m.id} value={m.id}>{m.name}</option>
                   ))}
                 </select>
              </div>
           </div>
        </div>
      </div>

      {targetMember && stats ? (
        <>
          {/* Top Section: Profile & Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Profile Card */}
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col items-center pt-8 md:pt-10 pb-6 px-6 relative w-full">
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-xl z-0" />
                <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-full bg-white p-2 shadow-lg mb-6 z-10 border border-slate-50">
                   {targetMember.photoUrl ? (
                     <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 ring-2 ring-indigo-50">
                       <img src={targetMember.photoUrl} alt={targetMember.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                     </div>
                   ) : (
                     <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-3xl md:text-5xl font-bold ring-2 ring-indigo-50 shadow-inner">
                       {memberDisplay.avatarText}
                     </div>
                   )}
                </div>
                
                <h3 className="text-2xl md:text-3xl font-bold text-slate-800 text-center tracking-tight z-10 relative break-keep">{memberDisplay.displayName}</h3>
                <p className="text-indigo-600 font-semibold text-sm md:text-base mt-2 text-center bg-indigo-50 px-3 py-1 rounded-full z-10 relative">{targetMember.group}</p>
                
                <div className="mt-8 space-y-3 w-full z-10 relative">
                   <div className="flex items-center text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <User size={18} className="mr-3 text-slate-400" />
                      <span>{targetMember.role || '성도'}</span>
                   </div>
                   <div className="flex items-center text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <Phone size={18} className="mr-3 text-slate-400" />
                      <span>{targetMember.phoneNumber || '연락처 없음'}</span>
                   </div>
                   <div className="flex items-center text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <Calendar size={18} className="mr-3 text-slate-400" />
                      <span>등반일: {targetMember.MemberRegistration || (targetMember as any).registrationDate || '정보 없음'}</span>
                   </div>
                   {targetMember.specialNotes && (
                     <div className="flex items-start text-sm text-slate-700 bg-indigo-50/70 p-4 rounded-lg mt-2 border border-indigo-100">
                        <StickyNote size={18} className="mr-3 mt-0.5 flex-shrink-0 text-indigo-400" />
                        <div className="flex-1">
                           <span className="font-semibold text-xs text-indigo-600 block mb-1">비고 (Memo)</span>
                           <span className="leading-relaxed">{targetMember.specialNotes}</span>
                        </div>
                     </div>
                   )}
                   
                   <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 text-center">
                     * 통계 기준: 1월 1일 ~ 오늘 ({stats.passedWeeksCount}주 경과)
                   </div>
                </div>
             </div>

             {/* Stats Cards & Chart */}
             <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
                <h4 className="font-bold text-slate-700 mb-4 md:mb-6 flex items-center justify-between">
                   <span className="flex items-center text-sm md:text-base"><TrendingUp size={18} className="mr-2 text-indigo-500" /> 출석 및 신앙 생활 분석</span>
                   <span className="text-[10px] md:text-xs font-normal text-slate-400 bg-slate-50 px-2 py-1 rounded">모임 취소일 제외 계산</span>
                </h4>
                
                <div className="flex flex-col md:flex-row gap-6">
                   {/* Stats Grid - Responsive: 1 col on mobile, 2 cols on tablet+ */}
                   <div className="flex-1 grid grid-cols-2 gap-3 md:gap-4">
                      <div className="bg-blue-50 p-3 md:p-4 rounded-xl border border-blue-100 flex flex-col justify-center">
                         <span className="text-[10px] md:text-xs font-bold text-blue-600 uppercase">예배 출석률</span>
                         <div className="flex items-end mt-1 md:mt-2">
                            <span className="text-xl md:text-3xl font-bold text-slate-800">{stats.worshipRate}%</span>
                            <span className="text-[10px] md:text-xs text-slate-500 ml-1 md:ml-2 mb-1">({stats.worshipCount}/{stats.possibleWorship})</span>
                         </div>
                      </div>
                      <div className="bg-indigo-50 p-3 md:p-4 rounded-xl border border-indigo-100 flex flex-col justify-center">
                         <span className="text-[10px] md:text-xs font-bold text-indigo-600 uppercase">집회 출석률</span>
                         <div className="flex items-end mt-1 md:mt-2">
                            <span className="text-xl md:text-3xl font-bold text-slate-800">{stats.gatheringRate}%</span>
                            <span className="text-[10px] md:text-xs text-slate-500 ml-1 md:ml-2 mb-1">({stats.gatheringCount}/{stats.possibleGathering})</span>
                         </div>
                      </div>
                      <div className="bg-emerald-50 p-3 md:p-4 rounded-xl border border-emerald-100 flex flex-col justify-center">
                         <span className="text-[10px] md:text-xs font-bold text-emerald-600 uppercase">울모임 출석률</span>
                         <div className="flex items-end mt-1 md:mt-2">
                            <span className="text-xl md:text-3xl font-bold text-slate-800">{stats.woolRate}%</span>
                            <span className="text-[10px] md:text-xs text-slate-500 ml-1 md:ml-2 mb-1">({stats.woolCount}/{stats.possibleWool})</span>
                         </div>
                      </div>
                      <div className="bg-amber-50 p-3 md:p-4 rounded-xl border border-amber-100 flex flex-col justify-center">
                         <span className="text-[10px] md:text-xs font-bold text-amber-600 uppercase">기도 나눔</span>
                         <div className="flex items-end mt-1 md:mt-2">
                            <span className="text-xl md:text-3xl font-bold text-slate-800">{stats.prayerCount}</span>
                            <span className="text-[10px] md:text-xs text-slate-500 ml-1 md:ml-2 mb-1">건</span>
                         </div>
                      </div>
                   </div>

                   {/* Radar Chart */}
                   <div className="flex-1 h-56 md:h-64 min-h-[220px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                         <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar
                               name={targetMember.name}
                               dataKey="A"
                               stroke="#6366f1"
                               strokeWidth={2}
                               fill="#6366f1"
                               fillOpacity={0.4}
                            />
                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}/>
                         </RadarChart>
                      </ResponsiveContainer>
                   </div>
                </div>
             </div>
          </div>

          {/* Yearly Attendance Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
             <h4 className="font-bold text-slate-700 mb-4 md:mb-6 flex items-center">
                <Calendar size={18} className="mr-2 text-indigo-500" /> 1년 출석 히스토리
             </h4>
             {/* Responsive Columns - 1 col on mobile, 2 on sm, 3 on lg */}
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
                   const monthDates = SUNDAYS_2026.filter(d => new Date(d).getMonth() + 1 === month);
                   if (monthDates.length === 0) return null;

                   return (
                     <div key={month} className="border border-slate-100 rounded-lg p-3 hover:border-indigo-100 transition-colors">
                        <h5 className="text-sm font-bold text-slate-500 mb-2 border-b border-slate-100 pb-2">{month}월</h5>
                        <div className="space-y-1.5">
                           {monthDates.map(date => {
                             const dayRecord = records.find(r => r.memberId === targetMember.id && r.date === date);
                             const types = dayRecord?.types || [];
                             const dateStr = date.substring(5);
                             
                             const wStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Worship);
                             const gStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Gathering);
                             const lStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Wool);
                             
                             const wCanceled = wStatus?.isCanceled;
                             const gCanceled = gStatus?.isCanceled;
                             const lCanceled = lStatus?.isCanceled;
                             const eventName = wStatus?.event || gStatus?.event || lStatus?.event;

                             return (
                               <div key={date} className="flex items-center justify-between text-xs">
                                  <div className="flex items-center min-w-0">
                                    <span className="text-slate-500 font-mono text-[10px] md:text-xs">{dateStr}</span>
                                    {eventName && (
                                       <span className="ml-1 text-[9px] text-indigo-400 font-medium truncate max-w-[50px] md:max-w-[60px]">{eventName}</span>
                                    )}
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                     <span className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[8px] md:text-[10px] font-bold ${
                                        types.includes(AttendanceType.Worship) ? 'bg-blue-100 text-blue-600' : 
                                        wCanceled ? 'bg-slate-100 text-slate-300 decoration-slate-400' : 'bg-slate-50 text-slate-200'
                                     }`}>{wCanceled ? '-' : 'W'}</span>
                                     <span className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[8px] md:text-[10px] font-bold ${
                                        types.includes(AttendanceType.Gathering) ? 'bg-indigo-100 text-indigo-600' : 
                                        gCanceled ? 'bg-slate-100 text-slate-300' : 'bg-slate-50 text-slate-200'
                                     }`}>{gCanceled ? '-' : 'G'}</span>
                                     <span className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[8px] md:text-[10px] font-bold ${
                                        types.includes(AttendanceType.Wool) ? 'bg-emerald-100 text-emerald-600' : 
                                        lCanceled ? 'bg-slate-100 text-slate-300' : 'bg-slate-50 text-slate-200'
                                     }`}>{lCanceled ? '-' : 'L'}</span>
                                  </div>
                               </div>
                             );
                           })}
                        </div>
                     </div>
                   );
                })}
             </div>
             <div className="mt-4 flex flex-wrap gap-2 md:gap-3 text-[10px] md:text-xs text-slate-500 justify-end">
                <div className="flex items-center"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500 mr-1"></span> W: 예배</div>
                <div className="flex items-center"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-indigo-500 mr-1"></span> G: 집회</div>
                <div className="flex items-center"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 mr-1"></span> L: 울모임</div>
                <div className="flex items-center"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-slate-200 mr-1"></span> - : 모임 없음</div>
             </div>
          </div>

          {/* Prayer History Timeline */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
             <h4 className="font-bold text-slate-700 mb-6 flex items-center">
                <Quote size={18} className="mr-2 text-indigo-500" /> 기도제목 타임라인
             </h4>
             <div className="relative pl-4 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-0.5 before:bg-slate-100">
                {myPrayerHistory.length > 0 ? (
                   myPrayerHistory.map(record => (
                     <div key={record.id} className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white shadow-sm"></div>
                        <span className="text-xs font-bold text-slate-400 block mb-1">{record.date}</span>
                        <div className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100">
                           {record.content && <p className="text-slate-700 text-sm mb-2">{record.content}</p>}
                           {record.note && (
                              <div className="flex items-start text-xs text-amber-700 bg-amber-50 p-2 rounded mt-2">
                                 <FileText size={12} className="mr-1 mt-0.5" /> {record.note}
                              </div>
                           )}
                        </div>
                     </div>
                   ))
                ) : (
                   <div className="text-slate-400 text-sm py-4">등록된 기도제목이 없습니다.</div>
                )}
             </div>
          </div>
        </>
      ) : (
        // Empty State
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-64 md:h-96 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
           <User size={48} className="mb-4 text-slate-200 md:w-16 md:h-16" />
           <h3 className="text-base md:text-lg font-bold text-slate-600 mb-2">성도를 선택해주세요</h3>
           <p className="max-w-md text-xs md:text-base">상단 검색창에서 이름을 입력하거나, 소그룹 및 멤버를 선택하여 상세 정보를 확인하세요.</p>
        </div>
      )}
    </div>
  );
};

export default IndividualProfile;