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

/** Whether [cwd] holds a Swift package or an Xcode project or workspace. */
function isSwiftProject(cwd) {
  try {
    return fs.existsSync(path.join(cwd, 'Package.swift')) ||
      fs.readdirSync(cwd).some((f) => /\.(xcodeproj|xcworkspace)$/.test(f));
  } catch {
    return false;
  }
}

/**
 * 'flutter', 'swiftui' or 'react': the explicit [framework], then the
 * client's frameworks and languages, then FIGMA_LOCAL_MCP_FRAMEWORK, then
 * a pubspec.yaml, a Swift package or an Xcode project in [cwd]; React
 * otherwise.
 */
export function detectFramework({ framework, clientFrameworks, clientLanguages } = {}, cwd = process.cwd()) {
  if (FRAMEWORKS.includes(framework)) return framework;
  const said = `${clientFrameworks || ''} ${clientLanguages || ''}`.toLowerCase();
  if (/flutter|dart/.test(said)) return 'flutter';
  if (/react.?native|expo/.test(said)) return 'react';
  if (/swiftui|swift|\bios\b|xcode|uikit|objective-?c/.test(said)) return 'swiftui';
  if (/react|next|vue|svelte|angular|html|tailwind|javascript|typescript/.test(said)) return 'react';
  const env = String(process.env.FIGMA_LOCAL_MCP_FRAMEWORK || '').toLowerCase();
  if (FRAMEWORKS.includes(env)) return env;
  if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) return 'flutter';
  return isSwiftProject(cwd) ? 'swiftui' : 'react';
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
  found.sort((a, b) => a.depth - b.depth || (b.rel.endsWith(DEFAULT_CATALOG) ? 1 : 0) - (a.rel.endsWith(DEFAULT_CATALOG) ? 1 : 0));
  return found.length ? found[0].rel.split(path.sep).join('/') : DEFAULT_CATALOG;
}
