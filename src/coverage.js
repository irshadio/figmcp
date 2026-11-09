// What a render check covered and what it left for a person: a pixel match
// says the default state looks right, not that pressed, disabled or keyboard
// behaviour is. Built from the roles the generators detect, the states the
// design's components define, and what the run itself did.
import { detectRoles } from './codegen/roles.js';

// Item roles: their container carries the checklist.
const ITEM_ROLES = new Set(['tab', 'segment', 'chip', 'card']);
const ACTIONS = new Set(['button', 'iconButton', 'link', 'listRow', 'option', 'field', 'sectionHeader']);

const STATE_WORDS = [
  ['hover', /hover/i],
  ['pressed', /press|active|tap|down|click/i],
  ['focus', /focus/i],
  ['disabled', /disabled?|inactive|unavailable/i],
  ['loading', /loading|busy|progress|spinner/i],
  ['error', /error|invalid|danger|fail/i],
  ['filled', /filled|typing|entered|value/i],
  ['selected', /selected|checked|\bon\b|current/i],
  ['default', /default|enabled|rest|normal|idle|\boff\b/i],
];
const STATE_PROPS = /state|status|interaction|mode|variant|type|disabled|enabled|loading|selected|active|hover|press|focus|error/i;

/** The interaction state a variant value or property names, or null. */
function stateOf(word) {
  const hit = STATE_WORDS.find(([, re]) => re.test(word));
  return hit ? hit[0] : null;
}

/**
 * The states [node]'s component defines: from its variant options (all the
 * set offers), its current variant, boolean properties named for a state,
 * and prototype hover or press changes. { current, defined: Map state -> how,
 * complete } where complete says whether the set's options were exported.
 */
export function designStates(node) {
  const defined = new Map();
  let current = null;
  let variants = 0;
  let listed = 0;
  for (const [key, prop] of Object.entries(node.componentProperties || {})) {
    if (!prop) continue;
    const name = key.replace(/#.*$/, '');
    if (prop.type === 'VARIANT' && STATE_PROPS.test(name)) {
      const options = Array.isArray(prop.variantOptions) ? prop.variantOptions : null;
      variants++;
      if (options) listed++;
      for (const value of options || [prop.value]) {
        const s = stateOf(String(value));
        if (s && !defined.has(s)) defined.set(s, `${name}=${value}`);
      }
      const s = stateOf(String(prop.value));
      if (s) current = s;
    } else if (prop.type === 'BOOLEAN') {
      const s = stateOf(name);
      if (s && s !== 'default') {
        defined.set(s, `${name} property`);
        if (prop.value === true) current = s;
      }
    }
  }
  for (const r of node.reactions || []) {
    if (!/CHANGE_TO|NODE/.test(r.action || '') || (r.action === 'NODE' && r.navigation !== 'CHANGE_TO')) continue;
    if (/HOVER/.test(r.trigger || '') && !defined.has('hover')) defined.set('hover', 'prototype hover');
    if (/PRESS/.test(r.trigger || '') && !defined.has('pressed')) defined.set('pressed', 'prototype press');
  }
  // Without a variant there is nothing more to know; with one, its options must be exported.
  return { current, defined, complete: listed === variants };
}

const WEB = {
  action: {
    states: ['hover', 'pressed', 'focus', 'disabled', 'loading'],
    behaviour: ['what activating it does (navigation or state change)'],
    a11y: ['accessible name read by a screen reader'],
  },
  textInput: {
    states: ['focus', 'filled', 'error', 'disabled'],
    behaviour: ['validation and its message', 'autocomplete and input type'],
    a11y: ['a label tied to the input'],
  },
  choice: {
    states: ['selected', 'hover', 'focus', 'disabled'],
    behaviour: ['changing the selection', 'arrow keys move between items'],
    a11y: ['the selected item announced (aria-selected or aria-pressed)'],
  },
  switch: {
    states: ['selected', 'focus', 'disabled'],
    behaviour: ['toggling with Space'],
    a11y: ['role switch with aria-checked'],
  },
  carousel: { states: [], behaviour: ['scrolling by keyboard and swipe', 'items past the edge'], a11y: [] },
  calendar: { states: ['selected', 'disabled'], behaviour: ['arrow keys move between days', 'selecting a date'], a11y: ['day names read in full'] },
  progress: { states: [], behaviour: ['other values (empty, full)'], a11y: ['aria-valuenow'] },
};

const NATIVE = (platform) => {
  const reader = platform === 'swiftui' ? 'VoiceOver' : 'TalkBack and VoiceOver';
  const keyboard = platform === 'swiftui' ? 'Full Keyboard Access focus' : 'keyboard focus (desktop, web, hardware keyboards)';
  return {
    action: {
      states: ['pressed', 'disabled', 'loading', 'focus'],
      behaviour: ['what tapping it does (navigation or state change)', keyboard],
      a11y: [`${reader} label and button trait`],
    },
    textInput: {
      states: ['focus', 'filled', 'error', 'disabled'],
      behaviour: ['keyboard type and submit key', 'moving focus to the next field', 'validation and its message'],
      a11y: [`${reader} label`],
    },
    choice: {
      states: ['selected', 'pressed', 'disabled'],
      behaviour: ['changing the selection'],
      a11y: [`the selected item announced by ${reader}`],
    },
    switch: { states: ['selected', 'disabled'], behaviour: ['toggling'], a11y: [`${reader} reads on or off`] },
    carousel: { states: [], behaviour: ['swiping and snapping', 'items past the edge'], a11y: [] },
    calendar: { states: ['selected', 'disabled'], behaviour: ['selecting a date', 'changing month'], a11y: [`${reader} reads full dates`] },
    progress: { states: [], behaviour: ['other values (empty, full)'], a11y: [`${reader} reads the value`] },
  };
};

function kindOf(role) {
  if (ACTIONS.has(role)) return 'action';
  if (['tabBar', 'tabs', 'segmented', 'chips', 'swapFields'].includes(role)) return 'choice';
  if (['textInput', 'switch', 'carousel', 'calendar', 'progress'].includes(role)) return role;
  return null;
}

function find(tree, id) {
  if (!tree) return null;
  if (tree.id === id) return tree;
  for (const c of tree.children || []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
}

function labelOf(r) {
  const raw = r.label || r.title || r.name || r.role;
  return String(raw).replace(/\s*\[[A-Za-z-]+\]\s*/, '').trim().slice(0, 40) || r.role;
}

/** A state on the list: rendered, in the design but not checked, or not drawn at all. */
function stateItem(state, states, rendered) {
  if (state === rendered) return null;
  const how = states.defined.get(state);
  if (how) return `${state} state (in the design as ${how}; not rendered)`;
  if (state === 'focus' || state === 'loading') return `${state} state (not in the design)`;
  return `${state} state (not in the design${states.complete ? '' : ' as far as the export shows'})`;
}

/**
 * The coverage of a check: { checked, notChecked, screen }. [run] is what the
 * check did: { framework, width, height, viewport, checkedLayers, pixels,
 * dynamicType, interactions (SwiftUI taps), keyboard (web probe), project }.
 */
export function coverage(tree, run) {
  const { framework } = run;
  const web = framework === 'react' || framework === 'html';
  const lists = web ? WEB : NATIVE(framework);
  const checked = [];
  if (run.viewport) checked.push(`layout at ${run.viewport.width}x${run.viewport.height}: overflow and layers pushed off screen`);
  else {
    checked.push(`default state at ${Math.round(tree.width)}x${Math.round(tree.height)}, light mode${framework === 'swiftui' ? ', Large text' : ''}` +
      (run.pixels ? `: ${run.pixels.differingPercent}% of pixels differ` : ''));
    if (run.checkedLayers) checked.push(`${run.checkedLayers} layer boxes against the design`);
  }
  if (run.dynamicType) checked.push(`layout at Dynamic Type ${run.dynamicType}`);
  if (run.interactions) checked.push(`tapped ${run.interactions.each.length} button${run.interactions.each.length === 1 ? '' : 's'}`);
  if (run.keyboard && !run.keyboard.error) {
    const k = run.keyboard;
    checked.push(`keyboard: ${k.tabOrder.length} element${k.tabOrder.length === 1 ? '' : 's'} reached with Tab, focus indicator, ` +
      'Enter and Space activation, accessible names');
  }

  const roles = [...detectRoles(tree).values()].filter((r) => !ITEM_ROLES.has(r.role) && kindOf(r.role));
  let partialExport = false;
  const elements = roles.map((r) => {
    const node = find(tree, r.id) || {};
    const states = designStates(node);
    if (!states.complete) partialExport = true;
    const list = lists[kindOf(r.role)];
    const label = labelOf(r);
    const done = [];
    const todo = list.states.map((s) => stateItem(s, states, states.current || 'default')).filter(Boolean);
    let behaviour = [...list.behaviour];
    let a11y = [...list.a11y];
    const tap = run.interactions && run.interactions.each.find((t) => t.label && labelMatch(t.label, label));
    if (tap) {
      done.push(`tap: ${tap.hung ? 'hung' : [tap.redrew ? 'redrew' : null, tap.action ? `asked the owner ${tap.action}` : null]
        .filter(Boolean).join(', ') || 'no visible effect'}`);
    }
    const key = run.keyboard && run.keyboard.elements.find((e) => e.node === r.id || (e.name && labelMatch(e.name, label)));
    if (key) {
      if (key.tabIndex >= 0) done.push(`reached with Tab (stop ${key.tabIndex + 1})`);
      else todo.unshift('not reachable with Tab');
      if (key.tabIndex >= 0) (key.focusVisible ? done : todo).push(key.focusVisible ? 'focus indicator shows' : 'no visible focus indicator');
      if (key.focusVisible) todo.splice(0, todo.length, ...todo.filter((t) => !/^focus state/.test(t)));
      if (key.activates != null) (key.activates ? done : todo).push(key.activates ? 'Enter/Space activates it' : 'Enter/Space does not activate it');
      if (key.name) done.push(`accessible name "${key.name.slice(0, 40)}"`);
      else todo.push('no accessible name');
      behaviour = behaviour.filter((b) => !/arrow keys|Space/.test(b) || !key.activates);
      a11y = a11y.filter((a) => !/accessible name/.test(a) || !key.name);
    }
    return { element: `${label} (${r.role}, ${r.id})`, ...(done.length ? { checked: done } : {}), notChecked: [...todo, ...behaviour, ...a11y] };
  });
  if (run.keyboard) {
    for (const e of run.keyboard.elements) {
      if (e.clickableOnly) elements.push({ element: `${e.name || e.tag} (clickable ${e.tag})`, notChecked: ['not reachable with Tab or operable by keyboard'] });
    }
  }

  const screen = ['dark mode'];
  if (!run.viewport) screen.push(`widths other than ${Math.round(tree.width)}`);
  if (!run.dynamicType) screen.push(framework === 'swiftui' ? 'other Dynamic Type sizes' : web ? 'browser zoom and larger text' : 'larger text scale');
  screen.push('right-to-left languages', web ? 'reduced motion' : 'Reduce Motion');
  if (roles.some((r) => ['carousel', 'grid', 'listRow'].includes(r.role) || r.role === 'chips')) screen.push('loading, empty and error data');
  if (run.project) screen.push('the real data, navigation and state the screen is wired to');

  return {
    checked,
    notChecked: elements.length > 25 ? [...elements.slice(0, 25), { element: `… ${elements.length - 25} more interactive elements` }] : elements,
    screen,
    ...(partialExport ? { note: 'The export lists each instance\'s current variant only: run the latest plugin to see which states the design defines.' } : {}),
  };
}

function labelMatch(a, b) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return norm(a) === norm(b) || (norm(b).length > 2 && norm(a).includes(norm(b)));
}

export const HANDOFF =
  'When you hand the implementation back, end with what verify_code checked and a "Not verified" list built from ' +
  'coverage.notChecked and coverage.screen, grouped by element: the states, keyboard and screen-reader behaviour no check ' +
  'covered. Mark what you checked yourself, and say which states are missing from the design so the designer can draw them. ' +
  'A pixel match covers the default state only.';
