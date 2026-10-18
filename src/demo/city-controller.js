/**
 * Read-only presentation boundary. These are application commands, not Tavus
 * tool schemas. The verified Tavus contract must be translated separately.
 * The controller never receives a CRM/ERP provider or a write operation.
 */
const DISTRICTS = new Set(["all", "sales", "communications", "industry"]);
const COMMUNICATIONS = new Set(["email", "call", "messages", "meeting"]);
const ACTIONS = new Set(["overview", "focus", "highlight", "animation"]);
const ANIMATIONS = new Set(["pulse", "traffic", "machinery"]);
const includesId = (records, id) =>
  Array.isArray(records) && records.some((entry) => entry?.id === id);

export function isPresentationTarget(target, snapshot = {}) {
  if (!target || typeof target.id !== "string" || target.id.length > 160)
    return false;
  const { crm = {}, industry = {} } = snapshot || {};
  switch (target.kind) {
    case "district":
      return DISTRICTS.has(target.id);
    case "sales-stage":
      return target.id === "clients"
        ? Array.isArray(crm.accounts) && crm.accounts.length > 0
        : includesId(crm.stages, target.id);
    case "deal":
      return includesId(crm.deals, target.id);
    case "account":
      return includesId(crm.accounts, target.id);
    case "owner":
      return includesId(crm.owners, target.id);
    case "communication":
      return COMMUNICATIONS.has(target.id);
    case "industry-stage":
      return includesId(industry.stages, target.id);
    case "batch":
      return includesId(industry.batches, target.id);
    case "vehicle":
      return includesId(industry.vehicles, target.id);
    default:
      return false;
  }
}

const result = (ok, code, extra = {}) => ({
  ok,
  code,
  businessMutation: false,
  ...extra,
});

export function createCityPresentationController({
  getScene,
  getSnapshot,
  onAction = () => {},
} = {}) {
  if (typeof getScene !== "function" || typeof getSnapshot !== "function") {
    throw new TypeError(
      "The city presentation requires scene and snapshot getters.",
    );
  }
  const queue = [];
  let active = false,
    disposed = false,
    running = null,
    sessionView = null,
    sessionFacade = null,
    unsubscribeNavigation = null,
    sequence = 0,
    generation = 0;
  const emit = (event) => {
    try {
      onAction(event);
    } catch {
      /* Observers cannot break cleanup. */
    }
  };
  const facade = () => getScene()?.presentation || null;
  const commandResult = (command, value) => ({
    ...value,
    commandId: command.commandId,
    action: command.action,
    businessMutation: false,
  });

  function startSession() {
    if (disposed) return result(false, "disposed");
    if (active) return result(true, "already_started");
    const nextFacade = facade();
    if (!nextFacade?.captureView || !nextFacade?.restoreView)
      return result(false, "scene_unavailable");
    try {
      sessionView = nextFacade.captureView();
      if (!sessionView) return result(false, "scene_unavailable");
      sessionFacade = nextFacade;
      active = true;
      generation++;
      unsubscribeNavigation =
        nextFacade.onManualNavigation?.(() => {
          cancel({ reason: "manual_navigation" });
          emit({ status: "manual_navigation" });
        }) || null;
      return result(true, "started");
    } catch {
      active = false;
      sessionView = sessionFacade = null;
      return result(false, "scene_unavailable");
    }
  }

  function validate(command) {
    if (!command || !ACTIONS.has(command.action)) return "unsupported_action";
    if (
      command.duration !== undefined &&
      (!Number.isFinite(command.duration) ||
        command.duration < 0.15 ||
        command.duration > 12)
    )
      return "invalid_duration";
    if (command.action === "animation" && !ANIMATIONS.has(command.animation))
      return "unsupported_animation";
    const requiresTarget =
      command.action !== "overview" &&
      (command.action !== "animation" || command.animation === "pulse");
    try {
      if (
        (requiresTarget || command.target) &&
        !isPresentationTarget(command.target, getSnapshot())
      )
        return "target_unavailable";
    } catch {
      return "snapshot_unavailable";
    }
    return null;
  }

  async function apply(command) {
    const current = facade();
    if (!current || current !== sessionFacade)
      return result(false, "scene_unavailable");
    const invalid = validate(command);
    if (invalid) return result(false, invalid);
    const target = command.target
      ? { ...command.target, duration: command.duration }
      : null;
    switch (command.action) {
      case "overview":
        return current.overview({ duration: command.duration });
      case "focus":
        return current.focusTarget(target);
      case "highlight":
        return current.highlightTarget(target);
      case "animation":
        return current.playAnimation({
          kind: command.animation,
          target: command.target,
          duration: command.duration,
        });
      default:
        return result(false, "unsupported_action");
    }
  }

  async function pump() {
    if (running || !active || disposed) return;
    const item = queue.shift();
    if (!item) return;
    const itemGeneration = generation;
    let interrupt;
    const cancellation = new Promise((resolve) => {
      interrupt = resolve;
    });
    running = { item, interrupt };
    emit({ status: "started", command: item.command });
    let outcome;
    try {
      const operation =
        itemGeneration === generation && active
          ? apply(item.command)
          : cancellation;
      outcome = await Promise.race([operation, cancellation]);
      if (!outcome || typeof outcome.ok !== "boolean")
        outcome = result(false, "invalid_scene_result");
    } catch {
      outcome = result(false, "presentation_failed");
    }
    const complete = commandResult(item.command, outcome);
    item.resolve(complete);
    emit({ status: "finished", command: item.command, result: complete });
    if (running?.item === item) running = null;
    if (itemGeneration === generation && active) void pump();
  }

  function executeInternalCommand(input) {
    if (disposed) return Promise.resolve(result(false, "disposed"));
    if (!active) return Promise.resolve(result(false, "session_inactive"));
    const invalid = validate(input);
    if (invalid) return Promise.resolve(result(false, invalid));
    // Eight includes the operation currently moving the camera.
    if (queue.length + (running ? 1 : 0) >= 8)
      return Promise.resolve(result(false, "queue_full"));
    const command = {
      commandId: `presentation-${++sequence}`,
      action: input.action,
      ...(input.target
        ? { target: { kind: input.target.kind, id: input.target.id } }
        : {}),
      ...(input.animation ? { animation: input.animation } : {}),
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
    };
    if (command.target) Object.freeze(command.target);
    Object.freeze(command);
    return new Promise((resolve) => {
      queue.push({ command, resolve });
      void pump();
    });
  }

  function cancel({ reason = "cancelled", restore = false } = {}) {
    generation++;
    const current = running;
    // Detach synchronously: a new request cannot remain behind an unresolved
    // camera promise, even if a renderer has stopped producing frames.
    running = null;
    current?.interrupt(result(false, reason));
    for (const item of queue.splice(0)) {
      item.resolve(commandResult(item.command, result(false, reason)));
    }
    try {
      sessionFacade?.cancel(reason);
    } catch {
      /* Continue restoring. */
    }
    if (restore && sessionView && sessionFacade) {
      try {
        return sessionFacade.restoreView(sessionView);
      } catch {
        return result(false, "restore_failed");
      }
    }
    return result(true, "cancelled");
  }

  function endSession({ restore = true } = {}) {
    if (!active) return result(true, "already_ended");
    active = false;
    unsubscribeNavigation?.();
    unsubscribeNavigation = null;
    const outcome = cancel({ reason: "session_ended", restore });
    sessionView = sessionFacade = null;
    return outcome;
  }

  return Object.freeze({
    startSession,
    endSession,
    executeInternalCommand,
    cancel,
    getState: () => ({
      active,
      disposed,
      queued: queue.length,
      executing: Boolean(running),
    }),
    dispose() {
      if (disposed) return;
      endSession();
      disposed = true;
    },
  });
}
