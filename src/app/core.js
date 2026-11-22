// 練習版の判定部分。画面にも MIDI の API にも触らないので、node のテストからそのまま読み込める。
export const BUILD = 'app-0.5.0 2026-11-22';   // version.json と同じ値にする（テストで突き合わせる）

export const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const DOREMI = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
export const pc = n => ((n % 12) + 12) % 12;
export const isWhite = n => [0, 2, 4, 5, 7, 9, 11].includes(pc(n));
export const noteName = n => NAMES[pc(n)] + (Math.floor(n / 12) - 1);
export const label = n => DOREMI[pc(n)] + '（' + noteName(n) + '）';

// MIDI のバイト列をメッセージに分ける。ステータスを省いた続き（ランニングステータス）や、
// 次の受信にまたがるメッセージも読めるよう、読みかけの状態を入力ポートごとに持つ。
export function createParser() {
  const st = { status: 0, need: 0, buf: [] };
  return function feed(bytes) {
    const out = [];
    for (const b of bytes) {
      if (b >= 0xf8) { out.push([b]); continue; }   // リアルタイムは途中に挟まっても単独
      if (b >= 0x80) {
        st.buf = [];
        if (b >= 0xf0) { st.status = (b === 0xf1 || b === 0xf2 || b === 0xf3) ? b : 0; st.need = b === 0xf2 ? 2 : 1; if (b === 0xf6) out.push([b]); continue; }
        st.status = b; st.need = (b & 0xe0) === 0xc0 ? 1 : 2; continue;   // Cn・Dn はデータ 1 バイト
      }
      if (!st.status) continue;                      // ステータスの分からないデータは捨てる
      st.buf.push(b);
      if (st.buf.length === st.need) { out.push([st.status, ...st.buf]); st.buf = []; if (st.status >= 0xf0) st.status = 0; }
    }
    return out;
  };
}

// メッセージの種類。note-off は 0x8n と、velocity 0 の 0x9n の両方。チャンネルはどれでも受ける。
export function classify(m) {
  const s0 = m[0];
  if (s0 >= 0xf8) return { type: 'realtime' };
  const st = s0 & 0xf0, ch = s0 & 0x0f;
  if (st === 0x90 && m.length >= 3) return m[2] > 0 ? { type: 'on', ch, note: m[1], vel: m[2] } : { type: 'off', ch, note: m[1], vel: 0 };
  if (st === 0x80 && m.length >= 3) return { type: 'off', ch, note: m[1], vel: m[2] };
  if (st === 0xb0 && m.length >= 3) return { type: 'cc', ch, cc: m[1], value: m[2] };
  return { type: 'other' };
}

// いま押している鍵盤とダンパーペダル。
// 同じ鍵盤の note-on が続いても 1 つと数え、最初の note-off で離したことにする（押しっぱなしが残らない側に倒す）。
// ダンパーは 1〜127 の連続値なので、64 以上で踏、20 以下で離、その間は前の状態のまま（実機データで確認済み）。
export function createKeys() {
  const down = new Map();   // `${src}|${ch}|${note}` -> note
  let pedal = false, releases = 0;
  return {
    apply(src, ev) {
      if (ev.type === 'on') { down.set(src + '|' + ev.ch + '|' + ev.note, ev.note); return true; }
      if (ev.type === 'off') return down.delete(src + '|' + ev.ch + '|' + ev.note);
      if (ev.type === 'cc' && ev.cc === 64) {
        const on = ev.value >= 64 ? true : (ev.value <= 20 ? false : pedal);
        if (pedal && !on) releases++;
        const changed = on !== pedal; pedal = on; return changed;
      }
      return false;
    },
    held() { return new Set(down.values()); },
    get pedal() { return pedal; },
    get releases() { return releases; },
    clear(src) {   // 切断・画面が裏に回った・やり直しの時に呼ぶ。src を省くと全部
      if (src == null) { down.clear(); pedal = false; return; }
      for (const k of [...down.keys()]) if (k.startsWith(src + '|')) down.delete(k);
      if (src === 'midi') pedal = false;
    },
  };
}

// 三和音（真ん中のドのあたりの基本形。画面で光らせる位置）
export const CHORDS = {
  C: { notes: [60, 64, 67], jp: 'ド・ミ・ソ' },
  F: { notes: [65, 69, 72], jp: 'ファ・ラ・ド' },
  G: { notes: [67, 71, 74], jp: 'ソ・シ・レ' },
  Am: { notes: [69, 72, 76], jp: 'ラ・ド・ミ' },
  Dm: { notes: [62, 65, 69], jp: 'レ・ファ・ラ' },
  Em: { notes: [64, 67, 71], jp: 'ミ・ソ・シ' },
};
const noteItem = n => ({ kind: 'note', notes: [n] });
const chordItem = c => ({ kind: 'chord', chord: c, notes: CHORDS[c].notes, jp: CHORDS[c].jp });
export const LESSONS = [
  { id: 'white', title: '白鍵の場所', items: [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60, 65, 60, 67, 64, 69, 62, 71, 72].map(noteItem) },
  { id: 'major', title: 'C・F・G', items: ['C', 'F', 'G', 'C', 'F', 'C', 'G', 'C'].map(chordItem) },
  { id: 'minor', title: 'Am・Dm・Em', items: ['Am', 'Dm', 'Em', 'Am', 'Em', 'Dm', 'Am'].map(chordItem) },
];

// 押している鍵盤の集合を、いまの課題と照らす。
// 単音は同じ名前ならどの高さでも正解。三和音は 3 つの名前がそろえば、並び（転回）と高さは問わない。
export function judge(item, held) {
  if (!held.size) return { state: 'idle' };
  const target = new Set(item.notes.map(pc));
  const notes = [...held].sort((a, b) => a - b);
  const wrong = notes.filter(n => !target.has(pc(n)));
  if (wrong.length) return { state: 'bad', wrong };
  if (item.kind === 'note') return { state: 'good' };
  if (notes.length > 3) return { state: 'extra' };   // 同じ名前を 2 か所で押している
  const have = new Set(notes.map(pc));
  if (have.size === 3) return { state: 'good' };
  return { state: 'partial', missing: item.notes.map(pc).filter(p => !have.has(p)) };
}

// 練習の進み方：正解したら緑のまま待ち、指を全部離したら次の課題へ。
// cause は 'on' / 'off' / 'clear'（切断や画面が裏に回って押している音を消した時）。
export function createRunner(lesson) {
  const total = lesson.items.length;
  let i = 0, phase = 'wait', hits = 0, misses = 0, last = { state: 'idle' };
  return {
    lesson, total,
    get item() { return lesson.items[Math.min(i, total - 1)]; },
    get index() { return i; },
    get hits() { return hits; },
    get misses() { return misses; },
    get done() { return i >= total; },
    get phase() { return phase; },
    get last() { return last; },
    update(held, cause) {
      if (i >= total) return 'done';
      if (phase === 'good') {
        if (held.size) return 'good';
        hits++; i++; phase = 'wait'; last = { state: 'idle' };
        return i >= total ? 'done' : 'next';
      }
      last = judge(lesson.items[i], held);
      if (last.state === 'good') { phase = 'good'; return 'good'; }
      if ((last.state === 'bad' || last.state === 'extra') && cause === 'on') misses++;
      return last.state;
    },
    restart() { i = 0; phase = 'wait'; hits = 0; misses = 0; last = { state: 'idle' }; },
  };
}
