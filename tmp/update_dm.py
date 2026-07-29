import sys

with open('components/DataManagement.tsx', 'r') as f:
    text = f.read()

# Update version labels
text = text.replace('v5.2 - 계수인원 0 생성 버그 완전 수정판', 'v5.3 - 계수인원 0 생성 방지 완전판')
text = text.replace('v5.2', 'v5.3')

# 1. Update getSessionConfigForDate
old_gsc = """  const getSessionConfigForDate = (date: string) => {
    const wStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Worship);
    const gStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Gathering);
    const lStatus = meetingStatus.find(s => s.date === date && s.type === AttendanceType.Wool);
    const anyStatus = wStatus || gStatus || lStatus;

    return {
      date,
      hasWorship: wStatus ? !wStatus.isCanceled : true,
      hasAssembly: gStatus ? !gStatus.isCanceled : true,
      hasWoorl: lStatus ? !lStatus.isCanceled : true,
      ministryEvent: anyStatus?.event || '',
      manualAssemblyCount: wStatus?.manualAssemblyCount !== undefined && wStatus?.manualAssemblyCount !== null ? wStatus.manualAssemblyCount : undefined
    };
  };"""

new_gsc = """  const getSessionConfigForDate = (date: string) => {
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
  };"""

if old_gsc in text:
    text = text.replace(old_gsc, new_gsc)
    print("Replaced getSessionConfigForDate")
else:
    print("Warning: old_gsc not found")

# 2. Update handleQuickToggleSession
old_hqts = """  const handleQuickToggleSession = async (date: string, key: 'hasWorship' | 'hasAssembly' | 'hasWoorl', currentVal: boolean) => {
    const current = getSessionConfigForDate(date);
    const updated = {
      ...current,
      [key]: !currentVal
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
        manualAssemblyCount: updated.manualAssemblyCount
      });
      refreshData();
    }
    showToast(`${date} 모임 설정이 업데이트되었습니다.`, 'success');
  };"""

new_hqts = """  const handleQuickToggleSession = async (date: string, key: 'hasWorship' | 'hasAssembly' | 'hasWoorl', currentVal: boolean) => {
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
  };"""

if old_hqts in text:
    text = text.replace(old_hqts, new_hqts)
    print("Replaced handleQuickToggleSession")
else:
    print("Warning: old_hqts not found")

# 3. Update handleSaveSessionConfig
old_hssc = """  const handleSaveSessionConfig = async (config: { date: string; hasWorship: boolean; hasAssembly: boolean; hasWoorl: boolean; ministryEvent: string; manualAssemblyCount?: number }) => {
    if (!config.date) {
      showToast('날짜를 지정해 주세요.', 'error');
      return;
    }
    if (onUpdateMeetingStatus) {
      onUpdateMeetingStatus(config.date, config);
    } else {
      await sendAction('UPDATE_SESSION_CONFIG', {
        date: config.date,
        hasWorship: config.hasWorship,
        hasAssembly: config.hasAssembly,
        hasWoorl: config.hasWoorl,
        ministryEvent: config.ministryEvent,
        manualAssemblyCount: config.manualAssemblyCount
      });
      refreshData();
    }
    showToast(`${config.date} 모임 및 행사 설정이 저장되었습니다.`, 'success');
    setEditingSessionConfig(null);
    setIsAddingSessionDate(false);
  };"""

new_hssc = """  const handleSaveSessionConfig = async (config: { date: string; hasWorship: boolean; hasAssembly: boolean; hasWoorl: boolean; ministryEvent: string; manualAssemblyCount?: number }) => {
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
  };"""

if old_hssc in text:
    text = text.replace(old_hssc, new_hssc)
    print("Replaced handleSaveSessionConfig")
else:
    print("Warning: old_hssc not found")

# 4. Update handleUpdateManualAssemblyCount
old_humac = """  const handleUpdateManualAssemblyCount = async () => {
    if (!selectedDate) return;
    setIsUpdatingManualCount(true);
    const parsedCnt = manualCount.trim() === '' ? undefined : parseInt(manualCount, 10);
    try {
      if (onUpdateMeetingStatus) {
        const currentCfg = getSessionConfigForDate(selectedDate);
        onUpdateMeetingStatus(selectedDate, {
          ...currentCfg,
          manualAssemblyCount: typeof parsedCnt === 'number' ? parsedCnt : undefined
        });
      } else {
        await sendAction(UPDATE_SESSION_CONFIG, {
          date: selectedDate,
          manualAssemblyCount: parsedCnt
        });
        refreshData();
      }
      showToast("인원 계수가 성공적으로 저장되었습니다.", "success");
    } catch (e) {
      showToast("인원 계수 저장 중 오류가 발생했습니다.", "error");
    } finally {
      setIsUpdatingManualCount(false);
    }
  };"""

new_humac = """  const handleUpdateManualAssemblyCount = async () => {
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
  };"""

if old_humac in text:
    text = text.replace(old_humac, new_humac)
    print("Replaced handleUpdateManualAssemblyCount")
else:
    print("Warning: old_humac not found")

# 5. Update GAS snippet mCount in getInitialData
text = text.replace(
    "const mCount = (rawCnt !== null && rawCnt !== undefined && String(rawCnt).trim() !== '' && !isNaN(Number(rawCnt))) ? Number(rawCnt) : undefined;",
    "const numCnt = Number(rawCnt); const mCount = (rawCnt !== null && rawCnt !== undefined && String(rawCnt).trim() !== '' && !isNaN(numCnt) && numCnt > 0) ? numCnt : undefined;"
)

# 6. Update GAS snippet count in updateSessionConfig
old_cnt_logic = """    if (payload.count !== undefined || payload.manualAssemblyCount !== undefined) {
      const rawCnt = payload.manualAssemblyCount !== undefined ? payload.manualAssemblyCount : payload.count;
      const cnt = (rawCnt !== null && rawCnt !== undefined && rawCnt !== "") ? rawCnt : "";
      setValInRow(foundRowIndex, ["manualassemblycount", "계수인원"], cnt);
    }"""

new_cnt_logic = """    if (payload.count !== undefined || payload.manualAssemblyCount !== undefined) {
      const rawCnt = payload.manualAssemblyCount !== undefined ? payload.manualAssemblyCount : payload.count;
      const numCnt = Number(rawCnt);
      const cnt = (rawCnt !== null && rawCnt !== undefined && String(rawCnt).trim() !== '' && !isNaN(numCnt) && numCnt > 0) ? numCnt : "";
      setValInRow(foundRowIndex, ["manualassemblycount", "계수인원"], cnt);
    }"""

if old_cnt_logic in text:
    text = text.replace(old_cnt_logic, new_cnt_logic)
    print("Replaced old_cnt_logic")

old_new_row_cnt = """    const rawCnt = payload.manualAssemblyCount !== undefined ? payload.manualAssemblyCount : payload.count;
    const cnt = (rawCnt !== null && rawCnt !== undefined && rawCnt !== "") ? rawCnt : "";
    setValInRow(targetRow, ["manualassemblycount", "계수인원"], cnt);"""

new_new_row_cnt = """    const rawCnt = payload.manualAssemblyCount !== undefined ? payload.manualAssemblyCount : payload.count;
    const numCnt = Number(rawCnt);
    const cnt = (rawCnt !== null && rawCnt !== undefined && String(rawCnt).trim() !== '' && !isNaN(numCnt) && numCnt > 0) ? numCnt : "";
    setValInRow(targetRow, ["manualassemblycount", "계수인원"], cnt);"""

if old_new_row_cnt in text:
    text = text.replace(old_new_row_cnt, new_new_row_cnt)
    print("Replaced old_new_row_cnt")

with open('components/DataManagement.tsx', 'w') as f:
    f.write(text)

print("Saved components/DataManagement.tsx")
