// Compares the Python helper's VOD chat window file with the JS port's file: record count, id set, and per-field equality.
// Usage: node compare-chat.mjs <py replay.jsonl> <js jsonl>
import { readFileSync } from 'node:fs';
const [, , a, b] = process.argv;
const A = JSON.parse(readFileSync(a, 'utf8')).records, B = JSON.parse(readFileSync(b, 'utf8')).records;
let same = 0, diff = 0;
for (let i = 0; i < Math.min(A.length, B.length); i++) JSON.stringify(A[i]) === JSON.stringify(B[i]) ? same++ : diff++;
console.log(JSON.stringify({ pyCount: A.length, jsCount: B.length, identicalRecordsByPosition: same, differing: diff,
  idsOnlyInPy: A.filter(r => !B.some(x => x.id === r.id)).length, idsOnlyInJs: B.filter(r => !A.some(x => x.id === r.id)).length }));
