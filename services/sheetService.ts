import { Member, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus } from '../types';

const STORAGE_KEY = 'church_admin_script_url';

export const getScriptUrl = () => localStorage.getItem(STORAGE_KEY) || '';
export const setScriptUrl = (url: string) => localStorage.setItem(STORAGE_KEY, url);

interface SheetDataResponse {
  members: Member[];
  attendance: AttendanceRecord[];
  prayers: PrayerRecord[];
  meetingStatus: MeetingStatus[];
  status: 'success' | 'error';
  debug_sheets?: string[];
}

export const fetchSheetData = async (): Promise<SheetDataResponse> => {
  const url = getScriptUrl();
  if (!url) throw new Error('URL_NOT_SET');
  
  try {
    const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const response = await fetch(fetchUrl, {
      method: 'GET',
      credentials: 'omit', // Important: Skip cookies to avoid Google Auth issues on 'Anyone' scripts
    });
    
    if (!response.ok) {
      throw new Error(`서버 응답 오류 (Status: ${response.status})`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") === -1) {
      // If response is not JSON (likely HTML), it usually means a Google Login page redirection
      // due to incorrect deployment permissions (not set to "Anyone").
      const text = await response.text();
      console.error("Received non-JSON response:", text.substring(0, 500));
      throw new Error("올바르지 않은 응답 형식입니다. 배포 권한이 '모든 사용자'로 설정되었는지 확인하세요. (HTML 응답 감지됨)");
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('Failed to fetch sheet data:', error);
    // Preserve the specific error message if possible
    if (error.message && error.message.includes('Failed to fetch')) {
        throw new Error("서버에 접근할 수 없습니다. URL이 정확한지, 인터넷이 연결되어 있는지 확인하세요. (CORS 오류 가능성)");
    }
    throw error;
  }
};

export const sendAction = async (action: string, payload: any) => {
  const url = getScriptUrl();
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Opaque response
      credentials: 'omit',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ action, payload }),
    });
  } catch (error) {
    console.error(`Failed to send action ${action}:`, error);
  }
};