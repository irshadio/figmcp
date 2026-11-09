import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { calendarIn, firstWeekdayOf, monthOf } from '../src/codegen/calendar.js';
import { toSwiftUI } from '../src/codegen/swiftui/index.js';

const assets = { svg: () => '/tmp/i.svg', image: (h) => `/tmp/${h}.png`, imageExt: () => 'png', render: () => '/tmp/r.png' };
const ink = { r: 0.07, g: 0.08, b: 0.17, a: 1 };
const brand = { r: 0.24, g: 0.23, b: 0.85, a: 1 };
const solid = (color) => ({ type: 'SOLID', visible: true, color });
let next = 1;
const id = () => `9:${next++}`;

function text(characters, x, y, { size = 13, color = ink } = {}) {
  return {
    id: id(), name: characters, type: 'TEXT', x, y, width: 8 * characters.length, height: 18, characters,
    textAutoResize: 'WIDTH_AND_HEIGHT', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
    segments: [{ characters, fontSize: size, fontName: { family: 'Inter', style: 'Medium' }, fontWeight: 500,
      lineHeight: { unit: 'PIXELS', value: 18 }, fills: [solid(color)] }],
  };
}

function row(name, x, y, cells) {
  return { id: id(), name, type: 'FRAME', x, y, width: 358, height: cells[0].height, layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', children: cells };
}

/** A day cell: day number over a fare, an instance of a State variant. */
function cell(day, x, y, state = 'Default') {
  if (!day) return { id: id(), name: 'Empty', type: 'FRAME', x, y, width: 46, height: 52, children: [] };
  return {
    id: id(), name: 'Date cell', type: 'INSTANCE', x, y, width: 46, height: 52, layoutMode: 'VERTICAL', itemSpacing: 1,
    primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    cornerRadius: 10, fills: state === 'Selected' ? [solid(brand)] : [],
    componentProperties: { State: { type: 'VARIANT', value: state } },
    children: [text(String(day), x + 15, y + 7, { size: 15, color: state === 'Selected' ? { r: 1, g: 1, b: 1, a: 1 } : ink }),
      text(`₹${10 + day}k`, x + 7, y + 29, { size: 10 })],
  };
}

/** A month grid: weeks of seven cells, from [first] (the weekday of the 1st, 0 Sunday) for [days] days, [weeks] weeks drawn. */
function month(y, first, days, weeks, states = {}) {
  const rows = [];
  for (let w = 0; w < weeks; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const day = w * 7 + d - first + 1;
      cells.push(cell(day >= 1 && day <= days ? day : 0, 16 + d * 52, y + w * 56, states[day]));
    }
    rows.push(row('Week', 16, y + w * 56, cells));
  }
  return { id: id(), name: 'Month', type: 'FRAME', x: 16, y, width: 358, height: weeks * 56 - 4, layoutMode: 'VERTICAL', itemSpacing: 4,
    layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', children: rows };
}

function header(y, labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']) {
  return row('Weekdays', 16, y, labels.map((l, i) => ({ id: id(), name: l, type: 'FRAME', x: 16 + i * 52, y, width: 46, height: 18,
    layoutMode: 'HORIZONTAL', primaryAxisAlignItems: 'CENTER', children: [text(l, 16 + i * 52 + 19, y)] })));
}

function screen(children) {
  const column = { id: id(), name: 'Content', type: 'FRAME', x: 0, y: 100, width: 390, height: 600, layoutMode: 'VERTICAL', itemSpacing: 12,
    paddingLeft: 16, paddingRight: 16, counterAxisAlignItems: 'MIN', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', children };
  return { id: id(), name: 'Pick a date', type: 'FRAME', x: 0, y: 0, width: 390, height: 844, layoutMode: 'VERTICAL', counterAxisAlignItems: 'MIN',
    fills: [solid({ r: 1, g: 1, b: 1, a: 1 })], children: [column] };
}

test('month titles and weekday headers are read', () => {
  assert.deepEqual(monthOf('November 2026'), { year: 2026, month: 11 });
  assert.deepEqual(monthOf('Sept 2026'), { year: 2026, month: 9 });
  assert.equal(monthOf('Total 2026'), null);
  assert.equal(firstWeekdayOf(['S', 'M', 'T', 'W', 'T', 'F', 'S']), 0);
  assert.equal(firstWeekdayOf(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']), 1);
  assert.equal(firstWeekdayOf(['A', 'B', 'C', 'D', 'E', 'F', 'G']), -1);
});

test('a calendar whose days fall on their real weekdays becomes a calendar of state and data', () => {
  // November 2026 starts on a Sunday; December 2026 on a Tuesday, its first week shown.
  const root = screen([header(100), text('November 2026', 16, 130), month(164, 0, 30, 5, { 20: 'Selected', 17: 'Cheapest' }),
    text('December 2026', 16, 450), month(484, 2, 31, 1)]);
  const column = root.children[0];
  const found = calendarIn(column);
  assert.equal(found.firstWeekday, 0);
  assert.deepEqual(found.months.map((m) => [m.year, m.month]), [[2026, 11], [2026, 12]]);
  const { code } = toSwiftUI(root, assets);
  assert.match(code, /@State private var selectedDate: Date\? = MonthCalendarView\.date\(2026, 11, 20\)/);
  assert.match(code, /"2026-11-17": DateCell\(\w+: String\(localized: "₹27k"\), kind: \.cheapest\)/);
  assert.match(code, /MonthCalendarView\.date\(2026, 11 \+ \$0, 1\)/);
  assert.match(code, /LazyVGrid\(columns: columns, spacing: 4\)/);
  assert.match(code, /GridItem\(\.flexible\(\), spacing: 6\), count: 7/);
  assert.match(code, /if isSelected \{[\s\S]*?\} else \{\n\s+switch item\.kind \{\n\s+case \.cheapest:/);
  assert.match(code, /Text\(month\.formatted\(\.dateTime\.month\(\.wide\)\.year\(\)\)\)/);
  assert.equal((code.match(/struct DateCell\w*View/g) || []).length, 1, 'one cell view for every day');
});

test('grids that are not the real month stay as drawn', () => {
  // November 2026 drawn from Monday: its days are not on their weekdays.
  const shifted = screen([header(100), text('November 2026', 16, 130), month(164, 1, 30, 5)]);
  assert.equal(calendarIn(shifted.children[0]), null);
  // Seats: rows of seven numbered cells without weekday initials or month titles.
  const seats = screen([month(164, 0, 28, 4)]);
  assert.equal(calendarIn(seats.children[0]), null);
  // A date strip: one row of day cells.
  const strip = screen([row('Dates', 16, 100, [18, 19, 20, 21, 22, 23, 24].map((d, i) => cell(d, 16 + i * 52, 100)))]);
  assert.equal(calendarIn(strip.children[0]), null);
  // A keypad: three columns of digits under a title.
  const keys = screen([text('November 2026', 16, 130), { id: id(), name: 'Keys', type: 'FRAME', x: 16, y: 164, width: 358, height: 200,
    layoutMode: 'VERTICAL', children: [1, 4, 7].map((k, r) => row('Row', 16, 164 + r * 56, [k, k + 1, k + 2].map((d, i) => cell(d, 16 + i * 120, 164 + r * 56)))) }]);
  assert.equal(calendarIn(keys.children[0]), null);
});

const sdk = (() => {
  const r = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
})();

test('the calendar type checks', { skip: sdk ? false : 'xcrun is not available' }, () => {
  const root = screen([header(100), text('November 2026', 16, 130), month(164, 0, 30, 5, { 20: 'Selected', 17: 'Cheapest' })]);
  const r = toSwiftUI(root, assets, { preview: false });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-calendar-'));
  try {
    fs.writeFileSync(path.join(dir, 'Screen.swift'), r.code);
    fs.writeFileSync(path.join(dir, 'DesignSystem.swift'), r.shared);
    const out = spawnSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator',
      '-sdk', sdk, path.join(dir, 'Screen.swift'), path.join(dir, 'DesignSystem.swift')], { encoding: 'utf8' });
    assert.equal(out.stderr.trim(), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
