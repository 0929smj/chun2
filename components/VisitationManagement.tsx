import React, { useState, useMemo, useEffect } from 'react';
import { Member, Visitation } from '../types';
import { Plus, Search, Calendar, MapPin, Heart, Clipboard, Trash2, Edit2, X, Filter, Sparkles, Phone, MessageSquare, AlertCircle } from 'lucide-react';

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

  // Visitation types options
  const VISITATION_TYPES = ['대면심방', '전화심방', 'SNS심방', '가정방문', '병원심방', '기타심방'];

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

  // Automatically fetch location for new entries
  useEffect(() => {
    if (activeSubTab === 'entry' && !editingVisitation && !formPlace) {
      fetchCurrentLocationAddress();
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
    } else {
      setFormMemberId('');
      const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
      setFormDate(todayLocal);
      setFormType('대면심방');
      setFormPlace('');
      setFormDetails('');
      setFormPrayerRequests('1. \n2. \n3. ');
      setMemberSearchQuery('');
    }
  }, [editingVisitation, memberMap]);

  // Filter members list in the dropdown based on search
  const filteredFormMembers = useMemo(() => {
    if (!memberSearchQuery) return members.filter(m => m.status !== 'INACTIVE');
    return members
      .filter(m => m.status !== 'INACTIVE')
      .filter(m => 
        m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
        m.group.toLowerCase().includes(memberSearchQuery.toLowerCase())
      );
  }, [members, memberSearchQuery]);

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
    setEditingVisitation(null);
    setActiveSubTab('management');
  };

  // Filter visitations for the list
  const filteredVisitations = useMemo(() => {
    return visitations
      .filter(v => {
        const member = memberMap[v.memberId];
        if (!member) return false;

        // Search match
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          member.name.toLowerCase().includes(searchLower) ||
          v.details.toLowerCase().includes(searchLower) ||
          v.prayerRequests.toLowerCase().includes(searchLower) ||
          v.place.toLowerCase().includes(searchLower);

        // Group match
        const matchesGroup = selectedGroup === 'ALL' || member.group === selectedGroup;

        // Type match
        const matchesType = selectedType === 'ALL' || v.visitationType === selectedType;

        return matchesSearch && matchesGroup && matchesType;
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending
  }, [visitations, memberMap, searchTerm, selectedGroup, selectedType]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredVisitations.length;
    const faceToFace = filteredVisitations.filter(v => v.visitationType === '대면심방' || v.visitationType === '가정방문').length;
    const phone = filteredVisitations.filter(v => v.visitationType === '전화심방').length;
    const sns = filteredVisitations.filter(v => v.visitationType === 'SNS방' || v.visitationType === 'SNS심방').length;
    const other = total - faceToFace - phone - sns;

    return { total, faceToFace, phone, sns, other };
  }, [filteredVisitations]);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Heart className="text-indigo-600 fill-indigo-100" size={24} />
            심방 모드
            <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">관리자 전용</span>
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">성도님들의 심방 기록 및 관리를 한 화면에서 지원합니다.</p>
        </div>
      </div>

      {/* Segmented Sub Tabs Navigation */}
      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          onClick={() => {
            setActiveSubTab('entry');
            if (editingVisitation) {
              setEditingVisitation(null);
            }
          }}
          className={`flex-1 text-center py-2 px-4 rounded-lg text-sm font-bold transition-all ${
            activeSubTab === 'entry' && !editingVisitation
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ✍️ 심방 기록 입력
        </button>
        <button
          onClick={() => setActiveSubTab('management')}
          className={`flex-1 text-center py-2 px-4 rounded-lg text-sm font-bold transition-all ${
            activeSubTab === 'management'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📋 심방 기록 관리 (목록)
        </button>
        {editingVisitation && (
          <button
            className="flex-1 text-center py-2 px-4 rounded-lg text-sm font-bold bg-amber-500 text-white shadow-sm"
          >
            ✏️ 수정 모드 ({memberMap[formMemberId]?.name || ''})
          </button>
        )}
      </div>

      {/* Tab Contents */}
      {activeSubTab === 'entry' ? (
        /* COMPACT IPHONE OPTIMIZED INPUT SCREEN */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 max-w-xl mx-auto">
          <div className="border-b border-slate-100 pb-2 mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Heart size={16} className="text-indigo-600 fill-indigo-100" />
              {editingVisitation ? '심방 기록 수정하기' : '새로운 심방 기록 입력'}
            </h3>
            {editingVisitation && (
              <button
                type="button"
                onClick={() => {
                  setEditingVisitation(null);
                  setActiveSubTab('management');
                }}
                className="text-xs text-rose-500 font-bold hover:underline"
              >
                수정 취소
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Target Member Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">대상 성도 선택 (필수)</label>
              {formMemberId ? (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-indigo-800 text-sm">{memberMap[formMemberId]?.name}</span>
                    <span className="text-xs text-indigo-500 ml-1.5">({memberMap[formMemberId]?.group} • {memberMap[formMemberId]?.role})</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => {
                      setFormMemberId('');
                      setMemberSearchQuery('');
                    }}
                    className="text-indigo-400 hover:text-indigo-600 p-1 rounded-full hover:bg-indigo-100 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="성도 이름 또는 소그룹 검색..."
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-lg max-h-[100px] overflow-y-auto p-1 bg-slate-50 space-y-0.5">
                    {filteredFormMembers.length === 0 ? (
                      <p className="text-[11px] text-slate-400 p-2 text-center">검색 결과가 없습니다.</p>
                    ) : (
                      filteredFormMembers.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setFormMemberId(m.id);
                            setMemberSearchQuery(m.name);
                          }}
                          className="w-full text-left px-2.5 py-1 text-[11px] rounded transition-colors flex items-center justify-between hover:bg-indigo-50 text-slate-700"
                        >
                          <span>{m.name} ({m.group})</span>
                          <span className="text-slate-400 text-[10px]">{m.role}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Date & Type Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">심방 일자</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">심방 구분</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-white cursor-pointer"
                >
                  {VISITATION_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Place Selection with GPS integration */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-slate-500">심방 장소</label>
                <button
                  type="button"
                  onClick={fetchCurrentLocationAddress}
                  disabled={gpsLoading}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
                >
                  {gpsLoading ? (
                    <>
                      <span className="animate-spin h-2.5 w-2.5 border-2 border-indigo-600 border-t-transparent rounded-full" />
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
                placeholder="예: 강남구 역삼동, 교회 로비, 성도 가정 등"
                value={formPlace}
                onChange={(e) => setFormPlace(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            {/* Details Field */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">심방 내용</label>
              <textarea
                rows={3}
                placeholder="대화한 내용, 현재의 신앙 상태 등을 요약 기록해 주세요."
                value={formDetails}
                required
                onChange={(e) => setFormDetails(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            {/* Prayer Requests Field */}
            <div>
              <label className="block text-xs font-bold text-indigo-600 mb-1">나눈 기도제목 (1,2,3번 기본 입력됨)</label>
              <textarea
                rows={3}
                placeholder="기도제목을 입력해 주세요."
                value={formPrayerRequests}
                onChange={(e) => setFormPrayerRequests(e.target.value)}
                className="w-full p-2 border border-indigo-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-indigo-50/20 text-indigo-950 font-medium"
              />
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-lg text-xs transition-all shadow-md mt-2 cursor-pointer flex items-center justify-center gap-1"
            >
              <Plus size={14} />
              {editingVisitation ? '수정 사항 저장하기' : '심방 기록 등록하기'}
            </button>
          </form>
        </div>
      ) : (
        /* STATISTICS & SEARCHABLE MANAGEMENT LIST VIEW */
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
              <p className="text-xs font-semibold text-slate-500">총 심방 수</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{stats.total}<span className="text-xs font-normal text-slate-400 ml-1">건</span></p>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">대면/방문</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">{stats.faceToFace}<span className="text-xs font-normal text-slate-400 ml-1">건</span></p>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
              <p className="text-xs font-semibold text-blue-600 flex items-center gap-1">전화심방</p>
              <p className="text-xl font-bold text-blue-700 mt-1">{stats.phone}<span className="text-xs font-normal text-slate-400 ml-1">건</span></p>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
              <p className="text-xs font-semibold text-purple-600 flex items-center gap-1">SNS심방</p>
              <p className="text-xl font-bold text-purple-700 mt-1">{stats.sns}<span className="text-xs font-normal text-slate-400 ml-1">건</span></p>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 col-span-2 lg:col-span-1">
              <p className="text-xs font-semibold text-amber-600">기타/병원</p>
              <p className="text-xl font-bold text-amber-700 mt-1">{stats.other}<span className="text-xs font-normal text-slate-400 ml-1">건</span></p>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름, 내용, 장소, 기도제목 검색..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 bg-slate-50 text-xs text-slate-700 outline-none cursor-pointer"
              >
                <option value="ALL">모든 소그룹</option>
                {availableGroups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 bg-slate-50 text-xs text-slate-700 outline-none cursor-pointer"
              >
                <option value="ALL">모든 심방구분</option>
                {VISITATION_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Main List */}
          <div className="space-y-3">
            {filteredVisitations.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400 text-xs">
                <Clipboard size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">부합하는 심방 기록이 없습니다.</p>
                <button
                  onClick={() => setActiveSubTab('entry')}
                  className="mt-2 text-indigo-600 font-bold hover:underline"
                >
                  첫 심방 기록 작성하기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredVisitations.map((v) => {
                  const member = memberMap[v.memberId];
                  return (
                    <div key={v.visitationId} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between text-xs">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            {member?.photoUrl ? (
                              <img
                                src={member.photoUrl}
                                alt={member.name}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-700 font-bold border border-indigo-100">
                                {member?.name?.substring(0, 2)}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 text-sm">{member?.name}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                  {member?.group} • {member?.role}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                <span className="flex items-center gap-0.5"><Calendar size={11} /> {v.date}</span>
                                <span className="flex items-center gap-0.5"><MapPin size={11} /> {v.place}</span>
                              </div>
                            </div>
                          </div>
                          
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            v.visitationType === '대면심방' || v.visitationType === '가정방문'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : v.visitationType === '전화심방'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : v.visitationType === 'SNS심방'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-slate-50 text-slate-700 border border-slate-200'
                          }`}>
                            {v.visitationType}
                          </span>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">심방 내용</span>
                            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2 rounded border border-slate-100">{v.details || '(내용 없음)'}</p>
                          </div>
                          {v.prayerRequests && (
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">기도 제목</span>
                              <p className="text-indigo-900 bg-indigo-50/50 border border-indigo-100/70 p-2 rounded whitespace-pre-wrap leading-relaxed font-medium">
                                🙏 {v.prayerRequests}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">
                          등록일: {new Date(v.submittedAt).toLocaleDateString('ko-KR')}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingVisitation(v);
                              setActiveSubTab('entry');
                            }}
                            className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="수정"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(v.visitationId)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-5 text-center">
            <AlertCircle className="text-rose-500 mx-auto mb-2" size={36} />
            <h3 className="text-sm font-bold text-slate-900">심방 기록을 삭제하시겠습니까?</h3>
            <p className="text-xs text-slate-500 mt-1">이 작업은 복구할 수 없습니다. 정말로 삭제하시겠습니까?</p>
            
            <div className="flex gap-2 mt-4 text-xs">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onDeleteVisitation(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitationManagement;

