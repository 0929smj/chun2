import React, { useState, useMemo, useEffect } from 'react';
import { Member, AttendanceRecord, AttendanceType, MeetingStatus } from '../types';
import { Plus, Edit2, Save, Trash2, X, Phone, ArrowUpDown, Settings, Link as LinkIcon, AlertCircle, Copy, Check, HelpCircle } from 'lucide-react';
import { SUNDAYS_2026 } from '../services/mockData';
import { getScriptUrl, setScriptUrl, fetchSheetData } from '../services/sheetService';

interface DataManagementProps {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
  onToggleAttendance: (memberId: string, date: string, type: AttendanceType) => void;
  refreshData: () => void;
}

const GAS_CODE_SNIPPET = `
/* 
 [구글 스프레드시트 연결 스크립트 v2.2]
 
 1. 스프레드시트 메뉴: 확장 프로그램 > Apps Script 클릭
 2. [Code.gs] 내용 모두 지우고 이 코드 붙여넣기
 3. (중요) 스크립트를 만든 시트와 데이터 시트가 다르다면 
    아래 'TARGET_SPREADSHEET_ID'에 해당 시트 ID 입력
 4. [배포] > [새 배포] > '모든 사용자' 권한 설정 후 URL 복사
*/

// ▼▼▼ 설정 영역 ▼▼▼

// 만약 스크립트가 있는 파일과 데이터가 있는 파일이 다르다면,
// 데이터가 있는 스프레드시트의 ID(URL 중간의 긴 문자열)를 따옴표 안에 넣으세요.
// 예: "1LoEMB6uQXQ_qW40IKGNQMaFL9dKd5X-5c8TFrRtq1Ys"
const TARGET_SPREADSHEET_ID = ""; 

// ▲▲▲ 설정 영역 끝 ▲▲▲

function getDB() {
  if (TARGET_SPREADSHEET_ID && TARGET_SPREADSHEET_ID.length > 10) {
    try {
      return SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    } catch (e) {
      console.error("Invalid Spreadsheet ID or Permission denied: " + e.toString());
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  const ss = getDB();
  
  if (!ss) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Cannot access spreadsheet. Check ID or Permissions.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // 시트 이름 대소문자 무시하고 찾기
  // 필수 시트: members, SessionConfig, attendance
  
  const membersData = getSheetData(ss, 'members');
  const members = membersData.map(m => ({
    id: String(m['id'] || m['name']),
    name: m['name'],
    group: m['group'] || m['소그룹'] || m['wool'],
    wool: m['group'] || m['소그룹'] || m['wool'],
    phoneNumber: m['phone'] || m['phonenumber'] || m['연락처'] || '',
    specialNotes: ''
  })).filter(m => m.name);

  const configData = getSheetData(ss, 'SessionConfig');
  const meetingStatus = [];
  configData.forEach(row => {
    const date = formatDate(row['date'] || row['날짜']);
    if (!date) return;
    
    // 값이 비어있거나 FALSE면 취소된 것으로 간주
    // 컬럼명 예: worship, gathering, wool
    if (!isChecked(row['worship'] || row['예배'])) meetingStatus.push({ date: date, type: '예배', isCanceled: true });
    if (!isChecked(row['gathering'] || row['집회'])) meetingStatus.push({ date: date, type: '집회', isCanceled: true });
    if (!isChecked(row['wool'] || row['울모임'])) meetingStatus.push({ date: date, type: '울모임', isCanceled: true });
  });

  const attendanceData = getSheetData(ss, 'attendance');
  const attendance = [];
  const prayers = [];

  attendanceData.forEach(row => {
    const date = formatDate(row['date'] || row['날짜']);
    const memberId = String(row['memberid'] || row['name'] || row['이름']);
    if (!date || !memberId) return;

    const types = [];
    if (isChecked(row['worship'] || row['예배'])) types.push('예배');
    if (isChecked(row['gathering'] || row['집회'])) types.push('집회');
    if (isChecked(row['wool'] || row['울모임'])) types.push('울모임');

    if (types.length > 0) {
      attendance.push({
        id: 'a_' + date + '_' + memberId,
        memberId: memberId,
        date: date,
        types: types
      });
    }

    const prayer = row['prayerrequest'] || row['기도제목'];
    if (prayer) {
      prayers.push({
        id: 'p_' + date + '_' + memberId,
        memberId: memberId,
        date: date,
        content: prayer
      });
    }
  });

  // 디버깅을 위해 존재하는 시트 이름 목록 반환
  const availableSheets = ss.getSheets().map(s => s.getName());

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    members: members,
    attendance: attendance,
    prayers: prayers,
    meetingStatus: meetingStatus,
    debug_sheets: availableSheets,
    connected_id: ss.getId()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = getDB();
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Invalid JSON'}))
       .setMimeType(ContentService.MimeType.JSON);
  }

  const { action, payload } = request;
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    if (action === 'UPDATE_ATTENDANCE') {
      updateAttendance(ss, payload);
    } else if (action === 'ADD_MEMBER') {
      appendRow(ss, 'members', payload);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
       .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
  
  return ContentService.createTextOutput(JSON.stringify({result: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Helper Functions ---

function getSheetData(ss, sheetName) {
  // 대소문자 무시하고 시트 찾기
  const sheets = ss.getSheets();
  const sheet = sheets.find(s => s.getName().toLowerCase() === sheetName.toLowerCase());
  
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return [];
  
  const headers = values[0].map(h => String(h).toLowerCase().replace(/\\s/g, ''));
  const data = values.slice(1);
  
  return data.map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

function formatDate(dateObj) {
  if (!dateObj) return null;
  if (typeof dateObj === 'string') return dateObj.substring(0, 10); // "YYYY-MM-DD"
  try {
    return Utilities.formatDate(new Date(dateObj), 'Asia/Seoul', 'yyyy-MM-dd');
  } catch (e) { return null; }
}

function isChecked(val) {
  if (val === true) return true;
  if (typeof val === 'string') {
    const v = val.trim().toUpperCase();
    return v === 'TRUE' || v === 'O' || v === 'Y' || v === 'YES';
  }
  return false;
}

function updateAttendance(ss, { memberId, date, type, isAdd }) {
  // 1. Attendance 시트 찾기 또는 생성
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'attendance');
  if (!sheet) {
    sheet = ss.insertSheet('attendance');
    sheet.appendRow(['Date', 'MemberID', 'Worship', 'Gathering', 'Wool', 'PrayerRequest']);
  }
  
  // 2. 데이터가 없으면 헤더 추가
  if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Date', 'MemberID', 'Worship', 'Gathering', 'Wool', 'PrayerRequest']);
  }

  // 3. 헤더 매핑
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                  .map(h => String(h).toLowerCase().replace(/\\s/g, ''));
  
  const dateIdx = headers.indexOf('date');
  const idIdx = headers.indexOf('memberid');
  
  // 타입에 따른 컬럼명 매핑 (한글/영어 모두 지원)
  let typeColName = '';
  if (type === '예배') typeColName = 'worship';
  else if (type === '집회') typeColName = 'gathering';
  else if (type === '울모임') typeColName = 'wool';
  
  let typeIdx = headers.indexOf(typeColName);
  
  // 컬럼이 없으면 에러 혹은 무시 (여기서는 무시)
  if (dateIdx === -1 || idIdx === -1 || typeIdx === -1) return;

  // 4. 기존 데이터 검색 (역순 탐색)
  // 단순화를 위해 Date + MemberID 가 일치하는 마지막 행을 찾음
  const data = sheet.getDataRange().getValues();
  let foundRowIndex = -1;

  for (let i = data.length - 1; i >= 1; i--) {
    const rowDate = formatDate(data[i][dateIdx]);
    const rowId = String(data[i][idIdx]);
    
    if (rowDate === date && rowId === memberId) {
      foundRowIndex = i + 1; // 1-based index
      break;
    }
  }

  // 5. 업데이트 또는 추가
  if (foundRowIndex > 0) {
    // 기존 행 업데이트
    sheet.getRange(foundRowIndex, typeIdx + 1).setValue(isAdd);
  } else if (isAdd) {
    // 새 행 추가 (존재하지 않고, isAdd가 true일 때만)
    const newRow = new Array(headers.length).fill('');
    newRow[dateIdx] = date;
    newRow[idIdx] = memberId;
    newRow[typeIdx] = true;
    sheet.appendRow(newRow);
  }
}

function appendRow(ss, sheetName, dataObj) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === sheetName.toLowerCase());
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(Object.keys(dataObj));
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => dataObj[h.toLowerCase()] || dataObj[h] || '');
  sheet.appendRow(row);
}
`;

const DataManagement: React.FC<DataManagementProps> = ({ members, setMembers, records, meetingStatus, onToggleAttendance, refreshData }) => {
  const [activeTab, setActiveTab] = useState<'members' | 'attendance' | 'settings'>('members');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  
  // Settings State
  const [scriptUrl, setLocalScriptUrl] = useState(getScriptUrl());
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // New Member State
  const [newMember, setNewMember] = useState<Partial<Member>>({ group: '', name: '', phoneNumber: '' });
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: keyof Member; direction: 'asc' | 'desc' } | null>(null);

  // Attendance Filter States
  const [selectedDate, setSelectedDate] = useState<string>(SUNDAYS_2026[SUNDAYS_2026.length - 1]);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

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
      wool: newMember.group!,
      phoneNumber: newMember.phoneNumber || '',
      latestPrayerRequest: '', 
      specialNotes: '' 
    }]);
    setNewMember({ group: '', name: '', phoneNumber: '' });
  };

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
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [members, sortConfig]);

  const filteredMembersForAttendance = useMemo(() => {
    if (selectedGroupFilter === 'all') return members;
    return members.filter(m => m.group === selectedGroupFilter);
  }, [members, selectedGroupFilter]);

  const isMeetingCanceled = (date: string, type: AttendanceType) => {
    return meetingStatus.some(s => s.date === date && s.type === type && s.isCanceled);
  };

  // Settings Logic
  const handleSaveUrl = () => {
    setErrorMessage('');
    
    // Basic validation
    if (!scriptUrl) {
       setErrorMessage('URL을 입력해주세요.');
       return;
    }
    if (!scriptUrl.includes('/exec')) {
      alert("경고: URL이 '/exec'로 끝나지 않습니다. 올바른 웹 앱 URL인지 확인하세요.");
    }
    
    setScriptUrl(scriptUrl);
    setConnectionStatus('testing');
    
    fetchSheetData()
      .then((data) => {
        // Check if data is empty (potential sheet name mismatch)
        if (data.members.length === 0) {
           const sheetNames = data.debug_sheets ? data.debug_sheets.join(', ') : '알 수 없음';
           const connectedId = (data as any).connected_id || '알 수 없음';
           alert(`연결은 성공했으나 'members' 데이터를 가져오지 못했습니다.\n\n[진단 정보]\n연결된 시트 ID: ${connectedId}\n발견된 시트 목록: [ ${sheetNames} ]\n\n[해결 방법]\n1. 스크립트 코드 최상단의 'TARGET_SPREADSHEET_ID'에 연결하려는 시트의 ID가 올바르게 입력되었는지 확인하세요.\n2. 해당 시트에 'Members' 탭이 있는지 확인하세요.`);
        }
        setConnectionStatus('success');
        setTimeout(() => {
          refreshData(); // Reload app data with new URL
          alert('연결 성공! 데이터를 새로고침했습니다.');
        }, 500);
      })
      .catch((err) => {
        setConnectionStatus('error');
        setErrorMessage(err.message || '연결 실패');
        console.error(err);
      });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(GAS_CODE_SNIPPET);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">데이터 관리</h2>
           <p className="text-slate-500">멤버/출석 관리 및 데이터베이스 연결 설정</p>
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
          <li className="mr-2">
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center p-4 rounded-t-lg border-b-2 ${activeTab === 'settings' ? 'text-slate-800 border-slate-800' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}
            >
              <Settings size={16} className="mr-2" /> DB 연결 설정
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
                    <th className="px-6 py-3 cursor-pointer" onClick={() => handleSort('name')}>
                      <div className="flex items-center">이름 <ArrowUpDown size={14} className="ml-1 text-slate-400" /></div>
                    </th>
                    <th className="px-6 py-3 cursor-pointer" onClick={() => handleSort('group')}>
                      <div className="flex items-center">소그룹/울 <ArrowUpDown size={14} className="ml-1 text-slate-400" /></div>
                    </th>
                    <th className="px-6 py-3">연락처</th>
                    <th className="px-6 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map(member => (
                    <tr key={member.id} className="bg-white border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{member.name}</td>
                      <td className="px-6 py-4">{member.group}</td>
                      <td className="px-6 py-4">{member.phoneNumber}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setEditingMember(member)} className="text-indigo-600 hover:text-indigo-900"><Edit2 size={18} /></button>
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
              <div className="flex items-center gap-4">
                <label className="font-bold text-slate-700 w-24">날짜 선택:</label>
                <select 
                  className="border border-slate-300 rounded p-2 text-sm bg-white"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                >
                  {SUNDAYS_2026.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <label className="font-bold text-slate-700 w-24 mt-2">소그룹/울:</label>
                <div className="flex flex-wrap gap-2">
                   <button onClick={() => setSelectedGroupFilter('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${selectedGroupFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>전체 보기</button>
                   {allGroups.map(g => (
                     <button key={g} onClick={() => setSelectedGroupFilter(g)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${selectedGroupFilter === g ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{g}</button>
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
                          {isMeetingCanceled(selectedDate, AttendanceType.Worship) ? <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">취소됨</span> : 
                            <button onClick={() => onToggleAttendance(member.id, selectedDate, AttendanceType.Worship)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors mx-auto ${types.includes(AttendanceType.Worship) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'}`}>예</button>
                          }
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isMeetingCanceled(selectedDate, AttendanceType.Gathering) ? <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">취소됨</span> : 
                            <button onClick={() => onToggleAttendance(member.id, selectedDate, AttendanceType.Gathering)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors mx-auto ${types.includes(AttendanceType.Gathering) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}>집</button>
                          }
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isMeetingCanceled(selectedDate, AttendanceType.Wool) ? <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">취소됨</span> : 
                            <button onClick={() => onToggleAttendance(member.id, selectedDate, AttendanceType.Wool)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors mx-auto ${types.includes(AttendanceType.Wool) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-300'}`}>울</button>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Google Spreadsheet 데이터베이스 연결</h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-bold text-blue-800 flex items-center mb-2">
                <HelpCircle size={18} className="mr-2"/>
                "Failed to fetch" 오류가 발생하나요?
              </h4>
              <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                <li>배포 시 <strong>'액세스 권한 승인'</strong>을 <strong>'모든 사용자'</strong>로 설정했는지 꼭 확인하세요.</li>
                <li>'본인'이나 'Google 계정 사용자'로 설정하면 연결되지 않습니다.</li>
                <li>스크립트를 수정했다면 <strong>[새 배포]</strong>를 눌러 새 버전을 생성해야 적용됩니다.</li>
                <li>스프레드시트에 <strong>Members</strong>, <strong>SessionConfig</strong>, <strong>Attendance</strong> 시트가 존재해야 합니다.</li>
              </ul>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
              <h4 className="font-bold text-slate-700 mb-2">1단계: 스크립트 복사 및 배포</h4>
              <p className="text-sm text-slate-600 mb-2">
                 아래 코드를 복사하여 Google Spreadsheet &gt; 확장 프로그램 &gt; Apps Script 의 <strong>Code.gs</strong> 파일 내용을 모두 지우고 붙여넣으세요.
              </p>
              <div className="relative group">
                <pre className="bg-slate-800 text-slate-200 p-4 rounded-lg text-xs overflow-x-auto h-48 custom-scrollbar font-mono">
                  {GAS_CODE_SNIPPET}
                </pre>
                <button 
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded transition-colors"
                  title="코드 복사"
                >
                  {copySuccess ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>
              </div>
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                <strong>주의:</strong> 스크립트를 생성한 파일과 데이터가 있는 파일이 다르다면, 위 코드 맨 윗부분의 <code>TARGET_SPREADSHEET_ID</code> 변수에 데이터 파일의 ID를 꼭 입력해야 합니다.
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
               <h4 className="font-bold text-slate-700 mb-2">2단계: URL 연결</h4>
               <div className="flex gap-2">
                 <input 
                   type="text" 
                   value={scriptUrl}
                   onChange={(e) => setLocalScriptUrl(e.target.value)}
                   placeholder="https://script.google.com/macros/s/......./exec"
                   className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm"
                 />
                 <button 
                   onClick={handleSaveUrl}
                   disabled={connectionStatus === 'testing'}
                   className={`px-4 py-2 rounded-lg text-white font-medium flex items-center ${
                     connectionStatus === 'testing' ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'
                   }`}
                 >
                   {connectionStatus === 'testing' ? '연결 중...' : <><LinkIcon size={16} className="mr-2"/> 저장 및 테스트</>}
                 </button>
               </div>
               
               {connectionStatus === 'success' && (
                 <p className="text-xs text-emerald-600 mt-2 font-bold flex items-center">
                   <Check size={14} className="mr-1"/> 연결 성공!
                 </p>
               )}
               {connectionStatus === 'error' && (
                 <div className="mt-2">
                   <p className="text-xs text-rose-500 font-bold flex items-center">
                     <AlertCircle size={14} className="mr-1"/> 연결 실패
                   </p>
                   {errorMessage && <p className="text-xs text-rose-500 mt-1 pl-5">{errorMessage}</p>}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataManagement;