import { getStoryChapter, sampleStory, STORY_TOUR } from "./story-model.js";

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
  let tour = false;
  let frame = sampleStory(chapterId, elapsed);
  const tourDuration = STORY_TOUR.reduce((sum, id) => sum + getStoryChapter(id).duration, 0);
  const tourOffset = (id) => {
    const index = STORY_TOUR.indexOf(id);
    return index < 0 ? 0 : STORY_TOUR.slice(0, index).reduce((sum, entry) => sum + getStoryChapter(entry).duration, 0);
  };

  function getState() {
    return Object.freeze({
      status, chapterId, elapsed, duration: frame.chapterDuration, frame, generation, disposed,
      tour, tourElapsed: tour ? tourOffset(chapterId) + elapsed : elapsed,
      tourDuration: tour ? tourDuration : frame.chapterDuration,
      playing: status === "playing", paused: status === "paused", holdingChoice: status === "choice",
      canPrevious: frame.beatIndex > 0 || tour && STORY_TOUR.indexOf(chapterId) > 0,
      canNext: frame.beatIndex < frame.beatCount - 1,
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
    // Carry elapsed wall time into the next chapter, even after a throttled frame.
    // Intermediate choices are never published during the continuous tour.
    while (tour) {
      const duration = getStoryChapter(chapterId).duration;
      const index = STORY_TOUR.indexOf(chapterId);
      if (elapsed < duration || index < 0 || index >= STORY_TOUR.length - 1) break;
      elapsed -= duration;
      chapterId = STORY_TOUR[index + 1];
      anchor += duration * 1000;
    }
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
    const nextChapter = options.chapter ?? "intro";
    getStoryChapter(nextChapter);
    tour = options.tour === true && STORY_TOUR.includes(nextChapter);
    return startAt(nextChapter, options.elapsed ?? 0, true);
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

  function seekTour(seconds) {
    if (disposed) return getState();
    if (!tour) return seek(seconds);
    const numeric = Number(seconds);
    const position = Number.isNaN(numeric) ? 0 : Math.max(0, Math.min(tourDuration, numeric));
    let local = position;
    for (const id of STORY_TOUR) {
      const duration = getStoryChapter(id).duration;
      if (local < duration || id === STORY_TOUR.at(-1)) return startAt(id, local, status === "playing");
      local -= duration;
    }
    return getState();
  }

  function next() {
    if (disposed || frame.holdingChoice) return getState();
    const chapter = getStoryChapter(chapterId);
    return startAt(chapterId, chapter.beats[frame.beatIndex + 1].start, status === "playing");
  }

  function previous() {
    if (disposed) return getState();
    if (frame.beatIndex === 0) {
      const index = STORY_TOUR.indexOf(chapterId);
      if (!tour || index <= 0) return getState();
      const previousChapter = getStoryChapter(STORY_TOUR[index - 1]);
      return startAt(previousChapter.id, previousChapter.beats.at(-2).start, status === "playing");
    }
    const chapter = getStoryChapter(chapterId);
    return startAt(chapterId, chapter.beats[frame.beatIndex - 1].start, status === "playing");
  }

  function choose(nextChapter) {
    if (!['commercial', 'industrial', 'communications'].includes(nextChapter)) {
      throw new RangeError(`Unknown presentation choice: ${String(nextChapter)}`);
    }
    if (disposed) return getState();
    tour = false;
    return startAt(nextChapter, 0, true);
  }

  function reset({ autoplay = false, tour: nextTour = false } = {}) {
    if (disposed) return getState();
    tour = nextTour === true;
    if (autoplay) return startAt("intro", 0, true);
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

  return { play, pause, resume, next, previous, choose, reset, seek, seekTour, getState, dispose };
}
