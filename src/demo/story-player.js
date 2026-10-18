import { getStoryChapter, sampleStory } from "./story-model.js";

/** One cancellable animation clock for a presentation. All times exposed are seconds. */
export function createStoryPlayer({
  onFrame = () => {}, onState = () => {},
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (handle) => cancelAnimationFrame(handle),
} = {}) {
  let chapterId = "intro";
  let elapsed = 0;
  let status = "idle";
  let anchor = 0;
  let handle = null;
  let generation = 0;
  let disposed = false;
  let frame = sampleStory(chapterId, elapsed);

  function getState() {
    return Object.freeze({
      status, chapterId, elapsed, duration: frame.chapterDuration, frame, generation, disposed,
      playing: status === "playing", paused: status === "paused", holdingChoice: status === "choice",
      canPrevious: frame.beatIndex > 0, canNext: frame.beatIndex < frame.beatCount - 1,
    });
  }

  function cancel() {
    generation += 1;
    if (handle !== null) cancelFrame(handle);
    handle = null;
  }

  function publish() {
    const state = getState();
    onFrame(frame, state);
    if (!disposed) onState(state);
    return state;
  }

  function sample() {
    frame = sampleStory(chapterId, elapsed);
    elapsed = frame.chapterElapsed;
    if (frame.holdingChoice) status = "choice";
  }

  function synchronize(timestamp = now()) {
    if (status === "playing") {
      elapsed = Math.max(elapsed, (timestamp - anchor) / 1000);
      sample();
    }
  }

  function schedule() {
    if (disposed || status !== "playing" || handle !== null) return;
    const expected = generation;
    handle = requestFrame((timestamp) => {
      if (disposed || expected !== generation) return;
      handle = null;
      synchronize(Number.isFinite(timestamp) ? timestamp : now());
      publish();
      if (expected === generation) schedule();
    });
  }

  function startAt(nextChapter, position, autoplay) {
    if (disposed) return getState();
    getStoryChapter(nextChapter); // Validate before cancelling the current presentation.
    cancel();
    chapterId = nextChapter;
    elapsed = position;
    status = autoplay ? "playing" : "paused";
    sample();
    anchor = now() - elapsed * 1000;
    const state = publish();
    schedule();
    return state;
  }

  function play(options = {}) {
    if (disposed) return getState();
    if (typeof options === "string") options = { chapter: options };
    if (status === "paused" && !Object.keys(options).length) return resume();
    return startAt(options.chapter ?? "intro", options.elapsed ?? 0, true);
  }

  function pause() {
    if (disposed || status !== "playing") return getState();
    synchronize();
    cancel();
    if (status !== "choice") status = "paused";
    return publish();
  }

  function resume() {
    if (disposed || status !== "paused") return getState();
    return startAt(chapterId, elapsed, true);
  }

  function seek(seconds) {
    if (disposed) return getState();
    return startAt(chapterId, seconds, status === "playing");
  }

  function next() {
    if (disposed || frame.holdingChoice) return getState();
    const chapter = getStoryChapter(chapterId);
    return startAt(chapterId, chapter.beats[frame.beatIndex + 1].start, status === "playing");
  }

  function previous() {
    if (disposed || frame.beatIndex === 0) return getState();
    const chapter = getStoryChapter(chapterId);
    return startAt(chapterId, chapter.beats[frame.beatIndex - 1].start, status === "playing");
  }

  function choose(nextChapter) {
    if (!["commercial", "industrial", "communications"].includes(nextChapter)) {
      throw new RangeError(`Unknown presentation choice: ${String(nextChapter)}`);
    }
    return startAt(nextChapter, 0, true);
  }

  function reset({ autoplay = false } = {}) {
    if (autoplay || disposed) return startAt("intro", 0, autoplay);
    cancel();
    chapterId = "intro";
    elapsed = 0;
    status = "idle";
    sample();
    anchor = now();
    return publish();
  }

  function dispose() {
    if (disposed) return;
    cancel();
    disposed = true;
    status = "disposed";
    onState(getState());
  }

  return { play, pause, resume, next, previous, choose, reset, seek, getState, dispose };
}
