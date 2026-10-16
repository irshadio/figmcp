// Month calendars in a design: a row of weekday initials over month titles
// and grids of day numbers in weeks. One is only taken for a calendar when
// its days fall on the weekdays the real month puts them on.
import { inFlow, isAutoLayout } from './layout.js';
import { visibleChildren } from './nodes.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function texts(n, out = []) {
  if (!n || n.visible === false) return out;
  if (n.type === 'TEXT') out.push(n);
  for (const c of n.children || []) texts(c, out);
  return out;
}

/** { year, month } (month 1 to 12) of a title such as "November 2026" or "Nov 2026", else null. */
export function monthOf(title) {
  const m = /^\s*([A-Za-z]+)\.?,?\s+(\d{4})\s*$/.exec(String(title || ''));
  if (!m) return null;
  const name = m[1].toLowerCase();
  const i = MONTHS.findIndex((x) => x === name || (name.length >= 3 && x.startsWith(name)));
  return i < 0 ? null : { year: Number(m[2]), month: i + 1 };
}

/** The first weekday (0 Sunday to 6 Saturday) of seven weekday labels in order ("S M T W T F S", "Mon Tue ..."), else -1. */
export function firstWeekdayOf(labels) {
  if (labels.length !== 7) return -1;
  const plain = labels.map((l) => String(l).trim().replace(/\.$/, '').toLowerCase());
  if (!plain.every((l) => /^[a-z]{1,3}$/.test(l))) return -1;
  for (let start = 0; start < 7; start++) {
    if (plain.every((l, i) => WEEKDAYS[(start + i) % 7].startsWith(l))) return start;
  }
  return -1;
}

/** Days in [month] of [year], and the weekday (0 Sunday) of its first day. */
function monthShape(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first, days };
}

/** Seven cells of one shape: a week or a weekday header. */
function weekRow(n) {
  if (!n || n.layoutMode !== 'HORIZONTAL') return null;
  const cells = visibleChildren(n).filter((c) => inFlow(c, n));
  if (cells.length !== 7) return null;
  const w = cells[0].width;
  const h = cells[0].height;
  return cells.every((c) => Math.abs(c.width - w) <= 0.5 && Math.abs(c.height - h) <= 0.5) ? cells : null;
}

/** The day number a cell shows, 0 for an empty cell, or null when it shows something else. */
function dayOf(cell) {
  const ts = texts(cell);
  if (!ts.length) return 0;
  const numbers = ts.filter((t) => /^\s*\d{1,2}\s*$/.test(t.characters || ''));
  return numbers.length === 1 ? Number(numbers[0].characters) : null;
}

/**
 * The calendar in the column [n]: a weekday header row followed by month
 * titles and month grids (columns of week rows), their days on the real
 * weekdays. Returns { header, firstWeekday, labels, months: [{ title, grid,
 * year, month, cells: [{ id, day }] }], spacing } or null.
 */
export function calendarIn(n) {
  if (!n || !isAutoLayout(n) || n.layoutMode !== 'VERTICAL') return null;
  const flow = visibleChildren(n).filter((c) => inFlow(c, n));
  for (let i = 0; i < flow.length; i++) {
    const head = weekRow(flow[i]);
    if (!head || !head.every((c) => texts(c).length === 1)) continue;
    const labels = head.map((c) => texts(c)[0].characters);
    const firstWeekday = firstWeekdayOf(labels);
    if (firstWeekday < 0) continue;
    const months = [];
    let j = i + 1;
    while (j < flow.length && flow[j].type === 'TEXT') {
      const which = monthOf(flow[j].characters);
      const grid = flow[j + 1];
      if (!which || !grid || grid.layoutMode !== 'VERTICAL') break;
      const weeks = visibleChildren(grid).filter((c) => inFlow(c, grid)).map(weekRow);
      if (!weeks.length || weeks.some((w) => !w)) break;
      const cells = weeks.flat().map((c) => ({ id: c.id, node: c, day: dayOf(c) }));
      if (cells.some((c) => c.day === null)) break;
      // The days run from the 1st on its weekday, one a cell, empty cells only around them.
      const { first, days } = monthShape(which.year, which.month);
      const lead = (first - firstWeekday + 7) % 7;
      const shown = cells.filter((c) => c.day > 0);
      const ok = cells.slice(0, lead).every((c) => c.day === 0) &&
        shown.length && shown.every((c, k) => c.day === k + 1 && cells.indexOf(c) === lead + k) &&
        shown.length <= days && (shown.length === days || shown.length === cells.length - lead) &&
        cells.slice(lead + shown.length).every((c) => c.day === 0);
      if (!ok) break;
      // Weeks after the last day of the month are not drawn.
      if (cells.length - lead - shown.length >= 7) break;
      months.push({ title: flow[j], grid, year: which.year, month: which.month, cells: cells.map(({ id, day }) => ({ id, day })) });
      j += 2;
    }
    if (!months.length) continue;
    const row = visibleChildren(months[0].grid)[0];
    const cell = visibleChildren(row)[0];
    const next = visibleChildren(row)[1];
    const rows = visibleChildren(months[0].grid);
    return {
      header: flow[i].id,
      firstWeekday,
      labels,
      months,
      cell: { width: cell.width, height: cell.height },
      columnGap: Math.max(0, next.x - cell.x - cell.width),
      rowGap: rows.length > 1 ? Math.max(0, rows[1].y - rows[0].y - rows[0].height) : (months[0].grid.itemSpacing || 0),
      ends: flow[j - 1].id,
    };
  }
  return null;
}
