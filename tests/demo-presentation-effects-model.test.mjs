import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createArchitecture } from "../src/city/architecture.js";
import { createPresentationEffects, sampleStoryPhase, STORY_PARTICLE_LIMIT, STORY_TILE_COUNT } from "../src/city/presentation-effects.js";

function fixture(reducedMotion = false) {
  const scene = new THREE.Scene(), architecture = createArchitecture(scene), land = new THREE.Group();
  scene.add(land); land.position.set(0, -0.7, 0);
  const entity = architecture.addEntity({ id: "crm-original", amount: 24000 }, new THREE.Vector3(12, 0, -17)); architecture.build();
  const effects = createPresentationEffects({ scene, architecture, reducedMotion, getRoots: () => [land],
    getSaleSites: () => ({ from: new THREE.Vector3(12, 0, -17), to: new THREE.Vector3(28, 0, 2.6), sourceId: entity.id }),
    getIndustrySites: () => [-28, -14, 0, 14, 28].map((x) => new THREE.Vector3(x, 0.3, -57.5)) });
  return { scene, architecture, land, entity, effects, dispose() { effects.dispose(); architecture.dispose(); } };
}

test("story phase sampling clamps input and shares a continuous sale choreography", () => {
  assert.equal(sampleStoryPhase("assemble-city", -4).progress, 0);
  assert.equal(sampleStoryPhase("sales-transfer", 0.12).phase, "deconstruct");
  assert.equal(sampleStoryPhase("sales-transfer", 0.5).phase, "transport");
  assert.equal(sampleStoryPhase("sales-transfer", 0.7).phase, "build");
  assert.equal(sampleStoryPhase("celebrate-sale", 0.9).phase, "complete");
  assert.equal(sampleStoryPhase("delivery", 0.97).phase, "delivered");
  assert.equal(sampleStoryPhase("sales-transfer", 0.2, true).phase, "complete");
});

test("ordinary city creates no effect assets, renderer or animation loop", () => {
  const f = fixture();
  assert.equal(f.effects.getState().resourcesCreated, false);
  f.effects.sample({ effect: "none", progress: 0.5 });
  assert.equal(f.effects.getState().resourcesCreated, false);
  assert.equal(f.effects.getState().rendererCount, 0);
  assert.equal(f.effects.getState().animationFrameCount, 0);
  assert.equal(f.entity.buildProgress, 1);
  f.dispose();
});

test("first lazy assembly sample never exposes sales, industrial or celebration geometry", () => {
  const f = fixture();
  assert.equal(f.effects.getState().resourcesCreated, false);
  f.effects.sample({ effect: "assemble-city", progress: 5 / 12 });
  const state = f.effects.getState();
  assert.equal(state.resourcesCreated, true);
  assert.equal(state.geometry.tilesVisible, true);
  assert.equal(state.geometry.tileInstances, STORY_TILE_COUNT);
  assert.equal(state.geometry.truckVisible, false);
  assert.equal(state.geometry.representativeVisible, false);
  assert.equal(state.geometry.confettiVisible, false);
  assert.equal(state.geometry.confettiInstances, 0);
  assert.equal(state.geometry.industryParcelsVisible, false);
  assert.equal(state.geometry.constructionRigs, 0);
  f.dispose();
});

test("puzzle reveal changes actual transforms and restores exact original placement", () => {
  const f = fixture(), position = f.entity.group.position.toArray(), land = f.land.position.toArray();
  f.effects.sample({ effect: "assemble-city", progress: 0.35 });
  assert.equal(f.effects.getState().geometry.tileInstances, STORY_TILE_COUNT);
  assert.ok(f.land.position.y < land[1]);
  assert.ok(f.entity.buildProgress < 1);
  f.effects.clear();
  assert.deepEqual(f.entity.group.position.toArray(), position);
  assert.deepEqual(f.land.position.toArray(), land);
  assert.equal(f.entity.buildProgress, 1);
  assert.equal(f.entity.visible, true);
  assert.equal(f.effects.getState().active, false);
  f.dispose();
});

test("sales transition shows real crane, truck, representative and bounded confetti without moving the CRM entity", () => {
  const f = fixture(), originalPosition = f.entity.group.position.toArray();
  f.effects.sample({ effect: "sales-transfer", progress: 0.1 });
  assert.equal(f.effects.getState().geometry.constructionRigs, 1);
  assert.equal(f.effects.getState().geometry.representativeVisible, true);
  assert.equal(f.entity.visible, false);
  f.effects.sample({ effect: "sales-transfer", progress: 0.5 });
  assert.equal(f.effects.getState().phase, "transport");
  assert.equal(f.effects.getState().geometry.truckVisible, true);
  f.effects.sample({ effect: "celebrate-sale", progress: 0.9 });
  assert.equal(f.effects.getState().geometry.confettiInstances, STORY_PARTICLE_LIMIT);
  assert.equal(f.effects.getState().businessMutation, false);
  assert.deepEqual(f.entity.group.position.toArray(), originalPosition);
  f.effects.clear();
  assert.equal(f.entity.visible, true);
  assert.equal(f.architecture.entities.size, 1);
  assert.deepEqual(f.entity.group.position.toArray(), originalPosition);
  f.dispose();
});

test("seeking backward restarts the same bounded rig and gives the same phase and focus", () => {
  const f = fixture();
  f.effects.sample({ effect: "sales-transfer", progress: 0.5 });
  const before = f.effects.getState();
  f.effects.sample({ effect: "celebrate-sale", progress: 1 });
  f.effects.sample({ effect: "sales-transfer", progress: 0.5 });
  const after = f.effects.getState();
  assert.deepEqual(after.focus, before.focus);
  assert.equal(after.phase, before.phase);
  assert.equal(after.geometry.constructionRigs, 1);
  f.dispose();
});

test("industrial journey samples actual parcels and truck while keeping source records untouched", () => {
  const f = fixture();
  f.effects.sample({ effect: "production-flow", progress: 0.2 });
  assert.equal(f.effects.getState().geometry.industryParcelsVisible, true);
  f.effects.sample({ effect: "delivery", progress: 0.8 });
  assert.equal(f.effects.getState().geometry.truckVisible, true);
  assert.equal(f.effects.getState().phase, "transit");
  const focus = f.effects.getState().focus;
  f.effects.sample({ effect: "delivery", progress: 0.8 });
  assert.deepEqual(f.effects.getState().focus, focus);
  assert.equal(f.entity.visible, true);
  assert.equal(f.entity.buildProgress, 1);
  assert.equal(f.architecture.entities.size, 1);
  f.dispose();
});

test("reduced motion samples the final city and sale state without puzzle or confetti motion", () => {
  const f = fixture(true);
  f.effects.sample({ effect: "assemble-city", progress: 0.02 });
  assert.equal(f.entity.buildProgress, 1);
  assert.equal(f.effects.getState().geometry.tilesVisible, false);
  f.effects.sample({ effect: "sales-transfer", progress: 0.02 });
  assert.equal(f.effects.getState().phase, "complete");
  assert.equal(f.effects.getState().geometry.constructionRigs, 0);
  assert.equal(f.effects.getState().geometry.confettiVisible, false);
  f.dispose();
});
