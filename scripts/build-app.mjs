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
  out.jkRecent = J;
  // 기수 우선순위: 마지막 경주일 기준 30일 승수 → 승률 → 기승수 (그림 우선 제작용 art/jockeys/priority.json)
  const last = Object.values(J).flat().map(x => x[0]).sort().pop() || ''; const t = new Date(last.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')); t.setDate(t.getDate() - 29); const from = t.toISOString().slice(0, 10).replaceAll('-', '');
  const nm = {}; for (const e of [...(k.entries || []), ...(k.detail || [])]) nm[e.jkNo] = nm[e.jkNo] || String(e.jkName || '').replace(/^\s*(\([^)]*\)|\[[^\]]*\])\s*/, '');
  out.jkPriority = Object.entries(J).map(([jk, L]) => { const r = L.filter(x => x[0] >= from); const w = r.filter(x => x[4] === 1).length; return { jkNo: jk, name: nm[jk] || null, w, n: r.length, wr: r.length ? +(w / r.length * 100).toFixed(1) : 0 }; })
    .filter(x => x.n > 0).sort((a, b) => b.w - a.w || b.wr - a.wr || b.n - a.n);
  // 기수 소속 경마장: 최근 90일 실제 기승 경마장 최다 → 없으면 KRA 현직기수정보 소속. 표기는 서울/부산경남/제주로 통일
  const NM = m => ({ '1': '서울', '2': '제주', '3': '부산경남', '영남': '부산경남', '부경': '부산경남' })[String(m)] || String(m || '');
  const t90 = new Date(last.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')); t90.setDate(t90.getDate() - 89); const f90 = t90.toISOString().slice(0, 10).replaceAll('-', '');
  const JM = {}; for (const j of k.jockeys || []) if (j.jkNo) JM[j.jkNo] = { m: NM(j.meet), src: 'kra' };
  for (const [jk, L] of Object.entries(J)) { const c = {}; L.filter(x => x[0] >= f90).forEach(x => { const m = NM(x[1]); c[m] = (c[m] || 0) + 1; }); const off = JM[jk]?.m; const top = Object.entries(c).sort((a, b) => b[1] - a[1] || (b[0] === off) - (a[0] === off))[0]; if (top) JM[jk] = { m: top[0], src: 'rides', off: JM[jk]?.m }; }
  out.jkMeet = Object.fromEntries(Object.entries(JM).map(([a, b]) => [a, b.m]));
  mkdirSync('art/jockeys', { recursive: true }); writeFileSync('art/jockeys/priority.json', JSON.stringify(out.jkPriority, null, 1)); }
// 혈통(부·모·외조부·도사지) — 출전마만, 화면 표시용
if (existsSync('data/pedigree.json')) { const P = JSON.parse(readFileSync('data/pedigree.json', 'utf8')).horses || {}; const cur = new Set([...(k.entries || []), ...(k.detail || [])].map(e => String(e.hrNo)));
  out.ped = Object.fromEntries(Object.entries(P).filter(([h]) => cur.has(h)).map(([h, p]) => [h, { sn: p.sn, dn: p.dn, dsn: p.dsn, chef: p.chef, di: p.di, cd: p.cd, dp: p.dp }])); }
// 상승세 말: 최근 승군 또는 등급 가감 합계 + (배너·그림 우선순위용)
{ const R = [];
  for (const [h, g] of Object.entries(out.grades)) { const f = g.f || []; const up = f.find(x => /최근 승군/.test(x)); const tot = +((f.join(' ').match(/가감 합계 ([+-]?[\d.]+)/) || [])[1] || 0);
    const m5 = f.find(x => /최근 5전/.test(x) && /\+$/.test(x));
    if (up || tot >= 1) R.push({ hrNo: h, g: g.g, meet: g.meet, why: up ? up.replace(/^최근 승군 \((.*)\).*$/, '$1 승급') : m5 ? m5.replace(/ \+$/, '') : `등급 가감 +${tot}` , score: (up ? 2 : 0) + tot }); }
  R.sort((a, b) => b.score - a.score || a.hrNo.localeCompare(b.hrNo)); out.rising = R;
  mkdirSync('art/horses', { recursive: true });
  const nm = {}; for (const e of [...(k.entries || []), ...(k.detail || [])]) nm[e.hrNo] = nm[e.hrNo] || String(e.hrName || '').replace(/^\s*(\([^)]*\)|\[[^\]]*\])\s*/, '');
  writeFileSync('art/horses/rising.json', JSON.stringify(R.map(r => ({ ...r, name: nm[r.hrNo] || null })), null, 1)); }
mkdirSync('art/horses', { recursive: true });
writeFileSync('art/horses/variants.json', JSON.stringify(computeVariants(k, out.grades), null, 1));
out.horseArt = existsSync('art/horses') ? (await import('node:fs')).readdirSync('art/horses').filter(f => /^\d+\.webp$/.test(f)).map(f => f.slice(0, -5)) : [];
const s = JSON.stringify(out);
writeFileSync('data/app.json', s);
console.log('app.json', s.length >> 10, 'KB (kra.json', JSON.stringify(k).length >> 10, 'KB)');
