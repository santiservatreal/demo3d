// Presentation captions follow the camera every frame. They never change the
// scene, create a render loop, or infer business data that the CRM does not have.
const sectionName = (value) => ({ sales: "commercial", industry: "industrial" })[value] || value;
const catalog = (section, entries) => entries.map(([id, text, color], index) => Object.freeze({
  id, text, color, section, kind: "stage", number: String(index + 1).padStart(2, "0"),
  caption: section === "commercial" ? "PROCESO COMERCIAL" : "PROCESO INDUSTRIAL",
}));
const SALES_LABELS = catalog("commercial", [
  ["lead", "Nuevos leads", "#79caff"],
  ["qualified", "Cualificados", "#bba0ff"],
  ["proposal", "Propuestas", "#ffce78"],
  ["negotiation", "Negociación", "#ff9f77"],
  ["won", "Ventas ganadas", "#8bf2b2"],
]);
const INDUSTRY_LABELS = catalog("industrial", [
  ["manufacturing", "Fabricación", "#ffbf73"],
  ["packing", "Empacado", "#f4d568"],
  ["warehouse", "Almacén", "#c2b1ff"],
  ["transit", "En transporte", "#80d3ff"],
  ["delivered", "Entregados", "#8bf2b2"],
]);
const DISTRICT_LABELS = [
  { id: "commercial", text: "Barrio comercial", color: "#9bf3cc", number: "01", caption: "LAS OPORTUNIDADES" },
  { id: "industrial", text: "Zona industrial", color: "#ffce78", number: "02", caption: "DEL PRODUCTO AL CLIENTE" },
  { id: "communications", text: "Comunicaciones", color: "#a9cfff", number: "03", caption: "LAS RELACIONES" },
].map((item) => Object.freeze({ ...item, section: item.id, kind: "district" }));

export const STORY_LABEL_CATALOG = Object.freeze([...SALES_LABELS, ...INDUSTRY_LABELS, ...DISTRICT_LABELS]);

/** Only the script decides which neighborhoods or stages are worth naming. */
export function selectStoryLabels(frame, { maxLabels } = {}) {
  const labels = frame?.labels;
  const mode = labels?.mode;
  if (!["districts", "stage", "route"].includes(mode)) return [];
  const section = sectionName(labels.section || frame.section);
  const source = mode === "districts" ? DISTRICT_LABELS : section === "commercial" ? SALES_LABELS : section === "industrial" ? INDUSTRY_LABELS : [];
  const visibleIds = new Set(Array.isArray(labels.visibleIds) ? labels.visibleIds : []);
  const activeIndex = source.findIndex((label) => label.id === labels.activeId);
  const candidates = source.filter((label) => visibleIds.has(label.id) && (mode !== "stage" || label.id === labels.activeId)).map((label) => ({
    ...label, active: label.id === labels.activeId,
  }));
  candidates.sort((first, second) => {
    if (first.active !== second.active) return Number(second.active) - Number(first.active);
    if (activeIndex < 0) return 0;
    const firstIndex = source.findIndex((label) => label.id === first.id);
    const secondIndex = source.findIndex((label) => label.id === second.id);
    return Math.abs(firstIndex - activeIndex) - Math.abs(secondIndex - activeIndex) || secondIndex - firstIndex;
  });
  const limit = Math.min(mode === "stage" ? 1 : 3, Math.max(0, Math.floor(maxLabels ?? 3)));
  return candidates.slice(0, limit);
}

const intersects = (first, second, gap = 0) => first.x < second.x + second.width + gap && first.x + first.width > second.x - gap && first.y < second.y + second.height + gap && first.y + first.height > second.y - gap;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const numericRect = (rect) => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;

/**
 * Small, deterministic screen-space layout: the active stage gets first choice,
 * then neighbors use any remaining clear space. A blocked label is omitted.
 * Retaining a valid placement prevents cards from hopping between candidates.
 */
export function layoutStoryLabels({ labels = [], viewport, obstacles = [], previous = {}, margin = 12, gap = 10 } = {}) {
  if (!numericRect(viewport)) return [];
  const placed = [];
  const blockers = obstacles.filter(numericRect);
  for (const label of labels) {
    if (!Number.isFinite(label.x) || !Number.isFinite(label.y) || label.visible === false) continue;
    const width = label.width || 172, height = label.height || 54;
    const minX = viewport.x + margin, minY = viewport.y + margin;
    const maxX = viewport.x + viewport.width - width - margin, maxY = viewport.y + viewport.height - height - margin;
    if (maxX < minX || maxY < minY) continue;
    const candidates = [
      { placement: "above", x: label.x - width / 2, y: label.y - height - 35 },
      { placement: "right", x: label.x + 30, y: label.y - height / 2 },
      { placement: "left", x: label.x - width - 30, y: label.y - height / 2 },
      { placement: "below", x: label.x - width / 2, y: label.y + 35 },
      { placement: "above-right", x: label.x + 25, y: label.y - height - 62 },
      { placement: "above-left", x: label.x - width - 25, y: label.y - height - 62 },
      { placement: "below-right", x: label.x + 25, y: label.y + 60 },
      { placement: "below-left", x: label.x - width - 25, y: label.y + 60 },
      { placement: "high", x: label.x - width / 2, y: label.y - height - 126 },
      { placement: "low", x: label.x - width / 2, y: label.y + 126 },
    ].map((candidate, index) => ({
      ...candidate, x: clamp(candidate.x, minX, maxX), y: clamp(candidate.y, minY, maxY), width, height, rank: index,
    })).filter((candidate) => {
      const dx = Math.max(candidate.x - label.x, label.x - candidate.x - width, 0);
      const dy = Math.max(candidate.y - label.y, label.y - candidate.y - height, 0);
      return Math.hypot(dx, dy) <= 205 && !blockers.some((blocker) => intersects(candidate, blocker, gap)) && !placed.some((blocker) => intersects(candidate, blocker, gap));
    });
    candidates.sort((first, second) => Number(second.placement === previous[label.id]) - Number(first.placement === previous[label.id]) || first.rank - second.rank);
    if (!candidates.length) continue;
    const { rank, ...rect } = candidates[0];
    placed.push({ ...rect, id: label.id, anchor: { x: label.x, y: label.y }, active: label.active === true });
  }
  return placed;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const OBSTACLES = [".bird-story-header", ".bird-story-copy", "#bird-story-kpis", ".bird-story-player", "#bird-story-stages", ".bird-story-guide", "#bird-story-milestone", "#bird-story-choices", ".bird-story-explore[open] > div", "#bird-story-error"];

export function createStoryLabels({ container, project } = {}) {
  if (!container?.ownerDocument || typeof project !== "function") throw new TypeError("Story labels need a presentation container and an anchor projector.");
  const document = container.ownerDocument;
  const window = document.defaultView;
  const ownsLayer = !container.classList.contains("bird-story-floating-labels");
  const layer = ownsLayer ? document.createElement("div") : container;
  layer.classList.add("bird-story-floating-labels");
  layer.setAttribute("aria-label", "Zonas del recorrido");
  const host = ownsLayer ? container : container.closest(".bird-story") || container.parentElement;
  const leaders = document.createElementNS(SVG_NS, "svg");
  leaders.classList.add("bird-story-floating-leaders");
  leaders.setAttribute("aria-hidden", "true");
  layer.append(leaders);
  if (ownsLayer) container.prepend(layer);
  let disposed = false, state = { mode: "none", section: "all", activeId: null, requestedIds: [], visibleIds: [], hiddenIds: [], labels: [], obstacleCount: 0, viewport: null };
  let previous = {}, lastSignature = "", dirtyObstacles = true, cachedObstacles = [], lastSampledFrame = null;
  const nodes = new Map();
  for (const meta of STORY_LABEL_CATALOG) {
    const key = `${meta.kind}:${meta.id}`;
    const card = document.createElement("div");
    card.className = "bird-story-floating-label";
    Object.assign(card.dataset, { labelId: meta.id, labelKind: meta.kind, section: meta.section, visible: "false", active: "false" });
    card.style.setProperty("--story-label-color", meta.color);
    card.setAttribute("aria-hidden", "true");
    const number = document.createElement("span");
    number.className = "bird-story-floating-number";
    number.textContent = meta.number;
    const copy = document.createElement("span");
    copy.className = "bird-story-floating-copy";
    const caption = document.createElement("small");
    caption.textContent = meta.caption;
    const title = document.createElement("b");
    title.textContent = meta.text;
    copy.append(caption, title); card.append(number, copy); layer.append(card);
    const line = document.createElementNS(SVG_NS, "path");
    line.dataset.labelId = meta.id;
    line.dataset.visible = "false";
    line.style.setProperty("--story-label-color", meta.color);
    const pin = document.createElementNS(SVG_NS, "circle");
    pin.setAttribute("r", "3"); pin.dataset.visible = "false";
    pin.style.setProperty("--story-label-color", meta.color);
    leaders.append(line, pin);
    nodes.set(key, { meta, card, line, pin, width: 0, height: 0 });
  }
  const markDirty = () => {
    dirtyObstacles = true;
    // A paused presentation has no story RAF. Resize notifications still keep
    // its captions aligned without adding a second animation loop.
    if (lastSampledFrame && !disposed) sample(lastSampledFrame);
  };
  const resizeObserver = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(markDirty) : null;
  if (host) for (const selector of OBSTACLES) for (const element of host.querySelectorAll(selector)) resizeObserver?.observe(element);
  resizeObserver?.observe(layer);
  window.addEventListener("resize", markDirty, { passive: true });
  function obstacles(viewport, signature) {
    if (!dirtyObstacles && signature === lastSignature) return cachedObstacles;
    cachedObstacles = [];
    for (const selector of OBSTACLES) for (const element of host?.querySelectorAll(selector) || []) {
      if (element.hidden || element.closest("[hidden]")) continue;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) cachedObstacles.push({ x: rect.left - viewport.left, y: rect.top - viewport.top, width: rect.width, height: rect.height });
    }
    dirtyObstacles = false; lastSignature = signature;
    return cachedObstacles;
  }
  function sample(frame) {
    if (disposed) return state;
    lastSampledFrame = frame;
    const bounds = layer.getBoundingClientRect();
    const viewport = { x: 0, y: 0, width: bounds.width, height: bounds.height };
    const compact = bounds.width < 650;
    const mode = frame?.labels?.mode || "none";
    const maxLabels = mode === "stage" ? 1 : compact ? 2 : 3;
    const selected = selectStoryLabels(frame, { maxLabels });
    const signature = `${frame?.chapterId}:${frame?.beatId}:${frame?.holdingChoice}:${host?.dataset.status}:${bounds.width}:${bounds.height}:${host?.querySelector(".bird-story-explore")?.open}`;
    const measureCards = dirtyObstacles || signature !== lastSignature;
    const reserved = obstacles(bounds, signature);
    const projected = selected.map((meta) => {
      const node = nodes.get(`${meta.kind}:${meta.id}`);
      if (!node.width || measureCards) { node.width = node.card.offsetWidth; node.height = node.card.offsetHeight; }
      const anchor = project({ kind: meta.kind, id: meta.id, section: meta.section });
      return { ...meta, visible: anchor?.visible === true, x: (anchor?.x ?? NaN) - bounds.left, y: (anchor?.y ?? NaN) - bounds.top, depth: anchor?.depth ?? null, width: node.width || (compact ? 156 : 174), height: node.height || (compact ? 48 : 54) };
    });
    const layout = layoutStoryLabels({ labels: projected, viewport, obstacles: reserved, previous });
    const placements = new Map(layout.map((entry) => [entry.id, entry]));
    const selectedByKey = new Map(projected.map((meta) => [`${meta.kind}:${meta.id}`, meta]));
    const nextPrevious = {};
    const diagnostics = [];
    for (const [key, node] of nodes) {
      const meta = selectedByKey.get(key);
      const rect = meta && placements.get(meta.id);
      const visible = !!rect;
      const active = meta?.active === true;
      const visibility = String(visible), activity = String(active);
      if (node.card.dataset.visible !== visibility) {
        node.card.dataset.visible = node.line.dataset.visible = node.pin.dataset.visible = visibility;
        node.card.setAttribute("aria-hidden", String(!visible));
      }
      if (node.card.dataset.active !== activity) node.card.dataset.active = node.line.dataset.active = node.pin.dataset.active = activity;
      if (visible) {
        node.card.style.transform = `translate3d(${rect.x.toFixed(2)}px,${rect.y.toFixed(2)}px,0)`;
        const attachX = clamp(meta.x, rect.x + 12, rect.x + rect.width - 12);
        const attachY = clamp(meta.y, rect.y + 8, rect.y + rect.height - 8);
        node.line.setAttribute("d", `M${meta.x.toFixed(2)},${meta.y.toFixed(2)} L${attachX.toFixed(2)},${attachY.toFixed(2)}`);
        node.pin.setAttribute("cx", meta.x.toFixed(2)); node.pin.setAttribute("cy", meta.y.toFixed(2));
        nextPrevious[meta.id] = rect.placement;
      }
      if (meta) diagnostics.push({ id: meta.id, text: meta.text, kind: meta.kind, section: meta.section, active, visible, reason: visible ? null : meta.visible ? "no-clear-space" : "outside-view", anchor: Number.isFinite(meta.x) ? { x: meta.x, y: meta.y, depth: meta.depth } : null, rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null, placement: rect?.placement || null });
    }
    previous = nextPrevious;
    state = { mode, section: sectionName(frame?.labels?.section || frame?.section || "all"), activeId: frame?.labels?.activeId || null, requestedIds: selected.map((item) => item.id), visibleIds: layout.map((item) => item.id), hiddenIds: diagnostics.filter((item) => !item.visible).map((item) => item.id), labels: diagnostics, obstacleCount: reserved.length, viewport };
    return state;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    resizeObserver?.disconnect();
    window.removeEventListener("resize", markDirty);
    if (ownsLayer) layer.remove();
    else { leaders.remove(); for (const { card } of nodes.values()) card.remove(); }
    nodes.clear(); previous = {};
    state = { ...state, mode: "none", visibleIds: [], labels: [], disposed: true };
  }
  return Object.freeze({ sample, dispose, getState: () => state });
}
