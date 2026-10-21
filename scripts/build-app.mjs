// data/kra.json → data/app.json : 같은 내용을 열(column) 형식으로 압축 (키 반복 제거)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { computeAnalysts } from './analysts.mjs';
import { computeGrades, computeVariants, loadHistory } from './grade-horses.mjs';
if (!existsSync('data/kra.json')) process.exit(0);
const k = JSON.parse(readFileSync('data/kra.json', 'utf8'));
const out = { _fmt: 'cols1' };
for (const [key, v] of Object.entries(k)) {
  if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
    const cols = [...new Set(v.flatMap(o => Object.keys(o)))];
    out[key] = { cols, rows: v.map(o => cols.map(c => o[c] ?? null)) };
  } else out[key] = v;
}
// 말 등급(SS~C) — 참고용 요약, KRA 공식 등급 아님
out.grades = computeGrades(k, loadHistory());
// 예상가 5인(가상 캐릭터) — 참고용, 적중 보장 없음
out.analysts = computeAnalysts(k);
// 기수별 최근 기승(과거 이력 data/history, 최신 60건) — 기수 프로필 '최근 30일' 대체용
{ const J = {}; const dir = 'data/history'; const fs = await import('node:fs');
  for (const f of fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)).sort().slice(-2)) { const o = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')); const ix = Object.fromEntries(o.cols.map((c, i) => [c, i]));
    for (const r of o.rows) { const jk = r[ix.jk]; if (!jk) continue; (J[jk] = J[jk] || []).push([String(r[ix.d]), r[ix.m], +r[ix.r], String(r[ix.nm] || '').replace(/^\s*(\([^)]*\)|\[[^\]]*\])\s*/, ''), +r[ix.ord] || 0]); } }
  for (const k in J) J[k] = J[k].sort((a, b) => b[0].localeCompare(a[0]) || b[2] - a[2]).slice(0, 60);
  out.jkRecent = J; }
mkdirSync('art/horses', { recursive: true });
writeFileSync('art/horses/variants.json', JSON.stringify(computeVariants(k, out.grades), null, 1));
const s = JSON.stringify(out);
writeFileSync('data/app.json', s);
console.log('app.json', s.length >> 10, 'KB (kra.json', JSON.stringify(k).length >> 10, 'KB)');
