import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createDemoState,
  applyEvent,
  ownerPerformance,
} from "../src/city/model.js";
import {
  createPedestrianMap,
  planPedestrianRoute,
  createPeople,
} from "../src/city/people.js";

function positionsFor(state) {
  const positions = new Map(),
    stageCounts = new Map();
  const centers = [-31.25, -15.5, 0, 15.5, 31.25];
  const slots = [
    [-1, -17],
    [0, -17],
    [-0.58, -3.4],
    [0.58, -3.4],
    [-0.58, 2.6],
    [0.58, 2.6],
    [1, -17],
  ];
  for (const deal of state.deals) {
    if (deal.stageId === "lost") continue;
    const stage = state.stages.findIndex((entry) => entry.id === deal.stageId),
      index = stageCounts.get(deal.stageId) || 0;
    stageCounts.set(deal.stageId, index + 1);
    const [col, z] = slots[index % slots.length];
    let x = centers[stage] + col * 4.2;
    if (index >= 2 && index <= 5) {
      if (stage === 0) x = col < 0 ? -34 : -29.5;
      if (stage === 4) x = col < 0 ? 29.5 : 34;
      if (Math.abs(x) < 3.8) x = x < 0 ? -5 : 5;
    }
    positions.set(deal.id, { target: new THREE.Vector3(x, 0.1, z) });
  }
  state.accounts.forEach((account, index) =>
    positions.set(account.id, {
      target: new THREE.Vector3(
        -32 + (index % 9) * 8,
        0.1,
        index < 9 ? 15.65 : 21.35,
      ),
    }),
  );
  return positions;
}

test("owner scorecards use the same registered deals and never duplicate wins", () => {
  const state = createDemoState();
  const rows = ownerPerformance(state);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((owner) => [owner.openCount, owner.wonCount]),
    [
      [6, 1],
      [6, 1],
      [6, 1],
      [6, 1],
    ],
  );
  assert.equal(
    rows.reduce((sum, owner) => sum + owner.wonAmount, 0),
    30000,
  );
  const event = {
    id: "owner-win",
    entityId: "deal-013",
    type: "deal.won",
    source: "atlas-demo",
    timestamp: "2026-10-16T10:16:00+02:00",
    payload: { stageId: "won" },
  };
  assert.equal(applyEvent(state, event), true);
  assert.equal(applyEvent(state, event), false);
  const after = ownerPerformance(state);
  assert.equal(after.find((owner) => owner.id === "owner-ana").wonCount, 2);
  assert.equal(
    after.reduce((sum, owner) => sum + owner.wonAmount, 0),
    33000,
  );
  for (let index = 0; index < 40; index++)
    assert.deepEqual(ownerPerformance(state), after);
  state.deals.push(
    structuredClone(state.deals.find((deal) => deal.id === "deal-013")),
  );
  assert.deepEqual(ownerPerformance(state), after);
});

test("owner sales use local closure month, explicit history and preserve unavailable amounts", () => {
  const state = createDemoState();
  const won = state.deals.find((deal) => deal.id === "deal-025");
  won.history.at(-1).timestamp = "2026-09-30T22:30:00Z"; // October 1 in Madrid.
  assert.equal(ownerPerformance(state)[0].wonCount, 1);
  won.history.at(-1).timestamp = "2026-09-30T20:30:00Z";
  assert.equal(ownerPerformance(state)[0].wonCount, 0);
  won.history = [];
  assert.equal(ownerPerformance(state)[0].wonCount, null);
  assert.equal(ownerPerformance(state)[0].wonAmount, null);
  state.deals.find(
    (deal) => deal.ownerId === "owner-marcos" && deal.stageId === "lead",
  ).amount = null;
  assert.equal(ownerPerformance(state)[1].openAmount, null);
  assert.equal(ownerPerformance(state)[1].openCount, 6);
});

test("pedestrian routes respect building footprints and cross active lanes only at zebra crossings", () => {
  const state = createDemoState(),
    map = createPedestrianMap(positionsFor(state), state);
  for (const [start, end] of [
    [
      [17, 12],
      [17, -12],
    ],
    [
      [-17, 12],
      [15.5, -14.75],
    ],
    [
      [-11, 12],
      [0, 18],
    ],
    [
      [-32, 18],
      [32, 18],
    ],
  ]) {
    const route = planPedestrianRoute(
      map,
      { x: start[0], z: start[1] },
      { x: end[0], z: end[1] },
    );
    assert.ok(route.length >= 2, `route available ${start} → ${end}`);
    for (let segment = 1; segment < route.length; segment++) {
      const a = route[segment - 1],
        b = route[segment],
        steps = Math.ceil(a.distanceTo(b) / 0.08);
      for (let sample = 0; sample <= steps; sample++) {
        const p = a.clone().lerp(b, sample / Math.max(1, steps));
        assert.ok(
          map.isWalkable(p.x, p.z),
          `pavement clearance at ${p.x},${p.z}`,
        );
        const road = map.roadAt(p.x, p.z);
        if (road === "north" || road === "south")
          assert.ok(Math.abs(p.x) <= 1.2);
        assert.notEqual(road, "outer");
      }
    }
  }
  assert.deepEqual(
    planPedestrianRoute(map, { x: 17, z: 12 }, { x: -32, z: 15.65 }),
    [],
    "an occupied building is no walking destination",
  );
});

test("four detailed avatars walk and visit assigned clients without mutating CRM state", () => {
  const state = createDemoState(),
    before = structuredClone(state),
    scene = new THREE.Scene();
  const people = createPeople({ scene });
  people.sync(state, { entityPositions: positionsFor(state) });
  const initial = people.debug();
  assert.equal(initial.owners.length, 4);
  assert.ok(
    initial.owners.every((owner) =>
      owner.targetEntityId?.startsWith("account-"),
    ),
  );
  assert.ok(scene.getObjectByName("Tablet de propuestas"));
  assert.ok(scene.getObjectByName("Chaqueta de equipo"));
  assert.ok(scene.getObjectByName("Maletín de comercial"));
  let meetings = false;
  for (let frame = 1; frame <= 1800; frame++) {
    const previous = people.debug();
    people.update(1 / 30, frame / 30);
    const current = people.debug();
    for (const owner of current.owners) {
      const old = previous.owners.find(
        (entry) => entry.ownerId === owner.ownerId,
      );
      assert.ok(
        new THREE.Vector3(...owner.position).distanceTo(
          new THREE.Vector3(...old.position),
        ) < 0.16,
        "no avatar teleports",
      );
    }
    if (current.owners.some((owner) => owner.phase === "meeting"))
      meetings = true;
  }
  assert.ok(people.debug().owners.every((owner) => owner.distance > 5));
  assert.ok(meetings, "salespeople reach a client's front door");
  assert.deepEqual(state, before);
  people.dispose();
  assert.equal(scene.children.length, 0);
});

test("won owner visits the client then the completed new deal and repeated sync does not restart the walk", () => {
  const state = createDemoState(),
    scene = new THREE.Scene(),
    people = createPeople({ scene });
  let positions = positionsFor(state);
  people.sync(state, { entityPositions: positions });
  const event = {
    id: "people-win",
    entityId: "deal-013",
    type: "deal.won",
    source: "atlas-demo",
    timestamp: "2026-10-16T10:16:00+02:00",
    payload: { stageId: "won" },
  };
  assert.equal(applyEvent(state, event), true);
  positions = positionsFor(state);
  const director = { get: () => ({ phase: "complete", status: "complete" }) };
  people.sync(state, { entityPositions: positions, construction: director });
  assert.equal(
    people.debug().owners.find((owner) => owner.ownerId === "owner-ana")
      .winStep,
    "client",
  );
  let destination = false,
    celebration = false;
  for (let frame = 1; frame <= 5400; frame++) {
    people.update(1 / 30, frame / 30);
    const owner = people
      .debug()
      .owners.find((entry) => entry.ownerId === "owner-ana");
    if (owner.winStep === "destination") destination = true;
    if (owner.phase === "celebrating") {
      celebration = true;
      break;
    }
    if (frame % 30 === 0)
      people.sync(state, {
        entityPositions: positions,
        construction: director,
      });
  }
  assert.ok(
    destination,
    "the win owner follows the destination after client visit",
  );
  assert.ok(
    celebration,
    "owner celebrates only after reaching the completed deal",
  );
  assert.equal(ownerPerformance(state)[0].wonCount, 2);
  people.dispose();
});

test("reduced motion keeps avatars stable while owner counters reflect CRM events", () => {
  const state = createDemoState(),
    scene = new THREE.Scene(),
    people = createPeople({ scene, reducedMotion: true });
  people.sync(state, { entityPositions: positionsFor(state) });
  const before = people.debug().owners.map((owner) => owner.position);
  for (let frame = 1; frame <= 100; frame++) people.update(0.1, frame * 0.1);
  assert.deepEqual(
    people.debug().owners.map((owner) => owner.position),
    before,
  );
  assert.equal(
    ownerPerformance(state).reduce((sum, owner) => sum + owner.wonCount, 0),
    4,
  );
  people.setEnabled(false);
  assert.equal(people.debug().enabled, false);
  people.dispose();
});
