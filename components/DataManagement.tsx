import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Member, AttendanceRecord, AttendanceType, MeetingStatus, PrayerRecord } from '../types';
import { Plus, Edit2, Save, Trash2, X, Phone, ArrowUpDown, Settings, Link as LinkIcon, AlertCircle, Copy, Check, HelpCircle, Filter, Loader2, StickyNote, Search, Download, Calendar, Sliders, Tag, CheckCircle2, XCircle } from 'lucide-react';
import { SUNDAYS_2026 } from '../services/mockData';
import { getScriptUrl, setScriptUrl, fetchSheetData, sendAction, DEFAULT_SCRIPT_URL } from '../services/sheetService';
import { getClosestSunday } from '../services/utils';
import { exportDataToExcel } from '../services/excelService';
import { matchKoreanFuzzy, sortAndFilterMembersByName } from '../services/searchAlgorithm';

const isNewFamily = (member?: Member | null) => {
  if (!member) return false;
  const regDate = member.MemberRegistration || (member as any).registrationDate;
  if (!regDate) return false;
  return String(regDate).trim().startsWith('2026');
};

const GAS_CODE_SNIPPET = `/* 
 [구글 스프레드시트 연결 스크립트 v5.3 - 계수인원 0 생성 방지 완전판]
 - 업데이트: 심방 기록(Visitations) 등록, 수정, 삭제 기능 및 다양한 열 이름 매핑(성도ID, 심방ID 등) 유연 대응
 
 1. 스프레드시트 메뉴: 확장 프로그램 > Apps Script 클릭
 2. [Code.gs] 내용 모두 지우고 이 코드 붙여넣기
 3. [배포] > [새 배포] > '모든 사용자' 권한 설정 후 URL 복사 (기존 배포에서 '새 버전'으로 배포해야 업데이트 반영됨!)
*/

// ▼▼▼ 설정 영역 ▼▼▼

// 데이터가 있는 스프레드시트의 ID (본인의 시트 ID로 변경 가능)
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
  // 1-1. 프로필 이미지 가져오기 (Google Drive) - 캐싱으로 조회 시간 대폭 감소 (10초 -> 0.1초)
  let photoFiles = {};
  const cache = CacheService.getScriptCache();
  const cachedPhotos = cache.get("photo_files_cache");
  if (cachedPhotos) {
    try {
      photoFiles = JSON.parse(cachedPhotos);
    } catch(e) {}
  } else {
    const FOLDER_ID = "1cv5vjlZSqtOqBS_UtOP14qR8w_Vhk2a3";
    try {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const files = folder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        const n = file.getName();
        const rawName = n.split('.')[0]; // remove extension
        const mId = rawName.replace(/\\s+/g, ''); // ignore all spaces
        photoFiles[mId] = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w400";
      }
      // 6시간(21600초) 동안 프로필 이미지 URL 목록 캐싱
      cache.put("photo_files_cache", JSON.stringify(photoFiles), 21600);
    } catch(e) {
      // DriveApp 권한이 없거나 폴더를 찾을 수 없을 때의 에러 무시
    }
  }

  const members = membersData.map(m => {
    const rawName = String(m['name'] || m['이름'] || m['성도명'] || m['성도이름'] || m['성도'] || m['membername'] || m['member_name'] || '').trim();
    const rawId = String(m['memberid'] || m['id'] || m['성도id'] || m['번호'] || '').trim();
    const mid = rawId || rawName;
    const matchId = rawName.replace(/\\s+/g, '');
    return {
      id: mid,
      name: rawName || rawId || '성도',
      group: m['group'] || m['소그룹'] || m['wool'] || m['woolname'] || m['소속'] || m['구역'] || '',
      wool: m['group'] || m['소그룹'] || m['wool'] || m['woolname'] || m['소속'] || m['구역'] || '',
      phoneNumber: m['phone'] || m['phonenumber'] || m['연락처'] || m['전화번호'] || '',
      role: m['role'] || m['직분'] || '성도',
      status: m['status'] || m['상태'] || 'ACTIVE',
      MemberRegistration: m['memberregistration'] || m['등록일'] || m['등반일'] || m['registrationdate'] || m['등록일자'] || '',
      specialNotes: m['notes'] || m['비고'] || m['specialnotes'] || m['memo'] || m['메모'] || '',
      photoUrl: photoFiles[matchId] || photoFiles[mid.replace(/\\s+/g, '')] || ''
    };
  }).filter(m => m.name && m.name !== '성도' && !/^\d+$/.test(m.name));

  // 2. 소그룹 목록 및 AccessCode 가져오기 (시트명: groups)
  const groupsData = getSheetData(ss, 'groups');
  
  // 소그룹 목록 (울장 포함)
  const groups = groupsData
    .map(g => String(g['woolname'] || g['name'] || ''))
    .filter(name => name.length > 0);
  
  // AccessCode 추출 (로그인용 - '울장'의 AccessCode만 허용)
  // Groups 시트에서 woolName(또는 name)이 '울장'인 행의 accessCode만 가져옵니다.
  const accessCodes = groupsData
    .filter(g => String(g['woolname'] || g['name'] || '') === '울장')
    .map(g => String(g['accesscode'] || g['code'] || g['password'] || g['비밀번호'] || ''))
    .filter(code => code.length > 0);

  // 3. 모임 설정 (시트명: SessionConfig)
  const configData = getSheetData(ss, 'SessionConfig');
  const meetingStatus = [];
  configData.forEach(row => {
    const date = formatDate(row['date'] || row['날짜']);
    if (!date) return;
    
    // 사역/행사 이름 가져오기
    const eventName = row['ministryevent'] || row['event'] || row['사역'] || row['행사'] || '';

    // 예배
    const wVal = row['hasworship'] || row['worship'] || row['예배'];
    const rawCnt = (row['manualassemblycount'] !== undefined && row['manualassemblycount'] !== '') ? row['manualassemblycount'] : ((row['계수인원'] !== undefined && row['계수인원'] !== '') ? row['계수인원'] : null);
    const numCnt = Number(rawCnt); const mCount = (rawCnt !== null && rawCnt !== undefined && String(rawCnt).trim() !== '' && !isNaN(numCnt) && numCnt > 0) ? numCnt : undefined;
    const wCanceled = isCanceledVal(wVal);
    meetingStatus.push({ date: date, type: '예배', isCanceled: wCanceled, event: eventName, manualAssemblyCount: mCount });
    
    // 집회
    const gVal = row['hasassembly'] || row['assembly'] || row['gathering'] || row['meeting'] || row['집회'];
    const gCanceled = isCanceledVal(gVal);
    meetingStatus.push({ date: date, type: '집회', isCanceled: gCanceled, event: eventName });
    
    // 울모임
    const woolVal = row['haswoorl'] || row['haswool'] || row['wool'] || row['울모임'];
    const woolCanceled = isCanceledVal(woolVal);
    meetingStatus.push({ date: date, type: '울모임', isCanceled: woolCanceled, event: eventName });
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

  // 5. 심방 데이터 가져오기 (시트명: visitations)
  const visitationsData = getSheetData(ss, 'visitations');
  const visitations = visitationsData.map(v => {
    return {
      visitationId: String(v['visitationid'] || v['심방id'] || ''),
      date: formatDate(v['date'] || v['날짜'] || v['일자']) || '',
      memberId: String(v['memberid'] || v['성도id'] || v['이름'] || ''),
      visitationType: String(v['visitationtype'] || v['심방종류'] || v['구분'] || v['심방형태'] || ''),
      place: String(v['place'] || v['장소'] || v['심방장소'] || ''),
      details: String(v['details'] || v['상세내용'] || v['내용'] || v['심방내용'] || ''),
      prayerRequests: String(v['prayerrequests'] || v['기도제목'] || ''),
      submittedAt: String(v['submittedat'] || v['제출일시'] || '')
    };
  }).filter(v => v.memberId && v.visitationId);

  const availableSheets = ss.getSheets().map(s => s.getName());

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    members: members,
    attendance: attendance,
    prayers: prayers,
    meetingStatus: meetingStatus,
    groups: groups,
    accessCodes: accessCodes,
    visitations: visitations,
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
    } else if (action === 'UPDATE_MEMBER') {
      updateMember(ss, payload);
    } else if (action === 'UPDATE_SESSION_CONFIG') {
      updateSessionConfig(ss, payload);
    } else if (action === 'ADD_VISITATION') {
      addVisitation(ss, payload);
    } else if (action === 'UPDATE_VISITATION') {
      updateVisitation(ss, payload);
    } else if (action === 'DELETE_VISITATION') {
      deleteVisitation(ss, payload);
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
  const values = range.getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).toLowerCase().replace(/\\s/g, ''));
  const data = values.slice(1);
  return data.map(row => {
    let obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function formatDate(dateObj) {
  if (!dateObj) return null;
  if (dateObj instanceof Date) {
    try {
      return Utilities.formatDate(dateObj, "Asia/Seoul", "yyyy-MM-dd");
    } catch(err) {}
  }
  let s = String(dateObj).trim();
  if (!s) return null;
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return s;
  try {
    s = s.replace(/년/g, "-").replace(/월/g, "-").replace(/일/g, "").replace(/[\\.\\/\\s]+/g, "-");
    while (s.length > 0 && s.charAt(s.length - 1) === "-") {
      s = s.substring(0, s.length - 1);
    }
    const parts = s.split("-");
    if (parts.length === 3) {
      let y = parts[0].trim();
      let m = parts[1].trim();
      let d = parts[2].trim();
      if (m.length === 1) m = "0" + m;
      if (d.length === 1) d = "0" + d;
      if (y.length === 2) y = "20" + y;
      if (y.length === 4 && !isNaN(Number(y)) && !isNaN(Number(m)) && !isNaN(Number(d))) {
        return y + "-" + m + "-" + d;
      }
    }
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return Utilities.formatDate(dt, "Asia/Seoul", "yyyy-MM-dd");
    }
  } catch (e) {}
  return null;
}

function isChecked(val) {
  if (val === true) return true;
  if (typeof val === 'string') {
    const v = val.trim().toUpperCase();
    return ['TRUE', 'O', 'Y', 'YES', 'PRESENT', '진행', '참석'].includes(v);
  }
  return false;
}

function isCanceledVal(val) {
  if (val === false) return true;
  if (typeof val === 'string') {
    const v = val.trim().toUpperCase();
    return ['FALSE', 'X', 'N', 'NO', 'CANCELED', 'CANCELLED', '취소', '미진행'].includes(v);
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
  else if (type === '집회') typeColName = headers.includes('gathering') ? 'gathering' : 'meeting';
  else if (type === '울모임') typeColName = 'wool';
  
  const typeIdx = headers.indexOf(typeColName);
  
  if (dateIdx === -1 || idIdx === -1 || typeIdx === -1) {
     if (typeIdx === -1 && typeColName) sheet.getRange(1, headers.length + 1).setValue(typeColName);
     return;
  }

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

  const valToWrite = isAdd ? 'PRESENT' : 'ABSENT';

  if (foundRowIndex > 0) {
    sheet.getRange(foundRowIndex, typeIdx + 1).setValue(valToWrite);
  } else {
    const newRow = new Array(headers.length).fill('');
    newRow[dateIdx] = date;
    newRow[idIdx] = memberId;
    newRow[typeIdx] = valToWrite;
    const recordIdIdx = headers.indexOf('recordid');
    if (recordIdIdx !== -1) newRow[recordIdIdx] = date + '_' + memberId;
    const submittedAtIdx = headers.indexOf('submittedat');
    if (submittedAtIdx !== -1) newRow[submittedAtIdx] = new Date().toISOString();
    sheet.appendRow(newRow);
  }
}

function addMember(ss, payload) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'members');
  if (!sheet) {
    sheet = ss.insertSheet('members');
    sheet.appendRow(['MemberID', 'Name', 'Group', 'Phone', 'Role', 'Status', 'MemberRegistration', 'Notes']);
  }
  if (sheet.getLastRow() === 0) sheet.appendRow(['MemberID', 'Name', 'Group', 'Phone', 'Role', 'Status', 'MemberRegistration', 'Notes']);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().replace(/\\s/g, ''));
  
  const newRow = headers.map(header => {
    if (header === 'memberid' || header === 'id') return payload.id;
    if (header === 'name' || header === '이름') return payload.name;
    if (header === 'group' || header === '소그룹' || header === 'wool' || header === 'woolname') return payload.group;
    if (header === 'phone' || header === 'phonenumber' || header === '연락처') return payload.phoneNumber;
    if (header === 'role' || header === '직분') return payload.role; 
    if (header === 'status' || header === '상태') return payload.status;
    if (header === 'memberregistration' || header === '등록일' || header === '등반일') return payload.MemberRegistration;
    if (header === 'notes' || header === '비고' || header === 'specialnotes' || header === 'memo') return payload.specialNotes;
    return '';
  });
  
  sheet.appendRow(newRow);
}

function updateMember(ss, payload) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'members');
  if (!sheet) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().replace(/\\s/g, ''));
  const idIdx = headers.indexOf('memberid') !== -1 ? headers.indexOf('memberid') : headers.indexOf('id');
  if (idIdx === -1) return;

  const data = sheet.getDataRange().getDisplayValues();
  let foundRowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(payload.id)) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) {
     const map = {
       'name': ['name', '이름'],
       'group': ['group', '소그룹', 'wool', 'woolname'],
       'phoneNumber': ['phone', 'phonenumber', '연락처'],
       'role': ['role', '직분'],
       'status': ['status', '상태'],
       'MemberRegistration': ['memberregistration', '등록일', '등반일'],
       'specialNotes': ['notes', '비고', 'specialnotes', 'memo', '메모']
     };

     Object.keys(payload).forEach(key => {
       if (map[key]) {
         const possibleHeaders = map[key];
         const colIdx = headers.findIndex(h => possibleHeaders.includes(h));
         if (colIdx !== -1) {
           sheet.getRange(foundRowIndex, colIdx + 1).setValue(payload[key]);
         }
       }
     });
  }
}

function updateSessionConfig(ss, payload) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === "sessionconfig");
  if (!sheet) {
    sheet = ss.insertSheet("SessionConfig");
    sheet.appendRow(["date", "hasWorship", "hasAssembly", "hasWoorl", "ministryEvent", "manualAssemblyCount"]);
  }

  let headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(h => String(h).toLowerCase().replace(/\\s/g, ""));
  let dateIdx = headers.indexOf("date");
  if (dateIdx === -1) dateIdx = headers.indexOf("날짜");
  if (dateIdx === -1) dateIdx = 0;

  const data = sheet.getDataRange().getDisplayValues();
  let foundRowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    const rowDate = formatDate(data[i][dateIdx]);
    if (rowDate === payload.date) {
      foundRowIndex = i + 1;
      break;
    }
  }

  function setValInRow(rowNum, colNames, val) {
    let colIdx = -1;
    for (let cn of colNames) {
      colIdx = headers.indexOf(cn);
      if (colIdx !== -1) break;
    }
    if (colIdx !== -1) {
      sheet.getRange(rowNum, colIdx + 1).setValue(val);
    } else {
      headers.push(colNames[0]);
      sheet.getRange(1, headers.length).setValue(colNames[0]);
      sheet.getRange(rowNum, headers.length).setValue(val);
    }
  }

  if (foundRowIndex > 0) {
    if (payload.hasWorship !== undefined) setValInRow(foundRowIndex, ["hasworship", "worship", "예배"], payload.hasWorship ? "TRUE" : "FALSE");
    if (payload.hasAssembly !== undefined) setValInRow(foundRowIndex, ["hasassembly", "assembly", "gathering", "meeting", "집회"], payload.hasAssembly ? "TRUE" : "FALSE");
    if (payload.hasWoorl !== undefined) setValInRow(foundRowIndex, ["haswoorl", "haswool", "wool", "울모임"], payload.hasWoorl ? "TRUE" : "FALSE");
    if (payload.ministryEvent !== undefined) setValInRow(foundRowIndex, ["ministryevent", "event", "사역", "행사"], payload.ministryEvent);
    if (payload.count !== undefined || payload.manualAssemblyCount !== undefined) {
      const rawCnt = payload.manualAssemblyCount !== undefined ? payload.manualAssemblyCount : payload.count;
      const numCnt = Number(rawCnt);
      const cnt = (rawCnt !== null && rawCnt !== undefined && String(rawCnt).trim() !== '' && !isNaN(numCnt) && numCnt > 0) ? numCnt : "";
      setValInRow(foundRowIndex, ["manualassemblycount", "계수인원"], cnt);
    }
  } else {
    const targetRow = sheet.getLastRow() + 1;
    setValInRow(targetRow, ["date", "날짜"], payload.date);
    setValInRow(targetRow, ["hasworship", "worship", "예배"], payload.hasWorship !== false ? "TRUE" : "FALSE");
    setValInRow(targetRow, ["hasassembly", "assembly", "gathering", "meeting", "집회"], payload.hasAssembly !== false ? "TRUE" : "FALSE");
    setValInRow(targetRow, ["haswoorl", "haswool", "wool", "울모임"], payload.hasWoorl !== false ? "TRUE" : "FALSE");
    setValInRow(targetRow, ["ministryevent", "event", "사역", "행사"], payload.ministryEvent || "");
    const rawCnt = payload.manualAssemblyCount !== undefined ? payload.manualAssemblyCount : payload.count;
    const numCnt = Number(rawCnt);
    const cnt = (rawCnt !== null && rawCnt !== undefined && String(rawCnt).trim() !== '' && !isNaN(numCnt) && numCnt > 0) ? numCnt : "";
    setValInRow(targetRow, ["manualassemblycount", "계수인원"], cnt);
  }
}

function addVisitation(ss, payload) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'visitations');
  if (!sheet) {
    sheet = ss.insertSheet('visitations');
    sheet.appendRow(['visitationId', 'date', 'memberId', 'visitationType', 'place', 'details', 'prayerRequests', 'submittedAt']);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['visitationId', 'date', 'memberId', 'visitationType', 'place', 'details', 'prayerRequests', 'submittedAt']);
  }

  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).toLowerCase().replace(/\\s/g, ''); })
    : ['visitationid', 'date', 'memberid', 'visitationtype', 'place', 'details', 'prayerrequests', 'submittedat'];
  
  const map = {
    'visitationid': ['visitationid', '심방id'],
    'date': ['date', '일자', '날짜'],
    'memberid': ['memberid', '성도id'],
    'visitationtype': ['visitationtype', '심방종류', '구분', '심방형태'],
    'place': ['place', '장소', '심방장소'],
    'details': ['details', '상세내용', '내용', '심방내용'],
    'prayerrequests': ['prayerrequests', '기도제목'],
    'submittedat': ['submittedat', '제출일시']
  };

  const newRow = headers.map(function(header) {
    const h = String(header).toLowerCase().replace(/\\s/g, '');
    if (map['visitationid'].indexOf(h) !== -1) return payload.visitationId;
    if (map['date'].indexOf(h) !== -1) return payload.date;
    if (map['memberid'].indexOf(h) !== -1) return payload.memberId;
    if (map['visitationtype'].indexOf(h) !== -1) return payload.visitationType;
    if (map['place'].indexOf(h) !== -1) return payload.place;
    if (map['details'].indexOf(h) !== -1) return payload.details;
    if (map['prayerrequests'].indexOf(h) !== -1) return payload.prayerRequests;
    if (map['submittedat'].indexOf(h) !== -1) return payload.submittedAt || new Date().toISOString();
    return '';
  });
  
  sheet.appendRow(newRow);
}

function deleteVisitation(ss, payload) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'visitations');
  if (!sheet) return;

  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).toLowerCase().replace(/\\s/g, ''); })
    : ['visitationid', 'date', 'memberid', 'visitationtype', 'place', 'details', 'prayerrequests', 'submittedat'];
    
  const possibleIdHeaders = ['visitationid', '심방id'];
  const idIdx = headers.findIndex(function(h) { return possibleIdHeaders.indexOf(h) !== -1; });
  if (idIdx === -1) return;

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idIdx]) === String(payload.visitationId)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function updateVisitation(ss, payload) {
  let sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'visitations');
  if (!sheet) return;

  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).toLowerCase().replace(/\\s/g, ''); })
    : ['visitationid', 'date', 'memberid', 'visitationtype', 'place', 'details', 'prayerrequests', 'submittedat'];

  const possibleIdHeaders = ['visitationid', '심방id'];
  const idIdx = headers.findIndex(function(h) { return possibleIdHeaders.indexOf(h) !== -1; });
  if (idIdx === -1) return;

  const data = sheet.getDataRange().getDisplayValues();
  let foundRowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(payload.visitationId)) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) {
     const map = {
       'date': ['date', '일자', '날짜'],
       'memberId': ['memberid', '성도id'],
       'visitationType': ['visitationtype', '심방종류', '구분', '심방형태'],
       'place': ['place', '장소', '심방장소'],
       'details': ['details', '상세내용', '내용', '심방내용'],
       'prayerRequests': ['prayerrequests', '기도제목']
     };

     Object.keys(payload).forEach(key => {
       if (map[key]) {
         const possibleHeaders = map[key].map(function(h) { return h.toLowerCase(); });
         const colIdx = headers.findIndex(function(h) { return possibleHeaders.indexOf(h) !== -1; });
         if (colIdx !== -1) {
           sheet.getRange(foundRowIndex, colIdx + 1).setValue(payload[key]);
         }
       }
     });
  }
}
`;

interface DataManagementProps {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
  availableGroups: string[];
  onToggleAttendance: (memberId: string, date: string, type: AttendanceType) => void;
  onUpdateMeetingStatus?: (date: string, config: { hasWorship: boolean; hasAssembly: boolean; hasWoorl: boolean; ministryEvent: string; manualAssemblyCount?: number }) => void;
  refreshData: () => void;
  prayerRecords?: PrayerRecord[];
}

const DataManagement: React.FC<DataManagementProps> = ({ 
  members, 
  setMembers, 
  records, 
  meetingStatus, 
  availableGroups, 
  onToggleAttendance, 
  onUpdateMeetingStatus,
  refreshData, 
  prayerRecords = [] 
}) => {
  const navigate = useNavigate();

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

  const [activeTab, setActiveTab] = useState<'members' | 'attendance' | 'sessionConfig' | 'export' | 'settings'>(() => loadSessionState<'members' | 'attendance' | 'sessionConfig' | 'export' | 'settings'>('datamanage_activeTab', 'members'));
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null); // For delete confirmation
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3000);
  };
  
  // Settings State
  const [scriptUrl, setLocalScriptUrl] = useState(getScriptUrl() || DEFAULT_SCRIPT_URL);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // New Member State
  const [newMember, setNewMember] = useState<Partial<Member>>({ group: '', name: '', phoneNumber: '', MemberRegistration: '', specialNotes: '' });
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  
  // Sorting & Filtering State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [memberFilterGroup, setMemberFilterGroup] = useState<string>(() => loadSessionState<string>('datamanage_memberFilterGroup', 'all'));
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>(() => loadSessionState<string>('datamanage_memberSearchQuery', ''));
  
  const [attendanceFilterGroup, setAttendanceFilterGroup] = useState<string>(() => loadSessionState<string>('datamanage_attendanceFilterGroup', 'all'));
  const [selectedDate, setSelectedDate] = useState<string>(() => loadSessionState<string>('datamanage_selectedDate', getClosestSunday()));

  // Export State
  const [exportStartDate, setExportStartDate] = useState<string>('2026-01-01');
  const [exportEndDate, setExportEndDate] = useState<string>('2026-12-31');

  // Manual Assembly Count State
  const [manualCount, setManualCount] = useState<string>('');
  const [isUpdatingManualCount, setIsUpdatingManualCount] = useState(false);

  // Session Config Management State
  const [sessionSearchQuery, setSessionSearchQuery] = useState<string>('');
  const [sessionMonthFilter, setSessionMonthFilter] = useState<string>('all');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'all' | 'active' | 'canceled'>('all');
  const [editingSessionConfig, setEditingSessionConfig] = useState<{
    date: string;
    hasWorship: boolean;
    hasAssembly: boolean;
    hasWoorl: boolean;
    ministryEvent: string;
    manualAssemblyCount?: number;
  } | null>(null);
  const [isAddingSessionDate, setIsAddingSessionDate] = useState<boolean>(false);
  const [newSessionConfig, setNewSessionConfig] = useState<{
    date: string;
    hasWorship: boolean;
    hasAssembly: boolean;
    hasWoorl: boolean;
    ministryEvent: string;
    manualAssemblyCount?: number;
  }>({
    date: getClosestSunday(),
    hasWorship: true,
    hasAssembly: true,
    hasWoorl: true,
    ministryEvent: '',
    manualAssemblyCount: undefined
  });

  // Helper to get session config for a given date
  const getSessionConfigForDate = (date: string) => {
    const wStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Worship);
    const gStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Gathering);
    const lStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Wool);
    const anyStatus = wStatus || gStatus || lStatus;

    const validCount = (wStatus?.manualAssemblyCount && wStatus.manualAssemblyCount > 0) ? wStatus.manualAssemblyCount : undefined;

    return {
      date,
      hasWorship: wStatus ? !wStatus.isCanceled : true,
      hasAssembly: gStatus ? !gStatus.isCanceled : true,
      hasWoorl: lStatus ? !lStatus.isCanceled : true,
      ministryEvent: anyStatus?.event || '',
      manualAssemblyCount: validCount
    };
  };

  // Get all unique dates for session config
  const allSessionDates = useMemo(() => {
    const datesSet = new Set<string>();
    meetingStatus.forEach(s => {
      if (s.date) datesSet.add(s.date);
    });
    SUNDAYS_2026.forEach(d => datesSet.add(d));
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [meetingStatus]);

  // Filtered session configs
  const filteredSessionConfigs = useMemo(() => {
    return allSessionDates.map(date => getSessionConfigForDate(date)).filter(item => {
      if (sessionMonthFilter !== 'all') {
        const monthStr = item.date.split('-')[1];
        if (monthStr !== sessionMonthFilter) return false;
      }
      if (sessionStatusFilter === 'active') {
        if (!item.hasWorship || !item.hasAssembly || !item.hasWoorl) return false;
      } else if (sessionStatusFilter === 'canceled') {
        if (item.hasWorship && item.hasAssembly && item.hasWoorl && !item.ministryEvent) return false;
      }
      if (sessionSearchQuery.trim()) {
        const q = sessionSearchQuery.trim().toLowerCase();
        const dateMatch = item.date.toLowerCase().includes(q);
        const eventMatch = item.ministryEvent.toLowerCase().includes(q);
        if (!dateMatch && !eventMatch) return false;
      }
      return true;
    });
  }, [allSessionDates, meetingStatus, sessionMonthFilter, sessionStatusFilter, sessionSearchQuery]);

  // Quick toggle session config function
  const handleQuickToggleSession = async (date: string, key: 'hasWorship' | 'hasAssembly' | 'hasWoorl', currentVal: boolean) => {
    const current = getSessionConfigForDate(date);
    const validCount = (current.manualAssemblyCount && current.manualAssemblyCount > 0) ? current.manualAssemblyCount : undefined;
    const updated = {
      ...current,
      [key]: !currentVal,
      manualAssemblyCount: validCount
    };
    if (onUpdateMeetingStatus) {
      onUpdateMeetingStatus(date, updated);
    } else {
      await sendAction('UPDATE_SESSION_CONFIG', {
        date,
        hasWorship: updated.hasWorship,
        hasAssembly: updated.hasAssembly,
        hasWoorl: updated.hasWoorl,
        ministryEvent: updated.ministryEvent,
        manualAssemblyCount: validCount ?? ""
      });
      refreshData();
    }
    showToast(`${date} 모임 설정이 업데이트되었습니다.`, 'success');
  };

  // Save session config from modal
  const handleSaveSessionConfig = async (config: { date: string; hasWorship: boolean; hasAssembly: boolean; hasWoorl: boolean; ministryEvent: string; manualAssemblyCount?: number }) => {
    if (!config.date) {
      showToast('날짜를 지정해 주세요.', 'error');
      return;
    }
    const validCount = (config.manualAssemblyCount && config.manualAssemblyCount > 0) ? config.manualAssemblyCount : undefined;
    const cleanConfig = { ...config, manualAssemblyCount: validCount };
    if (onUpdateMeetingStatus) {
      onUpdateMeetingStatus(config.date, cleanConfig);
    } else {
      await sendAction('UPDATE_SESSION_CONFIG', {
        date: config.date,
        hasWorship: config.hasWorship,
        hasAssembly: config.hasAssembly,
        hasWoorl: config.hasWoorl,
        ministryEvent: config.ministryEvent,
        manualAssemblyCount: validCount ?? ""
      });
      refreshData();
    }
    showToast(`${config.date} 모임 및 행사 설정이 저장되었습니다.`, 'success');
    setEditingSessionConfig(null);
    setIsAddingSessionDate(false);
  };

  // Sync state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('datamanage_activeTab', JSON.stringify(activeTab));
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('datamanage_memberFilterGroup', JSON.stringify(memberFilterGroup));
  }, [memberFilterGroup]);

  useEffect(() => {
    sessionStorage.setItem('datamanage_memberSearchQuery', JSON.stringify(memberSearchQuery));
  }, [memberSearchQuery]);

  useEffect(() => {
    sessionStorage.setItem('datamanage_attendanceFilterGroup', JSON.stringify(attendanceFilterGroup));
  }, [attendanceFilterGroup]);

  useEffect(() => {
    sessionStorage.setItem('datamanage_selectedDate', JSON.stringify(selectedDate));
  }, [selectedDate]);

  // Update selected date if tab changes to attendance or on mount
  useEffect(() => {
    if (activeTab === 'attendance' && !sessionStorage.getItem('datamanage_selectedDate')) {
      setSelectedDate(getClosestSunday());
    }
  }, [activeTab]);

  // Sync manualCount with meetingStatus when date changes
  useEffect(() => {
    const status = meetingStatus.find(s => s.date === selectedDate && s.type === AttendanceType.Worship);
    setManualCount(status?.manualAssemblyCount?.toString() || '');
  }, [selectedDate, meetingStatus]);

  const handleUpdateManualAssemblyCount = async () => {
    if (!selectedDate) return;
    setIsUpdatingManualCount(true);
    const parsed = parseInt(manualCount.trim(), 10);
    const validCount = (!isNaN(parsed) && parsed > 0) ? parsed : undefined;
    try {
      if (onUpdateMeetingStatus) {
        const currentCfg = getSessionConfigForDate(selectedDate);
        onUpdateMeetingStatus(selectedDate, {
          ...currentCfg,
          manualAssemblyCount: validCount
        });
      } else {
        await sendAction('UPDATE_SESSION_CONFIG', {
          date: selectedDate,
          manualAssemblyCount: validCount ?? ""
        });
        refreshData();
      }
      showToast("인원 계수가 성공적으로 저장되었습니다.", "success");
    } catch (e) {
      showToast("인원 계수 저장 중 오류가 발생했습니다.", "error");
    } finally {
      setIsUpdatingManualCount(false);
    }
  };

  const getEventName = (date: string) => {
    return meetingStatus.find(s => s.date === date)?.event || '';
  };

  const handleUpdateMember = (id: string, field: keyof Member, value: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.group) {
        showToast("이름과 소그룹을 모두 입력해주세요.", "error");
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
      MemberRegistration: newMember.MemberRegistration || '',
      latestPrayerRequest: '', 
      specialNotes: newMember.specialNotes || '' 
    };

    try {
      // 1. Send to Google Sheets
      await sendAction('ADD_MEMBER', memberToAdd);
      
      // 2. Update Local State (Optimistic)
      setMembers(prev => [...prev, memberToAdd]);

      // 3. Reset Form & Show Success
      setNewMember({ group: '', name: '', phoneNumber: '', MemberRegistration: '', specialNotes: '' });
      setShowAddSuccess(true);
      showToast("새로운 멤버가 추가되었습니다.", "success");
    } catch (e) {
      showToast("멤버 추가 중 오류가 발생했습니다.", "error");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMember) return;
    setIsAddingMember(true); // Reuse loading state

    try {
      // Update in Google Sheets
      await sendAction('UPDATE_MEMBER', editingMember);

      // Update Local State
      setMembers(prev => prev.map(m => m.id === editingMember.id ? editingMember : m));
      setEditingMember(null);
      showToast("정보가 수정되었습니다.", "success");
    } catch (e) {
      showToast("정보 수정 중 오류가 발생했습니다.", "error");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleDeactivateMember = async () => {
    if (!deletingMember) return;
    setIsAddingMember(true);

    try {
      const inactiveMember = { ...deletingMember, status: 'INACTIVE' };
      await sendAction('UPDATE_MEMBER', inactiveMember);
      setMembers(prev => prev.map(m => m.id === deletingMember.id ? inactiveMember : m));
      setDeletingMember(null);
      showToast("멤버가 비활성화되었습니다.", "success");
    } catch (e) {
      showToast("비활성화 중 오류가 발생했습니다.", "error");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleReactivateMember = async () => {
    if (!deletingMember) return;
    setIsAddingMember(true);

    try {
      const activeMember = { ...deletingMember, status: 'ACTIVE' };
      await sendAction('UPDATE_MEMBER', activeMember);
      setMembers(prev => prev.map(m => m.id === deletingMember.id ? activeMember : m));
      setDeletingMember(null);
      showToast("비활성화가 해제되어 멤버가 다시 활성화되었습니다.", "success");
    } catch (e) {
      showToast("활성화 처리 중 오류가 발생했습니다.", "error");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handlePermanentDeleteMember = async () => {
    if (!deletingMember) return;
    setIsAddingMember(true);

    try {
      const deletedMember = { ...deletingMember, status: 'DELETED' };
      await sendAction('UPDATE_MEMBER', deletedMember);
      setMembers(prev => prev.map(m => m.id === deletingMember.id ? deletedMember : m));
      setDeletingMember(null);
      showToast("멤버가 완전히 삭제되었습니다. (DB status: DELETED)", "success");
    } catch (e) {
      showToast("삭제 처리 중 오류가 발생했습니다.", "error");
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

    // Filter out DELETED members
    items = items.filter(m => {
      const coreStatus = (m.status?.split(':')[0] || 'ACTIVE').toUpperCase();
      return coreStatus !== 'DELETED';
    });

    // Filter by Group
    if (memberFilterGroup !== 'all') {
      items = items.filter(m => m.group === memberFilterGroup);
    }

    // Filter by Name Search (utilizing Korean initial & 2-digit birth year match)
    if (memberSearchQuery.trim()) {
      items = items.filter(m => matchKoreanFuzzy(memberSearchQuery, String(m.name || '')));
    }
    
    // Sort
    const twoDigitNums = memberSearchQuery ? memberSearchQuery.match(/\d{2}/g) || [] : [];

    if (sortConfig && activeTab === 'members') {
      items.sort((a, b) => {
        // Prioritize members whose name contains the searched 2-digit number
        if (twoDigitNums.length > 0) {
          const aHas = twoDigitNums.some(num => String(a.name || '').includes(num));
          const bHas = twoDigitNums.some(num => String(b.name || '').includes(num));
          if (aHas && !bHas) return -1;
          if (!aHas && bHas) return 1;
        }

        // @ts-ignore
        const aValue = (a[sortConfig.key] || '').toString().toLowerCase();
        // @ts-ignore
        const bValue = (b[sortConfig.key] || '').toString().toLowerCase();
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else if (activeTab === 'members') {
       items.sort((a, b) => {
         // Prioritize members whose name contains the searched 2-digit number
         if (twoDigitNums.length > 0) {
           const aHas = twoDigitNums.some(num => String(a.name || '').includes(num));
           const bHas = twoDigitNums.some(num => String(b.name || '').includes(num));
           if (aHas && !bHas) return -1;
           if (!aHas && bHas) return 1;
         }

         return String(a.name || '').localeCompare(String(b.name || ''));
       });
    }

    return items;
  }, [members, memberFilterGroup, memberSearchQuery, sortConfig, activeTab]);

  // Sort and Filter for Attendance Tab
  const processedAttendanceMembers = useMemo(() => {
    let items = [...members];
    // Filter out inactive and deleted for Attendance Input
    items = items.filter(m => {
      const coreStatus = (m.status?.split(':')[0] || 'ACTIVE').toUpperCase();
      return coreStatus !== 'INACTIVE' && coreStatus !== 'DELETED';
    });

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
               ? String(a.name || '').localeCompare(String(b.name || '')) 
               : String(b.name || '').localeCompare(String(a.name || ''));
           });
      } else if (sortConfig.key === 'group') {
           return items.sort((a, b) => {
             return sortConfig.direction === 'asc' 
               ? String(a.group || '').localeCompare(String(b.group || '')) 
               : String(b.group || '').localeCompare(String(a.group || ''));
           });
      }
    } else if (activeTab === 'attendance') {
       // Default sort logic
       items.sort((a, b) => {
         const groupA = String(a.group || '');
         const groupB = String(b.group || '');
         if (groupA !== groupB) return groupA.localeCompare(groupB);
         return String(a.name || '').localeCompare(String(b.name || ''));
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
        setTimeout(() => { refreshData(); showToast('연결 성공! 데이터를 새로고침했습니다.', 'success'); }, 500);
      })
      .catch((err) => { setConnectionStatus('error'); setErrorMessage(err.message || '연결 실패'); });
  };

  const copyToClipboard = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(GAS_CODE_SNIPPET)
          .then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
          })
          .catch((err) => {
            console.error("Clipboard copy failed via API:", err);
            fallbackCopyToClipboard();
          });
      } else {
        fallbackCopyToClipboard();
      }
    } catch (e) {
      console.error("Clipboard copy failed:", e);
      fallbackCopyToClipboard();
    }
  };

  const fallbackCopyToClipboard = () => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = GAS_CODE_SNIPPET;
      textArea.style.position = "fixed";  // avoid scrolling to bottom
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        showToast("클립보드 복사에 실패했습니다. 코드를 수동으로 복사해주세요.", "error");
      }
    } catch (err) {
      console.error("Fallback clipboard copy failed:", err);
      showToast("클립보드 복사에 실패했습니다. 코드를 수동으로 복사해주세요.", "error");
    }
  };
  
  return (
    <div className="space-y-6 relative">
      {/* Loading Overlay */}
      {isAddingMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center">
             <Loader2 size={32} className="animate-spin text-indigo-600 mb-4" />
             <p className="font-bold text-slate-700">데이터 처리 중...</p>
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
              <h3 className="text-lg font-bold text-slate-800 mb-2">완료</h3>
              <p className="text-slate-600 mb-6">성공적으로 처리되었습니다.</p>
              <button 
                 onClick={() => setShowAddSuccess(false)}
                 className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                 확인
              </button>
           </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="text-lg font-bold text-slate-800">멤버 정보 수정</h3>
               <button onClick={() => setEditingMember(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
             </div>
             <div className="p-6 space-y-4">
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">이름</label>
                   <input 
                     type="text" 
                     className="w-full border border-slate-300 rounded-lg p-2.5" 
                     value={editingMember.name} 
                     onChange={e => setEditingMember({...editingMember, name: e.target.value})}
                   />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">소그룹</label>
                   <select 
                     className="w-full border border-slate-300 rounded-lg p-2.5"
                     value={editingMember.group}
                     onChange={e => setEditingMember({...editingMember, group: e.target.value, wool: e.target.value})}
                   >
                     {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">연락처</label>
                   <input 
                     type="text" 
                     className="w-full border border-slate-300 rounded-lg p-2.5" 
                     value={editingMember.phoneNumber || ''} 
                     onChange={e => setEditingMember({...editingMember, phoneNumber: e.target.value})}
                   />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">등반일</label>
                   <input 
                     type="date" 
                     className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg p-2.5 text-sm cursor-pointer" 
                     value={editingMember.MemberRegistration || ''} 
                     onChange={e => setEditingMember({...editingMember, MemberRegistration: e.target.value})}
                     onClick={e => { try { (e.target as HTMLInputElement).showPicker(); } catch {} }}
                   />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">비고 (Memo)</label>
                   <textarea 
                     className="w-full border border-slate-300 rounded-lg p-2.5 h-20 resize-none" 
                     value={editingMember.specialNotes || ''} 
                     onChange={e => setEditingMember({...editingMember, specialNotes: e.target.value})}
                   />
                </div>
             </div>
             <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setEditingMember(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium text-sm">취소</button>
                <button onClick={handleSaveEdit} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-medium text-sm flex items-center">
                   <Save size={16} className="mr-2" /> 저장하기
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-sm w-full overflow-hidden border border-slate-100 dark:border-slate-800">
             {((deletingMember.status?.split(':')[0] || 'ACTIVE').toUpperCase() === 'INACTIVE') ? (
               // Already Inactive Member -> Option to Reactivate or Permanently Delete (DELETED)
               <div>
                 <div className="p-6 text-center">
                   <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertCircle size={32} />
                   </div>
                   <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">비활성화된 멤버 처리</h3>
                   <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">{deletingMember.name}</span>님은 현재 <span className="font-semibold text-amber-600 dark:text-amber-400">비활성화</span> 상태입니다.<br/>
                     원하시는 작업을 선택해 주세요.
                   </p>
                 </div>
                 <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                    <button 
                      onClick={handleReactivateMember} 
                      disabled={isAddingMember}
                      className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      비활성화 해제 (다시 활성화)
                    </button>
                    <button 
                      onClick={handlePermanentDeleteMember} 
                      disabled={isAddingMember}
                      className="w-full px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      완전 삭제 (상태: DELETED)
                    </button>
                    <button 
                      onClick={() => setDeletingMember(null)} 
                      disabled={isAddingMember}
                      className="w-full px-4 py-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-medium text-sm transition-colors cursor-pointer mt-1"
                    >
                      취소
                    </button>
                 </div>
               </div>
             ) : (
               // Active Member -> Prompt Deactivation
               <div>
                 <div className="p-6 text-center">
                   <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Trash2 size={32} />
                   </div>
                   <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">비활성화 하시겠습니까?</h3>
                   <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">{deletingMember.name}</span>님을 목록에서 비활성화합니다.<br/>
                     데이터 관리 목록에는 흐리게 표시되며, 다른 출석부 및 통계 화면에서는 숨겨집니다.
                   </p>
                 </div>
                 <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                    <button 
                      onClick={() => setDeletingMember(null)} 
                      disabled={isAddingMember}
                      className="flex-1 px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                    <button 
                      onClick={handleDeactivateMember} 
                      disabled={isAddingMember}
                      className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-sm transition-colors cursor-pointer"
                    >
                      비활성화 (삭제)
                    </button>
                 </div>
               </div>
             )}
          </div>
        </div>
      )}

      <header className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl md:text-3xl font-bold text-slate-800">데이터 관리</h2>
           <p className="text-sm md:text-base text-slate-500">멤버/출석 관리, 데이터 내보내기 및 DB 설정</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto custom-scrollbar">
        <ul className="flex flex-nowrap -mb-px text-sm font-medium text-center text-slate-500 min-w-max">
          <li className="mr-2">
            <button onClick={() => { setActiveTab('members'); setSortConfig(null); }} className={`inline-block p-4 rounded-t-lg border-b-2 whitespace-nowrap ${activeTab === 'members' ? 'text-indigo-600 border-indigo-600' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>멤버 관리</button>
          </li>
          <li className="mr-2">
            <button onClick={() => { setActiveTab('attendance'); setSortConfig(null); }} className={`inline-block p-4 rounded-t-lg border-b-2 whitespace-nowrap ${activeTab === 'attendance' ? 'text-indigo-600 border-indigo-600 font-bold' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>출석 입력</button>
          </li>
          <li className="mr-2">
            <button onClick={() => setActiveTab('sessionConfig')} className={`flex items-center p-4 rounded-t-lg border-b-2 whitespace-nowrap ${activeTab === 'sessionConfig' ? 'text-indigo-600 border-indigo-600 font-bold' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>
              <Sliders size={16} className="mr-2 text-indigo-600" /> 모임/행사 설정
            </button>
          </li>
          <li className="mr-2">
            <button onClick={() => setActiveTab('export')} className={`flex items-center p-4 rounded-t-lg border-b-2 whitespace-nowrap ${activeTab === 'export' ? 'text-indigo-600 border-indigo-600 font-bold' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>
              <Download size={16} className="mr-2" /> 데이터 내보내기
            </button>
          </li>
          <li className="mr-2">
            <button onClick={() => setActiveTab('settings')} className={`flex items-center p-4 rounded-t-lg border-b-2 whitespace-nowrap ${activeTab === 'settings' ? 'text-slate-800 border-slate-800' : 'border-transparent hover:text-slate-600 hover:border-slate-300'}`}>
              <Settings size={16} className="mr-2" /> DB 연결 설정
            </button>
          </li>
        </ul>
      </div>

      {activeTab === 'members' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
           {/* Member Add Form */}
            <div className="flex flex-col gap-4 mb-6 bg-slate-50 p-4 rounded-lg">
              <div className="space-y-4">
                 <h4 className="font-bold text-slate-700 text-sm">새 멤버 추가</h4>
                 <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                     <input type="text" className="border border-slate-300 rounded p-2 text-sm w-full" value={newMember.name || ''} onChange={e => setNewMember({...newMember, name: e.target.value})} placeholder="이름" />
                     <select className="border border-slate-300 rounded p-2 text-sm w-full" value={newMember.group || ''} onChange={e => setNewMember({...newMember, group: e.target.value, wool: e.target.value})}>
                       <option value="">소그룹 선택</option>
                       {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
                     </select>
                     <input type="text" className="border border-slate-300 rounded p-2 text-sm w-full" value={newMember.phoneNumber || ''} onChange={e => setNewMember({...newMember, phoneNumber: e.target.value})} placeholder="연락처" />
                     <div className="relative group">
                        <input type="date" className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded p-2 text-sm w-full cursor-pointer" placeholder="등반일(YYYY-MM-DD)" value={newMember.MemberRegistration || ''} onChange={e => setNewMember({...newMember, MemberRegistration: e.target.value})} onClick={e => { try { (e.target as HTMLInputElement).showPicker(); } catch {} }} />
                        <div className="absolute left-0 -bottom-5 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded z-10">등반일 (입력 시 해당일부터 출석률 계산)</div>
                     </div>
                     <input type="text" className="border border-slate-300 rounded p-2 text-sm w-full" value={newMember.specialNotes || ''} onChange={e => setNewMember({...newMember, specialNotes: e.target.value})} placeholder="비고(메모)" />
                 </div>
                 <div className="flex justify-end">
                    <button onClick={handleAddMember} className="bg-indigo-600 text-white px-8 py-2 rounded text-sm hover:bg-indigo-700 flex items-center justify-center font-bold shadow-sm">
                      <Plus size={16} className="mr-1" /> 멤버 추가하기
                    </button>
                 </div>
              </div>
            </div>

           <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-4 gap-3">
              <div className="flex items-center gap-2 w-full md:w-auto">
                 <div className="relative w-full md:w-64">
                   <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-slate-400">
                     <Search size={16} />
                   </div>
                   <input 
                     type="text" 
                     placeholder="이름 검색..." 
                     className="pl-8 border border-slate-300 rounded p-1.5 text-sm w-full"
                     value={memberSearchQuery}
                     onChange={(e) => setMemberSearchQuery(e.target.value)}
                   />
                   {memberSearchQuery && (
                      <button onClick={() => setMemberSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                   )}
                 </div>
              </div>

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

           <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                  <tr>
                    <th className="px-4 md:px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort('name')}>
                      <div className="flex items-center">이름 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'name' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                    </th>
                    <th className="px-4 md:px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort('group')}>
                      <div className="flex items-center">소그룹 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'group' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                    </th>
                    <th className="px-4 md:px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort('MemberRegistration')}>
                      <div className="flex items-center">등반일 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'MemberRegistration' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                    </th>
                    <th className="px-4 md:px-6 py-3 whitespace-nowrap">연락처</th>
                    <th className="px-4 md:px-6 py-3 whitespace-nowrap">비고 (Memo)</th>
                    <th className="px-4 md:px-6 py-3 text-right whitespace-nowrap">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {processedMembers.map(member => (
                    <tr key={member.id} className={`border-b group ${member.status?.split(':')[0] === 'INACTIVE' ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' : isNewFamily(member) ? 'bg-lime-50/20 hover:bg-lime-50/45 dark:bg-lime-950/5 text-slate-900' : 'bg-white hover:bg-slate-50 text-slate-900'}`}>
                      <td className="px-4 md:px-6 py-4 font-medium flex items-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => navigate('/profile', { state: { memberId: member.id } })}
                          className="flex items-center gap-2 text-left group/name hover:text-indigo-600 transition-colors cursor-pointer"
                          title={`${member.name} 님의 개인별 현황 보기`}
                        >
                           {member.photoUrl ? (
                             <img 
                               src={member.photoUrl} 
                               alt={member.name} 
                               className={`w-6 h-6 rounded-full object-cover shrink-0 ${
                                 isNewFamily(member) ? 'border-2 border-lime-400' : 'border border-slate-200 dark:border-slate-700'
                               }`} 
                               referrerPolicy="no-referrer" 
                             />
                           ) : (
                             <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                               isNewFamily(member)
                                 ? 'bg-lime-100 text-lime-800 border-2 border-lime-400'
                                 : 'bg-slate-100 text-slate-600 border border-slate-200 dark:border-slate-700'
                             }`}>
                               {member.name.substring(0, 1)}
                             </div>
                           )}
                           <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover/name:text-indigo-600 group-hover/name:underline underline-offset-2">
                             {member.name}
                           </span>
                           {isNewFamily(member) && (
                             <span className="ml-1 text-[9px] bg-lime-500 text-white font-extrabold px-1 py-0.2 rounded leading-none">새가족</span>
                           )}
                        </button>
                        {member.status?.split(':')[0] === 'INACTIVE' && (
                           <span className="ml-2 text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded border border-slate-300 shrink-0">비활성</span>
                        )}
                      </td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap">{member.group}</td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-500">
                        {member.MemberRegistration || (member as any).registrationDate || '-'}
                      </td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap">{member.phoneNumber}</td>
                      <td className="px-4 md:px-6 py-4 truncate max-w-[150px] md:max-w-[200px]" title={member.specialNotes}>{member.specialNotes}</td>
                      <td className="px-4 md:px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setEditingMember(member)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" title="수정">
                             <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => setDeletingMember(member)} 
                            className={`p-2 rounded-full transition-colors ${
                              member.status?.split(':')[0] === 'INACTIVE' 
                                ? 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40' 
                                : 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                            }`} 
                            title={member.status?.split(':')[0] === 'INACTIVE' ? '비활성화 해제 또는 완전 삭제' : '비활성화(삭제)'}
                          >
                             <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
           <div className="mb-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="font-bold text-slate-700 w-24">날짜 선택:</label>
                <div className="flex items-center gap-3">
                  <select 
                    className="border border-slate-300 rounded p-2 text-sm bg-white w-full sm:w-auto"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  >
                    {SUNDAYS_2026.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {getEventName(selectedDate) && (
                    <span className="text-sm text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded border border-indigo-100 whitespace-nowrap">
                      {getEventName(selectedDate)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pb-4 border-b border-slate-100">
                <label className="font-bold text-slate-700 w-24">인원 계수:</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    className="border border-slate-300 rounded p-2 text-sm w-32"
                    placeholder="계수 인원 입력"
                    value={manualCount}
                    onChange={(e) => setManualCount(e.target.value)}
                  />
                  <button 
                    onClick={handleUpdateManualAssemblyCount}
                    disabled={isUpdatingManualCount}
                    className={`px-4 py-2 bg-indigo-600 text-white rounded text-sm font-bold hover:bg-indigo-700 transition-colors ${isUpdatingManualCount ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isUpdatingManualCount ? '저장 중...' : '계수 저장'}
                  </button>
                  <span className="text-[10px] text-slate-400 ml-2">* 수동으로 계수한 현장 인원을 입력합니다.</span>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4">
                <label className="font-bold text-slate-700 w-24 md:mt-2">소그룹/울:</label>
                <div className="flex flex-wrap gap-2">
                   <button onClick={() => setAttendanceFilterGroup('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${attendanceFilterGroup === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>전체 보기</button>
                   {availableGroups.map(g => (
                     <button key={g} onClick={() => setAttendanceFilterGroup(g)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${attendanceFilterGroup === g ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{g}</button>
                   ))}
                </div>
              </div>
           </div>
           
           <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                   <tr>
                     <th className="px-4 md:px-6 py-3 cursor-pointer hover:bg-slate-100 whitespace-nowrap" onClick={() => handleSort('name')}>
                       <div className="flex items-center">이름 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'name' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                     </th>
                     <th className="px-4 md:px-6 py-3 cursor-pointer hover:bg-slate-100 whitespace-nowrap" onClick={() => handleSort('group')}>
                        <div className="flex items-center">소그룹 <ArrowUpDown size={14} className={`ml-1 ${sortConfig?.key === 'group' ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                     </th>
                     <th className="px-4 md:px-6 py-3 text-center whitespace-nowrap">예배</th>
                     <th className="px-4 md:px-6 py-3 text-center whitespace-nowrap">집회</th>
                     <th className="px-4 md:px-6 py-3 text-center whitespace-nowrap">울모임</th>
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
                      <tr key={member.id} className={`border-b hover:bg-slate-50 ${isNewFamily(member) ? 'bg-lime-50/20' : 'bg-white'}`}>
                        <td className="px-4 md:px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                           <button
                             type="button"
                             onClick={() => navigate('/profile', { state: { memberId: member.id } })}
                             className="flex items-center gap-2 text-left group/name hover:text-indigo-600 transition-colors cursor-pointer"
                             title={`${member.name} 님의 개인별 현황 보기`}
                           >
                             {member.photoUrl ? (
                               <img 
                                 src={member.photoUrl} 
                                 alt={member.name} 
                                 className={`w-6 h-6 rounded-full object-cover shrink-0 ${
                                   isNewFamily(member) ? 'border-2 border-lime-400' : 'border border-slate-200 dark:border-slate-700'
                                 }`} 
                                 referrerPolicy="no-referrer" 
                               />
                             ) : (
                               <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                 isNewFamily(member)
                                   ? 'bg-lime-100 text-lime-800 border-2 border-lime-400'
                                   : 'bg-slate-100 text-slate-600 border border-slate-200 dark:border-slate-700'
                               }`}>
                                 {member.name.substring(0, 1)}
                               </div>
                             )}
                             <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover/name:text-indigo-600 group-hover/name:underline underline-offset-2">
                               {member.name}
                             </span>
                             {isNewFamily(member) && (
                               <span className="ml-1 text-[9px] bg-lime-500 text-white font-extrabold px-1 py-0.2 rounded leading-none">새가족</span>
                             )}
                           </button>
                        </td>
                        <td className="px-4 md:px-6 py-4 whitespace-nowrap">{member.group}</td>
                        <td className="px-4 md:px-6 py-4 text-center">
                          {renderCheckButton(AttendanceType.Worship, '', 'bg-blue-600')}
                        </td>
                        <td className="px-4 md:px-6 py-4 text-center">
                          {renderCheckButton(AttendanceType.Gathering, '', 'bg-indigo-600')}
                        </td>
                        <td className="px-4 md:px-6 py-4 text-center">
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

      {activeTab === 'export' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
           <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <Download size={20} className="mr-2 text-indigo-600" /> 
              데이터 엑셀 내보내기
           </h3>
           <p className="text-slate-500 text-sm mb-6">
              선택한 기간 동안의 출석 상세 현황, 기도제목, 그리고 종합 통계를 엑셀 파일(.xlsx)로 다운로드합니다.
              <br/>데이터는 소그룹별로 정렬되어 저장됩니다.
           </p>

           <div className="bg-slate-50 p-4 md:p-6 rounded-lg border border-slate-200 max-w-2xl">
              <div className="mb-6">
                 <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center">
                    <Calendar size={16} className="mr-2" /> 기간 선택
                 </label>
                 <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-1 w-full">
                       <span className="text-xs text-slate-500 block mb-1">시작일</span>
                       <input 
                         type="date" 
                         className="w-full border border-slate-300 rounded p-2 text-sm"
                         value={exportStartDate}
                         onChange={(e) => setExportStartDate(e.target.value)}
                       />
                    </div>
                    <span className="text-slate-400 hidden md:block mt-5">~</span>
                    <div className="flex-1 w-full">
                       <span className="text-xs text-slate-500 block mb-1">종료일</span>
                       <input 
                         type="date" 
                         className="w-full border border-slate-300 rounded p-2 text-sm"
                         value={exportEndDate}
                         onChange={(e) => setExportEndDate(e.target.value)}
                       />
                    </div>
                 </div>
              </div>

              <div className="mb-6">
                 <span className="text-xs font-bold text-slate-500 mb-2 block">빠른 기간 설정</span>
                 <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => { setExportStartDate('2026-01-01'); setExportEndDate('2026-12-31'); }}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      1년 전체 (2026)
                    </button>
                    <button 
                       onClick={() => {
                          const now = new Date();
                          const start = new Date(now.getFullYear(), now.getMonth(), 1);
                          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                          setExportStartDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`);
                          setExportEndDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`);
                       }}
                       className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      이번 달
                    </button>
                    <button 
                       onClick={() => {
                          const now = new Date();
                          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                          setExportStartDate(`${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-${String(threeMonthsAgo.getDate()).padStart(2, '0')}`);
                          setExportEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
                       }}
                       className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      최근 3개월
                    </button>
                 </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-200">
                 <button 
                   onClick={() => {
                     exportDataToExcel(
                        members,
                        records, 
                        prayerRecords,
                        meetingStatus, // Pass meetingStatus
                        availableGroups,
                        { startDate: exportStartDate, endDate: exportEndDate }
                     );
                   }}
                   className="w-full md:w-auto bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center justify-center font-bold shadow-sm transition-transform active:scale-95"
                 >
                    <Download size={18} className="mr-2" /> 엑셀 파일 생성 및 다운로드
                 </button>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'sessionConfig' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <Sliders size={20} className="mr-2 text-indigo-600" />
                  모임 및 행사 일정 설정 (SessionConfig)
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  DB 실시간 연동
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                날짜별 예배, 집회, 울모임 진행 여부(<code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-xs">hasWorship</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-xs">hasAssembly</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-xs">hasWoorl</code>) 및 사유(<code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-xs">ministryEvent</code>)를 수정 및 등록합니다.
              </p>
            </div>
          </div>

          {/* Notice Banner */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3 text-indigo-900 text-xs md:text-sm">
            <AlertCircle size={20} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">⚠️ 구글 시트 DB 반영 필수 안내</p>
              <p className="text-indigo-800 leading-relaxed">
                모임 설정 수정 사항이 실제 구글 시트에 저장되지 않거나 새로고침 시 원래대로 돌아간다면, <button onClick={() => setActiveTab('settings')} className="underline font-bold text-indigo-700 hover:text-indigo-900">[DB 연결 설정]</button> 탭에서 <strong>'최신 앱스크립트 코드(v5.3)'</strong>를 복사하여 구글 시트의 Apps Script에 붙여넣고 <strong>[배포] &gt; [새 배포]</strong>를 진행해주세요. (구글 스크립트 버전 업그레이드가 되어야 구글 시트 데이터베이스에 정상 입력됩니다.)
              </p>
            </div>
          </div>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <span className="text-xs font-medium text-slate-500">전체 일정</span>
              <div className="text-xl font-bold text-slate-800 mt-0.5">{allSessionDates.length} <span className="text-xs font-normal text-slate-500">일</span></div>
            </div>
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5">
              <span className="text-xs font-medium text-emerald-700">집회 진행</span>
              <div className="text-xl font-bold text-emerald-800 mt-0.5">
                {allSessionDates.filter(d => {
                  const cfg = getSessionConfigForDate(d);
                  return cfg.hasAssembly;
                }).length} <span className="text-xs font-normal text-emerald-600">일</span>
              </div>
            </div>
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5">
              <span className="text-xs font-medium text-amber-700">행사 및 프로그램</span>
              <div className="text-xl font-bold text-amber-800 mt-0.5">
                {allSessionDates.filter(d => {
                  const cfg = getSessionConfigForDate(d);
                  return !!cfg.ministryEvent;
                }).length} <span className="text-xs font-normal text-amber-600">일</span>
              </div>
            </div>
            <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-3.5">
              <span className="text-xs font-medium text-indigo-700">이번주 주일 ({getClosestSunday()})</span>
              <div className="text-xs font-bold text-indigo-900 mt-1 flex items-center gap-1">
                {(() => {
                  const cfg = getSessionConfigForDate(getClosestSunday());
                  if (cfg.hasWorship && cfg.hasAssembly && cfg.hasWoorl && !cfg.ministryEvent) {
                    return <span className="text-emerald-700 font-bold">⛪ 정상 진행</span>;
                  }
                  return <span className="text-amber-800 font-bold">{cfg.ministryEvent || '일정 변경/취소'}</span>;
                })()}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-end gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            {/* Month Filter Dropdown */}
            <select
              className="border border-slate-300 rounded-lg px-3 py-2 text-xs md:text-sm bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={sessionMonthFilter}
              onChange={e => setSessionMonthFilter(e.target.value)}
            >
              <option value="all">월 선택 (전체)</option>
              {Array.from({ length: 12 }, (_, i) => {
                const m = String(i + 1).padStart(2, '0');
                return <option key={m} value={m}>{i + 1}월 일정</option>;
              })}
            </select>

            {/* Status Filter */}
            <select
              className="border border-slate-300 rounded-lg px-3 py-2 text-xs md:text-sm bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={sessionStatusFilter}
              onChange={e => setSessionStatusFilter(e.target.value as any)}
            >
              <option value="all">전체 상태 보기</option>
              <option value="active">정상 진행만</option>
              <option value="canceled">취소/행사일만</option>
            </select>
          </div>

          {/* Desktop PC Table View */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-xs">
                  <th className="py-3 px-4">날짜 (Date)</th>
                  <th className="py-3 px-4 text-center">예배 (hasWorship)</th>
                  <th className="py-3 px-4 text-center">집회 (hasAssembly)</th>
                  <th className="py-3 px-4 text-center">울모임 (hasWoorl)</th>
                  <th className="py-3 px-4">사역/행사/취소 사유 (ministryEvent)</th>
                  <th className="py-3 px-4 text-center">계수 인원</th>
                  <th className="py-3 px-4 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSessionConfigs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      검색 조건에 해당되는 모임/행사 설정 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredSessionConfigs.map(cfg => {
                    const isUpcoming = cfg.date === getClosestSunday();
                    return (
                      <tr key={cfg.date} className={`hover:bg-slate-50/80 transition-colors ${isUpcoming ? 'bg-indigo-50/30' : ''}`}>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-slate-400" />
                            <span>{cfg.date}</span>
                            {isUpcoming && (
                              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">
                                이번주
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Worship Toggle */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleQuickToggleSession(cfg.date, 'hasWorship', cfg.hasWorship)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                              cfg.hasWorship
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200'
                            }`}
                          >
                            {cfg.hasWorship ? '⛪ 예배 진행 (TRUE)' : '❌ 예배 취소 (FALSE)'}
                          </button>
                        </td>

                        {/* Assembly Toggle */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleQuickToggleSession(cfg.date, 'hasAssembly', cfg.hasAssembly)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                              cfg.hasAssembly
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200'
                            }`}
                          >
                            {cfg.hasAssembly ? '📢 집회 진행 (TRUE)' : '❌ 집회 취소 (FALSE)'}
                          </button>
                        </td>

                        {/* Woorl Toggle */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleQuickToggleSession(cfg.date, 'hasWoorl', cfg.hasWoorl)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                              cfg.hasWoorl
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200'
                            }`}
                          >
                            {cfg.hasWoorl ? '👥 울모임 진행 (TRUE)' : '❌ 울모임 취소 (FALSE)'}
                          </button>
                        </td>

                        {/* Ministry Event */}
                        <td className="py-3 px-4">
                          {cfg.ministryEvent ? (
                            <span className="inline-flex items-center px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold">
                              <Tag size={12} className="mr-1 text-amber-600" />
                              {cfg.ministryEvent}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">-</span>
                          )}
                        </td>

                        {/* Manual Assembly Count */}
                        <td className="py-3 px-4 text-center font-medium text-slate-700">
                          {cfg.manualAssemblyCount ? `${cfg.manualAssemblyCount}명` : '-'}
                        </td>

                        {/* Edit Button */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setEditingSessionConfig(cfg)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center transition-colors cursor-pointer"
                          >
                            <Edit2 size={13} className="mr-1 text-slate-500" />
                            수정
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (md:hidden) */}
          <div className="block md:hidden space-y-3">
            {filteredSessionConfigs.length === 0 ? (
              <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                검색 조건에 해당되는 모임/행사 설정 데이터가 없습니다.
              </div>
            ) : (
              filteredSessionConfigs.map(cfg => {
                const isUpcoming = cfg.date === getClosestSunday();
                return (
                  <div
                    key={cfg.date}
                    className={`bg-white border rounded-xl p-4 shadow-sm space-y-3 ${
                      isUpcoming ? 'border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/20' : 'border-slate-200'
                    }`}
                  >
                    {/* Top Row: Date & Main Status Badge */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={15} className="text-indigo-600" />
                        <span className="font-bold text-sm text-slate-800">{cfg.date}</span>
                        {isUpcoming && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">
                            이번주
                          </span>
                        )}
                      </div>

                      {cfg.ministryEvent ? (
                        <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold">
                          {cfg.ministryEvent}
                        </span>
                      ) : cfg.hasWorship && cfg.hasAssembly && cfg.hasWoorl ? (
                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                          정상 진행
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs font-bold">
                          일부/전체 취소
                        </span>
                      )}
                    </div>

                    {/* Quick Toggles Row */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        onClick={() => handleQuickToggleSession(cfg.date, 'hasWorship', cfg.hasWorship)}
                        className={`p-2 rounded-lg text-xs font-bold text-center border transition-all active:scale-95 cursor-pointer ${
                          cfg.hasWorship
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <div className="text-[10px] text-slate-500 font-normal">예배</div>
                        {cfg.hasWorship ? '진행 (O)' : '취소 (X)'}
                      </button>

                      <button
                        onClick={() => handleQuickToggleSession(cfg.date, 'hasAssembly', cfg.hasAssembly)}
                        className={`p-2 rounded-lg text-xs font-bold text-center border transition-all active:scale-95 cursor-pointer ${
                          cfg.hasAssembly
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <div className="text-[10px] text-slate-500 font-normal">집회</div>
                        {cfg.hasAssembly ? '진행 (O)' : '취소 (X)'}
                      </button>

                      <button
                        onClick={() => handleQuickToggleSession(cfg.date, 'hasWoorl', cfg.hasWoorl)}
                        className={`p-2 rounded-lg text-xs font-bold text-center border transition-all active:scale-95 cursor-pointer ${
                          cfg.hasWoorl
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <div className="text-[10px] text-slate-500 font-normal">울모임</div>
                        {cfg.hasWoorl ? '진행 (O)' : '취소 (X)'}
                      </button>
                    </div>

                    {/* Footer Row: Headcount & Full Edit button */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 font-medium">
                        계수인원: <strong className="text-slate-800">{cfg.manualAssemblyCount ? `${cfg.manualAssemblyCount}명` : '-'}</strong>
                      </span>
                      <button
                        onClick={() => setEditingSessionConfig(cfg)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-lg flex items-center transition-colors cursor-pointer"
                      >
                        <Edit2 size={13} className="mr-1" /> 상세 수정
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modal for Editing / Adding Session Config */}
      {(editingSessionConfig || isAddingSessionDate) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <Sliders size={18} className="mr-2 text-indigo-600" />
                {isAddingSessionDate ? '새 모임일 추가' : `${editingSessionConfig?.date} 모임 설정 수정`}
              </h3>
              <button
                onClick={() => {
                  setEditingSessionConfig(null);
                  setIsAddingSessionDate(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Content */}
            {(() => {
              const cfg = isAddingSessionDate ? newSessionConfig : editingSessionConfig!;
              const updateCfg = (fields: Partial<typeof cfg>) => {
                if (isAddingSessionDate) {
                  setNewSessionConfig(prev => ({ ...prev, ...fields }));
                } else {
                  setEditingSessionConfig(prev => prev ? ({ ...prev, ...fields }) : null);
                }
              };

              return (
                <div className="space-y-4">
                  {/* Date Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      날짜 (Date)
                    </label>
                    <input
                      type="date"
                      value={cfg.date}
                      onChange={e => updateCfg({ date: e.target.value })}
                      onClick={e => (e.target as any).showPicker && (e.target as any).showPicker()}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-slate-50 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Toggles for Worship, Assembly, Woorl */}
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-bold text-slate-700">
                      모임별 진행 여부 설정 (hasWorship, hasAssembly, hasWoorl)
                    </label>

                    {/* 예배 (hasWorship) */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">⛪ 예배 (hasWorship)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateCfg({ hasWorship: !cfg.hasWorship })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          cfg.hasWorship
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-rose-100 text-rose-700 border border-rose-300'
                        }`}
                      >
                        {cfg.hasWorship ? '진행 (TRUE)' : '취소 (FALSE)'}
                      </button>
                    </div>

                    {/* 집회 (hasAssembly) */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">📢 집회 (hasAssembly)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateCfg({ hasAssembly: !cfg.hasAssembly })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          cfg.hasAssembly
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-rose-100 text-rose-700 border border-rose-300'
                        }`}
                      >
                        {cfg.hasAssembly ? '진행 (TRUE)' : '취소 (FALSE)'}
                      </button>
                    </div>

                    {/* 울모임 (hasWoorl) */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">👥 울모임 (hasWoorl)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateCfg({ hasWoorl: !cfg.hasWoorl })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          cfg.hasWoorl
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-rose-100 text-rose-700 border border-rose-300'
                        }`}
                      >
                        {cfg.hasWoorl ? '진행 (TRUE)' : '취소 (FALSE)'}
                      </button>
                    </div>
                  </div>

                  {/* Ministry Event (사역/행사/취소 사유) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      행사 명칭 / 취소 사유 (<code className="text-indigo-600">ministryEvent</code>)
                    </label>
                    <input
                      type="text"
                      placeholder="예: 설연휴, 봄 수련회, 울 미편성 등"
                      value={cfg.ministryEvent || ''}
                      onChange={e => updateCfg({ ministryEvent: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />

                    {/* Preset Event Chips */}
                    <div className="mt-2 space-y-1">
                      <span className="text-[11px] font-medium text-slate-400">자주 쓰는 명칭 빠른 선택:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {['설연휴', '추석연휴', '봄 수련회', '청년대주일', '울 미편성', '전교인수련회', '부활절', '성탄절', '바로울'].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => updateCfg({ ministryEvent: preset })}
                            className="px-2 py-1 text-xs bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded border border-slate-200 transition-colors cursor-pointer"
                          >
                            + {preset}
                          </button>
                        ))}
                        {cfg.ministryEvent && (
                          <button
                            type="button"
                            onClick={() => updateCfg({ ministryEvent: '' })}
                            className="px-2 py-1 text-xs bg-rose-50 text-rose-600 rounded border border-rose-200 hover:bg-rose-100 cursor-pointer"
                          >
                            지우기
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Manual Assembly Count */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      현장 계수인원 (선택 사항)
                    </label>
                    <input
                      type="number"
                      placeholder="예: 50"
                      value={cfg.manualAssemblyCount || ''}
                      onChange={e => updateCfg({ manualAssemblyCount: e.target.value.trim() === "" ? undefined : (parseInt(e.target.value) || undefined) })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSessionConfig(null);
                        setIsAddingSessionDate(false);
                      }}
                      className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveSessionConfig(cfg)}
                      className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                    >
                      <Save size={16} className="mr-1.5" /> 저장하기
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Google Spreadsheet 데이터베이스 연결</h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-bold text-blue-800 flex items-center mb-2 text-sm md:text-base">
                <HelpCircle size={18} className="mr-2"/>
                "Failed to fetch" 오류가 발생하나요?
              </h4>
              <ul className="list-disc list-inside text-xs md:text-sm text-blue-700 space-y-1">
                <li>배포 시 <strong>'액세스 권한 승인'</strong>을 <strong>'모든 사용자'</strong>로 설정했는지 꼭 확인하세요.</li>
                <li>'본인'이나 'Google 계정 사용자'로 설정하면 연결되지 않습니다.</li>
                <li>스크립트를 수정했다면 <strong>[새 배포]</strong>를 눌러 새 버전을 생성해야 적용됩니다.</li>
                <li>스프레드시트에 <strong>Members</strong>, <strong>SessionConfig</strong>, <strong>Attendance</strong>, <strong>Groups</strong> 시트가 존재해야 합니다.</li>
              </ul>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
              <h4 className="font-bold text-slate-700 mb-2 text-sm md:text-base">1단계: 스크립트 복사 및 배포 (필수 업데이트)</h4>
              <p className="text-xs md:text-sm text-slate-600 mb-2">
                 <strong>[중요]</strong> '울장' 비밀번호 정책 적용을 위해 아래 코드를 <strong>반드시 새로 복사하여 배포</strong>해주세요.
              </p>
              <div className="relative group">
                <pre className="bg-slate-800 text-slate-200 p-4 rounded-lg text-[10px] md:text-xs overflow-x-auto h-48 custom-scrollbar font-mono">
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
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs md:text-sm text-yellow-800">
                <strong>안내:</strong> 말씀하신 데이터베이스 시트 ID(<code>1LoEMB...</code>)가 이미 코드에 적용되어 있습니다. 바로 복사해서 사용하세요.
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
               <h4 className="font-bold text-slate-700 mb-2 text-sm md:text-base">2단계: URL 연결</h4>
               <div className="flex flex-col md:flex-row gap-2">
                 <input 
                   type="text" 
                   value={scriptUrl}
                   onChange={(e) => setLocalScriptUrl(e.target.value)}
                   placeholder="https://script.google.com/macros/s/......./exec"
                   className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm w-full"
                 />
                 <button 
                   onClick={handleSaveUrl}
                   disabled={connectionStatus === 'testing'}
                   className={`px-4 py-2 rounded-lg text-white font-medium flex items-center justify-center ${
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

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-fade-in duration-300">
          <div className={`px-5 py-3 rounded-xl shadow-lg flex items-center space-x-3 text-white font-medium ${
            toast.type === 'success' ? 'bg-emerald-600' :
            toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-800'
          }`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataManagement;