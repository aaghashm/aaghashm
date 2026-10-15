// end to end: the real reconcile.mjs against a fake github api and a real git remote (a bare repo).
// covers the acceptance cases that can run offline: bursts, repeats, spam, bots, real issues left alone,
// a failed reply, a push race, remove, knock, daily refresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { ROOT } from '../render.mjs';
import { mockGithub, PNG } from './mock-github.mjs';

const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'still-running-'));
  const work = join(tmp, 'work'), remote = join(tmp, 'remote.git');
  for (const d of ['scripts', 'data', 'templates', 'assets', '.github']) cpSync(join(ROOT, d), join(work, d), { recursive: true });
  cpSync(join(ROOT, 'README.md'), join(work, 'README.md'));
  // start from fixed data, not whatever the live bot last wrote
  for (const f of ['state.json', 'wall.json']) cpSync(join(ROOT, 'scripts/test/fixtures', f), join(work, 'data', f));
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  sh(work, 'init', '-q', '-b', 'main');
  sh(work, 'add', '-A');
  sh(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  sh(work, 'remote', 'add', 'origin', remote);
  sh(work, 'push', '-q', 'origin', 'main');
  return { tmp, work, remote };
}

function run(work, env) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [join(work, 'scripts/reconcile.mjs')], { cwd: work, env: { PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: 'test', REPO: 'aaghashm/aaghashm', STREAK_TZ: 'America/Los_Angeles', ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => ok({ code, out }));
  });
}
const event = (tmp, title) => { const f = join(tmp, 'event.json'); writeFileSync(f, JSON.stringify({ action: 'opened', issue: { title, user: { type: 'User' } } })); return f; };
const remoteState = (remote) => JSON.parse(execFileSync('git', ['--git-dir', remote, 'show', 'main:data/state.json'], { encoding: 'utf8', maxBuffer: 1e7 }));
const remoteHead = (remote) => execFileSync('git', ['--git-dir', remote, 'rev-parse', 'main'], { encoding: 'utf8' }).trim();
const remoteLog = (remote) => execFileSync('git', ['--git-dir', remote, 'log', '--format=%an <%ae>|%s', 'main'], { encoding: 'utf8' }).trim().split('\n');

test('play + daily workflows, end to end', async (t) => {
  const { tmp, work, remote } = setup();
  const gh = await mockGithub();
  const { db } = gh;
  const base = { GITHUB_API_URL: gh.url, AVATAR_BASE: gh.url };
  t.after(() => gh.close());

  await t.test('a burst of issues: counted, plain hurdles, bots, PRs and real issues left alone', async () => {
    db.user('alice', { public_repos: 3 });
    db.user('bob', { created_at: '2026-10-10T00:00:00Z' });           // new account -> plain hurdle
    db.user('carol', { public_repos: 0, followers: 0 });              // empty account -> plain hurdle
    const mal = db.user('mallory'); db.avatars[mal.id] = { buf: Buffer.from('<svg onload="alert(1)"/>'), type: 'image/png' }; // lies about type
    const big = db.user('bigface'); db.avatars[big.id] = { buf: PNG(30000), type: 'image/png' };  // too big
    db.user('frank');
    db.user('dependabot', { type: 'Bot' });
    const a1 = db.open('stop', 'alice');
    const b1 = db.open('  Stop Him ', 'bob');
    const c1 = db.open('STOP', 'carol');
    const bug = db.open('bug: stop button does nothing on mobile', 'dave');
    const botIs = db.open('stop', 'dependabot', { type: 'Bot' });
    const pr = db.open('stop', 'erin', { pr: true });
    const k1 = db.open('knock', 'erin');
    const a2 = db.open('stop', 'alice');      // same day -> reply only
    const a3 = db.open('stop', 'alice');      // spam -> closed quietly
    const m1 = db.open('stop', 'mallory');
    const g1 = db.open('stop', 'bigface');
    const f1 = db.open('stop', 'frank', { body: '$(touch /tmp/pwned) `rm -rf /` <img src=x onerror=alert(1)> @aaghashm' });
    const bad = db.open('stop', 'bad--login'); // not a valid login -> closed quietly
    const before = remoteHead(remote);

    const r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T18:00:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.notEqual(remoteHead(remote), before);
    const st = remoteState(remote);
    assert.equal(st.tries, 6);
    assert.equal(st.knocks, 1);
    assert.deepEqual(st.hurdles.map((h) => h.n), [6, 5, 4, 3, 2]);
    const byN = Object.fromEntries(st.hurdles.map((h) => [h.n, h]));
    assert.match(byN[6].avatar, /^data:image\/png;base64,/);     // frank
    assert.equal(byN[5].avatar, null);                             // bigface: too big
    assert.equal(byN[4].avatar, null);                             // mallory: not an image
    assert.equal(byN[3].avatar, null);                             // carol: empty account
    assert.equal(byN[2].avatar, null);                             // bob: new account
    const [msgLine] = remoteLog(remote);
    assert.equal(msgLine, 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>|stop attempt #1, stop attempt #2, stop attempt #3, knock #1, stop attempt #4, stop attempt #5, stop attempt #6');

    for (const is of [a1, b1, c1, k1, a2, m1, g1, f1]) {
      assert.equal(is.state, 'closed', `#${is.number}`);
      assert.equal(is.locked, 'resolved');
      assert.deepEqual(is.labels, ['played']);
      assert.equal(db.comments[is.number]?.length, 1, `#${is.number} comments`);
    }
    for (const is of [a3, bad]) { assert.equal(is.state, 'closed'); assert.equal(is.state_reason, 'not_planned'); assert.equal(db.comments[is.number], undefined); }
    for (const is of [bug, botIs, pr]) { assert.equal(is.state, 'open'); assert.equal(db.comments[is.number], undefined); assert.equal(is.locked, false); }

    const c = db.comments[a1.number][0].body;
    assert.match(c, /^\*\*fine\. stopped\.\*\*\n\n\*\*jk\.\*\*/);
    // every try gets the joke, then its own line. plain hurdles are told why.
    for (const is of [b1, c1, m1, g1, f1]) assert.match(db.comments[is.number][0].body, /^\*\*fine\. stopped\.\*\*\n\n\*\*jk\.\*\*\n\n[a-z]/, `#${is.number}`);
    assert.match(db.comments[b1.number][0].body, /no face this time/);
    assert.doesNotMatch(db.comments[f1.number][0].body, /no face this time/);
    // no hero image in replies: it would pin other people's faces into this comment for good
    assert.doesNotMatch(c, /<img|<picture|raw\.githubusercontent/);
    assert.match(c, /you're hurdle #1 on his profile now: https:\/\/github\.com\/aaghashm\n\nstopped: 0\./);
    // the owner hears about each new face (alice #1, frank #6) once, in one locked bot issue
    assert.ok(st.modIssue);
    const mod = db.issue(st.modIssue);
    assert.equal(mod.title, 'faces on the track');
    assert.equal(mod.locked, 'resolved');
    assert.equal(mod.state, 'open');
    assert.equal(db.comments[mod.number].length, 2);
    assert.match(db.comments[mod.number][0].body, /^@aaghashm new face: hurdle \*\*#1\*\* is \[alice\]/);
    assert.match(db.comments[mod.number][1].body, /^@aaghashm new face: hurdle \*\*#6\*\* is \[frank\]\(https:\/\/github\.com\/frank\)\.[\s\S]*`gh workflow run play\.yml -R aaghashm\/aaghashm -f remove=frank`$/);
    // faces go up on their own, and the log issue says exactly how to take one off
    assert.match(mod.body, /faces go up on their own/);
    assert.match(mod.body, /`gh workflow run play\.yml -R aaghashm\/aaghashm -f remove=<login>`/);
    assert.match(db.comments[k1.number][0].body, /^\*knock\*\n\n\.\.\.nothing\.\n\nknocks so far: 1\.$/);
    assert.match(db.comments[a2.number][0].body, /^one try a day/);
    // the body is never echoed, nobody is mentioned
    for (const [num, list] of Object.entries(db.comments)) for (const cm of list) {
      assert.doesNotMatch(cm.body, /pwned|onerror|rm -rf/);
      if (+num !== st.modIssue) assert.doesNotMatch(cm.body, /@[a-z]/i);   // players are never pinged
    }
    assert.ok(!existsSync('/tmp/pwned'));
    // hero files: exactly the two current ones, README points at them, wobble from the knock
    sh(work, 'pull', '-q', 'origin', 'main');
    const heroes = readdirSync(join(work, 'assets')).filter((f) => f.startsWith('hero-')).sort();
    assert.deepEqual(heroes, [st.assets.heroDark, st.assets.heroLight].sort());
    const readme = readFileSync(join(work, 'README.md'), 'utf8');
    assert.ok(readme.includes(st.assets.heroDark) && readme.includes(st.assets.heroLight));
    // and one phone picture per theme, the current ones, with the same counter
    assert.deepEqual(readdirSync(join(work, 'assets')).filter((f) => f.startsWith('phone-')).sort(), [st.assets.phoneDark, st.assets.phoneLight].sort());
    for (const f of [st.assets.phoneDark, st.assets.phoneLight]) {
      assert.ok(readme.includes(f));
      assert.match(readFileSync(join(work, 'assets', f), 'utf8'), /tried 6 times\. stopped 0\./);
    }
    assert.match(readFileSync(join(work, 'assets', st.assets.heroDark), 'utf8'), /tried 6 times\. stopped 0\./);
    assert.match(readFileSync(join(work, 'assets', st.assets.heroDark), 'utf8'), /@keyframes wob/);
    assert.ok(db.labels.has('played'));
  });

  await t.test('nothing new: no commit. a repeat later the same day: reply only, no commit', async () => {
    const before = remoteHead(remote);
    let r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T18:05:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /nothing changed, no commit/);
    const is = db.open('stop him', 'alice');
    r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T19:00:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop him') });
    assert.equal(r.code, 0, r.out);
    assert.equal(remoteHead(remote), before);
    assert.equal(is.state, 'closed');
    assert.match(db.comments[is.number][0].body, /^one try a day/);
    assert.equal(remoteState(remote).tries, 6);
  });

  await t.test('a real issue: only reads, no writes, no commit, left open', async () => {
    const q = db.open('question about persistent-stopwatch', 'zed');
    const n = db.calls.length, before = remoteHead(remote);
    const r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T19:10:00Z', GITHUB_EVENT_PATH: event(tmp, 'question about persistent-stopwatch') });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(db.calls.slice(n).filter((c) => !c.startsWith('GET')), []);
    assert.equal(remoteHead(remote), before);
    assert.equal(q.state, 'open');
  });

  await t.test('a stop whose own run was cancelled is still answered by the next run, even one woken by a real issue', async () => {
    const s = db.open('stop', 'ivy');
    db.open('hi', 'troll');   // github cancels the waiting stop run when this one queues
    const r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T18:10:00Z', GITHUB_EVENT_PATH: event(tmp, 'hi') });
    assert.equal(r.code, 0, r.out);
    assert.equal(s.state, 'closed');
    assert.match(db.comments[s.number][0].body, /you're hurdle #7 /);
    assert.equal(remoteState(remote).tries, 7);
  });

  await t.test('130 open junk issues do not hide a stop behind them', async () => {
    const junk = Array.from({ length: 130 }, () => db.open('hi', 'troll'));
    const s = db.open('stop', 'jane');
    const r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T18:20:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.equal(s.state, 'closed');
    assert.equal(remoteState(remote).tries, 8);
    assert.ok(junk.every((is) => is.state === 'open'));   // real issues are still never touched
    for (const is of junk) is.state = 'closed';          // the owner cleans up
  });

  await t.test('spam burst: 25 new people in an hour, 20 counted, the rest told to wait', async () => {
    const list = Array.from({ length: 25 }, (_, i) => db.open('stop', `runner${i}`));
    const r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T18:30:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    const st = remoteState(remote);
    assert.equal(st.tries, 8 + 12); // 8 already in the last hour
    assert.equal(st.recent.length, 20);
    const busy = list.filter((is) => /too many people/.test(db.comments[is.number]?.[0]?.body || ''));
    assert.equal(busy.length, 13);
    assert.ok(list.every((is) => is.state === 'closed'));
    sh(work, 'pull', '-q', 'origin', 'main');
    assert.match(readFileSync(join(work, 'assets', st.assets.heroDark), 'utf8'), /tried 20 times\. stopped 0\./);
  });

  await t.test('a reply that fails is retried next run without counting twice', async () => {
    const is = db.open('stop', 'greg');
    db.fail.comment.add(is.number);
    let r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T21:00:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /reply failed/);
    assert.equal(is.state, 'open');
    assert.equal(remoteState(remote).tries, 21);
    r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T21:01:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.equal(is.state, 'closed');
    assert.equal(db.comments[is.number].length, 1);
    assert.match(db.comments[is.number][0].body, /you're hurdle #21 /);
    assert.equal(remoteState(remote).tries, 21);
  });

  await t.test('push race: another run pushed first and already counted the issue', async () => {
    sh(work, 'pull', '-q', 'origin', 'main');
    const is = db.open('stop', 'hank');
    // the "other run", in its own clone
    const other = join(tmp, 'other');
    execFileSync('git', ['clone', '-q', remote, other]);
    const sp = join(other, 'data/state.json');
    const s = JSON.parse(readFileSync(sp, 'utf8'));
    s.tries++; s.handled.push(is.number); s.outcomes[is.number] = `s${s.tries}`;
    writeFileSync(sp, JSON.stringify(s, null, 1) + '\n');
    sh(other, '-c', 'user.name=o', '-c', 'user.email=o@o', 'commit', '-qam', `stop attempt #${s.tries}`);
    sh(other, 'push', '-q', 'origin', 'main');
    // our run started from the old checkout: first push fails, it resets and redoes the work
    const r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T21:05:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /push failed \(attempt 1\)/);
    const st = remoteState(remote);
    assert.equal(st.tries, 22);
    assert.equal(is.state, 'closed');
    assert.equal(db.comments[is.number].length, 1);
    assert.match(db.comments[is.number][0].body, /you're hurdle #22 /);
  });

  await t.test('owner removes a hurdle', async () => {
    sh(work, 'pull', '-q', 'origin', 'main');
    const st0 = remoteState(remote);
    const victim = st0.hurdles.find((h) => h.avatar);
    const login = Object.values(db.users).find((u) => u.id === victim.id).login;
    let r = await run(work, { ...base, TRIGGER: 'workflow_dispatch', REMOVE_LOGIN: 'a;b $(x)', NOW: '2026-10-15T21:10:00Z' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /not a hurdle number or a valid login/);
    r = await run(work, { ...base, TRIGGER: 'workflow_dispatch', REMOVE_LOGIN: login, NOW: '2026-10-15T21:10:00Z' });
    assert.equal(r.code, 0, r.out);
    const st = remoteState(remote);
    assert.equal(st.hurdles.find((h) => h.id === victim.id).avatar, null);
    sh(work, 'pull', '-q', 'origin', 'main');
    const bl = JSON.parse(readFileSync(join(work, 'data/blocklist.json'), 'utf8'));
    assert.ok(bl.ids.includes(victim.id) && bl.logins.includes(login));
    assert.equal(remoteLog(remote)[0].split('|')[1], 'remove a hurdle');
  });

  await t.test('owner removes a hurdle by its number, the one shown in the image', async () => {
    sh(work, 'pull', '-q', 'origin', 'main');
    const st0 = remoteState(remote);
    const victim = st0.hurdles.find((h) => h.avatar);
    assert.ok(victim, 'needs a face on the track');
    let r = await run(work, { ...base, TRIGGER: 'workflow_dispatch', REMOVE_LOGIN: '999', NOW: '2026-10-15T21:20:00Z' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /hurdle #999 is not on the track/);
    r = await run(work, { ...base, TRIGGER: 'workflow_dispatch', REMOVE_LOGIN: ` #${victim.n} `, NOW: '2026-10-15T21:20:00Z' });
    assert.equal(r.code, 0, r.out);
    assert.equal(remoteState(remote).hurdles.find((h) => h.n === victim.n).avatar, null);
    sh(work, 'pull', '-q', 'origin', 'main');
    assert.ok(JSON.parse(readFileSync(join(work, 'data/blocklist.json'), 'utf8')).ids.includes(victim.id));
  });

  await t.test('if the owner notice fails, the face stays off', async () => {
    const st0 = remoteState(remote);
    db.fail.comment.add(st0.modIssue);
    const is = db.open('stop', 'kim');
    const r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T21:30:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /face notice failed, plain hurdle/);
    const st = remoteState(remote);
    assert.equal(st.hurdles[0].n, 23);
    assert.equal(st.hurdles[0].avatar, null);
    assert.equal(is.state, 'closed');
  });

  await t.test('a flood: a capped run says "more", the next run finishes', async () => {
    const list = ['lia', 'max', 'ned'].map((l) => db.open('stop', l));
    const out = join(tmp, 'gh-output');
    writeFileSync(out, '');
    let r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T21:40:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop'), PER_RUN: '2', GITHUB_OUTPUT: out });
    assert.equal(r.code, 0, r.out);
    assert.equal(readFileSync(out, 'utf8'), 'more=true\n');
    assert.deepEqual(list.map((is) => is.state), ['closed', 'closed', 'open']);
    writeFileSync(out, '');
    r = await run(work, { ...base, TRIGGER: 'workflow_dispatch', NOW: '2026-10-15T21:41:00Z', PER_RUN: '2', GITHUB_OUTPUT: out });
    assert.equal(r.code, 0, r.out);
    assert.equal(readFileSync(out, 'utf8'), 'more=false\n');
    assert.equal(list[2].state, 'closed');
    assert.equal(remoteState(remote).tries, 26);
  });

  await t.test('a same-day repeat whose reply failed is still a repeat the next day', async () => {
    const is = db.open('stop', 'alice', { created_at: '2026-10-15T22:00:00Z' });
    db.fail.comment.add(is.number);
    let r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-15T22:00:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.equal(is.state, 'open');
    r = await run(work, { ...base, TRIGGER: 'issues', NOW: '2026-10-16T08:00:00Z', GITHUB_EVENT_PATH: event(tmp, 'stop') });
    assert.equal(r.code, 0, r.out);
    assert.equal(is.state, 'closed');
    assert.match(db.comments[is.number][0].body, /^one try a day/);
    assert.equal(remoteState(remote).tries, 26);
  });

  await t.test('daily refresh: streak, prune, wobble expiry, missed day', async () => {
    let r = await run(work, { ...base, TRIGGER: 'schedule', NOW: '2026-10-16T08:17:00Z' });
    assert.equal(r.code, 0, r.out);
    let st = remoteState(remote);
    assert.equal(st.lastDaily, '2026-10-16');
    assert.equal(st.streak.current, 110);   // no commit yet on the 16th, counts from yesterday
    assert.equal(st.repos.length, 10);
    assert.equal(st.recent.length, 0);
    assert.equal(remoteLog(remote)[0].split('|')[1], 'daily: day 110');
    sh(work, 'pull', '-q', 'origin', 'main');
    assert.match(readFileSync(join(work, 'assets', st.assets.heroDark), 'utf8'), /@keyframes wob/); // knock < 24h ago

    r = await run(work, { ...base, TRIGGER: 'schedule', NOW: '2026-10-17T08:17:00Z' });
    assert.equal(r.code, 0, r.out);
    st = remoteState(remote);
    assert.equal(st.streak.current, 0);
    assert.equal(st.streak.best, 110);
    assert.deepEqual(Object.values(st.seen), []);
    sh(work, 'pull', '-q', 'origin', 'main');
    const svg = readFileSync(join(work, 'assets', st.assets.heroDark), 'utf8');
    assert.doesNotMatch(svg, /@keyframes wob/);
    assert.match(svg, /110 days\. still running\./);
    assert.equal(readdirSync(join(work, 'assets')).filter((f) => f.startsWith('hero-')).length, 2);
    assert.equal(readdirSync(join(work, 'assets')).filter((f) => f.startsWith('phone-')).length, 2);
  });
});

test('the wall, end to end: paint, once a day, the hour lock, bad input, blocked, names, remove', async (t) => {
  const { tmp, work, remote } = setup();
  const gh = await mockGithub();
  const { db } = gh;
  const base = { GITHUB_API_URL: gh.url, AVATAR_BASE: gh.url };
  t.after(() => gh.close());
  const wallOf = () => JSON.parse(execFileSync('git', ['--git-dir', remote, 'show', 'main:data/wall.json'], { encoding: 'utf8', maxBuffer: 1e7 }));
  const readme = () => execFileSync('git', ['--git-dir', remote, 'show', 'main:README.md'], { encoding: 'utf8', maxBuffer: 1e7 });
  const go = (NOW) => run(work, { ...base, TRIGGER: 'issues', NOW, GITHUB_EVENT_PATH: event(tmp, 'paint') });

  db.user('alice');
  db.user('bob');
  db.user('carl');
  db.user('newbie', { created_at: '2026-10-10T00:00:00Z' });   // too new for a name under the wall
  const troll = db.user('troll');
  writeFileSync(join(work, 'data/blocklist.json'), JSON.stringify({ ids: [troll.id], logins: [] }));
  sh(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'block troll');
  sh(work, 'push', '-q', 'origin', 'main');

  const a1 = db.open('paint 12 7 orange', 'alice', { created_at: '2026-10-15T18:00:00Z' });
  const a2 = db.open('paint 13 7 blue', 'alice', { created_at: '2026-10-15T18:00:00Z' });  // second today
  const b1 = db.open('Paint  12, 7  Teal', 'bob', { created_at: '2026-10-15T18:00:00Z' });  // same tile, inside the hour
  const n1 = db.open('paint green 40 12', 'newbie', { created_at: '2026-10-15T18:00:00Z' }); // color first is fine
  const bad = db.open('paint 99 7 orange', 'carl', { created_at: '2026-10-15T18:00:00Z' });
  const bad2 = db.open('paint 98 7 orange', 'carl', { created_at: '2026-10-15T18:00:00Z' }); // one reply per person per run
  const tr = db.open('paint 1 1 black', 'troll', { created_at: '2026-10-15T18:00:00Z' });
  const real = db.open('painting is broken on mobile', 'bob');
  let r = await go('2026-10-15T18:00:00Z');
  assert.equal(r.code, 0, r.out);

  let w = wallOf();
  assert.equal(w.rows[6][11], 'o');            // column 12, row 7
  assert.equal(w.rows[11][39], 'g');           // column 40, row 12
  assert.equal(w.rows[6][12], '.');            // alice's second one didn't land
  assert.equal(w.rows[0][0], '.');             // the blocked account painted nothing
  assert.equal(w.count, 2);
  assert.deepEqual(w.last.map((e) => e.login), [null, 'alice']);
  assert.match(remoteLog(remote)[0], /paint 12 7 orange, paint 40 12 green/);

  assert.match(db.comments[a1.number][0].body, /^painted 12 7 orange\. it's on the wall: https:\/\/github\.com\/aaghashm\n\none pixel a day\./);
  assert.match(db.comments[a2.number][0].body, /^one pixel a day\. yours is already up/);
  assert.match(db.comments[b1.number][0].body, /^12 7 was painted less than an hour ago/);
  assert.match(db.comments[bad.number][0].body, /^couldn't read that\. try `paint 12 7 orange`: column 1-48, row 1-12, then orange, pink, yellow, green, teal, blue, white or black\.$/);
  for (const is of [a1, a2, b1, n1, bad]) {
    assert.equal(is.state, 'closed', `#${is.number}`);
    assert.equal(is.locked, 'resolved');
    // only a paint that landed is labelled painted. a bounced one (repeat, locked, bad) is just played.
    assert.deepEqual(is.labels, [a1, n1].includes(is) ? ['painted'] : ['played'], `#${is.number}`);
    assert.equal(db.comments[is.number].length, 1);
  }
  for (const is of [tr, bad2]) {
    assert.equal(is.state, 'closed');
    assert.equal(is.state_reason, 'not_planned');
    assert.equal(db.comments[is.number], undefined);
  }
  assert.equal(real.state, 'open');
  assert.ok(db.labels.has('painted'));
  // replies are short, lowercase, and ping nobody
  for (const is of [a1, a2, b1, n1, bad]) { const c = db.comments[is.number][0].body; assert.equal(c, c.toLowerCase()); assert.doesNotMatch(c, /@[a-z]/i); }

  // the README names painters who could be faces, the new account is "someone". the picture never has a login.
  let md = readme();
  assert.match(md, /last painted by someone and \[@alice\]\(https:\/\/github\.com\/alice\)\./);
  sh(work, 'pull', '-q', 'origin', 'main');
  const st = remoteState(remote);
  assert.ok(st.assets.wallDark && st.assets.wallLight);
  for (const f of [st.assets.wallDark, st.assets.wallLight]) {
    assert.ok(md.includes(f));
    const svg = readFileSync(join(work, 'assets', f), 'utf8');
    assert.doesNotMatch(svg, /alice|newbie|bob/);
    assert.match(svg, /the wall\. 2 pixels so far\./);
  }
  assert.deepEqual(readdirSync(join(work, 'assets')).filter((f) => f.startsWith('wall-')).sort(), [st.assets.wallDark, st.assets.wallLight].sort());

  // an hour later the tile is open again for bob; the next utc day alice paints again
  const b2 = db.open('paint 12 7 teal', 'bob', { created_at: '2026-10-15T19:05:00Z' });
  r = await go('2026-10-15T19:05:00Z');
  assert.equal(r.code, 0, r.out);
  assert.match(db.comments[b2.number][0].body, /^painted 12 7 teal\./);
  assert.equal(wallOf().rows[6][11], 't');
  const a3 = db.open('paint 13 7 blue', 'alice', { created_at: '2026-10-16T00:30:00Z' });
  r = await go('2026-10-16T00:30:00Z');
  assert.equal(r.code, 0, r.out);
  assert.match(db.comments[a3.number][0].body, /^painted 13 7 blue\./);
  w = wallOf();
  assert.equal(w.count, 4);
  assert.deepEqual(w.last.map((e) => e.login), ['alice', 'bob', null]);
  // the hour lock and the busy window forget what they no longer need
  assert.deepEqual(Object.keys(w.fresh), ['13,7']);

  // the owner's remove takes a name off the wall too (the pixels stay)
  r = await run(work, { ...base, TRIGGER: 'workflow_dispatch', REMOVE_LOGIN: 'alice', NOW: '2026-10-16T00:40:00Z' });
  assert.equal(r.code, 0, r.out);
  w = wallOf();
  assert.deepEqual(w.last.map((e) => e.login), [null, 'bob', null]);
  assert.equal(w.rows[6][12], 'b');
  md = readme();
  assert.doesNotMatch(md, /@alice/);
  assert.match(md, /last painted by someone, \[@bob\]\(https:\/\/github\.com\/bob\) and someone\./);
});
