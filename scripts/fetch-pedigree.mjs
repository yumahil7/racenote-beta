// 레이스노트: 혈통 정보 수집 (마필종합 상세정보 API42_1 + 혈통정보기본 API284) → data/pedigree.json
// 실행: KRA_API_KEY=... node scripts/fetch-pedigree.mjs [PROBE=hrNo]  — 키는 절대 출력·저장하지 않음.
// 증분 수집: 이미 받은 말은 건너뜀. 개발계정 일 3000회 한도 → 1회 실행당 최대 MAX마리(기본 1200, 호출 2회/마리).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const KEY = process.env.KRA_API_KEY;
if (!KEY) { console.error('KRA_API_KEY 없음'); process.exit(1); }
const DROP = /^(win|plc|.*[Oo]dds.*|.*[Dd]iv(idend)?.*|.*[Ss]ale.*|.*[Aa]mt.*|.*매출.*|.*배당.*)$/;
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
const B = 'https://apis.data.go.kr/B551015/';
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keep = o => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => !DROP.test(k) && v !== '' && v != null));
async function one(hr) {
  const a = await call('API42_1/totalHorseInfo_1', { hr_no: hr }, 5); await sleep(120);
  const b = await call('API284/HorseBloodBasicInfo', { hrno: hr }, 5); await sleep(120);
  return { a, b };
}
const P = existsSync('data/pedigree.json') ? JSON.parse(readFileSync('data/pedigree.json', 'utf8')) : { horses: {} };
if (process.env.PROBE) {
  const { a, b } = await one(process.env.PROBE);
  for (const [n, r] of [['API42_1', a], ['API284', b]]) console.log(n, 'code', r.code, r.msg, 'items', r.items.length, JSON.stringify(Object.fromEntries(Object.entries(keep(r.items[0])).filter(([k]) => /hr|Hr|dam|sire|chef|Vl|Rt/i.test(k)))));
  process.exit(0);
}
const k = JSON.parse(readFileSync('data/kra.json', 'utf8'));
const want = [...new Set([...(k.entries || []), ...(k.detail || [])].map(e => String(e.hrNo)).filter(Boolean))].filter(h => !P.horses[h]);
const MAX = +(process.env.MAX || 1200); let n = 0, fail = 0, lastErr = '';
for (const hr of want.slice(0, MAX)) {
  const { a, b } = await one(hr);
  if (!a.ok && !b.ok) { fail++; lastErr = `${a.code} ${a.msg} / ${b.code} ${b.msg}`; if (fail >= 5 && n === 0) break; continue; }
  const t = a.items[0] || {}, d = b.items[0] || {}; const v = x => (x === '-' || x === '' || x == null) ? null : x; const nb = x => (x === '-' || x == null || isNaN(+x)) ? null : +x;
  // s=부마, d=모마, ds=외조부(모마의 부), chef=부계 주요 계통마, di=도사지 지수(DI), cd=중심 거리(CD), dp=도사지 프로필[B,I,C,S,P]
  P.horses[hr] = { sn: v(t.fhrNm), s: v(t.fhrNo), dn: v(t.mhrNm), d: v(t.mhrNo), dsn: v(t.mhrFhrNm), ds: v(t.mhrFhrNo), chef: v(t.chefHrNm),
    di: nb(d.dsidxVl), cd: nb(d.dsaCtdIndxVl), dp: [d.dsaBriVl, d.dsaIerVl, d.dsaClcVl, d.dsaSldVl, d.dsaPrfVl].map(nb), at: new Date().toISOString().slice(0, 10) }; n++;
  if (/LIMITED|22/.test(a.code + b.code)) break;
}
P.updatedAt = new Date().toISOString();
writeFileSync('data/pedigree.json', JSON.stringify(P));
console.log('pedigree: new', n, 'fail', fail, 'remaining', Math.max(0, want.length - n), lastErr ? 'lastErr ' + lastErr : '');
