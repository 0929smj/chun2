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
}

export const fetchSheetData = async (): Promise<SheetDataResponse> => {
  const url = getScriptUrl();
  if (!url) throw new Error('URL_NOT_SET');
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch sheet data:', error);
    throw error;
  }
};

export const sendAction = async (action: string, payload: any) => {
  const url = getScriptUrl();
  if (!url) return;

  // Google Apps Script requires text/plain to avoid CORS preflight issues for simple POSTs
  // or specific handling. We use no-cors or standard fetch depending on GAS setup.
  // Here we assume standard fetch.
  
  try {
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
  } catch (error) {
    console.error(`Failed to send action ${action}:`, error);
    // Note: GAS executions might succeed even if CORS throws locally in some strict browser configs
    // without proper GAS headers. Optimistic UI update is recommended.
  }
};
