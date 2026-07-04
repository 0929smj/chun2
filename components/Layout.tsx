import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, BookOpen, Users, Menu, X, UserSearch, Network, Heart } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  isVisitationMode?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, isVisitationMode = false }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();
  const isOrgPage = location.pathname === '/org';

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: '통계 대시보드' },
    { to: '/attendance', icon: CalendarDays, label: '출석 현황' },
    { to: '/prayer', icon: BookOpen, label: '기도 제목' },
    { to: '/profile', icon: UserSearch, label: '개인별 현황' },
    { to: '/org', icon: Network, label: '조직도' },
    ...(isVisitationMode ? [{ to: '/visitation', icon: Heart, label: '심방 기록' }] : []),
    { to: '/manage', icon: Users, label: '데이터 관리' },
  ];

  return (
    <div className="flex h-screen bg-[#fafbfc] dark:bg-slate-950 overflow-hidden font-sans antialiased text-slate-800 dark:text-slate-100">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 w-full z-40 flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/85 px-4 py-2.5 shadow-xs">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white font-extrabold text-xs shadow-sm">
            소
          </div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">소그룹 출석부</h1>
        </div>
        <button 
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all cursor-pointer border border-slate-100 dark:border-slate-800/60"
        >
          {isSidebarOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto flex flex-col justify-between border-r border-slate-800 shadow-xl lg:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Sidebar Header */}
          <div className="p-6 border-b border-slate-800 hidden lg:block">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-indigo-900/20">
                소
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-white leading-tight">소그룹 출석부</h1>
                <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">Admin Dashboard</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 lg:hidden mt-16 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-extrabold text-sm shadow-lg shadow-indigo-900/20">
                소
              </div>
              <div>
                <h1 className="text-sm font-extrabold tracking-tight text-white leading-tight">소그룹 출석부</h1>
                <p className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">Admin Dashboard</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3.5 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all duration-150 cursor-pointer text-xs font-medium ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20 font-semibold'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`
                }
              >
                <item.icon size={16} className="flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-850 text-center text-[10px] text-slate-500 font-medium">
          © 2026 소그룹 출석 관리 시스템
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 pt-14 lg:pt-0 w-full relative flex flex-col ${isOrgPage ? 'h-screen lg:h-full overflow-hidden' : 'overflow-auto'}`}>
        <div className={`mx-auto w-full flex-1 flex flex-col ${isOrgPage ? 'max-w-none p-3 lg:p-4 overflow-hidden' : 'p-3 sm:p-4 lg:p-5 max-w-[1600px] gap-4'}`}>
          {children}
        </div>
      </main>
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;