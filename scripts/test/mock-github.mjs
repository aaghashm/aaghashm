// a tiny fake of the github rest api + avatar cdn, enough for reconcile.mjs. tests only.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const PNG = (n = 600) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), Buffer.alloc(n, 7)]);

export function mockGithub({ repo = 'aaghashm/aaghashm', owner = 'aaghashm' } = {}) {
  const db = {
    issues: [], users: {}, comments: {}, labels: new Set(), avatars: {}, calls: [], fail: { comment: new Set(), create: false },
    repos: JSON.parse(readFileSync(join(FIX, 'repos.json'), 'utf8')),
    commits: JSON.parse(readFileSync(join(FIX, 'commits.json'), 'utf8')),
  };
  let nextNum = 1, nextId = 1000;
  db.user = (login, o = {}) => {
    db.users[login.toLowerCase()] = { login, id: nextId++, type: 'User', created_at: '2019-01-01T00:00:00Z', public_repos: 2, followers: 1, ...o };
    return db.users[login.toLowerCase()];
  };
  db.open = (title, login, o = {}) => {
    const u = db.users[login.toLowerCase()] || db.user(login);
    const is = { number: nextNum++, title, body: o.body ?? 'just press submit.', user: { login: u.login, id: u.id, type: o.type || u.type }, state: 'open', locked: false, labels: [], state_reason: null, ...(o.created_at ? { created_at: o.created_at } : {}), ...(o.pr ? { pull_request: {} } : {}) };
    db.issues.push(is);
    return is;
  };
  db.issue = (n) => db.issues.find((i) => i.number === n);

  const server = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const url = new URL(req.url, 'http://x');
    const p = url.pathname, m = req.method;
    db.calls.push(`${m} ${p}`);
    const send = (code, data, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };
    const json = body ? JSON.parse(body) : null;
    let r;
    if ((r = p.match(/^\/u\/(\d+)$/))) {
      const a = db.avatars[r[1]];
      if (!a) return send(200, PNG(), 'image/png');
      return send(200, a.buf, a.type);
    }
    if (m === 'GET' && p === `/repos/${repo}/issues`) {
      const per = +url.searchParams.get('per_page') || 30, page = +url.searchParams.get('page') || 1;
      const open = db.issues.filter((i) => i.state === 'open').sort((a, b) => a.number - b.number).slice((page - 1) * per, page * per);
      return send(200, open);
    }
    if (m === 'POST' && p === `/repos/${repo}/issues`) {
      if (db.fail.create) return send(502, { message: 'bad gateway' });
      const is = { number: nextNum++, title: json.title, body: json.body, user: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' }, state: 'open', locked: false, labels: [], state_reason: null };
      db.issues.push(is);
      return send(201, is);
    }
    if (m === 'GET' && (r = p.match(/^\/users\/([^/]+)$/))) {
      const u = db.users[decodeURIComponent(r[1]).toLowerCase()];
      return u ? send(200, u) : send(404, { message: 'Not Found' });
    }
    if (m === 'GET' && p === `/users/${owner}/repos`) return send(200, +url.searchParams.get('page') > 1 ? [] : db.repos);
    if (m === 'GET' && p === `/repos/${owner}/persistent-stopwatch/commits`) {
      const since = url.searchParams.get('since');
      return send(200, +url.searchParams.get('page') > 1 ? [] : db.commits.filter((c) => c.commit.author.date >= since));
    }
    if (m === 'GET' && (r = p.match(new RegExp(`^/repos/${repo}/labels/(\\w+)$`)))) return db.labels.has(r[1]) ? send(200, { name: r[1] }) : send(404, {});
    if (m === 'POST' && p === `/repos/${repo}/labels`) { db.labels.add(json.name); return send(201, json); }
    if ((r = p.match(new RegExp(`^/repos/${repo}/issues/(\\d+)(/\\w+)?$`)))) {
      const is = db.issue(+r[1]);
      if (!is) return send(404, {});
      const sub = r[2];
      if (sub === '/comments' && m === 'GET') return send(200, db.comments[is.number] || []);
      if (sub === '/comments' && m === 'POST') {
        if (db.fail.comment.has(is.number)) { db.fail.comment.delete(is.number); return send(502, { message: 'bad gateway' }); }
        (db.comments[is.number] ||= []).push({ user: { login: 'github-actions[bot]', type: 'Bot' }, body: json.body });
        return send(201, {});
      }
      if (sub === '/labels' && m === 'POST') { is.labels.push(...json.labels); return send(200, []); }
      if (sub === '/lock' && m === 'PUT') { is.locked = json.lock_reason; return send(204, ''); }
      if (!sub && m === 'PATCH') { Object.assign(is, json); return send(200, is); }
    }
    send(404, { message: 'mock: no route ' + m + ' ' + p });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ db, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
