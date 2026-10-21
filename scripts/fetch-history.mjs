// 레이스노트: 과거 경주 이력 백필 (GitHub Actions workflow_dispatch 전용)
// 실행: KRA_API_KEY=... START=20241001 END=20261018 node scripts/fetch-history.mjs
// 키는 절대 출력·저장하지 않는다. 배당·매출 필드는 저장하지 않는다(필요 필드만 저장).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const KEY = process.env.KRA_API_KEY;
if (!KEY) { console.error('KRA_API_KEY 없음'); process.exit(1); }
const B = 'https://apis.data.go.kr/B551015/';
const mask = s => String(s).split(KEY).join('***').split(encodeURIComponent(KEY)).join('***');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DELAY = +(process.env.DELAY_MS || 250);
let calls = 0, fails = 0;
async function call(path, params, rows = 1000) {
  const q = new URLSearchParams({ pageNo: '1', numOfRows: String(rows), _type: 'json', ...params });
  const keyPart = KEY.includes('%') ? KEY : encodeURIComponent(KEY);
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(DELAY * (attempt ? 8 * attempt : 1)); calls++;
    try {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 30000);
      const r = await fetch(`${B}${path}?serviceKey=${keyPart}&${q}`, { signal: ac.signal }); clearTimeout(to);
      const t = await r.text();
      if (r.status === 429 || r.status >= 500) continue;
      if (!t.trim().startsWith('{')) {
        const code = (t.match(/<returnReasonCode>([^<]*)/) || t.match(/<resultCode>([^<]*)/) || [])[1];
        if (code === '22') { console.error('일일 호출 한도 초과(22) — 중단'); return { stop: true, items: [] }; }
        if (/LIMITED|초과/.test(t)) continue;
        return { err: `HTTP${r.status} ${mask(t.slice(0, 80)).replace(/\s+/g, ' ')}`, items: [] };
      }
      const j = JSON.parse(t); const h = j.response?.header || {}; const b = j.response?.body || {};
      if (h.resultCode && !['00', '0', '03'].includes(String(h.resultCode))) return { err: `${h.resultCode} ${mask(h.resultMsg || '')}`, items: [] };
      const it = b.items?.item ?? b.items; const items = Array.isArray(it) ? it : it && typeof it === 'object' ? [it] : [];
      return { items, total: +b.totalCount || items.length };
    } catch (e) { /* 재시도 */ }
  }
  fails++; return { err: 'retry-exhausted', items: [] };
}
async function all(path, params) {
  const out = [];
  for (let p = 1; p <= 5; p++) { const r = await call(path, { ...params, pageNo: String(p) }); if (r.stop) return { stop: true, out }; if (r.err) return { err: r.err, out }; out.push(...r.items); if (r.items.length < 1000) break; }
  return { out };
}
const toD = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '');
const kstToday = ymd(new Date(Date.now() + 9 * 36e5));
const END = process.env.END || ymd(new Date(toD(kstToday).getTime() - 864e5));
const START = process.env.START || String(+END.slice(0, 4) - 2) + END.slice(4);
const MEETS = { '1': '서울', '2': '제주', '3': '부산경남' };
const COLS = ['d', 'm', 'r', 'cls', 'hr', 'nm', 'ord', 'rt', 'tool', 'jk', 'tm', 'dist'];
mkdirSync('data/history', { recursive: true });
const years = {};
const load = y => years[y] ||= existsSync(`data/history/${y}.json`) ? JSON.parse(readFileSync(`data/history/${y}.json`, 'utf8')) : { cols: COLS, rows: [] };
const save = () => { for (const [y, o] of Object.entries(years)) { const seen = new Set(); o.rows = o.rows.filter(r => { const k = r[0] + r[1] + r[2] + r[4]; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]) || a[2] - b[2]); const s = JSON.stringify(o); if (s.includes(KEY)) { console.error('키 포함 감지 — 저장 중단'); process.exit(2); } writeFileSync(`data/history/${y}.json`, s); } };

// 출마표가 과거 날짜를 지원하는지 먼저 확인
let entryParam = null;
for (const p of ['rc_date', 'rc_month']) {
  const probeDate = ymd(new Date(toD(END).getTime() - 60 * 864e5)); // 약 2달 전 주말
  const r = await call('API26_2/entrySheet_2', { meet: '1', [p]: p === 'rc_date' ? probeDate : probeDate.slice(0, 6), numOfRows: '50' }, 50);
  const ds = [...new Set(r.items.map(i => String(i.rcDate)))];
  console.log(`출마표 과거 조회 ${p}: ${r.err || r.items.length + '건'} 날짜=${ds.slice(0, 4).join(',')}`);
  if (r.items.length && ds.some(d => d.slice(0, 6) === probeDate.slice(0, 6))) { entryParam = p; break; }
}
console.log('출마표 과거 조회 방식:', entryParam || '미지원 — 등급(cls)은 비어 있을 수 있음');

const entryCache = {}; // month|meet → rows (rc_month 방식)
let emptyStreak = 0, stopped = false, oldest = null, rowsAdded = 0;
for (let t = toD(END).getTime(); t >= toD(START).getTime() && !stopped; t -= 864e5) {
  const d = new Date(t); const dow = d.getUTCDay(); if (![5, 6, 0].includes(dow)) continue;
  const date = ymd(d); let dayRows = 0;
  for (const [meet, mname] of Object.entries(MEETS)) {
    const det = await all('racedetailresult/getracedetailresult', { meet, rc_date: date });
    if (det.stop) { stopped = true; break; }
    if (det.err) console.log(date, meet, 'detail 오류', det.err);
    if (!det.out.length) continue;
    let cls = {}, dist = {};
    if (entryParam) {
      const ck = entryParam === 'rc_date' ? date + meet : date.slice(0, 6) + meet;
      if (!entryCache[ck]) { const en = await all('API26_2/entrySheet_2', { meet, [entryParam]: entryParam === 'rc_date' ? date : date.slice(0, 6) }); if (en.stop) { stopped = true; break; } entryCache[ck] = en.out; }
      for (const e of entryCache[ck]) if (String(e.rcDate) === date) { cls[e.rcNo] = e.rank; dist[e.rcNo] = e.rcDist; }
    }
    const Y = load(date.slice(0, 4));
    for (const x of det.out) {
      Y.rows.push([+date, mname, +x.rcNo, cls[x.rcNo] || null, String(x.hrNo), x.hrName, +x.stOrd || 0, +x.hrRating || 0, x.hrTool && x.hrTool !== '-' ? x.hrTool : null, String(x.jkNo || ''), x.rcTime || null, +dist[x.rcNo] || null]);
      dayRows++;
    }
  }
  rowsAdded += dayRows;
  if (dayRows) { emptyStreak = 0; oldest = date; } else if (++emptyStreak >= 24) { console.log(`${date}: 8주 연속 데이터 없음 — API 보관 한계로 판단, 중단`); break; }
  if (d.getUTCDay() === 5) { console.log(`${date} 주까지 누적 ${rowsAdded}행 (호출 ${calls}, 실패 ${fails})`); save(); }
}
save();
const summary = Object.fromEntries(Object.entries(years).map(([y, o]) => [y, o.rows.length]));
writeFileSync('data/history/index.json', JSON.stringify({ updatedAt: new Date().toISOString(), oldest, range: [START, END], entryParam, calls, fails, rows: summary }, null, 1));
console.log('완료', { oldest, rowsAdded, calls, fails, summary });
