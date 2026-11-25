#!/usr/bin/env node
// Sinh plugin index (format 1) cho DSH từ dsh-plugins.json (danh sách setup của bạn).
//
//   node build-dsh-plugin-index.mjs                    # đọc dsh-plugins.json → dsh-plugins-index.json
//   node build-dsh-plugin-index.mjs --refresh-manifest # đồng bộ lại danh sách từ profile đang cài
//   node build-dsh-plugin-index.mjs --manifest other.json --out other-index.json
//
// Muốn bỏ một plugin khỏi danh sách setup: xoá dòng của nó trong dsh-plugins.json rồi chạy lại
// (plugin vẫn cài trên máy — danh sách index độc lập với máy).
// Plugin git: "github:owner/repo" = commit HEAD; "github:owner/repo#<sha40>" = ghim commit.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const profile = arg('profile', 'desktop');
const manifestIn = arg('manifest', null);
const manifestPath = manifestIn || arg('manifest-out', 'dsh-plugins.json');
const out = arg('out', 'dsh-plugins-index.json');
const refreshManifest = args.includes('--refresh-manifest');

const UA = { 'user-agent': 'dsh-plugin-index-builder' };
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (token) UA.authorization = 'Bearer ' + token;

async function getJSON(url, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      err = new Error(url + ' -> HTTP ' + r.status);
    } catch (e) { err = e; }
    await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
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

const gitPin = (spec) => { const m = /#([0-9a-f]{40})$/.exec(spec); return m ? m[1] : null; };

const githubRepo = (spec) => {
  const m = /^github:([^/#]+)\/([^/#]+)/.exec(spec)
    || /^git\+https:\/\/github\.com\/([^/#]+)\/([^/#]+)/.exec(spec)
    || /^https:\/\/github\.com\/([^/#]+)\/([^/#]+)/.exec(spec)
    || /^([\w.-]+)\/([\w.-]+)$/.exec(spec);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
};

const readManifest = (p) => {
  const doc = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  return doc.dependencies || doc;
};

const profileDeps = () => {
  const pkgFile = path.join(os.homedir(), '.dsh', 'profiles', profile, 'package.json');
  return JSON.parse(fs.readFileSync(pkgFile, 'utf8')).dependencies || {};
};

const describe = (pj, entry) => {
  if (pj.description) entry.description = String(pj.description).replace(/\s+/g, ' ').trim();
  if (pj.author) entry.author = typeof pj.author === 'string' ? pj.author : pj.author.name;
  const hp = webUrl(pj.homepage);
  if (hp) entry.homepage = hp;
  const repo = webUrl(pj.repository);
  if (repo) entry.repository = { url: repo };
};

let deps;
let writeManifest = false;
if (manifestIn) {
  deps = readManifest(manifestIn);
} else if (refreshManifest || !fs.existsSync(manifestPath)) {
  deps = profileDeps();
  writeManifest = true;
  console.log('danh sách lấy từ profile', profile);
} else {
  deps = readManifest(manifestPath);
  console.log('danh sách đọc từ', manifestPath);
}

const buildEntry = async (name, spec) => {
  const entry = { name };
  const gh = githubRepo(spec);

  if (gh) {
    const url = 'https://github.com/' + gh.owner + '/' + gh.repo;
    const pin = gitPin(spec);
    const commits = pin
      ? [await getJSON('https://api.github.com/repos/' + gh.owner + '/' + gh.repo + '/commits/' + pin)]
      : await getJSON('https://api.github.com/repos/' + gh.owner + '/' + gh.repo + '/commits?per_page=1');
    if (!commits || !commits[0]) { console.log('skip (repo/commit not found):', name); return null; }
    const c = commits[0];
    const pj = await getJSON('https://raw.githubusercontent.com/' + gh.owner + '/' + gh.repo + '/' + c.sha + '/package.json');
    if (!pj || !pj.version) { console.log('skip (no package.json):', name); return null; }
    describe(pj, entry);
    const v = { version: pj.version, publishTimestamp: Math.floor(Date.parse(c.commit.committer.date) / 1000), source: { type: 'git', url, commit: c.sha } };
    if (pj.engines && pj.engines.dsh) v.engines = { dsh: String(pj.engines.dsh) };
    entry.versions = [v];
    console.log(name.padEnd(32), 'git ', pj.version + '@' + c.sha.slice(0, 7));
    return entry;
  }

  const doc = await getJSON('https://registry.npmjs.org/' + name.replace('/', '%2F'));
  if (!doc) { console.log('skip (not on npm):', name); return null; }
  describe(doc.versions[doc['dist-tags'].latest] || {}, entry);
  entry.versions = [];
  for (const ver of Object.keys(doc.versions)) {
    const m = doc.versions[ver];
    if (!m || m.deprecated || !(m.dsh && m.dsh.bundle)) continue;
    const v = { version: ver, publishTimestamp: Math.floor(Date.parse(doc.time[ver]) / 1000), source: { type: 'npm' } };
    if (m.engines && m.engines.dsh) v.engines = { dsh: String(m.engines.dsh) };
    entry.versions.push(v);
  }
  if (!entry.versions.length) { console.log('skip (no dsh.bundle versions):', name); return null; }
  console.log(name.padEnd(32), 'npm ', String(entry.versions.length).padStart(3), 'versions, latest', doc['dist-tags'].latest);
  return entry;
};

// Index cũ (nếu có) dùng làm fallback khi một nguồn lỗi, để workflow vẫn chạy tiếp.
let prevByName = new Map();
try {
  const prev = JSON.parse(fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, ''));
  prevByName = new Map((prev.plugins || []).map((p) => [p.name, p]));
} catch { /* chưa có index */ }

const plugins = [];
let listed = 0;

for (const [name, spec] of Object.entries(deps).sort(([x], [y]) => x.localeCompare(y))) {
  if (/^(link:|file:|workspace:|\.|\/)/.test(spec)) { console.log('skip (local spec):', name); continue; }
  try {
    const entry = await buildEntry(name, spec);
    if (!entry) continue;
    plugins.push(entry);
    listed += entry.versions.length;
  } catch (error) {
    const old = prevByName.get(name);
    console.log('WARN', name, '-', error.message, old ? '→ dùng lại entry cũ' : '→ bỏ qua');
    if (old) { plugins.push(old); listed += old.versions.length; }
  }
}

const index = {
  format: 1,
  title: { en: 'PhucND — my DSH setup' },
  description: 'DSH plugins from my desktop profile. Every published version is listed, so DSH recommends the newest one it supports.',
  plugins
};
fs.writeFileSync(out, JSON.stringify(index, null, 2) + '\n');
console.log('\nwrote', out, fs.statSync(out).size, 'bytes ·', plugins.length, 'plugins ·', listed, 'versions');

if (writeManifest) {
  const manifest = { dependencies: Object.fromEntries(Object.entries(deps).sort(([x], [y]) => x.localeCompare(y))) };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('wrote', manifestPath, '(danh sách plugin — sửa file này để thêm/bớt)');
}