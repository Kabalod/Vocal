import assert from "node:assert/strict";
import { test } from "node:test";
import { stripStyleFillers } from "../src/lib/author-text-guard";

test("09.10: fillers are cut at the start of the reply, with the capital letter repaired", () => {
  assert.equal(stripStyleFillers("Пожалуйста, расскажите о случае."), "Расскажите о случае.");
  assert.equal(stripStyleFillers("По вашему мнению, почему так вышло?"), "Почему так вышло?");
  assert.equal(stripStyleFillers("пожалуйста расскажите"), "Расскажите");
  assert.equal(stripStyleFillers("По-вашему, это важно?"), "Это важно?");
});

test("09.10: fillers in the middle: parenthetical commas go with them", () => {
  assert.equal(stripStyleFillers("Что, по вашему мнению, вызывает головную боль?"), "Что вызывает головную боль?");
  assert.equal(stripStyleFillers("Почему, по-вашему, так получается?"), "Почему так получается?");
  assert.equal(stripStyleFillers("Можете, пожалуйста, рассказать подробнее?"), "Можете рассказать подробнее?");
  assert.equal(stripStyleFillers("Если вы уверены, пожалуйста, объясните почему."), "Если вы уверены, объясните почему.", "a real clause comma stays");
  assert.equal(stripStyleFillers("Что по вашему мнению вызывает усталость?"), "Что вызывает усталость?", "without commas");
  assert.equal(stripStyleFillers("Расскажите, пожалуйста подробнее."), "Расскажите подробнее.");
});

test("09.10: fillers at the end", () => {
  assert.equal(stripStyleFillers("Почему так происходит, по вашему мнению?"), "Почему так происходит?");
  assert.equal(stripStyleFillers("Расскажите о случае, пожалуйста."), "Расскажите о случае.");
  assert.equal(stripStyleFillers("Расскажите о случае пожалуйста?"), "Расскажите о случае?");
});

test("09.10: other words and ordinary uses are not touched", () => {
  assert.equal(stripStyleFillers("Какой конкретный случай вы помните?"), "Какой конкретный случай вы помните?", "конкретн* stays");
  assert.equal(stripStyleFillers("Что вы скажете по вашему запросу?"), "Что вы скажете по вашему запросу?");
  assert.equal(stripStyleFillers("Какой вывод вы делаете?"), "Какой вывод вы делаете?");
  assert.equal(stripStyleFillers("Что здесь главное?"), "Что здесь главное?");
  assert.equal(stripStyleFillers("Пожалуйста, по-вашему, почему?"), "Почему?", "several fillers");
});
