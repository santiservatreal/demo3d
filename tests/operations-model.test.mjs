import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialState,
  advance,
  applyEvent,
  vehiclePosition,
  at,
  START,
  allEntities,
  authorizedState,
  matches,
  DemoProvider,
  HubSpotProvider,
  mapHubSpotDeal,
} from "../src/operations/model.js";
test("all identities and cross references exist and remain stable", () => {
  const s = createInitialState(),
    ids = allEntities(s).map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of allEntities(s))
    for (const key of [
      "vehicleId",
      "orderId",
      "clientId",
      "lineId",
      "productId",
    ])
      if (e[key]) assert.ok(ids.includes(e[key]), `${e.id}: ${key}`);
  assert.deepEqual(
    allEntities(advance(s, at("14:25"))).map((e) => e.id),
    ids,
  );
});
test("Felipe delivery explicitly updates order and cargo, leaves warehouse unchanged, and is idempotent", () => {
  const s = createInitialState(),
    event = s.plan[0],
    next = advance(s, at("11:00"));
  assert.equal(s.vehicles[0].cargo, 40);
  assert.equal(next.vehicles[0].cargo, 0);
  assert.equal(next.orders[0].status, "delivered");
  assert.equal(next.vehicles[0].status, "unloading");
  assert.deepEqual(next.inventory, s.inventory);
  assert.strictEqual(applyEvent(next, event), next);
  assert.throws(() =>
    applyEvent(next, { ...event, id: "duplicate-with-new-id" }),
  );
});
test("delivery does not imply return; return event explicitly starts a 3 hour estimated trip", () => {
  const delivered = advance(createInitialState(), at("11:09"));
  assert.equal(delivered.vehicles[0].status, "unloading");
  assert.equal(delivered.vehicles[0].route, null);
  const s = advance(delivered, at("12:40")),
    v = s.vehicles[0];
  assert.equal(v.status, "returning");
  assert.equal(v.positionType, "estimated");
  assert.equal(v.eta - v.departure, 3 * 3600000);
  assert.equal(vehiclePosition(v, s.now).progress, 0.5);
  assert.equal(v.cargo, 0);
});
test("ETA does not confirm arrival; a separate event does", () => {
  const s = advance(createInitialState(), at("14:12"));
  assert.equal(s.vehicles[0].status, "returning");
  assert.equal(vehiclePosition(s.vehicles[0], s.now).pending, true);
  assert.equal(s.processed.length, 2);
  const next = advance(s, at("14:20"));
  assert.equal(next.vehicles[0].status, "available");
  assert.equal(next.vehicles[0].arrivalAt, at("14:20"));
  assert.equal(next.processed.length, 3);
  assert.equal(next.vehicles[0].positionType, "known");
});
test("invalid deliveries cannot mutate cargo or warehouse", () => {
  const s = createInitialState();
  assert.throws(() => applyEvent(s, { ...s.plan[0], remainingCargo: 10 }));
  assert.throws(() =>
    applyEvent(s, {
      ...s.plan[0],
      deliveredQuantity: 100,
      remainingCargo: -60,
    }),
  );
  assert.equal(s.vehicles[0].cargo, 40);
});
test("GPS stays at last observed position and reports staleness; unknown location never gets invented", () => {
  const s = createInitialState(),
    v = s.vehicles[1];
  const before = vehiclePosition(v, START),
    after = vehiclePosition(v, at("14:00"));
  assert.deepEqual(before.position, after.position);
  assert.equal(before.stale, false);
  assert.equal(after.stale, true);
  assert.deepEqual(vehiclePosition(s.vehicles[4], START), {
    known: false,
    position: null,
    label: "Sin ubicación disponible",
  });
});
test("blocked production, stock shortage and stale GPS are reproducible events", () => {
  let s = createInitialState();
  s = applyEvent(s, {
    id: "blocked",
    kind: "production_blocked",
    lineId: "line-02",
    at: START,
  });
  assert.equal(s.lines[1].status, "blocked");
  s = applyEvent(s, {
    id: "shortage",
    kind: "stock_shortage",
    productId: "product-02",
    at: START,
  });
  assert.equal(s.inventory[1].onHand, 10);
  assert.equal(s.inventory[1].reserved, 32);
  s = applyEvent(s, { id: "stale", kind: "stale_gps", at: START });
  assert.ok(vehiclePosition(s.vehicles[1], s.now).stale);
});
test("authorized snapshot removes finance installation and records before scene or metrics receive it", () => {
  const s = createInitialState();
  s.permissions.finance = false;
  const visible = authorizedState(s);
  assert.equal(
    allEntities(visible).some((e) => e.department === "finance"),
    false,
  );
  assert.equal(
    s.facilities.some((f) => f.id === "finance"),
    true,
  );
});
test("sector template actually excludes industrial resources for services", () => {
  const s = createInitialState("services");
  assert.equal(
    s.vehicles.length + s.inventory.length + s.lines.length + s.orders.length,
    0,
  );
  assert.equal(
    s.facilities.some((f) =>
      ["warehouse", "production", "transport"].includes(f.id),
    ),
    false,
  );
  assert.equal(s.projects.length, 2);
  assert.ok(s.projects.every((p) => p.hours > 0));
});
test("shared filters compose department, owner, status, incident and search", () => {
  const s = createInitialState(),
    v = s.vehicles[4];
  assert.ok(
    matches(v, {
      query: "Iván",
      department: "transport",
      owner: "Iván Mora",
      status: "delayed",
      incident: true,
    }),
  );
  assert.equal(matches(v, { department: "finance" }), false);
  assert.ok(matches(s.vehicles[0], { query: "Felipe" }));
});
test("demo and injectable HubSpot connector yield same snapshot contract, no fake logistics from CRM", async () => {
  const demo = await new DemoProvider().read();
  const hubspot = await new HubSpotProvider(async () => [
    {
      id: "42",
      properties: {
        dealname: "Acme",
        amount: "1200",
        dealstage: "contractsent",
      },
    },
  ]).read();
  assert.deepEqual(Object.keys(hubspot).sort(), Object.keys(demo).sort());
  assert.equal(hubspot.records[0].amount, 1200);
  assert.equal(hubspot.records[0].status, "unmapped");
  assert.equal(hubspot.records[0].fictional, false);
  assert.equal(hubspot.vehicles.length, 0);
  assert.throws(() =>
    mapHubSpotDeal({
      id: "x",
      properties: { dealname: "Acme", amount: "oops" },
    }),
  );
});
