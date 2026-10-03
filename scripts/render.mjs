// builds the hero svg from data/state.json.
// run directly: node scripts/render.mjs
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- scene constants ----------
// the box
export const W = 840, H = 280;
// the runner is drawn in "model" coordinates (below), then scaled up.
export const RX = 620;              // runner x
export const GY = 176;              // track baseline
// wide: runner and road at s x model size, runner at rx, ground at gy. tiles stay 1x.
export const WIDE = { s: 1.5, rx: 644, gy: 224 };
// the big faint year: [center x, height above the ground, size]. it sits over the hills between
// the 2024 blocks and the flag, clear of every block, like the site's year behind open scenery.
export const MARK = { wide: [316, 32, 90] };

// the site's faces when the viewer has them, system fonts otherwise
const MONO = '&quot;JetBrains Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const SANS = '&quot;Space Grotesk&quot;,system-ui,-apple-system,&quot;Segoe UI&quot;,Helvetica,Arial,sans-serif';
const CLOCK = '&quot;JetBrains Mono&quot;,ui-monospace,Menlo,monospace';
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// the site (aaghashm.github.io) defines all of these. the world is its 2022 palette:
// sky top/bottom, far mountains, mid hills, ground and the lit edge on top of it.
export const THEMES = {
  dark: {
    ink: '#ededed', muted: '#9c978f', accent: '#f5a623', accentInk: '#f5a623', buttonFill: '#21262d',
    sky0: '#0d1b2e', sky1: '#1d2c4a', far: '#1a2a46', farLit: '#192a45', mid: '#142239', ground: '#0b1422', edge: '#2d4a7a',
    gInk: '#a3b1c6', gAccent: '#f5a623', dash: '#4f6fa6', tex: 'rgba(255,255,255,.035)', mark: '#ffffff', markOp: 0.025,
    rInk: '#f3efe8', rBack: '#bdb7ad', rEye: '#141416', scarf: '#7c8ba3',
    board: '#141417', boardLine: '#2e2e36', lockFace: '#3a4558', lockShade: '#2b3445', lockInk: '#94a3b8', live: '#3ad06b',
  },

};
// ---------- small helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n) => Math.round(n * 100) / 100;
export const textW = (s, size) => s.length * size * 0.602;
// advance widths of space grotesk (em), measured once from the font file
const SG = {
  a: .578, b: .638, c: .586, d: .638, e: .577, f: .436, g: .638, h: .616, i: .266, j: .268, k: .564, l: .266, m: .854, n: .616,
  o: .612, p: .638, q: .638, r: .396, s: .524, t: .456, u: .616, v: .548, w: .784, x: .592, y: .616, z: .518,
  0: .648, 1: .452, 2: .594, 3: .608, 4: .636, 5: .6, 6: .618, 7: .554, 8: .6, 9: .618, '.': .298, '?': .578, "'": .294, ',': .294, '#': .636, ':': .298, ' ': .254,
};
export const sansW = (s, size) => [...s].reduce((a, c) => a + (SG[c] ?? 0.62), 0) * size;
export const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
export const fmtDay = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
export const fmtShort = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

// darker edge under a tile, like the site's blocks
const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

// years + days since the first repo, same as the site's clock ("4y 26d")
export function sinceStart(start, today) {
  const [sy, sm, sd] = start.split('-').map(Number);
  let y = +today.slice(0, 4);
  const ann = (yr) => Date.UTC(yr, sm - 1, sd) / 864e5;
  if (dayNum(today) < ann(y)) y--;
  return { y: y - sy, d: dayNum(today) - ann(y) };
}

export function counterLine(tries) {
  if (!tries) return "nobody's tried to stop him yet.";
  return `tried ${tries} time${tries === 1 ? '' : 's'}. stopped 0.`;
}

// ---------- svg pieces ----------
function css() {
  return `
text{font-family:${MONO};font-weight:500}.sg{font-family:${SANS};font-weight:700}.ck{font-family:${CLOCK};font-weight:300}
.tk{animation:tk 60s steps(60) infinite}@keyframes tk{to{transform:rotate(360deg)}}
.lv{animation:lv 2s ease-in-out infinite}@keyframes lv{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`.trim().replace(/\n+/g, '\n');
}

// runner, feet at (RX, GY). drawn in a frame with the hip at (0,0). same figure and colors as the site's.
function runner(T) {
  const leg = (cls, col, rot) => `<g class="${cls}"${rot != null ? ` transform="rotate(${rot})"` : ''}><path d="M0 0 1.2 6.5 -.6 12" stroke="${col}" stroke-width="4.2"/></g>`;
  const arm = (cls, col, rot, d = 'M0 0 0 5.5 3.2 9.4') => `<g transform="translate(1 -11)"><g class="${cls}"${rot != null ? ` transform="rotate(${rot})"` : ''}><path d="${d}" stroke="${col}" stroke-width="3.4"/></g></g>`;
  const body = (lean) => `<g transform="rotate(${lean})"><rect x="-6.5" y="-16" width="13" height="18" rx="6.5" fill="${T.rInk}"/>`
    + `<circle cx="1.5" cy="-22" r="7.5" fill="${T.rInk}"/><ellipse cx="5" cy="-23" rx="1.4" ry="1.9" fill="${T.rEye}"/>`
    + `<rect x="-6" y="-15.5" width="13" height="4.5" rx="2.2" fill="${T.scarf}"/></g>`;
  // standing: hands on hips, scarf hanging
  const standing = `<g>`
    + `<path d="M-4.5 -13.5c-2 1-3 3.5-2.6 7.5" stroke="${T.scarf}" stroke-width="3"/>`
    + `<g transform="translate(-2 0)">${leg('', T.rBack, 4)}</g><g transform="translate(2 0)">${leg('', T.rInk, -4)}</g>`
    + arm('', T.rBack, null, 'M0 0 -1.5 5.5 -1 10.5') + body(0) + arm('', T.rInk, null, 'M0 0 1.2 5.5 .8 10.5')
    + `</g>`;
  return `<ellipse cx="${RX}" cy="${GY + 1}" rx="12" ry="2.6" fill="#000000" opacity=".18"/>`
    + `<g transform="translate(${RX} ${GY - 12})" fill="none" stroke-linecap="round" stroke-linejoin="round">${standing}</g>`;
}

// the runner and the road ahead, in model coordinates. the layout scales it.
function action(state, T) {
  return `<path d="M${RX + 10} ${GY}H840" stroke="${T.dash}" stroke-width="2" stroke-dasharray="10 14"/>` + runner(T);
}

// the site's world: sky to warm haze, stars and a moon at night (a pale sun by day), a far range of
// mountains with lit faces, rolling hills, a faint year over open sky, then the slate ground with its lit edge.
// o: { gy, mark: [x, baseline, size] (optional), moon: [x, y, scale], k (mountain height scale), w, h, sky (gradient id) }
const PEAKS = [[-20, 46], [70, 150], [160, 70], [250, 190], [345, 60], [430, 132], [520, 52], [610, 176], [700, 66], [790, 140], [880, 50]];
const STARS = [[44, 22], [131, 108], [196, 34], [372, 112], [318, 18], [377, 120], [452, 28], [489, 86], [604, 40], [655, 16], [702, 104], [765, 120], [823, 96], [96, 70], [574, 110], [410, 64]];
function backdrop(T, dark, o) {
  const { gy, k } = o, w = o.w || W, h = o.h || H, out = [];
  out.push(`<rect width="${w}" height="${h}" fill="url(#${o.sky || 'sky'})"/>`);
  // stars: three brightnesses, one path each
  if (dark) for (const [k, op, sz] of [[0, 0.85, 2.2], [1, 0.5, 1.6], [2, 0.7, 1.6]]) {
    out.push(`<path d="${STARS.filter((_, i) => i % 3 === k).map(([x, y]) => `M${x} ${Math.round(y * gy / 224)}h${sz}v${sz}h-${sz}z`).join('')}" fill="#fffaeb" opacity="${op}"/>`);
  }
  const [mx, my, ms] = o.moon;
  out.push(`<g transform="translate(${mx} ${my}) scale(${ms})">`
    + (dark
      ? `<circle r="32" fill="#fff0d7" opacity=".07"/><circle r="17" fill="#f2e8d2"/><circle cx="8" cy="-4.5" r="14.5" fill="${mixHex(T.sky0, T.sky1, my / 240)}"/>`
      : `<circle r="34" fill="#fffaf2" opacity=".4"/><circle r="20" fill="#fffaf2" opacity=".95"/>`)
    + '</g>');
  const pts = PEAKS.map(([x, h]) => [x, r2(gy - h * k)]);
  out.push(`<path d="M-20 ${gy}${pts.map(([x, y]) => `L${x} ${y}`).join('')}L860 ${gy}Z" fill="${T.far}"/>`);
  // lit faces: from each peak down the left slope
  out.push(`<path d="${pts.slice(1, -1).map(([x, y], i) => {
    const a = pts[i], c = pts[i + 2];
    if (y > a[1] || y > c[1]) return '';
    return `M${x} ${y}L${a[0]} ${a[1]}L${r2(a[0] + (x - a[0]) * 0.55)} ${r2(a[1] + (gy - a[1]) * 0.2)}Z`;
  }).join('')}" fill="${T.farLit}"/>`);
  // hills: a smooth wave, cosine eased between heights
  const hh = [34, 58, 30, 66, 40, 54, 28, 60, 36];
  let d = `M-10 ${gy}`;
  for (let x = -10; x <= 850; x += 20) {
    const u = (x + 10) / 110, i = Math.floor(u), f = u - i;
    const a = hh[i % hh.length], b2 = hh[(i + 1) % hh.length];
    d += `L${x} ${Math.round(gy - (a + (b2 - a) * (1 - Math.cos(f * Math.PI)) / 2) * k * 0.8)}`;
  }
  out.push(`<path d="${d}L850 ${gy}Z" fill="${T.mid}"/>`);
  if (o.mark) {
    const [yx, yb, ys] = o.mark;
    out.push(`<text class="sg" x="${yx}" y="${yb}" font-size="${ys}" text-anchor="middle" fill="${T.mark}" opacity="${T.markOp}">${esc(o.year)}</text>`);
  }
  out.push(`<rect y="${gy}" width="${w}" height="${h - gy}" fill="${T.ground}"/><rect y="${gy}" width="${w}" height="4" fill="${T.edge}"/>`);
  // a few worn marks in the dirt, like the site's
  out.push(`<path d="${[[70, 0.5], [190, 0.85], [330, 0.25], [415, 0.7], [560, 0.4], [700, 0.9], [790, 0.2]].filter(([x]) => x < w - 20).map(([x, f]) => `M${x} ${r2(gy + 10 + f * (h - gy - 18))}h${r2(8 + f * 14)}`).join('')}" stroke="${T.tex}" stroke-width="3" stroke-linecap="round"/>`);
  return out.join('');
}

function wideScene(state, T, cfg, dark) {
  const out = [], Wd = WIDE;
  const today = state.lastDaily || state.today || new Date().toISOString().slice(0, 10);
  out.push(backdrop(T, dark, { gy: Wd.gy, k: 0.62, year: today.slice(0, 4), mark: [MARK.wide[0], Wd.gy - MARK.wide[1], MARK.wide[2]], moon: [556, 50, 1] }));
  const ax = r2(Wd.rx - RX * Wd.s), ay = r2(Wd.gy - GY * Wd.s);
  out.push(`<g transform="translate(${ax} ${ay}) scale(${Wd.s})">${action(state, T)}</g>`);
  out.push(`<text x="${Wd.rx}" y="${Wd.gy + 44}" font-size="13" text-anchor="middle" fill="${T.gInk}">today</text>`);
  // title, counter, and the site's clock
  out.push(`<text class="sg" x="28" y="66" font-size="50" fill="${T.accentInk}" letter-spacing="-1">still running.</text>`);
  out.push(`<text x="30" y="96" font-size="15" fill="${T.muted}">${esc(counterLine(state.tries || 0))}</text>`);
  const since = sinceStart(cfg.start, today);
  out.push(`<circle class="lv" cx="${r2(812 - textW(`since ${fmtDay(cfg.start)}`, 12) - 10)}" cy="26" r="4" fill="${T.live}"/>`);
  out.push(`<text x="812" y="30" font-size="12" text-anchor="end" fill="${T.muted}">since ${fmtDay(cfg.start)}</text>`);
  out.push(`<text class="ck" x="812" y="70" font-size="40" text-anchor="end" fill="${T.ink}">${since.y}<tspan font-size="20" fill="${T.muted}">y </tspan>${since.d}<tspan font-size="20" fill="${T.muted}">d</tspan></text>`);
  return out.join('');
}

const skyDef = (id, T, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${y2}"><stop offset="0" stop-color="${T.sky0}"/><stop offset="1" stop-color="${T.sky1}"/></linearGradient>`;

export function heroSvg(state, cfg, themeName, now = Date.now()) {
  const T = THEMES[themeName];
  const dark = themeName === 'dark';
  const wide = wideScene(state, T, cfg, dark);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<style>${css()}</style>`
    + `<defs>`
    + `<clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>`
    + skyDef('sky', T, 240)
    + `</defs>`
    + `<g id="wide"><g clip-path="url(#card)">${wide}</g></g>`
    + `</svg>\n`;
}

// ---------- write everything ----------
export function renderAll(state, root = ROOT, now = Date.now()) {
  const cfg = JSON.parse(readFileSync(join(root, 'data/repos.json'), 'utf8'));
  writeFileSync(join(root, 'assets/hero.svg'), heroSvg(state, cfg, 'dark', now));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const state = JSON.parse(readFileSync(join(ROOT, 'data/state.json'), 'utf8'));
  renderAll(state);
  console.log('rendered');
}
