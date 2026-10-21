// 레이스노트: 공공데이터포털 한국마사회(B551015) API 수집 스크립트
// 실행: KRA_API_KEY=... node scripts/fetch-kra.mjs   (GitHub Actions에서는 repo secret 사용)
// 키는 절대 출력·저장하지 않는다. 출력/파일에는 키 대신 *** 만 남긴다.
// 배당률·매출 관련 필드는 저장하지 않는다(법률 검토 결과: 배당 표시 제외).
import { writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.KRA_API_KEY;
if (!KEY) { console.error('KRA_API_KEY 없음'); process.exit(1); }
const B = 'https://apis.data.go.kr/B551015/';
const kst = new Date(Date.now() + 9 * 3600e3);
const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '');
const ym = d => ymd(d).slice(0, 6);
const addDays = n => new Date(kst.getTime() + n * 864e5);
const today = ymd(kst), thisMonth = ym(kst), lastMonth = ym(new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 15)));
const MEETS = ['1', '2', '3'];
const DROP = /^(win|plc|.*[Oo]dds.*|.*[Dd]iv(idend)?.*|.*[Ss]ale.*|.*[Aa]mt.*|.*매출.*|.*배당.*)$/;
const clean = o => Object.fromEntries(Object.entries(o).filter(([k]) => !DROP.test(k)));
const mask = s => String(s).split(KEY).join('***').split(encodeURIComponent(KEY)).join('***');

function parseXmlItems(t) {
  const items = [];
  for (const m of t.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const o = {};
    for (const f of m[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) o[f[1]] = f[2].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    items.push(o);
  }
  return items;
}
async function call(path, params = {}, rows = 1000) {
  const q = new URLSearchParams({ pageNo: '1', numOfRows: String(rows), _type: 'json', ...params });
  const keyPart = KEY.includes('%') ? KEY : encodeURIComponent(KEY);
  const url = `${B}${path}?serviceKey=${keyPart}&${q}`;
  let t, status;
  try {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 30000);
    const r = await fetch(url, { signal: ac.signal }); clearTimeout(to); status = r.status; t = await r.text();
  } catch (e) { return { ok: false, code: 'NETWORK', msg: mask(e.message), items: [] }; }
  let code, msg, total, items = [];
  if (t.trim().startsWith('{')) {
    try {
      const j = JSON.parse(t); const h = j.response?.header || {}; const b = j.response?.body || {};
      code = h.resultCode; msg = h.resultMsg; total = b.totalCount;
      const it = b.items?.item ?? b.items; items = Array.isArray(it) ? it : it && typeof it === 'object' ? [it] : [];
    } catch { code = 'PARSE'; msg = 'JSON parse error'; }
    if (code === undefined) { code = `HTTP${status}`; msg = mask(t.slice(0, 160)).replace(/\s+/g, ' '); }
  } else {
    code = (t.match(/<resultCode>([^<]*)/) || t.match(/<returnReasonCode>([^<]*)/) || [])[1];
    msg = (t.match(/<resultMsg>([^<]*)/) || t.match(/<returnAuthMsg>([^<]*)/) || t.match(/<errMsg>([^<]*)/) || [])[1];
    total = (t.match(/<totalCount>(\d+)/) || [])[1]; items = parseXmlItems(t);
    if (!code && !items.length) { code = `HTTP${status}`; msg = mask(t.slice(0, 120)).replace(/\s+/g, ' '); }
  }
  const ok = ['00', '0', '0000'].includes(String(code)) || (items.length > 0);
  return { ok, code: String(code ?? ''), msg: mask(msg ?? ''), total: total ? +total : items.length, items };
}
// API 목록 (dataId: 공공데이터포털 데이터 번호, src: 요청주소 출처)
const APIS = [
  { key: 'entries', name: '출전표 상세정보', dataId: '15058677', path: 'API26_2/entrySheet_2', src: 'govapiatlas(2차)', runs: MEETS.map(meet => ({ meet })) },
  { key: 'results', name: '경주성적정보', dataId: '15063979', path: 'API214_1/RaceDetailResult_1', src: 'govapiatlas(2차)', runs: MEETS.flatMap(meet => [{ meet, rc_month: thisMonth }, { meet, rc_month: lastMonth }]) },
  { key: 'detail', name: '경주별상세성적표', dataId: '15089492', path: 'racedetailresult/getracedetailresult', src: 'data.go.kr', runs: [] /* rc_date 필수: 아래에서 최근 경주일로 채움 */ },
  { key: 'raceInfo', name: '경주개요 정보', dataId: '15059144', path: 'API3_1/raceInfo_1', src: 'govapiatlas(2차)', runs: MEETS.map(meet => ({ meet, rc_month: thisMonth })) },
  { key: 'track', name: '경주로정보', dataId: '15063953', path: 'API189_1/Track_1', src: 'govapiatlas(2차)', runs: MEETS.map(meet => ({ meet, rc_month: thisMonth })) },
  { key: 'parkTrack', name: '레츠런파크 트랙정보', dataId: '15063969', path: 'API204/RaceTrack', src: 'govapiatlas(2차)', runs: MEETS.map(meet => ({ meet })), rows: 50 },
  { key: 'topRecord', name: '경주조건별 최고기록', dataId: '15057344', path: 'API32_1/topRecordByCondition_1', src: 'govapiatlas(2차)', runs: [{}] },
  { key: 'jockeys', name: '현직기수정보', dataId: '15086329', path: 'currentjockeyInfo/getcurrentjockeyinfo', src: 'data.go.kr', runs: MEETS.map(meet => ({ meet })) },
  { key: 'jockeyPeriod', name: '기수기간별성적비교(최근60일)', dataId: '15089669', path: 'jkpresult/getjkpresult', src: 'data.go.kr', runs: MEETS.map(meet => ({ meet, rc_date_fr: ymd(addDays(-60)), rc_date_to: today })) },
  { key: 'jockeyResult', name: '기수 성적 정보', dataId: '15056591', path: 'API11_1/jockeyResult_1', src: '추정(미확인)', runs: MEETS.map(meet => ({ meet })) },
  { key: 'weight', name: '출전마 체중 정보', dataId: '(govapiatlas)', path: 'API25_1/entryHorseWeightInfo_1', src: 'govapiatlas(2차)', runs: MEETS.map(meet => ({ meet })) },
  { key: 'horses', name: '경주마 상세정보', dataId: '15058115', path: 'API8_2/raceHorseInfo_2', src: 'govapiatlas(2차)', runs: MEETS.map(meet => ({ meet })), pages: 3 },
  { key: 'horseTotal', name: '마필종합 상세정보', dataId: '15057985', path: 'API42_1/totalHorseInfo_1', src: 'govapiatlas(2차)', runs: [], rows: 5 },
  { key: 'jockeyChange', name: '기수변경 정보', dataId: '15057181', path: 'API10_1/jockeyChangeInfo_1', src: '추정(미확인)', runs: MEETS.map(meet => ({ meet })) },
  { key: 'cancel', name: '경주마 출전취소 정보', dataId: '(govapiatlas)', path: 'API9_1/raceHorseCancelInfo_1', src: 'govapiatlas(2차)', runs: MEETS.map(meet => ({ meet })) },
];
const out = {}; const status = [];
async function runApi(a) {
  let all = [], first = null;
  for (const p of a.runs) {
    for (let page = 1; page <= (a.pages || 2); page++) {
      const r = await call(a.path, { ...p, pageNo: String(page) }, a.rows || 1000);
      if (!first || (!first.ok && r.ok)) first = r;
      if (!r.ok) break;
      all.push(...r.items.map(i => ({ ...clean(i), _meetReq: p.meet })));
      if (r.items.length < (a.rows || 1000)) break;
    }
  }
  out[a.key] = all;
  status.push({ key: a.key, name: a.name, dataId: a.dataId, endpoint: B + a.path, endpointSource: a.src,
    resultCode: first?.code ?? '-', resultMsg: first?.msg ?? '-', items: all.length, ok: all.length > 0 || !!first?.ok });
  console.log(`${a.name} | ${B + a.path} | ${first?.code} ${first?.msg} | ${all.length}`);
}
for (const a of APIS) {
  if (a.key === 'detail') {
    const src = (out.results?.length ? out.results : out.entries || []).filter(r => String(r.rcDate) <= today);
    const dates = [...new Set(src.map(r => String(r.rcDate)))].sort().slice(-8);
    a.runs = dates.length ? dates.flatMap(d => MEETS.map(meet => ({ meet, rc_date: d }))) : [{ meet: '1', rc_date: ymd(addDays(-((kst.getUTCDay() + 1) % 7))) }];
  }
  if (a.key === 'horseTotal') {
    const hr = [...new Set((out.entries || []).map(e => e.hrNo).filter(Boolean))].slice(0, 1);
    a.runs = hr.length ? hr.map(hr_no => ({ hr_no })) : [{ meet: '1' }];
  }
  await runApi(a);
}
mkdirSync('data', { recursive: true });
const anyReal = (out.entries?.length || 0) + (out.results?.length || 0) > 0;
writeFileSync('data/status.json', JSON.stringify({ checkedAt: new Date().toISOString(), apis: status }, null, 1));
if (anyReal) {
  const pick = ['entries', 'results', 'detail', 'raceInfo', 'track', 'parkTrack', 'topRecord', 'jockeys', 'jockeyPeriod', 'jockeyResult', 'weight', 'horses', 'jockeyChange', 'cancel'];
  const data = { source: 'kra', updatedAt: new Date().toISOString(), notice: '출처: 공공데이터포털 한국마사회 제공 데이터. 배당·매출 필드는 제외.' };
  for (const k of pick) data[k] = out[k] || [];
  const s = JSON.stringify(data);
  if (s.includes(KEY) || s.includes(encodeURIComponent(KEY))) { console.error('키 포함 감지 — 저장 중단'); process.exit(2); }
  writeFileSync('data/kra.json', s);
  console.log('data/kra.json 저장', (s.length / 1024 | 0) + 'KB');
} else console.log('실데이터 없음 — kra.json 미생성(사이트는 예시 데이터 유지)');
