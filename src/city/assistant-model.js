import { metrics, stageKind } from "./model.js";
import { communicationsSummary } from "./communications-model.js";
import { industryMetrics } from "./industry-model.js";

/**
 * Local, deterministic demo assistant. It reads the supplied snapshots only:
 * no model service, CRM writes, messages, inferred invoices or live locations.
 */
const DAY = 86_400_000;
const list = (value) => (Array.isArray(value) ? value : []);
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const time = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
const eur = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value)
    : "importe no disponible";
const count = (value) => new Intl.NumberFormat("es-ES").format(value);
const sum = (records, key) =>
  records.every((record) => Number.isFinite(record[key]))
    ? records.reduce((total, record) => total + record[key], 0)
    : null;
const dedupe = (records) => {
  const byId = new Map();
  for (const record of list(records)) {
    if (record?.id) byId.set(record.id, record);
  }
  return [...byId.values()];
};
const kind = (state, deal) =>
  stageKind({ stages: list(state?.stages) }, deal.stageId);
const isOpen = (state, deal) => kind(state, deal) === "open";
const accountName = (state, deal) =>
  list(state?.accounts).find((account) => account.id === deal.accountId)
    ?.name ||
  deal.name ||
  "Esta oportunidad";
const stageName = (state, deal) =>
  list(state?.stages).find((stage) => stage.id === deal.stageId)?.name ||
  deal.stageId;

function sourceLabel(state, industrial = false) {
  const source = state?.source;
  const name =
    source?.type === "simulated"
      ? industrial
        ? "ERP industrial simulado"
        : "CRM simulado"
      : source?.label ||
        source?.name ||
        (industrial ? "Instantánea ERP" : "Instantánea CRM");
  let date = "fecha no disponible";
  if (time(state?.now) !== null) {
    try {
      date = new Intl.DateTimeFormat("es-ES", {
        timeZone: state?.timeZone || "Europe/Madrid",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(state.now));
    } catch {
      date = state.now;
    }
  }
  return `${name} · ${date}`;
}

function salesMetrics(state) {
  if (
    !state ||
    ![state.deals, state.accounts, state.stages, state.activities].every(
      Array.isArray,
    ) ||
    time(state.now) === null ||
    !state.deals.every((deal) => Array.isArray(deal.history))
  )
    return null;
  try {
    const result = metrics(state);
    const missingWinHistory = state.deals.some(
      (deal) =>
        kind(state, deal) === "won" &&
        !deal.history.some(
          (entry) =>
            entry.stageId === deal.stageId && time(entry.timestamp) !== null,
        ),
    );
    return missingWinHistory
      ? { ...result, wonCount: null, wonAmount: null }
      : result;
  } catch {
    return null;
  }
}

// One edit is accepted for names of four or more letters. Ambiguous matches
// remain unresolved rather than sending the camera to the wrong person.
function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let ai = 0,
    bi = 0,
    edits = 0;
  while (ai < a.length && bi < b.length) {
    if (a[ai] === b[bi]) {
      ai++;
      bi++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) ai++;
    if (b.length >= a.length) bi++;
  }
  return edits + Number(ai < a.length || bi < b.length) <= 1;
}

function matchingPerson(query, records, field) {
  const words = query.split(" ");
  const full = records.filter((record) => {
    const name = normalize(record[field]);
    return name.includes(" ") && ` ${query} `.includes(` ${name} `);
  });
  if (full.length) return full.length === 1 ? full[0] : null;
  const exact = records.filter((record) => {
    const parts = normalize(record[field]).split(" ").filter(Boolean);
    return (
      parts.length &&
      (query.includes(parts.join(" ")) ||
        parts.some((part) => part.length >= 3 && words.includes(part)))
    );
  });
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const fuzzy = records.filter((record) =>
    normalize(record[field])
      .split(" ")
      .some(
        (part) =>
          part.length >= 4 &&
          words.some((word) => word.length >= 4 && oneEdit(word, part)),
      ),
  );
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

function matchingRecord(query, records) {
  const padded = ` ${query} `;
  const matches = records.filter((record) => {
    const name = normalize(record.name);
    const id = normalize(record.id);
    return (
      (name && padded.includes(` ${name} `)) ||
      (id && padded.includes(` ${id} `))
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

const HELP =
  "Puedes preguntarme dónde está Lucía, cuántas oportunidades hay, las ventas ganadas del mes, las tareas pendientes, los mensajes o el stock. También puedo mostrarte Comercial, Comunicaciones o Industria. Este asistente de demostración interpreta consultas locales; no utiliza un modelo de IA conectado.";
const wonSummary = (totals) =>
  totals.wonCount === null
    ? "Falta historial de cierres para cuantificar las ventas ganadas del mes"
    : `Hay ${totals.wonCount} ventas ganadas este mes por ${eur(totals.wonAmount)}`;

/** Read-only answer plus optional, explicitly bounded camera/UI actions. */
export function answerCityQuestion(
  question,
  { state, industryState, people = [] } = {},
) {
  const query = normalize(question).slice(0, 1000);
  const response = (text, actions = [], industrial = false) => ({
    text,
    actions,
    sourceLabel: sourceLabel(industrial ? industryState : state, industrial),
  });
  const totals = salesMetrics(state);
  const owners = dedupe(state?.owners);
  const owner = matchingPerson(query, owners, "name");
  const ownerContext = Array.isArray(people) ? people : list(people?.owners);

  // These words deliberately take precedence over sales-value intents.
  if (
    /\b(facturacion|facturas?|facturado|cobros?|cobrado|ingresos?|beneficio|beneficios|caja)\b/.test(
      query,
    )
  ) {
    return response(
      "No hay datos de facturas, cobros ni beneficios en esta conexión de demostración, así que no puedo calcular la facturación total." +
        (totals
          ? ` Como dato distinto: ${wonSummary(totals)}; una venta ganada no acredita una factura ni un cobro.`
          : " Necesitaría el registro de facturas del CRM para responder."),
    );
  }
  if (/\b(presupuesto|gastos?|costes?|margen)\b/.test(query)) {
    return response(
      "No hay un presupuesto de empresa, costes ni gastos registrados en esta instantánea. Los importes del pipeline representan oportunidades comerciales.",
    );
  }
  if (
    /\b(bajado|baja|caido|empeorado|rendimiento|rinde|productividad)\b/.test(
      query,
    )
  ) {
    const prefix = owner ? `${owner.name}: ` : "";
    return response(
      `${prefix}no dispongo de períodos comparables ni de un historial de rendimiento del equipo. Puedo mostrar la cartera actual, pero no concluir que alguien haya bajado su rendimiento.`,
      owner ? [{ type: "focus-owner", id: owner.id }] : [],
    );
  }
  if (
    /\b(envia|enviar|manda|mandar|borra|borrar|elimina|eliminar|modifica|modificar|cierra|cerrar)\b/.test(
      query,
    )
  ) {
    return response(
      "Este asistente de demostración consulta datos y cambia la visualización. Esa operación requiere una integración de escritura con el CRM y no se ha ejecutado.",
    );
  }
  if (owner) {
    const person = ownerContext.find(
      (entry) => (entry.ownerId || entry.id) === owner.id,
    );
    const ownedDeals = dedupe(state?.deals).filter(
      (deal) => deal.ownerId === owner.id && isOpen(state, deal),
    );
    const locatedDeal = list(state?.deals).find(
      (deal) => deal.id === (person?.targetEntityId || person?.dealId),
    );
    const work = person?.attendingConstruction
      ? `En la simulación está acompañando la construcción${locatedDeal ? ` de ${accountName(state, locatedDeal)}` : " de una oportunidad"}. `
      : person?.activity
        ? `En la simulación: ${person.activity}. `
        : "Te muestro su personaje en la ciudad. ";
    const portfolio = Array.isArray(state?.deals)
      ? `Tiene ${ownedDeals.length} oportunidades abiertas por ${eur(sum(ownedDeals, "amount"))}. `
      : "Su cartera no está disponible en esta instantánea. ";
    return response(
      `${owner.name}. ${work}${portfolio}La posición del personaje es ilustrativa; no es una geolocalización real.`,
      [{ type: "focus-owner", id: owner.id }],
    );
  }

  const vehicle =
    matchingPerson(query, dedupe(industryState?.vehicles), "driverName") ||
    matchingRecord(query, dedupe(industryState?.vehicles));
  if (vehicle) {
    const batch = list(industryState?.batches).find(
      (entry) => entry.id === vehicle.cargoBatchId,
    );
    const status =
      {
        outbound: "está en reparto",
        returning: "está volviendo al almacén",
        at_customer: "está en el cliente, tras la entrega registrada",
        available: "está disponible en el almacén",
      }[vehicle.status] || "tiene un estado no reconocido";
    const cargo = batch
      ? ` Transporta ${count(batch.quantity)} unidades para ${batch.accountName}.`
      : vehicle.cargoBatchId
        ? " La carga no está disponible en esta instantánea."
        : " Va sin carga registrada.";
    return response(
      `${vehicle.driverName || "Conductor no disponible"}, ${vehicle.name}: ${status}.${cargo} El trayecto mostrado es una estimación del ERP, sin GPS.`,
      [{ type: "focus-entity", id: vehicle.id }],
      true,
    );
  }

  const deal = matchingRecord(query, dedupe(state?.deals));
  const account = matchingRecord(query, dedupe(state?.accounts));
  if (deal) {
    return response(
      `${deal.name}, de ${accountName(state, deal)}: ${stageName(state, deal)}, ${eur(deal.amount)}. ${deal.nextStep ? `Próximo paso registrado: ${deal.nextStep}.` : "No hay un próximo paso registrado."}`,
      [{ type: "focus-entity", id: deal.id }],
    );
  }
  if (account) {
    const open = dedupe(state?.deals).filter(
      (entry) => entry.accountId === account.id && isOpen(state, entry),
    );
    return response(
      `${account.name}${Array.isArray(state?.deals) ? ` tiene ${open.length} oportunidades abiertas por ${eur(sum(open, "amount"))}.` : ": no hay una cartera disponible."} Te muestro su edificio de cliente.`,
      [{ type: "focus-entity", id: account.id }],
    );
  }
  if (
    /\b(recomiendas?|recomendaciones?|consejos?|tips|prioridades)\b/.test(query)
  ) {
    const tips = companyRecommendations({ state, industryState });
    return response(
      tips.length
        ? tips
            .slice(0, 2)
            .map((tip) => `${tip.title}. ${tip.text}`)
            .join("\n\n")
        : "No hay recomendaciones con evidencia suficiente en esta instantánea. No deduzco inactividad ni rendimiento cuando faltan registros.",
      tips[0]?.action ? [tips[0].action] : [],
    );
  }
  if (
    /\b(tareas?|atencion|urgente|vencidas?|pendientes?)\b/.test(query) &&
    !/\b(correos?|mensajes?|whatsapps?|llamadas?|reuniones?)\b/.test(query)
  ) {
    if (!totals)
      return response(
        "No está disponible el registro de tareas con una fecha de referencia válida.",
      );
    const pendingTasks = dedupe(state.activities).filter(
      (activity) => activity.type === "task" && activity.status === "pending",
    );
    return response(
      `Hay ${pendingTasks.length} tareas pendientes; ${totals.overdueTasks} están vencidas según la fecha de la instantánea del CRM.`,
      [{ type: "attention" }],
    );
  }

  const industrial =
    /\b(stock|inventario|almacen|fabricacion|fabrica|fabricando|produccion|empacado|empaquetado|transporte|reparto|entregados?|entregas?|industria|industrial|camiones?|lotes?)\b/.test(
      query,
    );
  if (industrial) {
    const result = industryMetrics(industryState);
    if (!result.complete)
      return response(
        "El inventario industrial completo no está disponible. Necesito productos, lotes y cobertura de datos del ERP para dar un total fiable.",
        [{ type: "district", id: "industry" }],
        true,
      );
    const product =
      list(industryState?.products).length === 1
        ? industryState.products[0].name
        : "Inventario registrado";
    return response(
      `${product}: ${count(result.inProduction)} unidades en fabricación, ${count(result.packed)} en empacado, ${count(result.stock)} en stock, ${count(result.inTransit)} en transporte y ${count(result.delivered)} con entrega registrada. Total: ${count(result.totalUnits)} unidades en ${result.batchCount} lotes. Una entrega no implica un cobro.`,
      [{ type: "district", id: "industry" }],
      true,
    );
  }

  const channel = /\b(correos?|emails?|mail)\b/.test(query)
    ? "email"
    : /\b(llamadas?|telefono)\b/.test(query)
      ? "call"
      : /\b(reuniones?|meetings?|cafe|cafeteria)\b/.test(query)
        ? "meeting"
        : /\b(whatsapps?)\b/.test(query)
          ? "whatsapp"
          : /\b(mensajes?|comunicaciones|conversaciones?)\b/.test(query)
            ? "messages"
            : null;
  if (channel) {
    const summary = communicationsSummary(state);
    const place = summary.find(
      (entry) => entry.id === (channel === "whatsapp" ? "messages" : channel),
    );
    const data = channel === "whatsapp" ? place?.channels.whatsapp : place;
    const name = {
      email: "correos",
      call: "llamadas",
      meeting: "reuniones",
      messages: "mensajes",
      whatsapp: "WhatsApps",
    }[channel];
    const feminine = ["call", "meeting"].includes(channel);
    return response(
      data?.sourceAvailable
        ? `Hay ${data.totalCount} ${name} ${feminine ? "registradas" : "registrados"}, ${data.todayCompleted ?? "sin dato de"} ${feminine ? "completadas" : "completados"} hoy y ${data.pendingCount} pendientes. «Hoy» usa la fecha y la zona horaria de la empresa. Son registros del CRM; este chat no envía mensajes.`
        : `El CRM no proporciona registros de ${name} en esta instantánea; no puedo asignarles un cero.`,
      [{ type: "district", id: "communications" }],
    );
  }

  if (/\b(clientes?|cuentas?)\b/.test(query)) {
    return response(
      totals
        ? `Hay ${totals.activeClients} clientes activos registrados en el CRM.`
        : "El registro de clientes no está disponible.",
      totals ? [{ type: "district", id: "sales" }] : [],
    );
  }
  if (
    /\b(ventas?|ganadas?|ganado|oportunidades?|pipeline|comercial|leads?|negociacion|propuestas?)\b/.test(
      query,
    )
  ) {
    if (
      /\b(ayer|anteayer|mes pasado|semana pasada|ano pasado|historico)\b/.test(
        query,
      )
    )
      return response(
        "Puedo resumir la cartera actual y las ventas ganadas del mes de esta instantánea. No hay cobertura histórica suficiente para comparar ese otro período.",
      );
    if (!totals)
      return response(
        "El pipeline comercial no está disponible con datos suficientes.",
      );
    const targetStage = totals.stages.find((entry) => {
      const words = normalize(entry.name)
        .split(" ")
        .filter((word) => word.length >= 4);
      return query.split(" ").some((word) => words.includes(word));
    });
    const stageText = targetStage
      ? ` En ${targetStage.name}: ${targetStage.count} oportunidades por ${eur(targetStage.amount)}.`
      : "";
    return response(
      `Hay ${totals.openCount} oportunidades abiertas por ${eur(totals.openAmount)}. ${wonSummary(totals)}.${stageText} Los importes ganados son ventas comerciales, no cobros.`,
      [{ type: "district", id: "sales" }],
    );
  }
  if (/\b(empresa|ciudad|mapa|todo|vista general)\b/.test(query)) {
    return response(
      "Te muestro la empresa completa: Comercial, Comunicaciones e Industria.",
      [{ type: "district", id: "all" }],
    );
  }
  if (/\b(donde|localiza|busca|encuentra|ubica)\b/.test(query)) {
    return response(
      "No encuentro esa persona o entidad en la instantánea actual. Puedes buscar por el nombre registrado, por ejemplo Lucía Ferrer o Felipe Martín.",
    );
  }
  return response(HELP);
}

/**
 * Evidence-based suggestions. Every elapsed time uses the snapshot's clock.
 * Stable IDs allow the presentation layer to dismiss without changing CRM data.
 */
export function companyRecommendations({ state, industryState } = {}) {
  const now = time(state?.now);
  if (now === null) return [];
  const deals = dedupe(state?.deals).filter((deal) => isOpen(state, deal));
  const openById = new Map(deals.map((deal) => [deal.id, deal]));
  const activities = dedupe(state?.activities);
  const source = sourceLabel(state);
  const recommendations = [];
  const seenEntities = new Set();
  const add = (record, priority, sortTime = now) =>
    recommendations.push({ ...record, priority, sortTime });
  const overdueByDeal = new Map();
  for (const activity of activities) {
    const due = time(activity.dueAt);
    if (
      activity.type !== "task" ||
      activity.status !== "pending" ||
      due === null ||
      due >= now ||
      !openById.has(activity.dealId)
    )
      continue;
    const group = overdueByDeal.get(activity.dealId) || [];
    group.push(activity);
    overdueByDeal.set(activity.dealId, group);
  }
  for (const [id, tasks] of overdueByDeal) {
    const deal = openById.get(id);
    seenEntities.add(id);
    add(
      {
        id: `overdue:${id}`,
        title: `${accountName(state, deal)} necesita atención`,
        text: `${tasks.length} ${tasks.length === 1 ? "tarea vencida registrada" : "tareas vencidas registradas"} en «${deal.name}». Revisa el próximo paso con su responsable.`,
        action: { type: "focus-entity", id },
        sourceLabel: source,
        tone: "warning",
      },
      0,
      Math.min(...tasks.map((task) => time(task.dueAt))),
    );
  }
  for (const deal of deals) {
    if (seenEntities.has(deal.id)) continue;
    const activityTimes = activities
      .filter(
        (activity) =>
          activity.dealId === deal.id &&
          ["done", "completed"].includes(activity.status),
      )
      .map((activity) => time(activity.completedAt || activity.occurredAt))
      .filter((stamp) => stamp !== null && stamp <= now);
    const registered = time(deal.lastActivityAt);
    if (registered !== null && registered <= now)
      activityTimes.push(registered);
    const last = activityTimes.length ? Math.max(...activityTimes) : null;
    if (last !== null && now - last >= 5 * DAY) {
      const days = Math.floor((now - last) / DAY);
      seenEntities.add(deal.id);
      add(
        {
          id: `inactive:${deal.id}`,
          title: `Revisar seguimiento de ${accountName(state, deal)}`,
          text: `Han pasado ${days} días desde la última actividad registrada en «${deal.name}». Comprueba si falta registrar una interacción o acordar el siguiente paso.`,
          action: { type: "focus-entity", id: deal.id },
          sourceLabel: source,
          tone: "warning",
        },
        1,
        last,
      );
      continue;
    }
    const entered = time(deal.lastStageChangedAt);
    if (
      entered !== null &&
      entered <= now &&
      now - entered >= 7 * DAY &&
      !["lead"].includes(deal.stageId)
    ) {
      add(
        {
          id: `stalled:${deal.id}:${deal.stageId}`,
          title: `${accountName(state, deal)} sigue en ${stageName(state, deal)}`,
          text: `Lleva ${Math.floor((now - entered) / DAY)} días en esta etapa. Revisa si el próximo paso registrado sigue siendo adecuado.`,
          action: { type: "focus-entity", id: deal.id },
          sourceLabel: source,
          tone: "info",
        },
        2,
        entered,
      );
    }
  }
  const pendingMessages = communicationsSummary(state)
    .find((entry) => entry.id === "messages")
    ?.records.filter(
      (record) =>
        record.status === "pending" &&
        (!record.dealId || openById.has(record.dealId)),
    );
  if (pendingMessages?.length) {
    add(
      {
        id: "communications:pending-messages",
        title: "Conversaciones por revisar",
        text: `Hay ${pendingMessages.length} mensajes o conversaciones pendientes registrados en el CRM. Revisa las respuestas necesarias con el equipo.`,
        action: { type: "district", id: "communications" },
        sourceLabel: source,
        tone: "info",
      },
      3,
    );
  }
  // A clock reaching an ETA never proves an arrival. Only explicitly recorded
  // customer stops can produce this operational reminder.
  if (time(industryState?.now) !== null) {
    for (const vehicle of dedupe(industryState?.vehicles)) {
      if (vehicle.status !== "at_customer" || vehicle.cargoBatchId != null)
        continue;
      add(
        {
          id: `vehicle-empty:${vehicle.id}`,
          title: `${vehicle.name} está sin carga en el cliente`,
          text: "La entrega figura registrada y el camión está vacío. Revisa con operaciones el próximo trayecto; no hay una vuelta registrada todavía.",
          action: { type: "focus-entity", id: vehicle.id },
          sourceLabel: sourceLabel(industryState, true),
          tone: "info",
        },
        3,
      );
    }
  }
  return recommendations
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.sortTime - b.sortTime ||
        a.id.localeCompare(b.id),
    )
    .map(({ priority, sortTime, ...recommendation }) => recommendation);
}
