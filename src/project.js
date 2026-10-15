// What the project the agent works in expects: the code framework and, for
// Flutter, the asset folders it declares; for SwiftUI, its asset catalog.
import fs from 'node:fs';
import path from 'node:path';

export const FRAMEWORKS = ['react', 'flutter', 'swiftui'];
const DEFAULT_ASSETS = 'assets/figma';
const DEFAULT_CATALOG = 'Assets.xcassets';
// Folders never holding a project's own asset catalog.
const SKIPPED_DIRS = new Set(['node_modules', '.build', '.git', 'Pods', 'DerivedData', 'build', 'Carthage']);
const CATALOG_DEPTH = 3;

const XCODE = /\.(xcodeproj|xcworkspace)$/;

function list(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Whether [cwd] holds a Swift app: a Swift package, an Xcode project or
 * workspace, an XcodeGen project.yml or a Tuist Project.swift, at the top or
 * one folder down (ios/App.xcodeproj) when no other app's manifest is at the top.
 */
function isSwiftProject(cwd) {
  const top = list(cwd);
  const swift = (names) => names.some((f) => XCODE.test(f) || f === 'Package.swift' || f === 'Project.swift' || f === 'Tuist') ||
    (names.includes('project.yml') && /^\s*targets:/m.test(read(path.join(cwd, 'project.yml'))));
  if (swift(top)) return true;
  // React Native, Ionic and Flutter apps keep an ios/ folder of their own.
  if (top.includes('package.json') || top.includes('pubspec.yaml')) return false;
  return top.filter((f) => !f.startsWith('.') && !SKIPPED_DIRS.has(f)).some((f) => list(path.join(cwd, f)).some((g) => XCODE.test(g)));
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** Whether [cwd] is a Swift package without an app project: its resources load from Bundle.module. */
export function isSwiftPackage(cwd = process.cwd()) {
  const top = list(cwd);
  return top.includes('Package.swift') && !top.some((f) => XCODE.test(f));
}

/** The frameworks [said] names, in the order they are tested. */
function namedFrameworks(said) {
  const out = [];
  if (/flutter|dart/.test(said)) out.push('flutter');
  if (/react.?native|expo|ionic|capacitor|cordova/.test(said)) out.push('react');
  if (/swiftui|\bswift\b|\bios\b|xcode|uikit|objective-?c/.test(said)) out.push('swiftui');
  if (/react|next|vue|svelte|angular|html|tailwind|javascript|typescript/.test(said)) out.push('react');
  return [...new Set(out)];
}

/** The framework of the project in [cwd] by its files, or null. */
function projectFramework(cwd) {
  if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) return 'flutter';
  if (isSwiftProject(cwd)) return 'swiftui';
  return fs.existsSync(path.join(cwd, 'package.json')) ? 'react' : null;
}

/**
 * 'flutter', 'swiftui' or 'react': the explicit [framework], then the
 * client's frameworks and languages (the project decides between several),
 * then FIGMA_LOCAL_MCP_FRAMEWORK, then the project's files (a pubspec.yaml,
 * a Swift package or Xcode project); React otherwise.
 */
export function detectFramework({ framework, clientFrameworks, clientLanguages } = {}, cwd = process.cwd()) {
  if (FRAMEWORKS.includes(framework)) return framework;
  const said = `${clientFrameworks || ''} ${clientLanguages || ''}`.toLowerCase();
  // Cross-platform frameworks name iOS too: they decide.
  if (/flutter|dart/.test(said)) return 'flutter';
  if (/react.?native|expo|ionic|capacitor|cordova/.test(said)) return 'react';
  const named = namedFrameworks(said);
  const own = projectFramework(cwd);
  if (named.length === 1) return named[0];
  if (named.length > 1) return named.includes(own) ? own : named[0];
  const env = String(process.env.FIGMA_LOCAL_MCP_FRAMEWORK || '').toLowerCase();
  if (FRAMEWORKS.includes(env)) return env;
  return own || 'react';
}

/** Whether the project's pubspec.yaml depends on flutter_screenutil. */
export function usesScreenUtil(cwd = process.cwd()) {
  try {
    return /^\s+flutter_screenutil:/m.test(fs.readFileSync(path.join(cwd, 'pubspec.yaml'), 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Folders for SVGs and images: those the project's pubspec.yaml declares
 * under flutter: assets: (assets/svg, assets/png, assets/images, ...), else
 * assets/figma.
 */
export function flutterAssetDirs(cwd = process.cwd()) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, 'pubspec.yaml'), 'utf8');
  } catch {
    return { svg: DEFAULT_ASSETS, image: DEFAULT_ASSETS };
  }
  const dirs = [...text.matchAll(/^\s*-\s*(assets\/[^\s#'"]*)\s*$/gm)]
    .map((m) => m[1].replace(/\/$/, ''))
    .filter((d) => !/\.[a-z0-9]+$/i.test(d));
  const last = (d) => d.split('/').pop();
  const pick = (exact, loose) => dirs.find((d) => exact.test(last(d))) || dirs.find((d) => loose.test(last(d)));
  return {
    svg: pick(/^(svgs?|icons?|vectors?)$/i, /svg|icon/i) || DEFAULT_ASSETS,
    image: pick(/^(pngs?|images?|imgs?|pictures?|photos?)$/i, /png|image|img/i) || DEFAULT_ASSETS,
  };
}

/**
 * The project's asset catalog, relative to [cwd]: the shallowest
 * *.xcassets folder (an Assets.xcassets first), else Assets.xcassets.
 */
export function assetCatalog(cwd = process.cwd()) {
  const found = [];
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIPPED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.name.endsWith('.xcassets')) found.push({ rel: path.relative(cwd, full), depth });
      else if (depth < CATALOG_DEPTH) walk(full, depth + 1);
    }
  };
  walk(cwd, 1);
  // The app's own catalog: not a preview, widget, extension or test target's.
  const aside = (f) => /preview|widget|extension|intent|tests?\b|watch|clip/i.test(f.rel);
  const named = (f) => path.basename(f.rel) === DEFAULT_CATALOG;
  found.sort((a, b) => aside(a) - aside(b) || a.depth - b.depth || named(b) - named(a) || a.rel.localeCompare(b.rel));
  return found.length ? found[0].rel.split(path.sep).join('/') : DEFAULT_CATALOG;
}

/**
 * The project's DesignSystem.swift, relative to [cwd], or null: the
 * shallowest one outside preview, widget and test targets.
 */
export function designSystemFile(cwd = process.cwd()) {
  const found = [];
  const walk = (dir, depth) => {
    for (const e of (() => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } })()) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name === 'DesignSystem.swift') found.push({ rel: path.relative(cwd, full), depth });
      else if (e.isDirectory() && !SKIPPED_DIRS.has(e.name) && !e.name.startsWith('.') && !e.name.endsWith('.xcassets') && depth < 5) walk(full, depth + 1);
    }
  };
  walk(cwd, 1);
  const aside = (f) => /preview|widget|extension|tests?\b/i.test(f.rel);
  found.sort((a, b) => aside(a) - aside(b) || a.depth - b.depth || a.rel.localeCompare(b.rel));
  return found.length ? found[0].rel : null;
}
