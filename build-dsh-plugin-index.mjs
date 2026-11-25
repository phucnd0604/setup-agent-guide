#!/usr/bin/env node
// Sinh file index plugin cho DSH từ profile đang dùng.
//   node build-dsh-plugin-index.mjs [--profile desktop] [--out dsh-plugins-index.json]
// Đọc dependencies của profile, lấy MỌI version đã publish (npm) / commit trên nhánh mặc định (git)
// để DSH luôn đề xuất bản mới nhất mà vẫn còn bản cũ làm fallback.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const profile = arg('profile', 'desktop');
const out = path.resolve(arg('out', 'dsh-plugins-index.json'));
const home = path.join(os.homedir(), '.dsh', 'profiles', profile);
const pkgFile = path.join(home, 'package.json');
const lockFile = path.join(home, 'pnpm-lock.yaml');

const profilePkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const lock = fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : '';
const deps = Object.entries(profilePkg.dependencies || {}).sort(([a], [b]) => a.localeCompare(b));
const pkgDir = (n) => path.join(home, 'node_modules', ...n.split('/'));
const installed = (n) => JSON.parse(fs.readFileSync(path.join(pkgDir(n), 'package.json'), 'utf8'));

const UA = { 'user-agent': 'dsh-plugin-index-builder' };
async function getJSON(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      err = new Error(url + ' -> HTTP ' + r.status);
    } catch (e) { err = e; }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  throw err;
}

const webUrl = (v) => {
  if (!v) return null;
  let s = typeof v === 'string' ? v : v.url;
  if (!s) return null;
  s = s.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https:///').replace(/^git@([^:]+):/, 'https://$1/');
  s = s.replace(/^https?:\/\/\//, 'https://').replace(/\.git$/, '');
  return /^https?:\/\//.test(s) ? s : null;
};

const plugins = [];
let listed = 0;

for (const [name, spec] of deps) {
  let pj;
  try { pj = installed(name); } catch { console.log('skip (not installed):', name); continue; }
  const entry = { name };
  if (pj.description) entry.description = String(pj.description).replace(/\s+/g, ' ').trim();
  if (pj.author) entry.author = typeof pj.author === 'string' ? pj.author : pj.author.name;
  const hp = webUrl(pj.homepage);
  if (hp) entry.homepage = hp;
  const repo = webUrl(pj.repository);
  if (repo) entry.repository = { url: repo };
  entry.versions = [];

  const git = /^github:(?<owner>[^/]+)\/(?<repo>[^#]+)/.exec(spec) || /^(?<owner>[^/:]+)\/(?<repo>[^/#]+)/.exec(spec);
  if (/^(github:|git\+|https?:\/\/.*\.git|git@|[\w.-]+\/[\w.-]+$)/.test(spec) && git) {
    const owner = git.groups.owner;
    const repo = git.groups.repo;
    const url = 'https://github.com/' + owner + '/' + repo;
    const re = new RegExp('codeload\\.github\\.com/' + owner + '/' + repo + '/tar\\.gz/([0-9a-f]{40})');
    const pinned = re.exec(lock)?.[1];
    let head = null;
    try {
      const commits = await getJSON('https://api.github.com/repos/' + owner + '/' + repo + '/commits?per_page=1', 4);
      head = { sha: commits[0].sha, ts: Math.floor(Date.parse(commits[0].commit.committer.date) / 1000) };
    } catch (e) {
      console.log('  WARN head commit unavailable for', owner + '/' + repo, '- dùng commit pinned');
    }
    const shas = [];
    if (head) shas.push(head);
    if (pinned && (!head || pinned !== head.sha)) shas.push({ sha: pinned, ts: null });
    const seenVer = new Set();
    for (const c of shas) {
      const remotePkg = await getJSON('https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + c.sha + '/package.json', 2).catch(() => null);
      if (!remotePkg || !remotePkg.version || seenVer.has(remotePkg.version)) continue;
      let ts = c.ts;
      if (ts == null) {
        const d = await getJSON('https://api.github.com/repos/' + owner + '/' + repo + '/commits/' + c.sha).catch(() => null);
        ts = d ? Math.floor(Date.parse(d.commit.committer.date) / 1000) : Math.floor(Date.now() / 1000);
      }
      seenVer.add(remotePkg.version);
      const v = { version: remotePkg.version, publishTimestamp: ts, source: { type: 'git', url, commit: c.sha } };
      const eng = remotePkg.engines && remotePkg.engines.dsh;
      if (eng) v.engines = { dsh: String(eng) };
      entry.versions.push(v);
      listed++;
    }
    console.log(name.padEnd(32), 'git ', entry.versions.map((v) => v.version + '@' + v.source.commit.slice(0, 7)).join(', ') || 'KHÔNG lấy được');
  } else {
    const doc = await getJSON('https://registry.npmjs.org/' + name.replace('/', '%2F'));
    for (const ver of Object.keys(doc.versions)) {
      const m = doc.versions[ver];
      if (!m || m.deprecated || !(m.dsh && m.dsh.bundle)) continue;
      const v = { version: ver, publishTimestamp: Math.floor(Date.parse(doc.time[ver]) / 1000), source: { type: 'npm' } };
      if (m.engines && m.engines.dsh) v.engines = { dsh: String(m.engines.dsh) };
      entry.versions.push(v);
    }
    listed += entry.versions.length;
    console.log(name.padEnd(32), 'npm', entry.versions.length, 'versions, latest', doc['dist-tags'].latest);
  }
  if (entry.versions.length) plugins.push(entry);
}

const index = {
  format: 1,
  title: { en: 'PhucND — my DSH setup' },
  description: 'DSH plugins from my desktop profile. Every published version is listed, so DSH recommends the newest one it supports.',
  plugins
};
fs.writeFileSync(out, JSON.stringify(index, null, 2) + '\n');
console.log('\nwrote', out, fs.statSync(out).size, 'bytes ·', plugins.length, 'plugins ·', listed, 'versions');