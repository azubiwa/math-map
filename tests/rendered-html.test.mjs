import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports Math Map", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Math Map｜数学学習の進捗マップ<\/title>/i);
  assert.match(html, /MATH MAP/);
  assert.match(html, /学習のあしあと/);
  assert.match(html, /日次目標/);
  assert.match(html, /週間達成目標/);
  assert.match(html, /時限達成報酬/);
  assert.match(html, /クラウド同期|端末保存/);
  assert.match(html, /class="overall-points"/);
  assert.doesNotMatch(html, /復習予定|復習可能|右下の「↻」/);
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
});

test("shows a finish forecast and lets each material set a destination and deadline", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const label of ["必要ペース", "あなたの最近のペース", "このペースなら", "順調です"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(source, /type FinishGoal/);
  assert.match(source, /finishGoalChapterId/);
  assert.match(source, /どこまで、いつまでに？/);
  assert.match(source, /この教材の最後まで（完走）/);
  assert.match(source, /章のどこまで/);
  assert.match(source, /完走目標を設定/);
});

test("removes review scheduling from data and interface", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /return \{ id: problem\.id, \.\.\.baseState, rounds \};/);
  assert.doesNotMatch(source, /reviewScheduled|reviewDueAt|reviewCount|reviewIntervals|review-due|toggleProblemReview|復習予定|復習可能/);
});

test("provides milestone categories for different study records", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const label of ["完了単位", "演習の解決", "読書の完了", "累計学習日", "連続学習", "章の完了", "周回の完了", "累計ポイント"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /milestone-levels/);
  assert.match(source, /段階を達成/);
});

test("shows and documents every point award rule", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const docs = await readFile(new URL("../docs/point-rules.md", import.meta.url), "utf8");
  for (const label of ["本日の初回学習", "問題を解決", "読書単位を読了", "章を完了", "教材を100%完了", "連続学習", "学習再開", "日次目標を完了", "週間達成目標を完了", "時限達成報酬を受領"]) {
    assert.match(source, new RegExp(label));
    assert.match(docs, new RegExp(label));
  }
  assert.match(source, /readingCompletionPoints = 5/);
  assert.match(source, /exerciseCompletionPoints = 2/);
  assert.match(source, /applyCurrentPointWeights/);
  assert.match(docs, /読書単位の読了は \*\*\+5 pt\*\*、問題の解決は \*\*\+2 pt\*\*/);
});
