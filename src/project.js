// What the project the agent works in expects: the code framework and, for
// Flutter, the asset folders it declares.
import fs from 'node:fs';
import path from 'node:path';

export const FRAMEWORKS = ['react', 'flutter'];
const DEFAULT_ASSETS = 'assets/figma';

/**
 * 'flutter' or 'react': the explicit [framework], then the client's
 * frameworks and languages, then FIGMA_LOCAL_MCP_FRAMEWORK, then a
 * pubspec.yaml in [cwd]; React otherwise.
 */
export function detectFramework({ framework, clientFrameworks, clientLanguages } = {}, cwd = process.cwd()) {
  if (FRAMEWORKS.includes(framework)) return framework;
  const said = `${clientFrameworks || ''} ${clientLanguages || ''}`.toLowerCase();
  if (/flutter|dart/.test(said)) return 'flutter';
  if (/react|next|vue|svelte|angular|html|tailwind|javascript|typescript/.test(said)) return 'react';
  const env = String(process.env.FIGMA_LOCAL_MCP_FRAMEWORK || '').toLowerCase();
  if (FRAMEWORKS.includes(env)) return env;
  return fs.existsSync(path.join(cwd, 'pubspec.yaml')) ? 'flutter' : 'react';
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
