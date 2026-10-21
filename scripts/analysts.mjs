// 레이스노트 예상가 5인(가상 캐릭터) — 공개 데이터로 결정적으로 계산하는 참고용 분석. 적중을 보장하지 않음.
// 입력: kra.json(k) + data/history/*.json. 출력: { personas, races, backtest }
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const num = v => (v === '-' || v === '' || v == null || isNaN(+v)) ? null : +v;
const sec = t => { const s = String(t || ''); const m = s.match(/^(\d+):(\d+(?:\.\d+)?)$/); if (m) return +m[1] * 60 + +m[2]; const x = parseFloat(s); return isNaN(x) || x <= 0 ? null : x; };
export const clean = s => String(s || '').replace(/^\s*(\([^)]*\)|\[[^\]]*\])\s*/, '');
const band = d => d <= 1200 ? '단거리' : d <= 1600 ? '중거리' : '장거리';
const gateB = c => c <= 3 ? '안쪽(1~3)' : c <= 7 ? '중간(4~7)' : '바깥(8~)';
const WET = w => w == null ? null : w >= 15;
export const PERSONAS = [
  { id: 'record', name: '한기록', emoji: '📊', type: '기록파', line: '숫자는 거짓말을 안 해요. 최근 5전 착순과 기록 차이만 봅니다.', look: '30대 남성, 안경·셔츠 소매 걷음, 태블릿을 든 차분한 데이터 분석가' },
  { id: 'distance', name: '서거리', emoji: '📏', type: '거리파', line: '말마다 맞는 거리가 있어요. 이 거리에서 어땠는지가 전부죠.', look: '20대 여성, 미스코리아처럼 우아하고 균형 잡힌 자태·단정한 화이트 정장과 진주 귀걸이·줄자 모양 브로치, 자신감 있는 미소(품위 있게, 비선정적)' },
  { id: 'blood', name: '윤혈통', emoji: '🧬', type: '혈통파', line: '피는 못 속여요. 부마·외조부 자손의 거리별 성적과 도사지 지수로 봐요.', look: '60대 남성, 회색 수염·트위드 조끼·회중시계, 온화한 노신사 목장주' },
  { id: 'track', name: '하늘주로', emoji: '🌦️', type: '환경파', line: '모래 상태, 부담중량, 게이트. 그날의 조건이 승부를 가른다고 믿어요.', look: '20대 후반 여성, 늘씬하고 기품 있는 무대형 자태·세련된 트렌치코트와 투명 우산·바람에 날리는 긴 웨이브 머리, 우아한 감성파(품위 있게, 비선정적)' },
  { id: 'jockey', name: '마준기', emoji: '🏇', type: '기수파', line: '말은 사람이 탑니다. 기수 컨디션과 콤비 호흡을 먼저 봐요.', look: '40대 남성, 전직 기수 느낌의 작은 체구·헬멧을 옆구리에 낀 날카로운 눈매' },
];
const sh = (t3, n, p = 0.25, k = 3) => (t3 + p * k) / (n + k);
function loadHist(dir = 'data/history') {
  const out = []; if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) if (/^\d{4}\.json$/.test(f)) {
    const o = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); const ix = Object.fromEntries(o.cols.map((c, i) => [c, i]));
    for (const r of o.rows) out.push({ d: String(r[ix.d]), m: r[ix.m], r: +r[ix.r], hr: String(r[ix.hr]), ord: num(r[ix.ord]) > 0 ? num(r[ix.ord]) : null, jk: r[ix.jk] ? String(r[ix.jk]) : null, tm: sec(r[ix.tm]), dist: num(r[ix.dist]) });
  }
  return out;
}
export function computeAnalysts(k) {
  const PED = existsSync('data/pedigree.json') ? JSON.parse(readFileSync('data/pedigree.json', 'utf8')).horses || {} : {};
  const attr = {}; // hrNo → {prd,sex}
  for (const e of [...(k.entries || []), ...(k.detail || [])]) { const a = attr[e.hrNo] = attr[e.hrNo] || {}; a.prd = a.prd || e.prd || e.prdCtyNm; a.sex = a.sex || e.sex; }
  for (const a of Object.values(attr)) a.prd = a.prd ? (/한/.test(a.prd) ? '한국' : a.prd) : null;
  const trk = {}; for (const t of k.track || []) trk[[t.rcDate, String(t.meet).replace('경마', ''), t.rcNo].join('|')] = { w: num(t.waterPercent), s: t.track };
  const wt = {}; for (const w of k.weight || []) wt[[w.rcDate, w.meet, w.rcNo, w.chulNo].join('|')] = num(w.wgHrDiff);
  const dist = {}; for (const e of k.entries || []) dist[[e.rcDate, e.meet, e.rcNo].join('|')] = num(e.rcDist);
  // 경주 단위로 묶기: 이력 + 상세결과(게이트·중량·조교사 보강) + 출마표(예정 경주)
  const R = {}; const key = (d, m, r) => [String(d), m, +r].join('|');
  const row = (kk, hr) => { const x = R[kk] = R[kk] || { k: kk, d: kk.split('|')[0], m: kk.split('|')[1], r: {} }; return x.r[hr] = x.r[hr] || { hr }; };
  for (const h of loadHist()) { const o = row(key(h.d, h.m, h.r), h.hr); Object.assign(o, { ord: h.ord, jk: h.jk, tm: h.tm }); R[key(h.d, h.m, h.r)].dist = h.dist; }
  for (const x of k.detail || []) { const kk = key(x.rcDate, x.meet, x.rcNo); const o = row(kk, String(x.hrNo)); const ord = num(x.stOrd);
    Object.assign(o, { ord: ord > 0 ? ord : o.ord ?? null, jk: String(x.jkNo), tr: String(x.trNo), gate: num(x.chulNo), bd: num(x.wgBudam), tm: o.tm ?? sec(x.rcTime), df: wt[[x.rcDate, x.meet, x.rcNo, x.chulNo].join('|')] ?? num(x.df) });
    if (!R[kk].dist && dist[kk]) R[kk].dist = dist[kk]; }
  const pred = new Set();
  for (const e of k.entries || []) { const kk = key(e.rcDate, e.meet, e.rcNo); pred.add(kk); const o = row(kk, String(e.hrNo));
    Object.assign(o, { jk: String(e.jkNo), tr: String(e.trNo), gate: num(e.chulNo), bd: num(e.wgBudam), rt: num(e.rating), nm: clean(e.hrName), df: o.df ?? wt[[e.rcDate, e.meet, e.rcNo, e.chulNo].join('|')] ?? null });
    R[kk].dist = R[kk].dist || num(e.rcDist); }
  const races = Object.values(R).filter(x => x.dist).sort((a, b) => a.d.localeCompare(b.d) || a.k.localeCompare(b.k));
  // 상태(그 날짜 이전 기록만)
  const H = {}, J = {}, JH = {}, JT = {}, CO = {}, GT = {}, CS = {}, CDS = {}, CM = {}; const W = { n: 0, t: 0 };
  const inc = (o, kk, t3) => { const c = o[kk] = o[kk] || { n: 0, t: 0 }; c.n++; c.t += t3; };
  const P = {}; const BT = Object.fromEntries(PERSONAS.map(p => [p.id, { races: 0, axis: 0, picks: 0, base: 0 }]));
  const f1 = x => Math.round(x * 10) / 10, pct = x => Math.round(x * 100) + '%';
  function score(rc, list) {
    const D = rc.dist, tk = trk[rc.k] || null; const n = list.length; const bds = list.map(o => o.bd).filter(x => x != null); const bdAvg = bds.length ? bds.reduce((a, b) => a + b, 0) / bds.length : null;
    const out = {};
    for (const p of PERSONAS) out[p.id] = [];
    for (const o of list) {
      const h = H[o.hr] || []; const last = h.slice(-5); const a = attr[o.hr] || {};
      // 1 기록파
      { let s, why = [];
        if (!last.length) { s = 25; why.push('출전 기록 없음(신마) → 기본 25점'); }
        else { const form = last.reduce((t, x) => t + (x.n > 1 ? 1 - (x.ord - 1) / (x.n - 1) : .5), 0) / last.length; const bh = h.slice(-3).filter(x => x.bh != null); const b = bh.length ? bh.reduce((t, x) => t + x.bh, 0) / bh.length : 2;
          s = 60 * form + 40 * Math.max(0, 1 - b / 3); why.push(`최근 ${last.length}전 착순(과거→최근) ${last.map(x => x.ord).join("-")} (상대순위 ${pct(form)})`, `최근 ${bh.length}전 1착과 평균 ${f1(b)}초/1000m 차`); }
        out.record.push([o, s, why]); }
      // 2 거리파
      { const at = h.filter(x => Math.abs(x.dist - D) <= 100); const t3 = at.filter(x => x.ord <= 3).length; const r = sh(t3, at.length); const bb = at.filter(x => x.bh != null).map(x => x.bh); const best = bb.length ? Math.min(...bb) : null;
        const s = 70 * Math.min(1, r / .6) + 30 * (best == null ? .3 : Math.max(0, 1 - best / 3));
        out.distance.push([o, s, [`${D}m(±100m) ${at.length}전 3착내 ${t3}회 → 보정 ${pct(r)}`, best == null ? '이 거리 기록 없음' : `이 거리 최고 1착과 ${f1(best)}초/1000m 차`]]); }
      // 3 혈통파: 부마 자손의 거리대 성적, 외조부(모마의 부) 자손 성적, 모마 자손(형제마) 성적, 도사지 CD와 거리 적합도
      { const pd = PED[o.hr]; const base = W.n ? W.t / W.n : .25; const why = []; let s;
        if (pd && (pd.s || pd.d)) {
          const B = band(D); const sc = pd.s ? CS[pd.s + '|' + B] : null, dc = pd.ds ? CDS[pd.ds + '|' + B] : null, mc = pd.d ? CM[pd.d] : null;
          const sr = sc ? sh(sc.t, sc.n, base, 20) : base, dr = dc ? sh(dc.t, dc.n, base, 20) : base, mr = mc ? sh(mc.t, mc.n, base, 8) : base;
          const hasDos = pd.dp && pd.dp.some(x => x > 0); const ideal = D <= 1200 ? 1 : D <= 1600 ? .5 : 0; const fit = hasDos && pd.cd != null ? Math.max(0, 1 - Math.abs(pd.cd - ideal) / 1.5) : .5;
          s = 40 * Math.min(1, sr / .45) + 20 * Math.min(1, dr / .45) + 20 * Math.min(1, mr / .45) + 20 * fit;
          why.push(`부마 ${pd.sn || '-'} 자손 ${B} ${sc ? `${sc.n}전 3착내 ${pct(sc.t / sc.n)}` : '기록 없음'} → 보정 ${pct(sr)}`,
            `외조부 ${pd.dsn || '-'} 자손 ${B} ${dc ? `${dc.n}전 3착내 ${pct(dc.t / dc.n)}` : '기록 없음'}`,
            `모마 ${pd.dn || '-'} 자손 ${mc ? `${mc.n}전 3착내 ${pct(mc.t / mc.n)}` : '기록 없음'}`,
            hasDos && pd.cd != null ? `도사지 CD ${pd.cd} · DI ${pd.di ?? '-'} → ${D}m 적합도 ${pct(fit)}` : '도사지 정보 없음(중립)');
        } else {
          const a2 = attr[o.hr] || {}; const ck = [a2.prd, a2.sex, band(D)].join('|'); const c = a2.prd ? CO[ck] : null; const r = c ? sh(c.t, c.n, base, 20) : null;
          s = (r == null ? 40 : 70 * Math.min(1, r / .45)) + 30 * ((o.rt ?? 20) / 100);
          why.push('혈통 정보 아직 미수집 → 산지·성별 계통으로 대체', c ? `${a2.prd}·${a2.sex}·${band(D)} ${c.n}전 3착내율 ${pct(c.t / c.n)}` : '계통 통계 없음');
        }
        out.blood.push([o, s, why]); }
      // 4 환경파
      { let s = 50, why = [], used = 0;
        if (o.bd != null && bdAvg != null) { s += (bdAvg - o.bd) * 3; used++; why.push(`부담중량 ${o.bd}kg (출전마 평균 ${f1(bdAvg)}kg)`); } else why.push('부담중량 정보 없음');
        if (o.gate != null) { const g = GT[[rc.m, band(D), gateB(o.gate)].join('|')]; if (g && g.n >= 20) { s += (g.t / g.n - .25) * 80; used++; why.push(`${rc.m} ${band(D)} ${gateB(o.gate)} 게이트 3착내율 ${pct(g.t / g.n)} (${g.n}전)`); } else why.push(`게이트 ${o.gate}번 — 경향 표본 부족`); }
        const wet = WET(tk?.w); if (wet != null) { const hw = h.filter(x => x.wet === wet); used++; if (hw.length) { const r = sh(hw.filter(x => x.ord <= 3).length, hw.length); s += (r - .25) * 60; why.push(`오늘 주로 ${tk.s}(함수율 ${tk.w}%) · 비슷한 주로 ${hw.length}전 3착내율 ${pct(r)}`); } else why.push(`오늘 주로 ${tk.s}(함수율 ${tk.w}%) · 비슷한 주로 기록 없음`); } else why.push('주로 상태 미발표');
        if (o.df != null && Math.abs(o.df) >= 10) { s -= 8; why.push(`마체중 변화 ${o.df > 0 ? '+' : ''}${o.df}kg (±10 이상 감점)`); }
        out.track.push([o, used ? s : null, why]); }
      // 5 기수파
      { const j = (J[o.jk] || []); const j100 = j.slice(-100), j10 = j.slice(-10); const jr = sh(j100.filter(x => x <= 3).length, j100.length); const jc = j10.length >= 5 ? j10.filter(x => x <= 3).length / j10.length : null;
        const cb = JH[o.jk + '|' + o.hr]; const jt = o.tr ? JT[o.jk + '|' + o.tr] : null;
        const s = 50 * Math.min(1, jr / .5) + 20 * (jc ?? .25) / .5 + 20 * (cb ? sh(cb.t, cb.n) / .5 : .4) + 10 * (jt && jt.n >= 3 ? jt.t / jt.n / .5 : .4);
        out.jockey.push([o, s, [`기수 최근 ${j100.length}기승 3착내 보정 ${pct(jr)}`, jc == null ? '최근 10기승 표본 부족' : `최근 10기승 3착내 ${pct(jc)} (컨디션)`, cb ? `이 말과 ${cb.n}전 3착내 ${cb.t}회` : '이 말과 첫 호흡', jt && jt.n >= 3 ? `조교사 콤비 ${jt.n}전 3착내 ${jt.t}회` : '조교사 콤비 표본 부족(최근 1개월 자료만)']]); }
    }
    return out;
  }
  for (let i = 0; i < races.length;) {
    const d = races[i].d; const day = []; while (i < races.length && races[i].d === d) day.push(races[i++]);
    for (const rc of day) {
      const list = Object.values(rc.r); if (list.length < 4) continue;
      const done = list.every(o => o.ord != null); const live = pred.has(rc.k);
      if (!done && !live) continue;
      const sc = score(rc, list);
      for (const p of PERSONAS) {
        const arr = sc[p.id].filter(x => x[1] != null).sort((a, b) => b[1] - a[1] || (b[0].rt ?? 0) - (a[0].rt ?? 0) || a[0].hr.localeCompare(b[0].hr)).slice(0, 3);
        if (arr.length < 3) continue;
        if (live) (P[rc.k] = P[rc.k] || {})[p.id] = arr.map(([o, s, w]) => [o.hr, Math.round(s), w]);
        if (done && d >= '20210101') { const b = BT[p.id]; b.races++; b.axis += arr[0][0].ord <= 3; b.picks += arr.filter(x => x[0].ord <= 3).length; b.base += Math.min(3, list.length) / list.length; }
      }
    }
    // 그날 결과 반영
    for (const rc of day) {
      const list = Object.values(rc.r).filter(o => o.ord != null); if (!list.length) continue; const n = list.length;
      const wtm = Math.min(...list.map(o => o.tm).filter(Boolean)); const wet = WET(trk[rc.k]?.w);
      for (const o of list) { const t3 = o.ord <= 3 ? 1 : 0;
        (H[o.hr] = H[o.hr] || []).push({ ord: o.ord, n, dist: rc.dist, bh: o.tm && isFinite(wtm) ? Math.min(5, (o.tm - wtm) / rc.dist * 1000) : null, wet });
        if (o.jk) { (J[o.jk] = J[o.jk] || []).push(o.ord); if (J[o.jk].length > 200) J[o.jk].shift(); inc(JH, o.jk + '|' + o.hr, t3); if (o.tr) inc(JT, o.jk + '|' + o.tr, t3); }
        const a = attr[o.hr]; if (a && a.prd) { inc(CO, [a.prd, a.sex, band(rc.dist)].join('|'), t3); W.n++; W.t += t3; }
        const pd = PED[o.hr]; if (pd) { if (pd.s) inc(CS, pd.s + '|' + band(rc.dist), t3); if (pd.ds) inc(CDS, pd.ds + '|' + band(rc.dist), t3); if (pd.d) inc(CM, pd.d, t3); }
        if (o.gate != null) inc(GT, [rc.m, band(rc.dist), gateB(o.gate)].join('|'), t3);
      }
    }
  }
  const backtest = Object.fromEntries(Object.entries(BT).map(([id, b]) => [id, { races: b.races, axisTop3: b.races ? +(b.axis / b.races * 100).toFixed(1) : null, picksTop3: b.races ? +(b.picks / b.races / 3 * 100).toFixed(1) : null, random: b.races ? +(b.base / b.races * 100).toFixed(1) : null }]));
  return { personas: PERSONAS, races: P, backtest, from: '2021-01-01', note: '참고용 분석이며 적중을 보장하지 않습니다' };
}
