#!/usr/bin/env node
// Sinh plugin index (format 1) cho DSH từ danh sách plugin đang cài.
//
//   node build-dsh-plugin-index.mjs                          # máy local: đọc profile DSH, ghi cả manifest + index
//   node build-dsh-plugin-index.mjs --manifest dsh-plugins.json   # CI: chỉ đọc manifest (không cần profile)
//
// Options: --profile <name> (default desktop) · --out <file> · --manifest <file> · --manifest-out <file>
// Mọi version đã publish đều được liệt kê kèm engines.dsh, nên DSH luôn đề xuất bản mới nhất tương thích.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const profile = arg('profile', 'desktop');
const manifestIn = arg('manifest', null);
const manifestOut = manifestIn || arg('manifest-out', 'dsh-plugins.json');
const out = arg('out', 'dsh-plugins-index.json');

const UA = { 'user-agent': 'dsh-plugin-index-builder' };
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (token) UA.authorization = 'Bearer ' + token;

async function getJSON(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      err = new Error(url + ' -> HTTP ' + r.status);
    } catch (e) { err = e; }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
  throw err;
}

const webUrl = (v) => {
  if (!v) return null;
  let s = typeof v === 'string' ? v : v.url;
  if (!s) return null;
  s = s.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https:///').replace(/^git@([^:]+):/, 'https://$1/');
  s = s.replace(/^https?:\/\/\//, 'https://').replace(/\.git$/, '');
  return /^https?:\/\//.test(s) ? s.replace(/^http:\/\//, 'https://') : null;
};

const githubRepo = (spec) => {
  const m = /^github:([^/#]+)\/([^/#]+)/.exec(spec)
    || /^git\+https:\/\/github\.com\/([^/#]+)\/([^/#]+)/.exec(spec)
    || /^https:\/\/github\.com\/([^/#]+)\/([^/#]+)/.exec(spec)
    || /^([\w.-]+)\/([\w.-]+)$/.exec(spec);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
};

function loadDeps() {
  if (manifestIn) {
    const doc = JSON.parse(fs.readFileSync(manifestIn, 'utf8'));
    return doc.dependencies || doc;
  }
  const pkgFile = path.join(os.homedir(), '.dsh', 'profiles', profile, 'package.json');
  return JSON.parse(fs.readFileSync(pkgFile, 'utf8')).dependencies || {};
}

const describe = (pj, entry) => {
  if (pj.description) entry.description = String(pj.description).replace(/\s+/g, ' ').trim();
  if (pj.author) entry.author = typeof pj.author === 'string' ? pj.author : pj.author.name;
  const hp = webUrl(pj.homepage);
  if (hp) entry.homepage = hp;
  const repo = webUrl(pj.repository);
  if (repo) entry.repository = { url: repo };
};

const deps = loadDeps();
const plugins = [];
let listed = 0;

for (const [name, spec] of Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))) {
  if (/^(link:|file:|workspace:|\.|\/)/.test(spec)) { console.log('skip (local spec):', name); continue; }
  const entry = { name };
  const gh = githubRepo(spec);

  if (gh) {
    const url = 'https://github.com/' + gh.owner + '/' + gh.repo;
    const commits = await getJSON('https://api.github.com/repos/' + gh.owner + '/' + gh.repo + '/commits?per_page=1');
    if (!commits) { console.log('skip (repo not found):', name); continue; }
    const c = commits[0];
    const pj = await getJSON('https://raw.githubusercontent.com/' + gh.owner + '/' + gh.repo + '/' + c.sha + '/package.json');
    if (!pj || !pj.version) { console.log('skip (no package.json):', name); continue; }
    describe(pj, entry);
    const v = { version: pj.version, publishTimestamp: Math.floor(Date.parse(c.commit.committer.date) / 1000), source: { type: 'git', url, commit: c.sha } };
    if (pj.engines && pj.engines.dsh) v.engines = { dsh: String(pj.engines.dsh) };
    entry.versions = [v];
    listed++;
    console.log(name.padEnd(32), 'git ', pj.version + '@' + c.sha.slice(0, 7));
  } else {
    const doc = await getJSON('https://registry.npmjs.org/' + name.replace('/', '%2F'));
    if (!doc) { console.log('skip (not on npm):', name); continue; }
    describe(doc.versions[doc['dist-tags'].latest] || {}, entry);
    entry.versions = [];
    for (const ver of Object.keys(doc.versions)) {
      const m = doc.versions[ver];
      if (!m || m.deprecated || !(m.dsh && m.dsh.bundle)) continue;
      const v = { version: ver, publishTimestamp: Math.floor(Date.parse(doc.time[ver]) / 1000), source: { type: 'npm' } };
      if (m.engines && m.engines.dsh) v.engines = { dsh: String(m.engines.dsh) };
      entry.versions.push(v);
    }
    if (!entry.versions.length) { console.log('skip (no dsh.bundle versions):', name); continue; }
    listed += entry.versions.length;
    console.log(name.padEnd(32), 'npm ', String(entry.versions.length).padStart(3), 'versions, latest', doc['dist-tags'].latest);
  }
  plugins.push(entry);
}

const index = {
  format: 1,
  title: { en: 'PhucND — my DSH setup' },
  description: 'DSH plugins from my desktop profile. Every published version is listed, so DSH recommends the newest one it supports.',
  plugins
};
fs.writeFileSync(out, JSON.stringify(index, null, 2) + '\n');
console.log('\nwrote', out, fs.statSync(out).size, 'bytes ·', plugins.length, 'plugins ·', listed, 'versions');

const manifest = { dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))) };
if (!manifestIn) {
  fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n');
  console.log('wrote', manifestOut, '(danh sách plugin — CI đọc file này)');
}
