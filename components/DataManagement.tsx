import React, { useState, useMemo, useEffect } from 'react';
import { Member, AttendanceRecord, AttendanceType, MeetingStatus } from '../types';
import { Plus, Edit2, Save, Trash2, X, Phone, ArrowUpDown, Settings, Link as LinkIcon, AlertCircle, Copy, Check, HelpCircle, Filter, Loader2 } from 'lucide-react';
import { SUNDAYS_2026 } from '../services/mockData';
import { getScriptUrl, setScriptUrl, fetchSheetData, sendAction } from '../services/sheetService';
import { getClosestSunday } from '../services/utils';

interface DataManagementProps {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
  availableGroups: string[];
  onToggleAttendance: (memberId: string, date: string, type: AttendanceType) => void;
  refreshData: () => void;
}

const GAS_CODE_SNIPPET = `
/* 
 [구글 스프레드시트 연결 스크립트 v3.4]
 - 버그 수정: 새 출석 행 추가 시 recordId와 submittedAt 자동 생성
 - 날짜 처리: getDisplayValues() 사용으로 타임존 문제 완벽 해결
 - 컬럼 인식: meeting, hasWorship 등 다양한 컬럼명 지원
 
 1. 스프레드시트 메뉴: 확장 프로그램 > Apps Script 클릭
 2. [Code.gs] 내용 모두 지우고 이 코드 붙여넣기
 3. [배포] > [새 배포] > '모든 사용자' 권한 설정 후 URL 복사
*/

// ▼▼▼ 설정 영역 ▼▼▼

// 데이터가 있는 스프레드시트의 ID
const TARGET_SPREADSHEET_ID = "1LoEMB6uQXQ_qW40IKGNQMaFL9dKd5X-5c8TFrRtq1Ys"; 

// ▲▲▲ 설정 영역 끝 ▲▲▲

function getDB() {
  if (TARGET_SPREADSHEET_ID && TARGET_SPREADSHEET_ID.length > 10) {
    try {
      return SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    } catch (e) {
      console.error("Invalid Spreadsheet ID or Permission denied: " + e.toString());
      return null;
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  const ss = getDB();
  
  if (!ss) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: '스프레드시트에 접근할 수 없습니다.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // 1. 멤버 데이터 가져오기 (시트명: members)
  const membersData = getSheetData(ss, 'members');
  const members = membersData.map(m => ({
    id: String(m['memberid'] || m['id'] || m['name']),
    name: m['name'],
    group: m['group'] || m['소그룹'] || m['wool'] || m['woolname'],
    wool: m['group'] || m['소그룹'] || m['wool'] || m['woolname'],
    phoneNumber: m['phone'] || m['phonenumber'] || m['연락처'] || '',
    role: m['role'] || m['직분'] || '성도',
    status: m['status'] || m['상태'] || 'ACTIVE',
    specialNotes: m['notes'] || m['비고'] || m['specialnotes'] || ''
  })).filter(m => m.name);

  // 2. 소그룹 목록 가져오기 (시트명: groups, 컬럼: woolName)
  const groupsData = getSheetData(ss, 'groups');
  const groups = groupsData
    .map(g => String(g['woolname'] || g['name'] || ''))
    .filter(name => name.length > 0);

  // 3. 모임 설정 (시트명: SessionConfig)
  const configData = getSheetData(ss, 'SessionConfig');
  const meetingStatus = [];
  configData.forEach(row => {
    const date = formatDate(row['date'] || row['날짜']);
    if (!date) return;
    
    // 다양한 컬럼명 지원 (hasWorship, hasAssembly, hasWoorl 등)
    // 예배
    const wVal = row['worship'] || row['예배'] || row['hasworship'];
    if (!isChecked(wVal)) meetingStatus.push({ date: date, type: '예배', isCanceled: true });
    
    // 집회
    const gVal = row['gathering'] || row['meeting'] || row['집회'] || row['hasassembly'] || row['assembly'];
    if (!isChecked(gVal)) meetingStatus.push({ date: date, type: '집회', isCanceled: true });
    
    // 울모임
    const woolVal = row['wool'] || row['울모임'] || row['haswool'] || row['haswoorl'];
    if (!isChecked(woolVal)) meetingStatus.push({ date: date, type: '울모임', isCanceled: true });
  });

  // 4. 출석 및 기도제목 (시트명: attendance)
  const attendanceData = getSheetData(ss, 'attendance');
  const attendance = [];
  const prayers = [];

  attendanceData.forEach(row => {
    const date = formatDate(row['date'] || row['날짜']);
    const memberId = String(row['memberid'] || row['name'] || row['이름']);
    if (!date || !memberId) return;

    const types = [];
    if (isChecked(row['worship'] || row['예배'] || row['hasworship'])) types.push('예배');
    
    if (isChecked(row['gathering'] || row['meeting'] || row['집회'] || row['hasassembly'] || row['assembly'])) types.push('집회');
    
    if (isChecked(row['wool'] || row['울모임'] || row['haswool'] || row['haswoorl'])) types.push('울모임');

    if (types.length > 0) {
      attendance.push({
        id: 'a_' + date + '_' + memberId,
        memberId: memberId,
        date: date,
        types: types
      });
    }

    const prayer = row['prayerrequest'] || row['기도제목'];
    const note = row['notes'] || row['비고'] || row['특이사항'];
    
    if (prayer || note) {
      prayers.push({
        id: 'p_' + date + '_' + memberId,
        memberId: memberId,
        date: date,
        content: prayer || '',
        note: note || ''
      });
    }
  });

  const availableSheets = ss.getSheets().map(s => s.getName());

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    members: members,
    attendance: attendance,
    prayers: prayers,
    meetingStatus: meetingStatus,
    groups: groups,
    debug_sheets: availableSheets,
    connected_id: ss.getId()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = getDB();
  if (!ss) return errorResponse('Database unreachable');

  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch(e) {
    return errorResponse('Invalid JSON');
  }

  const { action, payload } = request;
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    if (action === 'UPDATE_ATTENDANCE') {
      updateAttendance(ss, payload);
    } else if (action === 'ADD_MEMBER') {
      addMember(ss, payload);
    }
  } catch(err) {
    return errorResponse(err.toString());
  } finally {
    lock.releaseLock();
  }
  
  return ContentService.createTextOutput(JSON.stringify({result: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(msg) {
  return ContentService.createTextOutput(JSON.stringify({status: 'error', message: msg}))
       .setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(ss, sheetName) {
  const sheets = ss.getSheets();
  const sheet = sheets.find(s => s.getName().toLowerCase() === sheetName.toLowerCase());
  
  if (!sheet) return [];
  const range = sheet.getDataRange();
  
  // [중요] getValues() 대신 getDisplayValues()를 사용하여 
  // 셀에 보이는 텍스트 그대로 가져옴 (날짜 타임존 문제 해결)
  const values = range.getDisplayValues();
  
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
  
  // getDisplayValues()로 가져왔으므로 대부분 문자열입니다.
  // '2026-01-11' 형식이거나 '2026. 1. 11' 형식일 수 있습니다.
  let s = String(dateObj).trim();
  
  try {
    // 이미 YYYY-MM-DD 형식이면 그대로 반환
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return s;

    // '26. 1. 24' 등 처리
    s = s.replace(/년/g, '-')
         .replace(/월/g, '-')
         .replace(/일/g, '')
         .replace(/\\./g, '-')
         .replace(/\\s/g, '');
      
    // '26-1-24' 처럼 연도가 2자리인 경우 '20'을 붙여줌
    if (/^\\d{2}-/.test(s)) s = '20' + s;
    
    // 날짜 객체로 변환해서 포맷팅 (유효성 검사 겸)
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;

    return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
  } catch (e) { 
    return null; 
  }
}

function isChecked(val) {
  if (val === true) return true;
  if (typeof val === 'string') {
    const v = val.trim().toUpperCase();
    return ['TRUE', 'O', 'Y', 'YES', 'PRESENT'].includes(v);
  }
  return false;
}

function updateAttendance(ss, { memberId, date, type, isAdd }) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'attendance');
  if (!sheet) {
    sheet = ss.insertSheet('attendance');
    sheet.appendRow(['recordId', 'date', 'memberId', 'worship', 'meeting', 'wool', 'prayerRequest', 'notes', 'submittedAt']);
  }
  if (sheet.getLastRow() === 0) sheet.appendRow(['recordId', 'date', 'memberId', 'worship', 'meeting', 'wool', 'prayerRequest', 'notes', 'submittedAt']);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().replace(/\\s/g, ''));
  const dateIdx = headers.indexOf('date');
  const idIdx = headers.indexOf('memberid');
  
  let typeColName = '';
  if (type === '예배') typeColName = 'worship';
  else if (type === '집회') {
     // 집회의 경우 gathering이 없으면 meeting을 찾음
     typeColName = headers.includes('gathering') ? 'gathering' : 'meeting';
  }
  else if (type === '울모임') typeColName = 'wool';
  
  const typeIdx = headers.indexOf(typeColName);
  
  if (dateIdx === -1 || idIdx === -1 || typeIdx === -1) {
     if (typeIdx === -1 && typeColName) {
        sheet.getRange(1, headers.length + 1).setValue(typeColName);
     }
     return;
  }

  // 업데이트 시에는 값을 비교해야 하므로 getDisplayValues 사용
  const data = sheet.getDataRange().getDisplayValues();
  let foundRowIndex = -1;

  for (let i = data.length - 1; i >= 1; i--) {
    const rowDate = formatDate(data[i][dateIdx]);
    const rowId = String(data[i][idIdx]);
    
    if (rowDate === date && rowId === memberId) {
      foundRowIndex = i + 1;
      break;
    }
  }

  const valToWrite = isAdd ? 'PRESENT' : '';

  if (foundRowIndex > 0) {
    sheet.getRange(foundRowIndex, typeIdx + 1).setValue(valToWrite);
  } else if (isAdd) {
    // [v3.4] 새 행 추가 시 recordId와 submittedAt 생성
    const newRow = new Array(headers.length).fill('');
    newRow[dateIdx] = date;
    newRow[idIdx] = memberId;
    newRow[typeIdx] = valToWrite;
    
    // recordId 생성 (날짜_아이디)
    const recordIdIdx = headers.indexOf('recordid');
    if (recordIdIdx !== -1) {
       newRow[recordIdIdx] = date + '_' + memberId;
    }

    // submittedAt 생성
    const submittedAtIdx = headers.indexOf('submittedat');
    if (submittedAtIdx !== -1) {
       newRow[submittedAtIdx] = new Date().toISOString();
    }
    
    sheet.appendRow(newRow);
  }
}

function addMember(ss, payload) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'members');
  if (!sheet) {
    sheet = ss.insertSheet('members');
    sheet.appendRow(['MemberID', 'Name', 'Group', 'Phone', 'Role', 'Status', 'Notes']);
  }
  if (sheet.getLastRow() === 0) sheet.appendRow(['MemberID', 'Name', 'Group', 'Phone', 'Role', 'Status', 'Notes']);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().replace(/\\s/g, ''));
  
  const newRow = headers.map(header => {
    if (header === 'memberid' || header === 'id') return payload.id;
    if (header === 'name' || header === '이름') return payload.name;
    if (header === 'group' || header === '소그룹' || header === 'wool' || header === 'woolname') return payload.group;
    if (header === 'phone' || header === 'phonenumber' || header === '연락처') return payload.phoneNumber;
    if (header === 'role' || header === '직분') return payload.role; 
    if (header === 'status' || header === '상태') return payload.status;
    if (header === 'notes' || header === '비고' || header === 'specialnotes') return payload.specialNotes;
    return '';
  });
  
  sheet.appendRow(newRow);
}
`;

const DataManagement: React.FC<DataManagementProps> = ({ members, setMembers, records, meetingStatus, availableGroups, onToggleAttendance, refreshData }) => {
  const [activeTab, setActiveTab] = useState<'members' | 'attendance' | 'settings'>('members');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  
  // Settings State
  const [scriptUrl, setLocalScriptUrl] = useState(getScriptUrl());
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // New Member State
  const [newMember, setNewMember] = useState<Partial<Member>>({ group: '', name: '', phoneNumber: '' });
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Filter States
  const [memberFilterGroup, setMemberFilterGroup] = useState<string>('all');
  const [attendanceFilterGroup, setAttendanceFilterGroup] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(getClosestSunday());

  // Update selected date if tab changes to attendance or on mount
  useEffect(() => {
    if (activeTab === 'attendance') {
      setSelectedDate(getClosestSunday());
    }
  }, [activeTab]);

  const handleUpdateMember = (id: string, field: keyof Member, value: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.group) {
        alert("이름과 소그룹을 모두 입력해주세요.");
        return;
    }
    
    setIsAddingMember(true);

    // Generate Unique ID: M + 4 random digits
    let id = '';
    let isUnique = false;
    while (!isUnique) {
      const random = Math.floor(1000 + Math.random() * 9000); // 1000-9999
      id = `M${random}`;
      if (!members.some(m => m.id === id)) {
        isUnique = true;
      }
    }

    const memberToAdd: Member = { 
      id, 
      name: newMember.name!, 
      group: newMember.group!, 
      wool: newMember.group!,
      phoneNumber: newMember.phoneNumber || '',
      role: 'MEMBER', 
      status: 'ACTIVE', 
      latestPrayerRequest: '', 
      specialNotes: '' 
    };

    try {
      // 1. Send to Google Sheets
      await sendAction('ADD_MEMBER', memberToAdd);
      
      // 2. Update Local State (Optimistic)
      setMembers(prev => [...prev, memberToAdd]);

      // 3. Reset Form & Show Success
      setNewMember({ group: '', name: '', phoneNumber: '' });
      setShowAddSuccess(true);
    } catch (e) {
      alert("멤버 추가 중 오류가 발생했습니다.");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(current => {
      let direction: 'asc' | 'desc' = 'asc';
      if (current && current.key === key) {
        direction = current.direction === 'asc' ? 'desc' : 'asc';
      }
      return { key, direction };
    });
  };

  // Sort and Filter for Member Management Tab
  const processedMembers = useMemo(() => {
    let items = [...members];

    // Filter
    if (memberFilterGroup !== 'all') {
      items = items.filter(m => m.group === memberFilterGroup);
    }
    
    // Sort
    if (sortConfig && activeTab === 'members') {
      items.sort((a, b) => {
        // @ts-ignore
        const aValue = (a[sortConfig.key] || '').toString().toLowerCase();
        // @ts-ignore
        const bValue = (b[sortConfig.key] || '').toString().toLowerCase();
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else if (activeTab === 'members') {
       // Default sort by name
       items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return items;
  }, [members, memberFilterGroup, sortConfig, activeTab]);

  // Sort and Filter for Attendance Tab
  const processedAttendanceMembers = useMemo(() => {
    let items = [...members];

    // Filter
    if (attendanceFilterGroup !== 'all') {
      items = items.filter(m => m.group === attendanceFilterGroup);
    }

    // Sort
    if (sortConfig && activeTab === 'attendance') {
      // Only sort by Name or Group
      if (sortConfig.key === 'name') {
           return items.sort((a, b) => {
             return sortConfig.direction === 'asc' 
               ? a.name.localeCompare(b.name) 
               : b.name.localeCompare(a.name);
           });
      } else if (sortConfig.key === 'group') {
           return items.sort((a, b) => {
             return sortConfig.direction === 'asc' 
               ? a.group.localeCompare(b.group) 
               : b.group.localeCompare(a.group);
           });
      }
    } else if (activeTab === 'attendance') {
       // Default sort logic
       items.sort((a, b) => {
         if (a.group !== b.group) return a.group.localeCompare(b.group);
         return a.name.localeCompare(b.name);
       });
    }

    return items;
  }, [members, attendanceFilterGroup, sortConfig, activeTab]);


  const isMeetingCanceled = (date: string, type: AttendanceType) => {
    return meetingStatus.some(s => s.date === date && s.type === type && s.isCanceled);
  };

  // Settings Logic
  const handleSaveUrl = () => {
    setErrorMessage('');
    if (!scriptUrl) { setErrorMessage('URL을 입력해주세요.'); return; }
    setScriptUrl(scriptUrl);
    setConnectionStatus('testing');
    fetchSheetData()
      .then((data) => {
        if (data.status === 'error') throw new Error((data as any).message || '스크립트 오류');
        setConnectionStatus('success');
        setTimeout(() => { refreshData(); alert('연결 성공! 데이터를 새로고침했습니다.'); }, 500);
      })
      .catch((err) => { setConnectionStatus('error'); setErrorMessage(err.message || '연결 실패'); });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(GAS_CODE_SNIPPET);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="space-y-6 relative">
      {/* Loading Overlay */}
      {isAddingMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center">
             <Loader2 size={32} className="animate-spin text-indigo-600 mb-4" />
             <p className="font-bold text-slate-700">멤버 추가 중...</p>
             <p className="text-xs text-slate-500 mt-1">잠시만 기다려주세요.</p>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showAddSuccess && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
           <div className="bg-white p-6 rounded-lg shadow-xl text-center max-w-sm w-full mx-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Check size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">추가 완료</h3>
              <p className="text-slate-600 mb-6">새로운 멤버가 성공적으로 등록되었습니다.</p>
              <button 
                 onClick={() => setShowAddSuccess(false)}
                 className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                 확인
              </button>
           </div>
        </div>
      )}

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
            <button onClick={() => { setActiveTab('members'); setSortConfig(null); }} className={`inline-block p-4 rounded-t-lg border-b-2 ${activeTab === 'members' ? 'text-indigo-600 border-indigo-600' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>멤버 관리</button>
          </li>
          <li className="mr-2">
            <button onClick={() => { setActiveTab('attendance'); setSortConfig(null); }} className={`inline-block p-4 rounded-t-lg border-b-2 ${activeTab === 'attendance' ? 'text-indigo-600 border-indigo-600' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>출석 입력</button>
          </li>
          <li className="mr-2">
            <button onClick={() => setActiveTab('settings')} className={`flex items-center p-4 rounded-t-lg border-b-2 ${activeTab === 'settings' ? 'text-slate-800 border-slate-800' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>
              <Settings size={16} className="mr-2" /> DB 연결 설정
            </button>
          </li>
        </ul>
      </div>

      {activeTab === 'members' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           {/* Member Add Form */}
           <div className="flex flex-col md:flex-row gap-4 mb-6 bg-slate-50 p-4 rounded-lg">
             <div className="flex-1 space-y-4">
                <h4 className="font-bold text-slate-700 text-sm">새 멤버 추가</h4>
                <div className="flex flex-col md:flex-row gap-2">
                    <input type="text" className="border border-slate-300 rounded p-2 text-sm flex-1" value={newMember.name || ''} onChange={e => setNewMember({...newMember, name: e.target.value})} placeholder="이름" />
                    <select className="border border-slate-300 rounded p-2 text-sm flex-1" value={newMember.group || ''} onChange={e => setNewMember({...newMember, group: e.target.value, wool: e.target.value})}>
                      <option value="">소그룹 선택</option>
                      {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <input type="text" className="border border-slate-300 rounded p-2 text-sm flex-1" value={newMember.phoneNumber || ''} onChange={e => setNewMember({...newMember, phoneNumber: e.target.value})} placeholder="연락처" />
                    <button onClick={handleAddMember} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 flex items-center justify-center min-w-[80px]">
                      <Plus size={16} className="mr-1" /> 추가
                    </button>
                </div>
             </div>
           </div>

           <div className="flex justify-end mb-4">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-500" />
                <select 
                  className="border border-slate-300 rounded p-1.5 text-sm"
                  value={memberFilterGroup}
                  onChange={(e) => setMemberFilterGroup(e.target.value)}
                >
                  <option value="all">전체 소그룹 보기</option>
                  {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
           </div>

           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('name')}>
                      <div className="flex items-center">이름 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'name' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                    </th>
                    <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('group')}>
                      <div className="flex items-center">소그룹/울 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'group' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                    </th>
                    <th className="px-6 py-3">연락처</th>
                    <th className="px-6 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {processedMembers.map(member => (
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
                   <button onClick={() => setAttendanceFilterGroup('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${attendanceFilterGroup === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>전체 보기</button>
                   {availableGroups.map(g => (
                     <button key={g} onClick={() => setAttendanceFilterGroup(g)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${attendanceFilterGroup === g ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{g}</button>
                   ))}
                </div>
              </div>
           </div>
           
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                   <tr>
                     <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>
                       <div className="flex items-center">이름 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'name' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                     </th>
                     <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('group')}>
                        <div className="flex items-center">소그룹/울 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'group' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                     </th>
                     <th className="px-6 py-3 text-center">예배</th>
                     <th className="px-6 py-3 text-center">집회</th>
                     <th className="px-6 py-3 text-center">울모임</th>
                   </tr>
                </thead>
                <tbody>
                  {processedAttendanceMembers.map(member => {
                    const record = records.find(r => r.memberId === member.id && r.date === selectedDate);
                    const types = record?.types || [];
                    
                    const renderCheckButton = (type: AttendanceType, colorClass: string, activeClass: string) => {
                      if (isMeetingCanceled(selectedDate, type)) {
                        return (
                          <div className="flex justify-center h-full items-center">
                             <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-300 cursor-not-allowed border border-slate-200">
                                <X size={14} />
                             </div>
                             <span className="sr-only">모임 없음</span>
                          </div>
                        );
                      }
                      const isChecked = types.includes(type);
                      return (
                        <button 
                          onClick={() => onToggleAttendance(member.id, selectedDate, type)} 
                          className={`w-8 h-8 rounded flex items-center justify-center transition-colors mx-auto border ${isChecked ? `${activeClass} border-transparent text-white` : 'bg-white border-slate-300 text-slate-300 hover:border-indigo-300'}`}
                        >
                          {isChecked && <Check size={18} strokeWidth={3} />}
                        </button>
                      );
                    };

                    return (
                      <tr key={member.id} className="bg-white border-b hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{member.name}</td>
                        <td className="px-6 py-4">{member.group}</td>
                        <td className="px-6 py-4 text-center">
                          {renderCheckButton(AttendanceType.Worship, '', 'bg-blue-600')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {renderCheckButton(AttendanceType.Gathering, '', 'bg-indigo-600')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {renderCheckButton(AttendanceType.Wool, '', 'bg-emerald-600')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
             </table>
           </div>
        </div>
      )}

      {/* Settings Tab Content (Preserved) */}
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
                <li>스프레드시트에 <strong>Members</strong>, <strong>SessionConfig</strong>, <strong>Attendance</strong>, <strong>Groups</strong> 시트가 존재해야 합니다.</li>
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
                <strong>안내:</strong> 말씀하신 데이터베이스 시트 ID(<code>1LoEMB...</code>)가 이미 코드에 적용되어 있습니다. 바로 복사해서 사용하세요.
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