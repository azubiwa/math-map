import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports Math Map", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Math Map｜数学学習の進捗マップ<\/title>/i);
  assert.match(html, /MATH MAP/);
  assert.match(html, /学習の足あと/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});
