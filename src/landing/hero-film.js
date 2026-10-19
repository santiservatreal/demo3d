/** A decorative, local film. Playback follows visibility and motion preference. */
export function createHeroFilm({ root } = {}) {
  const video = root?.querySelector("[data-hero-film]");
  const toggle = root?.querySelector("[data-hero-film-toggle]");
  if (!video || !toggle) throw new TypeError("Render the hero film before mounting it.");
  const document = root.ownerDocument;
  const view = document.defaultView;
  const preference = view.matchMedia("(prefers-reduced-motion: reduce)");
  const label = toggle.querySelector("[data-hero-film-toggle-label]");
  const icon = toggle.querySelector("[data-hero-film-toggle-icon]");
  const header = document.querySelector(".bv-header");
  let visible = false;
  let manuallyPaused = false;
  let pageSuspended = false;
  let disposed = false;
  let unavailable = false;
  let hasPlayed = false;
  let pendingPlay = false;
  let generation = 0;

  video.muted = true;
  video.defaultMuted = true;

  function sync() {
    const playing = !video.paused && !video.ended;
    const poster = preference.matches || unavailable || !hasPlayed;
    root.dataset.heroFilmState = poster ? "poster" : playing ? "playing" : "paused";
    toggle.hidden = preference.matches || unavailable;
    toggle.setAttribute("aria-pressed", String(manuallyPaused));
    const text = playing ? "Pausar animación" : "Reproducir animación";
    toggle.setAttribute("aria-label", text);
    label.textContent = text;
    icon.textContent = playing ? "Ⅱ" : "▷";
  }

  function pause() {
    generation++;
    pendingPlay = false;
    video.pause();
    sync();
  }

  function reconcile() {
    if (disposed) return;
    const shouldPlay = visible && !manuallyPaused && !preference.matches && !unavailable && !pageSuspended && document.visibilityState !== "hidden";
    video.preload = preference.matches ? "none" : "metadata";
    if (!shouldPlay) { pause(); return; }
    if (!video.paused || pendingPlay) { sync(); return; }
    const attempt = ++generation;
    pendingPlay = true;
    Promise.resolve(video.play()).catch(() => {
      if (disposed || generation !== attempt) return;
      // A browser may require a user gesture; the same button can retry it.
      manuallyPaused = true;
    }).finally(() => {
      if (disposed || generation !== attempt) return;
      pendingPlay = false;
      sync();
    });
  }

  const playing = () => { hasPlayed = true; sync(); };
  const playbackChanged = () => sync();
  const failed = () => { unavailable = true; pause(); };
  const click = () => { manuallyPaused = !(video.paused || manuallyPaused); reconcile(); };
  const preferenceChanged = () => {
    if (preference.matches) {
      pause();
      if (video.readyState >= 1) video.currentTime = 0;
    }
    reconcile();
  };
  const pageHide = () => { pageSuspended = true; pause(); };
  const pageShow = () => { pageSuspended = false; reconcile(); };
  const visibilityChanged = () => reconcile();

  video.addEventListener("playing", playing);
  video.addEventListener("pause", playbackChanged);
  video.addEventListener("error", failed);
  video.querySelector("source")?.addEventListener("error", failed);
  toggle.addEventListener("click", click);
  document.addEventListener("visibilitychange", visibilityChanged);
  preference.addEventListener("change", preferenceChanged);
  view.addEventListener("pagehide", pageHide);
  view.addEventListener("pageshow", pageShow);

  const observer = new view.IntersectionObserver(entries => {
    const entry = entries[0];
    visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.05);
    header?.toggleAttribute("data-over-film", visible);
    reconcile();
  }, { threshold: 0.05 });
  observer.observe(root);
  sync();

  return {
    getState: () => ({
      playing: !video.paused && !video.ended,
      visible,
      reducedMotion: preference.matches,
      manuallyPaused,
      unavailable,
      disposed,
      currentTime: video.currentTime,
      muted: video.muted,
    }),
    dispose() {
      if (disposed) return;
      pause();
      disposed = true;
      observer.disconnect();
      video.removeEventListener("playing", playing);
      video.removeEventListener("pause", playbackChanged);
      video.removeEventListener("error", failed);
      video.querySelector("source")?.removeEventListener("error", failed);
      toggle.removeEventListener("click", click);
      document.removeEventListener("visibilitychange", visibilityChanged);
      preference.removeEventListener("change", preferenceChanged);
      view.removeEventListener("pagehide", pageHide);
      view.removeEventListener("pageshow", pageShow);
    },
  };
}
