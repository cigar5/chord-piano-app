// 練習版の判定部分のテスト。実行：node src/app/core.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILD, createParser, classify, createKeys, judge, createRunner, LESSONS, CHORDS, label } from './core.js';

let count = 0;
const test = (name, fn) => { fn(); count++; console.log('ok -', name); };
const on = (n, ch = 0) => classify([0x90 | ch, n, 80]);
const off = n => classify([0x80, n, 64]);
const cc64 = v => classify([0xb0, 64, v]);
const set = (...ns) => new Set(ns);

// ATX4 の実機データ（ダンパー CC64 の値の並び）。research/SPIKE_RESULTS.md の実機 2・3 回目
const PEDAL_6 = [6,14,37,14,37,42,37,57,65,78,85,100,108,116,121,126,127,126,121,116,100,85,78,72,78,65,57,42,37,42,37,14,6,1,29,6,42,72,49,65,49,57,72,78,85,93,116,126,127,126,108,100,93,57,42,37,1,14,1,29,57,49,65,72,78,85,108,121,126,127,126,116,100,85,78,57,49,29,1,42,57,85,93,108,116,126,127,126,121,93,78,65,42,6,1,29,42,49,37,49,72,78,93,121,126,127,126,93,72,57,42,37,49,6,1,21,37,49,57,65,78,93,108,121,126,127,126,100,93,72,65,49,42,29,37,21,1];
const PEDAL_5 = [14,29,42,49,65,78,93,121,126,127,126,116,93,78,72,65,49,37,29,21,14,37,1,65,42,57,72,85,93,116,126,127,126,121,108,93,78,65,49,42,29,21,14,29,1,6,29,42,49,65,78,93,100,108,121,126,127,126,116,100,78,65,49,42,37,21,37,1,6,49,21,37,49,65,78,93,108,116,126,127,126,121,108,85,72,57,42,37,21,14,37,1,14,42,57,65,78,85,100,116,126,127,126,116,108,93,78,72,57,49,37,29,1];

test('parser: 1 回の受信に 1 メッセージ', () => {
  const f = createParser();
  assert.deepEqual(f([0x90, 60, 80]), [[0x90, 60, 80]]);
  assert.deepEqual(f([0x80, 60, 64]), [[0x80, 60, 64]]);
});
test('parser: 1 回の受信に複数・ステータス省略あり', () => {
  const f = createParser();
  assert.deepEqual(f([0x90, 60, 80, 64, 80, 67, 80]), [[0x90, 60, 80], [0x90, 64, 80], [0x90, 67, 80]]);
});
test('parser: ステータス省略の続きが次の受信にまたがる', () => {
  const f = createParser();
  f([0x90, 60, 80]);
  assert.deepEqual(f([64, 80]), [[0x90, 64, 80]]);
});
test('parser: 1 つのメッセージが 2 回の受信に分かれる', () => {
  const f = createParser();
  assert.deepEqual(f([0x90, 60]), []);
  assert.deepEqual(f([80]), [[0x90, 60, 80]]);
});
test('parser: リアルタイムが途中に挟まる・ステータス不明のデータは捨てる', () => {
  assert.deepEqual(createParser()([0x90, 0xf8, 60, 80]), [[0xf8], [0x90, 60, 80]]);
  assert.deepEqual(createParser()([60, 80]), []);
});
test('classify: note-off の 2 つの形・チャンネル・その他', () => {
  assert.deepEqual(classify([0x93, 60, 0]), { type: 'off', ch: 3, note: 60, vel: 0 });
  assert.equal(classify([0x85, 60, 64]).type, 'off');
  assert.equal(classify([0x9f, 60, 1]).type, 'on');
  assert.equal(classify([0xb0, 64, 127]).type, 'cc');
  assert.equal(classify([0xc0, 5]).type, 'other');
  assert.equal(classify([0xfe]).type, 'realtime');
});
test('keys: 2026-11-20 の F3 の短い 2 度押し（on・on・off・off）で押しっぱなしが残らない', () => {
  const k = createKeys();
  [on(53), on(60), on(53), off(53)].forEach(e => k.apply('midi', e));
  assert.deepEqual([...k.held()], [60]);
  [off(53), off(60)].forEach(e => k.apply('midi', e));
  assert.equal(k.held().size, 0);
});
test('keys: 入力元ごとに消せる・全部消すとペダルも離す', () => {
  const k = createKeys();
  k.apply('midi', on(60)); k.apply('screen', on(64)); k.apply('midi', cc64(127));
  k.clear('screen'); assert.deepEqual([...k.held()], [60]); assert.equal(k.pedal, true);
  k.clear(); assert.equal(k.held().size, 0); assert.equal(k.pedal, false);
});
test('pedal: 実機データ 6 回踏んだ記録を 6 回と数える', () => {
  const k = createKeys(); PEDAL_6.forEach(v => k.apply('midi', cc64(v))); assert.equal(k.releases, 6);
});
test('pedal: 実機データ 5 回（踏み始めに 65→42 の揺れあり）を 5 回と数える', () => {
  const k = createKeys(); PEDAL_5.forEach(v => k.apply('midi', cc64(v))); assert.equal(k.releases, 5);
});
test('judge: 単音は同じ名前ならどの高さでも正解・違えば押した鍵盤を返す', () => {
  const item = { kind: 'note', notes: [65] };
  assert.equal(judge(item, set()).state, 'idle');
  assert.equal(judge(item, set(53)).state, 'good');
  assert.deepEqual(judge(item, set(60)), { state: 'bad', wrong: [60] });
});
test('judge: 三和音は転回も正解・足りない名前・違う鍵盤・押し過ぎ', () => {
  const C = { kind: 'chord', notes: CHORDS.C.notes };
  assert.equal(judge(C, set(60, 64, 67)).state, 'good');
  assert.equal(judge(C, set(64, 67, 72)).state, 'good');
  assert.deepEqual(judge(C, set(60, 64)), { state: 'partial', missing: [7] });
  assert.deepEqual(judge(C, set(53, 57, 60)), { state: 'bad', wrong: [53, 57] });   // 2026-11-20 に押していたファ・ラ・ド
  assert.equal(judge(C, set(60, 64, 67, 72)).state, 'extra');
});
test('runner: 正解は指を全部離すまで待ち、離すと次へ。違う鍵盤は押した回数だけ数える', () => {
  const r = createRunner(LESSONS[1]);   // C・F・G
  assert.equal(r.update(set(53), 'on'), 'bad');
  assert.equal(r.update(set(53, 57), 'on'), 'bad');
  assert.equal(r.update(set(), 'off'), 'idle');
  assert.equal(r.misses, 2);
  assert.equal(r.update(set(60), 'on'), 'partial');
  assert.equal(r.update(set(60, 64), 'on'), 'partial');
  assert.equal(r.update(set(60, 64, 67), 'on'), 'good');
  assert.equal(r.update(set(60, 64, 67, 50), 'on'), 'good');   // 正解の後は離すまで緑のまま
  assert.equal(r.update(set(64), 'off'), 'good');
  assert.equal(r.update(set(), 'off'), 'next');
  assert.equal(r.index, 1); assert.equal(r.hits, 1); assert.equal(r.item.chord, 'F');
});
test('runner: 切断で押している音を消した時、正解の後なら次へ、途中なら進まない', () => {
  const r = createRunner(LESSONS[0]);
  r.update(set(60), 'on'); assert.equal(r.update(set(), 'clear'), 'next');
  r.update(set(64), 'on'); assert.equal(r.update(set(), 'clear'), 'idle'); assert.equal(r.index, 1);
});
test('runner: 最後まで進むと done・最初からで戻る', () => {
  const r = createRunner(LESSONS[2]);
  for (const it of LESSONS[2].items) { r.update(new Set(it.notes), 'on'); r.update(set(), 'off'); }
  assert.equal(r.done, true); assert.equal(r.hits, LESSONS[2].items.length);
  r.restart(); assert.equal(r.done, false); assert.equal(r.index, 0); assert.equal(r.hits, 0);
});
test('lessons: 光らせる鍵盤はすべて画面の 3 オクターブ（C3〜B5）に入る', () => {
  for (const l of LESSONS) for (const it of l.items) for (const n of it.notes) assert.ok(n >= 48 && n <= 83, l.id + ' ' + label(n));
});
test('version.json の版と BUILD が同じ', () => {
  const v = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf8'));
  assert.equal(v.build, BUILD);
});
console.log(`all ${count} tests passed`);
