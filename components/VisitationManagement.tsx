import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Member, Visitation, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus } from '../types';
import { SUNDAYS_2026 } from '../services/mockData';
import { Plus, Search, Calendar, MapPin, Heart, Clipboard, Trash2, Edit2, Edit3, List, X, Filter, Sparkles, Phone, MessageSquare, AlertCircle, ChevronLeft, ChevronRight, Home, Activity, UserPlus, Network, Settings } from 'lucide-react';
import { runUniversalSearch, runVisitationSearch } from '../services/searchAlgorithm';
import { hasActualPrayerContent, parsePrayerRequests } from '../services/utils';

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const isNewFamily = (member?: Member | null) => {
  if (!member) return false;
  const regDate = member.MemberRegistration || (member as any).registrationDate;
  if (!regDate) return false;
  return String(regDate).trim().startsWith('2026');
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

interface VisitationManagementProps {
  members: Member[];
  visitations: Visitation[];
  setVisitations: React.Dispatch<React.SetStateAction<Visitation[]>>;
  availableGroups: string[];
  usingMock: boolean;
  onAddVisitation: (visitation: Omit<Visitation, 'visitationId' | 'submittedAt'>) => void;
  onUpdateVisitation: (visitation: Visitation) => void;
  onDeleteVisitation: (visitationId: string) => void;
  onUpdateMember?: (updatedMember: Member) => Promise<void>;
  records?: AttendanceRecord[];
  meetingStatus?: MeetingStatus[];
  prayerRecords?: PrayerRecord[];
}

const VisitationManagement: React.FC<VisitationManagementProps> = ({
  members,
  visitations,
  setVisitations,
  availableGroups,
  usingMock,
  onAddVisitation,
  onUpdateVisitation,
  onDeleteVisitation,
  onUpdateMember,
  records = [],
  meetingStatus = [],
  prayerRecords = []
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const wasEditingRef = useRef(false);

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

  // UI states
  const [activeSubTab, setActiveSubTab] = useState<'entry' | 'management'>(() => loadSessionState<'entry' | 'management'>('visitation_activeSubTab', 'entry'));
  const [editingVisitation, setEditingVisitation] = useState<Visitation | null>(null);
  const [searchTerm, setSearchTerm] = useState(() => loadSessionState<string>('visitation_searchTerm', ''));
  const [selectedGroup, setSelectedGroup] = useState(() => loadSessionState<string>('visitation_selectedGroup', 'ALL'));
  const [selectedType, setSelectedType] = useState(() => loadSessionState<string>('visitation_selectedType', 'ALL'));
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sorting & Priority States
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'priority'>(() => loadSessionState<'latest' | 'oldest' | 'priority'>('visitation_sortBy', 'latest'));
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'consecutive3' | 'attendance' | 'prayer' | 'longTime'>(() => loadSessionState<'ALL' | 'consecutive3' | 'attendance' | 'prayer' | 'longTime'>('visitation_priorityFilter', 'ALL'));
  const [showPriorityRecommend, setShowPriorityRecommend] = useState(() => loadSessionState<boolean>('visitation_showPriorityRecommend', true));
  const [excludeZeroAttendanceThisYear, setExcludeZeroAttendanceThisYear] = useState(() => loadSessionState<boolean>('visitation_excludeZeroAttendance', false));
  const [recommendFilter, setRecommendFilter] = useState<'ALL' | '3consecutive' | 'attendance' | 'prayer' | 'longTime'>(() => loadSessionState<'ALL' | '3consecutive' | 'attendance' | 'prayer' | 'longTime'>('visitation_recommendFilter', 'ALL'));
  const [showAllPriorityRecommend, setShowAllPriorityRecommend] = useState(false);

  // GPS states
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Form states
  const [formMemberId, setFormMemberId] = useState('');
  const [formDate, setFormDate] = useState(() => {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
  });
  const [formType, setFormType] = useState('대면심방');
  const [formPlace, setFormPlace] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formPrayerRequests, setFormPrayerRequests] = useState('1. \n2. \n3. ');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [memberSelectMode, setMemberSelectMode] = useState<'search' | 'group'>('search');
  const [selectedFormGroup, setSelectedFormGroup] = useState<string>('');

  // Calendar Filter states
  const [selectedFilterDate, setSelectedFilterDate] = useState<string>(() => loadSessionState<string>('visitation_selectedFilterDate', ''));
  const [isCalendarFilterOpen, setIsCalendarFilterOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => loadSessionState<number>('visitation_calendarYear', new Date().getFullYear()));
  const [calendarMonth, setCalendarMonth] = useState(() => loadSessionState<number>('visitation_calendarMonth', new Date().getMonth() + 1));

  // Card-specific Member Status & Deferral Edit States
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [cardStatusType, setCardStatusType] = useState<'ACTIVE' | 'TRANSFER' | 'STUDY_ABROAD' | 'MILITARY' | 'DEFERRED' | 'INACTIVE'>('ACTIVE');
  const [cardDeferUntil, setCardDeferUntil] = useState('');
  const [cardDeferReason, setCardDeferReason] = useState('');
  const [isUpdatingCardStatus, setIsUpdatingCardStatus] = useState(false);

  const startEditingStatus = (member: Member) => {
    setEditingMemberId(member.id);
    const status = member.status || 'ACTIVE';
    const parts = status.split(':');
    const core = parts[0];
    if (core === 'DEFERRED') {
      setCardStatusType('DEFERRED');
      setCardDeferUntil(parts[1] || '');
      setCardDeferReason(parts.slice(2).join(':') || '');
    } else {
      setCardStatusType(core as any);
      setCardDeferUntil('');
      setCardDeferReason(parts.slice(2).join(':') || parts[1] || '');
    }
  };

  const handleSaveCardStatus = async (member: Member) => {
    if (!onUpdateMember) return;
    setIsUpdatingCardStatus(true);
    try {
      let finalStatus = cardStatusType as string;
      if (cardStatusType === 'DEFERRED') {
        if (!cardDeferUntil) {
          alert('추천 재개일(보류 기한)을 입력해주세요.');
          setIsUpdatingCardStatus(false);
          return;
        }
        finalStatus = `DEFERRED:${cardDeferUntil}`;
      }

      // Add/append the cardDeferReason to specialNotes
      let updatedNotes = member.specialNotes || '';
      if (cardDeferReason.trim()) {
        const prefix = cardStatusType === 'DEFERRED' ? '[심방 보류]' : 
                       cardStatusType === 'TRANSFER' ? '[이동]' :
                       cardStatusType === 'STUDY_ABROAD' ? '[유학]' :
                       cardStatusType === 'MILITARY' ? '[군복무]' :
                       cardStatusType === 'INACTIVE' ? '[비활동]' : '';
        const noteToAdd = prefix ? `${prefix} ${cardDeferReason.trim()}` : cardDeferReason.trim();
        
        if (updatedNotes) {
          if (!updatedNotes.includes(cardDeferReason.trim())) {
            updatedNotes = `${updatedNotes}\n${noteToAdd}`;
          }
        } else {
          updatedNotes = noteToAdd;
        }
      }

      const updatedMember: Member = {
        ...member,
        status: finalStatus,
        specialNotes: updatedNotes
      };

      await onUpdateMember(updatedMember);
      setEditingMemberId(null);
      alert(`${member.name} 성도의 상태 및 설정이 저장되었습니다.`);
    } catch (e) {
      console.error(e);
      alert('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingCardStatus(false);
    }
  };

  // Save states to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem('visitation_activeSubTab', JSON.stringify(activeSubTab));
  }, [activeSubTab]);

  useEffect(() => {
    sessionStorage.setItem('visitation_searchTerm', JSON.stringify(searchTerm));
  }, [searchTerm]);

  useEffect(() => {
    sessionStorage.setItem('visitation_selectedGroup', JSON.stringify(selectedGroup));
  }, [selectedGroup]);

  useEffect(() => {
    sessionStorage.setItem('visitation_selectedType', JSON.stringify(selectedType));
  }, [selectedType]);

  useEffect(() => {
    sessionStorage.setItem('visitation_sortBy', JSON.stringify(sortBy));
  }, [sortBy]);

  useEffect(() => {
    sessionStorage.setItem('visitation_priorityFilter', JSON.stringify(priorityFilter));
  }, [priorityFilter]);

  useEffect(() => {
    sessionStorage.setItem('visitation_showPriorityRecommend', JSON.stringify(showPriorityRecommend));
  }, [showPriorityRecommend]);

  useEffect(() => {
    sessionStorage.setItem('visitation_selectedFilterDate', JSON.stringify(selectedFilterDate));
  }, [selectedFilterDate]);

  useEffect(() => {
    sessionStorage.setItem('visitation_calendarYear', JSON.stringify(calendarYear));
  }, [calendarYear]);

  useEffect(() => {
    sessionStorage.setItem('visitation_calendarMonth', JSON.stringify(calendarMonth));
  }, [calendarMonth]);

  // Handle incoming selection state from OrganizationChart
  useEffect(() => {
    if (location.state && location.state.fromOrgChart) {
      const state = location.state as any;
      
      // Restore other form values if originalFormState is provided
      if (state.formState) {
        const fs = state.formState;
        if (fs.formDate !== undefined) setFormDate(fs.formDate);
        if (fs.formType !== undefined) setFormType(fs.formType);
        if (fs.formPlace !== undefined) setFormPlace(fs.formPlace);
        if (fs.formDetails !== undefined) setFormDetails(fs.formDetails);
        if (fs.formPrayerRequests !== undefined) setFormPrayerRequests(fs.formPrayerRequests);
        if (fs.memberSelectMode !== undefined) setMemberSelectMode(fs.memberSelectMode);
        if (fs.selectedFormGroup !== undefined) setSelectedFormGroup(fs.selectedFormGroup);
      }
      
      // Set the selected member ID if provided
      if (state.selectedMemberId) {
        setFormMemberId(state.selectedMemberId);
        const target = members.find(m => m.id === state.selectedMemberId);
        if (target) {
          setMemberSearchQuery(target.name);
        }
      }
      
      // Clean location state to avoid repeating on refresh after a small delay
      // This prevents React 18 StrictMode double-mounting state resets
      const timer = setTimeout(() => {
        navigate(location.pathname, { replace: true, state: {} });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.state, members, navigate]);

  // Scroll active suggestion into view for visitation management
  useEffect(() => {
    if (activeSuggestionIndex >= 0) {
      const activeEl = document.getElementById(`visitation-suggestion-item-${activeSuggestionIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeSuggestionIndex]);

  const activeVisitationDatesSet = useMemo(() => {
    const s = new Set<string>();
    visitations.forEach(v => {
      if (v.date) s.add(v.date);
    });
    return s;
  }, [visitations]);

  // Visitation types options
  const VISITATION_TYPES = ['대면심방', '전화심방', '새가족심방', '연계심방', 'SNS심방', '가정방문', '병원심방', '기타심방'];

  // Map memberId to Member object for quick lookup
  const memberMap = useMemo(() => {
    const map: Record<string, Member> = {};
    members.forEach(m => {
      map[m.id] = m;
    });
    return map;
  }, [members]);

  // Target member for form stats calculation
  const targetMemberForStats = useMemo(() => {
    if (formMemberId) {
      return memberMap[formMemberId] || null;
    }
    return null;
  }, [formMemberId, memberMap]);

  // Calculate statistics for selected member in the form
  const formMemberStats = useMemo(() => {
    if (!targetMemberForStats) return null;

    const now = new Date();
    const targetDate = now.getFullYear() >= 2026 ? now : new Date(2026, now.getMonth(), now.getDate()); 
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dVal = String(targetDate.getDate()).padStart(2, '0');
    const comparisonDateStr = `${y}-${m}-${dVal}`;

    let passedSundays = SUNDAYS_2026.filter(d => d <= comparisonDateStr);
    
    const regDate = targetMemberForStats.MemberRegistration || (targetMemberForStats as any).registrationDate;
    if (regDate) {
      let normReg = String(regDate).trim();
      if (/^\d{4}$/.test(normReg)) {
        normReg = `${normReg}-01-01`;
      } else if (/^\d{4}-\d{2}$/.test(normReg)) {
        normReg = `${normReg}-01`;
      }
      passedSundays = passedSundays.filter(d => d >= normReg);
    }

    let possibleWorship = 0;
    let possibleGathering = 0;
    let possibleWool = 0;

    passedSundays.forEach(date => {
      const wCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Worship && s.isCanceled);
      const gCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Gathering && s.isCanceled);
      const lCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Wool && s.isCanceled);

      if (!wCanceled) possibleWorship++;
      if (!gCanceled) possibleGathering++;
      if (!lCanceled) possibleWool++;
    });

    const myRecords = records.filter(r => r.memberId === targetMemberForStats.id && passedSundays.includes(r.date));
    
    const worshipCount = myRecords.filter(r => r.types.includes(AttendanceType.Worship)).length;
    const gatheringCount = myRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length;
    const woolCount = myRecords.filter(r => r.types.includes(AttendanceType.Wool)).length;
    
    const prayerCount = prayerRecords.filter(r => r.memberId === targetMemberForStats.id).length;

    const calcRate = (count: number, total: number) => total === 0 ? 0 : Math.round((count / total) * 100);

    return {
      worshipRate: calcRate(worshipCount, possibleWorship),
      gatheringRate: calcRate(gatheringCount, possibleGathering),
      woolRate: calcRate(woolCount, possibleWool),
      prayerCount
    };
  }, [targetMemberForStats, records, prayerRecords, meetingStatus]);

  // Geolocation lookup & reverse geocoding to Korea "Gu Dong" format
  const fetchCurrentLocationAddress = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS 미지원 브라우저');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    // Using enableHighAccuracy: false is much faster and highly reliable on indoor/PC environments (where GPS satellites are unreachable)
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
          
          // Fallback parsing display_name
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
          setGpsError('상세 주소 변환 실패');
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        console.warn('Geolocation error context:', error);
        let friendlyMessage = '위치 파악 불가';
        if (error.code === 1) {
          friendlyMessage = '위치 권한이 차단되었습니다';
        } else if (error.code === 2) {
          friendlyMessage = '위치 신호를 탐지할 수 없습니다';
        } else if (error.code === 3) {
          friendlyMessage = '위치 조회 시간이 초과되었습니다';
        }
        setGpsError(friendlyMessage);
        setGpsLoading(false);
      },
      { enableHighAccuracy: false, timeout: 15000 }
    );
  };

  // Auto-fetch location on mobile/tablet when entering 'entry' subtab for password '7980' (the authorized visitation mode)
  useEffect(() => {
    if (activeSubTab === 'entry' && !editingVisitation && !formPlace) {
      const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && window.innerWidth < 1024;
      if (isMobileOrTablet) {
        fetchCurrentLocationAddress();
      }
    }
  }, [activeSubTab, editingVisitation]);

  // Sync form states when editingVisitation changes
  useEffect(() => {
    if (editingVisitation) {
      setFormMemberId(editingVisitation.memberId);
      setFormDate(editingVisitation.date);
      setFormType(editingVisitation.visitationType);
      setFormPlace(editingVisitation.place);
      setFormDetails(editingVisitation.details);
      setFormPrayerRequests(editingVisitation.prayerRequests || '1. \n2. \n3. ');
      const target = memberMap[editingVisitation.memberId];
      if (target) {
        setMemberSearchQuery(target.name);
      }
      wasEditingRef.current = true;
    } else {
      // Only reset form states if we were previously in editing mode
      if (wasEditingRef.current) {
        setFormMemberId('');
        const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
        setFormDate(todayLocal);
        setFormType('대면심방');
        setFormPlace('');
        setFormDetails('');
        setFormPrayerRequests('1. \n2. \n3. ');
        setMemberSearchQuery('');
        setSelectedFormGroup('');
        setMemberSelectMode('search');
        wasEditingRef.current = false;
      }
    }
  }, [editingVisitation, memberMap]);

  // Filter members list in the dropdown based on search name
  const filteredFormMembersSearch = useMemo(() => {
    if (!memberSearchQuery.trim()) return [];
    const activeMembers = members.filter(m => {
      const s = (m.status?.split(':')[0] || 'ACTIVE').toUpperCase();
      return s !== 'INACTIVE' && s !== 'DELETED';
    });
    return runUniversalSearch(activeMembers, memberSearchQuery);
  }, [members, memberSearchQuery]);

  // Filter members list in the dropdown based on selected group
  const filteredFormMembersByGroup = useMemo(() => {
    if (!selectedFormGroup) return [];
    return members
      .filter(m => {
        const s = (m.status?.split(':')[0] || 'ACTIVE').toUpperCase();
        return s !== 'INACTIVE' && s !== 'DELETED';
      })
      .filter(m => m.group === selectedFormGroup);
  }, [members, selectedFormGroup]);

  // Navigate to Organization Chart with current form state saved
  const handleNavigateToOrgChart = () => {
    const currentFormState = {
      formDate,
      formType,
      formPlace,
      formDetails,
      formPrayerRequests,
      memberSelectMode,
      selectedFormGroup
    };
    navigate('/org', {
      state: {
        selectingForVisitation: true,
        formState: currentFormState
      }
    });
  };

  // Handle submitting new or edited visitation
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMemberId) {
      alert('대상 성도를 선택해주세요.');
      return;
    }

    if (editingVisitation) {
      onUpdateVisitation({
        ...editingVisitation,
        date: formDate,
        memberId: formMemberId,
        visitationType: formType,
        place: (formType === '연계심방' || formType === '새가족심방') ? '' : formPlace,
        details: formDetails,
        prayerRequests: formPrayerRequests
      });
      alert('심방 기록이 성공적으로 수정되었습니다.');
    } else {
      onAddVisitation({
        date: formDate,
        memberId: formMemberId,
        visitationType: formType,
        place: (formType === '연계심방' || formType === '새가족심방') ? '' : formPlace,
        details: formDetails,
        prayerRequests: formPrayerRequests
      });
      alert('심방 기록이 성공적으로 저장되었습니다.');
    }

    // Reset and switch to list tab
    setFormMemberId('');
    const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    setFormDate(todayLocal);
    setFormType('대면심방');
    setFormPlace('');
    setFormDetails('');
    setFormPrayerRequests('1. \n2. \n3. ');
    setMemberSearchQuery('');
    setSelectedFormGroup('');
    setMemberSelectMode('search');
    setEditingVisitation(null);
    setActiveSubTab('management');
  };

  // Cache attendance rate for all members based on last 4 Sundays
  const attendanceRateMap = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const passedSundays = SUNDAYS_2026.filter(d => d <= todayStr).slice(-4);
    
    const map: Record<string, number> = {};
    members.forEach(member => {
      let attendanceCount = 0;
      let totalExpected = 0;
      passedSundays.forEach(sunday => {
        const isWorshipCanceled = meetingStatus.some(s => s.date === sunday && s.type === AttendanceType.Worship && s.isCanceled);
        if (isWorshipCanceled) return;

        const record = records.find(r => r.memberId === member.id && r.date === sunday);
        totalExpected++;
        if (record && record.types && record.types.length > 0) {
          attendanceCount++;
        }
      });
      map[member.id] = totalExpected > 0 ? (attendanceCount / totalExpected) * 100 : 100;
    });
    return map;
  }, [members, records, meetingStatus]);

  // Cache detailed attendance rates (Worship, Gathering, Wool) for all members matching IndividualProfile's stats calculation
  const detailedAttendanceRateMap = useMemo(() => {
    const now = new Date();
    const targetDate = now.getFullYear() >= 2026 ? now : new Date(2026, now.getMonth(), now.getDate()); 
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dVal = String(targetDate.getDate()).padStart(2, '0');
    const comparisonDateStr = `${y}-${m}-${dVal}`;
    
    const map: Record<string, { worship: number; gathering: number; wool: number }> = {};
    members.forEach(member => {
      let memberSundays = SUNDAYS_2026.filter(d => d <= comparisonDateStr);

      const regDate = member.MemberRegistration || (member as any).registrationDate;
      if (regDate) {
        let normReg = String(regDate).trim();
        if (/^\d{4}$/.test(normReg)) {
          normReg = `${normReg}-01-01`;
        } else if (/^\d{4}-\d{2}$/.test(normReg)) {
          normReg = `${normReg}-01`;
        }
        memberSundays = memberSundays.filter(d => d >= normReg);
      }

      let worshipCount = 0;
      let worshipExpected = 0;
      let gatheringCount = 0;
      let gatheringExpected = 0;
      let woolCount = 0;
      let woolExpected = 0;

      const myRecords = records.filter(r => r.memberId === member.id && memberSundays.includes(r.date));

      memberSundays.forEach(sunday => {
        // Worship
        const isWorshipCanceled = meetingStatus.some(s => s.date === sunday && s.type === AttendanceType.Worship && s.isCanceled);
        if (!isWorshipCanceled) {
          worshipExpected++;
        }

        // Gathering
        const isGatheringCanceled = meetingStatus.some(s => s.date === sunday && s.type === AttendanceType.Gathering && s.isCanceled);
        if (!isGatheringCanceled) {
          gatheringExpected++;
        }

        // Wool
        const isWoolCanceled = meetingStatus.some(s => s.date === sunday && s.type === AttendanceType.Wool && s.isCanceled);
        if (!isWoolCanceled) {
          woolExpected++;
        }
      });

      const wCount = myRecords.filter(r => r.types.includes(AttendanceType.Worship)).length;
      const gCount = myRecords.filter(r => r.types.includes(AttendanceType.Gathering)).length;
      const wmcCount = myRecords.filter(r => r.types.includes(AttendanceType.Wool)).length;

      map[member.id] = {
        worship: worshipExpected === 0 ? 0 : Math.round((wCount / worshipExpected) * 100),
        gathering: gatheringExpected === 0 ? 0 : Math.round((gCount / gatheringExpected) * 100),
        wool: woolExpected === 0 ? 0 : Math.round((wmcCount / woolExpected) * 100)
      };
    });
    return map;
  }, [members, records, meetingStatus]);

  // Compute priority scores for all active members based on attendance rate, interval since last visit, and prayer request updates
  const memberPriorityScores = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    // Get recent 4 Sundays from SUNDAYS_2026
    const passedSundays = SUNDAYS_2026.filter(d => d <= todayStr).slice(-4);
    const passedSundaysThisYear = SUNDAYS_2026.filter(d => d <= todayStr);
    const recent3Sundays = passedSundaysThisYear.slice(-3);

    // Get last visitation for each member
    const lastVisitationMap: Record<string, Visitation> = {};
    visitations.forEach(v => {
      const existing = lastVisitationMap[v.memberId];
      if (!existing || new Date(v.date) > new Date(existing.date)) {
        lastVisitationMap[v.memberId] = v;
      }
    });

    return members
      .filter(m => {
        if (!m) return false;
        const nameStr = String(m.name || (m as any).이름 || '').trim();
        // Exclude members without a valid name or where name is purely 1-3 digits without a Korean name
        if (!nameStr || (/^\d{1,3}$/.test(nameStr) && !(m as any).이름)) {
          return false;
        }
        const status = m.status || 'ACTIVE';
        const coreStatus = status.split(':')[0];
        if (coreStatus === 'INACTIVE' || coreStatus === 'TRANSFER' || coreStatus === 'STUDY_ABROAD' || coreStatus === 'MILITARY' || coreStatus === 'DELETED') {
          return false;
        }
        if (coreStatus === 'DEFERRED') {
          const parts = status.split(':');
          const dateStr = parts[1];
          if (dateStr && dateStr > todayStr) {
            return false;
          }
        }
        return true;
      })
      .map(member => {
        let score = 0;
        const reasons: string[] = [];

        // 0) Yearly Small Group (Wool) Attendance Count
        let yearlyWoolAttendanceCount = 0;
        passedSundaysThisYear.forEach(sunday => {
          const record = records.find(r => r.memberId === member.id && r.date === sunday);
          if (record && record.types && record.types.includes(AttendanceType.Wool)) {
            yearlyWoolAttendanceCount++;
          }
        });
        const isZeroAttendanceThisYear = (passedSundaysThisYear.length > 0 && yearlyWoolAttendanceCount === 0);

        // Check 3 consecutive weeks absence
        let consecutiveAbsence3Count = 0;
        let recent3ValidSundaysCount = 0;
        recent3Sundays.forEach(sunday => {
          const isWorshipCanceled = meetingStatus.some(s => s.date === sunday && s.type === AttendanceType.Worship && s.isCanceled);
          if (!isWorshipCanceled) {
            recent3ValidSundaysCount++;
            const record = records.find(r => r.memberId === member.id && r.date === sunday);
            if (!record || !record.types || record.types.length === 0) {
              consecutiveAbsence3Count++;
            }
          }
        });
        const isThreeConsecutiveAbsences = (recent3ValidSundaysCount >= 3 && consecutiveAbsence3Count === recent3ValidSundaysCount);
        
        // 1) Attendance Rate (Last 4 Sundays)
        let attendanceCount = 0;
        let totalExpected = 0;
        passedSundays.forEach(sunday => {
          // Check if meeting was canceled on that day
          const isWorshipCanceled = meetingStatus.some(s => s.date === sunday && s.type === AttendanceType.Worship && s.isCanceled);
          if (isWorshipCanceled) return;

          const record = records.find(r => r.memberId === member.id && r.date === sunday);
          totalExpected++;
          if (record && record.types && record.types.length > 0) {
            attendanceCount++;
          }
        });

        const attendanceRate = totalExpected > 0 ? (attendanceCount / totalExpected) * 100 : 100;
        let hasAttendanceIssue = false;

        if (isThreeConsecutiveAbsences) {
          score += 45;
          reasons.push('🚨 최근 3주 연속 결석 (3주간 무출석)');
          hasAttendanceIssue = true;
        }

        if (totalExpected > 0) {
          if (attendanceCount === 0 && !isThreeConsecutiveAbsences) {
            score += 50;
            reasons.push('최근 4주 연속 결석 (출석률 0%)');
            hasAttendanceIssue = true;
          } else if (attendanceRate <= 25 && !isThreeConsecutiveAbsences) {
            score += 35;
            reasons.push(`최근 출석률 극히 저조 (${attendanceRate.toFixed(0)}%)`);
            hasAttendanceIssue = true;
          } else if (attendanceRate <= 50 && !isThreeConsecutiveAbsences) {
            score += 20;
            reasons.push(`최근 출석률 저조 (${attendanceRate.toFixed(0)}%)`);
            hasAttendanceIssue = true;
          }
        }

        if (isZeroAttendanceThisYear && !isThreeConsecutiveAbsences) {
          reasons.push('⚠️ 올해 소그룹 모임 출석 없음 (0회)');
        }

        // 2) Interval since last visitation
        const lastVis = lastVisitationMap[member.id];
        let hasIntervalIssue = false;
        if (!lastVis) {
          score += 40;
          reasons.push('등록 후 심방 기록 없음');
          hasIntervalIssue = true;
        } else {
          const daysSinceLastVis = Math.floor((now.getTime() - new Date(lastVis.date).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceLastVis >= 180) {
            score += 30;
            reasons.push(`마지막 심방 후 6개월 경과 (${daysSinceLastVis}일 전)`);
            hasIntervalIssue = true;
          } else if (daysSinceLastVis >= 90) {
            score += 15;
            reasons.push(`마지막 심방 후 3개월 경과 (${daysSinceLastVis}일 전)`);
            hasIntervalIssue = true;
          }
        }

        // 3) Recent prayer request update (last 14 days)
        const myPrayers = prayerRecords.filter(p => p.memberId === member.id);
        let hasRecentPrayerUpdate = false;
        myPrayers.forEach(p => {
          const pDate = new Date(p.date);
          const diffDays = Math.floor((now.getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 14) {
            hasRecentPrayerUpdate = true;
          }
        });
        if (hasRecentPrayerUpdate) {
          score += 25;
          reasons.push('최근 2주 내 기도제목 업데이트됨');
        }

        return {
          member,
          score,
          reasons,
          attendanceRate,
          lastVisitationDate: lastVis ? lastVis.date : null,
          hasAttendanceIssue,
          hasIntervalIssue,
          hasRecentPrayerUpdate,
          yearlyWoolAttendanceCount,
          isZeroAttendanceThisYear,
          isThreeConsecutiveAbsences
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [members, visitations, records, prayerRecords, meetingStatus]);

  // Filtered recommendations based on excludeZeroAttendanceThisYear and recommendFilter
  const filteredPriorityMembers = useMemo(() => {
    let list = memberPriorityScores;

    // 1. Option to exclude members with zero attendance this year
    if (excludeZeroAttendanceThisYear) {
      list = list.filter(p => !p.isZeroAttendanceThisYear);
    }

    // 2. Filter by recommendation category
    if (recommendFilter === '3consecutive') {
      list = list.filter(p => p.isThreeConsecutiveAbsences);
    } else if (recommendFilter === 'attendance') {
      list = list.filter(p => p.hasAttendanceIssue);
    } else if (recommendFilter === 'prayer') {
      list = list.filter(p => p.hasRecentPrayerUpdate);
    } else if (recommendFilter === 'longTime') {
      list = list.filter(p => p.hasIntervalIssue);
    }

    return list;
  }, [memberPriorityScores, excludeZeroAttendanceThisYear, recommendFilter]);

  // Summary counts for recommendation filters
  const recommendStats = useMemo(() => {
    const baseList = excludeZeroAttendanceThisYear
      ? memberPriorityScores.filter(p => !p.isZeroAttendanceThisYear)
      : memberPriorityScores;

    return {
      total: baseList.length,
      threeConsecutive: baseList.filter(p => p.isThreeConsecutiveAbsences).length,
      zeroAttendance: memberPriorityScores.filter(p => p.isZeroAttendanceThisYear).length,
      attendance: baseList.filter(p => p.hasAttendanceIssue).length,
      prayer: baseList.filter(p => p.hasRecentPrayerUpdate).length,
      longTime: baseList.filter(p => p.hasIntervalIssue).length
    };
  }, [memberPriorityScores, excludeZeroAttendanceThisYear]);

  // List filtered by other search parameters, excluding selectedType (for accurate stats counting)
  const baseFilteredVisitations = useMemo(() => {
    const results = runVisitationSearch(
      visitations,
      memberMap,
      searchTerm,
      selectedGroup,
      'ALL', // bypass type filtering for stats calculation
      selectedFilterDate
    );
    return results.map(r => r.visitation);
  }, [visitations, memberMap, searchTerm, selectedGroup, selectedFilterDate]);

  // Filter and sort visitations for the list
  const filteredVisitations = useMemo(() => {
    const searchResults = runVisitationSearch(
      visitations,
      memberMap,
      searchTerm,
      selectedGroup,
      selectedType,
      selectedFilterDate
    );

    let resultsWithScore = [...searchResults];

    // Apply priority filters if any
    if (priorityFilter !== 'ALL') {
      resultsWithScore = resultsWithScore.filter(item => {
        const v = item.visitation;
        const pScore = memberPriorityScores.find(p => p.member.id === v.memberId);
        if (!pScore) return false;
        if (priorityFilter === 'consecutive3') return pScore.isThreeConsecutiveAbsences;
        if (priorityFilter === 'attendance') return pScore.hasAttendanceIssue;
        if (priorityFilter === 'prayer') return pScore.hasRecentPrayerUpdate;
        if (priorityFilter === 'longTime') return pScore.hasIntervalIssue;
        return true;
      });
    }

    // Apply sorting
    resultsWithScore.sort((a, b) => {
      // 1. If there is a search term, prioritize search relevance score first
      if (searchTerm.trim()) {
        if (Math.abs(b.score - a.score) > 0.001) {
          return b.score - a.score;
        }
      }

      // 2. Secondary sorting based on selected sortBy option
      if (sortBy === 'latest') {
        return new Date(b.visitation.date).getTime() - new Date(a.visitation.date).getTime();
      } else if (sortBy === 'oldest') {
        return new Date(a.visitation.date).getTime() - new Date(b.visitation.date).getTime();
      } else if (sortBy === 'priority') {
        const scoreA = memberPriorityScores.find(p => p.member.id === a.visitation.memberId)?.score || 0;
        const scoreB = memberPriorityScores.find(p => p.member.id === b.visitation.memberId)?.score || 0;
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return new Date(b.visitation.date).getTime() - new Date(a.visitation.date).getTime();
      }
      return 0;
    });

    return resultsWithScore.map(r => r.visitation);
  }, [visitations, memberMap, searchTerm, selectedGroup, selectedType, selectedFilterDate, sortBy, priorityFilter, memberPriorityScores]);

  // Statistics with 8 fully separated categories
  const stats = useMemo(() => {
    const total = baseFilteredVisitations.length;
    const faceToFace = baseFilteredVisitations.filter(v => v.visitationType === '대면심방').length;
    const homeVisit = baseFilteredVisitations.filter(v => v.visitationType === '가정방문').length;
    const phone = baseFilteredVisitations.filter(v => v.visitationType === '전화심방').length;
    const sns = baseFilteredVisitations.filter(v => v.visitationType === 'SNS심방' || v.visitationType === '온라인심방' || v.visitationType === 'SNS/메시지').length;
    const newFamily = baseFilteredVisitations.filter(v => v.visitationType === '새가족심방').length;
    const hospital = baseFilteredVisitations.filter(v => v.visitationType === '병원심방').length;
    const other = baseFilteredVisitations.filter(v => v.visitationType === '기타심방' || v.visitationType === '기타').length;
    
    return { total, faceToFace, homeVisit, phone, sns, newFamily, hospital, other };
  }, [baseFilteredVisitations]);

  return (
    <div className="space-y-2.5 sm:space-y-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5 sm:pb-2">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-50 flex items-center gap-1.5 sm:gap-2 tracking-tight">
            <Heart className="text-rose-500 fill-rose-100 dark:fill-rose-950/30" size={18} />
            심방 관리
            <span className="text-[8px] sm:text-[9px] bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.2 rounded-full border border-rose-100/50 dark:border-rose-900/30">
              관리자 모드
            </span>
          </h1>
          <p className="text-slate-400 dark:text-slate-500 text-[10px] sm:text-[11px] mt-0.5">
            소중한 성도님들의 삶의 이야기를 기록하고 따뜻하게 기억하는 공간입니다.
          </p>
        </div>
      </div>

      {/* Segmented Sub Tabs Navigation */}
      <div className="mx-auto w-full max-w-sm sm:max-w-lg flex bg-slate-100/60 dark:bg-slate-950/40 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.02)] mb-1.5">
        <button
          onClick={() => {
            setActiveSubTab('entry');
            if (editingVisitation) {
              setEditingVisitation(null);
            }
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold transition-all duration-300 cursor-pointer ${
            activeSubTab === 'entry' && !editingVisitation
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)] scale-[1.01]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Edit3 size={14} className={activeSubTab === 'entry' && !editingVisitation ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
          심방 입력
        </button>
        <button
          onClick={() => setActiveSubTab('management')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold transition-all duration-300 cursor-pointer ${
            activeSubTab === 'management'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)] scale-[1.01]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <List size={14} className={activeSubTab === 'management' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
          심방 목록
        </button>
        {editingVisitation && (
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.2)] animate-pulse"
          >
            <Edit2 size={13} />
            수정 ({memberMap[formMemberId]?.name || ''})
          </button>
        )}
      </div>

      {/* Tab Contents */}
      {activeSubTab === 'entry' ? (
        /* PC에서 극도로 고급스럽고 정갈한 모던 스타일의 유동형 가로폭 레이아웃 적용 */
        <div className={`mx-auto transition-all duration-300 ${formMemberId ? 'max-w-5xl' : 'max-w-2xl'}`}>
          <div className={`grid grid-cols-1 ${formMemberId ? 'lg:grid-cols-12 gap-4 lg:gap-6' : 'grid-cols-1'} items-start`}>
            
            {/* LEFT SIDE: DYNAMIC PROFILE SYNC CARD (성도 선택시에만 렌더링) */}
            {formMemberId && (
              <div className="lg:col-span-5 space-y-3 animate-fadeIn">
                <div className={`rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] p-4 space-y-4 transition-all duration-300 relative border ${
                  isNewFamily(memberMap[formMemberId]) 
                    ? 'border-lime-400 bg-lime-50/10 dark:bg-lime-950/10' 
                    : 'bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {memberMap[formMemberId]?.photoUrl ? (
                        <img
                          src={memberMap[formMemberId]?.photoUrl}
                          alt={memberMap[formMemberId]?.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-full object-cover border-2 border-lime-400 dark:border-lime-500 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-lime-50 dark:bg-lime-950/40 rounded-full flex items-center justify-center text-lime-600 dark:text-lime-400 text-sm font-bold border-2 border-lime-400 shrink-0">
                          {memberMap[formMemberId]?.name?.substring(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 
                            onClick={() => navigate('/profile', { state: { memberId: formMemberId } })}
                            className="text-base font-bold text-slate-950 dark:text-slate-50 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer hover:underline truncate"
                          >
                            {memberMap[formMemberId]?.name}
                          </h4>
                          {isNewFamily(memberMap[formMemberId]) && (
                            <span className="text-[10px] font-bold bg-lime-500 text-white px-1.5 py-0.2 rounded shrink-0 animate-pulse">새가족</span>
                          )}
                          <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded shrink-0">
                            {memberMap[formMemberId]?.group}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.2 truncate">
                          {memberMap[formMemberId]?.role || '성도'} • {memberMap[formMemberId]?.gender === 'MALE' ? '형제' : '자매'}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                          {memberMap[formMemberId]?.phone || '연락처 없음'}
                        </p>
                      </div>
                    </div>
                    {/* deselect member button */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormMemberId('');
                        setMemberSearchQuery('');
                        setSelectedFormGroup('');
                      }}
                      className="text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-1.5 rounded-full transition-all shrink-0 cursor-pointer"
                      title="선택 취소"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
                    {formMemberStats && (
                      <div>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold tracking-wider block mb-1.5">출석률 및 활동 요약</span>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 p-2 rounded-xl">
                            <span className="text-[9px] text-blue-500 dark:text-blue-400 font-bold block mb-0.5">예배</span>
                            <span className="text-xs font-extrabold text-blue-700 dark:text-blue-300">{formMemberStats.worshipRate}%</span>
                          </div>
                          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 p-2 rounded-xl">
                            <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold block mb-0.5">집회</span>
                            <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">{formMemberStats.gatheringRate}%</span>
                          </div>
                          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-900/30 p-2 rounded-xl">
                            <span className="text-[9px] text-emerald-500 dark:text-emerald-400 font-bold block mb-0.5">울모임</span>
                            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">{formMemberStats.woolRate}%</span>
                          </div>
                          <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100/50 dark:border-amber-900/30 p-2 rounded-xl">
                            <span className="text-[9px] text-amber-500 dark:text-amber-400 font-bold block mb-0.5">기도제목</span>
                            <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{formMemberStats.prayerCount}건</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold tracking-wider block mb-0.5">성도 특이사항</span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-950/20 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
                        {memberMap[formMemberId]?.specialNotes || '등록된 특이사항이 없습니다.'}
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold tracking-wider block mb-0.5">최근 심방 히스토리</span>
                      <div className="space-y-1.5">
                        {visitations.filter(v => v.memberId === formMemberId).slice(0, 2).length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic">이전 심방 기록이 아직 없습니다.</p>
                        ) : (
                          visitations
                            .filter(v => v.memberId === formMemberId)
                            .slice(0, 2)
                            .map((v, i) => (
                              <div key={v.visitationId} className="flex gap-2 items-start text-[11px] border-l-2 border-indigo-100 dark:border-indigo-900 pl-2 py-0.2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">{v.date}</span>
                                    <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-1 rounded">
                                      {v.visitationType}
                                    </span>
                                  </div>
                                  <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5 text-[10px]">{v.details}</p>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT SIDE: BEAUTIFUL INPUT FORM */}
            <div className={`${formMemberId ? 'lg:col-span-7' : 'w-full'} bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-[0_4px_30px_rgba(0,0,0,0.02)] p-4 sm:p-5 lg:p-6 space-y-4 transition-all duration-300`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-500 rounded-full" />
                {editingVisitation ? '심방 정보 편집하기' : '심방 기록 카드 작성'}
              </h3>
              {editingVisitation && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingVisitation(null);
                    setActiveSubTab('management');
                  }}
                  className="text-xs text-rose-500 font-bold hover:underline transition-all"
                >
                  수정 취소
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Target Member Selector */}
              {!formMemberId && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">대상 성도 선택</label>
                  <div className="space-y-2.5">
                    {/* Selection Mode Toggle */}
                    <div className="flex bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setMemberSelectMode('search');
                          setMemberSearchQuery('');
                        }}
                        className={`flex-1 py-1.5 text-center text-[11px] font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                          memberSelectMode === 'search'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        이름으로 검색
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMemberSelectMode('group');
                          setSelectedFormGroup('');
                        }}
                        className={`flex-1 py-1.5 text-center text-[11px] font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                          memberSelectMode === 'group'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        소그룹별 명단 찾기
                      </button>
                    </div>

                    {memberSelectMode === 'search' ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                              type="text"
                              value={memberSearchQuery}
                              onChange={(e) => {
                                setMemberSearchQuery(e.target.value);
                                setActiveSuggestionIndex(-1);
                              }}
                              onKeyDown={(e) => {
                                if (!memberSearchQuery.trim()) return;
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setActiveSuggestionIndex(prev => 
                                    prev < filteredFormMembersSearch.length - 1 ? prev + 1 : prev
                                  );
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1));
                                } else if (e.key === 'Enter') {
                                  if (activeSuggestionIndex >= 0 && activeSuggestionIndex < filteredFormMembersSearch.length) {
                                    e.preventDefault();
                                    const selected = filteredFormMembersSearch[activeSuggestionIndex];
                                    setFormMemberId(selected.member.id);
                                    setMemberSearchQuery(selected.member.name);
                                    setActiveSuggestionIndex(-1);
                                  }
                                } else if (e.key === 'Escape') {
                                  setMemberSearchQuery('');
                                  setActiveSuggestionIndex(-1);
                                }
                              }}
                              placeholder="성도 이름을 입력하세요..."
                              className="w-full h-9 sm:h-10 pl-9 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleNavigateToOrgChart}
                            title="조직도에서 성도 선택"
                            className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl flex items-center justify-center border border-indigo-100/40 dark:border-indigo-900/40 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                          >
                            <Network size={16} className="text-indigo-500 dark:text-indigo-400" />
                          </button>
                        </div>
                        {memberSearchQuery.trim() ? (
                          <div className="border border-slate-200 dark:border-slate-800 rounded-xl max-h-[160px] overflow-y-auto p-1.5 bg-slate-50/50 dark:bg-slate-950/30 space-y-0.5">
                            {filteredFormMembersSearch.length === 0 ? (
                              <p className="text-[11px] text-slate-400 p-3 text-center">검색 결과가 없습니다.</p>
                            ) : (
                              filteredFormMembersSearch.map((item, idx) => (
                                <button
                                  key={item.member.id}
                                  id={`visitation-suggestion-item-${idx}`}
                                  type="button"
                                  onClick={() => {
                                    setFormMemberId(item.member.id);
                                    setMemberSearchQuery(item.member.name);
                                    setActiveSuggestionIndex(-1);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-[11px] rounded-lg transition-all duration-150 flex flex-col gap-0.5 outline-none cursor-pointer ${
                                    idx === activeSuggestionIndex 
                                      ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 font-bold border-l-4 border-indigo-600' 
                                      : isNewFamily(item.member)
                                        ? 'bg-lime-50/40 dark:bg-lime-950/15 hover:bg-lime-100/50 dark:hover:bg-lime-900/30 text-lime-900 dark:text-lime-300 border border-lime-100 dark:border-lime-900/30'
                                        : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold">{item.member.name}</span>
                                      {isNewFamily(item.member) && (
                                        <span className="px-1 py-0.2 text-[8px] bg-lime-500 text-white font-extrabold rounded">새가족</span>
                                      )}
                                      <span className="text-[9px] text-slate-400 dark:text-slate-500">({item.member.group})</span>
                                      <span className="text-[8px] text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-900/30 px-1 py-0.2 rounded font-bold">
                                        {Math.min(100, Math.max(30, Math.round(item.score)))}% 일치
                                      </span>
                                    </div>
                                    <span className="text-slate-400 dark:text-slate-500 text-[9px]">{item.member.role || '성도'}</span>
                                  </div>
                                  {item.matchField !== '이름' && item.matchedSnippet && (
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate max-w-full font-mono">
                                      <span className="font-semibold text-indigo-600 dark:text-indigo-400 mr-1">[{item.matchField}]</span>
                                      {renderHighlightedText(item.matchedSnippet, memberSearchQuery)}
                                    </div>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1.5 animate-fadeIn">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <select
                            value={selectedFormGroup}
                            onChange={(e) => setSelectedFormGroup(e.target.value)}
                            className="flex-1 h-9 sm:h-10 p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer text-slate-800 dark:text-slate-200"
                          >
                            <option value="">-- 소그룹을 지정해 명단을 좁히세요 --</option>
                            {availableGroups.map(g => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleNavigateToOrgChart}
                            title="조직도에서 성도 선택"
                            className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl flex items-center justify-center border border-indigo-100/40 dark:border-indigo-900/40 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                          >
                            <Network size={16} className="text-indigo-500 dark:text-indigo-400" />
                          </button>
                        </div>

                        {selectedFormGroup ? (
                          <div className="space-y-2">
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl max-h-[140px] overflow-y-auto p-1.5 bg-slate-50/50 dark:bg-slate-950/30 space-y-0.5">
                              {filteredFormMembersByGroup.length === 0 ? (
                                <p className="text-[11px] text-slate-400 p-3 text-center">이 그룹에 소속된 성도가 없습니다.</p>
                              ) : (
                                filteredFormMembersByGroup.map(m => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      setFormMemberId(m.id);
                                      setMemberSearchQuery(m.name);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-[11px] rounded-lg transition-all duration-150 flex items-center justify-between cursor-pointer ${
                                      isNewFamily(m) 
                                        ? 'bg-lime-50/50 dark:bg-lime-950/15 text-lime-800 dark:text-lime-300 border border-lime-100 dark:border-lime-900/35 hover:bg-lime-100/60 dark:hover:bg-lime-900/30' 
                                        : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <span className="font-semibold flex items-center gap-1.5">
                                      {m.name}
                                      {isNewFamily(m) && (
                                        <span className="px-1 py-0.2 text-[8px] bg-lime-500 text-white font-extrabold rounded">새가족</span>
                                      )}
                                    </span>
                                    <span className="text-slate-400 dark:text-slate-500 text-[10px]">{m.role}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="animate-fadeIn">
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-2.5 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                              소그룹을 선택하면 그룹 내 전체 활동 성도 리스트가 표기됩니다.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Date & Type Selection */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">심방 일자</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full h-10 px-2 sm:px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-[11px] sm:text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-200 min-w-0"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">심방 구분</label>
                  <select
                    value={formType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormType(val);
                      if (val === '새가족심방' || val === '연계심방') {
                        setFormPlace('');
                      }
                    }}
                    className="w-full h-10 px-2 sm:px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-[11px] sm:text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer text-slate-800 dark:text-slate-200 min-w-0"
                  >
                    {VISITATION_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Place Selection with GPS integration */}
              {formType !== '연계심방' && (
                <div className="space-y-0.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      심방 장소 {formType === '새가족심방' && <span className="text-[10px] text-slate-400 font-normal ml-1 lowercase">(새가족심방은 입력 비활성화)</span>}
                    </label>
                    <button
                      type="button"
                      onClick={fetchCurrentLocationAddress}
                      disabled={gpsLoading || formType === '새가족심방'}
                      className="text-[9px] sm:text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 flex items-center gap-1 font-bold bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100/50 dark:border-indigo-900/30 px-2 py-0.5 rounded-full transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {gpsLoading ? (
                        <>
                          <span className="animate-spin h-2 w-2 border-2 border-indigo-600 border-t-transparent rounded-full" />
                          위치 파악 중...
                        </>
                      ) : gpsError ? (
                        <span className="text-rose-500 underline">위치 실패</span>
                      ) : (
                        <span>📍 현재 위치 자동 입력</span>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    disabled={formType === '새가족심방'}
                    required={formType !== '기타심방' && formType !== '연계심방' && formType !== '새가족심방'}
                    placeholder={formType === '새가족심방' ? '새가족심방은 위치 입력을 하지 않습니다' : '예: 강남구 역삼동, 교회 소예배실, 성도 가정 등 (기타/연계/새가족심방은 입력 생략 가능)'}
                    value={formType === '새가족심방' ? '' : formPlace}
                    onChange={(e) => setFormPlace(e.target.value)}
                    className="w-full h-10 px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-200 disabled:bg-slate-200/50 dark:disabled:bg-slate-900/80 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                  {gpsError && formType !== '새가족심방' && (
                    <p className="text-[9px] text-rose-500 flex items-center gap-1 font-medium mt-0.5 animate-fadeIn">
                      <AlertCircle size={10} className="shrink-0" />
                      <span>{gpsError}가 감지되었습니다. 직접 입력해주셔도 괜찮습니다.</span>
                    </p>
                  )}
                </div>
              )}

              {/* Details Field */}
              <div className="space-y-0.5">
                <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">심방 상세 내용</label>
                <textarea
                  rows={3}
                  placeholder="이야기 나눈 삶의 고민, 신앙 상태 변화 및 양육 내용을 요약 기록해 주세요."
                  value={formDetails}
                  onChange={(e) => setFormDetails(e.target.value)}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all leading-relaxed"
                />
              </div>

              {/* Prayer Requests Field */}
              <div className="space-y-0.5">
                <label className="block text-[10px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">나눈 기도제목 (목록화)</label>
                <textarea
                  rows={2}
                  placeholder="기도제목을 줄을 나누어 적어주세요."
                  value={formPrayerRequests}
                  onChange={(e) => setFormPrayerRequests(e.target.value)}
                  className="w-full p-2 border border-indigo-100 dark:border-indigo-900 bg-indigo-50/10 dark:bg-indigo-950/10 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-indigo-950 dark:text-indigo-200 font-semibold leading-relaxed"
                />
              </div>

              {/* Submit Action */}
              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.98] text-white font-extrabold rounded-xl text-xs transition-all shadow-md hover:shadow-indigo-500/10 mt-2 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus size={14} />
                {editingVisitation ? '수정 내용 확정하기' : '심방 기록 카드 작성 완료'}
              </button>
            </form>
          </div>
        </div>
      </div>
    ) : (
        /* STATISTICS & SEARCHABLE MANAGEMENT LIST VIEW IN PREMIUM HIGH-CONTRAST PC LOOK */
        <div className="space-y-4 sm:space-y-6">
          {/* Interactive Bento Stats Cards with 8 Fully Split Categories */}
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5 sm:gap-3 shrink-0">
            {/* 1. Total (ALL) */}
            <button
              type="button"
              onClick={() => setSelectedType('ALL')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === 'ALL'
                  ? 'bg-indigo-50/45 dark:bg-indigo-950/20 border-indigo-500 shadow-[0_4px_12px_-4px_rgba(79,70,229,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(79,70,229,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-indigo-200 dark:hover:border-indigo-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === 'ALL'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
              }`}>
                <Clipboard size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">총 심방</p>
                <p className="text-xs sm:text-lg font-black text-slate-900 dark:text-slate-100 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.total}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>

            {/* 2. 대면 심방 */}
            <button
              type="button"
              onClick={() => setSelectedType(selectedType === '대면심방' ? 'ALL' : '대면심방')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === '대면심방'
                  ? 'bg-emerald-50/45 dark:bg-emerald-950/20 border-emerald-500 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(16,185,129,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-emerald-200 dark:hover:border-emerald-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === '대면심방'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
              }`}>
                <Heart size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">대면 심방</p>
                <p className="text-xs sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.faceToFace}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>

            {/* 3. 가정 방문 */}
            <button
              type="button"
              onClick={() => setSelectedType(selectedType === '가정방문' ? 'ALL' : '가정방문')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === '가정방문'
                  ? 'bg-teal-50/45 dark:bg-teal-950/20 border-teal-500 shadow-[0_4px_12px_-4px_rgba(20,184,166,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(20,184,166,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-teal-200 dark:hover:border-teal-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === '가정방문'
                  ? 'bg-teal-500 text-white'
                  : 'bg-teal-50/50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400'
              }`}>
                <Home size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">가정 방문</p>
                <p className="text-xs sm:text-lg font-black text-teal-600 dark:text-teal-400 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.homeVisit}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>

            {/* 4. 전화 심방 */}
            <button
              type="button"
              onClick={() => setSelectedType(selectedType === '전화심방' ? 'ALL' : '전화심방')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === '전화심방'
                  ? 'bg-blue-50/45 dark:bg-blue-950/20 border-blue-500 shadow-[0_4px_12px_-4px_rgba(59,130,246,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(59,130,246,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-blue-200 dark:hover:border-blue-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === '전화심방'
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
              }`}>
                <Phone size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">전화 심방</p>
                <p className="text-xs sm:text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.phone}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>

            {/* 5. 새가족 심방 */}
            <button
              type="button"
              onClick={() => setSelectedType(selectedType === '새가족심방' ? 'ALL' : '새가족심방')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === '새가족심방'
                  ? 'bg-rose-50/45 dark:bg-rose-950/20 border-rose-500 shadow-[0_4px_12px_-4px_rgba(244,63,94,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(244,63,94,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-rose-200 dark:hover:border-rose-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === '새가족심방'
                  ? 'bg-rose-500 text-white'
                  : 'bg-rose-50/50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
              }`}>
                <UserPlus size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">새가족 심방</p>
                <p className="text-xs sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.newFamily}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>

            {/* 6. SNS 심방 */}
            <button
              type="button"
              onClick={() => setSelectedType(selectedType === 'SNS심방' ? 'ALL' : 'SNS심방')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === 'SNS심방'
                  ? 'bg-purple-50/45 dark:bg-purple-950/20 border-purple-500 shadow-[0_4px_12px_-4px_rgba(168,85,247,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(168,85,247,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-purple-200 dark:hover:border-purple-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === 'SNS심방'
                  ? 'bg-purple-500 text-white'
                  : 'bg-purple-50/50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400'
              }`}>
                <MessageSquare size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">SNS 심방</p>
                <p className="text-xs sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.sns}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>

            {/* 7. 병원 심방 */}
            <button
              type="button"
              onClick={() => setSelectedType(selectedType === '병원심방' ? 'ALL' : '병원심방')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === '병원심방'
                  ? 'bg-red-50/45 dark:bg-red-950/20 border-red-500 shadow-[0_4px_12px_-4px_rgba(239,68,68,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(239,68,68,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-red-200 dark:hover:border-red-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === '병원심방'
                  ? 'bg-red-500 text-white'
                  : 'bg-red-50/50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
              }`}>
                <Activity size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">병원 심방</p>
                <p className="text-xs sm:text-lg font-black text-red-600 dark:text-red-400 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.hospital}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>

            {/* 8. 기타 심방 */}
            <button
              type="button"
              onClick={() => setSelectedType(selectedType === '기타심방' ? 'ALL' : '기타심방')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border text-center sm:text-left flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer min-w-0 group ${
                selectedType === '기타심방'
                  ? 'bg-amber-50/45 dark:bg-amber-950/20 border-amber-500 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.15)] sm:shadow-[0_8px_20px_-6px_rgba(245,158,11,0.15)] scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/50 hover:border-amber-200 dark:hover:border-amber-950 hover:shadow-[0_10px_25px_-8px_rgba(0,0,0,0.03)]'
              }`}
            >
              <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
                selectedType === '기타심방'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50/50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
              }`}>
                <Sparkles size={11} className="sm:w-[17px] sm:h-[17px]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">기타 심방</p>
                <p className="text-xs sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5 font-sans tracking-tight leading-none">
                  {stats.other}<span className="text-[8px] sm:text-[11px] font-semibold text-slate-400 ml-0.5">건</span>
                </p>
              </div>
            </button>
          </div>

          {/* Filters & Search - Sleek Minimal Bento Styling */}
          <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800 flex flex-col md:flex-row gap-3 sm:gap-4 items-center">
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="성명, 대화 내용, 장소, 소속 정보, 기도제목 통합 검색..."
                className="w-full pl-8 pr-2.5 py-1.5 sm:pl-9 sm:pr-3 sm:py-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-[11px] sm:text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100"
              />
            </div>
            
            <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start sm:justify-end shrink-0">
              <div className="relative flex-1 sm:flex-initial">
                <button
                  type="button"
                  onClick={() => setIsCalendarFilterOpen(!isCalendarFilterOpen)}
                  className={`w-full sm:w-auto px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedFilterDate 
                      ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-400' 
                      : isCalendarFilterOpen
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900/40 dark:text-indigo-400'
                      : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80'
                  }`}
                >
                  <Calendar size={13} />
                  <span className="whitespace-nowrap">{selectedFilterDate ? `${selectedFilterDate}` : '날짜 필터'}</span>
                </button>

                {/* Custom Month-view Calendar Filter */}
                {isCalendarFilterOpen && (
                  <div className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 top-full mt-2 z-50 w-[280px] xs:w-[310px] sm:w-[350px] bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-slate-800 space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">기록 날짜별 빠른 탐색</span>
                        {selectedFilterDate && (
                          <span className="text-[10px] bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-medium dark:bg-rose-950/40 dark:border-rose-900/30 dark:text-rose-400">
                            선택: {selectedFilterDate}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/40">
                          <button
                            type="button"
                            onClick={() => {
                              if (calendarMonth === 1) {
                                setCalendarMonth(12);
                                setCalendarYear(y => y - 1);
                              } else {
                                setCalendarMonth(m => m - 1);
                              }
                            }}
                            className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 cursor-pointer transition-colors"
                          >
                            <ChevronLeft size={15} />
                          </button>
                          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 min-w-[72px] text-center">
                            {calendarYear}년 {calendarMonth}월
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (calendarMonth === 12) {
                                setCalendarMonth(1);
                                setCalendarYear(y => y + 1);
                              } else {
                                setCalendarMonth(m => m + 1);
                              }
                            }}
                            className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 cursor-pointer transition-colors"
                          >
                            <ChevronRight size={15} />
                          </button>
                        </div>
                        
                        {selectedFilterDate && (
                          <button
                            type="button"
                            onClick={() => setSelectedFilterDate('')}
                            className="text-[10px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 bg-slate-50 dark:bg-slate-800 font-bold cursor-pointer transition-all"
                          >
                            해제
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="max-w-md mx-auto">
                      <div className="grid grid-cols-7 gap-1.5 text-center mb-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        <span className="text-rose-500">일</span>
                        <span>월</span>
                        <span>화</span>
                        <span>수</span>
                        <span>목</span>
                        <span>금</span>
                        <span className="text-blue-500">토</span>
                      </div>

                      <div className="grid grid-cols-7 gap-1.5">
                        {Array.from({ length: new Date(calendarYear, calendarMonth - 1, 1).getDay() }).map((_, idx) => (
                          <div key={`empty-${idx}`} className="h-7" />
                        ))}
                        
                        {Array.from({ length: new Date(calendarYear, calendarMonth, 0).getDate() }).map((_, idx) => {
                          const day = idx + 1;
                          const dateString = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const hasVisitation = activeVisitationDatesSet.has(dateString);
                          const isSelected = selectedFilterDate === dateString;
                          
                          return (
                            <button
                              key={`day-${day}`}
                              type="button"
                              disabled={!hasVisitation}
                              onClick={() => setSelectedFilterDate(dateString)}
                              className={`h-7 rounded-lg text-xs flex flex-col items-center justify-center relative transition-all duration-150 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white font-bold shadow-sm cursor-pointer scale-105'
                                  : hasVisitation
                                  ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 cursor-pointer border border-indigo-200/30'
                                  : 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-30 font-light'
                              }`}
                              title={hasVisitation ? `${dateString} (심방 기록 존재)` : ''}
                            >
                              <span>{day}</span>
                              {hasVisitation && !isSelected && (
                                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-ping" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="flex-1 sm:flex-initial border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <option value="ALL">모든 소그룹</option>
                {availableGroups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="flex-1 sm:flex-initial border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <option value="ALL">모든 심방구분</option>
                {VISITATION_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* Sorting Filter */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="flex-1 sm:flex-initial border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 font-bold"
              >
                <option value="latest">최신 등록순</option>
                <option value="oldest">과거 등록순</option>
                <option value="priority">🔥 심방 시급성 높은순</option>
              </select>

              {/* Priority Status Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as any)}
                className="flex-1 sm:flex-initial border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <option value="ALL">모든 우선순위 상태</option>
                <option value="consecutive3">🚨 3주 연속 결석</option>
                <option value="attendance">🚨 최근 출석률 저조</option>
                <option value="prayer">💬 기도제목 최근 등록/변경</option>
                <option value="longTime">⏳ 미심방 오랜 기간 경과</option>
              </select>
            </div>
          </div>

          {/* 심방 우선순위 추천 대시보드 */}
          <div className="bg-indigo-50/25 dark:bg-slate-900/25 rounded-3xl border border-indigo-100/30 dark:border-slate-800/60 p-4 sm:p-5 mb-4 sm:mb-6">
            <div className="flex items-center justify-between border-b border-indigo-100/40 dark:border-slate-800 pb-2.5 mb-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="text-indigo-500 fill-indigo-100 dark:fill-indigo-950/20" size={15} />
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-50">
                  실시간 심방 우선순위 추천 리스트
                </h3>
                <span className="text-[9px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold px-2 py-0.5 rounded-full border border-indigo-500/20">
                  우선순위 분석
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPriorityRecommend(!showPriorityRecommend)}
                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
              >
                {showPriorityRecommend ? '접기' : '더보기'}
              </button>
            </div>

            {showPriorityRecommend && (
              <>
                {/* Sub-toolbar inside recommendation dashboard */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-indigo-100/30 dark:border-slate-800">
                  {/* Category Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRecommendFilter('ALL')}
                      className={`px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        recommendFilter === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      전체 ({recommendStats.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecommendFilter('3consecutive')}
                      className={`px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        recommendFilter === '3consecutive'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 border border-rose-200/50 dark:border-rose-900/30'
                      }`}
                    >
                      🚨 3주 연속 결석자 ({recommendStats.threeConsecutive})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecommendFilter('prayer')}
                      className={`px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        recommendFilter === 'prayer'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      💬 기도제목 업데이트 ({recommendStats.prayer})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecommendFilter('longTime')}
                      className={`px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        recommendFilter === 'longTime'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      ⏳ 미심방 장기 경과 ({recommendStats.longTime})
                    </button>
                  </div>

                  {/* Toggle Button: Exclude Zero Small Group Attendance Members This Year */}
                  <button
                    type="button"
                    onClick={() => setExcludeZeroAttendanceThisYear(!excludeZeroAttendanceThisYear)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 border ${
                      excludeZeroAttendanceThisYear
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title="올해(2026년) 소그룹 모임(울모임) 출석 기록이 한 번도 없는(0회) 성도를 추천 목록에서 제외합니다."
                  >
                    <span>{excludeZeroAttendanceThisYear ? '✓ 올해 소그룹 0회 출석자 제외 중' : '🚫 올해 소그룹 0회 출석자 제외'}</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${excludeZeroAttendanceThisYear ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                      {recommendStats.zeroAttendance}명
                    </span>
                  </button>
                </div>

                {filteredPriorityMembers.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center text-slate-400 border border-slate-200/50 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">선택한 조건에 해당하는 추천 대상자가 없습니다.</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {excludeZeroAttendanceThisYear ? '올해 소그룹 0회 출석자 제외 옵션을 해제하거나 필터를 변경해 보세요.' : '필터를 변경해 보세요.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {(showAllPriorityRecommend ? filteredPriorityMembers : filteredPriorityMembers.slice(0, 4)).map(({ member, score, reasons, attendanceRate, lastVisitationDate, yearlyWoolAttendanceCount, isThreeConsecutiveAbsences }) => (
                        <div
                          key={member.id}
                          className={`bg-white dark:bg-slate-900 border rounded-2xl p-3.5 flex flex-col justify-between hover:shadow-sm transition-all duration-300 ${
                            isThreeConsecutiveAbsences
                              ? 'border-rose-300 dark:border-rose-900/60 ring-1 ring-rose-200 dark:ring-rose-900/30'
                              : 'border-slate-200/50 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/80'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span 
                                  onClick={() => navigate('/profile', { state: { memberId: member.id, from: '/visitation' } })}
                                  className="text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-all duration-150 truncate"
                                  title="개인별 종합 현황 보기"
                                >
                                  {member.name && !/^\d{1,3}$/.test(member.name.trim()) 
                                    ? member.name 
                                    : ((member as any).이름 || (member as any).memberName || member.name || member.id)}
                                </span>
                                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-medium shrink-0">
                                  {member.group}
                                </span>
                                {isThreeConsecutiveAbsences && (
                                  <span className="text-[9px] bg-rose-600 text-white font-extrabold px-1.5 py-0.2 rounded shrink-0 animate-pulse">
                                    3주연속결석
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] font-extrabold text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-100/50 dark:border-rose-900/25">
                                  우선 지수: {score}점
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startEditingStatus(member)}
                                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                  title="상태 및 추천 보류 설정"
                                >
                                  <Settings size={12} className={editingMemberId === member.id ? "text-indigo-600 dark:text-indigo-400 animate-spin" : ""} />
                                </button>
                              </div>
                            </div>

                            {/* Reasons list */}
                            <div className="space-y-1">
                              {reasons.map((r, i) => (
                                <div key={i} className={`flex items-center gap-1.5 text-[10px] font-medium leading-relaxed ${r.includes('3주 연속 결석') ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                                  <span className={`w-1 h-1 rounded-full shrink-0 ${r.includes('3주 연속 결석') ? 'bg-rose-500' : 'bg-indigo-400'}`} />
                                  <span className="truncate">{r}</span>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-50 dark:border-slate-850">
                              <span>최근 출석률: <strong className={attendanceRate <= 50 ? "text-rose-500 font-bold" : "font-semibold text-slate-600 dark:text-slate-300"}>{attendanceRate.toFixed(0)}%</strong></span>
                              <span>올해 소그룹: <strong className={yearlyWoolAttendanceCount === 0 ? "text-amber-600 dark:text-amber-400 font-bold" : "font-semibold text-slate-600 dark:text-slate-300"}>{yearlyWoolAttendanceCount}회</strong></span>
                            </div>
                          </div>

                          {editingMemberId === member.id ? (
                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5 bg-slate-50/50 dark:bg-slate-950/25 p-2.5 rounded-xl border border-indigo-100/20 dark:border-indigo-900/20 animate-fade-in">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">성도 상태 설정</label>
                                <select
                                  value={cardStatusType}
                                  onChange={(e) => setCardStatusType(e.target.value as any)}
                                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-[11px] bg-white dark:bg-slate-900 focus:ring-indigo-500 focus:border-indigo-500 font-semibold text-slate-800 dark:text-slate-200"
                                >
                                  <option value="ACTIVE">활동 성도 (정상 추천)</option>
                                  <option value="DEFERRED">⏳ 심방 추천 보류</option>
                                  <option value="TRANSFER">🚪 교회 이동 (추천 제외)</option>
                                  <option value="STUDY_ABROAD">✈️ 유학 중 (추천 제외)</option>
                                  <option value="MILITARY">🪖 군 복무 중 (추천 제외)</option>
                                  <option value="INACTIVE">💤 비활동 (추천 제외)</option>
                                </select>
                              </div>

                              {cardStatusType === 'DEFERRED' ? (
                                <div className="space-y-2 p-2 bg-amber-50/60 dark:bg-amber-950/20 rounded-lg border border-amber-200/30">
                                  <div>
                                    <label className="block text-[9px] font-bold text-amber-800 dark:text-amber-400 mb-0.5">추천 재개일 (보류 기한) <span className="text-rose-500">*</span></label>
                                    <input 
                                      type="date"
                                      value={cardDeferUntil}
                                      onChange={(e) => setCardDeferUntil(e.target.value)}
                                      className="w-full border border-amber-200 dark:border-amber-900 rounded p-1 text-[10px] bg-white dark:bg-slate-900 focus:ring-amber-500 font-medium text-slate-800 dark:text-slate-200"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-amber-800 dark:text-amber-400 mb-0.5">보류 구체적 사유 (메모)</label>
                                    <input 
                                      type="text"
                                      value={cardDeferReason}
                                      onChange={(e) => setCardDeferReason(e.target.value)}
                                      placeholder="예: 개인 사정"
                                      className="w-full border border-amber-200 dark:border-amber-900 rounded p-1 text-[10px] bg-white dark:bg-slate-900 focus:ring-amber-500 font-medium text-slate-800 dark:text-slate-200"
                                    />
                                  </div>
                                </div>
                              ) : cardStatusType !== 'ACTIVE' && (
                                <div className="space-y-2 p-2 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-700 dark:text-slate-400 mb-0.5">
                                      {cardStatusType === 'TRANSFER' ? '교회 이동 사유 (메모 / 선택 사항)' :
                                       cardStatusType === 'STUDY_ABROAD' ? '유학 관련 메모 (선택 사항)' :
                                       cardStatusType === 'MILITARY' ? '군 복무 관련 메모 (선택 사항)' :
                                       '비활동 관련 메모 (선택 사항)'}
                                    </label>
                                    <input 
                                      type="text"
                                      value={cardDeferReason}
                                      onChange={(e) => setCardDeferReason(e.target.value)}
                                      placeholder="예: 사유, 이사지역 등 메모 입력"
                                      className="w-full border border-slate-200 dark:border-slate-800 rounded p-1 text-[10px] bg-white dark:bg-slate-900 focus:ring-indigo-500 font-medium text-slate-800 dark:text-slate-200"
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveCardStatus(member)}
                                  disabled={isUpdatingCardStatus}
                                  className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  {isUpdatingCardStatus ? '저장중...' : '저장'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingMemberId(null)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-[10px] cursor-pointer"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSubTab('entry');
                                setFormMemberId(member.id);
                                setMemberSearchQuery(member.name);
                                const target = members.find(m => m.id === member.id);
                                if (target) {
                                  setSelectedFormGroup(target.group || '');
                                }
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="mt-3.5 w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/60 dark:text-indigo-400 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border border-indigo-100/30 dark:border-indigo-900/20"
                            >
                              <Heart size={10} className="fill-indigo-100 dark:fill-indigo-950/20 text-indigo-600 dark:text-indigo-400" />
                              이 성도 심방하기
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {filteredPriorityMembers.length > 4 && (
                      <div className="text-center mt-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAllPriorityRecommend(!showAllPriorityRecommend)}
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-indigo-100 dark:border-indigo-900 cursor-pointer shadow-2xs"
                        >
                          {showAllPriorityRecommend ? '접기 (4명만 보기)' : `추천 성도 더보기 (전체 ${filteredPriorityMembers.length}명 보기)`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Main List */}
          <div className="space-y-4">
            {filteredVisitations.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200/60 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
                <Clipboard size={42} className="mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                <p className="font-bold text-slate-600 dark:text-slate-400 text-sm">해당 검색 조건에 부합하는 심방 카드가 없습니다.</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">새로운 성도 심방 일정을 등록하거나 검색 필터를 조정해 보세요.</p>
                <button
                  onClick={() => setActiveSubTab('entry')}
                  className="mt-4 text-indigo-600 dark:text-indigo-400 font-bold hover:underline border border-indigo-100 dark:border-indigo-900 px-4 py-2 rounded-xl hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all"
                >
                  새로운 심방 입력하기
                </button>
              </div>
            ) : (
              <div className="columns-1 sm:columns-[310px] gap-4 space-y-4 md:space-y-0">
                {filteredVisitations.map((v) => {
                  const member = memberMap[v.memberId];
                  return (
                    <div 
                      key={v.visitationId} 
                      className={`inline-block w-full break-inside-avoid mb-4 sm:mb-6 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)] border hover:shadow-md transition-all duration-300 overflow-hidden text-xs ${
                        isNewFamily(member) 
                          ? 'border-lime-400 bg-lime-50/5 dark:bg-lime-950/5' 
                          : 'bg-white dark:bg-slate-900 border-slate-200/65 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800'
                      }`}
                    >
                      <div className="p-4 flex flex-col gap-3">
                        {/* Header: Member Profile Info & Visitation Type Badge & Actions */}
                        <div className="flex items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800/60 pb-2">
                          {/* Left: Profile & Name & Attendance Rate */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {member?.photoUrl ? (
                              <img
                                src={member.photoUrl}
                                alt={member.name}
                                referrerPolicy="no-referrer"
                                className={`w-8 h-8 rounded-full object-cover flex-shrink-0 ${
                                  isNewFamily(member)
                                    ? 'border-2 border-lime-400 dark:border-lime-500'
                                    : 'border border-slate-200 dark:border-slate-700'
                                }`}
                              />
                            ) : (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold flex-shrink-0 text-[10px] ${
                                isNewFamily(member)
                                  ? 'bg-lime-100 dark:bg-lime-950/60 text-lime-800 dark:text-lime-300 border-2 border-lime-400 dark:border-lime-500'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}>
                                {member?.name?.substring(0, 2)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span 
                                  onClick={() => navigate('/profile', { state: { memberId: member?.id } })}
                                  className="font-extrabold text-slate-950 dark:text-slate-50 text-xs sm:text-sm cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline tracking-tight"
                                >
                                  {renderHighlightedText(member?.name || '', searchTerm)}
                                </span>
                                {isNewFamily(member) && (
                                  <span className="text-[9px] font-bold bg-lime-500 text-white px-1 py-0.2 rounded shrink-0">새가족</span>
                                )}
                                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                                  ({member?.group})
                                </span>
                              </div>
                              <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 leading-none">
                                {(() => {
                                  const rates = detailedAttendanceRateMap[member?.id || ''] || { worship: 100, gathering: 100, wool: 100 };
                                  return (
                                    <div className="flex flex-wrap items-center gap-x-1 font-medium whitespace-nowrap">
                                      <span className="flex items-center gap-0.5">
                                        <span>예배</span>
                                        <span className={rates.worship <= 50 ? "text-rose-500 font-extrabold" : "text-slate-600 dark:text-slate-300 font-semibold"}>
                                          {rates.worship.toFixed(0)}%
                                        </span>
                                      </span>
                                      <span className="text-slate-300 dark:text-slate-700 font-normal">·</span>
                                      <span className="flex items-center gap-0.5">
                                        <span>집회</span>
                                        <span className={rates.gathering <= 50 ? "text-rose-500 font-extrabold" : "text-slate-600 dark:text-slate-300 font-semibold"}>
                                          {rates.gathering.toFixed(0)}%
                                        </span>
                                      </span>
                                      <span className="text-slate-300 dark:text-slate-700 font-normal">·</span>
                                      <span className="flex items-center gap-0.5">
                                        <span>울</span>
                                        <span className={rates.wool <= 50 ? "text-rose-500 font-extrabold" : "text-slate-600 dark:text-slate-300 font-semibold"}>
                                          {rates.wool.toFixed(0)}%
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Middle: Visitation Date & Place */}
                          <div className="flex flex-col items-center justify-center text-center shrink-0 border-l border-r border-slate-100 dark:border-slate-800/60 px-2.5 min-w-[85px]">
                            <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-0.5 whitespace-nowrap">
                              <Calendar size={10} className="text-slate-300 dark:text-slate-700 flex-shrink-0" />
                              {v.date}
                            </div>
                            {v.place ? (
                              <div className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5 max-w-[80px] truncate mt-0.5" title={v.place}>
                                <MapPin size={9} className="text-slate-300 dark:text-slate-700 flex-shrink-0" />
                                <span className="truncate">{renderHighlightedText(v.place, searchTerm)}</span>
                              </div>
                            ) : (
                              <div className="text-[9px] text-slate-300 dark:text-slate-600 italic mt-0.5">
                                장소 미지정
                              </div>
                            )}
                          </div>

                          {/* Right: Badge & Action Buttons */}
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm border whitespace-nowrap ${
                              v.visitationType === '대면심방' || v.visitationType === '가정방문'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                                : v.visitationType === '전화심방'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30'
                                : v.visitationType === 'SNS심방'
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30'
                                : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                            }`}>
                              {v.visitationType}
                            </span>
                            
                            <div className="flex items-center gap-1 bg-slate-50/80 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-0.5 rounded-lg">
                              <button
                                onClick={() => {
                                  setEditingVisitation(v);
                                  setActiveSubTab('entry');
                                }}
                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 rounded hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
                                title="수정"
                              >
                                <Edit2 size={10} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(v.visitationId)}
                                className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 rounded hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
                                title="삭제"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Body: Details & Prayer Requests */}
                        <div className="space-y-2 flex-1">
                          <div className="text-slate-700 dark:text-slate-300 text-xs whitespace-pre-wrap leading-relaxed bg-slate-50/40 dark:bg-slate-950/20 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                            {renderHighlightedText(v.details || '(내용 없음)', searchTerm)}
                          </div>
                          {hasActualPrayerContent(v.prayerRequests) && (
                            <div className="text-indigo-950 dark:text-indigo-200 bg-indigo-50/15 dark:bg-indigo-950/20 border border-indigo-100/20 dark:border-indigo-900/20 p-2.5 rounded-xl flex items-start gap-1.5 font-medium">
                              <span className="text-xs leading-none shrink-0 mt-0.5">🙏</span>
                              <div className="flex-1 space-y-0.5 text-xs leading-snug">
                                {parsePrayerRequests(v.prayerRequests).map((line, idx) => {
                                  if (!line.text && !line.marker) return null;
                                  if (line.marker) {
                                    return (
                                      <div key={idx} className="flex items-start gap-1 leading-snug">
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 min-w-[14px]">{line.marker}</span>
                                        <span className="flex-1 text-slate-700 dark:text-slate-300">{renderHighlightedText(line.text, searchTerm)}</span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={idx} className="text-slate-700 dark:text-slate-300 leading-snug">
                                      {renderHighlightedText(line.text, searchTerm)}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center border border-slate-100 dark:border-slate-800">
            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-rose-500">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-50">심방 기록을 정말 삭제하시겠습니까?</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
              삭제된 심방 기록은 시스템 상에서 즉시 폐기되며 다시 복구할 수 없습니다. 신중히 결정해 주시기 바랍니다.
            </p>
            
            <div className="flex gap-2.5 mt-5 text-xs font-bold">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onDeleteVisitation(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer transition-colors shadow-sm shadow-rose-500/10"
              >
                기록 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitationManagement;
