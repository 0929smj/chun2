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

const App: React.FC = () => {
  // Global State
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [prayerRecords, setPrayerRecords] = useState<PrayerRecord[]>([]);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

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

    if (scriptUrl) {
      try {
        const data = await fetchSheetData();
        
        const fetchedMembers = data.members || [];
        const fetchedMeetingStatus = data.meetingStatus || [];
        const fetchedRecords = data.attendance || [];
        const fetchedPrayers = data.prayers || [];

        // 1. Set Basic Data
        setMembers(fetchedMembers);
        setMeetingStatus(fetchedMeetingStatus);
        setPrayerRecords(fetchedPrayers);

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
  };

  useEffect(() => {
    loadData();
  }, []);

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

  return (
    <HashRouter>
      <Layout>
        {usingMock && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 text-center">
            현재 <strong>데모 데이터</strong>를 보고 있습니다. 실제 스프레드시트와 연결하려면 [데이터 관리 {'>'} DB 연결 설정]을 이용하세요.
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