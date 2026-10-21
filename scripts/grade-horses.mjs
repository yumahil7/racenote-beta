// 레이스노트 말 등급(SS/S/AA/A/B/C) 계산 + 카드 그림용 변형 스펙(art/horses/variants.json)
// 입력: data/kra.json (entries=출마표, detail=경주결과 상세). 실행: node scripts/grade-horses.mjs
// 참고용 요약 등급이며 KRA 공식 등급이 아님. 결과를 보장하지 않음.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';

export const GRADES = ['SS', 'S', 'AA', 'A', 'B', 'C'];
// KRA 등급 문자열 → 군(1 높음 ~ 6). OPEN은 0(1군보다 위)
export function parseClass(rank) {
  const s = String(rank || '');
  if (/OPEN/i.test(s)) return 0;
  const m = s.match(/([1-6])\s*(등급|군)/);
  return m ? +m[1] : null;
}
// 기본 단계(0=SS … 5=C): OPEN→S, 1군→S, 2군→AA, 3군→A, 4군→B, 5·6군→C
const BASE = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 5 };
const num = v => (v === '-' || v === '' || v == null || isNaN(+v)) ? null : +v;

// 과거 이력 로드 (data/history/YYYY.json, cols/rows 압축형)
export function loadHistory(dir = 'data/history') {
  const rows = [];
  if (!existsSync(dir)) return rows;
  for (const f of readdirSync(dir)) if (/^\d{4}\.json$/.test(f)) {
    const o = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); const ix = Object.fromEntries(o.cols.map((c, i) => [c, i]));
    for (const r of o.rows) rows.push({ date: String(r[ix.d]), meet: r[ix.m], rcNo: r[ix.r], rank: r[ix.cls], hrNo: r[ix.hr], ord: r[ix.ord], n: null });
  }
  return rows;
}
export function computeGrades(k, history = []) {
  const E = (k.entries || []).map(e => ({ ...e, rcDate: String(e.rcDate) }));
  const raceCls = {}; // 날짜|경마장|경주번호 → 군
  for (const e of E) { const c = parseClass(e.rank); if (c !== null) raceCls[[e.rcDate, e.meet, e.rcNo].join('|')] = c; }
  const res = {}; // hrNo → [{date,cls,ord,dusu}]
  const dusu = {};
  for (const d of k.detail || []) { const key = [d.rcDate, d.meet, d.rcNo].join('|'); dusu[key] = (dusu[key] || 0) + 1; }
  for (const d of k.detail || []) {
    const key = [String(d.rcDate), d.meet, d.rcNo].join('|'); const ord = num(d.stOrd);
    (res[d.hrNo] = res[d.hrNo] || []).push({ date: String(d.rcDate), cls: raceCls[key] ?? null, ord: ord && ord > 0 ? ord : null, n: dusu[key] });
  }
  // 과거 이력 병합 (같은 경주 중복 제거)
  const fsz = {}; for (const h of history) { const kk = h.date + h.meet + h.rcNo; fsz[kk] = (fsz[kk] || 0) + 1; }
  for (const h of history) {
    const arr = (res[h.hrNo] = res[h.hrNo] || []);
    if (arr.some(x => x.date === h.date)) continue;
    arr.push({ date: h.date, cls: parseClass(h.rank) ?? raceCls[[h.date, h.meet, h.rcNo].join('|')] ?? null, ord: h.ord > 0 ? h.ord : null, n: fsz[h.date + h.meet + h.rcNo] });
  }
  const byH = {};
  for (const e of E) (byH[e.hrNo] = byH[e.hrNo] || []).push(e);
  // 경마장·군별 레이팅 중앙값 (레이팅 강약 판단용)
  const rset = {};
  for (const e of E) { const r = num(e.rating), c = parseClass(e.rank); if (r > 0 && c !== null) (rset[e.meet + c] = rset[e.meet + c] || []).push(r); }
  const med = {}; for (const [kk, a] of Object.entries(rset)) { a.sort((x, y) => x - y); med[kk] = a[a.length >> 1]; }

  const out = {};
  for (const [no, es] of Object.entries(byH)) {
    es.sort((a, b) => b.rcDate.localeCompare(a.rcDate));
    const cur = es[0]; const cls = parseClass(cur.rank); const f = []; let adj = 0;
    if (cls === null) { out[no] = { g: null, cls: null, f: ['등급 정보 없음 — 등급 미산정'] }; continue; }
    let step = BASE[cls];
    // 등급 표기: 국N=국산마 한정, 혼N=국산·외산 혼합, 접두어 없는 1·2등급=통합 상위군(서울·부산 공통), 제N=제주마 체계(제주 안에서만 비교)
    const kind = /^국/.test(cur.rank) ? '국산마 한정' : /^혼/.test(cur.rank) ? '국산·외산 혼합' : /^제/.test(cur.rank) ? '제주 경마 체계' : '통합 상위군';
    f.push(`현재 ${cur.meet} ${cur.rank} (${cls === 0 ? '오픈 경주' : cls + '군'} · ${kind}) → 기본 ${GRADES[step]}`);
    // 1) 승군/강등 추세: 출마표·결과에 기록된 경주 등급 이력 비교
    const hist = [...es.slice(1).map(e => ({ date: e.rcDate, cls: parseClass(e.rank) })), ...(res[no] || [])]
      .filter(h => h.cls !== null && h.date < cur.rcDate).sort((a, b) => b.date.localeCompare(a.date));
    if (hist.length) {
      // 최근 6경주 안의 가장 낮은/높은 군과 비교 (단기 승군·강등)
      const win6 = hist.slice(0, 6).map(h => h.cls); const lo = Math.max(...win6), hi = Math.min(...win6);
      const prev = hist[0].cls !== cls ? hist[0].cls : (lo > cls ? lo : hi < cls ? hi : cls);
      if (prev > cls) { adj += 0.5; f.push(`최근 승군 (${prev || 'OPEN'}군 → ${cls || 'OPEN'}군) +`); }
      else if (prev < cls) { adj -= 0.5; f.push(`최근 강등 (${prev || 'OPEN'}군 → ${cls}군) −`); }
      else f.push(`직전 경주와 같은 군 (추세 유지)`);
    } else f.push('수집 기간 내 이전 등급 기록 없음 — 추세 미반영');
    // 2) 레이팅: 같은 경마장·같은 군 중앙값 대비
    const r = num(cur.rating), m = med[cur.meet + cls];
    if (r > 0 && m) {
      if (r >= m + 8) { adj += 0.5; f.push(`레이팅 ${r} — 같은 군 중앙값 ${m}보다 높음 +`); }
      else if (r <= m - 8) { adj -= 0.5; f.push(`레이팅 ${r} — 같은 군 중앙값 ${m}보다 낮음 −`); }
      else f.push(`레이팅 ${r} — 같은 군 평균 수준`);
    } else f.push('레이팅 정보 없음 — 미반영');
    // 3) 최근 폼: 수집 기간 결과 착순 + 통산 입상률
    const rr = (res[no] || []).filter(x => x.ord && x.date < cur.rcDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (rr.length) {
      const top3 = rr.filter(x => x.ord <= 3).length, win = rr.filter(x => x.ord === 1).length, bad = rr.filter(x => x.n && x.ord > x.n * 0.7).length;
      if (win || top3 >= 2) { adj += 0.5; f.push(`최근 ${rr.length}전 ${win}승 · 3착내 ${top3}회 (호조) +`); }
      else if (bad >= 2 || (rr.length >= 2 && !top3 && bad)) { adj -= 0.5; f.push(`최근 ${rr.length}전 하위권 ${bad}회 (부진) −`); }
      else f.push(`최근 ${rr.length}전 3착내 ${top3}회 (보통)`);
    }
    const allR = (res[no] || []).filter(x => x.ord);
    const n0 = +cur.rcCntT || 0;
    const useHist = allR.length > n0; // 출마표 통산보다 이력이 더 많으면 이력 사용
    const n = useHist ? allR.length : n0, t = useHist ? allR.filter(x => x.ord <= 3).length : (+cur.ord1CntT || 0) + (+cur.ord2CntT || 0) + (+cur.ord3CntT || 0);
    if (n >= 5) {
      const p = t / n;
      if (p >= 0.5) { adj += 0.5; f.push(`통산 ${n}전 3착내 ${Math.round(p * 100)}% (우수) +`); }
      else if (p < 0.1) { adj -= 0.5; f.push(`통산 ${n}전 3착내 ${Math.round(p * 100)}% (낮음) −`); }
      else f.push(`통산 ${n}전 3착내 ${Math.round(p * 100)}%`);
    } else f.push(n ? `통산 ${n}전 — 표본 적음` : '첫 출전(신마) — 성적 미반영');
    // 가감점 합계를 ±1단계로 제한 (0.5 이상이면 한 단계, 반올림)
    const mv = adj >= 1 ? -1 : adj <= -1 ? 1 : 0;
    // SS: 1군/OPEN 말만 오를 수 있음. 1군 아래 말은 최대 S
    let g = Math.min(5, Math.max(cls <= 1 ? 0 : 1, step + mv));
    if (mv) f.push(`가감 합계 ${adj > 0 ? '+' : ''}${adj} → ${mv < 0 ? '한 단계 상향' : '한 단계 하향'}`); else f.push(`가감 합계 ${adj} → 기본 등급 유지`);
    out[no] = { g: GRADES[g], cls, meet: cur.meet, f };
  }
  return out;
}

// 카드 그림용 결정적 변형 스펙 (이미지 생성은 하지 않음)
const hc = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const COATS = ['밤색(bay)', '갈색(dark bay)', '흑갈색(brown)', '적다색(chestnut)', '흑색(black)', '회색(grey)'];
const MARKS = ['없음', '별(star)', '작은 줄(snip)', '긴 줄(stripe)', '넓은 흰 얼굴(blaze)', '별+줄(star & stripe)'];
const ACC = ['메시 귀덮개/플라이마스크', '차안대(블링커)', '반차안대', '쉐도우롤(흙막이 코밴드)', '혀끈', '다리 붕대', '편자 색 포인트'];
const SHOE = ['은색', '금색', '흑색', '청색'];
const TOOLMAP = [[/망사|눈가면/, 0], [/반가지/, 2], [/가지|차안/, 1], [/코|쉐도우/, 3], [/혀끈/, 4], [/붕대|밴디지/, 5], [/편자/, 6]];
export function computeVariants(k, grades) {
  const tool = {}, coat = {};
  for (const d of k.detail || []) if (d.hrTool && d.hrTool !== '-') tool[d.hrNo] = d.hrTool;
  for (const h of k.horses || []) if (h.hrNo && (h.colorNm || h.hrColor || h.mosaek)) coat[h.hrNo] = h.colorNm || h.hrColor || h.mosaek;
  const names = {}; for (const e of k.entries || []) names[e.hrNo] = e.hrName;
  const out = {};
  for (const no of Object.keys(names)) {
    const x = hc(no); const acc = [];
    const t = tool[no] || '';
    for (const [re, i] of TOOLMAP) if (re.test(t) && !acc.includes(i)) acc.push(i);
    if (!acc.length) acc.push(x % ACC.length);
    if (acc.length < 2 && (x >> 4) % 2) { const j = (x >> 6) % ACC.length; if (!acc.includes(j)) acc.push(j); }
    const a = acc.slice(0, 2).map(i => ACC[i]);
    out[no] = { name: names[no], grade: grades[no]?.g || null,
      coat: coat[no] || COATS[(x >> 3) % COATS.length], coatSource: coat[no] ? 'data' : 'hash',
      face: MARKS[(x >> 8) % MARKS.length], accessories: a,
      shoe: a.includes('편자 색 포인트') ? SHOE[(x >> 11) % SHOE.length] : '은색',
      toolFromData: t || null, pose: ['측면 질주', '정면 3/4', '측면 정지'][(x >> 13) % 3] };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync('data/kra.json')) process.exit(0);
  const k = JSON.parse(readFileSync('data/kra.json', 'utf8'));
  const g = computeGrades(k, loadHistory());
  mkdirSync('art/horses', { recursive: true });
  writeFileSync('art/horses/variants.json', JSON.stringify(computeVariants(k, g), null, 1));
  const c = {}; for (const v of Object.values(g)) c[v.g] = (c[v.g] || 0) + 1;
  console.log('grades', c);
}
