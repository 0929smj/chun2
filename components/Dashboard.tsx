import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { AttendanceRecord, Member, AttendanceType, MeetingStatus, MonthlyStats, WeeklyStats } from '../types';
import { getWeeklyStats, getGroupStats, getMonthlyStats, getWeeklyGroupStats } from '../services/dataService';
import { SUNDAYS_2026 } from '../services/mockData';

interface DashboardProps {
  members: Member[];
  records: AttendanceRecord[];
  meetingStatus?: MeetingStatus[]; // Optional prop to avoid breaking if not passed yet
}

const Dashboard: React.FC<DashboardProps> = ({ members, records, meetingStatus = [] }) => {
  const theadRef = React.useRef<HTMLTableSectionElement>(null);
  const [headerHeight, setHeaderHeight] = React.useState(180);

  React.useEffect(() => {
    const updateHeight = () => {
      if (theadRef.current) {
        setHeaderHeight(theadRef.current.offsetHeight);
      }
    };
    
    updateHeight();
    
    const timer = setTimeout(updateHeight, 150);
    
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && theadRef.current) {
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(theadRef.current);
    } else {
      window.addEventListener('resize', updateHeight);
    }
    
    return () => {
      clearTimeout(timer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateHeight);
      }
    };
  }, []);

  // Calculate weekly, monthly, and group stats
  const weeklyStats = useMemo(() => {
    const baseStats = getWeeklyStats(records, SUNDAYS_2026);
    return baseStats.map(stat => {
      const statusWorship = meetingStatus.find(s => s.date === stat.date && s.type === AttendanceType.Worship);
      const statusGathering = meetingStatus.find(s => s.date === stat.date && s.type === AttendanceType.Gathering);
      const statusWool = meetingStatus.find(s => s.date === stat.date && s.type === AttendanceType.Wool);
      
      const mCount = statusWorship?.manualAssemblyCount || 0;
      const worshipCanceled = statusWorship?.isCanceled;
      const gatheringCanceled = statusGathering?.isCanceled;
      const woolCanceled = statusWool?.isCanceled;

      // Check if there is actual data entered for this date
      const hasWorshipData = records.some(r => r.date === stat.date && r.types.includes(AttendanceType.Worship)) || mCount > 0;
      const hasGatheringData = records.some(r => r.date === stat.date && r.types.includes(AttendanceType.Gathering)) || (statusGathering?.manualAssemblyCount || 0) > 0;
      const hasWoolData = records.some(r => r.date === stat.date && r.types.includes(AttendanceType.Wool));

      return {
        ...stat,
        worshipCount: worshipCanceled || !hasWorshipData ? null : stat.worshipCount,
        gatheringCount: gatheringCanceled || !hasGatheringData ? null : Math.max(stat.gatheringCount, mCount),
        woolCount: woolCanceled || !hasWoolData ? null : stat.woolCount,
        isManualCount: mCount > stat.gatheringCount && !gatheringCanceled && hasWorshipData
      };
    });
  }, [records, meetingStatus]);

  const weeklyGroupStats = useMemo(() => {
    return getWeeklyGroupStats(members, records, SUNDAYS_2026);
  }, [members, records]);

  const monthlyStats = useMemo(() => {
    // We want monthly stats to also reflect the max gathering count
    // So we use our updated weeklyStats to aggregate
    const stats: MonthlyStats[] = [];
    for (let i = 1; i <= 12; i++) {
      const monthName = `${i}월`;
      const weeksInMonth = weeklyStats.filter(stat => parseInt(stat.date.substring(5, 7), 10) === i);
      
      if (weeksInMonth.length === 0) {
        stats.push({ month: monthName, worshipAverage: 0, gatheringAverage: 0, woolAverage: 0 });
        continue;
      }

      const worshipWeeks = weeksInMonth.filter(s => s.worshipCount !== null);
      const avgWorship = worshipWeeks.length > 0 
        ? worshipWeeks.reduce((sum, s) => sum + (s.worshipCount || 0), 0) / worshipWeeks.length 
        : 0;

      const gatheringWeeks = weeksInMonth.filter(s => s.gatheringCount !== null);
      const avgGathering = gatheringWeeks.length > 0 
        ? gatheringWeeks.reduce((sum, s) => sum + (s.gatheringCount || 0), 0) / gatheringWeeks.length 
        : 0;

      const woolWeeks = weeksInMonth.filter(s => s.woolCount !== null);
      const avgWool = woolWeeks.length > 0 
        ? woolWeeks.reduce((sum, s) => sum + (s.woolCount || 0), 0) / woolWeeks.length 
        : 0;

      stats.push({
        month: monthName,
        worshipAverage: parseFloat(avgWorship.toFixed(1)),
        gatheringAverage: parseFloat(avgGathering.toFixed(1)),
        woolAverage: parseFloat(avgWool.toFixed(1))
      });
    }
    return stats;
  }, [weeklyStats]);

  const groupStats = useMemo(() => getGroupStats(members, records), [members, records]);

  const getEventName = (date: string) => {
    return meetingStatus.find(s => s.date === date)?.event || '';
  };

  const isMeetingCanceled = (date: string, type: AttendanceType) => {
    return meetingStatus.some(s => s.date === date && s.type === type && s.isCanceled);
  };

  return (
    <div className="space-y-4">
      <header className="border-b border-slate-100 dark:border-slate-850 pb-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full inline-block"></span>
            출석 통계 대시보드
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">2026년 소그룹 전체 출석 추이 및 누적 참여 통계</p>
        </div>
      </header>

      {/* Weekly Trend Chart */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-[0_1px_4px_rgba(0,0,0,0.015)]">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-1.5">
          주별 출석 추이 (전체)
        </h3>
        <div className="h-52 sm:h-64 w-full mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyStats} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorWorship" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorGathering" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorWool" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                tickFormatter={(val) => val.substring(5)} 
                stroke="currentColor"
                className="text-slate-400 dark:text-slate-600"
                fontSize={9}
                tick={{fontSize: 9}}
              />
              <YAxis stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={9} tick={{fontSize: 9}} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200/50 dark:text-slate-800/50" />
              <Tooltip 
                contentStyle={{ borderRadius: '6px', border: 'none', boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.05)', fontSize: '11px' }}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
              />
              <Legend wrapperStyle={{fontSize: '11px', paddingTop: '5px'}} />
              <Area type="monotone" dataKey="worshipCount" name="예배" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorWorship)" connectNulls={true} />
              <Area type="monotone" dataKey="gatheringCount" name="집회" stroke="#6366f1" strokeWidth={1.5} fillOpacity={1} fill="url(#colorGathering)" connectNulls={true} />
              <Area type="monotone" dataKey="woolCount" name="울모임" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorWool)" connectNulls={true} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Stats Table */}
        <div className="border-t border-slate-100 dark:border-slate-800/60 pt-4">
          <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">주별 상세 데이터</h4>
          <div className="max-h-[500px] overflow-auto custom-scrollbar border border-slate-200/60 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 shadow-xs snap-both snap-mandatory scroll-pl-[120px] md:scroll-pl-[160px]">
            <table className="w-full text-xs md:text-sm text-center text-slate-600 dark:text-slate-400 border-collapse">
              <thead ref={theadRef} className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
                <tr>
                  <th scope="col" className="px-2 py-3 border border-slate-200 dark:border-slate-700 sticky top-0 left-0 bg-slate-50 dark:bg-slate-800 z-40 w-[65px] min-w-[65px] max-w-[65px] md:w-[90px] md:min-w-[90px] md:max-w-[90px] font-semibold text-slate-700 dark:text-slate-300">울</th>
                  <th scope="col" className="px-2 py-3 border border-slate-200 dark:border-slate-700 sticky top-0 left-[65px] md:left-[90px] bg-slate-50 dark:bg-slate-800 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px] font-semibold text-slate-700 dark:text-slate-300">구분</th>
                  {weeklyStats.map(stat => (
                    <th key={stat.date} scope="col" className="px-2 py-3 border border-slate-200 dark:border-slate-700 min-w-[55px] md:min-w-[75px] font-semibold text-slate-600 dark:text-slate-400 sticky top-0 bg-slate-50 dark:bg-slate-800 z-30 [scroll-snap-align:none_start]">
                      <span>{stat.date.substring(5)}</span>
                    </th>
                  ))}
                </tr>

                {/* Overall Ministry Event Row */}
                <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 normal-case">
                  <td className="px-2 py-2.5 font-bold text-indigo-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 sticky left-0 bg-[#f0f4ff] dark:bg-indigo-950/40 z-40 w-[65px] min-w-[65px] max-w-[65px] md:w-[90px] md:min-w-[90px] md:max-w-[90px] text-center">사역</td>
                  <td className="px-2 py-2.5 font-bold text-indigo-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] bg-[#f0f4ff] dark:bg-indigo-950/40 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px] text-center">이벤트</td>
                  {weeklyStats.map(stat => (
                    <td key={stat.date} className="px-2 py-2.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs text-indigo-600 dark:text-indigo-400 font-bold bg-[#f5f8ff] dark:bg-indigo-950/20 whitespace-normal break-keep align-middle [scroll-snap-align:none_start]">
                      {getEventName(stat.date)}
                    </td>
                  ))}
                </tr>

                {/* Total Stats Rows */}
                <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 normal-case">
                  <td rowSpan={3} className="px-2 py-2.5 font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-40 whitespace-nowrap align-middle w-[65px] min-w-[65px] max-w-[65px] md:w-[90px] md:min-w-[90px] md:max-w-[90px]">전체</td>
                  <td className="px-2 py-2 font-bold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] bg-[#eff6ff] dark:bg-blue-950/30 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]">예배</td>
                  {weeklyStats.map(stat => {
                    const canceled = isMeetingCanceled(stat.date, AttendanceType.Worship);
                    const isNull = stat.worshipCount === null;
                    return (
                      <td key={stat.date} className={`px-2 py-2 border border-slate-200 dark:border-slate-700 font-medium [scroll-snap-align:none_start] ${canceled || isNull ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300 bg-[#f8fafc] dark:bg-slate-900/40'}`}>
                        {canceled || isNull ? '-' : stat.worshipCount}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 normal-case">
                  <td className="px-2 py-2 font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] bg-[#f5f3ff] dark:bg-indigo-950/30 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]">집회</td>
                  {weeklyStats.map(stat => {
                    const canceled = isMeetingCanceled(stat.date, AttendanceType.Gathering);
                    const isNull = stat.gatheringCount === null;
                    return (
                      <td key={stat.date} className={`px-2 py-2 border border-slate-200 dark:border-slate-700 font-medium [scroll-snap-align:none_start] ${canceled || isNull ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300 bg-[#f8fafc] dark:bg-slate-900/40'}`}>
                        {canceled || isNull ? '-' : (
                          <>
                            {stat.gatheringCount}
                            {(stat as any).isManualCount && (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block italic leading-none mt-0.5">(계수)</span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-slate-50 dark:bg-slate-900/40 border-b-2 border-slate-200 dark:border-slate-700 normal-case">
                  <td className="px-2 py-2 font-bold text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] bg-[#f0fdf4] dark:bg-emerald-950/30 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]">울모임</td>
                  {weeklyStats.map(stat => {
                    const canceled = isMeetingCanceled(stat.date, AttendanceType.Wool);
                    const isNull = stat.woolCount === null;
                    return (
                      <td key={stat.date} className={`px-2 py-2 border border-slate-200 dark:border-slate-700 font-medium [scroll-snap-align:none_start] ${canceled || isNull ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300 bg-[#f8fafc] dark:bg-slate-900/40'}`}>
                        {canceled || isNull ? '-' : stat.woolCount}
                      </td>
                    );
                  })}
                </tr>
              </thead>
              <tbody>

              {/* Individual Group Stats Rows */}
              {weeklyGroupStats.map((group, groupIdx) => (
                <React.Fragment key={group.groupName}>
                  <tr 
                    className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors"
                    style={{ 
                      scrollSnapAlign: 'start none',
                      scrollMarginTop: `${headerHeight}px`
                    }}
                  >
                    <td rowSpan={3} className={`px-2 py-2 font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 sticky left-0 z-10 whitespace-normal break-all align-middle text-[10px] md:text-sm ${groupIdx % 2 === 0 ? 'bg-[#fafafa] dark:bg-slate-900' : 'bg-[#f4f4f4] dark:bg-slate-900/60'} w-[65px] min-w-[65px] max-w-[65px] md:w-[90px] md:min-w-[90px] md:max-w-[90px]`}>
                      {group.groupName}
                    </td>
                    <td className={`px-2 py-1.5 text-blue-600 dark:text-blue-400 font-bold border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] z-10 text-[10px] md:text-xs ${groupIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#fafafa] dark:bg-slate-900/60'} w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]`}>예배</td>
                    {group.weeklyData.map(stat => {
                      const canceled = isMeetingCanceled(stat.date, AttendanceType.Worship);
                      const overall = weeklyStats.find(ws => ws.date === stat.date);
                      const isNull = !overall || overall.worshipCount === null;
                      return (
                        <td key={stat.date} className={`px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs [scroll-snap-align:none_start] ${canceled || isNull ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300'}`}>
                          {canceled || isNull ? '-' : stat.worshipCount}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className={`px-2 py-1.5 text-indigo-600 dark:text-indigo-400 font-bold border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] z-10 text-[10px] md:text-xs ${groupIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#fafafa] dark:bg-slate-900/60'} w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]`}>집회</td>
                    {group.weeklyData.map(stat => {
                      const canceled = isMeetingCanceled(stat.date, AttendanceType.Gathering);
                      const overall = weeklyStats.find(ws => ws.date === stat.date);
                      const isNull = !overall || overall.gatheringCount === null;
                      return (
                        <td key={stat.date} className={`px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs [scroll-snap-align:none_start] ${canceled || isNull ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300'}`}>
                          {canceled || isNull ? '-' : stat.gatheringCount}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className={`px-2 py-1.5 text-emerald-600 dark:text-emerald-400 font-bold border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] z-10 text-[10px] md:text-xs ${groupIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#fafafa] dark:bg-slate-900/60'} w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]`}>울모임</td>
                    {group.weeklyData.map(stat => {
                      const canceled = isMeetingCanceled(stat.date, AttendanceType.Wool);
                      const overall = weeklyStats.find(ws => ws.date === stat.date);
                      const isNull = !overall || overall.woolCount === null;
                      return (
                        <td key={stat.date} className={`px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs [scroll-snap-align:none_start] ${canceled || isNull ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300'}`}>
                          {canceled || isNull ? '-' : stat.woolCount}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

      {/* Monthly Average Chart */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-[0_1px_4px_rgba(0,0,0,0.015)]">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">월별 평균 출석 현황</h3>
        <div className="h-52 sm:h-64 w-full mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyStats} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200/50 dark:text-slate-800/50" />
              <XAxis dataKey="month" stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={9} interval={0} />
              <YAxis stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={9} />
              <Tooltip 
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                contentStyle={{ borderRadius: '6px', border: 'none', boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.05)', fontSize: '11px' }}
              />
              <Legend wrapperStyle={{fontSize: '11px', paddingTop: '5px'}} />
              <Bar dataKey="worshipAverage" name="예배" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="gatheringAverage" name="집회" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="woolAverage" name="울모임" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Monthly Stats Table */}
        <div className="overflow-x-auto custom-scrollbar border-t border-slate-100 dark:border-slate-800/60 pt-4">
          <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">월별 상세 데이터 (평균)</h4>
          <table className="w-full text-xs text-center text-slate-500 dark:text-slate-400 border-collapse border border-slate-200/60 dark:border-slate-800 rounded-lg">
            <thead className="text-[10px] text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800/80">
              <tr>
                <th scope="col" className="px-1.5 py-1.5 border border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-800 z-20 min-w-[50px] font-semibold">구분</th>
                {monthlyStats.map(stat => (
                  <th key={stat.month} scope="col" className="px-1 py-1.5 border border-slate-200 dark:border-slate-800 font-semibold min-w-[35px]">
                    {stat.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <td className="px-1.5 py-1.5 font-bold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 whitespace-nowrap">예배</td>
                {monthlyStats.map(stat => (
                  <td key={stat.month} className="px-1 py-1.5 border border-slate-200 dark:border-slate-800">{Math.ceil(stat.worshipAverage)}</td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <td className="px-1.5 py-1.5 font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 whitespace-nowrap">집회</td>
                {monthlyStats.map(stat => (
                  <td key={stat.month} className="px-1 py-1.5 border border-slate-200 dark:border-slate-800">{Math.ceil(stat.gatheringAverage)}</td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <td className="px-1.5 py-1.5 font-bold text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 whitespace-nowrap">울모임</td>
                {monthlyStats.map(stat => (
                  <td key={stat.month} className="px-1 py-1.5 border border-slate-200 dark:border-slate-800">{Math.ceil(stat.woolAverage)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Comparison Chart */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-[0_1px_4px_rgba(0,0,0,0.015)]">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">소그룹별 누적 참여 현황</h3>
        <div className="h-52 sm:h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groupStats} margin={{ top: 10, right: 0, left: -25, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200/50 dark:text-slate-800/50" />
              <XAxis 
                dataKey="groupName" 
                stroke="currentColor" 
                className="text-slate-400 dark:text-slate-600"
                fontSize={9} 
                interval={0}
                angle={-30}
                textAnchor="end"
                height={40}
              />
              <YAxis stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={9} />
              <Tooltip 
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                contentStyle={{ borderRadius: '6px', border: 'none', boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.05)', fontSize: '11px' }}
              />
              <Legend wrapperStyle={{fontSize: '11px', paddingTop: '5px'}} />
              <Bar dataKey="totalWorship" name="예배" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="totalGathering" name="집회" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="totalWool" name="울모임" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;