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

      return {
        ...stat,
        worshipCount: worshipCanceled ? null : stat.worshipCount,
        gatheringCount: gatheringCanceled ? null : Math.max(stat.gatheringCount, mCount),
        woolCount: woolCanceled ? null : stat.woolCount,
        isManualCount: mCount > stat.gatheringCount && !gatheringCanceled
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
    <div className="space-y-6 md:space-y-8">
      <header className="mb-4 md:mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">대시보드</h2>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">2026년 전체 출석 통계 현황입니다.</p>
      </header>

      {/* Weekly Trend Chart */}
      <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 md:mb-6">주별 출석 추이 (전체)</h3>
        <div className="h-64 md:h-80 w-full mb-6 md:mb-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyStats} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorWorship" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorGathering" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorWool" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                tickFormatter={(val) => val.substring(5)} 
                stroke="currentColor"
                className="text-slate-400 dark:text-slate-600"
                fontSize={10}
                tick={{fontSize: 10}}
              />
              <YAxis stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={10} tick={{fontSize: 10}} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200/60 dark:text-slate-800/60" />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
              />
              <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
              <Area type="monotone" dataKey="worshipCount" name="예배" stroke="#3b82f6" fillOpacity={1} fill="url(#colorWorship)" connectNulls={true} />
              <Area type="monotone" dataKey="gatheringCount" name="집회" stroke="#6366f1" fillOpacity={1} fill="url(#colorGathering)" connectNulls={true} />
              <Area type="monotone" dataKey="woolCount" name="울모임" stroke="#10b981" fillOpacity={1} fill="url(#colorWool)" connectNulls={true} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Stats Table */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
          <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-4">주별 상세 데이터</h4>
          <div className="max-h-[calc(100vh-250px)] lg:max-h-[calc(100vh-280px)] overflow-auto custom-scrollbar border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-xs md:text-sm text-center text-slate-600 dark:text-slate-400 border-collapse">
              <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
                <tr>
                  <th scope="col" className="px-2 py-3 border border-slate-200 dark:border-slate-700 sticky top-0 left-0 bg-slate-50 dark:bg-slate-800 z-40 w-[65px] min-w-[65px] max-w-[65px] md:w-[90px] md:min-w-[90px] md:max-w-[90px] font-semibold text-slate-700 dark:text-slate-300">울</th>
                  <th scope="col" className="px-2 py-3 border border-slate-200 dark:border-slate-700 sticky top-0 left-[65px] md:left-[90px] bg-slate-50 dark:bg-slate-800 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px] font-semibold text-slate-700 dark:text-slate-300">구분</th>
                  {weeklyStats.map(stat => (
                    <th key={stat.date} scope="col" className="px-2 py-3 border border-slate-200 dark:border-slate-700 min-w-[55px] md:min-w-[75px] font-semibold text-slate-600 dark:text-slate-400 sticky top-0 bg-slate-50 dark:bg-slate-800 z-30">
                      <span>{stat.date.substring(5)}</span>
                    </th>
                  ))}
                </tr>

                {/* Overall Ministry Event Row */}
                <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 normal-case">
                  <td className="px-2 py-2.5 font-bold text-indigo-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 sticky left-0 bg-[#f0f4ff] dark:bg-indigo-950/40 z-40 w-[65px] min-w-[65px] max-w-[65px] md:w-[90px] md:min-w-[90px] md:max-w-[90px] text-center">사역</td>
                  <td className="px-2 py-2.5 font-bold text-indigo-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] bg-[#f0f4ff] dark:bg-indigo-950/40 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px] text-center">이벤트</td>
                  {weeklyStats.map(stat => (
                    <td key={stat.date} className="px-2 py-2.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs text-indigo-600 dark:text-indigo-400 font-bold bg-[#f5f8ff] dark:bg-indigo-950/20 whitespace-normal break-keep align-middle">
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
                    return (
                      <td key={stat.date} className={`px-2 py-2 border border-slate-200 dark:border-slate-700 font-medium ${canceled ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300 bg-[#f8fafc] dark:bg-slate-900/40'}`}>
                        {canceled ? '-' : stat.worshipCount}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 normal-case">
                  <td className="px-2 py-2 font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] bg-[#f5f3ff] dark:bg-indigo-950/30 z-40 w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]">집회</td>
                  {weeklyStats.map(stat => {
                    const canceled = isMeetingCanceled(stat.date, AttendanceType.Gathering);
                    return (
                      <td key={stat.date} className={`px-2 py-2 border border-slate-200 dark:border-slate-700 font-medium ${canceled ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300 bg-[#f8fafc] dark:bg-slate-900/40'}`}>
                        {canceled ? '-' : (
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
                    return (
                      <td key={stat.date} className={`px-2 py-2 border border-slate-200 dark:border-slate-700 font-medium ${canceled ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300 bg-[#f8fafc] dark:bg-slate-900/40'}`}>
                        {canceled ? '-' : stat.woolCount}
                      </td>
                    );
                  })}
                </tr>
              </thead>
              <tbody>

              {/* Individual Group Stats Rows */}
              {weeklyGroupStats.map((group, groupIdx) => (
                <React.Fragment key={group.groupName}>
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td rowSpan={3} className={`px-2 py-2 font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 sticky left-0 z-10 whitespace-normal break-all align-middle text-[10px] md:text-sm ${groupIdx % 2 === 0 ? 'bg-[#fafafa] dark:bg-slate-900' : 'bg-[#f4f4f4] dark:bg-slate-900/60'} w-[65px] min-w-[65px] max-w-[65px] md:w-[90px] md:min-w-[90px] md:max-w-[90px]`}>
                      {group.groupName}
                    </td>
                    <td className={`px-2 py-1.5 text-blue-600 dark:text-blue-400 font-bold border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] z-10 text-[10px] md:text-xs ${groupIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#fafafa] dark:bg-slate-900/60'} w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]`}>예배</td>
                    {group.weeklyData.map(stat => {
                      const canceled = isMeetingCanceled(stat.date, AttendanceType.Worship);
                      return (
                        <td key={stat.date} className={`px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs ${canceled ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300'}`}>
                          {canceled ? '-' : stat.worshipCount}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className={`px-2 py-1.5 text-indigo-600 dark:text-indigo-400 font-bold border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] z-10 text-[10px] md:text-xs ${groupIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#fafafa] dark:bg-slate-900/60'} w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]`}>집회</td>
                    {group.weeklyData.map(stat => {
                      const canceled = isMeetingCanceled(stat.date, AttendanceType.Gathering);
                      return (
                        <td key={stat.date} className={`px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs ${canceled ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300'}`}>
                          {canceled ? '-' : stat.gatheringCount}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className={`px-2 py-1.5 text-emerald-600 dark:text-emerald-400 font-bold border border-slate-200 dark:border-slate-700 sticky left-[65px] md:left-[90px] z-10 text-[10px] md:text-xs ${groupIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#fafafa] dark:bg-slate-900/60'} w-[55px] min-w-[55px] max-w-[55px] md:w-[70px] md:min-w-[70px] md:max-w-[70px]`}>울모임</td>
                    {group.weeklyData.map(stat => {
                      const canceled = isMeetingCanceled(stat.date, AttendanceType.Wool);
                      return (
                        <td key={stat.date} className={`px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs ${canceled ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300'}`}>
                          {canceled ? '-' : stat.woolCount}
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
      <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 md:mb-6">월별 평균 출석 현황</h3>
        <div className="h-64 md:h-80 w-full mb-6 md:mb-8">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyStats} margin={{ top: 20, right: 0, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200/60 dark:text-slate-800/60" />
              <XAxis dataKey="month" stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={10} interval={0} />
              <YAxis stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={10} />
              <Tooltip 
                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
              <Bar dataKey="worshipAverage" name="예배" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gatheringAverage" name="집회" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="woolAverage" name="울모임" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Monthly Stats Table */}
        <div className="overflow-x-auto custom-scrollbar border-t border-slate-100 dark:border-slate-800 pt-6">
          <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-4">월별 상세 데이터 (평균)</h4>
          <table className="w-full text-xs md:text-sm text-center text-slate-500 dark:text-slate-400 border-collapse">
            <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800/80">
              <tr>
                <th scope="col" className="px-2 md:px-4 py-2 border border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800 z-20 min-w-[60px] md:min-w-[80px]">구분</th>
                {monthlyStats.map(stat => (
                  <th key={stat.month} scope="col" className="px-1 md:px-2 py-2 border border-slate-200 dark:border-slate-700 min-w-[40px] md:min-w-[50px]">
                    {stat.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <td className="px-2 md:px-4 py-2 font-bold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 whitespace-nowrap">예배</td>
                {monthlyStats.map(stat => (
                  <td key={stat.month} className="px-1 md:px-2 py-2 border border-slate-200 dark:border-slate-700">{Math.ceil(stat.worshipAverage)}</td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <td className="px-2 md:px-4 py-2 font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 whitespace-nowrap">집회</td>
                {monthlyStats.map(stat => (
                  <td key={stat.month} className="px-1 md:px-2 py-2 border border-slate-200 dark:border-slate-700">{Math.ceil(stat.gatheringAverage)}</td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <td className="px-2 md:px-4 py-2 font-bold text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 whitespace-nowrap">울모임</td>
                {monthlyStats.map(stat => (
                  <td key={stat.month} className="px-1 md:px-2 py-2 border border-slate-200 dark:border-slate-700">{Math.ceil(stat.woolAverage)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Comparison Chart */}
      <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 md:mb-6">소그룹별 누적 참여 현황</h3>
        <div className="h-64 md:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groupStats} margin={{ top: 20, right: 0, left: -20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200/60 dark:text-slate-800/60" />
              <XAxis 
                dataKey="groupName" 
                stroke="currentColor" 
                className="text-slate-400 dark:text-slate-600"
                fontSize={10} 
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="currentColor" className="text-slate-400 dark:text-slate-600" fontSize={10} />
              <Tooltip 
                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
              <Bar dataKey="totalWorship" name="예배" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalGathering" name="집회" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalWool" name="울모임" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;