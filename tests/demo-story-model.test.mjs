import test from "node:test";
import assert from "node:assert/strict";
import { STORY_CHAPTERS, STORY_CHOICES, sampleStory } from "../src/demo/story-model.js";
import { createStoryPlayer } from "../src/demo/story-player.js";
import { isPresentationTarget } from "../src/demo/city-controller.js";
import { createDemoState } from "../src/city/model.js";
import { createIndustryState } from "../src/city/industry-model.js";

function virtualClock() {
  let time = 1000;
  let sequence = 0;
  const pending = new Map();
  const all = new Map();
  return {
    now: () => time,
    requestFrame(callback) {
      const id = ++sequence;
      pending.set(id, callback);
      all.set(id, callback);
      return id;
    },
    cancelFrame: (id) => pending.delete(id),
    tick(milliseconds) {
      time += milliseconds;
      const scheduled = [...pending.values()];
      pending.clear();
      scheduled.forEach((callback) => callback(time));
    },
    advanceWithoutFrame(milliseconds) { time += milliseconds; },
    pending: () => pending.size,
    latest: () => sequence,
    runStale: (id) => all.get(id)?.(time),
  };
}

function playerFixture() {
  const clock = virtualClock();
  const frames = [];
  const states = [];
  const player = createStoryPlayer({ ...clock, onFrame: (frame) => frames.push(frame), onState: (state) => states.push(state) });
  return { clock, player, frames, states };
}

test("presentation chapters have finite ordered beats and stop at an explicit decision", () => {
  for (const [id, chapter] of Object.entries(STORY_CHAPTERS)) {
    assert.equal(chapter.id, id);
    assert.ok(chapter.duration > 0 && chapter.duration < 60);
    assert.equal(chapter.beats[0].start, 0);
    assert.equal(chapter.beats.at(-1).choice, true);
    assert.equal(chapter.beats.at(-1).start, chapter.duration);
    for (let index = 1; index < chapter.beats.length; index++) {
      assert.equal(chapter.beats[index].start, chapter.beats[index - 1].end);
    }
    assert.deepEqual(sampleStory(id, Infinity).choices, STORY_CHOICES);
  }
  assert.throws(() => { STORY_CHAPTERS.intro.beats[0].duration = 900; }, TypeError);
});

test("every chapter uses real presentation targets without changing its CRM or industrial data", () => {
  const snapshot = { crm: createDemoState(), industry: createIndustryState() };
  const before = JSON.stringify(snapshot);
  for (const chapter of Object.values(STORY_CHAPTERS)) {
    for (const entry of chapter.beats) {
      const frame = sampleStory(chapter.id, entry.start);
      assert.equal(isPresentationTarget(frame.target, snapshot), true, `${chapter.id}/${entry.id}`);
      assert.equal(isPresentationTarget(frame.fromTarget, snapshot), true, `${chapter.id}/${entry.id} origin`);
    }
  }
  assert.equal(JSON.stringify(snapshot), before);
});

test("world assembly grows from zero to complete and does not restart in subsequent beats", () => {
  assert.equal(sampleStory("intro", 0).cityProgress, 0);
  assert.equal(sampleStory("intro", 6).cityProgress, 0.5);
  assert.equal(sampleStory("intro", 12).cityProgress, 1);
  assert.equal(sampleStory("intro", 18).cityProgress, 1);
  assert.equal(sampleStory("commercial", 0).cityProgress, 1);
  assert.equal(sampleStory("intro", -200).chapterElapsed, 0);
  assert.equal(sampleStory("intro", NaN).chapterElapsed, 0);
});

test("sale animation continues through reconstruction and celebration with exact camera targets", () => {
  const transition = sampleStory("commercial", 24);
  assert.equal(transition.beatId, "sale-in-motion");
  assert.deepEqual(transition.fromTarget, { kind: "sales-stage", id: "negotiation" });
  assert.deepEqual(transition.target, { kind: "sales-stage", id: "won" });
  assert.equal(transition.effectStageProgress, 0);
  assert.equal(sampleStory("commercial", 31.5).effectStageProgress, 0.425);
  const celebration = sampleStory("commercial", 39);
  assert.equal(celebration.beatId, "sale-won");
  assert.equal(celebration.effectStageProgress, 0.85);
  assert.ok(sampleStory("commercial", 47.99).effectStageProgress > 0.99);
  assert.equal(sampleStory("commercial", 48).holdingChoice, true);
  assert.equal(sampleStory("commercial", 10).cameraProgress, 1 / 4 / 0.45);
});

test("industrial production and delivery are a single continuous illustration", () => {
  assert.equal(sampleStory("industrial", 12).effectStageProgress, 0);
  assert.equal(sampleStory("industrial", 18).effectStageProgress, 0.36);
  assert.equal(sampleStory("industrial", 24).effectStageProgress, 0.72);
  assert.equal(sampleStory("industrial", 32).effectStageProgress, 1);
  assert.equal(sampleStory("industrial", 35).effectStageProgress, 1);
  assert.equal(sampleStory("industrial", 36).holdingChoice, true);
  assert.equal(sampleStory("communications", 11).effectStageProgress, 0.5);
});

test("pause samples the exact current instant and resume excludes all paused wall time", () => {
  const { clock, player, frames } = playerFixture();
  player.play();
  clock.tick(2300);
  clock.advanceWithoutFrame(450);
  player.pause();
  assert.equal(player.getState().elapsed, 2.75);
  assert.equal(player.getState().status, "paused");
  const frozen = frames.at(-1);
  clock.tick(120000);
  assert.equal(frames.at(-1), frozen);
  assert.equal(clock.pending(), 0);
  player.resume();
  clock.tick(1250);
  assert.equal(player.getState().elapsed, 4);
  assert.equal(clock.pending(), 1);
});

test("an audience decision stops the animation clock until a choice is made", () => {
  const { clock, player, frames } = playerFixture();
  player.play();
  clock.tick(40000);
  assert.equal(player.getState().elapsed, 24);
  assert.equal(player.getState().status, "choice");
  assert.equal(clock.pending(), 0);
  const count = frames.length;
  clock.tick(40000);
  assert.equal(frames.length, count);
  player.choose("industrial");
  assert.equal(player.getState().chapterId, "industrial");
  assert.equal(player.getState().elapsed, 0);
  assert.equal(clock.pending(), 1);
  clock.tick(6000);
  assert.equal(player.getState().frame.beatId, "manufacturing");
});

test("changing chapters invalidates old callbacks instead of replaying stale effects", () => {
  const { clock, player, frames } = playerFixture();
  player.play();
  const stale = clock.latest();
  player.choose("commercial");
  const count = frames.length;
  clock.runStale(stale);
  assert.equal(frames.length, count);
  assert.equal(player.getState().chapterId, "commercial");
  assert.equal(player.getState().elapsed, 0);
  assert.equal(clock.pending(), 1);
});

test("next and previous seek exact beat boundaries while respecting pause", () => {
  const { clock, player } = playerFixture();
  player.choose("commercial");
  player.next();
  assert.equal(player.getState().frame.beatId, "first-contact");
  assert.equal(player.getState().elapsed, 4);
  assert.equal(player.getState().status, "playing");
  player.pause();
  player.next();
  assert.equal(player.getState().elapsed, 9);
  assert.equal(player.getState().status, "paused");
  player.previous();
  assert.equal(player.getState().elapsed, 4);
  assert.equal(clock.pending(), 0);
  player.seek(48);
  assert.equal(player.getState().status, "choice");
  player.previous();
  assert.equal(player.getState().frame.beatId, "sale-won");
  assert.equal(player.getState().status, "paused");
});

test("seeking regenerates the exact scene sample and replay cancels the old animation", () => {
  const { clock, player, frames } = playerFixture();
  player.choose("commercial");
  player.seek(30);
  const expected = sampleStory("commercial", 30);
  assert.deepEqual(frames.at(-1), expected);
  const stale = clock.latest();
  player.reset({ autoplay: true });
  assert.equal(player.getState().frame.cityProgress, 0);
  assert.equal(player.getState().chapterId, "intro");
  const count = frames.length;
  clock.runStale(stale);
  assert.equal(frames.length, count);
  assert.equal(clock.pending(), 1);
});

test("reset without autoplay returns to the idle preview without scheduling an animation", () => {
  const { clock, player } = playerFixture();
  player.choose("commercial");
  clock.tick(32000);
  player.reset();
  assert.equal(player.getState().status, "idle");
  assert.equal(player.getState().chapterId, "intro");
  assert.equal(player.getState().elapsed, 0);
  assert.equal(player.getState().frame.cityProgress, 0);
  assert.equal(clock.pending(), 0);
  player.play();
  assert.equal(player.getState().status, "playing");
  assert.equal(clock.pending(), 1);
});

test("invalid choices leave the current presentation and scheduled frame intact", () => {
  const { clock, player } = playerFixture();
  player.play();
  const before = player.getState();
  assert.throws(() => player.choose("not-a-chapter"), RangeError);
  assert.throws(() => player.play({ chapter: "not-a-chapter" }), RangeError);
  assert.deepEqual(player.getState(), before);
  assert.equal(clock.pending(), 1);
});

test("dispose cancels queued work and makes all later controls inert", () => {
  const { clock, player, frames } = playerFixture();
  player.play();
  const stale = clock.latest();
  player.dispose();
  const count = frames.length;
  clock.tick(10000);
  clock.runStale(stale);
  player.play();
  player.resume();
  player.next();
  player.previous();
  player.choose("commercial");
  player.seek(15);
  player.reset();
  assert.equal(frames.length, count);
  assert.equal(clock.pending(), 0);
  assert.equal(player.getState().status, "disposed");
});
