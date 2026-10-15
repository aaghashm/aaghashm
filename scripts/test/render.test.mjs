// node --test scripts/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, layoutTimeline, crossTime, START_X, heroSvg, buttonSvg, jumpAt, hurdlePoints, counterLine, sinceStart, iconInk,
  RX, GY, HURDLE_CY, HURDLE_R, LOOP, F, NARROW, WIDE, THEMES, streakLine, W, H, sansW, bubbleBox, SHOW, MARK, textW,
  PHONE, phoneSvg, phoneLayout, opacityAt, BEHIND, buttonW, BUTTON, STACK,
} from '../render.mjs';
import { streakFrom, pickRepos, prune, gameKind, eligible, sniff, stopLine, knockLine, LOGIN_RE, dateIn, parseRemove, replyText } from '../reconcile.mjs';

const fx = (n) => JSON.parse(readFileSync(join(ROOT, 'scripts/test/fixtures', n), 'utf8'));
const cfg = JSON.parse(readFileSync(join(ROOT, 'data/repos.json'), 'utf8'));
const lines = JSON.parse(readFileSync(join(ROOT, 'data/lines.json'), 'utf8'));
const repos = pickRepos(fx('repos.json'), cfg);

test('streak is 110 on 2026-10-15 in America/Los_Angeles', () => {
  const dates = fx('commits.json').map((c) => c.commit.author.date);
  const s = streakFrom(dates, '2026-10-15', 'America/Los_Angeles');
  assert.equal(s.current, 110);
  assert.equal(s.start, '2026-06-28');
  // before today's first commit lands, the streak still counts from yesterday
  const early = dates.filter((d) => d < '2026-10-15T07:00:00Z');
  assert.equal(streakFrom(early, '2026-10-15', 'America/Los_Angeles').current, 109);
  // a missed day breaks it
  assert.equal(streakFrom(['2026-10-13T20:00:00Z'], '2026-10-15', 'America/Los_Angeles').current, 0);
});

test('repo list is the 10 public repos, in date order', () => {
  assert.deepEqual(repos.map((r) => r.name), [
    'PYTHON-TEXT-TO-SPEECH', 'MACHINE-LEARNING-PROJECTS', 'PYTHON-BASICS-NOTES', 'SIMPLE-PYTHON-PROJECTS', 'Tableau',
    'CGPA-BUDDY', 'vehicle_repair_app', 'mlops-zoomcamp', 'App-Releases', 'persistent-stopwatch',
  ]);
});

test('towers and locks: 3,1,0,0,3 locks, 13 slots ending at x=436', () => {
  const L = layoutTimeline(repos, cfg);
  assert.deepEqual(L.towers.map((t) => t.repos.length), [4, 2, 1, 1, 1, 1]);
  assert.deepEqual(L.gaps.map((g) => g.days), [477, 185, 103, 64, 524]);
  assert.deepEqual(L.gaps.map((g) => g.locks), [3, 1, 0, 0, 3]);
  assert.equal(L.slots.length, 13);
  assert.equal(L.slots.at(-1).x, 436);
  assert.equal(L.flagSlot.x, 436);
});

test('crossing times match 2.02/3.34/4.66/5.98/7.30', () => {
  assert.deepEqual(START_X.map((x) => crossTime(x).toFixed(2)), ['2.02', '3.34', '4.66', '5.98', '7.30']);
});

test('every hurdle travels exactly one lane per loop (seamless)', () => {
  for (const x0 of START_X) {
    const p = hurdlePoints(x0);
    assert.equal(p[0][1], x0);
    assert.equal(p.at(-1)[1], x0);
    assert.equal(p.at(-1)[0], LOOP);
    assert.equal(p[1][0], F);
  }
});

test('the runner clears every hurdle (feet never inside one)', () => {
  // feet span RX±7 at the bottom of the jump group; hurdles are a circle r12 at HURDLE_CY
  for (let t = F; t < LOOP; t += 0.005) {
    const feet = GY - jumpAt(t);
    for (const x0 of START_X) {
      const p = hurdlePoints(x0);
      let x = x0;
      for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const [t0, a] = p[i - 1], [t1, b] = p[i]; x = t1 - t0 < 1e-3 ? b : a + (b - a) * (t - t0) / (t1 - t0); break; }
      for (let fxp = RX - 7; fxp <= RX + 7; fxp++) {
        const dx = Math.abs(fxp - x);
        if (dx >= HURDLE_R) continue;
        const top = HURDLE_CY - Math.sqrt(HURDLE_R ** 2 - dx ** 2);
        assert.ok(feet <= top + 0.5, `t=${t.toFixed(3)} hurdle ${x0} at ${x.toFixed(1)}: feet ${feet.toFixed(1)} > top ${top.toFixed(1)}`);
      }
    }
  }
});

const state = {
  tries: 37, repos, lastDaily: '2026-10-15', lastKnock: null,
  streak: { repo: 'persistent-stopwatch', current: 110, start: '2026-06-28', best: 110 },
  hurdles: [{ id: 1, n: 37, avatar: 'data:image/png;base64,' + 'A'.repeat(1800), at: '2026-10-15' }, { id: 2, n: 36, avatar: null, at: '2026-10-15' }],
};

test('hero files: small, no script, no foreignObject, no outside urls', () => {
  // worst case: 5 faces at the 6KB avatar cap, plus the embedded font subsets (about 18KB of it)
  const full = { ...state, hurdles: Array.from({ length: 5 }, (_, i) => ({ id: i, n: 37 - i, avatar: 'data:image/png;base64,' + 'A'.repeat(8192) })) };
  for (const th of ['dark', 'light']) assert.ok(Buffer.byteLength(heroSvg(full, cfg, th)) < 100 * 1024, `${th} with 5 faces is too big`);
  for (const th of ['dark', 'light']) {
    const s = heroSvg(state, cfg, th, Date.parse('2026-10-15T20:00:00Z'));
    assert.ok(Buffer.byteLength(s) < 56 * 1024, `${th} is ${Buffer.byteLength(s)} bytes`);
    assert.match(s, /@font-face\{font-family:sr-sans/);
    // every mono line (counter, labels, flag) is the site's jetbrains mono, not whatever the os has
    assert.match(s, /@font-face\{font-family:sr-mono;font-weight:500/);
    assert.match(s, /@font-face\{font-family:sr-mono;font-weight:700/);
    assert.match(s, /text\{font-family:sr-mono,/);
    assert.match(s, /width="840" height="280" viewBox="0 0 840 280"/);
    assert.doesNotMatch(s, /<script/i);
    assert.doesNotMatch(s, /foreignObject/i);
    const urls = s.match(/https?:\/\/[^\s"')]+/g) || [];
    assert.deepEqual([...new Set(urls)], ['http://www.w3.org/2000/svg']);
    assert.match(s, /day 110/);
    assert.match(s, /tried 37 times\. stopped 0\./);
    // the static frame is the whole joke: standing visible, running hidden, both lines present
    assert.match(s, /<g class="sw">/);
    assert.match(s, /<g class="rn" opacity="0">/);
    assert.match(s, /fine\. stopped\./);
    assert.match(s, />jk\.</);
    assert.match(s, /prefers-reduced-motion/);
    assert.match(s, /<g id="narrow" display="none"/);
    // each avatar defined once, used by both scenes
    assert.equal((s.match(/<image /g) || []).length, 1);
    assert.equal((s.match(/href="#av0"/g) || []).length, 2);
    // login text never drawn
    assert.doesNotMatch(s, /octocat|aaghashm/);
  }
  for (const k of ['play', 'stop']) for (const th of ['dark', 'light']) assert.doesNotMatch(buttonSvg(k, th), /<script|https:/);
  // the phone file: one picture, both themes, picked by the phone's own setting
  const fullPhone = phoneSvg({ ...state, hurdles: Array.from({ length: 5 }, (_, i) => ({ id: i, n: 37 - i, avatar: 'data:image/png;base64,' + 'A'.repeat(8192) })) }, cfg);
  assert.ok(Buffer.byteLength(fullPhone) < 100 * 1024, 'phone with 5 faces is too big');
  const p = phoneSvg(state, cfg, Date.parse('2026-10-15T20:00:00Z'));
  assert.ok(Buffer.byteLength(p) < 56 * 1024, `phone is ${Buffer.byteLength(p)} bytes`);
  assert.match(p, /width="600" height="300" viewBox="0 0 600 300"/);
  assert.match(p, /@media \(prefers-color-scheme:dark\)\{#pl\{display:none\}#pd\{display:inline\}\}/);
  assert.match(p, /<g id="pd" display="none">/);
  assert.match(p, /stop-color="#bfdcff"/);
  assert.match(p, /stop-color="#0d1b2e"/);
  assert.doesNotMatch(p, /<script|foreignObject|octocat|aaghashm/i);
  assert.deepEqual([...new Set(p.match(/https?:\/\/[^\s"')]+/g))], ['http://www.w3.org/2000/svg']);
  assert.equal((p.match(/<image /g) || []).length, 1);
  assert.equal((p.match(/href="#av0"/g) || []).length, 2); // light + dark
});

test('wobble only within 24h of a knock', () => {
  const now = Date.parse('2026-10-15T20:00:00Z');
  assert.doesNotMatch(heroSvg({ ...state, lastKnock: '2026-10-14T19:00:00Z' }, cfg, 'dark', now), /class="wob"[\s\S]*@keyframes wob|@keyframes wob/);
  assert.match(heroSvg({ ...state, lastKnock: '2026-10-15T19:00:00Z' }, cfg, 'dark', now), /@keyframes wob/);
});

test('counter line, clock, icon contrast', () => {
  // the counter moves from the first try
  assert.equal(counterLine(0), "nobody's tried to stop him yet.");
  assert.equal(counterLine(1), 'tried 1 time. stopped 0.');
  assert.equal(counterLine(2), 'tried 2 times. stopped 0.');
  assert.equal(counterLine(20), 'tried 20 times. stopped 0.');
  assert.deepEqual(sinceStart('2022-09-19', '2026-10-15'), { y: 4, d: 26 });
  assert.deepEqual(sinceStart('2022-09-19', '2026-09-18'), { y: 3, d: 364 });
  assert.equal(iconInk('#eab308'), '#0d1117');
  assert.equal(iconInk('#64748b'), '#ffffff');
});

test('titles, logins, eligibility, magic bytes', () => {
  assert.equal(gameKind('  Stop '), 'stop');
  assert.equal(gameKind('STOP HIM'), 'stop');
  assert.equal(gameKind('knock'), 'knock');
  assert.equal(gameKind('stop!'), null);
  assert.equal(gameKind('bug: stop button broken'), null);
  assert.equal(gameKind(undefined), null);
  assert.ok(LOGIN_RE.test('a-b'));
  assert.ok(!LOGIN_RE.test('a--b'));
  assert.ok(!LOGIN_RE.test('-ab'));
  assert.ok(!LOGIN_RE.test('x'.repeat(40)));
  assert.ok(!LOGIN_RE.test('a;rm -rf'));
  const now = Date.parse('2026-10-15T00:00:00Z');
  const u = { id: 5, login: 'ok', type: 'User', created_at: '2020-01-01T00:00:00Z', public_repos: 1, followers: 0 };
  const block = { ids: [], logins: [] };
  assert.ok(eligible(u, block, now));
  assert.ok(!eligible({ ...u, created_at: '2026-10-01T00:00:00Z' }, block, now));
  assert.ok(!eligible({ ...u, public_repos: 0 }, block, now));
  assert.ok(eligible({ ...u, public_repos: 0, followers: 3 }, block, now));
  assert.ok(!eligible({ ...u, type: 'Bot' }, block, now));
  assert.ok(!eligible(u, { ids: [5], logins: [] }, now));
  assert.ok(!eligible(u, { ids: [], logins: ['OK'] }, now));
  assert.ok(!eligible(null, block, now));
  assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])), 'image/png');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniff(Buffer.from('<svg onload=alert(1)>')), null);
});

test('reply copy: order, milestones, knocks, no em dashes, no mentions', () => {
  assert.equal(stopLine(lines, 1), "he heard you. he doesn't care.");
  assert.equal(stopLine(lines, 6), "he heard you. he doesn't care.");
  assert.equal(stopLine(lines, 5), "try again tomorrow. he'll still be running.");
  // every stop reply, not just the first, opens with the hero's joke
  for (const n of [1, 2, 3, 6, 100]) assert.match(replyText({ type: 'stop', n }, lines), /^\*\*fine\. stopped\.\*\*\n\n\*\*jk\.\*\*\n\n[^*]/);
  assert.match(replyText({ type: 'stop', n: 2 }, lines), /\*\*jk\.\*\*\n\nnope\. the private repos need him\.\n\nyou're hurdle #2 /);
  assert.match(replyText({ type: 'stop', n: 4, plain: true }, lines), /no face this time\./);
  assert.doesNotMatch(replyText({ type: 'stop', n: 4 }, lines), /no face/);
  assert.equal(stopLine(lines, 100), "100 tries. 0 stops. that's a streak too.");
  assert.match(knockLine(lines, 1), /^\*knock\*\n\n\.\.\.nothing\.\n\nknocks so far: 1\.$/);
  assert.match(knockLine(lines, 10), /^something moved/);
  assert.match(knockLine(lines, 50), /^the lock cracked/);
  const all = JSON.stringify(lines);
  assert.doesNotMatch(all, /—|–/);
  assert.doesNotMatch(all, /@\w/);
});

test('prune keeps 5 hurdles, 2 days of seen, 60 min of recent, 300 handled', () => {
  const now = Date.parse('2026-10-15T20:00:00Z');
  const s = prune({
    hurdles: Array.from({ length: 8 }, (_, i) => ({ n: i })),
    seen: { a: '2026-10-15', b: '2026-10-14', c: '2026-10-13' },
    recent: ['2026-10-15T19:30:00Z', '2026-10-15T18:30:00Z'],
    handled: Array.from({ length: 320 }, (_, i) => i + 1),
    outcomes: { 1: 's1', 320: 's9' },
  }, now, dateIn('America/Los_Angeles', new Date(now)));
  assert.equal(s.hurdles.length, 5);
  assert.deepEqual(Object.keys(s.seen), ['a', 'b']);
  assert.deepEqual(s.recent, ['2026-10-15T19:30:00Z']);
  assert.equal(s.handled.length, 300);
  assert.deepEqual(Object.keys(s.outcomes), ['320']);
});

test('readable: no text under 12px wide, the narrow layout keeps every block, switches at 680px', () => {
  const s = heroSvg(state, cfg, 'dark', Date.parse('2026-10-15T20:00:00Z'));
  const wide = s.slice(s.indexOf('<g id="wide">'), s.indexOf('<g id="narrow"'));
  // text inside the scaled action group is drawn at WIDE.s times its size
  const act = wide.indexOf(`scale(${WIDE.s})">`), actEnd = wide.indexOf('>today<');
  const sizes = [...wide.matchAll(/font-size="([\d.]+)"/g)].map((m) => (m.index > act && m.index < actEnd ? WIDE.s : 1) * +m[1]);
  assert.ok(Math.min(...sizes) >= 12, `smallest wide label ${Math.min(...sizes)}`);
  // the runner and hurdles are 1.5x what they were, the title is big
  assert.equal(WIDE.s, 1.5);
  assert.match(wide, /class="sg" x="28" y="66" font-size="50"[^>]*>still running\./);
  // the bubble fits in the box in both layouts
  assert.ok(WIDE.rx + 18 + bubbleBox(19, 13).w <= W - 8);
  // the wide lane starts after the flag tower, so jumped hurdles never fade over it
  assert.ok(WIDE.rx - (RX - 500) * WIDE.s >= 462);
  assert.match(s, /@media \(max-width:680px\)/);
  assert.equal(NARROW.maxWidth, 680);
  const narrow = s.slice(s.indexOf('<g id="narrow"'));
  // 10 repo tiles + one lock per gap that has any (3 gaps) = 13 tiles, and the title
  assert.equal((narrow.match(/<g class="tile/g) || []).length, 13);
  assert.match(narrow, /still running\./);
  // the narrow layout is for tablets, where the image is 440px or wider: text stays at 10px or more there
  const nsizes = [...narrow.matchAll(/font-size="([\d.]+)"/g)].map((m) => +m[1]).filter((n) => n >= 20);
  assert.ok(nsizes.length >= 4 && Math.min(...nsizes) * 440 / 840 >= 9.9, `smallest narrow text ${Math.min(...nsizes)}`);
  // the counter's descenders clear the top of the tallest tower
  const nTop = NARROW.gy - (26 + 3 * STACK) * NARROW.ts;
  assert.ok(96 + NARROW.counter * 0.25 + 4 <= nTop, `narrow counter vs tower top ${nTop}`);
  // and the jk. bubble clears his head at the top of a jump
  const top = NARROW.gy - (12 + 29.5 + 34) * NARROW.s;
  assert.ok(8 + bubbleBox(...NARROW.bubble).h <= top, `bubble bottom ${8 + bubbleBox(...NARROW.bubble).h} vs head ${top}`);
});

test('streak at 0: no orange line, no "since", the flag shows the best', () => {
  const z = { ...state, streak: { ...state.streak, current: 0 } };
  const s = heroSvg(z, cfg, 'dark', Date.parse('2026-10-15T20:00:00Z'));
  const streakPath = new RegExp(`H(${WIDE.rx}|${NARROW.rx})" stroke="${THEMES.dark.accent}"`, 'g');
  assert.doesNotMatch(s, streakPath);
  assert.doesNotMatch(s, /since 28 jun/);
  assert.match(s, /110 days\. still running\./);
  assert.equal((heroSvg(state, cfg, 'dark', Date.parse('2026-10-15T20:00:00Z')).match(streakPath) || []).length, 2); // wide + phone
  // the flag says day 110, so the paragraph says something new
  assert.equal(streakLine({ current: 110, start: '2026-06-28', best: 110 }), 'a commit every day since 28 jun.');
  assert.equal(streakLine({ current: 0, best: 110 }), 'best run so far: 110 days of daily commits.');
});

test('README: one stop joke, honest gaps, links persistent-stopwatch, no bio repeat', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.doesNotMatch(md, /nobody's stopped/);
  assert.doesNotMatch(md, /still running\. most of it's private/);
  // the locks are the quiet gaps between repos, nothing more is claimed
  assert.match(md, /grey ones are the quiet stretches/);
  assert.doesNotMatch(md, /can't see/);
  // phones get the 2:1 picture first; it carries no color scheme, so github's theme switch leaves it alone
  assert.match(md, /<picture>\s*<source media="\(max-width: 600px\)" srcset="[^"]+\/assets\/phone-[0-9a-f]{8}\.svg">\s*<source media="\(prefers-color-scheme: dark\)"/);
  assert.match(md, new RegExp(`<img width="${buttonW('play')}" alt="play the real one"`));
  assert.match(md, new RegExp(`<img width="${buttonW('stop')}" alt="stop him"`));
  assert.match(md, /\[persistent-stopwatch\]\(https:\/\/aaghashm\.github\.io\/persistent-stopwatch\/\)/);
  assert.doesNotMatch(md, /—|–/);
  assert.match(md, /^<!-- built from templates\/README\.md\.tmpl\. edit that, not this\. -->/);
  assert.doesNotMatch(md, /day 110/);   // once is enough, it's on the flag
  assert.match(md, /your face becomes his next hurdle/);
  assert.match(md, /title=stop&body=just%20press%20submit\.%20he%20answers%20here%20in%20about%20a%20minute/);
  assert.match(md, /title=knock&body=just%20press%20submit\.%20it%20answers%20here%20in%20about%20a%20minute/);
  const hero = heroSvg(state, cfg, 'dark', Date.parse('2026-10-15T20:00:00Z'));
  assert.doesNotMatch(hero, /0 stops/);
});

test('remove takes a hurdle number or a login; stop replies carry no image', () => {
  assert.deepEqual(parseRemove('#37'), { n: 37 });
  assert.deepEqual(parseRemove(' 37 '), { n: 37 });
  assert.deepEqual(parseRemove('octocat'), { login: 'octocat' });
  assert.deepEqual(parseRemove('a;b'), { bad: true });
  assert.equal(parseRemove(''), null);
  const body = replyText({ type: 'stop', n: 3 }, lines);
  assert.doesNotMatch(body, /<img|<picture|raw\.githubusercontent/);
  assert.match(body, /you're hurdle #3 on his profile now/);
});

test('hurdles fade out before the flag and the year labels, and never hang off the edge', () => {
  const lay = (L, x) => L.rx - RX * L.s + x * L.s;
  const L = layoutTimeline(repos, cfg);
  const flagRight = L.flagSlot.x + 26, yearRight = L.flagSlot.x + textW('2026', 13);
  // wide: where the mask hits zero, the hurdle and its "#37" label are already clear of both
  const half = Math.max(HURDLE_R, textW('#37', 10) / 2);
  assert.ok(lay(WIDE, SHOW.wide[0] - half) >= Math.max(flagRight, yearRight) + 8, `wide left ${lay(WIDE, SHOW.wide[0] - half)}`);
  // and where it's fully shown, the whole hurdle is inside the picture
  assert.ok(lay(WIDE, SHOW.wide[2] + HURDLE_R) <= W - 8);
  // phone: same, against the end of the one-lock timeline and the right edge
  const N = layoutTimeline(repos, cfg, 1);
  const nEnd = NARROW.x0 - 28 * NARROW.ts + (N.slots.at(-1).x + 26) * NARROW.ts;
  assert.ok(lay(NARROW, SHOW.narrow[0] - HURDLE_R) >= nEnd + 8, `phone left ${lay(NARROW, SHOW.narrow[0] - HURDLE_R)} vs ${nEnd}`);
  assert.ok(lay(NARROW, SHOW.narrow[2] + HURDLE_R) <= W - 8, `phone right ${lay(NARROW, SHOW.narrow[2] + HURDLE_R)}`);
  // phone: where a cleared hurdle is gone, it's clear of the stopwatch block; the second one ahead is inside the picture
  const P = phoneLayout(cfg, repos);
  assert.ok(lay(PHONE, Math.max(SHOW.phone[0], BEHIND[0]) - HURDLE_R) >= P.end, `phone left ${lay(PHONE, SHOW.phone[0] - HURDLE_R)} vs ${P.end}`);
  assert.ok(lay(PHONE, START_X[1] + HURDLE_R) <= PHONE.w - 4, `phone right ${lay(PHONE, START_X[1] + HURDLE_R)}`);
  // the newest hurdle, the one he stops at, is fully shown in every layout
  for (const k of ['wide', 'narrow', 'phone']) assert.ok(START_X[0] >= SHOW[k][1] && START_X[0] <= SHOW[k][2]);
  // phone labels sit on the ground, inside the picture
  assert.ok(NARROW.gy + (12 + 2) * NARROW.s <= H);
  const s = heroSvg(state, cfg, 'light', Date.parse('2026-10-15T20:00:00Z'));
  assert.equal((s.match(/>#37</g) || []).length, 2, 'newest #n in both layouts');
  assert.equal((s.match(/mask="url\(#m[wn]\)"/g) || []).length, 2);
});

test('the still frame shows only what is ahead, in the order he meets them', () => {
  // hurdles he has already passed are fully faded at rest, so nothing hangs half-cut next to the flag
  for (const x0 of START_X) {
    const p = hurdlePoints(x0);
    assert.equal(p[0][2], x0 < RX ? 0 : 1, `hurdle at ${x0} starts at opacity ${p[0][2]}`);
  }
  // ahead of him, left to right: the newest first (h0), then h1
  const ahead = START_X.map((x, i) => [x, i]).filter(([x]) => x > RX).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  assert.deepEqual(ahead.slice(0, 2), [0, 1]);
  // a cleared hurdle fades out only once it's behind his feet
  assert.ok(BEHIND[1] <= RX - 7 - 8);
  assert.equal(opacityAt(BEHIND[0]), 0);
  assert.equal(opacityAt(RX), 1);
  // the svg attribute matches the first keyframe, so a reduced-motion still frame is the same picture
  const s = heroSvg(state, cfg, 'light', Date.parse('2026-10-15T20:00:00Z'));
  for (const [i, x0] of START_X.entries()) assert.match(s, new RegExp(`class="hd h${i}" opacity="${x0 < RX ? 0 : 1}"`));
});

test('bubble opens on one line, then grows for jk.; the still frame shows both', () => {
  const s = heroSvg(state, cfg, 'dark', Date.parse('2026-10-15T20:00:00Z'));
  const one = s.match(/<g class="b1" opacity="0">([\s\S]*?)<\/g>/g);
  const two = s.match(/<g class="b2">([\s\S]*?)<\/g>/g);
  assert.equal(one.length, 2);
  assert.equal(two.length, 2);
  for (const g of one) { assert.match(g, /fine\. stopped\./); assert.doesNotMatch(g, /jk\./); }
  for (const g of two) { assert.match(g, /fine\. stopped\./); assert.match(g, />jk\.</); }
  const { h, h1 } = bubbleBox(19, 13);
  assert.ok(h - h1 >= 19, "the one-liner is a full line shorter");
  // the one-liner shows until the freeze ends, then the two-liner takes over
  assert.match(s, new RegExp(`@keyframes b1\\{0%,[\\d.]+%\\{opacity:1\\}${F / LOOP * 100}%,100%\\{opacity:0\\}\\}`));
});

test('same world as the site: slate ground and blue hills by day, navy with stars and a moon by night', () => {
  const now = Date.parse('2026-10-15T20:00:00Z');
  const light = heroSvg(state, cfg, 'light', now), dark = heroSvg(state, cfg, 'dark', now);
  for (const c of ['#bfdcff', '#fef3e2', '#cfdcf1', '#a3badf', '#4f6a99', '#8aa6d6']) assert.ok(light.includes(c), c);
  for (const c of ['#0d1b2e', '#1d2c4a', '#1a2a46', '#142239', '#0b1422', '#2d4a7a']) assert.ok(dark.includes(c), c);
  assert.match(dark, /fill="#f2e8d2"/);     // moon
  assert.match(dark, /fill="#fffaeb"/);     // stars
  assert.doesNotMatch(light, /fill="#fffaeb"/);
  assert.doesNotMatch(light + dark, /#f3ece0|#0b0b0d/); // the old sand band and black slab
  // the faint year sits between the 2024 tower and the flag, above the single blocks: never behind a block,
  // the runner or the bubble. the narrow layouts leave it out.
  const L = layoutTimeline(repos, cfg);
  const pole = L.flagSlot.x + 13;
  const tall = L.slots.filter((s) => s.kind === 'tower' && s.tower.repos.length > 1 && s.x < pole);
  const [mx, up, size] = MARK.wide, half = sansW('2026', size) / 2;
  assert.ok(mx + half <= pole - 10, `wide year ends at ${mx + half}`);
  for (const t of tall) assert.ok(mx - half >= t.x + 26 + 6, `wide year starts at ${mx - half}, tower ends ${t.x + 26}`);
  assert.ok(WIDE.gy - up <= WIDE.gy - 26 - 4, 'year sits above the single blocks');
  assert.equal((light.match(new RegExp(`opacity="${THEMES.light.markOp}">2026<`, 'g')) || []).length, 1, 'year mark only in the wide layout');
  assert.ok(THEMES.light.markOp <= 0.03 && THEMES.dark.markOp <= 0.03);
});

test('phone: 2:1, readable on a 320px screen (a 288px image), big blocks and faces', () => {
  const k = 288 / PHONE.w;
  assert.equal(PHONE.w / PHONE.h, 2);
  const p = phoneSvg(state, cfg, Date.parse('2026-10-15T20:00:00Z'));
  const light = p.slice(p.indexOf('<g id="pl">'), p.indexOf('<g id="pd"'));
  // every repo block and one lock per gap
  assert.equal((light.match(/<g class="tile/g) || []).length, 13);
  // blocks at 14px, faces at 18px, text at 10px or more
  assert.ok(26 * PHONE.ts * k >= 14, `tile ${26 * PHONE.ts * k}`);
  assert.ok(2 * HURDLE_R * PHONE.s * k >= 18, `face ${2 * HURDLE_R * PHONE.s * k}`);
  const act = light.indexOf(`scale(${PHONE.s})">`), actEnd = light.indexOf('class="b1"');
  const sizes = [...light.matchAll(/font-size="([\d.]+)"/g)].map((m) => (m.index > act && m.index < actEnd ? PHONE.s : 1) * +m[1]);
  assert.ok(Math.min(...sizes) * k >= 10, `smallest phone text ${Math.min(...sizes) * k}`);
  assert.match(light, new RegExp(`font-size="${PHONE.title}"[^>]*>still running\\.`));
  // title and bubble share the top row without touching
  const [bs, bp] = PHONE.bubble, bx = PHONE.w - 14 - bubbleBox(bs, bp).w;
  assert.ok(PHONE.x0 + sansW('still running.', PHONE.title) - 13 * 1.5 + 12 <= bx, 'title runs into the bubble');
  // and the bubble clears his head at the top of a jump; its tail is short, it stops near the bubble
  assert.ok(10 + bubbleBox(bs, bp).h <= PHONE.gy - (12 + 29.5 + 34) * PHONE.s);
  const tips = [...light.matchAll(/<path d="M[^"]*L([\d.]+) ([\d.]+)L[^"]*"[^>]*stroke="#e3ded5"/g)].map((m) => +m[2]);
  assert.equal(tips.length, 2);
  for (const [i, h] of [bubbleBox(bs, bp).h1, bubbleBox(bs, bp).h].entries()) assert.ok(tips[i] - (10 + h) <= 18, `tail ${tips[i] - (10 + h)}px long`);
  // the space under the title is open down to the tallest tower
  assert.ok(56 + PHONE.title * 0.25 + 16 <= phoneLayout(cfg, repos).top, 'title vs the tallest tower');
  // the counter sits on the ground, under the blocks, and ends before the "you?" label
  const m = light.match(/y="([\d.]+)" font-size="([\d.]+)"[^>]*>tried 37 times/);
  assert.ok(+m[1] - +m[2] * 0.75 >= PHONE.gy + 13 * PHONE.s, 'counter below the hurdle labels');
  // "you?" sits over the empty hurdle, so it never meets the counter as it slides left
  const empty = phoneSvg({ ...state, tries: 0, hurdles: [] }, cfg);
  const you = empty.match(/y="([\d.]+)" font-size="([\d.]+)"[^>]*>you\?</);
  const youBottom = PHONE.gy + (+you[1] - GY + +you[2] * 0.25) * PHONE.s;
  assert.ok(youBottom <= PHONE.gy - 19 * PHONE.s + 2, 'you? is not over the hurdle bar');
  const cm = empty.match(/y="([\d.]+)" font-size="([\d.]+)"[^>]*>nobody's tried/);
  assert.ok(+cm[1] - +cm[2] * 0.75 - youBottom >= 40, 'you? near the counter');
  // the flag points back over the blocks, so the runner can sit close to them
  const P = phoneLayout(cfg, repos);
  assert.ok(PHONE.rx - 7 * PHONE.s - 20 >= P.end);
});

test('buttons: the site pills, jetbrains mono built in, room on both ends', () => {
  for (const th of ['light', 'dark']) for (const kind of ['play', 'stop']) {
    const b = buttonSvg(kind, th), w = buttonW(kind);
    assert.match(b, /@font-face\{font-family:sr-btn;font-weight:500;src:url\(data:font\/woff2;base64,/);
    assert.match(b, /text\{font-family:sr-btn,/);
    assert.match(b, new RegExp(`width="${w}" height="48"`));
    assert.match(b, new RegExp(`rx="${(BUTTON.h - 1) / 2}"`)); // a full pill
    assert.ok(Buffer.byteLength(b) < 6 * 1024);
    // the text ends at least 18px before the edge
    assert.ok(w - (BUTTON[kind].x + textW(BUTTON[kind].text, BUTTON.size)) >= 18, `${kind} right room`);
  }
  // stop him carries the site's stop icon: ring, crown, square
  assert.match(buttonSvg('stop', 'light'), /<circle cx="22" cy="22" r="18" fill="none"[^>]*\/><rect x="19.5" y="9.5" width="5" height="3"[^>]*\/><rect x="16" y="17" width="12" height="12"/);
  // soft white by day, near black by night
  assert.match(buttonSvg('play', 'light'), /fill="#ffffff" stroke="#e3ded5"/);
  assert.match(buttonSvg('play', 'dark'), /fill="#141417"/);
  // the font subset covers every letter on the buttons
  const font = readFileSync(join(ROOT, 'data/fonts/jetbrains-mono-500-buttons.woff2'));
  assert.ok(font.length < 3000);
});
