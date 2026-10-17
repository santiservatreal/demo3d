const CELEBRATION_DURATION = 5600;
const CELEBRATION_CAPACITY = 3;
const REMEMBERED_CELEBRATIONS = 512;

function text(value, limit = 180) {
  return value == null ? "" : String(value).trim().slice(0, limit);
}

/** One closure per entity and kind, even when its source emits several events. */
export function celebrationKey({ kind, entityId } = {}) {
  if (!["sale", "delivery"].includes(kind) || !text(entityId)) return null;
  return `${kind}:${text(entityId)}`;
}

/** Bounded FIFO; the active card counts towards capacity. No business state lives here. */
export function createCelebrationQueue({
  capacity = CELEBRATION_CAPACITY,
} = {}) {
  const limit = Math.max(
    1,
    Math.min(
      CELEBRATION_CAPACITY,
      Math.floor(capacity) || CELEBRATION_CAPACITY,
    ),
  );
  const items = [],
    seenEvents = new Set(),
    seenClosures = new Set();
  let disposed = false,
    dropped = 0;
  function remember(set, value) {
    set.add(value);
    if (set.size > REMEMBERED_CELEBRATIONS)
      set.delete(set.values().next().value);
  }
  return {
    enqueue(input = {}) {
      const key = celebrationKey(input),
        eventId = text(input.eventId);
      if (disposed) return { accepted: false, reason: "disposed" };
      if (!key || !eventId) return { accepted: false, reason: "invalid" };
      if (seenEvents.has(eventId) || seenClosures.has(key))
        return { accepted: false, reason: "duplicate" };
      if (items.length >= limit) {
        dropped += 1;
        return { accepted: false, reason: "capacity" };
      }
      const item = {
        kind: input.kind,
        eventId,
        entityId: text(input.entityId),
        title:
          text(input.title) ||
          (input.kind === "sale" ? "¡Venta ganada!" : "¡Entrega completada!"),
        name: text(input.name),
        detail: text(input.detail),
        value: text(input.value),
        owner: text(input.owner),
      };
      remember(seenEvents, eventId);
      remember(seenClosures, key);
      items.push(item);
      return { accepted: true, item: { ...item } };
    },
    peek() {
      return items[0] ? { ...items[0] } : null;
    },
    shift() {
      const item = items.shift();
      return item ? { ...item } : null;
    },
    reset() {
      items.length = 0;
      seenEvents.clear();
      seenClosures.clear();
      dropped = 0;
    },
    dispose() {
      this.reset();
      disposed = true;
    },
    debug() {
      return {
        size: items.length,
        capacity: limit,
        dropped,
        disposed,
        visible: items[0] ? { ...items[0] } : null,
        queued: items.slice(1).map((item) => ({ ...item })),
        rememberedEvents: seenEvents.size,
        rememberedClosures: seenClosures.size,
      };
    },
  };
}

/** Deterministic CSS trajectories. No requestAnimationFrame, scene meshes, or timers per piece. */
export function confettiParticles({
  reducedMotion = false,
  kind = "sale",
} = {}) {
  if (reducedMotion) return [];
  const colors =
    kind === "delivery"
      ? ["#258fe0", "#f5ab42", "#72bde9", "#f8d17f"]
      : ["#1cae78", "#f0bd4c", "#67c9a4", "#a9dadd"];
  return Array.from({ length: 36 }, (_, index) => {
    const seed = (index * 17 + 7) % 37;
    return {
      color: colors[index % colors.length],
      x: 6 + ((index * 31) % 88),
      drift: ((seed / 36) * 2 - 1) * 122,
      fall: 74 + ((index * 23) % 92),
      spin: (index % 2 ? -1 : 1) * (180 + ((index * 47) % 420)),
      delay: ((index * 7) % 12) * 21,
      duration: 1180 + ((index * 13) % 12) * 45,
      round: index % 4 === 0,
    };
  });
}

function createIcon(document) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS(namespace, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "1.7");
  const check = document.createElementNS(namespace, "path");
  check.setAttribute("d", "m8 12 2.7 2.7L16 9.4");
  check.setAttribute("stroke", "currentColor");
  check.setAttribute("stroke-width", "1.9");
  check.setAttribute("stroke-linecap", "round");
  check.setAttribute("stroke-linejoin", "round");
  svg.append(circle, check);
  return svg;
}

/** Root supplies only successfully applied, live CRM closure events. */
export function createCelebrations({ container, reducedMotion = false } = {}) {
  if (!container?.ownerDocument)
    throw new TypeError("Celebrations needs a DOM container");
  const document = container.ownerDocument;
  const queue = createCelebrationQueue();
  const layer = document.createElement("section");
  layer.className = "c-celebrations";
  layer.setAttribute("aria-live", "polite");
  layer.setAttribute("aria-atomic", "true");
  layer.setAttribute("aria-label", "Hitos del negocio");
  layer.hidden = true;
  container.append(layer);
  const requestFrame = document.defaultView?.requestAnimationFrame?.bind(
    document.defaultView,
  );
  const cancelFrame = document.defaultView?.cancelAnimationFrame?.bind(
    document.defaultView,
  );
  let timeout = null,
    paintFrame = null,
    activeEventId = null,
    particleCount = 0,
    disposed = false;
  const isReducedMotion = () =>
    typeof reducedMotion === "function" ? !!reducedMotion() : !!reducedMotion;

  function clearTimer() {
    if (timeout !== null) clearTimeout(timeout);
    if (paintFrame !== null) cancelFrame?.(paintFrame);
    timeout = null;
    paintFrame = null;
  }
  function startDismissTimer(eventId) {
    const start = () => {
      paintFrame = null;
      if (!disposed && activeEventId === eventId)
        timeout = setTimeout(dismiss, CELEBRATION_DURATION);
    };
    // Give the browser a paint opportunity before counting the reading time.
    if (requestFrame)
      paintFrame = requestFrame(() => {
        paintFrame = requestFrame(start);
      });
    else start();
  }
  function dismiss() {
    if (disposed) return;
    clearTimer();
    queue.shift();
    activeEventId = null;
    render();
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    node.className = className;
    if (content) node.textContent = content;
    return node;
  }
  function render() {
    const current = queue.peek();
    layer.replaceChildren();
    particleCount = 0;
    layer.hidden = !current;
    if (!current || disposed) return;
    activeEventId = current.eventId;
    const reduced = isReducedMotion();
    layer.dataset.motion = reduced ? "reduced" : "full";
    const card = element("article", "c-celebration");
    card.dataset.kind = current.kind;
    card.dataset.entityId = current.entityId;
    card.dataset.eventId = current.eventId;
    const icon = element("div", "c-celebration-icon");
    icon.append(createIcon(document));
    const content = element("div", "c-celebration-content");
    content.append(element("strong", "c-celebration-title", current.title));
    if (current.name)
      content.append(element("b", "c-celebration-name", current.name));
    if (current.detail)
      content.append(element("p", "c-celebration-detail", current.detail));
    const meta = element("div", "c-celebration-meta");
    if (current.value)
      meta.append(element("span", "c-celebration-value", current.value));
    if (current.owner)
      meta.append(element("span", "c-celebration-owner", current.owner));
    if (current.value || current.owner) content.append(meta);
    const close = element("button", "c-celebration-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Cerrar celebración");
    close.addEventListener("click", dismiss);
    card.append(icon, content, close);
    const particles = element("div", "c-celebration-confetti");
    particles.setAttribute("aria-hidden", "true");
    for (const piece of confettiParticles({
      reducedMotion: reduced,
      kind: current.kind,
    })) {
      const particle = element("i", "c-celebration-particle");
      particle.style.setProperty("--confetti-color", piece.color);
      particle.style.setProperty("--confetti-x", `${piece.x}%`);
      particle.style.setProperty("--confetti-drift", `${piece.drift}px`);
      particle.style.setProperty("--confetti-fall", `${piece.fall}px`);
      particle.style.setProperty("--confetti-spin", `${piece.spin}deg`);
      particle.style.setProperty("--confetti-delay", `${piece.delay}ms`);
      particle.style.setProperty("--confetti-duration", `${piece.duration}ms`);
      if (piece.round) particle.classList.add("is-round");
      particles.append(particle);
      particleCount += 1;
    }
    if (particleCount) layer.append(particles);
    layer.append(card);
    startDismissTimer(current.eventId);
  }
  return {
    notify(input) {
      const result = queue.enqueue(input);
      if (result.accepted && !activeEventId && !disposed) render();
      return result;
    },
    reset() {
      clearTimer();
      queue.reset();
      activeEventId = null;
      particleCount = 0;
      layer.replaceChildren();
      layer.hidden = true;
    },
    dispose() {
      if (disposed) return;
      this.reset();
      queue.dispose();
      layer.remove();
      disposed = true;
    },
    debug() {
      return {
        ...queue.debug(),
        particleCount,
        timerActive: timeout !== null,
        paintPending: paintFrame !== null,
        reducedMotion: isReducedMotion(),
      };
    },
  };
}
