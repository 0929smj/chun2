import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Member, AttendanceRecord, MeetingStatus, AttendanceType } from '../types';
import { Phone, Calendar } from 'lucide-react';
import { SUNDAYS_2026 } from '../services/mockData';
import * as d3 from 'd3-force';
import { motion, AnimatePresence } from 'motion/react';

interface OrganizationChartProps {
  members: Member[];
  records: AttendanceRecord[];
  meetingStatus: MeetingStatus[];
}

interface RankedNode extends d3.SimulationNodeDatum {
  id: string;
  node: Member;
  type: 'leader' | 'member';
  groupName: string;
  stats: { worshipRate: number; gatheringRate: number; woolRate: number };
  score: number;
  targetX: number;
  targetY: number;
  opacity: number;
  scale: number;
  animDelay: number;
  animDuration: number;
  springStiffness: number;
  springDamping: number;
  springMass: number;
}

interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  opacity: number;
}

const OrganizationChart: React.FC<OrganizationChartProps> = ({ members, records, meetingStatus }) => {
  const navigate = useNavigate();
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const touchTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef<boolean>(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const [layoutNodes, setLayoutNodes] = useState<RankedNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<Edge[]>([]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isDraggingBg = useRef(false);
  const isDraggingCanvas = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const activePointers = useRef(new Map<number, {x: number, y: number}>());
  const initialPinchDist = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);

  const handleBgPointerDown = (e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
      isDraggingBg.current = true;
      startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      isDraggingCanvas.current = false;
    } else if (activePointers.current.size === 2) {
      isDraggingBg.current = false;
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchDist.current = dist;
      initialZoom.current = zoom;
    }
  };

  const handleBgPointerMove = (e: React.PointerEvent) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      
      if (initialPinchDist.current) {
        const scale = dist / initialPinchDist.current;
        const newZoom = Math.min(Math.max(0.2, initialZoom.current * scale), 4);
        setZoom(newZoom);
        isDraggingCanvas.current = true;
      }
      return;
    }

    if (!isDraggingBg.current) return;
    const newX = e.clientX - startPan.current.x;
    const newY = e.clientY - startPan.current.y;
    
    if (Math.abs(e.clientX - dragStartPos.current.x) > 5 || Math.abs(e.clientY - dragStartPos.current.y) > 5) {
       isDraggingCanvas.current = true;
    }
    setPan({ x: newX, y: newY });
  };

  const handleBgPointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    
    if (activePointers.current.size < 2) {
      initialPinchDist.current = null;
    }
    
    if (activePointers.current.size === 1) {
       const pts = Array.from(activePointers.current.values());
       startPan.current = { x: pts[0].x - pan.x, y: pts[0].y - pan.y };
       isDraggingBg.current = true;
    } else if (activePointers.current.size === 0) {
       isDraggingBg.current = false;
       setTimeout(() => {
         isDraggingCanvas.current = false;
       }, 50);
    }
  };

  const handleBgWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
       e.preventDefault(); // Might not work in React if passive, but trying to prevent default browser zoom
    }
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    setZoom(prev => Math.min(Math.max(0.2, prev + prev * delta), 4));
  };

  const handleBgClick = () => {
    if (!isDraggingCanvas.current) {
      setFocusedGroup(null);
      setActiveTooltip(null);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    ro.observe(containerRef.current);
    
    // Initial dimensions
    setDimensions({
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight
    });
    
    return () => ro.disconnect();
  }, []);

  const structuredData = useMemo(() => {
    const dict: Record<string, { leader: Member | null; members: Member[] }> = {};
    const sortedMembers = [...members].sort((a, b) => {
      const nameA = a.name.replace(/\*/g, '').trim();
      const nameB = b.name.replace(/\*/g, '').trim();
      return nameA.localeCompare(nameB);
    });

    sortedMembers.forEach((m) => {
      const gName = m.group && m.group.trim() ? m.group.trim() : '미소속';
      if (!dict[gName]) dict[gName] = { leader: null, members: [] };
      
      const roleUpper = String(m.role || '').toUpperCase().trim();
      if (roleUpper === '리더' || roleUpper === 'LEADER' || roleUpper === '울장') {
        if (!dict[gName].leader) dict[gName].leader = m;
        else dict[gName].members.push(m);
      } else {
        dict[gName].members.push(m);
      }
    });
    return dict;
  }, [members]);

  const getStats = useMemo(() => {
    const statsCache = new Map();
    
    const now = new Date();
    const targetDate = new Date(2026, now.getMonth(), now.getDate()); 
    const comparisonDate = now.getFullYear() >= 2026 ? now : targetDate;
    const allPassedSundays = SUNDAYS_2026.filter(d => new Date(d) <= comparisonDate);

    return (m: Member) => {
      if (statsCache.has(m.id)) return statsCache.get(m.id);

      let passedSundays = allPassedSundays;
      const regDate = m.MemberRegistration || (m as any).registrationDate;
      
      if (regDate) {
        let normReg = String(regDate).trim();
        if (/^\d{4}$/.test(normReg)) normReg = `${normReg}-01-01`;
        else if (/^\d{4}-\d{2}$/.test(normReg)) normReg = `${normReg}-01`;
        passedSundays = passedSundays.filter(d => d >= normReg);
      }

      let pWorship = 0, pGathering = 0, pWool = 0;
      passedSundays.forEach(date => {
        const wCanc = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Worship && s.isCanceled);
        const gCanc = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Gathering && s.isCanceled);
        const lCanc = meetingStatus.some(s => s.date === date && s.type === AttendanceType.Wool && s.isCanceled);
        if (!wCanc) pWorship++;
        if (!gCanc) pGathering++;
        if (!lCanc) pWool++;
      });

      const myRecs = records.filter(r => r.memberId === m.id && passedSundays.includes(r.date));
      const worshipCount = myRecs.filter(r => r.types.includes(AttendanceType.Worship)).length;
      const gatheringCount = myRecs.filter(r => r.types.includes(AttendanceType.Gathering)).length;
      const woolCount = myRecs.filter(r => r.types.includes(AttendanceType.Wool)).length;

      const calcRate = (c: number, total: number) => total === 0 ? 0 : Math.round((c / total) * 100);

      const result = {
        worshipRate: calcRate(worshipCount, pWorship),
        gatheringRate: calcRate(gatheringCount, pGathering),
        woolRate: calcRate(woolCount, pWool),
      };
      statsCache.set(m.id, result);
      return result;
    };
  }, [records, meetingStatus]);

  useEffect(() => {
    if (!dimensions.width || !dimensions.height) return;

    // Optional: Smoothly transition pan to center instead of hard reset, or leave it.
    // We can reset pan on layout change so the focused view is centered.
    setPan({ x: 0, y: 0 });

    const nodes: RankedNode[] = [];
    const edges: Edge[] = [];
    const groupNames = Object.keys(structuredData).sort();
    
    const w = Math.max(dimensions.width, 300);
    const h = Math.max(dimensions.height, 300);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2 - 100;

    if (!focusedGroup) {
      const leaders: RankedNode[] = [];
      groupNames.forEach(gName => {
        const leader = structuredData[gName].leader || structuredData[gName].members[0];
        if (!leader) return;
        const stats = getStats(leader);
        leaders.push({
          id: `leader-${gName}`,
          node: leader,
          type: 'leader',
          groupName: gName,
          stats,
          score: (stats.worshipRate + stats.gatheringRate + stats.woolRate) / 3,
          targetX: cx, targetY: cy,
          opacity: 1, scale: 1,
          animDelay: Math.random() * 2.5,
          animDuration: 3.5 + Math.random() * 2,
          springStiffness: 40 + Math.random() * 80,
          springDamping: 8 + Math.random() * 7,
          springMass: 0.8 + Math.random() * 0.5
        });
      });

      leaders.sort((a, b) => b.score - a.score);
      const N = leaders.length;
      const spacing = N > 1 ? Math.min(maxR * 0.7, (maxR * 0.7) / Math.sqrt(N - 1)) : maxR * 0.7;

      leaders.forEach((item, i) => {
        const theta = i * 2.39996;
        const r = i === 0 ? 0 : spacing * Math.sqrt(i);
        item.targetX = cx + r * Math.cos(theta);
        item.targetY = cy + r * Math.sin(theta);
        item.x = cx + (r * 0.5) * Math.cos(theta);
        item.y = cy + (r * 0.5) * Math.sin(theta);
        
        nodes.push(item);
        edges.push({
          id: `edge-center-${item.groupName}`,
          sourceId: 'CENTER',
          targetId: item.id,
          opacity: 0.15
        });
      });
      
      nodes.push({
         id: 'CENTER', node: {} as Member, type: 'leader', groupName: '', stats: {worshipRate:0, gatheringRate:0, woolRate:0}, score: 0,
         targetX: cx, targetY: cy, x: cx, y: cy, opacity: 0, scale: 0, fx: cx, fy: cy, animDelay: 0, animDuration: 0, springStiffness: 60, springDamping: 12, springMass: 1
      });

    } else {
      const focusedData = structuredData[focusedGroup];
      const focusedLeader = focusedData?.leader || focusedData?.members[0];
      
      const membersData: RankedNode[] = [];
      const focusedMembers = focusedData?.members.filter(m => m.id !== focusedLeader?.id) || [];
      focusedMembers.forEach(m => {
        const stats = getStats(m);
        membersData.push({
          id: `member-${m.id}`,
          node: m,
          type: 'member',
          groupName: focusedGroup,
          stats,
          score: (stats.worshipRate + stats.gatheringRate + stats.woolRate) / 3,
          targetX: cx, targetY: cy,
          opacity: 1, scale: 0.95,
          animDelay: Math.random() * 2.5,
          animDuration: 3.5 + Math.random() * 2,
          springStiffness: 40 + Math.random() * 80,
          springDamping: 8 + Math.random() * 7,
          springMass: 0.8 + Math.random() * 0.5
        });
      });

      membersData.sort((a, b) => b.score - a.score);

      let leaderId = 'CENTER';
      if (focusedLeader) {
        leaderId = `leader-${focusedGroup}`;
        nodes.push({
          id: leaderId,
          node: focusedLeader,
          type: 'leader',
          groupName: focusedGroup,
          stats: getStats(focusedLeader),
          score: 100,
          targetX: cx, targetY: cy,
          x: cx, y: cy,
          opacity: 1, scale: 1.1,
          fx: cx, fy: cy,
          animDelay: Math.random() * 2.5,
          animDuration: 3.5 + Math.random() * 2,
          springStiffness: 60,
          springDamping: 12,
          springMass: 1
        });
      }

      const M = membersData.length;
      const baseR = 120;
      const remainingR = maxR - baseR;

      membersData.forEach((item, i) => {
        const theta = i * 2.39996;
        const ratio = 1 - (item.score / 100); 
        const r = M === 1 ? baseR : baseR + remainingR * ratio;
        
        item.targetX = cx + r * Math.cos(theta);
        item.targetY = cy + r * Math.sin(theta);
        item.x = cx + (r * 0.5) * Math.cos(theta);
        item.y = cy + (r * 0.5) * Math.sin(theta);

        nodes.push(item);
        edges.push({
          id: `edge-focus-${item.node.id}`,
          sourceId: leaderId,
          targetId: item.id,
          opacity: 0.4
        });
      });

      const otherGroups = groupNames.filter(g => g !== focusedGroup);
      const R_other_x = w * 0.35; 
      const R_other_y = h * 0.35;
      const numOther = otherGroups.length;

      otherGroups.forEach((gName, i) => {
        const leader = structuredData[gName].leader || structuredData[gName].members[0];
        if (!leader) return;
        
        const angle = (i / numOther) * 2 * Math.PI - Math.PI / 2;
        const x = cx + R_other_x * Math.cos(angle);
        const y = cy + R_other_y * Math.sin(angle);

        nodes.push({
          id: `leader-${gName}`,
          node: leader,
          type: 'leader',
          groupName: gName,
          stats: getStats(leader),
          score: 0,
          targetX: x, targetY: y,
          x: x, y: y,
          opacity: 0.3, scale: 0.55,
          animDelay: Math.random() * 2.5,
          animDuration: 3.5 + Math.random() * 2,
          springStiffness: 40 + Math.random() * 80,
          springDamping: 8 + Math.random() * 7,
          springMass: 0.8 + Math.random() * 0.5
        });
        
        edges.push({
          id: `edge-other-${gName}`,
          sourceId: leaderId,
          targetId: `leader-${gName}`,
          opacity: 0.05
        });
      });
    }

    const simulation = d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(d => d.id === 'CENTER' ? 0 : -100))
      .force('x', d3.forceX<RankedNode>(d => d.targetX).strength(d => d.type === 'leader' && d.groupName === focusedGroup ? 1 : 0.3))
      .force('y', d3.forceY<RankedNode>(d => d.targetY).strength(d => d.type === 'leader' && d.groupName === focusedGroup ? 1 : 0.3))
      .force('collide', d3.forceCollide<RankedNode>().radius(d => {
        if (d.id === 'CENTER') return 0;
        if (d.type === 'leader') return 80; 
        return 65; 
      }).iterations(4))
      .stop();

    simulation.tick(250);

    const settledNodes = simulation.nodes().filter(n => n.id !== 'CENTER').map(n => ({ ...n }));
    setLayoutNodes(settledNodes);
    setLayoutEdges(edges);
  }, [structuredData, focusedGroup, dimensions, getStats]);

  const getDisplayName = (m: Member) => {
    const displayMatch = m.name.match(/^(\d{2})\s*(.+)$/);
    if (displayMatch) {
      return { num: displayMatch[1], name: displayMatch[2] };
    }
    return { num: '', name: m.name };
  };

  const navigateToProfile = (memberId: string) => {
    navigate('/profile', { state: { memberId } });
  };

  const handleTouchStart = (id: string, e: React.TouchEvent) => {
    isLongPress.current = false;
    touchTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setActiveTooltip(id);
    }, 400);
  };

  const handleTouchEnd = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    if (isLongPress.current) {
      setTimeout(() => setActiveTooltip(null), 1500); 
    }
  };

  const handleClick = (e: React.MouseEvent, type: string, groupName: string, memberId: string) => {
    e.stopPropagation();
    if (isLongPress.current || isDraggingCanvas.current) {
      e.preventDefault();
      return; 
    }
    
    if (type === 'leader') {
       if (focusedGroup !== groupName) {
         setFocusedGroup(groupName);
         setActiveTooltip(null);
       } else {
         navigateToProfile(memberId);
       }
    } else {
       navigateToProfile(memberId);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800">연결 조직도</h2>
        <p className="text-sm text-slate-500">리더를 클릭하면 하위 멤버가 나타납니다. 화면에 나온 멤버나 다시 리더를 클릭하면 상세 프로필로 이동합니다.</p>
      </header>

      <div 
        ref={containerRef}
        className="w-full h-[75vh] min-h-[600px] relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-inner cursor-grab active:cursor-grabbing touch-none select-none"
        onPointerDown={handleBgPointerDown}
        onPointerMove={handleBgPointerMove}
        onPointerUp={handleBgPointerUp}
        onPointerCancel={handleBgPointerUp}
        onPointerLeave={handleBgPointerUp}
        onWheel={handleBgWheel}
        onClick={handleBgClick}
      >
        <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}>
          <div 
            className="absolute z-0 pointer-events-none opacity-20 bg-grid" 
            style={{
              width: '1000%',
              height: '1000%',
              left: '-450%',
              top: '-450%',
              backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              backgroundPosition: 'center center'
            }} 
          />
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
           <AnimatePresence>
           {layoutEdges.map(edge => {
             const sourceNode = layoutNodes.find(n => n.id === edge.sourceId) || { x: dimensions.width/2, y: dimensions.height/2, springStiffness: 60, springDamping: 12, springMass: 1 } as RankedNode;
             const targetNode = layoutNodes.find(n => n.id === edge.targetId) || { x: dimensions.width/2, y: dimensions.height/2, springStiffness: 60, springDamping: 12, springMass: 1 } as RankedNode;
             
             return (
               <motion.line
                 key={edge.id}
                 initial={{ 
                   x1: dimensions.width/2, y1: dimensions.height/2, 
                   x2: dimensions.width/2, y2: dimensions.height/2, 
                   opacity: 0 
                 }}
                 animate={{ 
                   x1: sourceNode.x, y1: sourceNode.y, 
                   x2: targetNode.x, y2: targetNode.y, 
                   opacity: edge.opacity 
                 }}
                 exit={{ opacity: 0 }}
                 transition={{ 
                   x1: { type: 'spring', stiffness: sourceNode.springStiffness || 60, damping: sourceNode.springDamping || 12, mass: sourceNode.springMass || 1 },
                   y1: { type: 'spring', stiffness: sourceNode.springStiffness || 60, damping: sourceNode.springDamping || 12, mass: sourceNode.springMass || 1 },
                   x2: { type: 'spring', stiffness: targetNode.springStiffness || 60, damping: targetNode.springDamping || 12, mass: targetNode.springMass || 1 },
                   y2: { type: 'spring', stiffness: targetNode.springStiffness || 60, damping: targetNode.springDamping || 12, mass: targetNode.springMass || 1 },
                   opacity: { duration: 0.4 }
                 }}
                 stroke="#475569" // slate-600
                 strokeWidth="1.5"
               />
             )
           })}
           </AnimatePresence>
        </svg>

        <div className="absolute inset-0 z-20 pointer-events-none">
           <AnimatePresence>
             {layoutNodes.map(node => {
                const { node: m, scale, opacity, type, groupName, stats } = node;
                const { num, name } = getDisplayName(m);
                const avatarText = name.substring(0, 1);
                const SIZE = type === 'leader' ? 76 : 56; 
                const isTooltipActive = activeTooltip === node.id;

                return (
                   <motion.div
                     key={node.id}
                     initial={{ opacity: 0, scale: 0, x: dimensions.width / 2 - 100, y: dimensions.height / 2 - 100 }}
                     animate={{ 
                       x: node.x! - 100, 
                       y: node.y! - 100,
                       opacity: opacity,
                       scale: scale
                     }}
                     exit={{ opacity: 0, scale: 0 }}
                     transition={{ 
                       type: "spring", 
                       stiffness: node.springStiffness, 
                       damping: node.springDamping,
                       mass: node.springMass
                     }}
                     className={`absolute flex flex-col items-center pointer-events-auto origin-center w-[200px] h-[200px] justify-center ${isTooltipActive ? 'z-50' : 'z-20'}`}
                     onMouseEnter={() => setActiveTooltip(node.id)}
                     onMouseLeave={() => setActiveTooltip(null)}
                     onTouchStart={(e) => handleTouchStart(node.id, e)}
                     onTouchEnd={handleTouchEnd}
                     onTouchCancel={handleTouchEnd}
                     onContextMenu={(e) => e.preventDefault()}
                   >
                      <motion.div 
                         className="relative cursor-pointer flex flex-col items-center group"
                         onClick={(e) => handleClick(e as any, type, groupName, m.id)}
                         animate={{ y: [0, -6, 0] }}
                         transition={{ repeat: Infinity, duration: node.animDuration, delay: node.animDelay, ease: "easeInOut" }}
                      >
                          {/* Tooltip Float (Rich Stats) - highest z-index via parent state */}
                          <div 
                            className={`absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 w-max max-w-[180px] bg-slate-800/95 backdrop-blur-xl px-2 py-1.5 rounded bg-clip-padding shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5)] border border-slate-700/50 flex flex-col items-center gap-1 transition-all duration-300 origin-bottom 
                            ${isTooltipActive ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-90 invisible pointer-events-none'}`}
                          >
                            <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-300 font-medium tracking-tight whitespace-nowrap leading-none">
                               {m.phoneNumber && <span className="flex items-center"><Phone size={9} className="mr-0.5 text-slate-400" />{m.phoneNumber}</span>}
                               <span className="flex items-center"><Calendar size={9} className="mr-0.5 text-slate-400" />{m.MemberRegistration || '-'}</span>
                            </div>
                            
                            <div className="flex justify-between gap-1.5 text-[10px] items-center font-bold px-1.5 py-0.5 bg-slate-900/80 rounded border border-slate-700/50 w-full leading-tight">
                               <span className="text-indigo-400">예 {stats.worshipRate}%</span>
                               <span className="text-purple-400">집 {stats.gatheringRate}%</span>
                               <span className="text-emerald-400">울 {stats.woolRate}%</span>
                            </div>

                            {m.specialNotes && (
                               <div className="text-[9px] text-slate-300 text-center bg-indigo-900/30 px-1.5 py-1 rounded w-full border border-indigo-700/30 break-words whitespace-normal leading-tight">
                                  <span className="font-bold text-indigo-300 mr-1">비고</span>
                                  {m.specialNotes}
                               </div>
                            )}

                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-[3px] border-transparent border-t-slate-800/95"></div>
                          </div>

                          {/* Node Avatar Component */}
                          <div 
                            className={`relative rounded-full bg-slate-800 shadow-xl border-[3px] 
                                        ${type === 'leader' ? 'border-amber-400 ring-4 ring-amber-500/20' : 'border-slate-600'}
                                        group-hover:border-indigo-400 group-hover:ring-8 group-hover:ring-indigo-500/30 transition-all z-10 duration-300`}
                            style={{ width: SIZE, height: SIZE }}
                          >
                             {m.photoUrl ? (
                               <img src={m.photoUrl} alt={name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                             ) : (
                               <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-slate-400 text-xl font-bold">
                                 {avatarText}
                               </div>
                             )}

                             {/* Leader Badge */}
                             {type === 'leader' && (
                                <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 text-[10px] sm:text-xs font-bold px-3 py-0.5 rounded-full border border-slate-900 whitespace-nowrap shadow-lg">
                                  {groupName} 리더
                                </div>
                             )}
                          </div>
                      </motion.div>

                      {/* Standard Nameplate Below */}
                      <motion.div 
                         animate={{ y: [0, -6, 0] }}
                         transition={{ repeat: Infinity, duration: node.animDuration, delay: node.animDelay, ease: "easeInOut" }}
                         className={`mt-3 font-bold tracking-tight whitespace-nowrap bg-slate-800/80 backdrop-blur-md px-2.5 py-0.5 rounded-full shadow-lg border border-slate-700/50 
                         ${type === 'leader' ? 'text-slate-100 text-sm' : 'text-slate-300 text-[11px]'}`}
                      >
                         {num && <span className="text-slate-500 font-medium mr-1.5">{num}</span>}{name}
                      </motion.div>
                   </motion.div>
                );
             })}
           </AnimatePresence>
        </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizationChart;

