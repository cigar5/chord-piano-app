# chord-piano-app

電子ピアノ（Bluetooth MIDI）を iPad に繋いで、三和音・転回形・基本進行を音ゲー形式で一人練習する Web アプリ。長調と短調の「聴こえの違い」を物理（周波数比・倍音・うなり）で体感する章つき。

- 配信：GitHub Pages（HTTPS）。練習版 https://cigar5.github.io/chord-piano-app/src/app/ ／ 接続診断 https://cigar5.github.io/chord-piano-app/src/spike/
- iPad（iPhone でも可）では Web MIDI 対応ブラウザ（MIDIWeb Browser）で開く。画面は iPad の横向きを基本に設計する。Mac では Chrome / Firefox
- ビルド工程なし・外部ライブラリなし（HTML / CSS / JS のみ）

## 状態

- 2026-11-05：Phase 1（接続スパイク＋調査）。`src/spike/` に接続診断ページ、`docs/SPIKE_PROCEDURE.md` に 10 分手順
- 2026-11-22：練習版 v0.5（`src/app/`）。白鍵の場所・C/F/G・Am/Dm/Em の 3 つを、iPad の横向きで練習できる最小版
- ライセンス：未定（決まるまで All rights reserved）

## 構成

```
src/app/          練習版（最小版）。判定は core.js、テストは node src/app/core.test.mjs
src/spike/        接続診断ページ（Phase 1）
docs/             手順・設計文書
```
