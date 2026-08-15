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
  assert.match(html, /解決状況と復習予定は別々に記録されます/);
  assert.match(html, /復習予定（進捗と併記）/);
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
