import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Member, Visitation } from '../types';
import { Plus, Search, Calendar, MapPin, Heart, Clipboard, Trash2, Edit2, Edit3, List, X, Filter, Sparkles, Phone, MessageSquare, AlertCircle, ChevronLeft, ChevronRight, Home, Activity, UserPlus, Network } from 'lucide-react';
import { runUniversalSearch, runVisitationSearch } from '../services/searchAlgorithm';

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

interface VisitationManagementProps {
  members: Member[];
  visitations: Visitation[];
  setVisitations: React.Dispatch<React.SetStateAction<Visitation[]>>;
  availableGroups: string[];
  usingMock: boolean;
  onAddVisitation: (visitation: Omit<Visitation, 'visitationId' | 'submittedAt'>) => void;
  onUpdateVisitation: (visitation: Visitation) => void;
  onDeleteVisitation: (visitationId: string) => void;
}

const VisitationManagement: React.FC<VisitationManagementProps> = ({
  members,
  visitations,
  setVisitations,
  availableGroups,
  usingMock,
  onAddVisitation,
  onUpdateVisitation,
  onDeleteVisitation
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const wasEditingRef = useRef(false);

  // UI states
  const [activeSubTab, setActiveSubTab] = useState<'entry' | 'management'>('entry');
  const [editingVisitation, setEditingVisitation] = useState<Visitation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
  const [selectedFilterDate, setSelectedFilterDate] = useState<string>('');
  const [isCalendarFilterOpen, setIsCalendarFilterOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);

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
  const VISITATION_TYPES = ['대면심방', '전화심방', '새가족심방', 'SNS심방', '가정방문', '병원심방', '기타심방'];

  // Map memberId to Member object for quick lookup
  const memberMap = useMemo(() => {
    const map: Record<string, Member> = {};
    members.forEach(m => {
      map[m.id] = m;
    });
    return map;
  }, [members]);

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
    const activeMembers = members.filter(m => m.status !== 'INACTIVE');
    return runUniversalSearch(activeMembers, memberSearchQuery);
  }, [members, memberSearchQuery]);

  // Filter members list in the dropdown based on selected group
  const filteredFormMembersByGroup = useMemo(() => {
    if (!selectedFormGroup) return [];
    return members
      .filter(m => m.status !== 'INACTIVE')
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
        place: formPlace,
        details: formDetails,
        prayerRequests: formPrayerRequests
      });
      alert('심방 기록이 성공적으로 수정되었습니다.');
    } else {
      onAddVisitation({
        date: formDate,
        memberId: formMemberId,
        visitationType: formType,
        place: formPlace,
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

  // Filter visitations for the list
  const filteredVisitations = useMemo(() => {
    const results = runVisitationSearch(
      visitations,
      memberMap,
      searchTerm,
      selectedGroup,
      selectedType,
      selectedFilterDate
    );
    return results.map(r => r.visitation);
  }, [visitations, memberMap, searchTerm, selectedGroup, selectedType, selectedFilterDate]);

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
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] p-4 space-y-4 transition-all duration-300 relative">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {memberMap[formMemberId]?.photoUrl ? (
                        <img
                          src={memberMap[formMemberId]?.photoUrl}
                          alt={memberMap[formMemberId]?.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover border border-indigo-100 dark:border-indigo-950 ring-2 ring-indigo-50/50 dark:ring-indigo-950/20 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-sm font-bold border border-indigo-100/50 dark:border-indigo-900/30 shrink-0">
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
                                      : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold">{item.member.name}</span>
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
                                    className="w-full text-left px-3 py-2 text-[11px] rounded-lg transition-all duration-150 flex items-center justify-between hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-slate-300 cursor-pointer"
                                  >
                                    <span className="font-semibold">{m.name}</span>
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
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full h-10 px-2 sm:px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-[11px] sm:text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer text-slate-800 dark:text-slate-200 min-w-0"
                  >
                    {VISITATION_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Place Selection with GPS integration */}
              <div className="space-y-0.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">심방 장소</label>
                  <button
                    type="button"
                    onClick={fetchCurrentLocationAddress}
                    disabled={gpsLoading}
                    className="text-[9px] sm:text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 flex items-center gap-1 font-bold bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100/50 dark:border-indigo-900/30 px-2 py-0.5 rounded-full transition-all cursor-pointer shadow-sm active:scale-95"
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
                  placeholder="예: 강남구 역삼동, 교회 소예배실, 성도 가정 등"
                  value={formPlace}
                  onChange={(e) => setFormPlace(e.target.value)}
                  className="w-full h-10 px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-200"
                />
                {gpsError && (
                  <p className="text-[9px] text-rose-500 flex items-center gap-1 font-medium mt-0.5 animate-fadeIn">
                    <AlertCircle size={10} className="shrink-0" />
                    <span>{gpsError}가 감지되었습니다. 직접 입력해주셔도 괜찮습니다.</span>
                  </p>
                )}
              </div>

              {/* Details Field */}
              <div className="space-y-0.5">
                <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">심방 상세 내용</label>
                <textarea
                  rows={3}
                  placeholder="이야기 나눈 삶의 고민, 신앙 상태 변화 및 양육 내용을 요약 기록해 주세요."
                  value={formDetails}
                  required
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
            </div>
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
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                {filteredVisitations.map((v) => {
                  const member = memberMap[v.memberId];
                  return (
                    <div 
                      key={v.visitationId} 
                      className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200/60 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-950 hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col justify-between text-xs"
                    >
                      <div className="p-4 sm:p-6">
                        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-3.5">
                          <div className="flex items-start gap-2.5 sm:gap-3.5 min-w-0 group">
                            {member?.photoUrl ? (
                              <img
                                src={member.photoUrl}
                                alt={member.name}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl object-cover border border-slate-200 dark:border-slate-800 flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-10 h-10 sm:w-11 sm:h-11 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl sm:rounded-2xl flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-extrabold border border-indigo-100/50 dark:border-indigo-900/30 flex-shrink-0">
                                {member?.name?.substring(0, 2)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span 
                                  onClick={() => navigate('/profile', { state: { memberId: member?.id } })}
                                  className="font-extrabold text-slate-950 dark:text-slate-50 text-sm sm:text-base cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline tracking-tight"
                                >
                                  {renderHighlightedText(member?.name || '', searchTerm)}
                                </span>
                                <span className="text-[9px] sm:text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 sm:px-2 py-0.5 rounded-md font-bold whitespace-nowrap">
                                  {member?.group} • {member?.role}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 mt-1 sm:mt-1.5 min-w-0 font-medium">
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Calendar size={12} className="text-slate-300 dark:text-slate-700" /> 
                                  {v.date}
                                </span>
                                <span className="hidden sm:inline text-slate-200 dark:text-slate-800">•</span>
                                <span className="flex items-center gap-1 min-w-0" title={v.place}>
                                  <MapPin size={12} className="text-slate-300 dark:text-slate-700 flex-shrink-0" /> 
                                  <span className="truncate">{renderHighlightedText(v.place || '장소 없음', searchTerm)}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <span className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap flex-shrink-0 shadow-sm border ${
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
                        </div>

                        <div className="space-y-2.5 sm:space-y-3 pt-2.5 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80">
                          <div>
                            <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider block mb-0.5 sm:mb-1">심방 상세 내용</span>
                            <p className="text-slate-700 dark:text-slate-300 text-xs whitespace-pre-wrap leading-relaxed bg-slate-50/50 dark:bg-slate-950/20 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-800/60">
                              {renderHighlightedText(v.details || '(내용 없음)', searchTerm)}
                            </p>
                          </div>
                          {v.prayerRequests && (
                            <div>
                              <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider block mb-0.5 sm:mb-1">나눈 기도제목</span>
                              <div className="text-indigo-950 dark:text-indigo-200 bg-indigo-50/20 dark:bg-indigo-950/20 border border-indigo-100/30 dark:border-indigo-900/20 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl whitespace-pre-wrap leading-relaxed font-semibold flex items-start gap-1.5">
                                <span className="text-sm leading-none">🙏</span>
                                <p className="text-xs">{renderHighlightedText(v.prayerRequests, searchTerm)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-50/80 dark:bg-slate-950/40 px-4 sm:px-6 py-2.5 sm:py-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">
                          등록일자: {new Date(v.submittedAt).toLocaleDateString('ko-KR')}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingVisitation(v);
                              setActiveSubTab('entry');
                            }}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
                            title="수정"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(v.visitationId)}
                            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 size={13} />
                          </button>
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
