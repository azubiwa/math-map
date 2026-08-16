import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports Math Map", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Math Map｜数学学習の進捗マップ<\/title>/i);
  assert.match(html, /MATH MAP/);
  assert.match(html, /学習の足あと/);
  assert.match(html, /日次目標/);
  assert.match(html, /週間達成目標/);
  assert.match(html, /時限達成報酬/);
  assert.match(html, /クラウド同期|端末保存/);
  assert.match(html, /class="overall-points"/);
  assert.match(html, /右下の「↻」で復習予定への追加・解除ができます/);
  assert.match(html, /復習予定（解決後に任意で追加）/);
  assert.doesNotMatch(html, /復習待ち/);
  assert.doesNotMatch(html, /週間ボス|宝箱|ミッション|熟成/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("supports reading and exercise tracks in one material", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /記録する内容/);
  assert.match(source, /「読む」と「演習」は同じ教材に設定できます/);
  assert.match(source, /readingItems/);
  assert.match(source, /readingEnabled/);
  assert.match(source, /exerciseEnabled/);
  assert.match(source, /className="track-switch"/);
  assert.match(source, /currentMode === "exercise" && <option value="review-due">復習可能<\/option>/);
});

test("keeps solving and review scheduling independent", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /const toggleProblemReview/);
  assert.match(source, /reviewScheduled: true/);
  assert.match(source, /reviewScheduled: false/);
  assert.match(source, /className={`problem-review \${reviewState \?\? "available"}`}/);
  assert.doesNotMatch(source, /nextStatus === "solved" && currentMode === "exercise"/);
});

test("provides milestone categories for different study records", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const label of ["完了単位", "演習の解決", "読書の完了", "復習の記録", "累計学習日", "連続学習", "章の完了", "周回の完了", "累計ポイント"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /milestone-levels/);
  assert.match(source, /段階を達成/);
});
