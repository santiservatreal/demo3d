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
  CONSTRUCTION_WALK_SPEED,
  CONSTRUCTION_OWNER_HOLD,
} from "../src/city/people.js";
import { createArchitecture } from "../src/city/architecture.js";
import { createConstructionDirector } from "../src/city/construction.js";

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

test("won owner accompanies the completed new deal and repeated sync does not restart the walk", () => {
  const state = createDemoState(),
    scene = new THREE.Scene(),
    people = createPeople({ scene });
  let positions = positionsFor(state);
  people.sync(state, { entityPositions: positions });
  const from = positions.get("deal-013").target.clone();
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
  const job = {
    phase: "complete",
    status: "complete",
    from,
    to: positions.get("deal-013").target.clone(),
  };
  const director = { get: (id) => (id === "deal-013" ? job : null) };
  people.sync(state, { entityPositions: positions, construction: director });
  assert.equal(
    people.debug().owners.find((owner) => owner.ownerId === "owner-ana")
      .winStep,
    "destination",
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
    "the win owner follows the destination of the reconstruction",
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

function stageEvent(state, dealId, stageId, suffix = stageId) {
  return {
    id: `attendance-${dealId}-${suffix}`,
    entityId: dealId,
    type: stageId === "won" ? "deal.won" : "deal.stage_changed",
    source: "atlas-demo",
    timestamp: new Date(Date.parse(state.now) + 60000).toISOString(),
    payload: { stageId },
  };
}

test("each open-stage reconstruction has its owner at origin, destination and a visible final hold", () => {
  for (const [dealId, stageId] of [
    ["deal-001", "qualified"],
    ["deal-008", "proposal"],
    ["deal-013", "negotiation"],
  ]) {
    const state = createDemoState(),
      scene = new THREE.Scene(),
      people = createPeople({ scene });
    let positions = positionsFor(state);
    people.sync(state, { entityPositions: positions });
    const from = positions.get(dealId).target.clone();
    assert.ok(applyEvent(state, stageEvent(state, dealId, stageId)));
    positions = positionsFor(state);
    const job = {
      from,
      to: positions.get(dealId).target.clone(),
      phase: "deconstruct",
      status: "active",
    };
    const director = { get: (id) => (id === dealId ? job : null) };
    people.sync(state, { entityPositions: positions, construction: director });
    const immutable = structuredClone(state),
      ownerId = state.deals.find((deal) => deal.id === dealId).ownerId;
    const navPositions = new Map(positions);
    navPositions.set(`construction-source:${dealId}`, { target: from });
    const map = createPedestrianMap(navPositions, state);
    let atSource = false,
      readyAt = null,
      completedAt = null,
      finalAt = null;
    for (let frame = 1; frame <= 2100; frame++) {
      const now = frame / 30;
      if (now >= 3.36) job.phase = "transport";
      if (now >= 8.16) job.phase = "build";
      const report = people.getConstructionAttendance(dealId);
      if (report?.atSource) atSource = true;
      if (now >= 8.16 && report?.readyForBuild) readyAt ??= now;
      if (readyAt !== null && now >= readyAt + 3.84) {
        job.phase = "complete";
        job.status = "complete";
        completedAt ??= now;
      }
      const previous = people.getOwnerPosition(ownerId);
      people.update(1 / 30, now);
      const current = people.getOwnerPosition(ownerId);
      assert.ok(
        previous.distanceTo(current) <= CONSTRUCTION_WALK_SPEED / 30 + 0.03,
        "compressed walking still has a bounded continuous speed",
      );
      if (
        people.debug().owners.find((owner) => owner.ownerId === ownerId)
          .attendingConstruction
      )
        assert.ok(
          map.segmentWalkable(previous, current),
          "owner stays outside footprints and active lanes",
        );
      const label = people
        .getOwnerLabels()
        .find((owner) => owner.ownerId === ownerId);
      assert.ok(label.initials && label.position instanceof THREE.Vector3);
      if (completedAt !== null && label.phase === "construction-ready")
        finalAt ??= now;
      if (finalAt !== null && now < finalAt + CONSTRUCTION_OWNER_HOLD - 0.05)
        assert.ok(
          label.attendingConstruction,
          "owner remains visible beside the finished facade",
        );
      if (
        completedAt !== null &&
        now > completedAt + CONSTRUCTION_OWNER_HOLD + 0.2
      )
        break;
      if (frame % 30 === 0)
        people.sync(state, {
          entityPositions: positions,
          construction: director,
        });
    }
    assert.ok(atSource, `${stageId}: owner visits original parcel`);
    assert.ok(readyAt !== null, `${stageId}: owner reaches reconstruction`);
    assert.ok(finalAt !== null, `${stageId}: final attendance pose exists`);
    assert.deepEqual(
      state,
      immutable,
      "attendance does not write CRM stages, events, money or activity",
    );
    people.dispose();
  }
});

test("same salesperson queues multiple reconstructions and duplicate sync creates no additional visit", () => {
  const state = createDemoState(),
    scene = new THREE.Scene(),
    people = createPeople({ scene });
  let positions = positionsFor(state);
  people.sync(state, { entityPositions: positions });
  const origins = new Map(
    ["deal-001", "deal-005"].map((id) => [
      id,
      positions.get(id).target.clone(),
    ]),
  );
  assert.ok(applyEvent(state, stageEvent(state, "deal-001", "qualified")));
  assert.ok(applyEvent(state, stageEvent(state, "deal-005", "proposal")));
  positions = positionsFor(state);
  const jobs = new Map(
    [...origins].map(([id, from]) => [
      id,
      {
        from,
        to: positions.get(id).target.clone(),
        phase: "complete",
        status: "complete",
      },
    ]),
  );
  const director = { get: (id) => jobs.get(id) || null };
  people.sync(state, { entityPositions: positions, construction: director });
  for (let duplicate = 0; duplicate < 10; duplicate++)
    people.sync(state, { entityPositions: positions, construction: director });
  const owner = people
    .debug()
    .owners.find((entry) => entry.ownerId === "owner-ana");
  assert.equal(owner.dealId, "deal-001");
  assert.deepEqual(owner.queuedConstructionDeals, ["deal-005"]);
  assert.equal(people.getConstructionAttendance("deal-005").queued, true);
  const attended = new Set();
  for (let frame = 1; frame <= 2400; frame++) {
    people.update(1 / 30, frame / 30);
    for (const id of jobs.keys())
      if (people.getConstructionAttendance(id)?.readyForBuild) attended.add(id);
    if (attended.size === 2) break;
  }
  assert.deepEqual([...attended].sort(), ["deal-001", "deal-005"]);
  people.dispose();
});

test("compressed walks follow real elapsed time on slow renderers and never exceed their speed cap", () => {
  const state = createDemoState(),
    scene = new THREE.Scene(),
    people = createPeople({ scene });
  let positions = positionsFor(state);
  people.sync(state, { entityPositions: positions });
  const from = positions.get("deal-001").target.clone();
  assert.ok(applyEvent(state, stageEvent(state, "deal-001", "qualified")));
  positions = positionsFor(state);
  const job = {
    from,
    to: positions.get("deal-001").target.clone(),
    phase: "complete",
    status: "complete",
  };
  people.sync(state, {
    entityPositions: positions,
    construction: { get: (id) => (id === "deal-001" ? job : null) },
  });
  const before = people
    .debug()
    .owners.find((owner) => owner.ownerId === "owner-ana");
  people.update(0.12, 0.9); // Same cap supplied by the scene under software rendering.
  const after = people
    .debug()
    .owners.find((owner) => owner.ownerId === "owner-ana");
  assert.ok(
    after.distance - before.distance > 3,
    "uses visible elapsed time beyond camera dt cap",
  );
  assert.ok(
    after.distance - before.distance <= CONSTRUCTION_WALK_SPEED * 0.9 + 0.01,
  );
  const label = people.getOwnerLabels()[0];
  label.position.set(999, 999, 999);
  assert.notEqual(
    people.getOwnerPosition(label.ownerId).x,
    999,
    "label positions are independent snapshots",
  );
  people.dispose();
});

test("reset and Replay snapshots clear attendance without inventing historical reconstruction visits", () => {
  const state = createDemoState(),
    scene = new THREE.Scene(),
    people = createPeople({ scene });
  let positions = positionsFor(state);
  people.sync(state, { entityPositions: positions });
  const from = positions.get("deal-001").target.clone();
  assert.ok(applyEvent(state, stageEvent(state, "deal-001", "qualified")));
  positions = positionsFor(state);
  const job = {
    from,
    to: positions.get("deal-001").target.clone(),
    phase: "deconstruct",
    status: "active",
  };
  const director = { get: (id) => (id === "deal-001" ? job : null) };
  people.sync(state, { entityPositions: positions, construction: director });
  assert.ok(people.getConstructionAttendance("deal-001"));
  const restored = createDemoState();
  people.sync(restored, {
    entityPositions: positionsFor(restored),
    construction: { get: () => null },
  });
  assert.equal(people.getConstructionAttendance("deal-001"), null);
  assert.ok(
    people
      .debug()
      .owners.every(
        (owner) =>
          !owner.attendingConstruction && !owner.queuedConstructionDeals.length,
      ),
  );
  const replay = structuredClone(restored);
  replay.replay = { scope: "deal_stages" };
  people.sync(replay, {
    entityPositions: positionsFor(replay),
    construction: director,
  });
  assert.ok(
    people.getOwnerLabels().every((owner) => !owner.attendingConstruction),
  );
  people.dispose();
});

test("reduced-motion reconstruction poses the salesperson statically beside the destination", () => {
  const state = createDemoState(),
    scene = new THREE.Scene(),
    people = createPeople({ scene, reducedMotion: true });
  let positions = positionsFor(state);
  people.sync(state, { entityPositions: positions });
  const from = positions.get("deal-001").target.clone();
  assert.ok(applyEvent(state, stageEvent(state, "deal-001", "qualified")));
  positions = positionsFor(state);
  const job = {
    from,
    to: positions.get("deal-001").target.clone(),
    phase: "build",
    status: "active",
  };
  people.sync(state, {
    entityPositions: positions,
    construction: { get: (id) => (id === "deal-001" ? job : null) },
  });
  assert.equal(
    people.getConstructionAttendance("deal-001").readyForBuild,
    true,
  );
  const before = people.getOwnerPosition("owner-ana");
  for (let frame = 1; frame <= 60; frame++) people.update(1 / 30, frame / 30);
  assert.deepEqual(people.getOwnerPosition("owner-ana"), before);
  assert.ok(
    before.z > job.to.z + 2,
    "static body is in front of the facade, not inside it",
  );
  people.dispose();
});

test("real construction director waits for the matching salesperson for two successive open-stage sites", () => {
  const state = createDemoState(),
    scene = new THREE.Scene();
  const architecture = createArchitecture(scene),
    people = createPeople({ scene });
  const director = createConstructionDirector({ scene, architecture });
  let positions = positionsFor(state);
  const ids = ["deal-001", "deal-005"],
    origins = new Map();
  ids.forEach((id, index) => {
    origins.set(id, positions.get(id).target.clone());
    architecture.addEntity(
      { id, amount: 5000, variant: index },
      positions.get(id).target,
    );
  });
  architecture.build();
  people.sync(state, { entityPositions: positions, construction: director });
  director.setAttendanceResolver(people.getConstructionAttendance);
  assert.ok(applyEvent(state, stageEvent(state, ids[0], "qualified")));
  assert.ok(applyEvent(state, stageEvent(state, ids[1], "proposal")));
  positions = positionsFor(state);
  for (const id of ids)
    director.start({
      id,
      from: origins.get(id),
      to: positions.get(id).target,
      ownerId: "owner-ana",
      startedAt: 0,
    });
  people.sync(state, { entityPositions: positions, construction: director });
  const snapshot = structuredClone(state),
    presentDuringBuild = new Set();
  for (let frame = 1; frame <= 300; frame++) {
    const now = frame * 0.4;
    director.update(now);
    people.update(0.12, now);
    for (const id of ids) {
      const job = director.get(id);
      if (job.phase === "build" && job.buildProgress > 0) {
        assert.equal(
          people.getConstructionAttendance(id)?.readyForBuild,
          true,
          `${id}: responsible avatar is actually at the facade throughout the build`,
        );
        assert.equal(job.attendanceStatus, "ready");
        presentDuringBuild.add(id);
      }
      assert.notEqual(job.attendanceStatus, "timeout");
    }
    if (ids.every((id) => director.get(id).status === "complete")) break;
  }
  assert.deepEqual([...presentDuringBuild].sort(), ids.sort());
  assert.ok(ids.every((id) => director.get(id).status === "complete"));
  assert.deepEqual(state, snapshot);
  director.dispose();
  people.dispose();
  architecture.dispose();
});
