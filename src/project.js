// What the project the agent works in expects: the code framework, for
// Flutter the asset folders it declares, and for React its Tailwind version
// and public folder.
import fs from 'node:fs';
import path from 'node:path';

export const FRAMEWORKS = ['react', 'html', 'flutter'];
const DEFAULT_ASSETS = 'assets/figma';

/**
 * 'flutter', 'html' or 'react': the explicit [framework], then the
 * client's frameworks and languages, then FIGMA_LOCAL_MCP_FRAMEWORK, then
 * the project in [cwd] (a pubspec.yaml is Flutter; a static site, an
 * index.html without a package.json, is HTML); React otherwise.
 */
export function detectFramework({ framework, clientFrameworks, clientLanguages } = {}, cwd = process.cwd()) {
  if (FRAMEWORKS.includes(framework)) return framework;
  const said = `${clientFrameworks || ''} ${clientLanguages || ''}`.toLowerCase();
  if (/flutter|dart/.test(said)) return 'flutter';
  if (/\bhtml\b/.test(said) && !/react|next|vue|svelte|angular|jsx|tsx/.test(said)) return 'html';
  if (/react|next|vue|svelte|angular|tailwind|javascript|typescript/.test(said)) return 'react';
  const env = String(process.env.FIGMA_LOCAL_MCP_FRAMEWORK || '').toLowerCase();
  if (FRAMEWORKS.includes(env)) return env;
  if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) return 'flutter';
  if (fs.existsSync(path.join(cwd, 'index.html')) && !fs.existsSync(path.join(cwd, 'package.json'))) return 'html';
  return 'react';
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

function packageJson(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function dependencies(pkg) {
  return { ...(pkg && pkg.dependencies), ...(pkg && pkg.devDependencies), ...(pkg && pkg.peerDependencies) };
}

/**
 * The Tailwind major version the project's package.json uses (3 or 4), or
 * null: Tailwind 4 ships its PostCSS and Vite plugins as @tailwindcss/*.
 */
export function tailwindVersion(cwd = process.cwd()) {
  const deps = dependencies(packageJson(cwd));
  if (deps['@tailwindcss/postcss'] || deps['@tailwindcss/vite'] || deps['@tailwindcss/cli']) return 4;
  const m = /(\d+)/.exec(String(deps.tailwindcss || ''));
  return m ? Number(m[1]) : null;
}

/**
 * The folder React code loads assets from by URL: SvelteKit serves
 * static/, other web frameworks public/.
 */
export function reactAssetDir(cwd = process.cwd()) {
  const deps = dependencies(packageJson(cwd));
  const base = deps['@sveltejs/kit'] || fs.existsSync(path.join(cwd, 'static')) && !fs.existsSync(path.join(cwd, 'public'))
    ? 'static' : 'public';
  return `${base}/figma`;
}
