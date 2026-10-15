// the wall (pure parts) and the living sky
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parsePaint, emptyWall, applyPaint, isLocked, pruneWall, seedPixels, suggestSpot, wallSvg, chipSvg, paintersLine, paintLinks,
  scrubPainter, PALETTE, COLS, ROWS, WALL, LOCK_MS, tileAt,
} from '../wall.mjs';
import { sceneAt, SKIES, fallers, AHEAD, skyFor, SNOW, SHORT } from '../scene.mjs';
import { ROOT, heroSvg, phoneSvg, themeFor, THEMES } from '../render.mjs';
import { gameKind, pickRepos, labelFor } from '../reconcile.mjs';

const cfg = JSON.parse(readFileSync(join(ROOT, 'data/repos.json'), 'utf8'));
const repos = pickRepos(JSON.parse(readFileSync(join(ROOT, 'scripts/test/fixtures/repos.json'), 'utf8')), cfg);
const state = { tries: 3, repos, lastDaily: '2026-10-15', streak: { repo: cfg.flag, current: 110, start: '2026-06-28', best: 110 }, hurdles: [] };
const H = 3600e3;

test('paint titles: column, row and a color, forgiving about spacing and order, strict about everything else', () => {
  assert.deepEqual(parsePaint('paint 12 7 orange'), { x: 12, y: 7, k: 'o', name: 'orange' });
  assert.deepEqual(parsePaint('  PAINT  12, 7   Teal '), { x: 12, y: 7, k: 't', name: 'teal' });
  assert.deepEqual(parsePaint('paint orange 1 12'), { x: 1, y: 12, k: 'o', name: 'orange' });
  assert.deepEqual(parsePaint('paint (48, 1) black'), { x: 48, y: 1, k: 'k', name: 'black' });
  for (const t of ['paint', 'paint 12 7', 'paint 0 7 blue', 'paint 49 7 blue', 'paint 12 13 blue', 'paint 12 7 purple', 'paint 12 7 blue please',
    'paint 12 7 blue red', 'paint 1.5 7 blue', 'paint -1 7 blue', 'paint 12 7 $(rm -rf)']) assert.deepEqual(parsePaint(t), { bad: true }, t);
  for (const t of ['painting is broken', 'paint: bug', 'stop', '', null, undefined]) assert.equal(parsePaint(t), null, String(t));
  assert.equal(gameKind('paint 3 3 blue'), 'paint');
  assert.equal(gameKind('paint 99 99 nothing'), 'paint');   // a paint try that gets a "couldn't read that"
  assert.equal(gameKind('painting is broken on mobile'), null);
  assert.equal(gameKind('stop'), 'stop');
});

test('paint lands, locks its tile for an hour, and the bookkeeping forgets on time', () => {
  const w = emptyWall(), t0 = Date.parse('2026-10-15T18:00:00Z');
  applyPaint(w, { x: 12, y: 7, k: 'o', id: 1, login: 'a', at: '2026-10-15T18:00:00Z' });
  assert.equal(tileAt(w, 12, 7), 'o');
  assert.equal(w.rows[6].length, COLS);
  assert.equal(w.rows.length, ROWS);
  assert.ok(isLocked(w, 12, 7, t0 + LOCK_MS - 1));
  assert.ok(!isLocked(w, 12, 7, t0 + LOCK_MS));
  assert.ok(!isLocked(w, 13, 7, t0));
  for (let i = 0; i < 4; i++) applyPaint(w, { x: i + 1, y: 1, k: 'b', id: 10 + i, login: null, at: '2026-10-15T18:10:00Z' });
  assert.equal(w.count, 5);
  assert.equal(w.last.length, 3);
  w.seen = { a: '2026-10-14', b: '2026-10-13' };
  pruneWall(w, t0 + 2 * H);
  assert.deepEqual(w.fresh, {});
  assert.deepEqual(w.recent, []);
  assert.deepEqual(Object.keys(w.seen), ['a']);
  w.last[1].login = 'x';
  assert.equal(scrubPainter(w, w.last[1].id), 1);
  assert.equal(w.last[1].login, null);
});

test('the wall is never empty: a faint runner with speed lines, under any paint', () => {
  const seed = seedPixels();
  assert.ok(seed.size >= 40, `seed has ${seed.size} pixels`);
  for (const s of seed) { const [x, y] = s.split(',').map(Number); assert.ok(x >= 1 && x <= COLS && y >= 1 && y <= ROWS, s); }
  const seedPath = (svg) => svg.match(/<path class="sd" d="([^"]*)"/)[1].split('M').length - 1;
  const svg = wallSvg(emptyWall(), 'light');
  assert.equal(seedPath(svg), seed.size);
  assert.match(svg, /the wall\. nobody yet\./);
  // paint covers the seed where it lands
  const w = emptyWall();
  const [sx, sy] = [...seed][0].split(',').map(Number);
  applyPaint(w, { x: sx, y: sy, k: 'p', at: '2026-10-15T18:00:00Z' });
  assert.equal(seedPath(wallSvg(w, 'light')), seed.size - 1);
});

test('the blinking spot is always a bare tile near the middle, and moves after each paint', () => {
  const w = emptyWall(), seed = seedPixels(), seen = new Set();
  for (let i = 0; i < 40; i++) {
    const s = suggestSpot(w);
    assert.equal(tileAt(w, s.x, s.y), '.');
    assert.ok(!seed.has(`${s.x},${s.y}`));
    assert.deepEqual(suggestSpot(w), s, 'same wall, same spot');
    seen.add(`${s.x},${s.y}`);
    applyPaint(w, { x: s.x, y: s.y, k: 'o', at: '2026-10-15T18:00:00Z' });
  }
  assert.equal(seen.size, 40);
  // every color link opens a paint issue for that spot, in that color
  const links = paintLinks(emptyWall(), 'aaghashm/aaghashm', 'https://x/');
  const s0 = suggestSpot(emptyWall());
  for (const p of PALETTE) assert.ok(links.includes(`title=paint%20${s0.x}%20${s0.y}%20${p.name}&`), p.name);
  assert.equal((links.match(/<img width="34"/g) || []).length, PALETTE.length);
});

test('wall picture: both themes, small, no logins, no script, readable on a phone', () => {
  const w = emptyWall();
  for (let y = 1; y <= ROWS; y++) for (let x = 1; x <= COLS; x++) applyPaint(w, { x, y, k: PALETTE[(x + y) % PALETTE.length].k, id: 1, login: 'octocat', at: '2026-10-15T18:00:00Z' });
  for (const th of ['light', 'dark']) {
    const s = wallSvg(w, th);
    assert.ok(Buffer.byteLength(s) < 60 * 1024, `${th} full wall is ${Buffer.byteLength(s)} bytes`);
    assert.match(s, new RegExp(`width="${WALL.w}" height="${WALL.h}"`));
    assert.doesNotMatch(s, /octocat|<script|foreignObject/i);
    assert.deepEqual([...new Set(s.match(/https?:\/\/[^\s"')]+/g))], ['http://www.w3.org/2000/svg']);
    // 12px labels on a wide screen; on a phone the picture is ~350px, so 27px is about 11px there
    assert.match(s, /\.lb\{font-size:12px\}/);
    assert.match(s, /@media \(max-width:600px\)\{\.lb\{font-size:27px\}\.mn\{display:none\}/);
    assert.ok(27 * 350 / WALL.w >= 11);
    assert.match(s, /prefers-reduced-motion/);
  }
  assert.notEqual(wallSvg(w, 'light'), wallSvg(w, 'dark'));
  for (const p of PALETTE) assert.match(chipSvg(p), new RegExp(`fill="${p.c}"`));
  assert.equal(new Set(PALETTE.map((p) => p.k)).size, PALETTE.length);
  assert.ok(PALETTE.length >= 6 && PALETTE.length <= 8);
});

test('painters line: up to 3, names only when kept, "someone" otherwise', () => {
  // nobody yet: the picture already says so, the line under it stays quiet
  assert.equal(paintersLine(emptyWall()), '');
  const w = emptyWall();
  w.last = [{ login: 'b' }, { login: null }, { login: 'a-b' }];
  assert.equal(paintersLine(w), 'last painted by [@b](https://github.com/b), someone and [@a-b](https://github.com/a-b).');
  w.last = [{ login: null }];
  assert.equal(paintersLine(w), 'last painted by someone.');
});

test('sky timing: kolkata clock, 90 minutes ahead (the middle of a 3 hour render)', () => {
  assert.equal(AHEAD, 90 * 60e3);
  // utc -> kolkata is +5:30, plus 1:30 ahead = +7:00
  const at = (utc) => sceneAt(Date.parse(utc)).phase;
  assert.equal(at('2026-10-15T21:59:00Z'), 'night');   // 04:59
  assert.equal(at('2026-10-15T22:00:00Z'), 'dawn');    // 05:00
  assert.equal(at('2026-10-16T00:59:00Z'), 'dawn');    // 07:59
  assert.equal(at('2026-10-16T01:00:00Z'), 'day');     // 08:00
  assert.equal(at('2026-10-16T09:59:00Z'), 'day');     // 16:59
  assert.equal(at('2026-10-16T10:00:00Z'), 'dusk');    // 17:00
  assert.equal(at('2026-10-16T12:59:00Z'), 'dusk');    // 19:59
  assert.equal(at('2026-10-16T13:00:00Z'), 'night');   // 20:00
  assert.equal(at('2026-10-16T17:00:00Z'), 'night');   // 00:00
  // every 3 hourly run at :23 utc: each phase shows up at least once a day
  const phases = new Set();
  for (let h = 0; h < 24; h += 3) phases.add(at(`2026-10-16T${String(h).padStart(2, '0')}:23:00Z`));
  assert.deepEqual([...phases].sort(), ['dawn', 'day', 'dusk', 'night']);
  // seasons by the kolkata month
  const season = (utc) => sceneAt(Date.parse(utc)).season;
  assert.equal(season('2026-10-16T06:00:00Z'), 'leaves');
  assert.equal(season('2026-11-30T06:00:00Z'), 'leaves');
  assert.equal(season('2026-11-30T17:00:00Z'), 'snow');  // already 1 dec there
  assert.equal(season('2027-01-15T06:00:00Z'), 'snow');
  assert.equal(season('2027-02-28T06:00:00Z'), 'snow');
  assert.equal(season('2027-03-15T06:00:00Z'), null);
  assert.equal(season('2027-05-15T06:00:00Z'), 'summer');
  assert.equal(season('2027-08-15T06:00:00Z'), null);
  // the workflow renders every 3 hours, off the hour
  const yml = readFileSync(join(ROOT, '.github/workflows/daily.yml'), 'utf8');
  assert.match(yml, /cron: "23 \*\/3 \* \* \*"/);
});

test('the sky in the picture: light is the day-ish side of the hour, dark the night-ish, both follow the clock', () => {
  const t = { dawn: '2026-10-15T23:00:00Z', day: '2026-10-16T06:00:00Z', dusk: '2026-10-16T11:00:00Z', night: '2026-10-15T20:00:00Z' };
  const files = new Set();
  for (const [phase, utc] of Object.entries(t)) for (const th of ['light', 'dark']) {
    const now = Date.parse(utc), s = heroSvg(state, cfg, th, now), p = phoneSvg(state, cfg, th, now);
    assert.match(s, new RegExp(`stop-color="${SKIES[th][phase].sky0}"`), `${th} ${phase}`);
    assert.match(p, new RegExp(`stop-color="${SKIES[th][phase].sky0}"`), `${th} ${phase} phone`);
    // a headlamp and its beam only at night
    assert.equal(/url\(#beam\)/.test(s), phase === 'night', `${th} ${phase} lamp`);
    // the low sun's glow at dawn and dusk
    assert.equal(/url\(#glow\)/.test(s), phase === 'dawn' || phase === 'dusk', `${th} ${phase} glow`);
    files.add(s);
  }
  assert.equal(files.size, 8, 'every theme and hour is its own picture');
  // light skies stay light: the title keeps its contrast on every one of them
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const th of ['light', 'dark']) for (const ph of Object.keys(SKIES[th])) {
    assert.ok(contrast(THEMES[th].accentInk, SKIES[th][ph].sky0) >= 3, `${th} ${ph} title`);
    assert.ok(contrast(THEMES[th].muted, SKIES[th][ph].sky0) >= 3, `${th} ${ph} counter`);
  }
  assert.equal(themeFor('dark', { phase: 'night', season: null }).lamp, true);
  assert.equal(themeFor('light', { phase: 'day', season: null }).lamp, false);
});

test('leaves in autumn, snow in winter, still frames show them on the ground', () => {
  const oct = heroSvg(state, cfg, 'light', Date.parse('2026-10-16T06:00:00Z'));
  const jan = heroSvg(state, cfg, 'dark', Date.parse('2027-01-15T06:00:00Z'));
  const aug = heroSvg(state, cfg, 'dark', Date.parse('2027-08-15T06:00:00Z'));
  assert.match(oct, /@keyframes spn/);
  assert.match(oct, /class="sp r\d"/);
  assert.match(jan, /<circle r="[\d.]+" fill="#fff"/);
  assert.doesNotMatch(aug, /@keyframes fa|class="sp /);
  // each faller's resting place is on the ground strip, so a still frame has them landed
  const f = fallers('leaves', { w: 840, gy: 224, n: 10, snow: 0 });
  const spots = [...f.matchAll(/translate\(([\d.]+) ([\d.]+)\)"><g class="f[ab]/g)];
  assert.equal(spots.length, 10);
  for (const m of spots) { assert.ok(+m[2] >= 224 && +m[2] <= 252, m[2]); assert.ok(+m[1] >= 0 && +m[1] <= 840); }
  assert.equal(fallers(null, { w: 840, gy: 224, n: 10, snow: 10 }), '');
  // summer: a warm glow around the day sun
  assert.match(heroSvg(state, cfg, 'light', Date.parse('2027-05-15T06:00:00Z')), /url\(#glow\)/);
});

test('README: riddles are nested and instant, the egg still knocks, and nothing mentions how it was made', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.equal((md.match(/<details>/g) || []).length, 5);
  assert.equal((md.match(/<\/details>/g) || []).length, 5);
  assert.match(md, /title=knock&body=/);
  assert.match(md, /you just don't stop\.\n/);
  assert.match(md, /title=paint%20\d+%20\d+%20orange&body=/);
  assert.doesNotMatch(md, /—|–/);
});

test('only a paint that lands gets the painted label', () => {
  assert.equal(labelFor('paint'), 'painted');
  for (const t of ['paintBad', 'paintRepeat', 'paintLocked', 'paintBusy', 'stop', 'knock', 'repeat', 'busy']) assert.equal(labelFor(t), 'played', t);
});

test('the free spot is loud: a solid ringed tile with a "you" tag, sized for a wide screen and a phone', () => {
  for (const th of ['light', 'dark']) {
    const svg = wallSvg(emptyWall(), th), s = suggestSpot(emptyWall());
    const tile = svg.match(/<rect class="bl" x="([\d.]+)" y="([\d.]+)" width="(\d+)" height="\d+" rx="[\d.]+" fill="(#[0-9a-f]{6})" stroke="(#[0-9a-f]{6})"/);
    assert.ok(tile, th);
    assert.equal(+tile[1], WALL.gx + (s.x - 1) * WALL.cell);
    assert.equal(+tile[3], WALL.cell, 'the whole tile, not a dashed box');
    assert.equal(tile[4], '#f5a623');
    assert.match(svg, /class="rg"/);
    assert.match(svg, /<rect class="bl ph" x="[\d.]+" y="[\d.]+" width="27"/, 'bigger tile on a phone');
    // two tags: one for a wide screen, a bigger one for a phone (shown by the media query)
    assert.equal((svg.match(/>you<\/text>/g) || []).length, 2);
    assert.match(svg, /class="tg dk"/);
    assert.match(svg, /class="tg ph"/);
    assert.match(svg, /\.dk\{display:none\}\.ph\{display:inline\}/);
    // the blink never fades it out of sight
    assert.match(svg, /@keyframes bl\{50%\{opacity:\.55\}\}/);
  }
  // on the top rows the tag hangs below the tile so it stays in the picture
  const w = emptyWall();
  for (let x = 1; x <= COLS; x++) for (let y = 4; y <= ROWS; y++) w.rows[y - 1] = w.rows[y - 1].slice(0, x - 1) + 'b' + w.rows[y - 1].slice(x);
  const s = suggestSpot(w);
  assert.ok(s.y <= 3);
  const svg = wallSvg(w, 'light');
  const tagY = +svg.match(/class="tg dk"><rect x="[\d.]+" y="([\d.]+)"/)[1];
  assert.ok(tagY > WALL.gy + (s.y - 1) * WALL.cell, 'tag below the tile');
});

test('the wall lives under the same sky as the hero, and is shorter than it', () => {
  const at = (utc) => sceneAt(Date.parse(utc));
  const dawn = at('2026-10-15T23:00:00Z'), night = at('2026-10-15T20:00:00Z'), jan = at('2027-01-15T06:00:00Z');
  for (const th of ['light', 'dark']) {
    const a = wallSvg(emptyWall(), th, '', dawn), b = wallSvg(emptyWall(), th, '', night);
    assert.match(a, new RegExp(`stop-color="${skyFor(th, dawn).sky0}"`));
    assert.match(b, new RegExp(`stop-color="${skyFor(th, night).sky0}"`));
    assert.notEqual(a, b);
    // winter: snow on top of the wall and along its ground. not in october.
    const lie = new RegExp(`fill="${SNOW[th].lie}"`);
    assert.match(wallSvg(emptyWall(), th, '', jan), lie);
    assert.doesNotMatch(a, lie);
  }
  assert.ok(WALL.h < 280, `wall is ${WALL.h}px tall, the hero 280`);
  assert.equal(ROWS, 12);
});

test('snow reads on a light sky and settles, leaves and snow stay off the words, summer runs warm', () => {
  const jan = Date.parse('2027-01-15T06:00:00Z'), aug = Date.parse('2027-08-15T06:00:00Z');
  const light = heroSvg(state, cfg, 'light', jan), dark = heroSvg(state, cfg, 'dark', jan);
  // light: blue grey flakes with a darker rim, never plain white on the pale sky
  assert.match(light, new RegExp(`<circle r="[\\d.]+" fill="${SNOW.light.fall}" stroke="${SNOW.light.rim}"`));
  assert.doesNotMatch(light, /<circle r="[\d.]+" fill="#fff"/);
  // settled snow on the blocks, the hurdles, the peaks and the ground's edge
  for (const svg of [light, dark, phoneSvg(state, cfg, 'light', jan)]) assert.ok((svg.match(new RegExp(`fill="${SNOW[svg === dark ? 'dark' : 'light'].lie}"`, 'g')) || []).length >= 10);
  assert.doesNotMatch(heroSvg(state, cfg, 'light', aug), new RegExp(`fill="${SNOW.light.lie}"`));
  // anything landing under the title takes the short drop, which starts below the counter line
  const f = fallers('leaves', { w: 840, gy: 224, n: 10, snow: 0, clear: 360 });
  for (const m of f.matchAll(/translate\(([\d.]+) ([\d.]+)\)"><g class="(f[a-d])/g)) {
    assert.equal(+m[1] < 360, m[3] === 'fc' || m[3] === 'fd', m[0]);
    if (+m[1] < 360) assert.ok(+m[2] - SHORT > 110, `starts at ${+m[2] - SHORT}, the counter is at 96`);
  }
  assert.match(heroSvg(state, cfg, 'light', Date.parse('2026-10-16T06:00:00Z')), /@keyframes fc\{0%\{transform:translate\(-14px,-110px\)/);
  // phone: everything takes the short drop (the title and bubble span the top)
  assert.doesNotMatch(phoneSvg(state, cfg, 'light', Date.parse('2026-10-16T06:00:00Z')), /class="f[ab] /);
  // summer day: a warmer low sky than any other day, plus a heat shimmer. no shimmer the rest of the year.
  const warmth = (hex) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
  const may = sceneAt(Date.parse('2027-05-15T06:00:00Z')), oct = sceneAt(Date.parse('2026-10-16T06:00:00Z'));
  for (const th of ['light', 'dark']) assert.ok(warmth(skyFor(th, may).sky1) > warmth(skyFor(th, oct).sky1) + 30, th);
  assert.match(heroSvg(state, cfg, 'light', Date.parse('2027-05-15T06:00:00Z')), /class="hz"/);
  assert.doesNotMatch(heroSvg(state, cfg, 'light', Date.parse('2026-10-16T06:00:00Z')), /class="hz"/);
});

test('README: fresh riddles, one short line under the wall', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.doesNotMatch(md, /footsteps|what gets you to the end/);
  assert.match(md, /\*\*your shadow\.\*\*/);
  assert.match(md, /\*\*the next step\.\*\*/);
  const sub = md.match(/<sub>(tap a color[^<]*)<\/sub>/)[1];
  assert.ok(sub.startsWith('tap a color, press submit, and your square shows up on the wall in about a minute. one a day.'), sub);
  assert.match(md, /\*\*paint the wall together\.\*\*/);
  assert.doesNotMatch(md, /<a href="[^"]*title=paint[^"]*"><picture><source[^>]*wall-/);
  assert.doesNotMatch(sub, /change the two numbers/);
});
