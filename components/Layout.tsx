import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { NavLink, useLocation, useNavigationType } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, BookOpen, Users, Menu, X, UserSearch, Network, Heart, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  isVisitationMode?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, isVisitationMode = false }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = React.useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const location = useLocation();
  const navigationType = useNavigationType();
  const isOrgPage = location.pathname === '/org';

  const mainRef = useRef<HTMLElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});

  // Continuously record scroll position of the current route in main container
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const handleScroll = () => {
      scrollPositionsRef.current[location.pathname] = mainEl.scrollTop;
    };

    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener('scroll', handleScroll);
    };
  }, [location.pathname]);

  // Handle scroll position when location changes
  useLayoutEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    if (navigationType === 'POP') {
      const savedPosition = scrollPositionsRef.current[location.pathname] ?? 0;
      mainEl.scrollTop = savedPosition;

      // Ensure position is preserved after React layout and dynamic content render
      const timer1 = requestAnimationFrame(() => {
        if (mainEl) mainEl.scrollTop = savedPosition;
      });
      const timer2 = setTimeout(() => {
        if (mainEl) mainEl.scrollTop = savedPosition;
      }, 50);
      const timer3 = setTimeout(() => {
        if (mainEl) mainEl.scrollTop = savedPosition;
      }, 150);

      return () => {
        cancelAnimationFrame(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else {
      // PUSH or REPLACE: start at the top of the new page
      mainEl.scrollTop = 0;
      const timer1 = requestAnimationFrame(() => {
        if (mainEl) mainEl.scrollTop = 0;
      });
      return () => cancelAnimationFrame(timer1);
    }
  }, [location.pathname, navigationType]);

  const toggleMobileSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const toggleDesktopSidebar = () => {
    setIsDesktopCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

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
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-slate-900 text-white transform transition-all duration-300 ease-in-out lg:static lg:inset-auto flex flex-col justify-between border-r border-slate-800 shadow-xl lg:shadow-none shrink-0 ${
          isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'
        } ${
          isDesktopCollapsed 
            ? 'lg:w-0 lg:translate-x-0 lg:border-r-0 lg:overflow-hidden lg:opacity-0 pointer-events-none lg:pointer-events-auto' 
            : 'lg:w-64 lg:translate-x-0 lg:opacity-100'
        }`}
      >
        <div className="w-64">
          {/* Sidebar Header */}
          <div className="p-5 border-b border-slate-800 hidden lg:block">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-indigo-900/20">
                  소
                </div>
                <div>
                  <h1 className="text-base font-extrabold tracking-tight text-white leading-tight">소그룹 출석부</h1>
                  <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">Admin Dashboard</p>
                </div>
              </div>
              <button
                onClick={toggleDesktopSidebar}
                title="메뉴 접기"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <PanelLeftClose size={18} />
              </button>
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
                <span className="whitespace-nowrap">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-850 text-center text-[10px] text-slate-500 font-medium w-64">
          © 2026 소그룹 출석 관리 시스템
        </div>
      </aside>

      {/* Main Content */}
      <main ref={mainRef} className={`flex-1 w-full relative flex flex-col ${isOrgPage ? 'h-screen overflow-hidden' : 'h-screen overflow-auto'}`}>
        {/* Unified Top Header - Mobile Always, Desktop when Collapsed */}
        <header className={`sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 py-2.5 shadow-sm transition-all flex items-center justify-between ${
          isDesktopCollapsed ? '' : 'lg:hidden'
        }`}>
          <div className="flex items-center gap-3">
            {/* Desktop Expand Button */}
            <button
              onClick={toggleDesktopSidebar}
              className="hidden lg:flex p-1.5 -ml-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="메뉴 펼치기"
            >
              <PanelLeftOpen size={20} />
            </button>
            {/* Mobile Expand Button */}
            <button
              onClick={toggleMobileSidebar}
              className="lg:hidden flex p-1.5 -ml-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="메뉴 열기"
            >
              <PanelLeftOpen size={20} />
            </button>

            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-xs">소</span>
              </div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 tracking-tight">소그룹 출석부</span>
            </div>
          </div>
        </header>

        <div className={`mx-auto w-full flex-1 flex flex-col ${
          isOrgPage 
            ? 'max-w-none p-2.5 sm:p-3 lg:p-4 overflow-hidden pb-16 lg:pb-0' 
            : 'p-3 sm:p-4 lg:p-5 max-w-none gap-3.5 pb-20 lg:pb-5'
        }`}>
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-1 py-1 flex items-center justify-around shadow-lg">
        {[
          { to: '/org', icon: Network, label: '조직도' },
          { to: '/attendance', icon: CalendarDays, label: '출석부' },
          { to: '/prayer', icon: BookOpen, label: '기도제목' },
          ...(isVisitationMode ? [{ to: '/visitation', icon: Heart, label: '심방' }] : [{ to: '/profile', icon: UserSearch, label: '개인현황' }]),
          { to: '/manage', icon: Users, label: '관리' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-slate-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 dark:bg-indigo-950/60' : ''}`}>
                  <item.icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      
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