import * as XLSX from 'xlsx';
import { Member, AttendanceRecord, PrayerRecord, AttendanceType, MeetingStatus } from '../types';

interface ExportOptions {
  startDate: string;
  endDate: string;
}

/**
 * Main function to trigger Excel download
 */
export const exportDataToExcel = (
  members: Member[],
  attendanceRecords: AttendanceRecord[],
  prayerRecords: PrayerRecord[],
  meetingStatus: MeetingStatus[],
  groups: string[],
  options: ExportOptions
) => {
  const wb = XLSX.utils.book_new();
  const { startDate, endDate } = options;

  // 1. Filter Records by Date Range
  const filteredAttendance = attendanceRecords.filter(r => r.date >= startDate && r.date <= endDate);
  const filteredPrayers = prayerRecords.filter(r => r.date >= startDate && r.date <= endDate);
  
  // 2. Identify all relevant dates (Sorted)
  const dateSet = new Set<string>();
  // Add dates from records
  filteredAttendance.forEach(r => dateSet.add(r.date));
  filteredPrayers.forEach(r => dateSet.add(r.date));
  // Add dates from status (crucial for showing canceled meetings even if no one attended)
  meetingStatus.filter(s => s.date >= startDate && s.date <= endDate).forEach(s => dateSet.add(s.date));
  
  const sortedDates = Array.from(dateSet).sort();
  
  // Header Format: MM/DD
  const dateHeaders = sortedDates.map(d => {
    // d is YYYY-MM-DD
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
    return d;
  });

  // --- Create Sheet per Group ---
  groups.forEach(group => {
    const groupMembers = members.filter(m => m.group === group).sort((a, b) => a.name.localeCompare(b.name));
    if (groupMembers.length === 0) return;

    const sheetData: any[][] = [];
    const merges: XLSX.Range[] = [];

    // Row 1: Group Name
    sheetData.push([group]); 
    
    // Row 2: Ministry Events (aligned with dates)
    const eventRow = ["", ""]; // Spacer for Name, Type columns
    sortedDates.forEach(date => {
       const event = meetingStatus.find(s => s.date === date)?.event || '';
       eventRow.push(event);
    });
    sheetData.push(eventRow);

    // Row 3: Headers
    sheetData.push(["이름", "구분", ...dateHeaders]);
    // Apply styling later if possible, but basic XLSX doesn't support extensive styling without Pro version.
    // We focus on layout.

    // Data Rows
    let currentRow = 3; // 0-based index, so Row 4 is index 3 in the array
    
    groupMembers.forEach(member => {
      // Each member has 3 rows: Worship, Gathering, Wool
      // Names are merged
      
      const rowW = [member.name, "예배"];
      const rowG = [member.name, "집회"]; // Name repeated for data, will be merged visually
      const rowL = [member.name, "울모임"];

      sortedDates.forEach(date => {
        // 1. Worship
        const wCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Worship && s.isCanceled);
        const wAttended = filteredAttendance.some(r => r.memberId === member.id && r.date === date && r.types.includes(AttendanceType.Worship));
        rowW.push(getStatusSymbol(wAttended, wCanceled));

        // 2. Gathering
        const gCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Gathering && s.isCanceled);
        const gAttended = filteredAttendance.some(r => r.memberId === member.id && r.date === date && r.types.includes(AttendanceType.Gathering));
        rowG.push(getStatusSymbol(gAttended, gCanceled));

        // 3. Wool
        const lCanceled = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Wool && s.isCanceled);
        const lAttended = filteredAttendance.some(r => r.memberId === member.id && r.date === date && r.types.includes(AttendanceType.Wool));
        rowL.push(getStatusSymbol(lAttended, lCanceled));
      });

      sheetData.push(rowW);
      sheetData.push(rowG);
      sheetData.push(rowL);

      // Merge Name Cell (Column 0, across 3 rows)
      // Range object: s=start, e=end. r=row, c=column (0-indexed)
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow + 2, c: 0 } });
      
      currentRow += 3;
    });

    // === SECTION 2: PRAYER REQUESTS ===

    // Spacer Rows
    sheetData.push([]);
    sheetData.push([]); // Extra spacer for visual separation
    
    // Section Title
    sheetData.push(["[기도제목 및 특이사항]"]);
    
    // Headers for Prayer Section
    // The user image shows dates mapped to columns C, D, E... same as attendance
    // Col A: 이름, Col B: 비고 (This maps to specialNotes/Memo)
    sheetData.push(["이름", "비고", ...dateHeaders]);

    groupMembers.forEach(member => {
      // Row: Name, Memo (SpecialNotes), Date1 Content, Date2 Content...
      const row = [member.name, member.specialNotes || ''];
      
      sortedDates.forEach(date => {
        const records = filteredPrayers.filter(p => p.memberId === member.id && p.date === date);
        // Combine multiple prayers or notes for the same day
        const content = records.map(p => {
            const c = p.content || '';
            const n = p.note ? `(특이사항: ${p.note})` : '';
            return c + (c && n ? '\n' : '') + n;
        }).filter(Boolean).join('\n');
        
        row.push(content);
      });
      
      sheetData.push(row);
    });

    // Create Sheet
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    
    // Apply Merges
    if (merges.length > 0) {
      ws['!merges'] = merges;
    }
    
    // Set Column Widths
    const cols = [
      { wch: 12 }, // Col A: Name (Wider)
      { wch: 8 },  // Col B: Type / Memo
    ];
    // Date columns - set to reasonable width for prayer text, though symbols are small
    dateHeaders.forEach(() => cols.push({ wch: 15 })); 
    ws['!cols'] = cols;

    // Append to Workbook (Sheet name limited to 31 chars)
    const safeSheetName = group.replace(/[\\/?*[\]]/g, '').substring(0, 30) || "Group";
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  });

  // Generate File
  const fileName = `소그룹_출석부_${startDate}_${endDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// Helper to determine cell symbol based on user requirements
// O = Attended
// X = Absent (Meeting held but not attended)
// - = Canceled (Meeting not held)
function getStatusSymbol(attended: boolean, canceled: boolean): string {
  if (attended) return 'O';
  if (canceled) return '-';
  return 'X';
}
