import test from "node:test";
import assert from "node:assert/strict";
import { LANDING_EXAMPLE } from "../src/landing/executive-data.js";

test("the director example reconciles pipeline, sales, invoices and team activity", () => {
  const { stages, reps, totals, attention, recentWin } = LANDING_EXAMPLE;
  const open = stages.filter(stage => stage.id !== "won");
  const won = stages.find(stage => stage.id === "won");
  const sum = (items, key) => items.reduce((value, item) => value + item[key], 0);
  assert.equal(sum(open, "value"), totals.pipeline);
  assert.equal(sum(open, "count"), totals.opportunities);
  assert.equal(sum(reps, "active"), totals.opportunities);
  assert.equal(sum(reps, "wonValue"), won.value);
  assert.equal(sum(reps, "wins"), won.count);
  assert.equal(won.value, totals.won);
  assert.equal(totals.invoiced + totals.pendingInvoice, totals.won);
  assert.ok(totals.invoiced < totals.won);
  assert.equal(totals.won / totals.target * 100, 75);
  assert.equal(attention.length, totals.attention);
  for (const stage of stages) {
    const priorities = attention.filter(item => item.stageId === stage.id);
    assert.equal(priorities.length, stage.attention);
    assert.ok(sum(priorities, "value") <= stage.value);
  }
  assert.ok(reps.some(rep => rep.name === recentWin.owner && rep.wonValue >= recentWin.value));
  assert.ok(Object.isFrozen(LANDING_EXAMPLE.stages[0]));
});
