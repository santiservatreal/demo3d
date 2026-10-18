import test from "node:test";
import assert from "node:assert/strict";
import { STORY_CHAPTERS, STORY_CHOICES, STORY_TOUR_CHAPTERS, STORY_TOUR_DURATION, getStoryTourDuration, sampleStory } from "../src/demo/story-model.js";
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
    assert.ok(chapter.duration > 0 && chapter.duration < 180);
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
  assert.equal(sampleStory("intro", 8).cityProgress, 0.5);
  assert.equal(sampleStory("intro", 16).cityProgress, 1);
  assert.equal(sampleStory("intro", 18).cityProgress, 1);
  assert.equal(sampleStory("commercial", 0).cityProgress, 1);
  assert.equal(sampleStory("intro", -200).chapterElapsed, 0);
  assert.equal(sampleStory("intro", NaN).chapterElapsed, 0);
});

const beatAt = (chapter, id) => STORY_CHAPTERS[chapter].beats.find((entry) => entry.id === id);
const sampleBeat = (chapter, id, progress = 0) => {
  const beat = beatAt(chapter, id);
  return sampleStory(chapter, beat.start + beat.duration * progress);
};

test("the extended narrative gives every sales stage and construction phase its own close shot", () => {
  assert.equal(STORY_CHAPTERS.intro.duration, 32);
  assert.ok(STORY_CHAPTERS.commercial.duration >= 100);
  for (const id of ["first-contact", "qualified-opportunity", "the-proposal", "negotiation"]) {
    const frame = sampleBeat("commercial", id);
    assert.equal(frame.camera.mode, "street");
    assert.equal(frame.labels.mode, "stage");
    assert.equal(frame.labels.activeId, frame.target.id);
    assert.ok(frame.duration >= 10);
  }
  for (const id of ["sale-deconstruct", "sale-transport", "sale-rebuild"]) {
    assert.ok(beatAt("commercial", id).duration >= 15);
  }
  assert.equal(sampleBeat("commercial", "sale-transport").camera.mode, "follow");
});

test("sale choreography stays continuous from dismantling through the truck and rebuilding to confetti", () => {
  const transition = sampleBeat("commercial", "sale-deconstruct");
  assert.deepEqual(transition.fromTarget, { kind: "sales-stage", id: "negotiation" });
  assert.deepEqual(transition.target, { kind: "sales-stage", id: "negotiation" });
  assert.equal(transition.effectStageProgress, 0);
  assert.equal(sampleBeat("commercial", "sale-transport").effectStageProgress, 0.238);
  assert.equal(sampleBeat("commercial", "sale-rebuild").effectStageProgress, 0.578);
  assert.equal(sampleBeat("commercial", "sale-won").effectStageProgress, 0.85);
  let previous = 0;
  for (let seconds = transition.beatStart; seconds < STORY_CHAPTERS.commercial.duration; seconds += 0.125) {
    const frame = sampleStory("commercial", seconds);
    assert.ok(frame.effectStageProgress >= previous, `rewind at ${seconds}`);
    previous = frame.effectStageProgress;
  }
  const end = sampleStory("commercial", Infinity);
  assert.equal(end.holdingChoice, true);
  assert.equal(end.effectStageProgress, 1);
  assert.equal(end.effect, "celebrate-sale");
  assert.equal(sampleBeat("commercial", "sale-won", 0.5).camera.mode, "celebration");
});

test("industrial narrative shows every real stage with a continuous parcel and delivery journey", () => {
  assert.ok(STORY_CHAPTERS.industrial.duration >= 80);
  const stages = [["manufacturing", 0], ["packing", 0.24], ["warehouse", 0.45], ["production-in-motion", 0.63], ["delivery-arrives", 0.89], ["delivered", 0.96]];
  for (const [id, progress] of stages) {
    const frame = sampleBeat("industrial", id);
    assert.equal(frame.effectStageProgress, progress);
    assert.equal(frame.labels.activeId, frame.target.id);
    assert.deepEqual(frame.labels.visibleIds, ["manufacturing", "packing", "warehouse", "transit", "delivered"]);
  }
  let previous = 0;
  for (let seconds = beatAt("industrial", "manufacturing").start; seconds < STORY_CHAPTERS.industrial.duration; seconds += 0.125) {
    const frame = sampleStory("industrial", seconds);
    assert.ok(frame.effectStageProgress >= previous);
    previous = frame.effectStageProgress;
  }
  const end = sampleStory("industrial", Infinity);
  assert.equal(end.effectStageProgress, 1);
  assert.equal(end.holdingChoice, true);
  assert.equal(end.effect, "delivery");
  assert.equal(sampleBeat("communications", "calls").effectStageProgress, 0.5);
});

test("context labels hide during assembly and decisions and identify the five commercial neighborhoods", () => {
  assert.equal(sampleStory("intro", 4).labels.mode, "none");
  assert.deepEqual(sampleStory("intro", 4).labels.visibleIds, []);
  const neighborhoods = sampleBeat("intro", "neighborhoods");
  assert.equal(neighborhoods.labels.mode, "districts");
  assert.deepEqual(neighborhoods.labels.visibleIds, ["commercial", "industrial", "communications"]);
  assert.deepEqual(sampleBeat("commercial", "sales-overview").labels.visibleIds, ["lead", "qualified", "proposal", "negotiation", "won"]);
  for (const chapter of Object.values(STORY_CHAPTERS)) {
    assert.equal(sampleStory(chapter.id, Infinity).labels.mode, "none");
    assert.deepEqual(sampleStory(chapter.id, Infinity).labels.visibleIds, []);
  }
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
  assert.equal(player.getState().elapsed, STORY_CHAPTERS.intro.duration);
  assert.equal(player.getState().status, "choice");
  assert.equal(clock.pending(), 0);
  const count = frames.length;
  clock.tick(40000);
  assert.equal(frames.length, count);
  player.choose("industrial");
  assert.equal(player.getState().chapterId, "industrial");
  assert.equal(player.getState().elapsed, 0);
  assert.equal(clock.pending(), 1);
  clock.tick(12000);
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
  assert.equal(player.getState().elapsed, 8);
  assert.equal(player.getState().status, "playing");
  player.pause();
  player.next();
  assert.equal(player.getState().elapsed, 18);
  assert.equal(player.getState().status, "paused");
  player.previous();
  assert.equal(player.getState().elapsed, 8);
  assert.equal(clock.pending(), 0);
  player.seek(STORY_CHAPTERS.commercial.duration);
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

test("the opt-in full tour crosses chapter boundaries without intermediate decisions and retains overshoot", () => {
  const { clock, player, frames } = playerFixture();
  assert.deepEqual(STORY_TOUR_CHAPTERS, ["intro", "commercial", "industrial"]);
  assert.equal(getStoryTourDuration(), STORY_TOUR_DURATION);
  player.play({ chapter: "intro", tour: true });
  assert.equal(player.getState().tour, true);
  assert.equal(player.getState().tourDuration, 242);
  clock.tick(34000);
  assert.equal(player.getState().chapterId, "commercial");
  assert.equal(player.getState().elapsed, 2);
  assert.equal(player.getState().tourElapsed, 34);
  assert.equal(player.getState().status, "playing");
  clock.tick(116000);
  assert.equal(player.getState().chapterId, "industrial");
  assert.equal(player.getState().elapsed, 4);
  assert.equal(player.getState().tourElapsed, 150);
  assert.equal(frames.some((frame) => frame.holdingChoice), false);
  clock.tick(100000);
  assert.equal(player.getState().chapterId, "industrial");
  assert.equal(player.getState().tourElapsed, STORY_TOUR_DURATION);
  assert.equal(player.getState().status, "choice");
  assert.equal(clock.pending(), 0);
});

test("one throttled frame may cross the whole tour but cannot create extra animation clocks", () => {
  const { clock, player, frames } = playerFixture();
  player.play({ tour: true });
  clock.tick(900000);
  assert.equal(player.getState().status, "choice");
  assert.equal(player.getState().tourElapsed, STORY_TOUR_DURATION);
  assert.equal(frames.length, 2);
  assert.equal(clock.pending(), 0);
});

test("tour pause, resume and global seeking preserve the complete timeline", () => {
  const { clock, player } = playerFixture();
  player.play({ tour: true });
  clock.tick(31000);
  player.pause();
  clock.tick(180000);
  assert.equal(player.getState().tourElapsed, 31);
  player.seekTour(160);
  assert.equal(player.getState().chapterId, "industrial");
  assert.equal(player.getState().elapsed, 14);
  assert.equal(player.getState().status, "paused");
  assert.equal(clock.pending(), 0);
  player.seekTour(80);
  assert.equal(player.getState().chapterId, "commercial");
  assert.equal(player.getState().elapsed, 48);
  player.resume();
  clock.tick(2000);
  assert.equal(player.getState().tourElapsed, 82);
  assert.equal(clock.pending(), 1);
  player.seekTour(0);
  assert.equal(player.getState().frame.cityProgress, 0);
  player.seekTour(Infinity);
  assert.equal(player.getState().status, "choice");
  assert.equal(player.getState().tourElapsed, STORY_TOUR_DURATION);
  player.seekTour(NaN);
  assert.equal(player.getState().tourElapsed, 0);
  assert.equal(player.getState().status, "paused");
});

test("manual decisions cancel the full tour and ordinary playback still holds at each chapter", () => {
  const { clock, player } = playerFixture();
  player.play({ tour: true });
  player.choose("commercial");
  assert.equal(player.getState().tour, false);
  assert.equal(player.getState().tourDuration, STORY_CHAPTERS.commercial.duration);
  clock.tick(200000);
  assert.equal(player.getState().chapterId, "commercial");
  assert.equal(player.getState().status, "choice");
  player.play({ tour: true });
  player.reset();
  assert.equal(player.getState().tour, false);
  assert.equal(player.getState().status, "idle");
  player.reset({ autoplay: true, tour: true });
  assert.equal(player.getState().tour, true);
  assert.equal(player.getState().tourElapsed, 0);
});

test("tour beat navigation can revisit the previous chapter and cancels stale callbacks after global seek", () => {
  const { clock, player, frames } = playerFixture();
  player.play({ tour: true });
  player.seekTour(STORY_CHAPTERS.intro.duration);
  assert.equal(player.getState().chapterId, "commercial");
  assert.equal(player.getState().canPrevious, true);
  player.previous();
  assert.equal(player.getState().chapterId, "intro");
  assert.equal(player.getState().frame.beatId, "neighborhoods");
  player.next();
  assert.equal(player.getState().chapterId, "commercial");
  assert.equal(player.getState().elapsed, 0);
  const stale = clock.latest();
  player.seekTour(170);
  const count = frames.length;
  clock.runStale(stale);
  assert.equal(frames.length, count);
  assert.equal(player.getState().chapterId, "industrial");
  assert.equal(clock.pending(), 1);
});

test("a paused tour advances across chapter boundaries without opening an intermediate choice", () => {
  const { clock, player } = playerFixture();
  player.play({ tour: true });
  player.pause();
  player.seekTour(beatAt("intro", "neighborhoods").start);
  player.next();
  assert.equal(player.getState().chapterId, "commercial");
  assert.equal(player.getState().elapsed, 0);
  assert.equal(player.getState().status, "paused");
  assert.equal(player.getState().holdingChoice, false);
  assert.equal(clock.pending(), 0);
  player.seek(STORY_CHAPTERS.commercial.duration);
  assert.equal(player.getState().chapterId, "industrial");
  assert.equal(player.getState().elapsed, 0);
  assert.equal(player.getState().status, "paused");
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
