import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Member, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus, Visitation } from '../types';
import { Search, User, Phone, StickyNote, Calendar, Quote, TrendingUp, AlertCircle, FileText, Printer, Heart, MapPin, Plus, X, Edit2 } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as RechartsTooltip } from 'recharts';
import { SUNDAYS_2026 } from '../services/mockData';

interface IndividualProfileProps {
  members: Member[];
  records: AttendanceRecord[];
  prayerRecords: PrayerRecord[];
  meetingStatus: MeetingStatus[];
  availableGroups: string[];
  isVisitationMode?: boolean;
  visitations?: Visitation[];
  onAddVisitation?: (visitation: Omit<Visitation, 'visitationId' | 'submittedAt'>) => void;
  onUpdateVisitation?: (visitation: Visitation) => void;
}

import { runUniversalSearch } from '../services/searchAlgorithm';

interface IndividualProfileProps {
  members: Member[];
  records: AttendanceRecord[];
  prayerRecords: PrayerRecord[];
  meetingStatus: MeetingStatus[];
  availableGroups: string[];
  isVisitationMode?: boolean;
  visitations?: Visitation[];
  onAddVisitation?: (visitation: Omit<Visitation, 'visitationId' | 'submittedAt'>) => void;
  onUpdateVisitation?: (visitation: Visitation) => void;
}

interface SearchResultItem {
  member: Member;
  score: number;
  matchField: string;
  matchedSnippet: string;
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const renderHighlightedText = (text: string, query: string) => {
  if (!text) return <span></span>;
  const trimmed = query.trim();
  if (!trimmed) {
    return <span>{text}</span>;
  }
  
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return <span>{text}</span>;
  }

  const escapedTokens = tokens
    .map(t => escapeRegExp(t))
    .sort((a, b) => b.length - a.length);
  
  const pattern = `(${escapedTokens.join('|')})`;
  const regex = new RegExp(pattern, 'gi');
  const parts = text.split(regex);
  
  return (
    <span>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-amber-100 text-amber-950 font-semibold px-0.5 rounded border-b border-amber-300">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
};

const IndividualProfile: React.FC<IndividualProfileProps> = ({ 
  members, 
  records, 
  prayerRecords, 
  meetingStatus, 
  availableGroups,
  isVisitationMode = false,
  visitations = [],
  onAddVisitation,
  onUpdateVisitation
}) => {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  // Filtered members and match details for universal autocomplete search
  const searchFilteredMembers = useMemo(() => {
    return runUniversalSearch(members, searchQuery, prayerRecords, visitations);
  }, [members, searchQuery, prayerRecords, visitations]);

  // Scroll active suggestion into view
  useEffect(() => {
    if (activeSuggestionIndex >= 0) {
      const activeEl = document.getElementById(`suggestion-item-${activeSuggestionIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeSuggestionIndex]);

  // Visitation Form states
  const [isVisitationFormOpen, setIsVisitationFormOpen] = useState(false);
  const [editingVisitation, setEditingVisitation] = useState<Visitation | null>(null);
  const [formDate, setFormDate] = useState(() => {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
  });
  const [formType, setFormType] = useState('대면심방');
  const [formPlace, setFormPlace] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formPrayerRequests, setFormPrayerRequests] = useState('1. \n2. \n3. ');

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const VISITATION_TYPES = ['대면심방', '전화심방', 'SNS심방', '가정방문', '병원심방', '기타심방'];

  const fetchCurrentLocationAddress = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS 미지원 브라우저');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=ko`,
            {
              headers: {
                'User-Agent': 'ChurchAttendanceAdmin/1.0'
              }
            }
          );
          if (!response.ok) throw new Error('Network error');
          const data = await response.json();
          
          const addr = data.address || {};
          let gu = addr.borough || addr.city_district || addr.district || '';
          let dong = addr.suburb || addr.neighbourhood || addr.quarter || addr.village || addr.town || '';
          
          if (!gu || !dong) {
            const displayName = data.display_name || '';
            const parts = displayName.split(/[\s,]+/);
            const foundGu = parts.find((p: string) => p.endsWith('구'));
            const foundDong = parts.find((p: string) => p.endsWith('동') || p.endsWith('읍') || p.endsWith('면'));
            if (foundGu) gu = foundGu;
            if (foundDong) dong = foundDong;
          }

          if (gu && dong) {
            setFormPlace(`${gu} ${dong}`);
          } else if (data.display_name) {
            const parts = data.display_name.split(',').map((p: string) => p.trim());
            const relevant = parts.filter((p: string) => 
              (p.endsWith('구') || p.endsWith('동') || p.endsWith('시') || p.endsWith('읍') || p.endsWith('면')) && 
              !p.includes('대한민국')
            );
            if (relevant.length > 0) {
              const guPart = relevant.find((p: string) => p.endsWith('구'));
              const dongPart = relevant.find((p: string) => p.endsWith('동') || p.endsWith('읍') || p.endsWith('면'));
              if (guPart && dongPart) {
                setFormPlace(`${guPart} ${dongPart}`);
              } else {
                setFormPlace(relevant.slice(-2).join(' '));
              }
            } else {
              setFormPlace(data.display_name);
            }
          } else {
            setFormPlace('위치 조회 완료');
          }
        } catch (err) {
          console.error('Error reverse geocoding:', err);
          setGpsError('상세 주소 실패');
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setGpsError('권한 거부 또는 실패');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Auto-fetch location on mobile/tablet when opening the visitation form for password '7980' (isVisitationMode)
  useEffect(() => {
    if (isVisitationMode && isVisitationFormOpen && !editingVisitation && !formPlace) {
      const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && window.innerWidth < 1024;
      if (isMobileOrTablet) {
        fetchCurrentLocationAddress();
      }
    }
  }, [isVisitationMode, isVisitationFormOpen, editingVisitation]);

  useEffect(() => {
    if (isVisitationFormOpen) {
      if (editingVisitation) {
        setFormDate(editingVisitation.date);
        setFormType(editingVisitation.visitationType);
        setFormPlace(editingVisitation.place);
        setFormDetails(editingVisitation.details);
        setFormPrayerRequests(editingVisitation.prayerRequests || '1. \n2. \n3. ');
      } else {
        const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
        setFormDate(todayLocal);
        setFormType('대면심방');
        setFormPlace('');
        setFormDetails('');
        setFormPrayerRequests('1. \n2. \n3. ');
      }
    }
  }, [isVisitationFormOpen, editingVisitation]);

  // Handle location state for deep linking from org chart
  useEffect(() => {
    if (location.state && location.state.memberId) {
      const targetM = members.find(m => m.id === location.state.memberId);
      if (targetM) {
        setSelectedGroup(targetM.group || '');
        setSelectedMemberId(targetM.id);
      }
    }
  }, [location.state, members]);

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
    
    const nameStr = String(targetMember.name || '');
    // Check if name starts with numbers (e.g., "91류지선" or "91 류지선")
    // Use a robust regex to capture digits at start, optional space, and the rest
    const match = nameStr.match(/^(\d+)\s*(.*)$/);
    if (match) {
       // match[1] is the digits ("91"), match[2] is the rest ("류지선")
       return { avatarText: match[1], displayName: `${match[1]} ${match[2].trim()}` };
    }
    // Fallback for names like '김철수' -> Avatar: '김', Name: '김철수'
    return { avatarText: nameStr.charAt(0), displayName: nameStr };
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
        const nameA = String(a.name || '').replace(/\*/g, '').trim();
        const nameB = String(b.name || '').replace(/\*/g, '').trim();

        return nameA.localeCompare(nameB);
      });
  }, [selectedGroup, members]);

  // 3. Search Handler
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setActiveSuggestionIndex(-1); // Reset suggestion selection index on change
    
    // Clear dropdowns if typing
    if (val) {
      setSelectedGroup('');
      setSelectedMemberId('');
      
      // Auto-select if perfect match and unique
      const matched = members.filter(m => String(m.name || '').toLowerCase() === val.toLowerCase());
      if (matched.length === 1) {
        setSelectedMemberId(matched[0].id);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchQuery || targetMember) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => 
        prev < searchFilteredMembers.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < searchFilteredMembers.length) {
        e.preventDefault();
        const selected = searchFilteredMembers[activeSuggestionIndex].member;
        setSearchQuery('');
        setSelectedGroup(selected.group);
        setSelectedMemberId(selected.id);
        setActiveSuggestionIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setActiveSuggestionIndex(-1);
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
    const targetDate = now.getFullYear() >= 2026 ? now : new Date(2026, now.getMonth(), now.getDate()); 
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dVal = String(targetDate.getDate()).padStart(2, '0');
    const comparisonDateStr = `${y}-${m}-${dVal}`;

    // 1. Filter Sundays that have passed so far AND are on or after registration date
    let passedSundays = SUNDAYS_2026.filter(d => d <= comparisonDateStr);
    
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
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [targetMember, prayerRecords]);

  // 7. Member Visitation History
  const myVisitationHistory = useMemo(() => {
    if (!targetMember || !visitations) return [];
    return visitations
      .filter(v => v.memberId === targetMember.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [targetMember, visitations]);

  const handleVisitationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMember) return;

    if (editingVisitation) {
      if (onUpdateVisitation) {
        onUpdateVisitation({
          ...editingVisitation,
          date: formDate,
          visitationType: formType,
          place: formPlace,
          details: formDetails,
          prayerRequests: formPrayerRequests
        });
      }
    } else {
      if (onAddVisitation) {
        onAddVisitation({
          date: formDate,
          memberId: targetMember.id,
          visitationType: formType,
          place: formPlace,
          details: formDetails,
          prayerRequests: formPrayerRequests
        });
      }
    }

    // Reset Form
    setFormPlace('');
    setFormDetails('');
    setFormPrayerRequests('');
    setEditingVisitation(null);
    setIsVisitationFormOpen(false);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800">개인별 종합 현황</h2>
          <p className="text-sm md:text-base text-slate-500">개인의 출석 현황, 통계, 기도제목을 한눈에 확인합니다.</p>
        </div>
        {targetMember && (
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-md transition-colors cursor-pointer flex-shrink-0"
          >
            <Printer size={16} />
            개인 리포트 인쇄 (A4 1장)
          </button>
        )}
      </header>

      {/* Search & Filter Section */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4 md:items-end">
           {/* Direct Search */}
           <div className="w-full md:flex-1">
             <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center text-indigo-700">
                <Search size={14} className="mr-1" /> 만능 검색 (이름, 기도제목, 대화내용, 장소 등)
             </label>
             <div className="relative">
                <input 
                  type="text" 
                  className="w-full border border-indigo-200 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/30"
                  placeholder="이름, 대화 내용, 기도제목, 장소 등으로 검색..."
                  value={searchQuery}
                  onChange={handleSearch}
                  onKeyDown={handleKeyDown}
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-indigo-400">
                  <Search size={18} />
                </div>
                {/* Search Suggestions */}
                {searchQuery && !targetMember && (
                  <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-auto divide-y divide-slate-100">
                    {searchFilteredMembers.map((item, idx) => (
                      <div 
                        key={item.member.id} 
                        id={`suggestion-item-${idx}`}
                        className={`px-4 py-2.5 cursor-pointer text-sm flex flex-col transition-colors ${
                          idx === activeSuggestionIndex 
                            ? 'bg-indigo-50/80 border-l-2 border-indigo-600' 
                            : 'hover:bg-slate-50/80'
                        }`}
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedGroup(item.member.group);
                          setSelectedMemberId(item.member.id);
                          setActiveSuggestionIndex(-1);
                        }}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center">
                            <span className={`font-bold ${idx === activeSuggestionIndex ? 'text-indigo-900' : 'text-slate-800'}`}>
                              {item.member.name}
                            </span>
                            <span className="text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded ml-2 font-semibold">
                              정확도 {Math.min(100, Math.max(30, Math.round(item.score)))}%
                            </span>
                          </div>
                          <span className="text-slate-400 text-[10px] font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.member.group}
                          </span>
                        </div>
                        {item.matchedSnippet && (
                          <div className="text-xs text-slate-500 truncate leading-relaxed flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-100 flex-shrink-0 font-medium">
                              {item.matchField}
                            </span>
                            <span className="truncate text-slate-600 font-mono text-[11px]">
                              {renderHighlightedText(item.matchedSnippet, searchQuery)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                    {searchFilteredMembers.length === 0 && (
                      <div className="px-4 py-3 text-sm text-slate-400 text-center">검색 결과가 없습니다.</div>
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
                   
                   {isVisitationMode && (
                     <button
                       onClick={() => setIsVisitationFormOpen(true)}
                       className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition-all active:scale-[0.98] mt-4 mb-2 cursor-pointer text-sm"
                     >
                       <Heart size={16} className="fill-rose-100" />
                       심방 기록 입력
                     </button>
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
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                   {/* Stats Grid - Responsive: 1 col on mobile, 2 cols on tablet+ */}
                   <div className="lg:col-span-2 grid grid-cols-2 gap-3 md:gap-4">
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
                   <div className="lg:col-span-1 h-56 md:h-64 min-h-[220px] flex items-center justify-center">
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

          {/* Timelines Section */}
          <div className={`grid grid-cols-1 ${isVisitationMode ? 'lg:grid-cols-2' : ''} gap-6`}>
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

             {/* Visitation History Timeline */}
             {isVisitationMode && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
                   <div className="flex items-center justify-between mb-6 gap-2">
                      <h4 className="font-bold text-slate-700 flex items-center">
                         <Heart size={18} className="mr-2 text-rose-500 fill-rose-100" /> 심방 기록 히스토리
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVisitation(null);
                          setIsVisitationFormOpen(true);
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Plus size={12} /> 심방 추가
                      </button>
                   </div>
                   <div className="relative pl-4 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-0.5 before:bg-slate-100">
                      {myVisitationHistory.length > 0 ? (
                         myVisitationHistory.map(v => (
                           <div key={v.visitationId} className="relative">
                              <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-rose-400 border-2 border-white shadow-sm"></div>
                              <div className="flex items-center justify-between mb-1">
                                 <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400">{v.date}</span>
                                    <button
                                      onClick={() => {
                                        setEditingVisitation(v);
                                        setIsVisitationFormOpen(true);
                                      }}
                                      className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors cursor-pointer"
                                      title="심방기록 수정"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                 </div>
                                 <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                                   {v.visitationType}
                                 </span>
                              </div>
                              <div className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100 text-sm">
                                 <div className="mb-1.5 text-slate-500 text-xs flex items-center gap-1">
                                   <MapPin size={12} className="text-slate-400" /> {v.place}
                                 </div>
                                 <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{v.details}</p>
                                 {v.prayerRequests && (
                                    <div className="mt-2 text-indigo-900 bg-indigo-50/50 border border-indigo-100/70 p-2.5 rounded text-xs leading-relaxed">
                                      🙏 {v.prayerRequests}
                                    </div>
                                 )}
                              </div>
                           </div>
                         ))
                      ) : (
                         <div className="text-slate-400 text-sm py-4">등록된 심방 기록이 없습니다.</div>
                      )}
                   </div>
                </div>
             )}
          </div>

          {/* Yearly Attendance Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
             <h4 className="font-bold text-slate-700 mb-4 md:mb-6 flex items-center">
                <Calendar size={18} className="mr-2 text-indigo-500" /> 1년 출석 히스토리
             </h4>
             {/* Responsive Columns - 1 col on mobile, 2 on sm, 3 on lg */}
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
                   const monthDates = SUNDAYS_2026.filter(d => parseInt(d.substring(5, 7), 10) === month);
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
        </>
      ) : (
        // Empty State
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-64 md:h-96 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
           <User size={48} className="mb-4 text-slate-200 md:w-16 md:h-16" />
           <h3 className="text-base md:text-lg font-bold text-slate-600 mb-2">성도를 선택해주세요</h3>
           <p className="max-w-md text-xs md:text-base">상단 검색창에서 이름을 입력하거나, 소그룹 및 멤버를 선택하여 상세 정보를 확인하세요.</p>
        </div>
      )}
      {targetMember && stats && (
        <>
          <style>{`
            .print-only-container {
              display: none;
            }
            @media print {
              body {
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              body * {
                visibility: hidden !important;
              }
              .print-only-container, .print-only-container * {
                visibility: visible !important;
              }
              .print-only-container {
                display: flex !important;
                flex-direction: column !important;
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 210mm !important;
                height: 297mm !important;
                padding: 15mm 12mm 10mm 12mm !important;
                box-sizing: border-box !important;
                background: white !important;
                color: black !important;
                z-index: 9999999 !important;
              }
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              @page {
                size: A4 portrait;
                margin: 0;
              }
            }
          `}</style>

          {/* A4 Printable Report Area */}
          <div className="hidden print-only-container">
            {/* Header */}
            <div className="border-b-4 border-double border-slate-800 pb-3 mb-4 flex justify-between items-end">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">INDIVIDUAL PROFILE REPORT</span>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">성도 종합 현황 리포트</h1>
              </div>
              <div className="text-right text-[11px] text-slate-500 font-medium">
                <div>출력 소그룹: <strong className="text-slate-800">{targetMember.group}</strong></div>
                <div>출력 일시: {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </div>

            {/* Profile & Memo Grid */}
            <div className="grid grid-cols-12 gap-4 mb-5 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              {/* Foto or Avatar */}
              <div className="col-span-3 flex flex-col items-center justify-center border-r border-slate-200/80 pr-4">
                <div className="w-24 h-24 rounded-full bg-white border border-slate-200 p-1 flex items-center justify-center overflow-hidden shadow-sm">
                  {targetMember.photoUrl ? (
                    <img src={targetMember.photoUrl} alt={targetMember.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="text-3xl font-black text-slate-300 uppercase">
                      {memberDisplay.avatarText}
                    </div>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-2 text-center tracking-tight">{memberDisplay.displayName}</h2>
                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 border border-indigo-100">{targetMember.group}</span>
              </div>

              {/* Profile Detail Table */}
              <div className="col-span-5 grid grid-cols-2 gap-y-2 gap-x-4 pl-2 text-xs flex-col justify-center">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">역할 / 직분</span>
                  <span className="font-semibold text-slate-800">{targetMember.role || '성도'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">연락처</span>
                  <span className="font-semibold text-slate-800">{targetMember.phoneNumber || '연락처 없음'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">등록/등반일</span>
                  <span className="font-semibold text-slate-800">{targetMember.MemberRegistration || (targetMember as any).registrationDate || '정보 없음'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">분석 기간</span>
                  <span className="font-semibold text-slate-800">1월 1일 ~ 현재 ({stats.passedWeeksCount}주)</span>
                </div>
              </div>

              {/* Memo/SpecialNotes */}
              <div className="col-span-4 border-l border-slate-200/80 pl-4 flex flex-col justify-start">
                <span className="text-[10px] font-bold text-indigo-500 block uppercase tracking-wider mb-1">비고 (Special Memo)</span>
                <div className="bg-white border border-indigo-100 rounded-lg p-2 flex-1 text-[11px] text-slate-700 leading-relaxed overflow-hidden h-24">
                  {targetMember.specialNotes ? (
                    <p className="line-clamp-4 break-words">{targetMember.specialNotes}</p>
                  ) : (
                    <span className="text-slate-300 italic block mt-4 text-center">특별한 비고 사항이 없습니다.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats & Radar Chart */}
            <div className="grid grid-cols-12 gap-4 mb-5">
              {/* Stats Numeric Blocks */}
              <div className="col-span-12 md:col-span-7 grid grid-cols-2 gap-3" style={{ gridColumn: 'span 7' }}>
                <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/20 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-blue-600 block">예배 출석률 (Worship)</span>
                  <span className="text-xl font-black text-slate-800 mt-1">{stats.worshipRate}% <span className="text-xs font-normal text-slate-400">({stats.worshipCount}/{stats.possibleWorship})</span></span>
                </div>
                <div className="border border-indigo-100 rounded-xl p-3 bg-indigo-50/20 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-indigo-600 block">집회 출석률 (Gathering)</span>
                  <span className="text-xl font-black text-slate-800 mt-1">{stats.gatheringRate}% <span className="text-xs font-normal text-slate-400">({stats.gatheringCount}/{stats.possibleGathering})</span></span>
                </div>
                <div className="border border-emerald-100 rounded-xl p-2.5 bg-emerald-50/20 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-emerald-600 block">울모임 출석률 (Wool)</span>
                  <span className="text-xl font-black text-slate-800 mt-1">{stats.woolRate}% <span className="text-xs font-normal text-slate-400">({stats.woolCount}/{stats.possibleWool})</span></span>
                </div>
                <div className="border border-amber-100 rounded-xl p-2.5 bg-amber-50/20 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-amber-600 block">기도 나눔 실적 (Prayer)</span>
                  <span className="text-xl font-black text-slate-800 mt-1">{stats.prayerCount} <span className="text-xs font-normal text-slate-400">건</span></span>
                </div>
              </div>

              {/* Small Radar Chart for Print */}
              <div className="col-span-12 md:col-span-5 border border-slate-200 rounded-xl p-2 flex flex-col items-center justify-center bg-white h-[142px]" style={{ gridColumn: 'span 5' }}>
                <span className="text-[10px] font-bold text-slate-400 block mb-1">종합 분석 레이더</span>
                <div className="w-full h-[115px] flex items-center justify-center animate-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 9 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name={targetMember.name}
                        dataKey="A"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fill="#6366f1"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 1 Year Attendance Compact Grid */}
            <div className="border border-slate-200 rounded-xl p-4 mb-5 bg-white">
              <h3 className="text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1.5 flex justify-between">
                <span>🗓️ 1년 출석 히스토리 요약</span>
                <span className="text-[9px] font-normal text-slate-400">W: 예배 | G: 집회 | L: 울모임</span>
              </h3>
              
              {/* 6 Grid layout for A4 width */}
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => {
                  const monthDates = SUNDAYS_2026.filter(d => parseInt(d.substring(5, 7), 10) === month);
                  if (monthDates.length === 0) return null;

                  return (
                    <div key={month} className="border border-slate-100 rounded-lg p-1.5 bg-slate-50/50">
                      <span className="text-[10px] font-extrabold text-slate-600 block mb-1 border-b border-slate-200/50 pb-0.5 text-center">{month}월</span>
                      <div className="space-y-1">
                        {monthDates.map(date => {
                          const dayRecord = records.find(r => r.memberId === targetMember.id && r.date === date);
                          const types = dayRecord?.types || [];
                          const dateStr = date.substring(8); // Only Day 'DD' for print compactness
                          
                          const wStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Worship);
                          const gStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Gathering);
                          const lStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Wool);
                          
                          const wCanceled = wStatus?.isCanceled;
                          const gCanceled = gStatus?.isCanceled;
                          const lCanceled = lStatus?.isCanceled;

                          return (
                            <div key={date} className="flex items-center justify-between text-[9px] leading-tight">
                              <span className="text-slate-400 font-mono font-medium">{dateStr}일</span>
                              <div className="flex gap-[1px]">
                                <span className={`w-3 h-3 flex items-center justify-center rounded-[2px] font-bold text-[7px] ${
                                  types.includes(AttendanceType.Worship) ? 'bg-blue-100 text-blue-600' : 
                                  wCanceled ? 'bg-slate-100 text-slate-300' : 'bg-slate-50 text-slate-200'
                                }`}>{wCanceled ? '-' : 'W'}</span>
                                <span className={`w-3 h-3 flex items-center justify-center rounded-[2px] font-bold text-[7px] ${
                                  types.includes(AttendanceType.Gathering) ? 'bg-indigo-100 text-indigo-600' : 
                                  gCanceled ? 'bg-slate-100 text-slate-300' : 'bg-slate-50 text-slate-200'
                                }`}>{gCanceled ? '-' : 'G'}</span>
                                <span className={`w-3 h-3 flex items-center justify-center rounded-[2px] font-bold text-[7px] ${
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
            </div>

            {/* Prayer Request List (Compact) */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white flex-1 overflow-hidden">
              <h3 className="text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1.5 flex justify-between">
                <span>✍️ 최근 기도제목 리스트</span>
                <span className="text-[9px] font-normal text-slate-400">최근 3건 표시</span>
              </h3>

              <div className="space-y-2 max-h-[160px] overflow-hidden">
                {myPrayerHistory.slice(0, 3).length > 0 ? (
                  myPrayerHistory.slice(0, 3).map(record => (
                    <div key={record.id} className="border-b border-slate-100 pb-2 last:border-none last:pb-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{record.date}</span>
                      </div>
                      {record.content && <p className="text-slate-700 text-[11px] leading-relaxed font-normal">{record.content}</p>}
                      {record.note && (
                        <p className="text-[10px] text-amber-700 bg-amber-50/60 rounded px-2 py-0.5 mt-1 font-medium italic">
                          * 비고: {record.note}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-300 italic text-[11px] py-4 text-center">등록된 기도제목이 존재하지 않습니다.</div>
                )}
              </div>
            </div>

            {/* Footer branding */}
            <div className="mt-4 border-t border-slate-100 pt-2 flex justify-between items-center text-[9px] text-slate-400">
              <span>본 문서는 내부 행정을 위한 요약 보고서입니다. 무단 배포를 금합니다.</span>
              <span className="font-semibold text-slate-500">소그룹 출석부 시스템</span>
            </div>
          </div>
        </>
      )}

      {/* Visitation Entry Modal */}
      {isVisitationMode && isVisitationFormOpen && targetMember && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-rose-50 border-b border-rose-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700">
                <Heart size={20} className="fill-rose-100 animate-pulse" />
                <h3 className="font-bold text-lg text-slate-800">{editingVisitation ? '심방 기록 수정' : '새 심방 기록 등록'}</h3>
              </div>
              <button 
                onClick={() => {
                  setIsVisitationFormOpen(false);
                  setEditingVisitation(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-rose-100/50 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content / Form */}
            <form onSubmit={handleVisitationSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Member Display */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">심방 대상자</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-700 text-base">{targetMember.name}</span>
                    <span className="text-slate-400 text-xs ml-2">({targetMember.group})</span>
                  </div>
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">
                    {targetMember.role || '성도'}
                  </span>
                </div>
              </div>

              {/* Date & Type Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">심방 일자</label>
                  <input 
                    type="date"
                    required
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-rose-500 focus:border-rose-500 bg-slate-50"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">심방 형태</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:ring-rose-500 focus:border-rose-500"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                  >
                    {VISITATION_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Place */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-500">심방 장소</label>
                  <button
                    type="button"
                    onClick={fetchCurrentLocationAddress}
                    disabled={gpsLoading}
                    className="text-[10px] text-rose-600 hover:text-rose-800 flex items-center gap-1 font-semibold"
                  >
                    {gpsLoading ? (
                      <>
                        <span className="animate-spin h-2.5 w-2.5 border-2 border-rose-600 border-t-transparent rounded-full" />
                        위치 파악 중...
                      </>
                    ) : gpsError ? (
                      <span className="text-rose-500 underline">위치 실패 (재시도)</span>
                    ) : (
                      <span>📍 현재 위치 자동 입력</span>
                    )}
                  </button>
                </div>
                <input 
                  type="text"
                  required
                  placeholder="예: 교회 로비, 만남의 카페, 성도 가정, 전화통화 등"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-rose-500 focus:border-rose-500"
                  value={formPlace}
                  onChange={(e) => setFormPlace(e.target.value)}
                />
              </div>

              {/* Details */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">상세 내용 및 나눔</label>
                <textarea
                  rows={4}
                  required
                  placeholder="심방을 진행하며 나눈 대화, 신앙적 고민, 조언 등을 자세히 기재해 주세요."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-rose-500 focus:border-rose-500 resize-none leading-relaxed"
                  value={formDetails}
                  onChange={(e) => setFormDetails(e.target.value)}
                />
              </div>

              {/* Prayer Requests */}
              <div>
                <label className="block text-xs font-bold text-indigo-500 mb-1.5">기도 제목 (선택)</label>
                <textarea
                  rows={2}
                  placeholder="심방을 통해 발견된 구체적인 기도 제목을 기록해 주세요."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 resize-none leading-relaxed"
                  value={formPrayerRequests}
                  onChange={(e) => setFormPrayerRequests(e.target.value)}
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-100 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsVisitationFormOpen(false);
                    setEditingVisitation(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-sm font-semibold shadow-md transition-colors cursor-pointer flex items-center gap-1"
                >
                  {editingVisitation ? <Edit2 size={16} /> : <Plus size={16} />}
                  {editingVisitation ? '수정하기' : '심방 기록 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndividualProfile;