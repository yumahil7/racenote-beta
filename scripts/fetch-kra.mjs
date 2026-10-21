// 공공데이터포털 한국마사회 API 수집 스텁 (아직 서비스키 없음 · 실행 전 활용신청 필요)
// 사용: DATA_GO_KR_KEY=xxxx node scripts/fetch-kra.mjs 20261024 1
// 키는 절대 커밋하지 말 것 (환경변수로만 사용). 배당율(win/plc) 필드는 저장·표시하지 않는다.
// 참고: 출전표 상세정보 https://www.data.go.kr/data/15058677/openapi.do
//       경주성적정보     https://www.data.go.kr/data/15063979/openapi.do
//       경주별상세성적표 https://www.data.go.kr/data/15089492/openapi.do (요청주소 확인됨)
const KEY = process.env.DATA_GO_KR_KEY;
const [date = '', meet = '1'] = process.argv.slice(2);
if (!KEY) { console.error('DATA_GO_KR_KEY 환경변수가 없습니다.'); process.exit(1); }
const ENDPOINTS = {
  // 확인된 요청주소
  raceDetailResult: 'https://apis.data.go.kr/B551015/racedetailresult/getracedetailresult',
  // TODO: 출전표·경주성적 API의 정확한 요청주소는 각 상세페이지 '활용 정보'에서 확인 후 기입
  entries: null,
  results: null,
};
const DROP = new Set(['win', 'plc']); // 배당 관련 필드 제거
async function get(url, params) {
  const q = new URLSearchParams({ ServiceKey: KEY, pageNo: '1', numOfRows: '1000', _type: 'json', ...params });
  const r = await fetch(`${url}?${q}`); if (!r.ok) throw new Error(r.status);
  return r.text(); // 경주별상세성적표는 XML만 제공 — 파서 추가 필요
}
const raw = await get(ENDPOINTS.raceDetailResult, { meet, rc_date: date });
console.log(raw.slice(0, 500), '\n... TODO: XML 파싱 → data/*.json 변환, DROP 필드 제거');
