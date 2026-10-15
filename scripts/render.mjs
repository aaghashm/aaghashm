// builds the hero svgs (dark + light), the phone heroes, the buttons, the wall and README.md from data/state.json + data/wall.json.
// pure functions are exported for the tests. run directly: node scripts/render.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS } from './icons.mjs';
import { sceneAt, skyFor, SNOW, fallers, fallCss } from './scene.mjs';
import { readWall, wallSvg, chipSvg, PALETTE, paintLinks, paintersLine, wallLink } from './wall.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- scene constants ----------
// the box. an <img> keeps one aspect ratio, so the phone layout lives in the same box.
export const W = 840, H = 280;
// the motion is worked out in "model" coordinates (below), then each layout scales it up.
export const LOOP = 8;              // seconds per loop
export const F = 1.4;               // freeze: he stands still, "fine. stopped."
export const LANE_L = 500, LANE_R = 840, FADE = 20;
export const RX = 620;              // runner x
export const GY = 176;              // track baseline
export const V = (LANE_R - LANE_L) / (LOOP - F); // px per second
export const START_X = [652, 720, 788, 516, 584]; // h0 (newest) .. h4
export const JUMP_H = 34, JUMP_HALF = 0.5;
// a hurdle he has cleared fades out right behind him: gone at BEHIND[0], fully there from BEHIND[1].
// so the still frame shows only what's ahead, in the order he meets them (newest first).
export const BEHIND = [586, 604];
export const SLOT0 = 28, SLOT = 34, TILE = 26, STACK = 28;
export const HURDLE_R = 12, HURDLE_CY = GY - 4 - HURDLE_R;
// wide: runner, hurdles and road at s x model size, runner at rx, ground at gy. tiles stay 1x.
export const WIDE = { s: 1.5, rx: 644, gy: 224 };
// narrow (tablets, where the readme column is 440-680px): title + bubble on top, track below.
// timeline at ts (one lock per gap), the action at s. phones get their own 2:1 picture, PHONE below.
export const NARROW = { s: 1.75, ts: 1.2, rx: 664, gy: 246, x0: 22, maxWidth: 680, title: 60, counter: 30, counterY: 102, bubble: [28, 16] };
// phone (viewport up to maxWidth): its own 600x300 file per theme. title and bubble on one row, then the track,
// the counter on the ground. the flag points left, over the timeline, so the runner sits close to the blocks.
// "you?" sits over the empty hurdle there, so it never meets the counter.
export const PHONE = { w: 600, h: 300, ts: 1.15, s: 1.6, rx: 415, gy: 244, x0: 16, maxWidth: 600, title: 58, counter: 22, bubble: [24, 14], flag: 24 };
// where the hurdles show, in model x: [gone, full, full, gone]. outside it they fade to nothing,
// so a hurdle never sits on the flag, the year labels or the edge of the picture.
// the big faint year: [center x, height above the ground, size]. it sits over the hills between
// the 2024 blocks and the flag, clear of every block, like the site's year behind open scenery.
// the narrow layouts have no room for it.
export const MARK = { wide: [316, 32, 90] };
export const SHOW = { wide: [522, 544, 724, 750], narrow: [506, 530, 690, 706], phone: [598, 610, 726, 740] };
const EASE_UP = [0.2, 0.7, 0.4, 1];   // ease-out going up
const EASE_DOWN = [0.6, 0, 0.8, 0.3]; // ease-in coming down

// the site's faces, embedded as small subsets (data/fonts, SIL OFL). system fonts take over if they can't load.
const MONO = 'sr-mono,&quot;JetBrains Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const SANS = 'sr-sans,&quot;Space Grotesk&quot;,system-ui,-apple-system,&quot;Segoe UI&quot;,Helvetica,Arial,sans-serif';
const CLOCK = 'sr-clock,&quot;JetBrains Mono&quot;,ui-monospace,Menlo,monospace';
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
  light: {
    ink: '#1a1a1a', muted: '#6f6a62', accent: '#f5a623', accentInk: '#a85f00', buttonFill: '#f6f8fa',
    sky0: '#bfdcff', sky1: '#fef3e2', far: '#cfdcf1', farLit: '#c8dcf6', mid: '#a3badf', ground: '#4f6a99', edge: '#8aa6d6',
    gInk: '#eef3fb', gAccent: '#ffcf70', dash: '#e1eafa', tex: 'rgba(0,0,0,.07)', mark: '#1a1a1a', markOp: 0.03,
    rInk: '#1f1f27', rBack: '#4a4a55', rEye: '#ffffff', scarf: '#6d798b',
    board: '#ffffff', boardLine: '#e3ded5', lockFace: '#e2e8f0', lockShade: '#cbd5e1', lockInk: '#64748b', live: '#2fb35c',
  },
};
// the base theme plus the sky for this hour and season (see scene.mjs)
export function themeFor(name, sc) {
  return { ...THEMES[name], ...skyFor(name, sc), lamp: sc.phase === 'night', season: sc.season, phase: sc.phase, theme: name, snow: SNOW[name].lie };
}
// tile colors and short names are the site's
export const LANG = {
  Python: { c: '#3b82f6', icon: 'python' },
  'Jupyter Notebook': { c: '#f97316', icon: 'jupyter' },
  Jupyter: { c: '#f97316', icon: 'jupyter' },
  JavaScript: { c: '#eab308', icon: 'javascript' },
  'C++': { c: '#f34b7d', icon: 'cplusplus' },
};
const ICON_STYLE = { tableau: { c: '#14b8a6', icon: 'barchart' }, package: { c: '#64748b', icon: 'package' } };

// ---------- small helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n) => Math.round(n * 100) / 100;
const pct = (t) => (Math.round((t / LOOP) * 100000) / 1000) + '%';
export const textW = (s, size) => s.length * size * 0.602;
// advance widths of the embedded sans (em), measured once from the font file
const SG = {
  a: .578, b: .638, c: .586, d: .638, e: .577, f: .436, g: .638, h: .616, i: .266, j: .268, k: .564, l: .266, m: .854, n: .616,
  o: .612, p: .638, q: .638, r: .396, s: .524, t: .456, u: .616, v: .548, w: .784, x: .592, y: .616, z: .518,
  0: .648, 1: .452, 2: .594, 3: .608, 4: .636, 5: .6, 6: .618, 7: .554, 8: .6, 9: .618, '.': .298, '?': .578, "'": .294, ',': .294, '#': .636, ':': .298, ' ': .254,
};
export const sansW = (s, size) => [...s].reduce((a, c) => a + (SG[c] ?? 0.62), 0) * size;
export const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
export const fmtDay = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
export const fmtShort = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

function lum(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
// pick #0d1117 or #ffffff, whichever contrasts more with the tile
export function iconInk(fill) {
  const L = lum(fill), cw = 1.05 / (L + 0.05), cd = (L + 0.05) / (lum('#0d1117') + 0.05);
  return cd > cw ? '#0d1117' : '#ffffff';
}
// darker edge under a tile, like the site's blocks
const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const shade = (hex, k = 0.28) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');

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

// ---------- timeline layout ----------
// repos: [{name, lang, created}] sorted by created. returns slots of towers and locks.
export function layoutTimeline(repos, cfg, maxLocks = 3) {
  const towers = [];
  for (const r of repos) {
    const day = dayNum(r.created.slice(0, 10));
    const t = towers[towers.length - 1];
    if (t && day - t.firstDay <= 30) { t.repos.push(r); t.lastDay = day; } else towers.push({ repos: [r], firstDay: day, lastDay: day });
  }
  const slots = [], gaps = [];
  towers.forEach((t, i) => {
    if (i > 0) {
      const gap = t.firstDay - towers[i - 1].lastDay;
      const n = Math.min(maxLocks, Math.floor(gap / 120));
      gaps.push({ days: gap, locks: n });
      for (let k = 0; k < n; k++) slots.push({ kind: 'lock', gap: i - 1, k, of: n });
    }
    slots.push({ kind: 'tower', tower: t });
  });
  slots.forEach((s, i) => { s.x = SLOT0 + i * SLOT; });
  const flagSlot = slots.find((s) => s.kind === 'tower' && s.tower.repos.some((r) => r.name === cfg.flag));
  return { towers, slots, gaps, flagSlot };
}

function tileStyle(r, cfg) {
  const ov = cfg.icon?.[r.name];
  if (ov) return ICON_STYLE[ov] || ICON_STYLE.package;
  return LANG[r.lang] || ICON_STYLE.package;
}

// ---------- motion math ----------
export function crossTime(x0) {
  const d = x0 > RX ? x0 - RX : (x0 - LANE_L) + (LANE_R - RX);
  return F + d / V;
}
export const opacityAt = (x) => Math.max(0, Math.min(1, (x - BEHIND[0]) / (BEHIND[1] - BEHIND[0]), (LANE_R - x) / FADE));

// keyframe points [t, x, opacity] for one hurdle over the loop. opacity is linear in x between
// these points, so every place the fade bends gets a point.
export function hurdlePoints(x0) {
  const pts = [[0, x0], [F, x0]];
  const tAt = (x) => F + (x0 - x) / V;                // before the wrap
  const tAfter = (x) => F + (x0 - LANE_L) / V + (LANE_R - x) / V; // after the wrap
  const bends = [LANE_R - FADE, ...BEHIND];
  for (const b of bends) if (b < x0) pts.push([tAt(b), b]);
  const tw = tAt(LANE_L);
  pts.push([tw, LANE_L], [tw + LOOP * 0.0001, LANE_R]);
  for (const b of bends) if (b > x0) pts.push([tAfter(b), b]);
  pts.push([LOOP, x0]);
  return pts.sort((a, b) => a[0] - b[0]).map(([t, x]) => [t, x, opacityAt(x)]);
}

// cubic-bezier easing, for the tests (and to keep keyframes honest)
export function bezier([x1, y1, x2, y2], x) {
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 40; i++) {
    t = (lo + hi) / 2;
    const bx = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3;
    if (bx < x) lo = t; else hi = t;
  }
  return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
}
// jump height (px above ground) at time t
export function jumpAt(t) {
  for (const x0 of START_X) {
    const tc = crossTime(x0), u = t - tc;
    if (Math.abs(u) > JUMP_HALF) continue;
    return u < 0 ? JUMP_H * bezier(EASE_UP, (u + JUMP_HALF) / JUMP_HALF) : JUMP_H * (1 - bezier(EASE_DOWN, u / JUMP_HALF));
  }
  return 0;
}

// ---------- svg pieces ----------
let FONT_CSS = null;
function fontCss() {
  if (FONT_CSS == null) {
    const b64 = (f) => readFileSync(join(ROOT, 'data/fonts', f)).toString('base64');
    FONT_CSS = `@font-face{font-family:sr-sans;font-weight:700;src:url(data:font/woff2;base64,${b64('space-grotesk-700.woff2')}) format("woff2")}`
      + `@font-face{font-family:sr-clock;font-weight:300;src:url(data:font/woff2;base64,${b64('jetbrains-mono-300.woff2')}) format("woff2")}`
      + `@font-face{font-family:sr-mono;font-weight:500;src:url(data:font/woff2;base64,${b64('jetbrains-mono-500.woff2')}) format("woff2")}`
      + `@font-face{font-family:sr-mono;font-weight:700;src:url(data:font/woff2;base64,${b64('jetbrains-mono-700.woff2')}) format("woff2")}`;
  }
  return FONT_CSS;
}

// the hero hides #wide under NARROW.maxWidth. the phone files are one theme each, picked by the README.
function css(wobble, phone = false, season = null) {
  const kf = [];
  START_X.forEach((x0, i) => {
    const pts = hurdlePoints(x0);
    kf.push(`@keyframes h${i}{${pts.map(([t, x, o]) => `${pct(t)}{transform:translateX(${r2(x - x0)}px);opacity:${r2(o)}}`).join('')}}`);
  });
  const jumps = [];
  jumps.push(`0%{transform:translateY(0)}`);
  START_X.map(crossTime).sort((a, b) => a - b).forEach((tc) => {
    jumps.push(`${pct(tc - JUMP_HALF)}{transform:translateY(0);animation-timing-function:cubic-bezier(${EASE_UP})}`);
    jumps.push(`${pct(tc)}{transform:translateY(-${JUMP_H}px);animation-timing-function:cubic-bezier(${EASE_DOWN})}`);
    jumps.push(`${pct(tc + JUMP_HALF)}{transform:translateY(0);animation-timing-function:linear}`);
  });
  jumps.push(`100%{transform:translateY(0)}`);
  const fz = pct(F), fz2 = pct(F + 0.008), b = pct(3), b2 = pct(3.008);
  const dashT = r2(24 / V);
  return `
${fontCss()}
text{font-family:${MONO};font-weight:500}.sg{font-family:${SANS};font-weight:700}.ck{font-family:${CLOCK};font-weight:300}
.sw,.rn,.b1,.b2,.ds,.dr,.hd,.jp,.wp{animation-duration:${LOOP}s;animation-iteration-count:infinite;animation-timing-function:linear}
.sw,.ds{animation-name:sw}.rn{animation-name:rn}.dr{animation-name:rn,dash;animation-duration:${LOOP}s,${dashT}s}
.b1{animation-name:b1}.b2{animation-name:b2}.jp{animation-name:jp}.wp{animation-name:wp}
@keyframes sw{0%,${fz}{opacity:1}${fz2},100%{opacity:0}}
@keyframes rn{0%,${fz}{opacity:0}${fz2},100%{opacity:1}}
@keyframes b1{0%,${pct(F - 0.008)}{opacity:1}${fz},100%{opacity:0}}
@keyframes b2{0%,${pct(F - 0.008)}{opacity:0}${fz},${b}{opacity:1}${b2},100%{opacity:0}}
@keyframes dash{from{stroke-dashoffset:0}to{stroke-dashoffset:24}}
@keyframes jp{${jumps.join('')}}
@keyframes wp{0%,${fz}{transform:rotate(70deg)}${pct(F + 0.12)}{transform:rotate(-18deg)}${pct(F + 0.26)}{transform:rotate(6deg)}${pct(F + 0.4)},100%{transform:rotate(0)}}
${kf.join('\n')}
${START_X.map((_, i) => `.h${i}{animation-name:h${i}}`).join('')}
.lg,.ar{animation:sg .36s ease-in-out infinite alternate}.lg.bk,.ar.fr{animation-delay:-.36s}
@keyframes sg{from{transform:rotate(-28deg)}to{transform:rotate(28deg)}}
.fl{animation:fl .4s ease-in-out infinite alternate}
@keyframes fl{from{transform:scaleY(1)}to{transform:scaleY(-.7)}}
.tk{animation:tk 60s steps(60) infinite}@keyframes tk{to{transform:rotate(360deg)}}
.lv{animation:lv 2s ease-in-out infinite}@keyframes lv{50%{opacity:.25}}
${wobble ? '.wob{animation:wob 3s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}@keyframes wob{0%,100%{transform:rotate(0)}10%{transform:rotate(-6deg)}20%{transform:rotate(6deg)}30%{transform:rotate(0)}}' : ''}
${fallCss(season)}
${season === 'summer' ? '.hz{animation:hz 5s ease-in-out infinite alternate}@keyframes hz{from{transform:translateX(-12px);opacity:.35}to{transform:translateX(12px);opacity:1}}' : ''}
${phone ? '' : `@media (max-width:${NARROW.maxWidth}px){#wide{display:none}#narrow{display:inline}}`}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`.trim().replace(/\n+/g, '\n');
}

// each icon path is written once in <defs> and reused, so the two layouts don't double the file
let usedIcons = new Set();
function icon(name, x, y, size, fill) {
  if (!ICONS[name]) return '';
  usedIcons.add(name);
  return `<use href="#ic-${name}" transform="translate(${r2(x)} ${r2(y)}) scale(${r2(size / 24)})" fill="${fill}"/>`;
}
const iconDefs = () => [...usedIcons].sort().map((n) => `<path id="ic-${n}" d="${ICONS[n]}"${n === 'padlock' ? ' fill-rule="evenodd"' : ''}/>`).join('');

// a block: darker edge, face, soft highlight. the flag repo is a stopwatch, like on the site.
function repoTile(r, x, y, cfg) {
  const st = tileStyle(r, cfg), cx = x + TILE / 2, cy = y + TILE / 2 - 1;
  let inner;
  if (r.name === cfg.flag) {
    inner = `<rect x="${cx - 3.5}" y="${y - 3}" width="7" height="4" rx="1.5" fill="#1a1a1a"/>`
      + `<circle cx="${cx}" cy="${cy + 1}" r="8" fill="#ffffff" stroke="#1a1a1a" stroke-width="1.8"/>`
      + `<g transform="translate(${cx} ${cy + 1})"><path class="tk" d="M0 0V-5.5" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/></g>`
      + `<circle cx="${cx}" cy="${cy + 1}" r="1.6" fill="#e8590c"/>`;
  } else if (st.t) {
    inner = `<text class="sg" x="${cx}" y="${r2(cy + 4.6)}" font-size="13" text-anchor="middle" fill="${iconInk(st.c)}">${st.t}</text>`;
  } else inner = icon(st.icon, x + 5, y + 4, 16, iconInk(st.c));
  return `<g class="tile"><rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="6" fill="${shade(st.c)}"/>`
    + `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE - 2.5}" rx="6" fill="${st.c}"/>`
    + `<rect x="${x + 3}" y="${y + 2.5}" width="${TILE - 6}" height="6" rx="3" fill="#ffffff" opacity=".22"/>`
    + inner + '</g>';
}

function lockTile(x, T, cls) {
  const y = GY - TILE;
  return `<g class="tile${cls ? ' ' + cls : ''}"><rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="6" fill="${T.lockShade}"/>`
    + `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE - 2.5}" rx="6" fill="${T.lockFace}"/>`
    + icon('padlock', x + 6, y + 5, 14, T.lockInk) + '</g>';
}

// runner, feet at (RX, GY). drawn in a frame with the hip at (0,0). same figure and colors as the site's.
function runner(T) {
  const leg = (cls, col, rot) => `<g class="${cls}"${rot != null ? ` transform="rotate(${rot})"` : ''}><path d="M0 0 1.2 6.5 -.6 12" stroke="${col}" stroke-width="4.2"/></g>`;
  const arm = (cls, col, rot, d = 'M0 0 0 5.5 3.2 9.4') => `<g transform="translate(1 -11)"><g class="${cls}"${rot != null ? ` transform="rotate(${rot})"` : ''}><path d="${d}" stroke="${col}" stroke-width="3.4"/></g></g>`;
  // at night he wears a headlamp: a strap, a small lamp on his forehead and a soft beam down the track ahead
  const beam = T.lamp ? `<path d="M8.5 -25.5L82 -46L82 -1Z" fill="url(#beam)"/>` : '';
  const lamp = T.lamp ? `<path d="M-5.6 -24.6Q1 -29.6 8.6 -26.4" stroke="${T.scarf}" stroke-width="1.8"/><circle cx="8.4" cy="-25.6" r="2" fill="#fff6cf"/>` : '';
  const body = (lean) => `<g transform="rotate(${lean})">${beam}<rect x="-6.5" y="-16" width="13" height="18" rx="6.5" fill="${T.rInk}"/>`
    + `<circle cx="1.5" cy="-22" r="7.5" fill="${T.rInk}"/><ellipse cx="5" cy="-23" rx="1.4" ry="1.9" fill="${T.rEye}"/>`
    + `<rect x="-6" y="-15.5" width="13" height="4.5" rx="2.2" fill="${T.scarf}"/>${lamp}</g>`;
  const tailA = 'M-5 -13.5c-5-1-8 3-13 1.5s-7-3.5-11-1';
  // standing: hands on hips, scarf hanging. this is the static frame.
  const standing = `<g class="sw">`
    + `<path d="M-4.5 -13.5c-2 1-3 3.5-2.6 7.5" stroke="${T.scarf}" stroke-width="3"/>`
    + `<g transform="translate(-2 0)">${leg('', T.rBack, 4)}</g><g transform="translate(2 0)">${leg('', T.rInk, -4)}</g>`
    + arm('', T.rBack, null, 'M0 0 -1.5 5.5 -1 10.5') + body(0) + arm('', T.rInk, null, 'M0 0 1.2 5.5 .8 10.5')
    + `</g>`;
  const running = `<g class="rn" opacity="0">`
    + `<g transform="translate(-4 -13.5)"><g class="wp"><g class="fl"><g transform="translate(4 13.5)"><path d="${tailA}" stroke="${T.scarf}" stroke-width="4.5"/></g></g></g></g>`
    + leg('lg bk', T.rBack, 20) + arm('ar bk', T.rBack, -20) + body(6) + leg('lg fr', T.rInk, -20) + arm('ar fr', T.rInk, 20)
    + `</g>`;
  return `<ellipse cx="${RX}" cy="${GY + 1}" rx="12" ry="2.6" fill="#000000" opacity=".18"/>`
    + `<g class="jp"><g transform="translate(${RX} ${GY - 12})" fill="none" stroke-linecap="round" stroke-linejoin="round">${standing}${running}</g></g>`;
}

// speech bubble in layout coordinates. it opens on one line, "fine. stopped.", then grows a line for "jk.".
// both share the tail tip (tx, ty). the two line one is the still frame, so a stopped gif still tells the joke.
function bubblePath(x, y, w, h, r, [b0, b1, tx, ty]) {
  return `M${x + r} ${y}H${r2(x + w - r)}a${r} ${r} 0 0 1 ${r} ${r}V${r2(y + h - r)}a${r} ${r} 0 0 1 -${r} ${r}`
    + `H${b1}L${tx} ${ty}L${b0} ${r2(y + h)}H${x + r}a${r} ${r} 0 0 1 -${r} -${r}V${y + r}a${r} ${r} 0 0 1 ${r} -${r}Z`;
}
// tailLen: a short tail, its tip that far under each box, instead of one shared tip
function speech(T, { x, y, size, pad, tail, tailLen }) {
  const { w, h, h1 } = bubbleBox(size, pad), r = Math.round(size * 0.55);
  const l1 = r2(y + pad + size * 0.8), l2 = r2(l1 + size * 1.25);
  const tip = (hh) => tailLen ? [tail[0], tail[1], tail[2], r2(y + hh + tailLen)] : tail;
  const box = (hh) => `<path d="${bubblePath(x, y, r2(w), r2(hh), r, tip(hh))}" fill="${T.board}" stroke="${T.boardLine}" stroke-width="${r2(size / 14)}"/>`;
  const line1 = `<text class="sg" x="${x + pad}" y="${l1}" font-size="${size}" fill="${T.ink}">fine. stopped.</text>`;
  return `<g class="b1" opacity="0">${box(h1)}${line1}</g>`
    + `<g class="b2">${box(h)}${line1}<text class="sg" x="${x + pad}" y="${l2}" font-size="${size}" fill="${T.accentInk}">jk.</text></g>`;
}
export const bubbleBox = (size, pad) => ({ w: sansW('fine. stopped.', size) + pad * 2, h: pad * 2 + size * 2.1, h1: pad * 2 + size * 0.95 });

function hurdle(i, h, T, { ls, ly, youUp }) {
  const x0 = START_X[i];
  const legs = `<path d="M-6 ${HURDLE_CY + 9}V${GY}M6 ${HURDLE_CY + 9}V${GY}" stroke="${T.lockInk}" stroke-width="2"/>`;
  const ring = `<circle cy="${HURDLE_CY}" r="${HURDLE_R}" fill="none" stroke="${T.ink}" stroke-width="1.5"/>`;
  let shape;
  if (h && h.avatar) shape = legs + `<use href="#av${i}" y="${HURDLE_CY}"/>` + ring;
  else if (h) {
    // someone tried, but their face can't go up (new or empty account, or removed): a plain face
    shape = legs + `<circle cy="${HURDLE_CY}" r="${HURDLE_R}" fill="${T.lockFace}"/>`
      + `<circle cy="${HURDLE_CY - 3}" r="4.2" fill="${T.lockInk}"/><path d="M-7 ${HURDLE_CY + 9.6}a7 6.4 0 0 1 14 0Z" fill="${T.lockInk}"/>` + ring;
  } else {
    // an empty slot: a plain track hurdle
    shape = `<path d="M-9 ${GY - 16}V${GY}M9 ${GY - 16}V${GY}" stroke="${T.lockInk}" stroke-width="2"/>`
      + `<rect x="-12" y="${GY - 19}" width="24" height="5" rx="2" fill="${T.lockInk}"/>`;
  }
  if (T.season === 'snow') shape += h ? `<ellipse cy="${HURDLE_CY - 12}" rx="6.5" ry="2.4" fill="${T.snow}"/>` : `<rect x="-12.5" y="${GY - 21}" width="25" height="3.4" rx="1.7" fill="${T.snow}"/>`;
  // the label sits on the ground under the hurdle. the newest slot, still empty, asks for you.
  // ls is the model size and ly the baseline under GY: 10 is 15px wide, 13 is 22.75px in the phone box.
  // youUp puts "you?" over the bar instead, clear of the counter line under it.
  const label = h ? `<text y="${GY + ly}" font-size="${ls}" text-anchor="middle" fill="${T.gInk}">#${h.n}</text>`
    : i === 0 ? `<text class="sg" y="${youUp ? GY - 23 : GY + ly}" font-size="${r2(ls * 1.05)}" text-anchor="middle" fill="${youUp ? T.accentInk : T.gAccent}">you?</text>` : '';
  return `<g transform="translate(${x0} 0)"><g class="hd h${i}" opacity="${r2(opacityAt(x0))}">${shape}${label}</g></g>`;
}

// hurdles, runner and the road ahead, in model coordinates. both layouts scale it.
function action(state, T, { ls, ly, mask, youUp = false }) {
  const out = [];
  out.push(`<path class="ds" d="M${RX + 10} ${GY}H${LANE_R}" stroke="${T.dash}" stroke-width="2" stroke-dasharray="10 14"/>`);
  out.push(`<path class="dr" d="M${RX + 10} ${GY}H${LANE_R}" stroke="${T.dash}" stroke-width="2" stroke-dasharray="10 14" opacity="0"/>`);
  const hs = state.hurdles || [];
  out.push(`<g mask="url(#${mask})">`);
  for (let i = START_X.length - 1; i >= 0; i--) out.push(hurdle(i, hs[i], T, { ls, ly, youUp }));
  out.push('</g>');
  out.push(runner(T));
  return out.join('');
}

// repo towers and grey locks, model coordinates, baseline GY
function tiles(layout, T, cfg) {
  const out = [];
  const { slots } = layout;
  const wobbleSlot = slots.find((s) => s.kind === 'lock' && s.gap === 0 && s.k === Math.floor((s.of - 1) / 2));
  for (const s of slots) {
    if (s.kind === 'lock') out.push(lockTile(s.x, T, s === wobbleSlot ? 'wob' : ''));
    else s.tower.repos.forEach((r, k) => out.push(repoTile(r, s.x, GY - TILE - k * STACK, cfg)));
    // winter: a little snow on top of every block and lock
    if (T.season === 'snow') out.push(`<rect x="${s.x + 1.5}" y="${GY - TILE - (s.kind === 'lock' ? 0 : (s.tower.repos.length - 1) * STACK) - 2.2}" width="${TILE - 3}" height="4.4" rx="2.2" fill="${T.snow}"/>`);
  }
  return out.join('');
}

// flag on the streak repo. px = pole x, top = top of the tower, fy = flag top, size = font size
// the flag points left when the streak is over (the long label) or when there's no room on the right
function flag(streak, T, px, top, fy, size, short = false, toLeft = false) {
  const label = streak.current > 0 ? `day ${streak.current}` : short ? `${streak.best} days` : `${streak.best} days. still running.`;
  const fh = Math.round(size * 2.3), fw = textW(label, size) + size * 1.3, left = toLeft || streak.current <= 0;
  const fxa = left ? px - fw : px, k = fh / 2;
  const notch = left ? `M${px} ${fy}H${r2(fxa)}l${r2(k * 0.7)} ${r2(k)}-${r2(k * 0.7)} ${r2(k)}H${px}Z` : `M${px} ${fy}h${r2(fw)}l-${r2(k * 0.7)} ${r2(k)} ${r2(k * 0.7)} ${r2(k)}H${px}Z`;
  return `<path d="M${px} ${top}V${fy}" stroke="${T.ink}" stroke-width="${r2(size / 7)}"/>`
    + `<path d="${notch}" fill="${T.accent}"/>`
    + `<text x="${r2(left ? fxa + size * 0.9 : px + size * 0.4)}" y="${r2(fy + fh / 2 + size * 0.36)}" font-size="${size}" font-weight="700" fill="#1a1a1a">${esc(label)}</text>`;
}

// the site's world: sky to warm haze, stars and a moon at night (a pale sun by day), a far range of
// mountains with lit faces, rolling hills, a faint year over open sky, then the slate ground with its lit edge.
// o: { gy, mark: [x, baseline, size] (optional), moon: [x, y, scale], k (mountain height scale), w, h, sky (gradient id) }
const PEAKS = [[-20, 46], [70, 150], [160, 70], [250, 190], [345, 60], [430, 132], [520, 52], [610, 176], [700, 66], [790, 140], [880, 50]];
const STARS = [[44, 22], [131, 108], [196, 34], [372, 112], [318, 18], [377, 120], [452, 28], [489, 86], [604, 40], [655, 16], [702, 104], [765, 120], [823, 96], [96, 70], [574, 110], [410, 64]];
function backdrop(T, o) {
  const { gy, k } = o, w = o.w || W, h = o.h || H, out = [];
  out.push(`<rect width="${w}" height="${h}" fill="url(#${o.sky || 'sky'})"/>`);
  // stars: three brightnesses, one path each. fewer and fainter at dawn and dusk.
  if (T.stars) for (const [k, op, sz] of [[0, 0.85, 2.2], [1, 0.5, 1.6], [2, 0.7, 1.6]]) {
    out.push(`<path d="${STARS.filter((_, i) => i % 3 === k).map(([x, y]) => `M${x} ${Math.round(y * gy / 224)}h${sz}v${sz}h-${sz}z`).join('')}" fill="${T.star}" opacity="${r2(op * T.stars)}"/>`);
  }
  // the moon at night, the sun by day. at dawn and dusk the sun sits low on the ridge in a wide warm glow.
  // in summer the day sun gets the same glow, bigger.
  const [mx0, my0, ms] = o.moon, my = T.low ? r2(gy - 100 * k) : my0, mx = r2(mx0 + (T.dx || 0) * ms);
  const warm = T.low || (T.season === 'summer' && T.body === 'sun');
  if (warm) out.push(`<circle cx="${mx}" cy="${my}" r="${r2((T.low ? 170 : 290) * ms)}" fill="url(#glow)"/>`);
  out.push(`<g transform="translate(${mx} ${my}) scale(${ms})">`
    + (T.body === 'moon'
      ? `<circle r="32" fill="${T.glow}" opacity="${T.glowOp}"/><circle r="17" fill="${T.sun}"/><circle cx="8" cy="-4.5" r="14.5" fill="${mixHex(T.sky0, T.sky1, my / (o.skyH || 240))}"/>`
      : `${warm ? '' : `<circle r="34" fill="${T.glow}" opacity="${T.glowOp}"/>`}<circle r="${T.low ? 22 : 20}" fill="${T.sun}" opacity="${T.sunOp ?? 0.95}"/>`)
    + '</g>');
  const pts = PEAKS.map(([x, h]) => [x, r2(gy - h * k)]);
  out.push(`<path d="M-20 ${gy}${pts.map(([x, y]) => `L${x} ${y}`).join('')}L860 ${gy}Z" fill="${T.far}"/>`);
  // lit faces: from each peak down the left slope
  out.push(`<path d="${pts.slice(1, -1).map(([x, y], i) => {
    const a = pts[i], c = pts[i + 2];
    if (y > a[1] || y > c[1]) return '';
    return `M${x} ${y}L${a[0]} ${a[1]}L${r2(a[0] + (x - a[0]) * 0.55)} ${r2(a[1] + (gy - a[1]) * 0.2)}Z`;
  }).join('')}" fill="${T.farLit}"/>`);
  if (T.season === 'snow') {
    out.push(`<path d="${pts.slice(1, -1).map(([x, y], i) => {
      const a = pts[i], c = pts[i + 2];
      if (y > a[1] || y > c[1] || gy - y < 50 * k) return '';
      const at = (p, f) => [r2(x + (p[0] - x) * f), r2(y + (p[1] - y) * f)];
      const [l, r] = [at(a, 0.2), at(c, 0.2)], [l2, r2_] = [at(a, 0.12), at(c, 0.14)];
      return `M${x} ${y}L${l[0]} ${l[1]}L${r2((l[0] + x) / 2)} ${r2(l2[1] + 2)}L${x} ${r2(l[1] - 1)}L${r2((r[0] + x) / 2)} ${r2(r2_[1] + 2)}L${r[0]} ${r[1]}Z`;
    }).join('')}" fill="${T.snow}" opacity="${T.theme === 'dark' ? 0.5 : 0.95}"/>`);
  }
  // hills: a smooth wave, cosine eased between heights
  const hh = [34, 58, 30, 66, 40, 54, 28, 60, 36];
  let d = `M-10 ${gy}`;
  for (let x = -10; x <= 850; x += 20) {
    const u = (x + 10) / 110, i = Math.floor(u), f = u - i;
    const a = hh[i % hh.length], b2 = hh[(i + 1) % hh.length];
    d += `L${x} ${Math.round(gy - (a + (b2 - a) * (1 - Math.cos(f * Math.PI)) / 2) * k * 0.8)}`;
  }
  out.push(`<path d="${d}L850 ${gy}Z" fill="${T.mid}"/>`);
  // summer days: a faint heat shimmer over the hills
  if (T.haze) {
    const wave = (y) => `M-20 ${y}q10 -2.2 20 0${'t20 0'.repeat(Math.ceil((w + 40) / 20))}`;
    out.push(`<g class="hz" fill="none" stroke="${T.haze}" stroke-width="2" stroke-linecap="round">${[10, 20, 31].map((dy, i) => `<path d="${wave(gy - dy)}" opacity="${[0.55, 0.4, 0.25][i]}"/>`).join('')}</g>`);
  }
  if (o.mark) {
    const [yx, yb, ys] = o.mark;
    out.push(`<text class="sg" x="${yx}" y="${yb}" font-size="${ys}" text-anchor="middle" fill="${T.mark}" opacity="${T.markOp}">${esc(o.year)}</text>`);
  }
  out.push(`<rect y="${gy}" width="${w}" height="${h - gy}" fill="${T.ground}"/><rect y="${gy}" width="${w}" height="4" fill="${T.edge}"/>`);
  // winter: snow lies along the ground's edge, in soft drifts
  if (T.season === 'snow') {
    out.push(`<path d="M0 ${gy - 1}${[40, 150, 260, 380, 500, 610, 730, 830].filter((x) => x < w + 40).map((x, i) => `Q${x - 30} ${gy - 1} ${x - 20} ${r2(gy - 3.5 - (i % 3))}T${x} ${gy - 1}`).join('')}H${w}V${gy + 4}H0Z" fill="${T.snow}"/>`);
  }
  // a few worn marks in the dirt, like the site's
  out.push(`<path d="${[[70, 0.5], [190, 0.85], [330, 0.25], [415, 0.7], [560, 0.4], [700, 0.9], [790, 0.2]].filter(([x]) => x < w - 20).map(([x, f]) => `M${x} ${r2(gy + 10 + f * (h - gy - 18))}h${r2(8 + f * 14)}`).join('')}" stroke="${T.tex}" stroke-width="3" stroke-linecap="round"/>`);
  return out.join('');
}

function wideScene(state, T, cfg) {
  const out = [], Wd = WIDE;
  const layout = layoutTimeline(state.repos || [], cfg);
  const { slots, flagSlot } = layout;
  const streak = state.streak || { current: 0, best: 0 };
  const today = state.lastDaily || state.today || new Date().toISOString().slice(0, 10);
  const dy = Wd.gy - GY;
  // the year sits over the open sky above the timeline, not behind the runner
  out.push(backdrop(T, { gy: Wd.gy, k: 0.62, year: today.slice(0, 4), mark: [MARK.wide[0], Wd.gy - MARK.wide[1], MARK.wide[2]], moon: [556, 50, 1] }));
  out.push(fallers(T.season, { w: W, gy: Wd.gy, n: 10, snow: 22, theme: T.theme, clear: 360 }));
  // track: the ground's lit edge is the timeline. the streak part is accent while it's alive, then the road ahead
  const fx = flagSlot ? flagSlot.x + TILE : 462;
  if (streak.current > 0) out.push(`<path d="M${fx} ${Wd.gy}H${Wd.rx}" stroke="${T.accent}" stroke-width="3.5" stroke-linecap="round"/>`);
  out.push(`<g transform="translate(0 ${dy})">${tiles(layout, T, cfg)}</g>`);
  // year marks under the towers where the year changes
  let lastYear = '';
  for (const s of slots) {
    if (s.kind !== 'tower') continue;
    const y = s.tower.repos[0].created.slice(0, 4);
    if (y === lastYear) continue;
    out.push(`<text x="${s.x}" y="${Wd.gy + 20}" font-size="13" fill="${T.gInk}">${y}</text>`);
    lastYear = y;
  }
  if (flagSlot) {
    out.push(flag(streak, T, flagSlot.x + TILE / 2, Wd.gy - TILE * flagSlot.tower.repos.length - 3, Wd.gy - 82, 14));
    if (streak.current > 0 && streak.start) out.push(`<text x="${fx + 6}" y="${Wd.gy + 44}" font-size="13" fill="${T.gInk}">since ${fmtShort(streak.start)}</text>`);
  }
  const ax = r2(Wd.rx - RX * Wd.s), ay = r2(Wd.gy - GY * Wd.s);
  out.push(`<g transform="translate(${ax} ${ay}) scale(${Wd.s})">${action(state, T, { ls: 10, ly: 15, mask: 'mw' })}</g>`);
  out.push(`<text x="${Wd.rx}" y="${Wd.gy + 44}" font-size="13" text-anchor="middle" fill="${T.gInk}">today</text>`);
  const bx = Wd.rx + 18;
  out.push(speech(T, { x: bx, y: 88, size: 19, pad: 13, tail: [bx + 14, bx + 30, Wd.rx + 12, r2(Wd.gy - 64)] }));
  // title, counter, and the site's clock
  out.push(`<text class="sg" x="28" y="66" font-size="50" fill="${T.accentInk}" letter-spacing="-1">still running.</text>`);
  out.push(`<text x="30" y="96" font-size="15" fill="${T.muted}">${esc(counterLine(state.tries || 0))}</text>`);
  const since = sinceStart(cfg.start, today);
  out.push(`<circle class="lv" cx="${r2(812 - textW(`since ${fmtDay(cfg.start)}`, 12) - 10)}" cy="26" r="4" fill="${T.live}"/>`);
  out.push(`<text x="812" y="30" font-size="12" text-anchor="end" fill="${T.muted}">since ${fmtDay(cfg.start)}</text>`);
  out.push(`<text class="ck" x="812" y="70" font-size="40" text-anchor="end" fill="${T.ink}">${since.y}<tspan font-size="20" fill="${T.muted}">y </tspan>${since.d}<tspan font-size="20" fill="${T.muted}">d</tspan></text>`);
  return out.join('');
}

// tablets (the image is 440-680 css px there): title and bubble on top, every block below with one lock per gap
function narrowScene(state, T, cfg) {
  const N = NARROW, out = [];
  const layout = layoutTimeline(state.repos || [], cfg, 1);
  const { slots, flagSlot } = layout;
  const streak = state.streak || { current: 0, best: 0 };
  out.push(backdrop(T, { gy: N.gy, k: 0.72, moon: [568, 126, 0.7] }));
  out.push(fallers(T.season, { w: W, gy: N.gy, n: 8, snow: 16, theme: T.theme, clear: 600 }));
  const ox = r2(N.x0 - SLOT0 * N.ts), oy = r2(N.gy - GY * N.ts);
  const nx = (x) => r2(ox + x * N.ts);
  const end = slots.length ? nx(slots.at(-1).x + TILE) : 420;
  const fx = flagSlot ? nx(flagSlot.x + TILE) : end;
  if (streak.current > 0) out.push(`<path d="M${fx} ${N.gy}H${N.rx}" stroke="${T.accent}" stroke-width="5" stroke-linecap="round"/>`);
  out.push(`<g transform="translate(${ox} ${oy}) scale(${N.ts})">${tiles(layout, T, cfg)}</g>`);
  if (flagSlot) out.push(flag(streak, T, nx(flagSlot.x + TILE / 2), r2(oy + (GY - TILE - (flagSlot.tower.repos.length - 1) * STACK) * N.ts - 4), 136, 26, true));
  const ax = r2(N.rx - RX * N.s), ay = r2(N.gy - GY * N.s);
  out.push(`<g transform="translate(${ax} ${ay}) scale(${N.s})">${action(state, T, { ls: 12.5, ly: 10.75, mask: 'mn' })}</g>`);
  const [size, pad] = N.bubble, bw = bubbleBox(size, pad).w, bx = r2(W - 18 - bw);
  out.push(speech(T, { x: bx, y: 8, size, pad, tail: [r2(bx + 30), r2(bx + 54), N.rx + 14, N.gy - 88] }));
  out.push(`<text class="sg" x="${N.x0 - 2}" y="${N.title}" font-size="68" fill="${T.accentInk}" letter-spacing="-1.5">still running.</text>`);
  out.push(`<text x="${N.x0}" y="${N.counterY}" font-size="${N.counter}" fill="${T.muted}">${esc(counterLine(state.tries || 0))}</text>`);
  return out.join('');
}

// phone, its own 2:1 picture: title and bubble on top, then every block (one lock per gap), the flag
// pointing back over them, the runner with the next two hurdles big enough to see faces, and the counter on the ground.
export function phoneLayout(cfg, repos) {
  const P = PHONE, layout = layoutTimeline(repos, cfg, 1);
  const ox = r2(P.x0 - SLOT0 * P.ts), oy = r2(P.gy - GY * P.ts);
  const nx = (x) => r2(ox + x * P.ts);
  const tallest = Math.max(1, ...layout.towers.map((t) => t.repos.length));
  return { layout, ox, oy, nx, end: layout.slots.length ? nx(layout.slots.at(-1).x + TILE) : 360, top: r2(P.gy - (TILE + (tallest - 1) * STACK) * P.ts) };
}
function phoneScene(state, T, cfg) {
  const P = PHONE, out = [];
  const { layout, ox, oy, nx, end } = phoneLayout(cfg, state.repos || []);
  const { flagSlot } = layout;
  const streak = state.streak || { current: 0, best: 0 };
  out.push(backdrop(T, { gy: P.gy, k: 0.6, w: P.w, h: P.h, sky: 'skyp', skyH: P.gy, moon: [528, 132, 0.6] }));
  out.push(fallers(T.season, { w: P.w, gy: P.gy, n: 7, snow: 16, theme: T.theme, clear: P.w }));
  const fx = flagSlot ? nx(flagSlot.x + TILE) : end;
  if (streak.current > 0) out.push(`<path d="M${fx} ${P.gy}H${P.rx}" stroke="${T.accent}" stroke-width="4.5" stroke-linecap="round"/>`);
  out.push(`<g transform="translate(${ox} ${oy}) scale(${P.ts})">${tiles(layout, T, cfg)}</g>`);
  if (flagSlot) {
    const tileTop = r2(oy + (GY - TILE - (flagSlot.tower.repos.length - 1) * STACK) * P.ts);
    out.push(flag(streak, T, nx(flagSlot.x + TILE / 2), tileTop - 4, r2(tileTop - 4 - Math.round(P.flag * 2.3) - 10), P.flag, true, true));
  }
  const ax = r2(P.rx - RX * P.s), ay = r2(P.gy - GY * P.s);
  out.push(`<g transform="translate(${ax} ${ay}) scale(${P.s})">${action(state, T, { ls: 13.75, ly: 13, mask: 'mp', youUp: true })}</g>`);
  const [size, pad] = P.bubble, bw = bubbleBox(size, pad).w, bx = r2(P.w - 14 - bw);
  // a short tail, leaning toward him, so it never reaches down into the track
  out.push(speech(T, { x: bx, y: 10, size, pad, tail: [r2(bx + 18), r2(bx + 38), r2(bx + 16), 0], tailLen: 16 }));
  out.push(`<text class="sg" x="${P.x0 - 2}" y="56" font-size="${P.title}" fill="${T.accentInk}" letter-spacing="-1.5">still running.</text>`);
  // the counter sits on the ground under the blocks, so the sky between the title and the blocks stays clear
  out.push(`<text x="${P.x0}" y="${P.h - 13}" font-size="${P.counter}" fill="${T.gInk}">${esc(counterLine(state.tries || 0))}</text>`);
  return out.join('');
}

// a mask in model x: hurdles fade out at both ends of the part of the lane that's on show
function showMask(id, [a0, a1, b0, b1], w = W, h = H) {
  const o = (x) => r2((x - a0) / (b1 - a0));
  return `<linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${a0}" y1="0" x2="${b1}" y2="0">`
    + `<stop offset="0" stop-color="#000"/><stop offset="${o(a1)}" stop-color="#fff"/><stop offset="${o(b0)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`
    + `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="url(#${id}g)"/></mask>`;
}

export const wobbling = (state, now = Date.now()) => !!state.lastKnock && now - Date.parse(state.lastKnock) < 864e5;

const avatarDefs = (state) => (state.hurdles || []).slice(0, 5).map((h, i) => h && h.avatar
  ? `<image id="av${i}" x="-${HURDLE_R}" y="-${HURDLE_R}" width="${HURDLE_R * 2}" height="${HURDLE_R * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avc)" href="${h.avatar}"/>` : '').join('');
const skyDef = (id, T, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${y2}"><stop offset="0" stop-color="${T.sky0}"/><stop offset="1" stop-color="${T.sky1}"/></linearGradient>`;
const AVC = `<clipPath id="avc" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>`;
// the low sun's glow and the headlamp's beam, only when the scene has them
const lightDefs = (T) => (T.low || (T.season === 'summer' && T.body === 'sun')
  ? `<radialGradient id="glow"><stop offset="0" stop-color="${T.glow}" stop-opacity="${T.glowOp}"/><stop offset=".45" stop-color="${T.glow}" stop-opacity="${r2(T.glowOp * 0.45)}"/><stop offset="1" stop-color="${T.glow}" stop-opacity="0"/></radialGradient>` : '')
  + (T.lamp ? `<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff3c4" stop-opacity=".55"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></linearGradient>` : '');

export function heroSvg(state, cfg, themeName, now = Date.now()) {
  const T = themeFor(themeName, sceneAt(now));
  const wobble = wobbling(state, now);
  usedIcons = new Set();
  const wide = wideScene(state, T, cfg), narrow = narrowScene(state, T, cfg);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<style>${css(wobble, false, T.season)}</style>`
    + `<defs>${AVC}${lightDefs(T)}`
    + `<clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>`
    + skyDef('sky', T, 240)
    + showMask('mw', SHOW.wide) + showMask('mn', SHOW.narrow)
    + `${avatarDefs(state)}${iconDefs()}</defs>`
    + `<g id="wide"><g clip-path="url(#card)">${wide}</g></g>`
    + `<g id="narrow" display="none"><g clip-path="url(#card)">${narrow}</g></g>`
    + `</svg>\n`;
}

// the phone file, one per theme. the README picks it with (max-width: 600px) and (prefers-color-scheme: dark),
// which github's own theme switch rewrites, so it follows github's theme, not the phone's.
export function phoneSvg(state, cfg, themeName, now = Date.now()) {
  const P = PHONE, T = themeFor(themeName, sceneAt(now)), wobble = wobbling(state, now);
  usedIcons = new Set();
  const scene = phoneScene(state, T, cfg);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${P.w}" height="${P.h}" viewBox="0 0 ${P.w} ${P.h}">`
    + `<style>${css(wobble, true, T.season)}</style>`
    + `<defs>${AVC}${lightDefs(T)}<clipPath id="pc"><rect width="${P.w}" height="${P.h}" rx="14"/></clipPath>`
    + skyDef('skyp', T, P.gy)
    + showMask('mp', SHOW.phone)
    + `${avatarDefs(state)}${iconDefs()}</defs>`
    + `<g clip-path="url(#pc)">${scene}</g>`
    + `</svg>\n`;
}

// ---------- buttons (static) ----------
function miniRunner(T, x, y) {
  // same figure as the hero, mid stride, scaled down
  return `<g transform="translate(${x} ${y}) scale(.62)" fill="none" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="M-5 -13.5c-5-1-8 3-13 1.5s-7-3.5-11-1" stroke="${T.scarf}" stroke-width="4.5"/>`
    + `<g transform="rotate(25)"><path d="M0 0 1.2 6.5 -.6 12" stroke="${T.rBack}" stroke-width="4.2"/></g>`
    + `<g transform="rotate(6)"><rect x="-6.5" y="-16" width="13" height="18" rx="6.5" fill="${T.rInk}"/><circle cx="1.5" cy="-22" r="7.5" fill="${T.rInk}"/>`
    + `<ellipse cx="5" cy="-23" rx="1.4" ry="1.9" fill="${T.rEye}"/><rect x="-6" y="-15.5" width="13" height="4.5" rx="2.2" fill="${T.scarf}"/></g>`
    + `<g transform="rotate(-28)"><path d="M0 0 1.2 6.5 -.6 12" stroke="${T.rInk}" stroke-width="4.2"/></g>`
    + `<g transform="translate(1 -11) rotate(30)"><path d="M0 0 0 5.5 3.2 9.4" stroke="${T.rInk}" stroke-width="3.4"/></g></g>`;
}
// the site's pills: soft white by day, near black by night, a hairline edge, jetbrains mono 13px.
// "stop him" carries the site's stop button icon (ring, crown, square).
export const PILL = {
  light: { fill: '#ffffff', line: '#e3ded5', ring: '#ebe6dd', ink: '#1a1a1a', shadow: 0.07 },
  dark: { fill: '#141417', line: '#2c2c33', ring: '#2c2c33', ink: '#ededed', shadow: 0.35 },
};
export const BUTTON = { h: 44, size: 13, play: { text: 'play the real one', x: 44, padR: 20 }, stop: { text: 'stop him', x: 46, padR: 18 } };
export const buttonW = (kind) => Math.ceil(BUTTON[kind].x + textW(BUTTON[kind].text, BUTTON.size) + BUTTON[kind].padR) + 2;
let BTN_FONT = null;
export function buttonSvg(kind, themeName) {
  const T = THEMES[themeName], P = PILL[themeName], B = BUTTON[kind], w = buttonW(kind), h = BUTTON.h + 4;
  BTN_FONT ??= readFileSync(join(ROOT, 'data/fonts/jetbrains-mono-500-buttons.woff2')).toString('base64');
  const style = `<style>@font-face{font-family:sr-btn;font-weight:500;src:url(data:font/woff2;base64,${BTN_FONT}) format("woff2")}`
    + `text{font-family:sr-btn,"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:500}</style>`;
  const pill = `<rect x="1" y="2.5" width="${w - 2}" height="${BUTTON.h}" rx="${BUTTON.h / 2}" fill="#000000" opacity="${P.shadow}"/>`
    + `<rect x="1.5" y="1.5" width="${w - 3}" height="${BUTTON.h - 1}" rx="${(BUTTON.h - 1) / 2}" fill="${P.fill}" stroke="${P.line}"/>`;
  const icon = kind === 'stop'
    ? `<g transform="translate(1 1)"><circle cx="22" cy="22" r="18" fill="none" stroke="${P.ring}" stroke-width="3"/>`
      + `<rect x="19.5" y="9.5" width="5" height="3" rx="1" fill="${P.ink}"/><rect x="16" y="17" width="12" height="12" rx="2.5" fill="${P.ink}"/></g>`
    : miniRunner(T, 29, 31);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${style}${pill}${icon}`
    + `<text x="${B.x}" y="${r2(1 + BUTTON.h / 2 + BUTTON.size * 0.36)}" font-size="${BUTTON.size}" fill="${P.ink}">${B.text}</text></svg>\n`;
}

// ---------- write everything ----------
const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

export const RAW = 'https://raw.githubusercontent.com/aaghashm/aaghashm/main/assets/';
const monoFace = () => `@font-face{font-family:sr-mono;font-weight:500;src:url(data:font/woff2;base64,${readFileSync(join(ROOT, 'data/fonts/jetbrains-mono-500.woff2')).toString('base64')}) format("woff2")}`;

export function renderAll(state, root = ROOT, now = Date.now(), wall = readWall(root), repo = 'aaghashm/aaghashm') {
  const cfg = JSON.parse(readFileSync(join(root, 'data/repos.json'), 'utf8'));
  const assets = join(root, 'assets');
  const files = {};
  for (const th of ['dark', 'light']) {
    const svg = heroSvg(state, cfg, th, now);
    const name = `hero-${th}-${hash8(svg)}.svg`;
    files[th] = name;
    const p = join(assets, name);
    if (!existsSync(p) || readFileSync(p, 'utf8') !== svg) writeFileSync(p, svg);
    for (const k of ['play', 'stop']) writeIfChanged(join(assets, `${k}-${th}.svg`), buttonSvg(k, th));
    const phone = phoneSvg(state, cfg, th, now);
    files['phone-' + th] = `phone-${th}-${hash8(phone)}.svg`;
    writeIfChanged(join(assets, files['phone-' + th]), phone);
    const ws = wallSvg(wall, th, monoFace(), sceneAt(now));
    files['wall-' + th] = `wall-${th}-${hash8(ws)}.svg`;
    writeIfChanged(join(assets, files['wall-' + th]), ws);
  }
  for (const p of PALETTE) writeIfChanged(join(assets, `paint-${p.name}.svg`), chipSvg(p));
  // old hero files go, new hashes mean camo never serves a stale one
  const keep = new Set(Object.values(files));
  for (const f of readdirSync(assets)) if (/^(hero|phone|wall)(-(dark|light))?-[0-9a-f]{8}\.svg$/.test(f) && !keep.has(f)) unlinkSync(join(assets, f));
  state.assets = { heroDark: files.dark, heroLight: files.light, phoneDark: files['phone-dark'], phoneLight: files['phone-light'], wallDark: files['wall-dark'], wallLight: files['wall-light'] };
  const tmpl = readFileSync(join(root, 'templates/README.md.tmpl'), 'utf8');
  const md = tmpl.replaceAll('{{heroDark}}', files.dark).replaceAll('{{heroLight}}', files.light).replaceAll('{{phoneDark}}', files['phone-dark']).replaceAll('{{phoneLight}}', files['phone-light'])
    .replaceAll('{{playW}}', String(buttonW('play'))).replaceAll('{{stopW}}', String(buttonW('stop')))
    .replaceAll('{{wallDark}}', files['wall-dark']).replaceAll('{{wallLight}}', files['wall-light'])
    .replaceAll('{{wallLink}}', wallLink(wall, repo)).replaceAll('{{paintLinks}}', paintLinks(wall, repo, RAW))
    .replaceAll('{{painters}}', paintersLine(wall));
  writeIfChanged(join(root, 'README.md'), md);
  return state.assets;
}
function writeIfChanged(p, s) { if (!existsSync(p) || readFileSync(p, 'utf8') !== s) writeFileSync(p, s); }

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const sp = join(ROOT, 'data/state.json');
  const state = JSON.parse(readFileSync(sp, 'utf8'));
  const wp = join(ROOT, 'data/wall.json');
  if (!existsSync(wp)) writeFileSync(wp, JSON.stringify(readWall(ROOT), null, 1) + '\n');
  renderAll(state);
  writeFileSync(sp, JSON.stringify(state, null, 1) + '\n');
  console.log('rendered', state.assets);
}
