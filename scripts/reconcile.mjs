// the one entry point for every run (issue opened, manual dispatch).
// it never trusts its own trigger: it drains every open stop issue,
// renders, commits, pushes, then replies.
//
// untrusted input (issue titles, logins) is only compared against fixed values.
// it never reaches a shell: git runs through execFileSync with an args array.
//
// node scripts/reconcile.mjs          (needs GH_TOKEN, REPO)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderAll, ROOT } from './render.mjs';

const env = process.env;
const API = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const REPO = env.REPO || 'aaghashm/aaghashm';
const USER = env.PROFILE_USER || REPO.split('/')[0];
const BRANCH = env.BRANCH || 'main';
const BOT = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' };
export const PT = 'America/Los_Angeles';
export const LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const TITLES = { stop: 'stop', 'stop him': 'stop' };
const BUSY_MAX = 20;
// one run handles at most this many game issues, or stops taking new ones after this long.
// leftovers make the run dispatch another one, so a flood never stalls past the 5 min job limit.
const PER_RUN = +(env.PER_RUN || 40), PASS_BUDGET = 120e3, REPLY_BUDGET = 240e3, ISSUE_PAGES = 10;
const log = (...a) => console.log(...a);

// ---------- pure helpers ----------
export const dateIn = (tz, d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const gameKind = (title) => TITLES[String(title ?? '').trim().toLowerCase()] || null;
export const seenKey = (login, kind) => createHash('sha256').update(login.toLowerCase() + ':' + kind).digest('hex').slice(0, 16);

export function stopLine(lines, n) {
  return lines.milestones[String(n)] || lines.stop[(n - 1) % lines.stop.length];
}

export function prune(state, now, todayPT) {
  const yday = addDays(todayPT, -1);
  state.hurdles = (state.hurdles || []).slice(0, 5);
  state.seen = Object.fromEntries(Object.entries(state.seen || {}).filter(([, d]) => d >= yday));
  state.recent = (state.recent || []).filter((t) => now - Date.parse(t) < 3600e3);
  state.handled = (state.handled || []).slice(-300);
  const keep = new Set(state.handled.map(String));
  state.outcomes = Object.fromEntries(Object.entries(state.outcomes || {}).filter(([k]) => keep.has(k)));
  return state;
}

export function freshState() {
  return {
    version: 1, tries: 0, stops: 0, hurdles: [], seen: {}, recent: [], handled: [], outcomes: {},
    streak: { repo: 'persistent-stopwatch', current: 0, start: null, best: 0 }, repos: [], lastDaily: null, assets: {},
  };
}

// ---------- github api ----------
async function api(method, path, body, { ok = [] } = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok && !ok.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status}`);
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

// all open issues, oldest first. non-game issues stay open on purpose, so read past the first page.
async function openIssues() {
  const all = [];
  for (let p = 1; p <= ISSUE_PAGES; p++) {
    const { data } = await api('GET', `/repos/${REPO}/issues?state=open&sort=created&direction=asc&per_page=100&page=${p}`);
    all.push(...data);
    if (data.length < 100) break;
  }
  return all;
}

// ---------- git ----------
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// ---------- one pass over state ----------
async function pass(now, t0) {
  const todayPT = dateIn(PT, now);
  const sp = join(ROOT, 'data/state.json');
  const state = existsSync(sp) ? { ...freshState(), ...JSON.parse(readFileSync(sp, 'utf8')) } : freshState();
  const lines = JSON.parse(readFileSync(join(ROOT, 'data/lines.json'), 'utf8'));
  const msgs = [], replies = [];

  // 1. open game issues, oldest first
  let more = false;
  const issues = await openIssues();
  const handled = new Set(state.handled);
  const perRun = {};
  let taken = 0;
  for (const is of issues) {
    if (is.pull_request || is.user?.type !== 'User') continue;
    const kind = gameKind(is.title);
    if (!kind) continue;
    if (taken >= PER_RUN || Date.now() - t0 > PASS_BUDGET) { more = true; break; }
    taken++;
    if (handled.has(is.number)) { replies.push({ num: is.number, ...decode(state.outcomes?.[is.number]) }); continue; }
    const login = String(is.user.login || '');
    // 2. classify
    if (!LOGIN_RE.test(login)) { replies.push({ num: is.number, type: 'silent' }); continue; }
    const key = seenKey(login, kind);
    // a repeat if they were already counted on or after the day this issue was opened.
    // so a repeat whose reply failed yesterday is still a repeat today, not a new try.
    const opened = is.created_at ? dateIn(PT, new Date(is.created_at)) : todayPT;
    const seen = !!state.seen[key] && state.seen[key] >= opened;
    const recent = state.recent.filter((t) => now - Date.parse(t) < 3600e3);
    if (seen) {
      perRun[key] = (perRun[key] || 0) + 1;
      // one reply per person per run, the rest close quietly (spam guard)
      replies.push({ num: is.number, type: perRun[key] > 1 ? 'silent' : 'repeat' });
    } else if (recent.length >= BUSY_MAX) {
      replies.push({ num: is.number, type: 'busy' });
    } else {
      state.tries++;
      const n = state.tries;
      state.seen[key] = todayPT;
      state.recent.push(now.toISOString().replace(/\.\d+Z$/, 'Z'));
      state.hurdles.unshift({ n, at: todayPT });
      state.hurdles = state.hurdles.slice(0, 5);
      state.handled.push(is.number);
      state.outcomes[is.number] = `s${n}`;
      replies.push({ num: is.number, type: 'stop', n });
      msgs.push(`stop attempt #${n}`);
      log(`#${is.number}: stop attempt ${n}`);
    }
  }
  // replies alone (repeat, busy, spam) change nothing worth a commit
  if (!msgs.length) return { state, replies, msgs, lines, more };
  prune(state, now, todayPT);

  // 3. render + write
  renderAll(state, ROOT, now.getTime());
  writeFileSync(sp, JSON.stringify(state, null, 1) + '\n');
  return { state, replies, msgs, lines, more };
}

// "s12" is stop #12
const decode = (o) => !o ? { type: 'pending' } : { type: 'stop', n: parseInt(o.slice(1), 10) };

// ---------- 4. replies, after a successful push ----------
export function replyText(r, lines) {
  switch (r.type) {
    // every stop gets the joke from the hero first, then the line for this try
    case 'stop':
      return [
        ...lines.stopOpen.split('\n\n').map((l) => `**${l}**`),
        stopLine(lines, r.n),
        lines.stopTail.replaceAll('{n}', r.n).replaceAll('{user}', USER),
        lines.stopEnd,
      ].join('\n\n');
    case 'repeat': return lines.repeat;
    case 'busy': return lines.busy;
    default: return null;
  }
}

async function ensureLabel() {
  const { status } = await api('GET', `/repos/${REPO}/labels/played`, null, { ok: [404] });
  if (status === 404) await api('POST', `/repos/${REPO}/labels`, { name: 'played', color: '8b949e', description: 'tried to stop him' }, { ok: [422] });
}

async function reply(r, lines) {
  const base = `/repos/${REPO}/issues/${r.num}`;
  if (r.type === 'silent') {
    await api('PATCH', base, { state: 'closed', state_reason: 'not_planned' });
    return;
  }
  const body = replyText(r, lines);
  if (body) {
    const { data: comments } = await api('GET', `${base}/comments?per_page=100`);
    if (!comments.some((c) => c.user?.login === BOT.name)) await api('POST', `${base}/comments`, { body });
  }
  await api('POST', `${base}/labels`, { labels: ['played'] });
  await api('PATCH', base, { state: 'closed', state_reason: 'completed' });
  await api('PUT', `${base}/lock`, { lock_reason: 'resolved' });
}

// ---------- main ----------
export async function main() {
  const now = env.NOW ? new Date(env.NOW) : new Date();
  const t0 = Date.now();

  // no early exit for non-game issues: github keeps one waiting run per group and cancels it when a
  // newer one arrives, so whichever run starts has to drain every open stop, whatever woke it.
  let out;
  for (let attempt = 1; ; attempt++) {
    out = await pass(now, t0);
    if (!git('status', '--porcelain')) { log('nothing changed, no commit'); break; }
    git('add', '-A');
    const msg = [...new Set(out.msgs)].join(', ') || 'update';
    git('-c', `user.name=${BOT.name}`, '-c', `user.email=${BOT.email}`, 'commit', '-q', '-m', msg);
    try {
      git('push', '-q', 'origin', `HEAD:${BRANCH}`);
      log(`pushed: ${msg}`);
      break;
    } catch (e) {
      log(`push failed (attempt ${attempt}): ${String(e.stderr || e.message).split('\n')[0]}`);
      if (attempt >= 3) throw new Error('push failed 3 times, nothing replied. the next run picks it up.');
      git('fetch', '-q', 'origin', BRANCH);
      git('reset', '-q', '--hard', `origin/${BRANCH}`);
    }
  }

  if (out.replies.some((r) => r.type !== 'silent')) await ensureLabel().catch((e) => log('label: ' + e.message));
  let failed = 0, more = out.more;
  for (const r of out.replies) {
    if (Date.now() - t0 > REPLY_BUDGET) { more = true; log('out of time, the next run replies to the rest'); break; }
    if (r.type === 'pending') { log(`#${r.num}: handled but no outcome stored, closing`); r.type = 'silent'; }
    try { await reply(r, out.lines); log(`#${r.num}: ${r.type} reply done`); } catch (e) { failed++; log(`#${r.num}: reply failed, next run retries (${e.message})`); }
  }
  if (failed) log(`${failed} repl${failed > 1 ? 'ies' : 'y'} failed`);
  if (more) log('more game issues waiting, asking for another run');
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `more=${more}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
