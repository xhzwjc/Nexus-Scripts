'use client';

import React, { useMemo, useState } from 'react';
import { getDayLabel, getHolidayType, solarToLunar } from '@/lib/lunarCalendar';

export interface HomeCalendarProps {
    className?: string;
}

// ─── 工具函数 ────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function HomeCalendar({ className }: HomeCalendarProps) {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());

    const todayStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

    // 当前月农历信息（用于头部显示）
    const lunarInfo = useMemo(() => {
        return solarToLunar(viewYear, viewMonth + 1, 1);
    }, [viewYear, viewMonth]);

    // 日历网格
    const calendarGrid = useMemo(() => {
        const daysInMonth = getDaysInMonth(viewYear, viewMonth);
        const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
        const prevMonthDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);

        const cells: { day: number; month: number; year: number; inMonth: boolean }[] = [];

        // 上月末尾
        const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
        const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
        for (let i = firstDay - 1; i >= 0; i--) {
            cells.push({ day: prevMonthDays - i, month: prevM, year: prevY, inMonth: false });
        }
        // 本月
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ day: d, month: viewMonth, year: viewYear, inMonth: true });
        }
        // 下月头部（补到 42 格）
        const remaining = 42 - cells.length;
        const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
        for (let d = 1; d <= remaining; d++) {
            cells.push({ day: d, month: nextM, year: nextY, inMonth: false });
        }
        return cells;
    }, [viewYear, viewMonth]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };
    const goToday = () => {
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
    };

    const monthLabel = `${viewYear}年${viewMonth + 1}月`;
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

    return (
        <div className={`hcal-panel ${className ?? ''}`}>
            {/* ─── 面板头部 ───────────────────────────── */}
            <div className="hcal-head">
                <div className="hcal-head-top">
                    <div className="hcal-head-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <span className="hcal-head-title">日程</span>
                    <span className="hcal-head-lunar">{lunarInfo.yearGanZhi}年 {lunarInfo.zodiac}年</span>
                </div>
                <div className="hcal-nav-row">
                    <span className="hcal-month-label">{monthLabel}</span>
                    <div className="hcal-nav-group">
                        <button className="hcal-nav-btn" onClick={prevMonth} aria-label="上月">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <button className={`hcal-today-btn ${isCurrentMonth ? 'is-current' : ''}`} onClick={goToday}>今天</button>
                        <button className="hcal-nav-btn" onClick={nextMonth} aria-label="下月">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── 星期表头 ──────────────────────────── */}
            <div className="hcal-weekdays">
                {WEEKDAYS.map((d, i) => (
                    <div key={d} className={`hcal-weekday ${i === 0 || i === 6 ? 'weekend' : ''}`}>{d}</div>
                ))}
            </div>

            {/* ─── 日历网格 ──────────────────────────── */}
            <div className="hcal-grid">
                {calendarGrid.map((cell, idx) => {
                    const sm = cell.month + 1; // getDayLabel expects 1-indexed month
                    const dayInfo = getDayLabel(cell.year, sm, cell.day);
                    const holiday = getHolidayType(cell.year, sm, cell.day);
                    const isToday = `${cell.year}-${sm}-${cell.day}` === todayStr;
                    const isWeekend = idx % 7 === 0 || idx % 7 === 6;
                    return (
                        <div
                            key={idx}
                            className={[
                                'hcal-cell',
                                !cell.inMonth && 'outside',
                                isToday && 'today',
                                isWeekend && cell.inMonth && 'weekend',
                            ].filter(Boolean).join(' ')}
                        >
                            {/* 假/班 标签 */}
                            {holiday && (
                                <span className={`hcal-badge ${holiday === '假' ? 'rest' : 'work'}`}>
                                    {holiday}
                                </span>
                            )}
                            <span className="hcal-solar">{cell.day}</span>
                            <span className={`hcal-lunar ${dayInfo.isFestival ? 'festival' : ''}`}>
                                {dayInfo.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* ─── 底部图例 ──────────────────────────── */}
            <div className="hcal-legend">
                <span className="hcal-legend-item"><span className="hcal-legend-dot rest" />假期</span>
                <span className="hcal-legend-item"><span className="hcal-legend-dot work" />调休</span>
                <span className="hcal-legend-item"><span className="hcal-legend-dot festival" />节日</span>
            </div>

            {/* ─── 样式 ─────────────────────────────── */}
            <style dangerouslySetInnerHTML={{ __html: PANEL_CSS }} />
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// 内联 CSS —— 高级感右侧面板
// ════════════════════════════════════════════════════════════
const PANEL_CSS = `
/* ===== 面板容器 ===== */
.hcal-panel {
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg,
        rgba(255,255,255,0.96) 0%,
        rgba(248,250,255,0.98) 40%,
        rgba(243,245,252,0.99) 100%);
    border-radius: 16px;
    border: 1px solid rgba(226,232,240,0.6);
    box-shadow:
        0 1px 3px rgba(0,0,0,0.04),
        0 8px 24px rgba(0,0,0,0.03),
        inset 0 1px 0 rgba(255,255,255,0.8);
    padding: 20px 16px 16px;
    position: relative;
    overflow: hidden;
}
.hcal-panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 40%, #a78bfa 70%, #c084fc 100%);
}

/* 深色模式 */
:is(.dark, [data-theme="dark"]) .hcal-panel {
    background: linear-gradient(180deg,
        rgba(15,23,42,0.97) 0%,
        rgba(17,24,45,0.98) 40%,
        rgba(20,27,50,0.99) 100%);
    border-color: rgba(51,65,85,0.5);
}

/* ===== 头部 ===== */
.hcal-head {
    margin-bottom: 16px;
}
.hcal-head-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.hcal-head-icon {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(99,102,241,0.3);
    flex-shrink: 0;
}
.hcal-head-title {
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.02em;
}
:is(.dark, [data-theme="dark"]) .hcal-head-title { color: #f1f5f9; }
.hcal-head-lunar {
    font-size: 11px;
    color: #94a3b8;
    margin-left: auto;
    font-weight: 500;
    background: rgba(99,102,241,0.06);
    padding: 2px 8px;
    border-radius: 6px;
}
:is(.dark, [data-theme="dark"]) .hcal-head-lunar {
    background: rgba(99,102,241,0.15);
    color: #a5b4fc;
}

.hcal-nav-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.hcal-month-label {
    font-size: 16px;
    font-weight: 700;
    color: #1e293b;
    letter-spacing: 0.03em;
}
:is(.dark, [data-theme="dark"]) .hcal-month-label { color: #e2e8f0; }

.hcal-nav-group {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(241,245,249,0.8);
    border-radius: 8px;
    padding: 2px;
    border: 1px solid rgba(226,232,240,0.5);
}
:is(.dark, [data-theme="dark"]) .hcal-nav-group {
    background: rgba(30,41,59,0.8);
    border-color: rgba(51,65,85,0.5);
}
.hcal-nav-btn {
    all: unset;
    width: 26px; height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
}
.hcal-nav-btn:hover { background: rgba(99,102,241,0.1); color: #6366f1; }
:is(.dark, [data-theme="dark"]) .hcal-nav-btn { color: #94a3b8; }
:is(.dark, [data-theme="dark"]) .hcal-nav-btn:hover { background: rgba(99,102,241,0.2); color: #818cf8; }

.hcal-today-btn {
    all: unset;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
    color: #6366f1;
    cursor: pointer;
    transition: all 0.15s ease;
}
.hcal-today-btn:hover { background: rgba(99,102,241,0.1); }
.hcal-today-btn.is-current { opacity: 0.4; pointer-events: none; }

/* ===== 星期表头 ===== */
.hcal-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 4px;
}
.hcal-weekday {
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
    padding: 5px 0;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}
.hcal-weekday.weekend { color: #6366f1; }
:is(.dark, [data-theme="dark"]) .hcal-weekday { color: #64748b; }
:is(.dark, [data-theme="dark"]) .hcal-weekday.weekend { color: #818cf8; }

/* ===== 日历网格 ===== */
.hcal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    flex: 1;
}
.hcal-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px 2px;
    border-radius: 8px;
    min-height: 48px;
    transition: all 0.15s ease;
    cursor: default;
}
.hcal-cell:hover:not(.outside):not(.today) {
    background: rgba(99,102,241,0.05);
}

/* 阳历日期 */
.hcal-solar {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
    line-height: 1.2;
}
:is(.dark, [data-theme="dark"]) .hcal-solar { color: #e2e8f0; }

/* 农历日期 */
.hcal-lunar {
    font-size: 9px;
    color: #94a3b8;
    line-height: 1;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
}
:is(.dark, [data-theme="dark"]) .hcal-lunar { color: #64748b; }

/* 节日高亮 */
.hcal-lunar.festival {
    color: #6366f1;
    font-weight: 600;
}
:is(.dark, [data-theme="dark"]) .hcal-lunar.festival { color: #a5b4fc; }

/* 周末 */
.hcal-cell.weekend .hcal-solar { color: #6366f1; }
:is(.dark, [data-theme="dark"]) .hcal-cell.weekend .hcal-solar { color: #818cf8; }

/* 非当月 */
.hcal-cell.outside .hcal-solar { color: #cbd5e1; }
.hcal-cell.outside .hcal-lunar { color: #e2e8f0; }
:is(.dark, [data-theme="dark"]) .hcal-cell.outside .hcal-solar { color: #334155; }
:is(.dark, [data-theme="dark"]) .hcal-cell.outside .hcal-lunar { color: #334155; }

/* 今天 */
.hcal-cell.today {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    box-shadow: 0 2px 10px rgba(99,102,241,0.35);
    border-radius: 10px;
}
.hcal-cell.today .hcal-solar { color: #fff; font-weight: 800; }
.hcal-cell.today .hcal-lunar { color: rgba(255,255,255,0.75); }
.hcal-cell.today .hcal-lunar.festival { color: #fde68a; }
.hcal-cell.today:hover { box-shadow: 0 4px 14px rgba(99,102,241,0.45); transform: translateY(-1px); }

/* ===== 假/班 角标 ===== */
.hcal-badge {
    position: absolute;
    top: 1px;
    right: 2px;
    font-size: 8px;
    font-weight: 800;
    line-height: 1;
    padding: 1px 3px;
    border-radius: 3px;
    letter-spacing: 0;
}
.hcal-badge.rest {
    color: #16a34a;
    background: rgba(22,163,74,0.1);
}
.hcal-badge.work {
    color: #ea580c;
    background: rgba(234,88,12,0.1);
}
:is(.dark, [data-theme="dark"]) .hcal-badge.rest {
    color: #4ade80;
    background: rgba(74,222,128,0.12);
}
:is(.dark, [data-theme="dark"]) .hcal-badge.work {
    color: #fb923c;
    background: rgba(251,146,60,0.12);
}
/* 今天的角标 */
.hcal-cell.today .hcal-badge.rest {
    color: #86efac;
    background: rgba(255,255,255,0.15);
}
.hcal-cell.today .hcal-badge.work {
    color: #fdba74;
    background: rgba(255,255,255,0.15);
}

/* ===== 图例 ===== */
.hcal-legend {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 0 0;
    border-top: 1px solid rgba(226,232,240,0.5);
    margin-top: 8px;
}
:is(.dark, [data-theme="dark"]) .hcal-legend {
    border-top-color: rgba(51,65,85,0.4);
}
.hcal-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #94a3b8;
    font-weight: 500;
}
.hcal-legend-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
}
.hcal-legend-dot.rest { background: #16a34a; }
.hcal-legend-dot.work { background: #ea580c; }
.hcal-legend-dot.festival { background: #6366f1; }

/* ===== 滚动条 ===== */
.hcal-panel::-webkit-scrollbar { width: 3px; }
.hcal-panel::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 3px; }
.hcal-panel::-webkit-scrollbar-track { background: transparent; }
`;
