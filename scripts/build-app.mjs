// data/kra.json → data/app.json : 같은 내용을 열(column) 형식으로 압축 (키 반복 제거)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
if (!existsSync('data/kra.json')) process.exit(0);
const k = JSON.parse(readFileSync('data/kra.json', 'utf8'));
const out = { _fmt: 'cols1' };
for (const [key, v] of Object.entries(k)) {
  if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
    const cols = [...new Set(v.flatMap(o => Object.keys(o)))];
    out[key] = { cols, rows: v.map(o => cols.map(c => o[c] ?? null)) };
  } else out[key] = v;
}
const s = JSON.stringify(out);
writeFileSync('data/app.json', s);
console.log('app.json', s.length >> 10, 'KB (kra.json', JSON.stringify(k).length >> 10, 'KB)');
