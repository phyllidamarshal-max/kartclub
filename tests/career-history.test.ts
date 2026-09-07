import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classicRecords,
  classicHistoryMarkup,
} from "../client/career-history.ts";
import { isUnlocked } from "../shared/gameplay.ts";

test("classic results expose original best times and drift without awarding new career stars", () => {
  const progress = {
    tour: { time: 61.25, drift: 95.8 },
    time: { time: 52.5, drift: 110 },
    drift: { time: 59, drift: 180.2 },
  };
  const before = structuredClone(progress);
  const records = classicRecords(progress);
  assert.deepEqual(
    records.map(({ id, time, drift }) => ({ id, time, drift })),
    Object.entries(progress).map(([id, result]) => ({ id, ...result })),
  );
  const markup = classicHistoryMarkup(progress);
  assert.match(markup, /经典挑战历史/);
  assert.match(markup, /3 \/ 3/);
  for (const expected of [
    "初见晴湾",
    "追赶海风",
    "弯道艺术家",
    "01:01.25",
    "00:52.50",
    "00:59.00",
    "95",
    "110",
    "180",
  ])
    assert.ok(markup.includes(expected), expected);
  assert.match(markup, /aria-labelledby="classic-history-title"/);
  assert.doesNotMatch(markup, /data-challenge|★/);
  assert.equal(isUnlocked(1, {}), false);
  assert.deepEqual(progress, before);
});

test("classic history tolerates missing and corrupt browser storage", () => {
  for (const bad of [
    undefined,
    null,
    [],
    "invalid",
    { tour: { time: "<script>", drift: 1 } },
    { tour: { time: 1, drift: -1 } },
  ]) {
    assert.deepEqual(classicRecords(bad), []);
    assert.match(classicHistoryMarkup(bad), /暂无经典挑战纪录/);
  }
});
