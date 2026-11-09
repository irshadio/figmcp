// A calendar drawn as a real one: its months computed with Calendar, its
// days in a grid of seven columns styled as the design's cells, a tapped
// day selected. The design's own values for each day (a fare, a cheapest
// day) become a lookup by date, and texts elsewhere that show the selected
// day follow the selection.
import { inFlow } from '../layout.js';
import { visibleChildren } from '../nodes.js';
import { baseName, fieldsOf } from './repeat.js';
import { print, raw, sIdent, sNum, sString, view } from './swift.js';

const DAY = /^\s*\d{1,2}\s*$/;
const SELECTED = /select|active|chosen|current|picked|checked/i;
const NAMES = {
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
// Ways a design writes a date, as DateFormatter patterns.
const DATE_FORMATS = ['EEE, d MMM', 'EEE d MMM', 'EEE, d MMM yyyy', 'EEE, MMM d', 'EEEE, d MMMM', 'EEEE, MMMM d', 'd MMM', 'd MMM yyyy',
  'MMM d', 'MMM d, yyyy', 'd MMMM', 'd MMMM yyyy', 'MMMM d', 'MMMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd.MM.yyyy', 'yyyy-MM-dd'];

function texts(n, out = []) {
  if (!n || n.visible === false) return out;
  if (n.type === 'TEXT') out.push(n);
  for (const c of n.children || []) texts(c, out);
  return out;
}

/** The value of the variant property that tells [cells] apart, per cell, or null. */
function variantValues(cells) {
  if (!cells.every((c) => c.type === 'INSTANCE' && c.componentProperties)) return null;
  const keys = Object.keys(cells[0].componentProperties).filter((k) => cells[0].componentProperties[k].type === 'VARIANT');
  for (const k of keys) {
    const values = cells.map((c) => (c.componentProperties[k] || {}).value);
    if (values.every((v) => typeof v === 'string') && new Set(values).size > 1) return values;
  }
  return null;
}

/** The index in [cells] of the day drawn selected: the one cell of a variant named so, else the one cell with a fill. */
function selectedIndex(cells) {
  const variants = variantValues(cells);
  if (variants) {
    const named = variants.map((v, i) => (SELECTED.test(v) ? i : -1)).filter((i) => i >= 0);
    if (named.length === 1) return named[0];
  }
  const filled = cells.map((c, i) => ((c.fills || []).some((p) => p.visible !== false) ? i : -1)).filter((i) => i >= 0);
  return filled.length === 1 && cells.length > 2 ? filled[0] : -1;
}

/** [year]-[month]-[day] written in the English [pattern]. */
function formatDate(year, month, day, pattern) {
  const weekday = NAMES.weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const name = NAMES.months[month - 1];
  const two = (v) => String(v).padStart(2, '0');
  return pattern.replace(/EEEE|EEE|MMMM|MMM|MM|dd|d|yyyy/g, (t) => ({
    EEEE: weekday, EEE: weekday.slice(0, 3), MMMM: name, MMM: name.slice(0, 3), MM: two(month), dd: two(day), d: String(day), yyyy: String(year),
  }[t]));
}

/** [code] indented by [levels] two-space steps after its first line. */
function indent(code, levels) {
  const pad = '  '.repeat(levels);
  return code.split('\n').map((l, i) => (i && l ? `${pad}${l}` : l)).join('\n');
}

/** A data value: text people read is localized, figures stay literals. */
function dataValue(value) {
  return /\p{L}/u.test(String(value)) ? `String(localized: ${sString(value)})` : sString(value);
}

/**
 * Before the screen is drawn, for the calendar [role] (from calendarIn):
 * its day cells and their fields, the names of its types, data and state,
 * the day drawn selected, and bindings for the texts elsewhere on the
 * screen that show that day (its date, or one of its values). False when
 * its days cannot be drawn from data.
 */
export function prepareCalendar(writer, role) {
  const node = (id) => writer.byId.get(id);
  const days = role.months.flatMap((m) => m.cells.filter((c) => c.day).map((c) => ({ day: c.day, node: node(c.id), month: m })));
  if (!days.length || days.some((d) => !d.node)) return false;
  const cells = days.map((d) => d.node);
  const fields = fieldsOf(cells);
  // The day number is the date's; the other texts are the design's data.
  const dayField = fields.find((f) => f.kind === 'text' && f.nodes.every((n) => DAY.test(n.characters || '')));
  if (!dayField || fields.some((f) => f.kind !== 'text')) return false;
  const data = fields.filter((f) => f !== dayField);
  const idents = new Set(['day', 'kind']);
  for (const f of data) {
    let id = sIdent(f.name || f.role, 'detail');
    for (let i = 2; idents.has(id); i++) id = `${sIdent(f.name || f.role, 'detail')}${i}`;
    idents.add(id);
    f.ident = id;
  }
  const label = baseName(cells, [], 'Day');
  const model = writer.typeName(label);
  const calendar = writer.typeName('Month calendar');
  writer.typeNames.add(`${model}View`);
  writer.typeNames.add(`${calendar}View`);
  const chosen = selectedIndex(cells);
  Object.assign(role, {
    days, cells, dayField, data, chosen,
    names: {
      label, model, calendar,
      data: writer.member(`${label} values`, 'days'),
      months: writer.member('months', 'months'),
      state: writer.member('selected date', 'selectedDate'),
      selected: null,
    },
  });
  if (chosen < 0) return true;
  // Texts outside the calendar showing the selected day follow the selection.
  const inside = new Set();
  const mark = (n) => {
    if (!n) return;
    inside.add(n.id);
    (n.children || []).forEach(mark);
  };
  [node(role.header), ...role.months.flatMap((m) => [m.title, m.grid])].forEach(mark);
  const day = days[chosen];
  for (const t of texts(writer.screenNode)) {
    if (inside.has(t.id) || writer.bindings.has(t.id)) continue;
    const shown = String(t.characters || '').trim();
    const format = DATE_FORMATS.find((f) => formatDate(day.month.year, day.month.month, day.day, f) === shown);
    if (format) {
      writer.bindings.set(t.id, `${calendar}View.text(${role.names.state}, ${sString(format)})`);
      continue;
    }
    const field = data.find((f) => f.values[chosen] && f.values[chosen].trim().length >= 3 && shown.includes(f.values[chosen].trim()));
    if (!field) continue;
    role.names.selected = role.names.selected || writer.member(`selected ${label}`, 'selectedDay');
    const value = field.values[chosen].trim();
    const at = shown.indexOf(value);
    const piece = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const part = `\\(${role.names.selected}.${field.ident})`;
    const whole = `${piece(shown.slice(0, at))}${part}${piece(shown.slice(at + value.length))}`;
    writer.bindings.set(t.id, value === shown ? `${role.names.selected}.${field.ident}`
      : /\p{L}/u.test(shown.replace(value, '')) ? `String(localized: "${whole}")` : `"${whole}"`);
  }
  return true;
}

/**
 * The calendar of [column] ([role], prepared) for [writer], in the column's
 * [ctx]: a view for the column's body; its types, data and state go to the
 * screen. Null when it cannot be drawn.
 */
export function calendarView(writer, column, role, ctx) {
  if (!role.names) return null;
  const { days, cells, dayField, data, chosen } = role;
  const { model, calendar } = role.names;
  const cellView = `${model}View`;
  const header = writer.byId.get(role.header);
  const headCells = visibleChildren(header).filter((c) => inFlow(c, header));

  // Each cell drawn as a cell of the grid, its texts bound to the day.
  const draw = (n, bind, context) => {
    const saved = { actions: writer.actions, inComponent: writer.inComponent };
    const kept = bind.map(([t]) => [t.id, writer.bindings.get(t.id)]);
    for (const [t, expr] of bind) writer.bindings.set(t.id, expr);
    writer.actions = {};
    writer.inComponent = true;
    if (!context) writer.stretchCells.add(n.id);
    try {
      return writer.node(n, context || { kind: 'cell', parent: writer.parents.get(n.id) || column });
    } finally {
      Object.assign(writer, saved);
      for (const [id, was] of kept) {
        if (was === undefined) writer.bindings.delete(id);
        else writer.bindings.set(id, was);
      }
    }
  };
  const codes = cells.map((n, i) => {
    const t = draw(n, [[dayField.nodes[i], 'String(day)'], ...data.map((f) => [f.nodes[i], `item.${f.ident}`])]);
    return t ? print(t, 0) : '';
  });
  if (codes.some((c) => !c)) return null;

  // Looks: the variant (or else the drawing) of each cell. The most common
  // is the plain day; the selected one is drawn for the selection; the rest
  // are kinds of day the data names (a cheapest day).
  const variants = variantValues(cells);
  const groups = new Map();
  cells.forEach((_, i) => {
    const k = variants ? variants[i] : codes[i];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const plain = ordered[0];
  const selected = chosen >= 0 && !plain.includes(chosen) ? ordered.find((g) => g.includes(chosen)) : null;
  const kinds = ordered.filter((g) => g !== plain && g !== selected);
  const kindCases = kinds.map((g, i) => {
    const c = variants ? sIdent(variants[g[0]], `kind${i + 2}`) : `kind${i + 2}`;
    return c === 'normal' ? 'normal2' : c;
  });
  const kindOf = new Map();
  kinds.forEach((g, i) => g.forEach((j) => kindOf.set(j, kindCases[i])));
  if (!selected) writer.warn(column, 'no day is drawn selected: a tapped day is selected without a look of its own');

  const byKind = kinds.length
    ? ['switch item.kind {', ...kinds.flatMap((g, i) => [`case .${kindCases[i]}:`, `  ${indent(codes[g[0]], 1)}`]),
      'case .normal:', `  ${indent(codes[plain[0]], 1)}`, '}'].join('\n')
    : codes[plain[0]];
  const body = selected
    ? ['if isSelected {', `  ${indent(codes[selected[0]], 1)}`, '} else {', `  ${indent(byKind, 1)}`, '}'].join('\n')
    : byKind;
  writer.models.push([
    '/// The design\'s values for a day of the calendar.',
    `struct ${model}: Hashable {`,
    `  enum Kind: Hashable { case normal${kindCases.map((c) => `, ${c}`).join('')} }`,
    ...data.map((f) => `  var ${f.ident} = ""`),
    '  var kind = Kind.normal',
    '}',
  ].join('\n'));
  writer.components.push([
    `struct ${cellView}: View {`,
    '  let day: Int',
    `  let item: ${model}`,
    ...(selected ? ['  var isSelected = false'] : []),
    '',
    '  var body: some View {',
    `    ${indent(body, 2)}`,
    '  }',
    '}',
  ].join('\n'));

  // The weekday labels and the month titles, as the design draws them.
  const symbol = texts(headCells[0])[0];
  const headCode = print(draw(headCells[0], [[symbol, 'symbol']]), 0);
  const title = role.months[0].title;
  const titleCode = print(draw(title, [[title, 'month.formatted(.dateTime.month(.wide).year())']], ctx), 0);
  const n2 = (v) => sNum(Math.round(v * 100) / 100);
  const columns = `Array(repeating: GridItem(.flexible(), spacing: ${n2(role.columnGap)}), count: 7)`;
  const rowGap = n2(role.rowGap);
  const value = data.length ? `\n              .accessibilityValue(item.${data[0].ident})` : '';
  writer.components.push(`/// Months of days in weeks, as the design lays them out: a tapped day is selected.
struct ${calendar}View: View {
  let months: [Date]
  @Binding var selection: Date?
  let days: [String: ${model}]
  @Environment(\\.accessibilityReduceMotion) private var reduceMotion

  private let columns = ${columns}
  private static let weekdays = [${role.labels.map((l) => sString(l)).join(', ')}]

  var body: some View {
    VStack(alignment: .leading, spacing: ${n2(column.itemSpacing || 0)}) {
      LazyVGrid(columns: columns, spacing: ${rowGap}) {
        ForEach(Array(Self.weekdays.enumerated()), id: \\.offset) { _, symbol in
          ${indent(headCode, 5)}
        }
      }
      .accessibilityHidden(true)
      ForEach(months, id: \\.self) { month in
        ${indent(titleCode, 4)}
          .accessibilityAddTraits(.isHeader)
        LazyVGrid(columns: columns, spacing: ${rowGap}) {
          ForEach(Array(Self.days(in: month).enumerated()), id: \\.offset) { _, date in
            if let date {
              let item = days[Self.key(date)] ?? ${model}()
              Button {
                withAnimation(reduceMotion ? nil : .snappy) { selection = date }
              } label: {
                ${cellView}(day: Self.calendar.component(.day, from: date), item: item${selected ? ', isSelected: date == selection' : ''})
              }
              .buttonStyle(.pressable)
              .accessibilityLabel(Text(date, format: .dateTime.weekday(.wide).day().month(.wide)))${value}
              .accessibilityAddTraits(date == selection ? .isSelected : [])
            } else {
              Color.clear
                .frame(height: ${n2(role.cell.height)})
            }
          }
        }
      }
    }
    .sensoryFeedback(.selection, trigger: selection)
  }

  /// The calendar the design's weeks follow.
  static let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.firstWeekday = ${role.firstWeekday + 1}
    return calendar
  }()

  /// The day [year]-[month]-[day]; months past 12 run into the next years.
  static func date(_ year: Int, _ month: Int, _ day: Int) -> Date? {
    calendar.date(from: DateComponents(year: year, month: month, day: day))
  }

  /// The days of [month], after an empty cell for each weekday before its first.
  static func days(in month: Date) -> [Date?] {
    guard let range = calendar.range(of: .day, in: .month, for: month) else { return [] }
    let lead = (calendar.component(.weekday, from: month) - calendar.firstWeekday + 7) % 7
    return Array(repeating: nil, count: lead) + range.map { calendar.date(byAdding: .day, value: $0 - 1, to: month) }
  }

  /// The key of [date] in the data: "2026-11-20".
  static func key(_ date: Date) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  /// [date] written with [format] in the person's language, or nothing when no day is selected.
  static func text(_ date: Date?, _ format: String) -> String {
    guard let date else { return "" }
    let formatter = DateFormatter()
    formatter.calendar = calendar
    formatter.dateFormat = format
    return formatter.string(from: date)
  }
}`);
  writer.helpers.add('pressable');

  // The design's days: their values and kinds.
  const key = (d) => `${String(d.month.year).padStart(4, '0')}-${String(d.month.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  const rows = days.map((d, i) => {
    const args = [...data.map((f) => (f.values[i] ? `${f.ident}: ${dataValue(f.values[i])}` : null)),
      kindOf.has(i) ? `kind: .${kindOf.get(i)}` : null].filter(Boolean);
    return args.length ? `    ${sString(key(d))}: ${model}(${args.join(', ')}),` : null;
  }).filter(Boolean);
  const names = role.names;
  writer.lets.push([`  private let ${names.data}: [String: ${model}] = [`, ...rows, '  ]'].join('\n'));
  const first = role.months[0];
  writer.lets.push(`  /// A year of months from the design's first.\n  private let ${names.months} = (0..<12).compactMap { ${calendar}View.date(${first.year}, ${first.month} + $0, 1) }`);
  if (names.selected) {
    writer.lets.push(`  /// The design's values for the selected day.\n  private var ${names.selected}: ${model} {\n    ${names.state}.flatMap { ${names.data}[${calendar}View.key($0)] } ?? ${model}()\n  }`);
  }
  const day = chosen >= 0 ? days[chosen] : null;
  writer.states.push(`  @State private var ${names.state}: Date? = ${day ? `${calendar}View.date(${day.month.year}, ${day.month.month}, ${day.day})` : 'nil'}`);
  return view(`${calendar}View`, [['months', raw(names.months)], ['selection', raw(`$${names.state}`)], ['days', raw(names.data)]]);
}
