// builds the hero svgs (dark + light) from data/state.json.
// run directly: node scripts/render.mjs
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS } from './icons.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- scene constants ----------
// the box
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
// where the hurdles show, in model x: [gone, full, full, gone]. outside it they fade to nothing,
// so a hurdle never sits on the flag, the year labels or the edge of the picture.
// the big faint year: [center x, height above the ground, size]. it sits over the hills between
// the 2024 blocks and the flag, clear of every block, like the site's year behind open scenery.
export const MARK = { wide: [316, 32, 90] };
export const SHOW = { wide: [522, 544, 724, 750] };
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

// cubic-bezier easing (keeps the keyframes honest)
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

function css() {
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
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`.trim().replace(/\n+/g, '\n');
}

// each icon path is written once in <defs> and reused
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

function lockTile(x, T) {
  const y = GY - TILE;
  return `<g class="tile"><rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="6" fill="${T.lockShade}"/>`
    + `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE - 2.5}" rx="6" fill="${T.lockFace}"/>`
    + icon('padlock', x + 6, y + 5, 14, T.lockInk) + '</g>';
}

// runner, feet at (RX, GY). drawn in a frame with the hip at (0,0). same figure and colors as the site's.
function runner(T) {
  const leg = (cls, col, rot) => `<g class="${cls}"${rot != null ? ` transform="rotate(${rot})"` : ''}><path d="M0 0 1.2 6.5 -.6 12" stroke="${col}" stroke-width="4.2"/></g>`;
  const arm = (cls, col, rot, d = 'M0 0 0 5.5 3.2 9.4') => `<g transform="translate(1 -11)"><g class="${cls}"${rot != null ? ` transform="rotate(${rot})"` : ''}><path d="${d}" stroke="${col}" stroke-width="3.4"/></g></g>`;
  const body = (lean) => `<g transform="rotate(${lean})"><rect x="-6.5" y="-16" width="13" height="18" rx="6.5" fill="${T.rInk}"/>`
    + `<circle cx="1.5" cy="-22" r="7.5" fill="${T.rInk}"/><ellipse cx="5" cy="-23" rx="1.4" ry="1.9" fill="${T.rEye}"/>`
    + `<rect x="-6" y="-15.5" width="13" height="4.5" rx="2.2" fill="${T.scarf}"/></g>`;
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
function speech(T, { x, y, size, pad, tail }) {
  const { w, h, h1 } = bubbleBox(size, pad), r = Math.round(size * 0.55);
  const l1 = r2(y + pad + size * 0.8), l2 = r2(l1 + size * 1.25);
  const box = (hh) => `<path d="${bubblePath(x, y, r2(w), r2(hh), r, tail)}" fill="${T.board}" stroke="${T.boardLine}" stroke-width="${r2(size / 14)}"/>`;
  const line1 = `<text class="sg" x="${x + pad}" y="${l1}" font-size="${size}" fill="${T.ink}">fine. stopped.</text>`;
  return `<g class="b1" opacity="0">${box(h1)}${line1}</g>`
    + `<g class="b2">${box(h)}${line1}<text class="sg" x="${x + pad}" y="${l2}" font-size="${size}" fill="${T.accentInk}">jk.</text></g>`;
}
export const bubbleBox = (size, pad) => ({ w: sansW('fine. stopped.', size) + pad * 2, h: pad * 2 + size * 2.1, h1: pad * 2 + size * 0.95 });

function hurdle(i, h, T, { ls, ly }) {
  const x0 = START_X[i];
  const legs = `<path d="M-6 ${HURDLE_CY + 9}V${GY}M6 ${HURDLE_CY + 9}V${GY}" stroke="${T.lockInk}" stroke-width="2"/>`;
  const ring = `<circle cy="${HURDLE_CY}" r="${HURDLE_R}" fill="none" stroke="${T.ink}" stroke-width="1.5"/>`;
  let shape;
  if (h) {
    // someone tried: a plain face
    shape = legs + `<circle cy="${HURDLE_CY}" r="${HURDLE_R}" fill="${T.lockFace}"/>`
      + `<circle cy="${HURDLE_CY - 3}" r="4.2" fill="${T.lockInk}"/><path d="M-7 ${HURDLE_CY + 9.6}a7 6.4 0 0 1 14 0Z" fill="${T.lockInk}"/>` + ring;
  } else {
    // an empty slot: a plain track hurdle
    shape = `<path d="M-9 ${GY - 16}V${GY}M9 ${GY - 16}V${GY}" stroke="${T.lockInk}" stroke-width="2"/>`
      + `<rect x="-12" y="${GY - 19}" width="24" height="5" rx="2" fill="${T.lockInk}"/>`;
  }
  // the label sits on the ground under the hurdle. the newest slot, still empty, asks for you.
  // ls is the model size and ly the baseline under GY: 10 is 15px wide, 13 is 22.75px in the phone box.
  const label = h ? `<text y="${GY + ly}" font-size="${ls}" text-anchor="middle" fill="${T.gInk}">#${h.n}</text>`
    : i === 0 ? `<text class="sg" y="${GY + ly}" font-size="${r2(ls * 1.05)}" text-anchor="middle" fill="${T.gAccent}">you?</text>` : '';
  return `<g transform="translate(${x0} 0)"><g class="hd h${i}" opacity="${r2(opacityAt(x0))}">${shape}${label}</g></g>`;
}

// hurdles, runner and the road ahead, in model coordinates. the layout scales it.
function action(state, T, { ls, ly, mask }) {
  const out = [];
  out.push(`<path class="ds" d="M${RX + 10} ${GY}H${LANE_R}" stroke="${T.dash}" stroke-width="2" stroke-dasharray="10 14"/>`);
  out.push(`<path class="dr" d="M${RX + 10} ${GY}H${LANE_R}" stroke="${T.dash}" stroke-width="2" stroke-dasharray="10 14" opacity="0"/>`);
  const hs = state.hurdles || [];
  out.push(`<g mask="url(#${mask})">`);
  for (let i = START_X.length - 1; i >= 0; i--) out.push(hurdle(i, hs[i], T, { ls, ly }));
  out.push('</g>');
  out.push(runner(T));
  return out.join('');
}

// repo towers and grey locks, model coordinates, baseline GY
function tiles(layout, T, cfg) {
  const out = [];
  const { slots } = layout;
  for (const s of slots) {
    if (s.kind === 'lock') out.push(lockTile(s.x, T));
    else s.tower.repos.forEach((r, k) => out.push(repoTile(r, s.x, GY - TILE - k * STACK, cfg)));
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
  const layout = layoutTimeline(state.repos || [], cfg);
  const { slots, flagSlot } = layout;
  const streak = state.streak || { current: 0, best: 0 };
  const today = state.lastDaily || state.today || new Date().toISOString().slice(0, 10);
  const dy = Wd.gy - GY;
  // the year sits over the open sky above the timeline, not behind the runner
  out.push(backdrop(T, dark, { gy: Wd.gy, k: 0.62, year: today.slice(0, 4), mark: [MARK.wide[0], Wd.gy - MARK.wide[1], MARK.wide[2]], moon: [556, 50, 1] }));
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

// a mask in model x: hurdles fade out at both ends of the part of the lane that's on show
function showMask(id, [a0, a1, b0, b1], w = W, h = H) {
  const o = (x) => r2((x - a0) / (b1 - a0));
  return `<linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${a0}" y1="0" x2="${b1}" y2="0">`
    + `<stop offset="0" stop-color="#000"/><stop offset="${o(a1)}" stop-color="#fff"/><stop offset="${o(b0)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`
    + `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="url(#${id}g)"/></mask>`;
}

const skyDef = (id, T, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${y2}"><stop offset="0" stop-color="${T.sky0}"/><stop offset="1" stop-color="${T.sky1}"/></linearGradient>`;

export function heroSvg(state, cfg, themeName, now = Date.now()) {
  const T = THEMES[themeName];
  usedIcons = new Set();
  const dark = themeName === 'dark';
  const wide = wideScene(state, T, cfg, dark);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<style>${css()}</style>`
    + `<defs>`
    + `<clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>`
    + skyDef('sky', T, 240)
    + showMask('mw', SHOW.wide)
    + `${iconDefs()}</defs>`
    + `<g id="wide"><g clip-path="url(#card)">${wide}</g></g>`
    + `</svg>\n`;
}

// ---------- write everything ----------
export function renderAll(state, root = ROOT, now = Date.now()) {
  const cfg = JSON.parse(readFileSync(join(root, 'data/repos.json'), 'utf8'));
  for (const th of ['dark', 'light']) writeFileSync(join(root, 'assets', `hero-${th}.svg`), heroSvg(state, cfg, th, now));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const state = JSON.parse(readFileSync(join(ROOT, 'data/state.json'), 'utf8'));
  renderAll(state);
  console.log('rendered');
}
