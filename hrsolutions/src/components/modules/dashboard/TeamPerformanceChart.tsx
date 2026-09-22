'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useDashboardContext } from './DashboardDataContext';

type RangeOption = '6m' | '3m' | '12m' | '30d';

const rangeLabels: Record<RangeOption, string> = {
  '6m': 'Last 6 Months',
  '3m': 'Last 3 Months',
  '12m': 'Last 12 Months',
  '30d': 'Last 30 Days',
};

export const TeamPerformanceChart: React.FC = () => {
  const dashboardState = useDashboardContext();
  const [range, setRange] = useState<RangeOption>('6m');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const { computedTrendData, headlineRate, trendPercentage } = useMemo(() => {
    const employees = dashboardState.employees || [];
    const attendance = dashboardState.attendance || [];
    const points: Array<{ day: string; rate: number; punctuality: number; fullLabel: string }> = [];
    const total = employees.length;

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const currentM = now.getMonth();
    const currentY = now.getFullYear();

    if (range === '30d') {
      // 5 6-day intervals in the last 30 days
      for (let i = 4; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i * 6);
        const dateStr = d.toISOString().split('T')[0];
        const label = `${d.getDate()} ${monthNamesShort[d.getMonth()]}`;

        const dayPunches = attendance.filter((a) => a.date === dateStr);
        const presentCount = dayPunches.filter((a) => {
          const s = String(a.status || '').toLowerCase();
          return s === 'present' || s === 'late' || s.includes('home') || s === 'wfh';
        }).length;
        const rate = total > 0 ? Math.min(100, Math.round((presentCount / total) * 100)) : 0;
        points.push({ day: label, rate, punctuality: rate, fullLabel: dateStr });
      }
    } else {
      const monthCount = range === '3m' ? 3 : range === '12m' ? 12 : 6;
      for (let i = monthCount - 1; i >= 0; i--) {
        const d = new Date(currentY, currentM - i, 1);
        const mIdx = d.getMonth();
        const mYear = d.getFullYear();
        const prefix = `${mYear}-${String(mIdx + 1).padStart(2, '0')}`;
        const mLabel = monthNamesShort[mIdx];

        if (total === 0) {
          points.push({ day: mLabel, rate: 0, punctuality: 0, fullLabel: `${monthNamesShort[mIdx]} ${mYear}` });
          continue;
        }

        const monthPunches = attendance.filter((rec) => rec.date && rec.date.startsWith(prefix));
        if (monthPunches.length === 0) {
          points.push({ day: mLabel, rate: 0, punctuality: 0, fullLabel: `${monthNamesShort[mIdx]} ${mYear}` });
          continue;
        }

        const presentCount = monthPunches.filter((rec) => {
          const s = String(rec.status || '').toLowerCase();
          return s === 'present' || s === 'late' || s.includes('home') || s === 'wfh';
        }).length;

        const onTimeCount = monthPunches.filter((rec) => {
          const s = String(rec.status || '').toLowerCase();
          return s === 'present' || (rec.checkIn && rec.checkIn <= '09:15');
        }).length;

        const rate = Math.min(100, Math.round((presentCount / monthPunches.length) * 100));
        const punctuality = Math.min(100, Math.round((onTimeCount / monthPunches.length) * 100));

        points.push({ day: mLabel, rate, punctuality, fullLabel: `${monthNamesShort[mIdx]} ${mYear}` });
      }
    }

    const last = points[points.length - 1]?.rate || 0;
    const prev = points.length > 1 ? points[points.length - 2]?.rate || 0 : last;
    const diff = last - prev;
    const diffStr = diff >= 0 ? `+${diff}%` : `${diff}%`;

    return {
      computedTrendData: points,
      headlineRate: last,
      trendPercentage: diffStr,
    };
  }, [dashboardState.employees, dashboardState.attendance, range]);

  // Compute responsive SVG path
  const { pathD, areaD, coords, peakIdx } = useMemo(() => {
    const n = computedTrendData.length;
    if (n === 0) return { pathD: '', areaD: '', coords: [], peakIdx: 0 };

    const width = 400;
    const height = 120;
    const paddingX = 24;
    const usableW = width - paddingX * 2;

    let maxRate = -1;
    let bestIdx = n - 1;

    const xy = computedTrendData.map((pt, i) => {
      const x = n > 1 ? paddingX + (i / (n - 1)) * usableW : width / 2;
      const y = 110 - (pt.rate / 100) * 90;
      if (pt.rate > maxRate) {
        maxRate = pt.rate;
        bestIdx = i;
      }
      return { x, y, rate: pt.rate, label: pt.day, fullLabel: pt.fullLabel };
    });

    // Build smooth Bezier path
    let strokePath = `M ${xy[0].x},${xy[0].y}`;
    for (let i = 0; i < xy.length - 1; i++) {
      const current = xy[i];
      const next = xy[i + 1];
      const controlX1 = current.x + (next.x - current.x) / 2;
      const controlY1 = current.y;
      const controlX2 = current.x + (next.x - current.x) / 2;
      const controlY2 = next.y;
      strokePath += ` C ${controlX1},${controlY1} ${controlX2},${controlY2} ${next.x},${next.y}`;
    }

    const areaPath = `${strokePath} L ${xy[xy.length - 1].x},${height} L ${xy[0].x},${height} Z`;

    return { pathD: strokePath, areaD: areaPath, coords: xy, peakIdx: bestIdx };
  }, [computedTrendData]);

  const activeIdx = hoveredIdx !== null ? hoveredIdx : peakIdx;
  const activeCoord = coords[activeIdx] || coords[coords.length - 1];

  const displayRate = `${headlineRate}%`;

  return (
    <div className="dash-card p-5" data-purpose="performance-chart-card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-[var(--text-primary)]">Team Performance</h2>

        {/* Interactive Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition cursor-pointer active:scale-98"
          >
            <span>{rangeLabels[range]}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${dropdownOpen ? 'rotate-180 text-[var(--primary-blue)]' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-[var(--bg-surface)] rounded-xl shadow-xl border border-[var(--border-color)] py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {(Object.keys(rangeLabels) as RangeOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setRange(option);
                    setDropdownOpen(false);
                    setHoveredIdx(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition cursor-pointer ${
                    range === option
                      ? 'bg-[color-mix(in_srgb,var(--primary-blue)_12%,transparent)] text-[var(--primary-blue)] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  <span>{rangeLabels[option]}</span>
                  {range === option && <Check className="w-3.5 h-3.5 text-[var(--primary-blue)]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <span className="dash-kpi text-[32px]">
          {displayRate}
        </span>
        <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 10l7-7m0 0l7 7m-7-7v18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
          </svg>
          {trendPercentage}
        </span>
        <span className="text-xs text-[var(--text-muted)] ml-1">Attendance rate trend</span>
      </div>

      {/* Continuous Wave Area Chart */}
      <div className="relative w-full h-44 pt-2">
        {/* Horizontal grid lines */}
        <div className="absolute left-0 top-0 bottom-6 w-full flex flex-col justify-between pointer-events-none text-[10px] text-[var(--text-muted)]">
          <div className="border-b border-[var(--border-color)] flex justify-between pb-0.5"><span>100%</span></div>
          <div className="border-b border-[var(--border-color)] flex justify-between pb-0.5"><span>75%</span></div>
          <div className="border-b border-[var(--border-color)] flex justify-between pb-0.5"><span>50%</span></div>
          <div className="border-b border-[var(--border-color)] flex justify-between pb-0.5"><span>25%</span></div>
          <div className="flex justify-between pb-0.5"><span>0%</span></div>
        </div>

        {/* Dynamic SVG Curves */}
        <svg className="w-full h-36 overflow-visible" preserveAspectRatio="none" viewBox="0 0 400 120">
          <defs>
            <linearGradient id="performanceGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--primary-blue)" stopOpacity="0.18"></stop>
              <stop offset="95%" stopColor="var(--primary-blue)" stopOpacity="0.0"></stop>
            </linearGradient>
          </defs>

          {/* Filled Area */}
          {areaD && <path d={areaD} fill="url(#performanceGradient)" />}

          {/* Smooth Monotone Stroke */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="var(--primary-blue)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          )}

          {/* Dotted milestone marker on active/hovered point */}
          {activeCoord && (
            <>
              <line
                stroke="var(--primary-blue)"
                strokeDasharray="3,3"
                strokeWidth="1.5"
                x1={activeCoord.x}
                x2={activeCoord.x}
                y1={activeCoord.y}
                y2={120}
              />
              <circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                fill="var(--primary-blue)"
                r="5"
                stroke="var(--bg-surface)"
                strokeWidth="2.5"
              />
            </>
          )}

          {/* Interactive invisible hit areas for points */}
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r="12"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Dynamic Peak / Active Point Tooltip Badge */}
        {activeCoord && (
          <div
            style={{
              left: `${(activeCoord.x / 400) * 100}%`,
              top: `${Math.max(0, (activeCoord.y / 120) * 100 - 32)}%`,
            }}
            className="absolute -translate-x-1/2 bg-[var(--neutral-charcoal)] text-white text-[10px] px-2.5 py-1 rounded-md shadow-lg pointer-events-none text-center transition-all duration-150 z-10"
          >
            <span className="text-[var(--text-muted)] block text-[9px]">
              {hoveredIdx !== null ? activeCoord.fullLabel : 'Current Rate'}
            </span>
            <span className="font-bold text-[var(--primary-blue)]">{activeCoord.rate}%</span>
          </div>
        )}

        {/* X-Axis Labels */}
        <div className="w-full flex justify-between text-[11px] font-medium text-[var(--text-muted)] mt-2 px-1">
          {computedTrendData.map((pt, idx) => (
            <span
              key={pt.day + idx}
              onClick={() => setHoveredIdx(idx)}
              className={`cursor-pointer transition-colors hover:text-[var(--primary-blue)] ${
                idx === activeIdx ? 'font-bold text-[var(--primary-blue)]' : ''
              }`}
            >
              {pt.day}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

