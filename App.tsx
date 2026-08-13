import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AttendanceMatrix from './components/AttendanceMatrix';
import PrayerRequests from './components/PrayerRequests';
import DataManagement from './components/DataManagement';
import IndividualProfile from './components/IndividualProfile';
import OrganizationChart from './components/OrganizationChart';
import VisitationManagement from './components/VisitationManagement';
import { INITIAL_MEMBERS, INITIAL_ATTENDANCE, INITIAL_PRAYER_RECORDS, INITIAL_MEETING_STATUS } from './services/mockData';
import { fetchSheetData, sendAction, getScriptUrl } from './services/sheetService';
import { Member, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus, Visitation } from './types';
import { Lock } from 'lucide-react';

const App: React.FC = () => {
  // Global State
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [prayerRecords, setPrayerRecords] = useState<PrayerRecord[]>([]);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus[]>([]);
  const [visitations, setVisitations] = useState<Visitation[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVisitationMode, setIsVisitationMode] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [validAccessCodes, setValidAccessCodes] = useState<string[]>([]);

  // Filter non-deleted members and active members
  const nonDeletedMembers = useMemo(() => {
    return members.filter(m => {
      const status = m?.status || 'ACTIVE';
      const coreStatus = status.split(':')[0].trim().toUpperCase();
      return coreStatus !== 'DELETED';
    });
  }, [members]);

  const nonDeletedMemberIds = useMemo(() => {
    return new Set(nonDeletedMembers.map(m => m.id));
  }, [nonDeletedMembers]);

  const activeMembers = useMemo(() => {
    return nonDeletedMembers.filter(m => {
      const status = m?.status || 'ACTIVE';
      const coreStatus = status.split(':')[0].trim().toUpperCase();
      return coreStatus !== 'INACTIVE' && coreStatus !== 'TRANSFER' && coreStatus !== 'STUDY_ABROAD' && coreStatus !== 'MILITARY';
    });
  }, [nonDeletedMembers]);

  // Function to clean attendance records based on meeting status
  // This ensures that if a meeting is canceled (FALSE in DB), any accidental 'Present' record is ignored.
  const cleanAttendanceData = (rawRecords: AttendanceRecord[], rawStatus: MeetingStatus[]): AttendanceRecord[] => {
    if (!Array.isArray(rawRecords)) return [];
    return rawRecords
      .map(record => {
        if (!record || !Array.isArray(record.types)) {
          return { ...record, types: [] };
        }
        // Filter out types that are marked as canceled in the meeting status
        const validTypes = record.types.filter(type => {
          if (!rawStatus) return true;
          const statusForDateAndType = rawStatus.find(s => s && s.date === record.date && s.type === type);
          // If status exists and isCanceled is true, drop this attendance type
          if (statusForDateAndType && statusForDateAndType.isCanceled) {
            return false;
          }
          return true;
        });

        return { ...record, types: validTypes };
      })
      .filter(record => record && Array.isArray(record.types) && record.types.length > 0); // Remove records that became empty
  };

  // Filtered Records (Excluding records for DELETED members)
  const cleanedAttendanceRecords = useMemo(() => {
    const cleaned = cleanAttendanceData(records, meetingStatus);
    return cleaned.filter(r => nonDeletedMemberIds.has(r.memberId));
  }, [records, meetingStatus, nonDeletedMemberIds]);

  const cleanedPrayerRecords = useMemo(() => {
    return prayerRecords.filter(p => nonDeletedMemberIds.has(p.memberId));
  }, [prayerRecords, nonDeletedMemberIds]);

  const cleanedVisitations = useMemo(() => {
    return visitations.filter(v => nonDeletedMemberIds.has(v.memberId));
  }, [visitations, nonDeletedMemberIds]);

  // Load data function (With SWR: Stale-While-Revalidate caching pattern for instant load)
  const loadData = async () => {
    const cacheKey = 'church_admin_cached_data';
    let hasCache = false;

    // Step 1: Attempt to load cached data from localStorage instantly to bypass any API lag
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          setMembers(parsed.members || []);
          setMeetingStatus(sanitizeMeetingStatus(parsed.meetingStatus || []));
          setPrayerRecords(parsed.prayers || []);
          setValidAccessCodes(parsed.accessCodes || []);
          setRecords(parsed.records || []);
          setGroups(parsed.groups || []);
          setVisitations(parsed.visitations || []);
          setUsingMock(parsed.usingMock || false);
          hasCache = true;
          setLoading(false); // Disable initial spinner immediately!
        }
      }
    } catch (e) {
      console.warn("Failed to read cached data from localStorage:", e);
    }

    // Only show loading spinner on first-ever load when there is absolutely no cache
    if (!hasCache) {
      setLoading(true);
    }

    const scriptUrl = getScriptUrl();

    if (scriptUrl) {
      try {
        const data = await fetchSheetData();
        
        if (!data || typeof data !== 'object') {
          throw new Error("Invalid response format received from sheet service");
        }
        
        const fetchedMembers = data.members || [];
        const fetchedMeetingStatus = sanitizeMeetingStatus(data.meetingStatus || []);
        const fetchedRecords = data.attendance || [];
        const fetchedPrayers = data.prayers || [];
        const fetchedAccessCodes = data.accessCodes || [];
        const fetchedVisitations = data.visitations || [];
        let fetchedGroups: string[] = [];

        if (data.groups && data.groups.length > 0) {
          fetchedGroups = data.groups;
        } else {
          fetchedGroups = Array.from(new Set(fetchedMembers.map(m => m.group))).sort();
        }

        const cleanedRecords = cleanAttendanceData(fetchedRecords, fetchedMeetingStatus);

        // Update state with fresh data in background/foreground seamlessly
        setMembers(fetchedMembers);
        setMeetingStatus(fetchedMeetingStatus);
        setPrayerRecords(fetchedPrayers);
        setValidAccessCodes(fetchedAccessCodes);
        setRecords(cleanedRecords);
        setGroups(fetchedGroups);
        setVisitations(fetchedVisitations);
        setUsingMock(false);

        // Update localStorage Cache for subsequent instant loads
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            members: fetchedMembers,
            meetingStatus: fetchedMeetingStatus,
            prayers: fetchedPrayers,
            accessCodes: fetchedAccessCodes,
            records: cleanedRecords,
            groups: fetchedGroups,
            visitations: fetchedVisitations,
            usingMock: false
          }));
        } catch (cacheErr) {
          console.warn("Failed to write fresh data to localStorage cache:", cacheErr);
        }

      } catch (e) {
        console.warn("Failed to load live data, falling back to cached or mock:", e);
        if (!hasCache) {
          loadMockData();
          setUsingMock(true); 
        }
      }
    } else {
      if (!hasCache) {
        loadMockData();
        setUsingMock(true);
      }
    }
    setLoading(false);
  };

  const loadMockData = () => {
    setMembers(INITIAL_MEMBERS);
    setMeetingStatus(INITIAL_MEETING_STATUS);
    setPrayerRecords(INITIAL_PRAYER_RECORDS);
    // Even for mock data, apply cleaning logic for consistency
    const cleanedMockRecords = cleanAttendanceData(INITIAL_ATTENDANCE, INITIAL_MEETING_STATUS);
    setRecords(cleanedMockRecords);
    
    // Derive groups for mock data
    const mockGroups = Array.from(new Set(INITIAL_MEMBERS.map(m => m.group))).sort();
    setGroups(mockGroups);

    // Seed mock visitations
    setVisitations([
      {
        visitationId: 'v-1',
        date: '2026-06-20',
        memberId: INITIAL_MEMBERS[0]?.id || 'm-1',
        visitationType: '전화심방',
        place: '전화',
        details: '최근 회사 일로 지쳐 있어서 위로의 대화를 나누고 격려했습니다. 주일 예배 참석을 위해 기도하기로 하였습니다.',
        prayerRequests: '업무 스트레스 해소와 신앙 회복',
        submittedAt: '2026-06-20T14:30:00.000Z'
      },
      {
        visitationId: 'v-2',
        date: '2026-06-18',
        memberId: INITIAL_MEMBERS[1]?.id || 'm-2',
        visitationType: '대면심방',
        place: '교회 근처 카페',
        details: '가정 내의 소통을 위한 기도제목을 나누었습니다. 울모임에 기쁘게 동참할 수 있도록 조언을 건넸습니다.',
        prayerRequests: '가정의 평안과 자녀의 신앙 정착',
        submittedAt: '2026-06-18T19:00:00.000Z'
      }
    ]);

    // Set a default mock access code for demo purposes (fallback)
    setValidAccessCodes(['18870691']); 
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Synchronize with system dark mode preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    handleThemeChange(mediaQuery);

    try {
      mediaQuery.addEventListener('change', handleThemeChange);
    } catch (err) {
      try {
        mediaQuery.addListener(handleThemeChange);
      } catch (err2) {
        console.error(err2);
      }
    }

    return () => {
      try {
        mediaQuery.removeEventListener('change', handleThemeChange);
      } catch (err) {
        try {
          mediaQuery.removeListener(handleThemeChange);
        } catch (err2) {
          console.error(err2);
        }
      }
    };
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const pw = inputPassword.trim();
    if (pw === '7980') {
      setIsAuthenticated(true);
      setIsVisitationMode(true);
      setLoginError('');
      window.location.hash = '#/org';
    } else if (pw === '18870691' || validAccessCodes.includes(pw)) {
      setIsAuthenticated(true);
      setIsVisitationMode(false);
      setLoginError('');
      window.location.hash = '#/org';
    } else {
      setLoginError('비밀번호가 올바르지 않습니다.');
    }
  };

  // Shared Logic to toggle attendance
  const toggleAttendance = (memberId: string, date: string, type: AttendanceType) => {
    // Check if meeting is canceled first
    const isCanceled = meetingStatus.some(s => s.date === date && s.type === type && s.isCanceled);
    if (isCanceled) return;

    // Optimistic UI Update
    setRecords(prev => {
      const existing = prev.find(r => r.memberId === memberId && r.date === date);
      let updatedRecord: AttendanceRecord | null = null;
      let newTypes: AttendanceType[] = [];

      if (existing) {
        newTypes = existing.types.includes(type)
          ? existing.types.filter(t => t !== type)
          : [...existing.types, type];
        
        updatedRecord = { ...existing, types: newTypes };
        
        // Sync with DB
        sendAction('UPDATE_ATTENDANCE', { 
            memberId, date, type, 
            isAdd: existing.types.includes(type) ? false : true 
        });

        if (newTypes.length === 0) {
          return prev.filter(r => r.id !== existing.id);
        }
        return prev.map(r => r.id === existing.id ? updatedRecord! : r);
      } else {
        updatedRecord = {
          id: `a-${Date.now()}-${Math.random()}`,
          memberId,
          date: date,
          types: [type]
        };
        // Sync with DB
        sendAction('UPDATE_ATTENDANCE', { 
            memberId, date, type, 
            isAdd: true 
        });
        return [...prev, updatedRecord];
      }
    });
  };

  // Handler to update meeting/session config (hasWorship, hasAssembly, hasWoorl, ministryEvent, manualAssemblyCount)
  const handleUpdateMeetingStatus = async (date: string, config: { hasWorship: boolean; hasAssembly: boolean; hasWoorl: boolean; ministryEvent: string; manualAssemblyCount?: number }) => {
    const validCount = (config.manualAssemblyCount && config.manualAssemblyCount > 0) ? config.manualAssemblyCount : undefined;
    setMeetingStatus(prev => {
      const filtered = prev.filter(s => s.date !== date);
      const newItems: MeetingStatus[] = [
        {
          date,
          type: AttendanceType.Worship,
          isCanceled: !config.hasWorship,
          event: config.ministryEvent,
          manualAssemblyCount: validCount
        },
        {
          date,
          type: AttendanceType.Gathering,
          isCanceled: !config.hasAssembly,
          event: config.ministryEvent
        },
        {
          date,
          type: AttendanceType.Wool,
          isCanceled: !config.hasWoorl,
          event: config.ministryEvent
        }
      ];
      const updated = [...filtered, ...newItems];
      try {
        const cacheKey = 'church_admin_cached_data';
        const cached = localStorage.getItem(cacheKey);
        let parsed = cached ? JSON.parse(cached) : {};
        parsed.meetingStatus = updated;
        localStorage.setItem(cacheKey, JSON.stringify(parsed));
      } catch (e) {
        console.warn("Failed to cache meetingStatus update:", e);
      }
      return updated;
    });

    await sendAction('UPDATE_SESSION_CONFIG', {
      date,
      hasWorship: config.hasWorship,
      hasAssembly: config.hasAssembly,
      hasWoorl: config.hasWoorl,
      ministryEvent: config.ministryEvent,
      manualAssemblyCount: validCount ?? ""
    });
  };

  // Helper to safely write visitations to local storage cache under all circumstances
  const saveVisitationsToCache = (updatedVisitations: Visitation[]) => {
    const cacheKey = 'church_admin_cached_data';
    try {
      const cached = localStorage.getItem(cacheKey);
      let baseData: any = {
        members,
        meetingStatus,
        prayers: prayerRecords,
        accessCodes: validAccessCodes,
        records,
        groups,
        visitations: updatedVisitations,
        usingMock
      };
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          baseData = {
            ...parsed,
            visitations: updatedVisitations
          };
        } catch (e) {
          // ignore parsing error
        }
      }
      localStorage.setItem(cacheKey, JSON.stringify(baseData));
    } catch (e) {
      console.warn("Failed to write updated visitations to local storage cache:", e);
    }
  };

  // Handler to add visitation record
  const handleAddVisitation = async (vPayload: Omit<Visitation, 'visitationId' | 'submittedAt'>) => {
    const newVisitation: Visitation = {
      ...vPayload,
      visitationId: `v-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      submittedAt: new Date().toISOString()
    };

    // Optimistic UI update
    setVisitations(prev => {
      const nextList = [newVisitation, ...prev];
      saveVisitationsToCache(nextList);
      return nextList;
    });

    // Send action to DB
    await sendAction('ADD_VISITATION', newVisitation);
  };

  // Handler to delete visitation record
  const handleDeleteVisitation = async (visitationId: string) => {
    // Optimistic UI update
    setVisitations(prev => {
      const nextList = prev.filter(v => v.visitationId !== visitationId);
      saveVisitationsToCache(nextList);
      return nextList;
    });

    // Send action to DB
    await sendAction('DELETE_VISITATION', { visitationId });
  };

  // Handler to update visitation record
  const handleUpdateVisitation = async (updatedV: Visitation) => {
    // Optimistic UI update
    setVisitations(prev => {
      const nextList = prev.map(v => v.visitationId === updatedV.visitationId ? updatedV : v);
      saveVisitationsToCache(nextList);
      return nextList;
    });

    // Send action to DB
    await sendAction('UPDATE_VISITATION', updatedV);
  };

  // Helper to safely write members to local storage cache
  const saveMembersToCache = (updatedMembers: Member[]) => {
    const cacheKey = 'church_admin_cached_data';
    try {
      const cached = localStorage.getItem(cacheKey);
      let baseData: any = {
        members: updatedMembers,
        meetingStatus,
        prayers: prayerRecords,
        accessCodes: validAccessCodes,
        records,
        groups,
        visitations,
        usingMock
      };
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          baseData = {
            ...parsed,
            members: updatedMembers
          };
        } catch (e) {
          // ignore parsing error
        }
      }
      localStorage.setItem(cacheKey, JSON.stringify(baseData));
    } catch (e) {
      console.warn("Failed to write updated members to local storage cache:", e);
    }
  };

  // Handler to update a member's properties (e.g. status)
  const handleUpdateMember = async (updatedM: Member) => {
    // Optimistic UI update
    setMembers(prev => {
      const nextList = prev.map(m => m.id === updatedM.id ? updatedM : m);
      saveMembersToCache(nextList);
      return nextList;
    });

    // Send action to DB
    await sendAction('UPDATE_MEMBER', updatedM);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-500">데이터를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">관리자 로그인</h1>
            <p className="text-slate-500 mt-2">소그룹 출석부 접근을 위해<br/>접속 코드를 입력해주세요.</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input 
                type="password" 
                className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center tracking-widest text-lg"
                placeholder="비밀번호 입력"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                autoFocus
              />
              {loginError && <p className="text-rose-500 text-sm mt-2 text-center">{loginError}</p>}
            </div>
            <button 
              type="submit" 
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md active:scale-[0.98] transform"
            >
              확인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Layout isVisitationMode={isVisitationMode}>
        {usingMock && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 text-center">
            현재 <strong>설정/데모 모드</strong>입니다. <strong>[데이터 관리 &gt; DB 연결 설정]</strong>에서 스크립트를 업데이트하고 연결하세요.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard members={activeMembers} records={cleanedAttendanceRecords} meetingStatus={meetingStatus} />} />
          <Route 
            path="/attendance" 
            element={
              <AttendanceMatrix 
                members={activeMembers} 
                records={cleanedAttendanceRecords} 
                meetingStatus={meetingStatus}
                availableGroups={groups}
                onToggleAttendance={toggleAttendance}
                isVisitationMode={isVisitationMode}
              />
            } 
          />
          <Route 
            path="/prayer" 
            element={
              <PrayerRequests 
                members={activeMembers} 
                prayerRecords={cleanedPrayerRecords} 
                availableGroups={groups}
                attendanceRecords={cleanedAttendanceRecords}
                meetingStatus={meetingStatus}
              />
            } 
          />
          <Route 
            path="/profile" 
            element={
              <IndividualProfile 
                members={nonDeletedMembers} 
                records={cleanedAttendanceRecords} 
                prayerRecords={cleanedPrayerRecords}
                meetingStatus={meetingStatus}
                availableGroups={groups}
                isVisitationMode={isVisitationMode}
                visitations={cleanedVisitations}
                onAddVisitation={handleAddVisitation}
                onUpdateVisitation={handleUpdateVisitation}
                onUpdateMember={handleUpdateMember}
              />
            } 
          />
          <Route 
            path="/visitation" 
            element={
              isVisitationMode ? (
                <VisitationManagement 
                  members={nonDeletedMembers} 
                  visitations={cleanedVisitations} 
                  setVisitations={setVisitations}
                  availableGroups={groups}
                  usingMock={usingMock}
                  onAddVisitation={handleAddVisitation}
                  onUpdateVisitation={handleUpdateVisitation}
                  onDeleteVisitation={handleDeleteVisitation}
                  onUpdateMember={handleUpdateMember}
                  records={cleanedAttendanceRecords}
                  meetingStatus={meetingStatus}
                  prayerRecords={cleanedPrayerRecords}
                />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/org" 
            element={
              <OrganizationChart 
                members={activeMembers} 
                records={cleanedAttendanceRecords} 
                meetingStatus={meetingStatus}
              />
            } 
          />
          <Route 
            path="/manage" 
            element={
              <DataManagement 
                members={nonDeletedMembers} 
                setMembers={setMembers} 
                records={cleanedAttendanceRecords}
                meetingStatus={meetingStatus}
                availableGroups={groups}
                onToggleAttendance={toggleAttendance}
                onUpdateMeetingStatus={handleUpdateMeetingStatus}
                refreshData={loadData}
                // @ts-ignore: Prop drilling for export functionality
                prayerRecords={cleanedPrayerRecords} 
              />
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};


const sanitizeMeetingStatus = (statuses: MeetingStatus[]): MeetingStatus[] => {
  if (!Array.isArray(statuses)) return [];
  const mapped = statuses.map(s => ({
    ...s,
    manualAssemblyCount: (s.manualAssemblyCount && s.manualAssemblyCount > 0) ? s.manualAssemblyCount : undefined
  }));

  const dateStr = '2026-01-04';
  let hasJan4Worship = false;
  let hasJan4Gathering = false;
  let hasJan4Wool = false;

  const result = mapped.map(s => {
    if (s.date === dateStr) {
      if (s.type === AttendanceType.Worship) {
        hasJan4Worship = true;
        return { ...s, isCanceled: false, manualAssemblyCount: s.manualAssemblyCount || 145, event: s.event || '울 미편성' };
      }
      if (s.type === AttendanceType.Gathering) {
        hasJan4Gathering = true;
        return { ...s, isCanceled: false, manualAssemblyCount: s.manualAssemblyCount || 101, event: s.event || '울 미편성' };
      }
      if (s.type === AttendanceType.Wool) {
        hasJan4Wool = true;
        return { ...s, isCanceled: true, event: s.event || '울 미편성' };
      }
    }
    return s;
  });

  if (!hasJan4Worship) {
    result.push({ date: dateStr, type: AttendanceType.Worship, isCanceled: false, manualAssemblyCount: 145, event: '울 미편성' });
  }
  if (!hasJan4Gathering) {
    result.push({ date: dateStr, type: AttendanceType.Gathering, isCanceled: false, manualAssemblyCount: 101, event: '울 미편성' });
  }
  if (!hasJan4Wool) {
    result.push({ date: dateStr, type: AttendanceType.Wool, isCanceled: true, event: '울 미편성' });
  }

  return result;
};

export default App;