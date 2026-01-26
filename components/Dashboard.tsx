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
import { AttendanceRecord, Member, AttendanceType } from '../types';
import { getWeeklyStats, getGroupStats } from '../services/dataService';
import { SUNDAYS_2024 } from '../services/mockData';

interface DashboardProps {
  members: Member[];
  records: AttendanceRecord[];
}

const Dashboard: React.FC<DashboardProps> = ({ members, records }) => {
  const weeklyStats = useMemo(() => getWeeklyStats(records, SUNDAYS_2024), [records]);
  const groupStats = useMemo(() => getGroupStats(members, records), [members, records]);

  // Calculate totals
  const totalWorship = records.filter(r => r.types.includes(AttendanceType.Worship)).length;
  const totalGathering = records.filter(r => r.types.includes(AttendanceType.Gathering)).length;
  const totalWool = records.filter(r => r.types.includes(AttendanceType.Wool)).length;

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800">대시보드</h2>
        <p className="text-slate-500">2024년 전체 출석 통계 현황입니다.</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500">
          <h3 className="text-sm font-medium text-slate-500">누적 예배 출석</h3>
          <p className="text-3xl font-bold text-slate-800 mt-2">{totalWorship.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-indigo-500">
          <h3 className="text-sm font-medium text-slate-500">누적 집회 출석</h3>
          <p className="text-3xl font-bold text-slate-800 mt-2">{totalGathering.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">
          <h3 className="text-sm font-medium text-slate-500">누적 울모임 출석</h3>
          <p className="text-3xl font-bold text-slate-800 mt-2">{totalWool.toLocaleString()}</p>
        </div>
      </div>

      {/* Weekly Trend Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-6">주별 출석 추이 (전체)</h3>
        <div className="h-80 w-full mb-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyStats} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                stroke="#94a3b8"
                fontSize={12}
              />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
              />
              <Legend />
              <Area type="monotone" dataKey="worshipCount" name="예배" stroke="#3b82f6" fillOpacity={1} fill="url(#colorWorship)" />
              <Area type="monotone" dataKey="gatheringCount" name="집회" stroke="#6366f1" fillOpacity={1} fill="url(#colorGathering)" />
              <Area type="monotone" dataKey="woolCount" name="울모임" stroke="#10b981" fillOpacity={1} fill="url(#colorWool)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Stats Table */}
        <div className="overflow-x-auto custom-scrollbar border-t border-slate-100 pt-6">
          <h4 className="text-sm font-bold text-slate-600 mb-4">주별 상세 데이터</h4>
          <table className="w-full text-sm text-center text-slate-500">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2 border rounded-tl-lg">날짜</th>
                {weeklyStats.map(stat => (
                  <th key={stat.date} scope="col" className="px-2 py-2 border min-w-[60px]">
                    {stat.date.substring(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white border-b">
                <td className="px-4 py-2 font-bold text-blue-600 border bg-slate-50">예배</td>
                {weeklyStats.map(stat => (
                  <td key={stat.date} className="px-2 py-2 border">{stat.worshipCount}</td>
                ))}
              </tr>
              <tr className="bg-white border-b">
                <td className="px-4 py-2 font-bold text-indigo-600 border bg-slate-50">집회</td>
                {weeklyStats.map(stat => (
                  <td key={stat.date} className="px-2 py-2 border">{stat.gatheringCount}</td>
                ))}
              </tr>
              <tr className="bg-white border-b">
                <td className="px-4 py-2 font-bold text-emerald-600 border bg-slate-50">울모임</td>
                {weeklyStats.map(stat => (
                  <td key={stat.date} className="px-2 py-2 border">{stat.woolCount}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Comparison Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-6">소그룹별 누적 참여 현황</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groupStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="groupName" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
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