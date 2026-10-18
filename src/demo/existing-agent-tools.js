import { COMMUNICATION_PLACES } from "../city/communications-model.js";

/** Exact public function definitions exported by the user from their existing
 * PAL. Presentation IDs below are separate from these unchanged schemas. */
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const EXISTING_AGENT_TOOL_DEFINITIONS = freeze([
  {
    type: "function",
    function: {
      name: "trigger_3d_camera_movement",
      description: "Triggers a predefined 3D camera movement within the Bird View application.",
      parameters: {
        type: "object",
        required: ["movement_id"],
        properties: {
          movement_id: { type: "string", description: "The identifier of the predefined camera movement to execute." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight_building",
      description: "Highlights a specific building or business area in the 3D city.",
      parameters: {
        type: "object",
        required: ["building_id"],
        properties: {
          building_id: { type: "string", description: "The identifier of the building to highlight." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trigger_animation",
      description: "Triggers a predefined animation (e.g., vehicles moving) in the 3D city.",
      parameters: {
        type: "object",
        required: ["animation_id"],
        properties: {
          animation_id: { type: "string", description: "The identifier of the animation to trigger." },
        },
      },
    },
  },
]);

const MAX_BUILDINGS = 64;
const MAX_MOVEMENTS = 128;
const MAX_RECORDS_PER_CATEGORY = 16;
const MAX_SALES_STAGES = 8;
const recordId = (entry) => typeof entry?.id === "string" && entry.id.length > 0 && entry.id.length <= 160;
const records = (value) => Array.isArray(value) ? value : [];
const label = (value, fallback) => typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : fallback;
const targetEntry = (kind, entry, prefix = "") => ({
  id: `${kind}:${entry.id}`,
  label: `${prefix}${label(entry.name, entry.id)}`,
  target: { kind, id: entry.id },
});

/** Existing scene objects only: no name heuristics, aliases or new records. */
export function getExistingAgentCatalogue(snapshot = {}) {
  const crm = snapshot?.crm || {};
  const industry = snapshot?.industry || {};
  const buildings = [];
  const movements = [{ id: "overview", label: "Vista general de toda la empresa" }];
  const buildingIds = new Set();
  const movementIds = new Set(["overview"]);
  let truncated = false;
  const add = (list, ids, entry, limit) => {
    if (ids.has(entry.id)) return;
    if (list.length >= limit) { truncated = true; return; }
    ids.add(entry.id);
    list.push(entry);
  };
  const addMovement = (entry) => add(movements, movementIds, entry, MAX_MOVEMENTS);
  const addBuilding = (entry) => add(buildings, buildingIds, entry, MAX_BUILDINGS);
  const boundedRecords = (source, limit) => {
    const valid = records(source).filter(recordId);
    if (valid.length > limit) truncated = true;
    return valid.slice(0, limit);
  };
  const hasSales = [crm.deals, crm.accounts, crm.owners, crm.stages].some((entries) => records(entries).length > 0);
  const hasCommunications = Array.isArray(crm.activities);
  const hasIndustry = records(industry.stages).some(recordId);
  if (hasSales) addMovement(targetEntry("district", { id: "sales", name: "Área comercial" }));
  if (hasCommunications) addMovement(targetEntry("district", { id: "communications", name: "Comunicaciones" }));
  if (hasIndustry) addMovement(targetEntry("district", { id: "industry", name: "Producción y distribución" }));

  // Reserve the smaller departments before filling the bounded CRM catalogue.
  if (hasCommunications) {
    for (const place of COMMUNICATION_PLACES) addBuilding(targetEntry("communication", place));
  }
  for (const stage of boundedRecords(industry.stages, 5)) {
    if (["manufacturing", "packing", "warehouse", "transit", "delivered"].includes(stage.id))
      addBuilding(targetEntry("industry-stage", stage));
  }
  const stages = boundedRecords(crm.stages, MAX_SALES_STAGES).filter((stage) => stage.kind !== "lost" && stage.id !== "lost");
  const visibleStageIds = new Set(stages.map(({ id }) => id));
  for (const stage of stages) addMovement(targetEntry("sales-stage", stage));
  if (records(crm.accounts).some(recordId)) addMovement(targetEntry("sales-stage", { id: "clients", name: "Clientes activos" }));
  for (const owner of boundedRecords(crm.owners, MAX_RECORDS_PER_CATEGORY)) addMovement(targetEntry("owner", owner, "Comercial · "));
  for (const batch of boundedRecords(industry.batches, MAX_RECORDS_PER_CATEGORY)) {
    if (!records(industry.stages).some((stage) => stage.id === batch.stageId)) continue;
    addMovement(targetEntry("batch", { ...batch, name: `${label(batch.productName, "Lote")} · ${batch.id}` }));
  }
  for (const vehicle of boundedRecords(industry.vehicles, MAX_RECORDS_PER_CATEGORY)) {
    addMovement(targetEntry("vehicle", { ...vehicle, name: `${label(vehicle.name, vehicle.id)}${vehicle.driverName ? ` · ${label(vehicle.driverName, "")}` : ""}` }));
  }
  for (const deal of records(crm.deals)) {
    if (recordId(deal) && deal.status !== "lost" && visibleStageIds.has(deal.stageId))
      addBuilding(targetEntry("deal", deal, "Oportunidad · "));
  }
  for (const account of records(crm.accounts)) {
    if (recordId(account)) addBuilding(targetEntry("account", account, "Cliente · "));
  }
  for (const building of buildings) addMovement({ ...building, target: { ...building.target } });

  const animations = [];
  if (records(industry.vehicles).some(recordId)) animations.push({
    id: "traffic", label: "Tráfico urbano existente, sin cambiar entregas", animation: "traffic",
  });
  if (records(industry.stages).some((stage) => ["manufacturing", "packing"].includes(stage?.id))) animations.push({
    id: "machinery", label: "Movimiento visual de la maquinaria, sin avanzar la producción", animation: "machinery",
  });
  for (const building of buildings) animations.push({
    id: `pulse:${building.id}`, label: `Señalar · ${building.label}`,
    animation: "pulse", target: { ...building.target },
  });
  return { movements, buildings, animations, truncated };
}

/** Local presentation bindings; the Tavus parameter schemas stay intact. */
export function createExistingAgentContracts(snapshot) {
  const catalogue = getExistingAgentCatalogue(snapshot);
  const table = (entries, command) => Object.fromEntries(entries.map((entry) => [entry.id, command(entry)]));
  return {
    version: 1,
    source: "exported-from-existing-tavus-agent",
    tools: structuredClone(EXISTING_AGENT_TOOL_DEFINITIONS),
    bindings: {
      trigger_3d_camera_movement: { command: {
        pointer: "/movement_id",
        map: table(catalogue.movements, (entry) => entry.id === "overview"
          ? { action: "overview", duration: 2.8 }
          : { action: "focus", target: { ...entry.target }, duration: 2.8 }),
      } },
      highlight_building: { command: {
        pointer: "/building_id",
        map: table(catalogue.buildings, (entry) => ({ action: "highlight", target: { ...entry.target }, duration: 5 })),
      } },
      trigger_animation: { command: {
        pointer: "/animation_id",
        map: table(catalogue.animations, (entry) => ({
          action: "animation", animation: entry.animation, duration: 5,
          ...(entry.target ? { target: { ...entry.target } } : {}),
        })),
      } },
    },
  };
}
