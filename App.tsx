import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AttendanceMatrix from './components/AttendanceMatrix';
import PrayerRequests from './components/PrayerRequests';
import DataManagement from './components/DataManagement';
import { INITIAL_MEMBERS, INITIAL_ATTENDANCE, INITIAL_PRAYER_RECORDS, INITIAL_MEETING_STATUS } from './services/mockData';
import { Member, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus } from './types';

const App: React.FC = () => {
  // Global State
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [prayerRecords, setPrayerRecords] = useState<PrayerRecord[]>([]);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    // Simulate API Fetch
    setTimeout(() => {
      setMembers(INITIAL_MEMBERS);
      setRecords(INITIAL_ATTENDANCE);
      setPrayerRecords(INITIAL_PRAYER_RECORDS);
      setMeetingStatus(INITIAL_MEETING_STATUS);
      setLoading(false);
    }, 500);
  }, []);

  // Shared Logic to toggle attendance
  const toggleAttendance = (memberId: string, date: string, type: AttendanceType) => {
    // Check if meeting is canceled first
    const isCanceled = meetingStatus.some(s => s.date === date && s.type === type && s.isCanceled);
    if (isCanceled) return; // Do nothing if meeting is canceled

    setRecords(prev => {
      const existing = prev.find(r => r.memberId === memberId && r.date === date);
      if (existing) {
        // Toggle type
        const newTypes = existing.types.includes(type)
          ? existing.types.filter(t => t !== type)
          : [...existing.types, type];
        
        if (newTypes.length === 0) {
          return prev.filter(r => r.id !== existing.id); // Remove record if no types left
        }
        return prev.map(r => r.id === existing.id ? { ...r, types: newTypes } : r);
      } else {
        // Create new record
        return [...prev, {
          id: `a-${Date.now()}-${Math.random()}`,
          memberId,
          date: date,
          types: [type]
        }];
      }
    });
    // In a real app, you would send an API request here to update the Google Sheet/DB
    console.log(`Updated DB: Member ${memberId} - ${date} - ${type}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard members={members} records={records} />} />
          <Route 
            path="/attendance" 
            element={
              <AttendanceMatrix 
                members={members} 
                records={records} 
                meetingStatus={meetingStatus}
                onToggleAttendance={toggleAttendance}
              />
            } 
          />
          <Route path="/prayer" element={<PrayerRequests members={members} prayerRecords={prayerRecords} />} />
          <Route 
            path="/manage" 
            element={
              <DataManagement 
                members={members} 
                setMembers={setMembers} 
                records={records}
                meetingStatus={meetingStatus}
                onToggleAttendance={toggleAttendance}
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