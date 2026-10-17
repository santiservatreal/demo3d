/** These places render recorded CRM activity; they never send or receive messages. */
export const COMMUNICATION_PLACES = [
  { id: "email", name: "Correos", color: "#218dec", x: -27, icon: "mail" },
  {
    id: "call",
    name: "Central de llamadas",
    color: "#f09a2e",
    x: -9,
    icon: "phone",
  },
  {
    id: "messages",
    name: "Casa de mensajes",
    color: "#21b77a",
    x: 9,
    icon: "message",
  },
  {
    id: "meeting",
    name: "Cafetería reuniones",
    color: "#da657c",
    x: 27,
    icon: "coffee",
  },
];
const COMPLETED = new Set(["done", "completed"]);
const pending = (status) => status === "pending";
const validTime = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
const recognizedChannels = new Set([
  "email",
  "call",
  "whatsapp",
  "message",
  "conversation",
  "meeting",
]);

function channelFor(activity) {
  const declared = normalize(activity.channel);
  if (recognizedChannels.has(declared)) return declared;
  const type = normalize(activity.type);
  return recognizedChannels.has(type) ? type : null;
}
function placeFor(channel) {
  return ["whatsapp", "message", "conversation"].includes(channel)
    ? "messages"
    : channel;
}
function dayAt(value, timeZone) {
  if (!validTime(value)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return null;
  }
}
function declaredAvailable(state, channel) {
  const coverage = state.communicationCoverage?.channels;
  return Array.isArray(coverage)
    ? coverage.includes(channel)
    : coverage?.[channel] === true;
}

/**
 * A missing activity feed/channel remains unavailable, never a fabricated zero.
 * Completed-today uses an explicit completion timestamp before the scheduled or
 * occurred date. Pending, undated and future completions are excluded. Each
 * source ID is counted once; the last received version wins.
 */
export function communicationsSummary(state = {}) {
  const timeZone = state.timeZone || "Europe/Madrid";
  const now = validTime(state.now) ? Date.parse(state.now) : null;
  const today = dayAt(state.now, timeZone);
  const deduplicated = new Map();
  for (const [index, activity] of (Array.isArray(state.activities)
    ? state.activities
    : []
  ).entries()) {
    if (!activity || !channelFor(activity)) continue;
    const key =
      activity.id == null ? `anonymous:${index}` : `id:${activity.id}`;
    deduplicated.set(key, activity);
  }
  const deals = new Map((state.deals || []).map((deal) => [deal.id, deal]));
  const accounts = new Map(
    (state.accounts || []).map((account) => [account.id, account]),
  );
  const records = [...deduplicated.values()].map((activity) => {
    const deal = deals.get(activity.dealId);
    const accountId = activity.accountId ?? deal?.accountId ?? null;
    return {
      id: activity.id ?? null,
      type: activity.type ?? null,
      channel: channelFor(activity),
      subject: activity.subject ?? "Actividad registrada",
      status: activity.status ?? null,
      occurredAt: validTime(activity.occurredAt) ? activity.occurredAt : null,
      completedAt: validTime(activity.completedAt)
        ? activity.completedAt
        : null,
      dueAt: validTime(activity.dueAt) ? activity.dueAt : null,
      ownerId:
        activity.ownerId ??
        deal?.ownerId ??
        accounts.get(accountId)?.ownerId ??
        null,
      dealId: activity.dealId ?? null,
      accountId,
      source: activity.source ?? null,
    };
  });
  const summarize = (items, available) => ({
    sourceAvailable: available,
    todayCompleted:
      available && today && now !== null
        ? items.filter((record) => {
            const completedAt = record.completedAt ?? record.occurredAt;
            return (
              COMPLETED.has(record.status) &&
              validTime(completedAt) &&
              Date.parse(completedAt) <= now &&
              dayAt(completedAt, timeZone) === today
            );
          }).length
        : null,
    pendingCount: available
      ? items.filter((record) => pending(record.status)).length
      : null,
    totalCount: available ? items.length : null,
  });
  return COMMUNICATION_PLACES.map((place) => {
    const channelNames =
      place.id === "messages"
        ? ["whatsapp", "message", "conversation"]
        : [place.id];
    const items = records.filter(
      (record) => placeFor(record.channel) === place.id,
    );
    const channels = Object.fromEntries(
      channelNames.map((channel) => {
        const channelItems = items.filter(
          (record) => record.channel === channel,
        );
        return [
          channel,
          summarize(
            channelItems,
            channelItems.length > 0 || declaredAvailable(state, channel),
          ),
        ];
      }),
    );
    const available = Object.values(channels).some(
      (channel) => channel.sourceAvailable,
    );
    return {
      ...place,
      ...summarize(items, available),
      channels,
      records: items,
      timeZone,
      asOf: validTime(state.now) ? state.now : null,
      basis:
        "Actividades registradas en el CRM; hoy según la zona horaria de la empresa",
    };
  });
}

/** Optional, explicitly labelled demo channel. Existing conversations stay unclassified. */
export function createDemoCommunicationActivities(state = {}) {
  const now = validTime(state.now)
    ? Date.parse(state.now)
    : Date.parse("2026-10-16T10:15:00+02:00");
  const subjects = [
    "WhatsApp: confirmación de requisitos",
    "WhatsApp: horario de entrega",
    "WhatsApp: propuesta recibida",
    "WhatsApp: dudas del presupuesto",
    "WhatsApp: documentación compartida",
    "WhatsApp: seguimiento del acuerdo",
    "WhatsApp: respuesta pendiente del cliente",
    "WhatsApp: confirmar disponibilidad",
  ];
  return subjects.map((subject, index) => {
    const deal =
      state.deals?.[(index * 3) % Math.max(1, state.deals?.length || 0)];
    return {
      id: `activity-whatsapp-${String(index + 1).padStart(2, "0")}`,
      type: "message",
      channel: "whatsapp",
      source: "atlas-demo",
      subject,
      status: index < 6 ? "done" : "pending",
      occurredAt: new Date(now - (113 - index * 12) * 60000).toISOString(),
      dueAt:
        index < 6 ? null : new Date(now + (index - 5) * 3600000).toISOString(),
      dealId: deal?.id ?? null,
      accountId: deal?.accountId ?? null,
      ownerId: deal?.ownerId ?? null,
    };
  });
}
