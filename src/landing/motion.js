const DEFAULT_DURATION = 1350;
const MAX_DURATION = 2400;
const FORMATS = new Set(["eur", "integer", "percent"]);
const formatterCache = new Map();

/** Parse presentation markup without allowing malformed values to create endless work. */
export function createLandingMetric({ target, format = "integer", duration, decimals } = {}) {
  if ((typeof target === "string" && target.trim() === "") || target === null || target === undefined) return null;
  const value = Number(target);
  if (!Number.isFinite(value)) return null;
  const precision = decimals === undefined || decimals === "" ? 0 : Math.max(0, Math.min(3, Math.trunc(Number(decimals) || 0)));
  const requestedDuration = duration === undefined || duration === "" ? DEFAULT_DURATION : Number(duration);
  return Object.freeze({
    target: value,
    format: FORMATS.has(format) ? format : "integer",
    decimals: precision,
    duration: Number.isFinite(requestedDuration) ? Math.max(0, Math.min(MAX_DURATION, requestedDuration)) : DEFAULT_DURATION,
  });
}

/** Values use the Spanish locale and the same units at every animation frame. */
export function formatLandingMetric(value, { format = "integer", decimals = 0 } = {}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeFormat = FORMATS.has(format) ? format : "integer";
  const precision = Math.max(0, Math.min(3, Math.trunc(Number(decimals) || 0)));
  const key = `${safeFormat}:${precision}`;
  if (!formatterCache.has(key)) formatterCache.set(key, new Intl.NumberFormat("es-ES", {
    ...(safeFormat === "eur" ? { style: "currency", currency: "EUR" } : {}),
    ...(safeFormat === "percent" ? { style: "percent" } : {}),
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: true,
  }));
  return formatterCache.get(key).format(safeFormat === "percent" ? safeValue / 100 : safeValue);
}

/** A bounded, deterministic sample; pausing never depends on wall-clock time. */
export function sampleLandingMetric(metric, elapsed) {
  const milliseconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : elapsed === Infinity ? metric.duration : 0;
  const progress = metric.duration === 0 ? 1 : Math.min(1, milliseconds / metric.duration);
  const eased = 1 - (1 - progress) ** 3;
  return { value: progress === 1 ? metric.target : metric.target * eased, progress, complete: progress === 1 };
}

const select = (root, selector) => [
  ...(root.matches?.(selector) ? [root] : []),
  ...root.querySelectorAll(selector),
];

/**
 * One observer and one short-lived animation clock for the landing page.
 * It only changes presentation elements: no CRM data, timers, renderers or requests.
 */
export function createLandingMotion({ root = globalThis.document, onSection } = {}) {
  if (!root?.querySelectorAll) throw new TypeError("A landing root is required.");
  const document = root.ownerDocument || root;
  const view = document.defaultView;
  if (!view) throw new TypeError("The landing root must belong to a window.");
  const media = view.matchMedia?.("(prefers-reduced-motion: reduce)");
  const metrics = new Map();
  const progressBars = new Map();
  const sequences = new Set();
  const units = new Map();
  const active = new Set();
  let reducedMotion = Boolean(media?.matches);
  let pageSuspended = false;
  let disposed = false;
  let pendingFrame = 0;
  let frameCount = 0;
  const canAnimate = typeof view.requestAnimationFrame === "function" && typeof view.IntersectionObserver === "function";
  const now = () => view.performance.now();
  const suspended = () => pageSuspended || document.visibilityState === "hidden";
  const contains = (element) => element === root || root.contains(element);

  function stopFrame() {
    if (pendingFrame) view.cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
  }

  function schedule() {
    if (disposed || suspended() || reducedMotion || !active.size || pendingFrame) return;
    pendingFrame = view.requestAnimationFrame(tick);
  }

  function renderMetric(record, value) {
    record.value = value;
    const formatted = formatLandingMetric(value, record.spec);
    if (formatted !== record.formatted) {
      record.element.textContent = formatted;
      record.formatted = formatted;
    }
    record.element.dataset.countValue = String(value);
  }

  function finishMetric(record) {
    renderMetric(record, record.spec.target);
    record.elapsed = record.spec.duration;
    record.state = "complete";
    record.element.dataset.countState = "complete";
    active.delete(record);
  }

  function activateMetric(record) {
    if (record.state === "complete") return;
    if (reducedMotion || !canAnimate || record.spec.duration === 0 || record.spec.target === 0) {
      finishMetric(record);
      return;
    }
    record.lastTime = now();
    record.state = "running";
    record.element.dataset.countState = "running";
    active.add(record);
  }

  function tick(timestamp) {
    pendingFrame = 0;
    if (disposed || suspended() || reducedMotion) return;
    frameCount++;
    for (const record of active) {
      if (!contains(record.element)) { active.delete(record); continue; }
      record.elapsed += Math.max(0, timestamp - record.lastTime);
      record.lastTime = timestamp;
      const sample = sampleLandingMetric(record.spec, record.elapsed);
      if (sample.complete) finishMetric(record);
      else renderMetric(record, sample.value);
    }
    schedule();
  }

  function showUnit(unit) {
    if (!unit.started) {
      unit.started = true;
      unit.element.dataset.motionState = "visible";
      onSection?.(unit.element);
      for (const element of unit.bars) {
        const bar = progressBars.get(element);
        if (bar) element.style.setProperty("--progress", `${bar.target}%`);
      }
      for (const sequence of unit.sequences) sequence.dataset.motionState = "visible";
    }
    for (const element of unit.metrics) {
      const record = metrics.get(element);
      if (record) activateMetric(record);
    }
    schedule();
  }

  const observer = canAnimate ? new view.IntersectionObserver((entries) => {
    if (disposed) return;
    for (const entry of entries) {
      const unit = units.get(entry.target);
      if (!unit) continue;
      unit.visible = entry.isIntersecting;
      if (unit.visible) showUnit(unit);
      else for (const element of unit.metrics) active.delete(metrics.get(element));
    }
    if (!active.size) stopFrame();
  }, { threshold: 0.12, rootMargin: "0px 0px -3% 0px" }) : null;

  function getUnit(element) {
    const owner = element.closest?.("[data-metric-group], [data-reveal-sequence]");
    const target = owner && contains(owner) ? owner : element;
    if (!units.has(target)) {
      const unit = { element: target, metrics: new Set(), bars: new Set(), sequences: new Set(), started: false, visible: false };
      units.set(target, unit);
      target.dataset.motionState = "pending";
      observer?.observe(target);
    }
    return units.get(target);
  }

  function settleAll() {
    stopFrame();
    for (const record of metrics.values()) finishMetric(record);
    for (const unit of units.values()) {
      unit.visible = true;
      showUnit(unit);
    }
  }

  function refresh() {
    if (disposed) return;
    for (const [element, record] of metrics) if (!contains(element)) { active.delete(record); metrics.delete(element); }
    for (const element of progressBars.keys()) if (!contains(element)) progressBars.delete(element);
    for (const sequence of sequences) if (!contains(sequence)) sequences.delete(sequence);
    for (const [element] of units) if (!contains(element)) { observer?.unobserve(element); units.delete(element); }

    for (const element of select(root, "[data-count-to]")) {
      if (metrics.has(element)) continue;
      const spec = createLandingMetric({ target: element.dataset.countTo, format: element.dataset.countFormat, duration: element.dataset.countDuration, decimals: element.dataset.countDecimals });
      if (!spec) continue;
      const record = { element, spec, value: 0, elapsed: 0, lastTime: 0, formatted: null, state: "pending" };
      metrics.set(element, record);
      element.setAttribute("aria-label", formatLandingMetric(spec.target, spec));
      element.setAttribute("aria-live", "off");
      element.dataset.countState = "pending";
      renderMetric(record, 0);
      const unit = getUnit(element);
      unit.metrics.add(element);
      if (unit.visible) activateMetric(record);
    }
    for (const element of select(root, "[data-progress-to]")) {
      if (progressBars.has(element)) continue;
      const target = Math.max(0, Math.min(100, Number(element.dataset.progressTo) || 0));
      progressBars.set(element, { target });
      const unit = getUnit(element);
      unit.bars.add(element);
      element.style.setProperty("--progress", `${unit.started ? target : 0}%`);
    }
    for (const sequence of select(root, "[data-reveal-sequence]")) {
      const unit = getUnit(sequence);
      unit.sequences.add(sequence);
      sequence.dataset.motionState = unit.started ? "visible" : "pending";
      sequences.add(sequence);
      for (const [index, element] of [...sequence.querySelectorAll("[data-reveal-item]")].entries()) {
        element.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 75}ms`);
      }
    }
    if (reducedMotion || !canAnimate) settleAll();
    else schedule();
  }

  function pause() {
    stopFrame();
  }

  function resume() {
    if (disposed || suspended()) return;
    for (const record of active) record.lastTime = now();
    schedule();
  }

  const visibilityChanged = () => suspended() ? pause() : resume();
  const pageHide = () => { pageSuspended = true; pause(); };
  const pageShow = () => { pageSuspended = false; resume(); };
  const preferenceChanged = (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) settleAll();
  };
  document.addEventListener("visibilitychange", visibilityChanged);
  view.addEventListener("pagehide", pageHide);
  view.addEventListener("pageshow", pageShow);
  media?.addEventListener("change", preferenceChanged);
  refresh();

  return {
    refresh,
    getState: () => ({
      active: active.size,
      completed: [...metrics.values()].filter((record) => record.state === "complete").length,
      total: metrics.size,
      pendingFrame: Boolean(pendingFrame),
      reducedMotion,
      suspended: suspended(),
      disposed,
      frameCount,
      observerCount: observer && !disposed ? 1 : 0,
      units: [...units.values()].map((unit) => ({ state: unit.started ? "visible" : "pending", visible: unit.visible })),
      values: [...metrics.values()].map((record) => ({ target: record.spec.target, value: record.value, formatted: record.formatted, state: record.state })),
      businessMutation: false,
    }),
    dispose() {
      if (disposed) return;
      settleAll();
      disposed = true;
      stopFrame();
      observer?.disconnect();
      active.clear();
      document.removeEventListener("visibilitychange", visibilityChanged);
      view.removeEventListener("pagehide", pageHide);
      view.removeEventListener("pageshow", pageShow);
      media?.removeEventListener("change", preferenceChanged);
    },
  };
}
