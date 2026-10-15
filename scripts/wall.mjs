// the wall: a 48x12 pixel board under the hero that visitors paint, one pixel a day each.
// state lives in data/wall.json. rows are 12 strings of 48 letters, '.' is bare wall.
// pure functions here, the issue handling is in reconcile.mjs.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sceneAt, skyFor, SNOW } from './scene.mjs';

export const COLS = 48, ROWS = 12;
export const LOCK_MS = 3600e3;     // a tile someone just painted can't be painted over for an hour
export const PAINT_MAX = 30;       // paints per hour before the wall says it's busy
// the hero's colors: the flag, c++, javascript, the live dot, tableau, python, the runner by night and by day
export const PALETTE = [
  { name: 'orange', k: 'o', c: '#f5a623' },
  { name: 'pink', k: 'p', c: '#f34b7d' },
  { name: 'yellow', k: 'y', c: '#eab308' },
  { name: 'green', k: 'g', c: '#3ad06b' },
  { name: 'teal', k: 't', c: '#14b8a6' },
  { name: 'blue', k: 'b', c: '#3b82f6' },
  { name: 'white', k: 'w', c: '#f3efe8' },
  { name: 'black', k: 'k', c: '#1f1f27' },
];
const BY_NAME = Object.fromEntries(PALETTE.map((p) => [p.name, p]));
const BY_K = Object.fromEntries(PALETTE.map((p) => [p.k, p]));
export const colorNames = () => PALETTE.map((p) => p.name);

export function emptyWall() {
  return { version: 1, rows: Array.from({ length: ROWS }, () => '.'.repeat(COLS)), count: 0, last: [], seen: {}, fresh: {}, recent: [] };
}
export function readWall(root) {
  const p = join(root, 'data/wall.json');
  if (!existsSync(p)) return emptyWall();
  const w = { ...emptyWall(), ...JSON.parse(readFileSync(p, 'utf8')) };
  // always ROWS x COLS, whatever an older file had
  w.rows = Array.from({ length: ROWS }, (_, i) => (w.rows[i] || '').slice(0, COLS).padEnd(COLS, '.'));
  return w;
}

// "paint 12 7 orange" -> {x, y, k, name}. the color can sit anywhere; the numbers are column then row.
// not a paint title -> null. a paint title that doesn't parse -> {bad: true}.
export function parsePaint(title) {
  const t = String(title ?? '').trim().toLowerCase();
  if (!/^paint(\s|$)/.test(t)) return null;
  const words = t.slice(5).replace(/[(),:]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length !== 3) return { bad: true };
  const nums = words.filter((w) => /^\d{1,2}$/.test(w)).map(Number), cols = words.filter((w) => BY_NAME[w]);
  if (nums.length !== 2 || cols.length !== 1) return { bad: true };
  const [x, y] = nums;
  if (x < 1 || x > COLS || y < 1 || y > ROWS) return { bad: true };
  return { x, y, k: BY_NAME[cols[0]].k, name: cols[0] };
}

export const colorOf = (k) => BY_K[k];
export const tileAt = (wall, x, y) => wall.rows[y - 1][x - 1];
export const isLocked = (wall, x, y, now) => { const t = wall.fresh?.[`${x},${y}`]; return !!t && now - Date.parse(t) < LOCK_MS; };

export function applyPaint(wall, { x, y, k, id = null, login = null, at }) {
  const r = wall.rows[y - 1];
  wall.rows[y - 1] = r.slice(0, x - 1) + k + r.slice(x);
  wall.count = (wall.count || 0) + 1;
  wall.fresh[`${x},${y}`] = at;
  wall.recent.push(at);
  wall.last = [{ id, login, x, y, k, at }, ...(wall.last || [])].slice(0, 3);
  return wall;
}

// the hour lock, the busy window and the once-a-day list only need to remember so far back
export function pruneWall(wall, now) {
  const yday = new Date(now - 864e5).toISOString().slice(0, 10);
  wall.fresh = Object.fromEntries(Object.entries(wall.fresh || {}).filter(([, t]) => now - Date.parse(t) < LOCK_MS));
  wall.recent = (wall.recent || []).filter((t) => now - Date.parse(t) < 3600e3);
  wall.seen = Object.fromEntries(Object.entries(wall.seen || {}).filter(([, d]) => d >= yday));
  wall.last = (wall.last || []).slice(0, 3);
  return wall;
}

// take a name off the "last painted by" line (the owner's remove). the pixels stay.
export function scrubPainter(wall, id) {
  let n = 0;
  for (const e of wall.last || []) if (id != null && e.id === id && e.login) { e.login = null; n++; }
  return n;
}

// a faint runner, mid stride: round head, leaning in, front arm bent, legs wide. speed lines behind him.
// it's drawn under the paint and anyone can paint over it.
const SEED_ART = [
  '...........##..',
  '..........####.',
  '..........####.',
  '...........##..',
  '.......#####.#.',
  '......#.###.#..',
  '.....#..##.....',
  '........###....',
  '......##..##...',
  '....##.....#...',
  '...#.......##..',
];
// speed lines behind him: [row in the art, first column, last column]
const SEED_LINES = [[1, 4, 7], [4, 1, 4], [7, 2, 5]];
export const SEED_AT = [8, 2];
export function seedPixels() {
  const out = new Set();
  SEED_ART.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') out.add(`${SEED_AT[0] + i},${SEED_AT[1] + j}`); }));
  for (const [j, a, b] of SEED_LINES) for (let i = a; i <= b; i++) out.add(`${SEED_AT[0] + i},${SEED_AT[1] + j}`);
  return out;
}

// the blinking spot the color links fill in: one of the bare tiles nearest the middle of the open part
// of the wall, picked by how many have been painted so far. so it moves after every paint, is the same
// on every render in between, and one-click paint grows out from the middle instead of landing anywhere.
export const SPOT_CENTER = [33, 6.5];
export function suggestSpot(wall) {
  const seed = seedPixels(), free = [];
  for (let y = 1; y <= ROWS; y++) for (let x = 1; x <= COLS; x++) if (tileAt(wall, x, y) === '.' && !seed.has(`${x},${y}`)) free.push([x, y]);
  if (!free.length) return { x: SPOT_CENTER[0], y: 6 };
  const d = ([x, y]) => (x - SPOT_CENTER[0]) ** 2 + ((y - SPOT_CENTER[1]) * 1.6) ** 2;
  free.sort((a, b) => d(a) - d(b) || a[1] - b[1] || a[0] - b[0]);
  const near = free.slice(0, 12);
  const i = Number((BigInt(wall.count || 0) * 2654435761n + 97n) % BigInt(near.length));
  return { x: near[i][0], y: near[i][1] };
}

// ---------- the picture ----------
// the wall stands in the same world as the hero: the hour's sky behind it, the hills' color on its frame,
// the same ground under it, snow on top in winter. so it changes with the hero every 3 hours.
export const WALL = { w: 840, cell: 15, gx: 60, gy: 38, ground: 34 };
WALL.h = WALL.gy + ROWS * WALL.cell + 8 + WALL.ground;
// ink: the hero runner's colors, for the faint seed runner and the "you" tag. mark: the free spot.
const WT = {
  light: { label: '#3f4f78', seed: '#1f1f27', seedOp: 0.4, mark: '#f5a623', markEdge: '#1f1f27', tag: '#1f1f27', tagInk: '#ffffff', gInk: '#eef3fb', glint: '#1f1f27' },
  dark: { label: '#a3b1c6', seed: '#f3efe8', seedOp: 0.3, mark: '#f5a623', markEdge: '#ffffff', tag: '#f5a623', tagInk: '#1a1a1a', gInk: '#a3b1c6', glint: '#ffffff' },
};
const rnd = (i) => { const v = Math.sin(i * 91.7 + 13.3) * 43758.5453; return v - Math.floor(v); };
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

// the "you" tag over the free spot: [width, height, font size, tick] on a wide screen and on a phone
const TAG = { dk: [36, 19, 12, 5], ph: [84, 42, 28, 11] };
function youTag(cx, top, bottom, T, flip) {
  return Object.entries(TAG).map(([cls, [w, h, fs, t]]) => {
    // above the tile, tick pointing down. on the top rows it hangs below instead, tick up.
    const y = flip ? bottom + t : top - t - h, ty = flip ? bottom + 1 : top - 1;
    const tick = flip ? `M${cx - t} ${y + 0.5}L${cx} ${ty}L${cx + t} ${y + 0.5}Z` : `M${cx - t} ${y + h - 0.5}L${cx} ${ty}L${cx + t} ${y + h - 0.5}Z`;
    return `<g class="tg ${cls}"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${T.tag}"/><path d="${tick}" fill="${T.tag}"/>`
      + `<text x="${cx}" y="${y + h / 2 + fs * 0.36}" font-size="${fs}" text-anchor="middle" fill="${T.tagInk}">you</text></g>`;
  }).join('');
}

export function wallSvg(wall, themeName, fontCss = '', sc = sceneAt(Date.now())) {
  const T = WT[themeName], S = skyFor(themeName, sc), { w, h, cell, gx, gy } = WALL, gw = COLS * cell, gh = ROWS * cell, out = [];
  const px = (x) => gx + (x - 1) * cell, py = (y) => gy + (y - 1) * cell, c = cell - 2;
  const ground = gy + gh + 8;
  // the hour's sky, and the hills' color as the wall's frame
  out.push(`<rect width="${w}" height="${h}" fill="url(#wsky)"/>`);
  out.push(`<rect x="${gx - 7}" y="${gy - 7}" width="${gw + 14}" height="${ground - gy + 7}" rx="5" fill="${S.mid}"/>`);
  // bare tiles: the far range's color, a few lit like its faces, so it reads as a wall, not a spreadsheet
  const bare = mix(S.far, S.sky1, 0.25);
  out.push(`<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" fill="url(#tl)"/>`);
  const lit = [];
  for (let i = 0; i < COLS * ROWS; i++) if (rnd(i) < 0.09) lit.push(`M${px((i % COLS) + 1) + 1} ${py(Math.floor(i / COLS) + 1) + 1}h${c}v${c}h-${c}z`);
  out.push(`<path d="${lit.join('')}" fill="${S.farLit}"/>`);
  // guides every 8 columns and 4 rows, to count by
  const g = [];
  for (let x = 8; x < COLS; x += 8) g.push(`M${px(x + 1)} ${gy - 2}V${gy + gh + 2}`);
  for (let y = 4; y < ROWS; y += 4) g.push(`M${gx - 2} ${py(y + 1)}H${gx + gw + 2}`);
  out.push(`<path d="${g.join('')}" stroke="${S.edge}" stroke-width="1.2" stroke-dasharray="2 3" opacity=".8"/>`);
  // the faint seed runner, wherever nobody has painted yet
  const seed = [...seedPixels()].map((s) => s.split(',').map(Number)).filter(([x, y]) => tileAt(wall, x, y) === '.');
  out.push(`<path class="sd" d="${seed.map(([x, y]) => `M${px(x) + 1} ${py(y) + 1}h${c}v${c}h-${c}z`).join('')}" fill="${T.seed}" opacity="${T.seedOp}"/>`);
  // paint: one path per color, each pixel a touch bigger than its tile, like paint that spread a little
  for (const p of PALETTE) {
    const d = [];
    for (let y = 1; y <= ROWS; y++) for (let x = 1; x <= COLS; x++) if (tileAt(wall, x, y) === p.k) d.push(`M${px(x) + 0.5} ${py(y) + 0.5}h${cell - 1}v${cell - 1}h-${cell - 1}z`);
    if (d.length) out.push(`<path d="${d.join('')}" fill="${p.c}"/>`);
  }
  // the newest pixel glints
  const last = (wall.last || [])[0];
  if (last) out.push(`<rect class="gl" x="${px(last.x) - 1.5}" y="${py(last.y) - 1.5}" width="${cell + 3}" height="${cell + 3}" rx="3" fill="none" stroke="${T.glint}" stroke-width="2"/>`);
  // winter: snow on top of the wall
  const seg = (gw + 16) / 4;
  if (sc.season === 'snow') out.push(`<path d="M${gx - 8} ${gy - 6}q${seg / 2} -5 ${seg} 0t${seg} 0t${seg} 0t${seg} 0v4.5H${gx - 8}z" fill="${SNOW[themeName].lie}"/>`);
  // the free spot the color links fill in: solid, ringed, pulsing, with a "you" tag
  const s = suggestSpot(wall), sx = px(s.x), sy = py(s.y);
  out.push(`<rect class="rg" x="${sx - 2}" y="${sy - 2}" width="${cell + 4}" height="${cell + 4}" rx="4" fill="none" stroke="${T.mark}" stroke-width="2.5"/>`);
  out.push(`<rect class="bl" x="${sx}" y="${sy}" width="${cell}" height="${cell}" rx="2.5" fill="${T.mark}" stroke="${T.markEdge}" stroke-width="2"/>`);
  // a phone shows the wall at about 0.42x, so the tile there is drawn bigger than its cell
  out.push(`<rect class="bl ph" x="${sx - 6}" y="${sy - 6}" width="${cell + 12}" height="${cell + 12}" rx="4" fill="${T.mark}" stroke="${T.markEdge}" stroke-width="4"/>`);
  out.push(youTag(sx + cell / 2, sy - 3, sy + cell + 3, T, s.y <= 3));
  // labels: every 4th column and row on a wide screen, every 8th (and bigger) on a phone
  for (const x of [1, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48]) {
    out.push(`<text class="lb${x === 1 || x % 8 === 0 ? '' : ' mn'}" x="${px(x) + cell / 2}" y="${gy - 13}" text-anchor="middle" fill="${T.label}">${x}</text>`);
  }
  for (const y of [1, 4, 8, 12]) out.push(`<text class="lb" x="${gx - 12}" y="${py(y) + cell / 2 + 4}" text-anchor="end" fill="${T.label}">${y}</text>`);
  // it stands on the same ground as the hero
  out.push(`<rect y="${ground}" width="${w}" height="${WALL.ground}" fill="${S.ground}"/><rect y="${ground}" width="${w}" height="3" fill="${S.edge}"/>`);
  if (sc.season === 'snow') out.push(`<rect y="${ground - 1}" width="${w}" height="4" fill="${SNOW[themeName].lie}"/>`);
  const n = wall.count || 0;
  out.push(`<text class="cp" x="${gx}" y="${ground + 23}" fill="${T.gInk}">${n ? `the wall. ${n} pixel${n === 1 ? '' : 's'} so far.` : 'the wall. nobody yet.'}</text>`);
  out.push(`<text class="cp" x="${gx + gw}" y="${ground + 23}" text-anchor="end" fill="${T.gInk}">free spot: ${s.x} ${s.y}</text>`);
  const css = `${fontCss}text{font-family:sr-mono,"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:500}`
    + `.lb{font-size:12px}.cp{font-size:14px}.ph{display:none}`
    + `.bl{animation:bl 1.2s ease-in-out infinite}@keyframes bl{50%{opacity:.55}}`
    + `.rg{animation:rg 1.2s ease-out infinite;transform-box:fill-box;transform-origin:center}@keyframes rg{0%{transform:scale(1);opacity:.9}100%{transform:scale(2.2);opacity:0}}`
    + `.tg{animation:tg 1.2s ease-in-out infinite alternate}@keyframes tg{to{transform:translateY(-2px)}}`
    + `.gl{animation:gl 2.4s ease-out infinite}@keyframes gl{0%{opacity:.9}70%,100%{opacity:0}}`
    // on a phone the picture is about 350px wide: fewer, bigger labels, a bigger tag
    + `@media (max-width:600px){.lb{font-size:27px}.mn{display:none}.cp{font-size:27px}.dk{display:none}.ph{display:inline}}`
    + `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<style>${css}</style>`
    + `<defs><clipPath id="wc"><rect width="${w}" height="${h}" rx="16"/></clipPath>`
    + `<linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky0}"/><stop offset="1" stop-color="${S.sky1}"/></linearGradient>`
    + `<pattern id="tl" x="${gx}" y="${gy}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="${c}" height="${c}" rx="2" fill="${bare}"/></pattern></defs>`
    + `<g clip-path="url(#wc)">${out.join('')}</g>`
    + `</svg>\n`;
}

// one round swatch per color. the ring is mid grey, so the same file works on light and dark
export function chipSvg(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">`
    + `<circle cx="20" cy="21" r="16" fill="#000000" opacity=".12"/>`
    + `<circle cx="20" cy="20" r="16" fill="${p.c}" stroke="#8b949e" stroke-opacity=".55" stroke-width="2"/>`
    + `<ellipse cx="15" cy="13.5" rx="5.5" ry="3" fill="#ffffff" opacity=".28"/></svg>\n`;
}

// ---------- the README bits ----------
const enc = encodeURIComponent;
export function paintUrl(repo, { x, y }, name) {
  const body = `press submit to paint column ${x}, row ${y}. to paint somewhere else, change the two numbers in the title: `
    + `column 1-${COLS} (left to right), then row 1-${ROWS} (top to bottom). one pixel a day. it shows up in about a minute.`;
  return `https://github.com/${repo}/issues/new?title=${enc(`paint ${x} ${y} ${name}`)}&body=${enc(body)}`;
}
export const wallLink = (wall, repo) => paintUrl(repo, suggestSpot(wall), 'orange');
export function paintLinks(wall, repo, assetBase) {
  const s = suggestSpot(wall);
  return PALETTE.map((p) => `<a href="${paintUrl(repo, s, p.name)}"><img width="34" alt="paint ${p.name}" src="${assetBase}paint-${p.name}.svg"></a>`).join(' ');
}
// names only for accounts that could also be a face on the track (see eligible in reconcile.mjs)
export function paintersLine(wall) {
  const last = (wall.last || []).slice(0, 3);
  if (!last.length) return '';
  const names = last.map((e) => (e.login ? `[@${e.login}](https://github.com/${e.login})` : 'someone'));
  const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
  return `last painted by ${list}.`;
}
