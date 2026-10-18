import Ajv from "ajv";

// These are existing tool names requested by the integration, not definitions
// of their arguments. Their argument schemas must come from the existing PAL.
export const TAVUS_TOOL_NAMES = Object.freeze([
  "trigger_3d_camera_movement",
  "highlight_building",
  "trigger_animation",
]);
const TOOL_NAMES = new Set(TAVUS_TOOL_NAMES);
const ACTIONS = new Set(["overview", "focus", "highlight", "animation"]);
const TARGET_KINDS = new Set([
  "district", "sales-stage", "deal", "account", "owner", "communication",
  "industry-stage", "batch", "vehicle",
]);
const ANIMATIONS = new Set(["pulse", "traffic", "machinery"]);
const SOURCE = "exported-from-existing-tavus-agent";
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_ARGUMENT_BYTES = 16 * 1024;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);
const byteLength = (value) => new TextEncoder().encode(value).length;
const onlyKeys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));

function boundedJSON(value, maxBytes) {
  let raw;
  try { raw = typeof value === "string" ? value : JSON.stringify(value); }
  catch { throw new Error("INVALID_JSON"); }
  if (typeof raw !== "string" || byteLength(raw) > maxBytes) throw new Error("SIZE_LIMIT");
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("INVALID_JSON"); }
  let nodes = 0;
  function walk(entry, depth = 0) {
    if (++nodes > 4096 || depth > 32) throw new Error("STRUCTURE_LIMIT");
    if (!entry || typeof entry !== "object") return;
    if (Array.isArray(entry) && entry.length > 256) throw new Error("STRUCTURE_LIMIT");
    for (const child of Object.values(entry)) walk(child, depth + 1);
  }
  walk(parsed);
  return parsed;
}

function pointerParts(pointer) {
  if (typeof pointer !== "string" || pointer.length > 512 || !pointer.startsWith("/")) return null;
  const parts = pointer.slice(1).split("/");
  if (parts.some((part) => /~(?:[^01]|$)/.test(part))) return null;
  return parts.map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function validValueBinding(binding) {
  if (!object(binding)) return false;
  if (own(binding, "value")) return onlyKeys(binding, ["value"]) && scalar(binding.value);
  if (!onlyKeys(binding, ["pointer", "map"]) || !pointerParts(binding.pointer)) return false;
  return !own(binding, "map") || (object(binding.map) && Object.keys(binding.map).length > 0 &&
    Object.keys(binding.map).length <= 128 && Object.values(binding.map).every(scalar));
}

function validBinding(binding) {
  if (!object(binding) || !onlyKeys(binding, ["action", "target", "duration", "animation"]) ||
      !validValueBinding(binding.action)) return false;
  if (own(binding, "target") && (!object(binding.target) ||
      !onlyKeys(binding.target, ["kind", "id"]) ||
      !validValueBinding(binding.target.kind) || !validValueBinding(binding.target.id))) return false;
  return ["duration", "animation"].every((key) => !own(binding, key) || validValueBinding(binding[key]));
}

function assertLocalSchema(schema) {
  // AJV never fetches schemas. Reject remote references and unsupported dynamic
  // vocabulary explicitly rather than changing or weakening an exported schema.
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (own(value, "$ref") && (typeof value.$ref !== "string" ||
        !(value.$ref === "#" || value.$ref.startsWith("#/")))) throw new Error("REMOTE_SCHEMA_REFERENCE");
    if (own(value, "$dynamicRef") || own(value, "$recursiveRef")) throw new Error("UNSUPPORTED_SCHEMA_REFERENCE");
    for (const child of Object.values(value)) visit(child);
  }
  visit(schema);
}

const unavailable = (code, issue) => ({
  ready: false,
  code,
  tools: [],
  bindings: {},
  issues: issue ? [issue] : [],
});

/**
 * Parse the trusted server-side export plus explicit presentation bindings.
 * Missing or unsupported schemas disable all three tools; no argument shape is
 * guessed from a name or from a model-generated call.
 */
export function loadTavusToolContracts(raw) {
  if (raw == null || raw === "") return unavailable("TOOL_SCHEMA_UNAVAILABLE", "No existing-agent tool export is configured.");
  try {
    const manifest = boundedJSON(raw, MAX_MANIFEST_BYTES);
    if (!object(manifest) || !onlyKeys(manifest, ["version", "source", "tools", "bindings"]) ||
        manifest.version !== 1 || manifest.source !== SOURCE || !Array.isArray(manifest.tools) ||
        manifest.tools.length !== TAVUS_TOOL_NAMES.length || !object(manifest.bindings) ||
        Object.keys(manifest.bindings).length !== TAVUS_TOOL_NAMES.length) throw new Error("INVALID_MANIFEST");
    const ajv = new Ajv({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
    const names = new Set();
    for (const tool of manifest.tools) {
      if (!object(tool) || !onlyKeys(tool, ["type", "function"]) || tool.type !== "function" ||
          !object(tool.function) || !onlyKeys(tool.function, ["name", "description", "parameters", "strict"]) ||
          !TOOL_NAMES.has(tool.function.name) || names.has(tool.function.name) ||
          !object(tool.function.parameters) ||
          (own(tool.function, "description") && typeof tool.function.description !== "string") ||
          (own(tool.function, "strict") && typeof tool.function.strict !== "boolean") ||
          !validBinding(manifest.bindings[tool.function.name])) throw new Error("INVALID_TOOL_CONTRACT");
      assertLocalSchema(tool.function.parameters);
      try { ajv.compile(tool.function.parameters); }
      catch { throw new Error("UNSUPPORTED_TOOL_SCHEMA"); }
      names.add(tool.function.name);
    }
    if (Object.keys(manifest.bindings).some((name) => !names.has(name))) throw new Error("INVALID_TOOL_BINDING");
    return { ready: true, code: "TOOL_CONTRACTS_READY", ...manifest, issues: [] };
  } catch (error) {
    // Do not reflect raw environment content or invalid schema descriptions.
    const safe = new Set(["INVALID_JSON", "SIZE_LIMIT", "STRUCTURE_LIMIT", "INVALID_MANIFEST",
      "INVALID_TOOL_CONTRACT", "INVALID_TOOL_BINDING", "REMOTE_SCHEMA_REFERENCE",
      "UNSUPPORTED_SCHEMA_REFERENCE", "UNSUPPORTED_TOOL_SCHEMA"]);
    return unavailable("TOOL_SCHEMA_INVALID", safe.has(error.message) ? error.message : "INVALID_MANIFEST");
  }
}

function mappedValue(binding, args) {
  if (own(binding, "value")) return binding.value;
  let value = args;
  for (const part of pointerParts(binding.pointer)) {
    if (value === null || typeof value !== "object" || !own(value, part)) throw new Error("TOOL_BINDING_UNRESOLVED");
    value = value[part];
  }
  if (own(binding, "map")) {
    if (!scalar(value) || !own(binding.map, String(value))) throw new Error("TOOL_BINDING_UNRESOLVED");
    value = binding.map[String(value)];
  }
  if (!scalar(value)) throw new Error("TOOL_BINDING_UNRESOLVED");
  return value;
}

function mapCommand(binding, args) {
  const command = { action: mappedValue(binding.action, args) };
  if (binding.target) command.target = {
    kind: mappedValue(binding.target.kind, args),
    id: mappedValue(binding.target.id, args),
  };
  for (const key of ["duration", "animation"]) {
    if (binding[key]) command[key] = mappedValue(binding[key], args);
  }
  if (!ACTIONS.has(command.action) ||
      (command.target && (!TARGET_KINDS.has(command.target.kind) || typeof command.target.id !== "string" ||
        !command.target.id || command.target.id.length > 160)) ||
      (command.duration !== undefined && (!Number.isFinite(command.duration) || command.duration < 0.15 || command.duration > 12)) ||
      (command.animation !== undefined && !ANIMATIONS.has(command.animation)) ||
      (command.action === "animation" && !ANIMATIONS.has(command.animation)) ||
      (["focus", "highlight"].includes(command.action) && !command.target) ||
      (command.action === "animation" && command.animation === "pulse" && !command.target)) throw new Error("INVALID_PRESENTATION_COMMAND");
  return command;
}

const failure = (code, message) => ({ ok: false, code, message, businessMutation: false });

export function createTavusToolBridge({ contracts, controller } = {}) {
  // Accept the loaded public result or the original manifest; always validate
  // again at this boundary, including values fetched from /api/tavus-config.
  const raw = contracts?.ready === true
    ? { version: contracts.version, source: contracts.source, tools: contracts.tools, bindings: contracts.bindings }
    : contracts;
  const loaded = contracts?.ready === false ? unavailable(contracts.code || "TOOL_SCHEMA_UNAVAILABLE") : loadTavusToolContracts(raw);
  const validators = new Map();
  if (loaded.ready) {
    const ajv = new Ajv({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
    for (const tool of loaded.tools) validators.set(tool.function.name, ajv.compile(tool.function.parameters));
  }
  let disposed = false, generation = 0;

  async function handle(detail) {
    if (disposed) return failure("TOOL_BRIDGE_DISPOSED", "La sesión de herramientas ha terminado.");
    if (!loaded.ready) return failure("TOOL_SCHEMA_UNAVAILABLE", "Falta el esquema exportado de las herramientas del agente existente. No se ha ejecutado ninguna acción.");
    if (!object(detail) || !TOOL_NAMES.has(detail.name)) return failure("TOOL_NOT_ALLOWED", "Esta herramienta no está permitida en la visualización.");
    let args;
    try {
      args = boundedJSON(detail.arguments, MAX_ARGUMENT_BYTES);
      if (!validators.get(detail.name)?.(args)) return failure("TOOL_ARGUMENTS_INVALID", "Los argumentos no cumplen el esquema de la herramienta existente.");
    } catch { return failure("TOOL_ARGUMENTS_INVALID", "Los argumentos de la herramienta no son válidos o exceden el límite."); }
    let command;
    try { command = mapCommand(loaded.bindings[detail.name], args); }
    catch { return failure("TOOL_BINDING_UNRESOLVED", "La herramienta no puede traducirse a una acción visual permitida."); }
    if (typeof controller?.executeInternalCommand !== "function") return failure("PRESENTATION_UNAVAILABLE", "La visualización no está disponible.");
    const started = generation;
    try {
      const outcome = await controller.executeInternalCommand(command);
      if (disposed || generation !== started) return failure("TOOL_SESSION_ENDED", "La sesión terminó antes de completar la acción visual.");
      if (!outcome || typeof outcome.ok !== "boolean") return failure("PRESENTATION_FAILED", "La visualización no pudo completar la acción.");
      return {
        ok: outcome.ok,
        code: typeof outcome.code === "string" ? outcome.code : outcome.ok ? "PRESENTATION_COMPLETED" : "PRESENTATION_FAILED",
        message: outcome.ok ? "Acción visual completada. Los datos del CRM no se han modificado." : "La acción visual no se ha podido completar.",
        businessMutation: false,
      };
    } catch { return failure("PRESENTATION_FAILED", "La visualización no pudo completar la acción."); }
  }

  return Object.freeze({
    handle,
    reset() { generation++; },
    dispose() { generation++; disposed = true; },
    getStatus: () => ({ ready: loaded.ready && !disposed, code: disposed ? "TOOL_BRIDGE_DISPOSED" : loaded.code, disposed }),
  });
}
