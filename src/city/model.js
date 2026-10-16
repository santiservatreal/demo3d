/**
 * Atlas' renderer-independent CRM contract. All records below are fictitious.
 * Money is expressed in whole EUR; absence stays null, never an invented zero.
 */
export const DEMO_NOW = "2026-10-16T10:15:00+02:00";
export const DEMO_TIME_ZONE = "Europe/Madrid";

const clone = (value) => structuredClone(value);
const stamp = (day, hour = 9) =>
  `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+02:00`;
const calendarParts = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: DEMO_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
};
const localDay = (value) => {
  const parts = calendarParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
};
const localMonth = (value) => {
  const parts = calendarParts(value);
  return parts ? `${parts.year}-${parts.month}` : null;
};
const coversMonthStart = (from, now) => {
  const parts = calendarParts(from);
  if (!parts || !calendarParts(now)) return false;
  const fromMonth = localMonth(from), currentMonth = localMonth(now);
  return fromMonth < currentMonth || (fromMonth === currentMonth &&
    parts.day === "01" && parts.hour === "00" && parts.minute === "00" &&
    parts.second === "00" && new Date(from).getMilliseconds() === 0);
};
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const validTime = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function stageKind(state, stageId) {
  return (
    state.stages.find((stage) => stage.id === stageId)?.kind ??
    (stageId === "won" ? "won" : stageId === "lost" ? "lost" : "open")
  );
}

function amountTotal(records) {
  return records.every(
    (record) => typeof record.amount === "number" && Number.isFinite(record.amount),
  )
    ? records.reduce((sum, record) => sum + record.amount, 0)
    : null;
}

function overdue(activity, now) {
  return (
    activity.type === "task" &&
    activity.status === "pending" &&
    validTime(activity.dueAt) &&
    Date.parse(activity.dueAt) < Date.parse(now)
  );
}

export function needsAttention(deal, state) {
  if (!deal) return false;
  return (
    Boolean(deal.incident) ||
    state.activities.some(
      (activity) => activity.dealId === deal.id && overdue(activity, state.now),
    )
  );
}

/** The initial snapshot has 24 open deals worth exactly EUR 120,000. */
export function createDemoState() {
  const stages = [
    { id: "lead", name: "Lead", color: "#6aaee5", order: 0, kind: "open" },
    {
      id: "qualified",
      name: "Qualified",
      color: "#51bdb6",
      order: 1,
      kind: "open",
    },
    {
      id: "proposal",
      name: "Proposal",
      color: "#e6b65d",
      order: 2,
      kind: "open",
    },
    {
      id: "negotiation",
      name: "Negotiation",
      color: "#b198d2",
      order: 3,
      kind: "open",
    },
    { id: "won", name: "Won", color: "#7dbb90", order: 4, kind: "won" },
  ];
  const owners = [
    { id: "owner-ana", name: "Ana Torres", initials: "AT" },
    { id: "owner-marcos", name: "Marcos Vidal", initials: "MV" },
    { id: "owner-lucia", name: "Lucía Ferrer", initials: "LF" },
    { id: "owner-david", name: "David Soler", initials: "DS" },
  ];
  const accountNames = [
    "Norte Studio", "Oliva Hotels", "Brisa Market", "Lumen Labs",
    "Casa Aurora", "Taller Forma", "Marea Foods", "Terra Supply",
    "Roca Design", "Delta Health", "Bosque Retail", "Punto Verde",
    "Azul Digital", "Sur Services", "Nido Spaces", "Cobalto Tech",
    "Alba Partners", "Horizonte Group",
  ];
  const accounts = accountNames.map((name, index) => ({
    id: `account-${String(index + 1).padStart(3, "0")}`,
    name,
    ownerId: owners[index % owners.length].id,
    status: "active",
    renewalDate: `2026-${index < 9 ? "11" : "12"}-${String(5 + index).padStart(2, "0")}`,
    upsellAmount: [1500, 2500, 4000, null][index % 4],
    crmUrl: null,
  }));
  const groups = [
    ["lead", [1500, 2500, 3500, 4500, 5500, 6500, 7500]],
    ["qualified", [3000, 4000, 5000, 6000, 7000]],
    ["proposal", [3000, 4000, 5000, 6000, 7000, 8000]],
    ["negotiation", [2000, 3000, 4000, 5000, 7000, 9500]],
    ["won", [4500, 6500, 8500, 10500]],
    ["lost", [3500, 6000, 9000]],
  ];
  const projectNames = [
    "Nueva sede", "Programa anual", "Expansión de equipo", "Colección otoño",
    "Renovación de espacios", "Proyecto conexión", "Plan de crecimiento",
    "Experiencia cliente", "Servicio integral", "Lanzamiento de marca",
    "Nueva línea", "Transformación digital", "Acuerdo de distribución",
    "Programa de fidelización", "Red de oficinas", "Contrato regional",
    "Implementación central", "Colección premium", "Acuerdo estratégico",
    "Apertura de mercado", "Servicio corporativo", "Contrato de soporte",
    "Proyecto horizonte", "Plan de expansión", "Alianza anual",
    "Instalación completa", "Programa equipo", "Acuerdo nacional",
    "Piloto logístico", "Sede experimental", "Proyecto temporada",
  ];
  const events = [];
  const deals = [];
  for (const [stageId, amounts] of groups) {
    for (const amount of amounts) {
      const index = deals.length;
      const id = `deal-${String(index + 1).padStart(3, "0")}`;
      const account = accounts[index % accounts.length];
      const status = stageId === "lost" ? "lost" : stageId === "won" ? "won" : "open";
      const currentIndex = stages.findIndex((stage) => stage.id === stageId);
      const journey = stageId === "lost"
        ? ["lead", "qualified", "proposal", "lost"]
        : stages.slice(0, currentIndex + 1).map((stage) => stage.id);
      const history = journey.map((visitedStageId, step) => {
        const closure = visitedStageId === "won" || visitedStageId === "lost";
        const day = closure ? 10 + (index % 4) : 2 + step * 2 + (index % 2);
        const timestamp = stamp(day, 9 + (index % 6));
        const eventId = `history-${id}-${step}`;
        const type = closure
          ? `deal.${visitedStageId}`
          : step === 0 ? "deal.created" : "deal.stage_changed";
        events.push({
          id: eventId,
          entityId: id,
          timestamp,
          type,
          source: "atlas-demo",
          payload: {
            stageId: visitedStageId,
            fromStageId: step ? journey[step - 1] : null,
            ...(visitedStageId === "won" ? { accountId: account.id } : {}),
          },
        });
        return { stageId: visitedStageId, timestamp, eventId, type };
      });
      const lastHistory = history.at(-1);
      deals.push({
        id,
        name: projectNames[index],
        accountId: account.id,
        stageId,
        status,
        amount,
        ownerId: owners[index % owners.length].id,
        probability: status === "won" ? 100 : status === "lost" ? 0 : [15, 35, 60, 80][currentIndex],
        nextStep: status === "open"
          ? ["Confirmar necesidades", "Reunión de descubrimiento", "Revisar propuesta", "Acordar fecha de firma"][currentIndex]
          : status === "won" ? "Coordinar bienvenida con el cliente" : "Registrar aprendizajes",
        lastActivityAt: stamp(15, 9 + (index % 6)),
        expectedCloseAt: status === "open" ? stamp(20 + (index % 9), 12) : null,
        closedAt: status === "open" ? null : lastHistory.timestamp,
        lastStageChangedAt: lastHistory.timestamp,
        products: [
          { id: "product-service", name: "Servicio principal", quantity: 1, unitPrice: amount * 0.8 },
          { id: "product-support", name: "Acompañamiento", quantity: 1, unitPrice: amount * 0.2 },
        ],
        history,
        crmUrl: null,
        // Parcel identity remains stable, including after stage updates.
        plotIndex: index,
      });
    }
  }

  const activities = [];
  const add = (type, count, build) => {
    for (let index = 0; index < count; index++) {
      activities.push({
        id: `activity-${type}-${String(index + 1).padStart(2, "0")}`,
        type,
        source: "atlas-demo",
        ...build(index),
      });
    }
  };
  add("contact", 7, (index) => ({
    status: "pending", dealId: deals[index].id,
    occurredAt: stamp(15, 10), dueAt: stamp(17, 12),
    subject: "Contactar con la persona responsable",
  }));
  add("conversation", 9, (index) => ({
    status: "pending", dealId: deals[index + 3].id,
    occurredAt: stamp(16, 8), dueAt: stamp(17, 10),
    subject: "Responder a la consulta del cliente",
  }));
  add("call", 12, (index) => ({
    status: "done", dealId: deals[index].id,
    occurredAt: `2026-10-16T09:${String(2 + index * 3).padStart(2, "0")}:00+02:00`,
    dueAt: null, subject: "Llamada de seguimiento registrada",
  }));
  add("task", 5, (index) => ({
    status: "pending", dealId: deals[2 + index * 5].id,
    occurredAt: stamp(13, 9), dueAt: stamp(14 + (index % 2), 17),
    subject: ["Enviar propuesta revisada", "Confirmar presupuesto", "Preparar reunión", "Revisar condiciones", "Solicitar aprobación"][index],
  }));
  add("email", 6, (index) => ({
    status: "done", dealId: deals[12 + index].id,
    occurredAt: stamp(16, 9), dueAt: null,
    subject: "Correo de seguimiento enviado",
  }));
  add("meeting", 3, (index) => ({
    status: index === 0 ? "done" : "pending",
    accountId: accounts[index].id,
    occurredAt: stamp(16, 9 + index * 3),
    dueAt: stamp(16, 9 + index * 3),
    subject: "Reunión de cuenta",
  }));
  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
  return {
    stages,
    deals,
    accounts,
    owners,
    activities,
    events,
    appliedEventIds: events.map((event) => event.id),
    source: {
      id: "atlas-demo", type: "simulated", label: "Datos simulados",
      lastSyncedAt: DEMO_NOW, permissions: { read: true, simulate: true },
    },
    now: DEMO_NOW,
    timeZone: DEMO_TIME_ZONE,
    // Explicit completeness is necessary before displaying a historical win rate.
    historyCoverage: {
      closedDealsComplete: true,
      from: "2026-10-01T00:00:00+02:00",
      to: DEMO_NOW,
      description: "Historial completo de cierres del mes en esta demo ficticia",
    },
  };
}

/** Filters never create records, alter totals, or change stable parcel IDs. */
export function filterDeals(state, filters = {}) {
  const query = normalize(filters.query).trim();
  return state.deals.filter((deal) => {
    if (!filters.includeLost && stageKind(state, deal.stageId) === "lost") return false;
    if (filters.stageId && filters.stageId !== "all" && deal.stageId !== filters.stageId) return false;
    if (filters.ownerId && filters.ownerId !== "all" && deal.ownerId !== filters.ownerId) return false;
    if (filters.attentionOnly && !needsAttention(deal, state)) return false;
    if (!query) return true;
    const account = state.accounts.find((item) => item.id === deal.accountId);
    const owner = state.owners.find((item) => item.id === deal.ownerId);
    return normalize([deal.id, deal.name, account?.name, owner?.name].join(" ")).includes(query);
  });
}

export function metrics(state) {
  const open = state.deals.filter((deal) => stageKind(state, deal.stageId) === "open");
  const month = localMonth(state.now);
  // A snapshot without coverage cannot establish a historical denominator.
  const historyComplete = Boolean(
    state.historyCoverage?.closedDealsComplete &&
    coversMonthStart(state.historyCoverage.from, state.now) &&
    Date.parse(state.historyCoverage.to) >= Date.parse(state.now),
  );
  const closedThisMonth = state.deals.filter((deal) => {
    const kind = stageKind(state, deal.stageId);
    if (kind === "open") return false;
    const closure = [...deal.history].reverse().find((entry) =>
      entry.stageId === deal.stageId &&
      (entry.type === `deal.${kind}` || (!entry.type && stageKind(state, entry.stageId) === kind)),
    );
    return closure && localMonth(closure.timestamp) === month && Date.parse(closure.timestamp) <= Date.parse(state.now);
  });
  const won = closedThisMonth.filter((deal) => stageKind(state, deal.stageId) === "won");
  const lost = closedThisMonth.filter((deal) => stageKind(state, deal.stageId) === "lost");
  const today = localDay(state.now);
  const todayCount = (type) => state.activities.filter((activity) =>
    activity.type === type && localDay(activity.occurredAt) === today,
  ).length;
  const pendingCount = (type) => state.activities.filter((activity) =>
    activity.type === type && activity.status === "pending",
  ).length;
  return {
    openCount: open.length,
    openAmount: amountTotal(open),
    wonCount: won.length,
    wonAmount: amountTotal(won),
    lostCount: lost.length,
    winRate: historyComplete && closedThisMonth.length ? won.length / closedThisMonth.length : null,
    winRateHistoryComplete: historyComplete,
    winRateBasis: historyComplete
      ? `${won.length} ganadas / ${closedThisMonth.length} cierres de este mes; historial completo de la demo`
      : "No disponible: falta historial completo de cierres del mes",
    attentionCount: state.deals.filter((deal) => stageKind(state, deal.stageId) !== "lost" && needsAttention(deal, state)).length,
    activeClients: state.accounts.filter((account) => !account.status || account.status === "active").length,
    pendingContacts: pendingCount("contact"),
    pendingConversations: pendingCount("conversation"),
    callsToday: todayCount("call"),
    emailsToday: todayCount("email"),
    meetingsToday: todayCount("meeting"),
    conversationsToday: todayCount("conversation"),
    overdueTasks: state.activities.filter((activity) => overdue(activity, state.now)).length,
    stages: [...state.stages].sort((a, b) => a.order - b.order).map((stage) => {
      const records = state.deals.filter((deal) => deal.stageId === stage.id);
      return { ...stage, count: records.length, amount: amountTotal(records) };
    }),
  };
}

/**
 * Process an event once, preserving object/parcel identity and selected IDs.
 * Returns false for duplicates, malformed events, stale transitions or unknown
 * entities/stages. No credentials or network connector are part of this demo.
 */
export function applyEvent(state, event) {
  if (
    !event || typeof event.id !== "string" || !event.id ||
    typeof event.entityId !== "string" || !validTime(event.timestamp) ||
    typeof event.source !== "string" || !event.source ||
    state.appliedEventIds?.includes(event.id) || state.events.some((item) => item.id === event.id)
  ) return false;

  if (event.type === "activity.completed") {
    const activity = state.activities.find((item) => item.id === event.entityId);
    if (!activity) return false;
    activity.status = "done";
    activity.completedAt = event.timestamp;
  } else {
    if (!["deal.stage_changed", "deal.won", "deal.lost"].includes(event.type)) return false;
    const deal = state.deals.find((item) => item.id === event.entityId);
    if (!deal || Date.parse(event.timestamp) < Date.parse(deal.lastStageChangedAt ?? deal.history?.at(-1)?.timestamp ?? 0)) return false;
    const payload = event.payload ?? {};
    const target = event.type === "deal.won"
      ? payload.stageId ?? state.stages.find((stage) => stageKind(state, stage.id) === "won")?.id
      : event.type === "deal.lost"
        ? payload.stageId ?? state.stages.find((stage) => stageKind(state, stage.id) === "lost")?.id ?? "lost"
        : payload.stageId;
    if (!target || (target !== "lost" && !state.stages.some((stage) => stage.id === target))) return false;
    const kind = stageKind(state, target);
    if ((event.type === "deal.won" && kind !== "won") || (event.type === "deal.lost" && kind !== "lost")) return false;
    if (payload.accountId != null && (typeof payload.accountId !== "string" || !payload.accountId)) return false;

    const previousStageId = deal.stageId;
    deal.stageId = target;
    deal.status = kind;
    deal.lastStageChangedAt = event.timestamp;
    deal.lastActivityAt = event.timestamp;
    deal.closedAt = kind === "open" ? null : event.timestamp;
    if (kind === "won") deal.probability = 100;
    else if (kind === "lost") deal.probability = 0;
    else deal.probability = null; // A CRM-specific probability cannot be guessed.
    if (payload.accountId && kind === "won") {
      deal.accountId = payload.accountId;
      if (!state.accounts.some((account) => account.id === payload.accountId)) {
        state.accounts.push({
          id: payload.accountId,
          name: payload.accountName ?? "No disponible",
          ownerId: deal.ownerId,
          status: "active",
          renewalDate: null,
          upsellAmount: null,
          crmUrl: null,
        });
      }
    }
    deal.history.push({
      stageId: target,
      timestamp: event.timestamp,
      eventId: event.id,
      type: kind === "open" ? "deal.stage_changed" : `deal.${kind}`,
    });
    event = { ...event, payload: { ...payload, stageId: target, fromStageId: previousStageId } };
  }
  state.events.push(clone(event));
  state.events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
  (state.appliedEventIds ??= []).push(event.id);
  const previousNow = state.now;
  if (Date.parse(event.timestamp) > Date.parse(state.now)) state.now = event.timestamp;
  if (
    state.source.type === "simulated" &&
    state.historyCoverage?.closedDealsComplete &&
    Date.parse(state.historyCoverage.to) >= Date.parse(previousNow)
  ) state.historyCoverage.to = state.now;
  return true;
}

/**
 * Chronological, historical transitions for Replay. Dispatch these against
 * createReplayState(base), NOT the live state where they are already applied.
 * The caller restores its saved live snapshot when leaving Replay.
 */
export function demoReplayEvents(state = createDemoState()) {
  return state.events
    .filter((event) => ["deal.stage_changed", "deal.won", "deal.lost"].includes(event.type))
    .map(clone)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
}

/**
 * Reconstruct the opportunity-stage baseline before the first transition.
 * Accounts/products/activities are the demo snapshot: this replays deal stages,
 * not a claim to reconstruct historical account or activity attributes.
 */
export function createReplayState(base = createDemoState()) {
  const state = clone(base);
  const firstOpen = [...state.stages]
    .sort((a, b) => a.order - b.order)
    .find((stage) => stageKind(state, stage.id) === "open");
  if (!firstOpen) throw new Error("Replay requires an open CRM stage");
  const initialIds = new Set();
  let initialTime = null;
  for (const deal of state.deals) {
    const first = deal.history[0];
    deal.stageId = first?.stageId ?? firstOpen.id;
    deal.status = stageKind(state, deal.stageId);
    deal.history = first ? [first] : [];
    deal.closedAt = null;
    deal.lastStageChangedAt = first?.timestamp ?? null;
    deal.lastActivityAt = first?.timestamp ?? null;
    deal.probability = null;
    deal.nextStep = null;
    deal.expectedCloseAt = null;
    if (first) {
      initialIds.add(first.eventId);
      if (!initialTime || Date.parse(first.timestamp) > Date.parse(initialTime)) initialTime = first.timestamp;
    }
  }
  state.events = state.events.filter((event) => initialIds.has(event.id));
  state.appliedEventIds = state.events.map((event) => event.id);
  state.now = initialTime ?? state.now;
  state.replay = { scope: "deal_stages", snapshotAt: base.now };
  return state;
}

/** One provider shared by the city, table, inspector and feed. */
export function createDemoProvider() {
  let state = createDemoState();
  const subscribers = new Set();
  const notify = (event) => {
    for (const subscriber of subscribers) subscriber(state, event);
  };
  return {
    getState: () => state,
    subscribe(fn) {
      if (typeof fn !== "function") throw new TypeError("A subscriber must be a function");
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    dispatch(event) {
      const applied = applyEvent(state, event);
      if (applied) notify(event);
      return applied;
    },
    reset(nextState) {
      state = nextState ? clone(nextState) : createDemoState();
      notify({ type: "demo.reset", source: "atlas-demo", timestamp: state.now });
      return state;
    },
  };
}
