/**
 * 中国农历日历工具
 * 提供公历→农历转换、节日查询、法定假日排班
 */

// ─── 农历压缩数据 (1900–2100) ───────────────────────────────
// 每个值编码一个农历年的月份信息：
// bits 0-3  : 闰月月份 (0 = 无闰月)
// bits 4-15 : 12 个月,  bit=1 → 大月(30天), bit=0 → 小月(29天)
// bit  16   : 闰月天数 (0=29天, 1=30天)
const LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920
    0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0, // 2050
    0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252, // 2090
    0x0d520, // 2100
];

const BASE_YEAR = 1900;
// 1900年1月31日 = 农历庚子年正月初一
const BASE_DATE = new Date(1900, 0, 31);

// ─── 名称映射 ────────────────────────────────────────────
const LUNAR_MONTH_NAME = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY_NAME = [
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

const SHENG_XIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// ─── 辅助函数 ────────────────────────────────────────────

/** 该农历年的闰月月份 (1–12), 0 = 无闰月 */
function leapMonth(y: number): number {
    return LUNAR_INFO[y - BASE_YEAR] & 0xf;
}

/** 闰月天数 29 | 30 */
function leapMonthDays(y: number): number {
    return leapMonth(y) ? ((LUNAR_INFO[y - BASE_YEAR] & 0x10000) ? 30 : 29) : 0;
}

/** 第 m 个正常月的天数 (m: 1–12) */
function monthDays(y: number, m: number): number {
    return (LUNAR_INFO[y - BASE_YEAR] & (0x10000 >> m)) ? 30 : 29;
}

/** 农历年总天数 */
function yearDays(y: number): number {
    let sum = 348; // 12 个月 × 29 天
    for (let i = 0x8000; i > 0x8; i >>= 1) {
        if (LUNAR_INFO[y - BASE_YEAR] & i) sum += 1;
    }
    return sum + leapMonthDays(y);
}

// ─── 公历→农历 ──────────────────────────────────────────

export interface LunarDate {
    year: number;       // 农历年
    month: number;      // 农历月 (1–12)
    day: number;        // 农历日 (1–30)
    isLeap: boolean;    // 是否闰月
    yearGanZhi: string; // 干支年（如 丙午）
    zodiac: string;     // 生肖（如 马）
    monthName: string;  // 月名（如 正月）
    dayName: string;    // 日名（如 廿四）
}

export function solarToLunar(sy: number, sm: number, sd: number): LunarDate {
    // sm: 1-12 (公历月)
    const target = new Date(sy, sm - 1, sd);
    let offset = Math.round((target.getTime() - BASE_DATE.getTime()) / 86400000);

    // 定位农历年
    let ly = BASE_YEAR;
    let daysInYear: number;
    for (; ly <= 2100 && offset > 0; ly++) {
        daysInYear = yearDays(ly);
        offset -= daysInYear;
    }
    if (offset < 0) {
        offset += yearDays(--ly);
    }

    // 闰月
    const leap = leapMonth(ly);
    let isLeap = false;

    // 定位农历月
    let lm = 1;
    let daysInMonth: number;
    for (; lm <= 12 && offset > 0; lm++) {
        // 遇到闰月
        if (leap > 0 && lm === leap + 1 && !isLeap) {
            --lm;
            isLeap = true;
            daysInMonth = leapMonthDays(ly);
        } else {
            daysInMonth = monthDays(ly, lm);
        }
        if (isLeap && lm === leap + 1) isLeap = false;
        offset -= daysInMonth;
    }
    if (offset < 0) {
        offset += daysInMonth!;
        --lm;
    }

    // 确认闰月标记
    if (leap > 0 && lm === leap + 1) {
        if (isLeap) {
            isLeap = true;
        }
    }

    const ld = offset + 1;
    const ganIdx = (ly - 4) % 10;
    const zhiIdx = (ly - 4) % 12;

    return {
        year: ly,
        month: lm,
        day: ld,
        isLeap,
        yearGanZhi: TIAN_GAN[ganIdx] + DI_ZHI[zhiIdx],
        zodiac: SHENG_XIAO[zhiIdx],
        monthName: (isLeap ? '闰' : '') + LUNAR_MONTH_NAME[lm - 1] + '月',
        dayName: LUNAR_DAY_NAME[ld - 1] || `${ld}`,
    };
}

// ─── 节日查询 ────────────────────────────────────────────

/** 公历节日 */
const SOLAR_FESTIVALS: Record<string, string> = {
    '1-1': '元旦',
    '2-14': '情人节',
    '3-8': '妇女节',
    '3-12': '植树节',
    '3-15': '消费者日',
    '4-1': '愚人节',
    '5-1': '劳动节',
    '5-4': '青年节',
    '6-1': '儿童节',
    '7-1': '建党节',
    '8-1': '建军节',
    '9-10': '教师节',
    '10-1': '国庆节',
    '12-24': '平安夜',
    '12-25': '圣诞节',
};

/** 农历节日 */
const LUNAR_FESTIVALS: Record<string, string> = {
    '1-1': '春节',
    '1-15': '元宵节',
    '2-2': '龙抬头',
    '5-5': '端午节',
    '7-7': '七夕',
    '7-15': '中元节',
    '8-15': '中秋节',
    '9-9': '重阳节',
    '12-8': '腊八',
    '12-23': '小年',
};

/**
 * 获取指定日期的显示标签
 * 优先级: 公历节日 > 农历节日 > 初一显示月名 > 农历日名
 */
export function getDayLabel(sy: number, sm: number, sd: number): { label: string; isFestival: boolean; lunar: LunarDate } {
    const lunar = solarToLunar(sy, sm, sd);

    // 公历节日
    const solarKey = `${sm}-${sd}`;
    if (SOLAR_FESTIVALS[solarKey]) {
        return { label: SOLAR_FESTIVALS[solarKey], isFestival: true, lunar };
    }

    // 农历节日
    const lunarKey = `${lunar.month}-${lunar.day}`;
    if (!lunar.isLeap && LUNAR_FESTIVALS[lunarKey]) {
        return { label: LUNAR_FESTIVALS[lunarKey], isFestival: true, lunar };
    }

    // 除夕特殊处理：腊月最后一天
    if (!lunar.isLeap && lunar.month === 12) {
        const nextDay = solarToLunar(sy, sm, sd + 1);
        if (nextDay.month === 1 && nextDay.day === 1) {
            return { label: '除夕', isFestival: true, lunar };
        }
    }

    // 初一 → 显示月名
    if (lunar.day === 1) {
        return { label: lunar.monthName, isFestival: false, lunar };
    }

    // 普通日 → 农历日名
    return { label: lunar.dayName, isFestival: false, lunar };
}

// ─── 法定假日 / 调休 ────────────────────────────────────

type HolidayType = '假' | '班';

/** 各年法定假日安排（可按需扩充） */
const HOLIDAY_MAP: Record<string, HolidayType> = {
    // ── 元旦 ──
    '2026-1-1': '假', '2026-1-2': '假', '2026-1-3': '假',
    '2026-1-4': '班',                          // ← 补充

    // ── 春节 ──
    '2026-2-15': '假', '2026-2-16': '假', '2026-2-17': '假', '2026-2-18': '假',
    '2026-2-19': '假', '2026-2-20': '假', '2026-2-21': '假', '2026-2-22': '假', '2026-2-23': '假',
    '2026-2-14': '班', '2026-2-28': '班',      // ← 日期均已修正

    // ── 清明节 ──
    '2026-4-4': '假', '2026-4-5': '假', '2026-4-6': '假',

    // ── 劳动节 ──
    '2026-5-1': '假', '2026-5-2': '假', '2026-5-3': '假', '2026-5-4': '假', '2026-5-5': '假',
    '2026-4-26': '班', '2026-5-9': '班',

    // ── 端午节 ──
    '2026-6-19': '假', '2026-6-20': '假', '2026-6-21': '假',

    // ── 中秋节 ──                             // ← 完整补充
    '2026-9-25': '假', '2026-9-26': '假', '2026-9-27': '假',

    // ── 国庆节 ──
    '2026-10-1': '假', '2026-10-2': '假', '2026-10-3': '假', '2026-10-4': '假',
    '2026-10-5': '假', '2026-10-6': '假', '2026-10-7': '假',
    '2026-9-20': '班', '2026-10-10': '班',     // ← 9-27 改为 9-20
};

export function getHolidayType(y: number, m: number, d: number): HolidayType | null {
    return HOLIDAY_MAP[`${y}-${m}-${d}`] ?? null;
}
