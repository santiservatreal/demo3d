import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RULES,
  fresh,
  replay,
  advance,
  reduceEvent,
  clock,
  finances,
  vehicleState,
  FixedStepClock,
} from "../src/luma/simulation.js";
function conserved(s) {
  const i = s.inventory;
  assert.equal(i.raw + i.wip + i.finished + i.transit + i.delivered, i.initial);
  for (const k of [
    "raw",
    "wip",
    "finished",
    "transit",
    "delivered",
    "packaging",
  ])
    assert.ok(i[k] >= 0, `${k} negative`);
  assert.equal(
    i.transit,
    s.vehicles.reduce((n, v) => n + v.cargo, 0),
  );
  assert.ok(s.vehicles.every((v) => v.cargo <= v.capacity * 10));
}
test("closing day 12 exactly matches required snapshot", () => {
  const s = replay(clock(12, 17)),
    f = finances(s);
  assert.equal(s.inventory.delivered, 1200);
  assert.equal(s.inventory.finished, 200);
  assert.equal(s.produced, 1200);
  assert.deepEqual(
    [f.sales, f.productCost, f.distribution, f.fixed, f.result],
    [60000, 28800, 2400, 18000, 10800],
  );
  conserved(s);
});
test("base month closes target, initial stock remains, no automatic cash receipts", () => {
  const s = replay(clock(20, 17)),
    f = finances(s);
  assert.equal(s.inventory.delivered, 2000);
  assert.equal(s.inventory.finished, 200);
  assert.deepEqual(
    [f.sales, f.productCost, f.distribution, f.fixed, f.contribution, f.result],
    [100000, 48000, 4000, 30000, 48000, 18000],
  );
  assert.equal(f.result / f.sales, 0.18);
  assert.ok(
    s.orders.every(
      (o) => o.status === "delivered" && o.paymentStatus === "pending",
    ),
  );
  assert.equal(
    s.ledger.some((e) => e.kind === "cash"),
    false,
  );
  assert.equal(
    Object.values(s.shipments).filter((s) => s.status === "available").length,
    40,
  );
});
test("unit conservation and capacities hold after every event, across all scenarios", () => {
  for (const scenario of ["base", "shortage", "blocked", "lost-data"]) {
    const s = fresh(scenario);
    for (const e of s.plan) {
      reduceEvent(s, e);
      s.now = e.timestamp;
      conserved(s);
    }
    if (scenario === "shortage") assert.ok(finances(s).sales < 100000);
    if (scenario === "blocked") assert.ok(s.inventory.wip > 0);
  }
});
test("duplicate events cannot double stock, sales, route km or fixed expenses", () => {
  const s = fresh();
  for (const e of s.plan.slice(0, 90)) {
    reduceEvent(s, e);
    const before = JSON.stringify([s.inventory, s.ledger, s.vehicles]);
    assert.equal(reduceEvent(s, e), false);
    assert.equal(JSON.stringify([s.inventory, s.ledger, s.vehicles]), before);
  }
});
test("Felipe drives LW-01, explicitly assigned to LW-024, with 50 units, 10 boxes, 5 pallets", () => {
  const s = replay(clock(12, 12, 0)),
    v = s.vehicles.find((v) => v.id === "LW-01"),
    sh = s.shipments[v.shipmentId];
  assert.equal(v.driver, "Felipe García");
  assert.equal(sh.orderId, "LW-024");
  assert.equal(v.cargo, 50);
  assert.equal(sh.pallets, 5);
  assert.equal(v.capacity, 8);
  assert.equal(RULES.unitsPerBox, 5);
});
test("delivery recognises sales and product cost, not cash, only once; return is a separate event", () => {
  const before = replay(clock(12, 12, 39)),
    a = finances(before),
    s = replay(clock(12, 12, 40)),
    b = finances(s),
    v = s.vehicles[0];
  assert.equal(b.sales - a.sales, 2500);
  assert.equal(b.productCost - a.productCost, 1200);
  assert.equal(v.cargo, 0);
  assert.equal(v.status, "delivered");
  assert.equal(s.orders[23].paymentStatus, "pending");
  advance(s, clock(12, 12, 45));
  assert.equal(v.status, "returning");
  assert.equal(vehicleState(s, v).positionType, "estimated");
});
test("three hour return reaches ETA without silently confirming arrival", () => {
  const s = replay(clock(12, 15, 45), "lost-data"),
    v = s.vehicles[0];
  assert.equal(v.status, "returning");
  const view = vehicleState(s, v);
  assert.equal(view.status, "pending_arrival");
  assert.equal(view.progress, 1);
  assert.equal(view.eta - view.returnStart, 10800000);
  advance(s, clock(12, 16));
  assert.equal(v.status, "returning");
  const normal = replay(clock(12, 15, 47));
  assert.equal(normal.vehicles[0].status, "available");
});
test("empty return incurs remaining variable mileage and fixed component is charged exactly once", () => {
  const s = replay(clock(12, 12, 45)),
    sh = s.shipments["shipment-24"],
    departureCost = sh.routeCost;
  assert.equal(departureCost, 64);
  advance(s, clock(12, 15, 47));
  assert.equal(sh.routeCost, 100);
  assert.equal(sh.km, 180);
  const entries = s.ledger.filter(
    (e) => e.entityId === sh.id && e.kind === "distribution",
  );
  assert.equal(entries.filter((e) => e.amount === 28).length, 1);
  assert.equal(Math.round(entries.reduce((n, e) => n + e.amount, 0)), 100);
});
test("fixed-step x1/x60/x240 and single large replay produce identical business state", () => {
  const target = clock(1, 17),
    base = fresh(),
    duration = (target - base.now) / 1000;
  const expected = replay(target);
  for (const speed of [1, 60, 240]) {
    const s = fresh(),
      c = new FixedStepClock({ onAdvance: (ms) => advance(s, s.now + ms) });
    c.speed = speed;
    c.playing = true;
    const chunks = duration / speed;
    for (let seconds = 0; seconds < chunks; seconds++)
      c.tick(Math.min(1, chunks - seconds));
    assert.equal(s.now, target);
    assert.deepEqual(s.inventory, expected.inventory);
    assert.deepEqual(finances(s), finances(expected));
    c.playing = false;
    const now = s.now;
    c.tick(100);
    assert.equal(s.now, now);
  }
});
test("forecast unavailable before first closed day; no independent frame-based sales counter", () => {
  const s = replay(clock(1, 16));
  assert.equal(finances(s).forecast, null);
  const amount = finances(s).sales;
  advance(s, s.now + 1000);
  assert.equal(finances(s).sales, amount);
});

test("production cadence respects the 120/day nominal capacity and does not run past the shift", () => {
  const s = fresh();
  const packs = s.plan.filter(
    (e) =>
      e.kind === "pack" &&
      e.timestamp >= clock(1, 8) &&
      e.timestamp <= clock(1, 16),
  );
  assert.equal(packs.length, 10);
  assert.equal(packs[0].timestamp, clock(1, 8, 40));
  assert.equal(packs.at(-1).timestamp, clock(1, 14, 40));
  for (let i = 1; i < packs.length; i++)
    assert.equal(packs[i].timestamp - packs[i - 1].timestamp, 40 * 60000);
  assert.ok(
    packs.reduce((n, e) => n + e.payload.units, 0) <= RULES.dailyCapacity,
  );
  const closed = replay(clock(1, 17));
  assert.ok(closed.production.activityUntil.every((t) => t < closed.now));
});

test("reserved vehicle has a timed manoeuvre into the dock, without a location teleport", () => {
  const s = replay(clock(1, 8, 20)),
    v = s.vehicles[0];
  assert.equal(vehicleState(s, v).phase, "reserve_move");
  assert.equal(vehicleState(s, v).progress, 0);
  advance(s, clock(1, 8, 20) + 30000);
  assert.equal(vehicleState(s, v).progress, 0.5);
  advance(s, clock(1, 8, 21));
  assert.equal(vehicleState(s, v).phase, "dock");
});

test("regional outbound routes use consistent 90 km, 100 minute assumptions", () => {
  const s = fresh();
  for (const event of s.plan.filter((e) => e.kind === "departure"))
    assert.equal(event.payload.delivery - event.payload.departure, 100 * 60000);
});
