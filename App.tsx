import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AttendanceMatrix from './components/AttendanceMatrix';
import PrayerRequests from './components/PrayerRequests';
import DataManagement from './components/DataManagement';
import IndividualProfile from './components/IndividualProfile';
import { INITIAL_MEMBERS, INITIAL_ATTENDANCE, INITIAL_PRAYER_RECORDS, INITIAL_MEETING_STATUS } from './services/mockData';
import { fetchSheetData, sendAction, getScriptUrl } from './services/sheetService';
import { Member, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus } from './types';
import { Lock, Wrench } from 'lucide-react';

const App: React.FC = () => {
  // Global State
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [prayerRecords, setPrayerRecords] = useState<PrayerRecord[]>([]);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [validAccessCodes, setValidAccessCodes] = useState<string[]>([]);

  // Filter only Active members for the app views (except DataManagement)
  const activeMembers = useMemo(() => {
    return members.filter(m => m.status !== 'INACTIVE');
  }, [members]);

  // Function to clean attendance records based on meeting status
  // This ensures that if a meeting is canceled (FALSE in DB), any accidental 'Present' record is ignored.
  const cleanAttendanceData = (rawRecords: AttendanceRecord[], rawStatus: MeetingStatus[]): AttendanceRecord[] => {
    return rawRecords.map(record => {
      // Filter out types that are marked as canceled in the meeting status
      const validTypes = record.types.filter(type => {
        const statusForDateAndType = rawStatus.find(s => s.date === record.date && s.type === type);
        // If status exists and isCanceled is true, drop this attendance type
        if (statusForDateAndType && statusForDateAndType.isCanceled) {
          return false;
        }
        return true;
      });

      return { ...record, types: validTypes };
    }).filter(record => record.types.length > 0); // Remove records that became empty
  };

  // Load data function
  const loadData = async () => {
    setLoading(true);
    const scriptUrl = getScriptUrl();

    // With the new auto-connect logic, scriptUrl should be the default one if not set locally
    if (scriptUrl) {
      try {
        const data = await fetchSheetData();
        
        const fetchedMembers = data.members || [];
        const fetchedMeetingStatus = data.meetingStatus || [];
        const fetchedRecords = data.attendance || [];
        const fetchedPrayers = data.prayers || [];
        const fetchedAccessCodes = data.accessCodes || [];

        // 1. Set Basic Data
        setMembers(fetchedMembers);
        setMeetingStatus(fetchedMeetingStatus);
        setPrayerRecords(fetchedPrayers);
        setValidAccessCodes(fetchedAccessCodes);

        // 2. Clean Attendance Records (Requirement 1: Strict consistency)
        const cleanedRecords = cleanAttendanceData(fetchedRecords, fetchedMeetingStatus);
        setRecords(cleanedRecords);
        
        // If groups are returned from API, use them. Otherwise derive from members.
        if (data.groups && data.groups.length > 0) {
          setGroups(data.groups);
        } else {
          const derivedGroups = Array.from(new Set(fetchedMembers.map(m => m.group))).sort();
          setGroups(derivedGroups);
        }

        setUsingMock(false);
      } catch (e) {
        console.error("Failed to load live data, falling back to mock", e);
        loadMockData();
        setUsingMock(true); 
      }
    } else {
      loadMockData();
      setUsingMock(true);
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

    // Set a default mock access code for demo purposes (fallback)
    setValidAccessCodes(['18870691']); 
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Master password override: 18870691
    if (inputPassword.trim() === '18870691' || validAccessCodes.includes(inputPassword.trim())) {
      setIsAuthenticated(true);
      setLoginError('');
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
          
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
             <button
               type="button"
               onClick={() => {
                 setUsingMock(true); // Force mock mode
                 loadMockData(); // Ensure mock data is loaded
                 setIsAuthenticated(true); // Bypass login
               }}
               className="text-xs text-slate-400 flex items-center justify-center w-full hover:text-indigo-600 transition-colors"
             >
               <Wrench size={12} className="mr-1" />
               DB 설정이 필요하거나 비밀번호를 잊으셨나요?
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Layout>
        {usingMock && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 text-center">
            현재 <strong>설정/데모 모드</strong>입니다. <strong>[데이터 관리 &gt; DB 연결 설정]</strong>에서 스크립트를 업데이트하고 연결하세요.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard members={activeMembers} records={records} meetingStatus={meetingStatus} />} />
          <Route 
            path="/attendance" 
            element={
              <AttendanceMatrix 
                members={activeMembers} 
                records={records} 
                meetingStatus={meetingStatus}
                availableGroups={groups}
                onToggleAttendance={toggleAttendance}
              />
            } 
          />
          <Route 
            path="/prayer" 
            element={
              <PrayerRequests 
                members={activeMembers} 
                prayerRecords={prayerRecords} 
                availableGroups={groups}
              />
            } 
          />
          <Route 
            path="/profile" 
            element={
              <IndividualProfile 
                members={activeMembers} 
                records={records} 
                prayerRecords={prayerRecords}
                meetingStatus={meetingStatus}
                availableGroups={groups}
              />
            } 
          />
          <Route 
            path="/manage" 
            element={
              <DataManagement 
                members={members} 
                setMembers={setMembers} 
                records={records}
                meetingStatus={meetingStatus}
                availableGroups={groups}
                onToggleAttendance={toggleAttendance}
                refreshData={loadData}
                // @ts-ignore: Prop drilling for export functionality
                prayerRecords={prayerRecords} 
              />
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;