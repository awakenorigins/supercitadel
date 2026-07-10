/**
 * SOUL-MEETING 1A — recurrence engine nội bộ (rrule-lite, zero-dep).
 * Delta so với mapping v1.1 (đã ghi AUDIT_REPORT): thay vì kéo dep rrule.js,
 * tự hiện thực tập con RFC5545 đủ cho họp SME: DAILY / WEEKLY(BYDAY) /
 * MONTHLY(BYMONTHDAY ≤28) + INTERVAL + UNTIL/COUNT. Zero-dep = plug-and-play sạch,
 * hành vi deterministic, test từng nhánh. Import/export chuỗi RRULE để 1B.
 *
 * Timezone: VN không DST → tính thứ/ngày theo offset cố định +07:00
 * (offsetMinutes param, mặc định 420) bất kể server chạy UTC hay giờ nào.
 */

export interface RecurRule {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;                  // 1..12
  byDays?: string[];                 // weekly: ['MO','WE'] — thứ theo giờ VN
  byMonthday?: number;               // monthly: 1..28
  untilDate?: string;                // 'yyyy-mm-dd' (bao gồm, theo giờ VN)
  maxCount?: number;                 // tổng occurrence tính từ anchor
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const MS_DAY = 86_400_000;
export const VN_OFFSET_MINUTES = 420;

function localParts(d: Date, offsetMin: number) {
  const t = new Date(d.getTime() + offsetMin * 60_000);
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate(),
    dow: t.getUTCDay(), hh: t.getUTCHours(), mm: t.getUTCMinutes(),
  };
}
function fromLocal(y: number, m: number, day: number, hh: number, mm: number, offsetMin: number): Date {
  return new Date(Date.UTC(y, m, day, hh, mm) - offsetMin * 60_000);
}

export function validateRule(rule: RecurRule): string | null {
  if (!['daily', 'weekly', 'monthly'].includes(rule.freq)) return 'freq không hợp lệ';
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 12) return 'interval 1..12';
  if (rule.freq === 'weekly' && rule.byDays) {
    if (rule.byDays.length === 0) return 'byDays rỗng';
    for (const d of rule.byDays) if (!DAY_CODES.includes(d as never)) return `byDays chứa mã lạ: ${d}`;
  }
  if (rule.freq === 'monthly') {
    const md = rule.byMonthday;
    if (md !== undefined && (!Number.isInteger(md) || md < 1 || md > 28)) return 'byMonthday 1..28';
  }
  if (rule.maxCount !== undefined && (!Number.isInteger(rule.maxCount) || rule.maxCount < 1)) return 'maxCount >= 1';
  return null;
}

/**
 * Liệt kê TOÀN BỘ thời điểm bắt đầu của chuỗi theo thứ tự tăng dần, bắt đầu từ
 * anchor (occurrence #0 luôn là anchor với daily/monthly; với weekly là các
 * candidate >= anchor). Dừng khi vượt untilDate, đạt maxCount, vượt hardLimit
 * thời gian, hoặc chạm cap 500 phần tử (an toàn).
 */
function enumerate(anchor: Date, rule: RecurRule, hardLimitMs: number, offsetMin: number): Date[] {
  const a = localParts(anchor, offsetMin);
  const untilMs = rule.untilDate
    ? fromLocal(
        Number(rule.untilDate.slice(0, 4)), Number(rule.untilDate.slice(5, 7)) - 1,
        Number(rule.untilDate.slice(8, 10)), 23, 59, offsetMin,
      ).getTime()
    : Infinity;
  const cap = rule.maxCount ?? Infinity;
  const stopMs = Math.min(untilMs, hardLimitMs);
  const out: Date[] = [];
  const take = (d: Date): boolean => {           // false = dừng hẳn chuỗi
    if (d.getTime() > stopMs || out.length >= cap || out.length >= 500) return false;
    out.push(d);
    return true;
  };

  if (rule.freq === 'daily') {
    for (let i = 0; ; i++) {
      const d = new Date(anchor.getTime() + i * rule.interval * MS_DAY);
      if (!take(d)) break;
    }
  } else if (rule.freq === 'weekly') {
    const days = (rule.byDays && rule.byDays.length ? rule.byDays : [DAY_CODES[a.dow]])
      .map((c) => DAY_CODES.indexOf(c as never)).sort((x, y) => x - y);
    const weekStartLocalDay = a.day - a.dow;      // CN của tuần chứa anchor (giờ VN)
    outer: for (let week = 0; week < 600; week++) {
      for (const dow of days) {
        const d = fromLocal(a.y, a.m, weekStartLocalDay + week * 7 * rule.interval + dow, a.hh, a.mm, offsetMin);
        if (d.getTime() < anchor.getTime()) continue;   // trước anchor: không thuộc chuỗi
        if (!take(d)) break outer;
      }
    }
  } else { // monthly
    const md = rule.byMonthday ?? Math.min(a.day, 28);
    for (let k = 0; k < 600; k++) {
      const d = fromLocal(a.y, a.m + k * rule.interval, md, a.hh, a.mm, offsetMin);
      if (d.getTime() < anchor.getTime()) continue;
      if (!take(d)) break;
    }
  }
  return out;
}

/** Các occurrence nằm trong [windowStart, windowEnd] (bao gồm 2 đầu). */
export function occurrencesBetween(
  anchor: Date, rule: RecurRule, windowStart: Date, windowEnd: Date,
  offsetMin: number = VN_OFFSET_MINUTES,
): Date[] {
  return enumerate(anchor, rule, windowEnd.getTime(), offsetMin)
    .filter((d) => d.getTime() >= windowStart.getTime() && d.getTime() <= windowEnd.getTime());
}

/** Human-readable tiếng Việt cho rule (UI + Tiểu Tâm) */
export function describeRule(rule: RecurRule): string {
  const VN_DOW: Record<string, string> = { SU: 'CN', MO: 'T2', TU: 'T3', WE: 'T4', TH: 'T5', FR: 'T6', SA: 'T7' };
  const every = rule.interval > 1 ? `${rule.interval} ` : '';
  let base = '';
  if (rule.freq === 'daily') base = `mỗi ${every}ngày`;
  else if (rule.freq === 'weekly') {
    const days = (rule.byDays ?? []).map((d) => VN_DOW[d] ?? d).join(', ');
    base = `mỗi ${every}tuần${days ? ` vào ${days}` : ''}`;
  } else base = `mỗi ${every}tháng${rule.byMonthday ? ` ngày ${rule.byMonthday}` : ''}`;
  if (rule.untilDate) base += ` đến ${rule.untilDate}`;
  if (rule.maxCount) base += ` (${rule.maxCount} kỳ)`;
  return base;
}
