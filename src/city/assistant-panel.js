import {
  answerCityQuestion,
  companyRecommendations,
} from "./assistant-model.js";

const FIRST_TIP_DELAY = 12000;
const TIP_INTERVAL = 30000;
const HISTORY_LIMIT = 16;
const ACTIONS = new Set([
  "focus-owner",
  "focus-entity",
  "district",
  "attention",
]);

function icon(document, name) {
  const paths = {
    sparkles:
      "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7 0v4m-2-2h4",
    send: "m5 12 7-7 7 7M12 5v14",
    close: "m6 6 12 12M6 18 18 6",
    chevron: "m6 15 6-6 6 6",
    insight: "M9 18h6m-5 3h4M9 15c0-3-3-3-3-7a6 6 0 0 1 12 0c0 4-3 4-3 7H9Z",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name] || paths.sparkles);
  svg.append(path);
  return svg;
}

/** A local CRM reading assistant. It only requests visual navigation actions. */
export function createCityAssistant({
  container,
  getContext,
  onAction,
  answerQuestion,
} = {}) {
  if (!container?.ownerDocument)
    throw new TypeError("City assistant needs a DOM container");
  const document = container.ownerDocument;
  const window = document.defaultView || globalThis;
  const root = document.createElement("section");
  root.className = "c-assistant";
  root.setAttribute("aria-label", "Asistente de la ciudad");

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const button = (label, action, className = "") => {
    const node = make("button", className, label);
    node.type = "button";
    node.dataset.assistantAction = action;
    return node;
  };

  const tip = make("aside", "c-assistant-tip");
  tip.id = "city-assistant-tip";
  tip.setAttribute("aria-label", "Recomendación del CRM");
  tip.setAttribute("aria-live", "polite");
  tip.hidden = true;
  const tipMark = make("span", "c-assistant-tip-icon");
  tipMark.append(icon(document, "insight"));
  const tipBody = make("div", "c-assistant-tip-body");
  const tipTitle = make("b");
  const tipText = make("p");
  const tipSource = make("small");
  tipBody.append(tipTitle, tipText, tipSource);
  const tipView = button(
    "Ver en la ciudad",
    "tip-view",
    "c-assistant-tip-view",
  );
  const tipDismiss = button("", "tip-dismiss", "c-assistant-icon-button");
  tipDismiss.setAttribute("aria-label", "Descartar recomendación");
  tipDismiss.append(icon(document, "close"));
  tip.append(tipMark, tipBody, tipView, tipDismiss);

  const conversation = make("div", "c-assistant-conversation");
  conversation.id = "city-assistant-conversation";
  conversation.hidden = true;
  const conversationHeader = make("div", "c-assistant-conversation-header");
  const conversationTitle = make("b", "", "Tu ciudad, en una conversación");
  const collapse = button("", "collapse", "c-assistant-icon-button");
  collapse.setAttribute("aria-label", "Contraer conversación");
  collapse.append(icon(document, "close"));
  conversationHeader.append(conversationTitle, collapse);
  const messages = make("div", "c-assistant-messages");
  messages.id = "city-assistant-messages";
  messages.setAttribute("role", "log");
  messages.setAttribute("aria-live", "polite");
  messages.setAttribute("aria-relevant", "additions");
  messages.setAttribute("tabindex", "0");
  const welcome = make(
    "p",
    "c-assistant-welcome",
    "Pregunta por tu equipo, tus ventas o lo que necesita atención. Te lo mostraré en la ciudad.",
  );
  messages.append(welcome);
  conversation.append(conversationHeader, messages);

  const composer = make("div", "c-assistant-composer");
  const expand = button("", "expand", "c-assistant-expand");
  expand.setAttribute("aria-label", "Abrir conversación con Atlas");
  expand.setAttribute("aria-controls", conversation.id);
  expand.setAttribute("aria-expanded", "false");
  expand.append(
    icon(document, "sparkles"),
    make("span", "", "Pregunta a Atlas"),
  );
  const form = make("form", "c-assistant-form");
  form.id = "city-assistant-form";
  const input = make("input", "c-assistant-input");
  input.id = "city-assistant-input";
  input.type = "text";
  input.name = "question";
  input.maxLength = 300;
  input.autocomplete = "off";
  input.placeholder = "¿Dónde está Lucía?";
  input.setAttribute("aria-label", "Pregunta sobre tu empresa");
  const send = make("button", "c-assistant-send");
  send.type = "submit";
  send.setAttribute("aria-label", "Enviar pregunta");
  send.append(icon(document, "send"));
  form.append(input, send);
  const meta = make("div", "c-assistant-meta");
  const sourceLabel = make(
    "span",
    "c-assistant-source",
    "Demo local · consultas guiadas",
  );
  const mute = button(
    "Silenciar consejos",
    "tips-mute",
    "c-assistant-preference",
  );
  mute.setAttribute("aria-pressed", "false");
  meta.append(sourceLabel, mute);
  composer.append(expand, form, meta);
  const examples = make("div", "c-assistant-examples");
  examples.setAttribute("aria-label", "Preguntas sugeridas");
  for (const question of [
    "Dónde está Lucía",
    "Facturación total",
    "Qué necesita atención",
  ]) {
    const suggestion = button(question, "example", "c-assistant-example");
    suggestion.dataset.question = question;
    examples.append(suggestion);
  }
  const status = make("span", "c-assistant-status");
  status.id = "city-assistant-status";
  status.setAttribute("role", "status");
  root.append(tip, conversation, composer, examples, status);
  container.append(root);

  let disposed = false;
  let mode = "explore";
  let district = "sales";
  let expanded = false;
  let muted = false;
  let timer = null;
  let dueAt = 0;
  let remaining = FIRST_TIP_DELAY;
  let visibleTip = null;
  let tipCount = 0;
  let askCount = 0;
  let pending = false;
  let requestVersion = 0;
  let answerMode = "local";
  const dismissed = new Set();
  const history = [];

  function paused() {
    return disposed || document.hidden || mode === "tv" || mode === "replay";
  }

  function context() {
    return typeof getContext === "function" ? getContext() || {} : {};
  }

  function runAction(action) {
    if (!action || !ACTIONS.has(action.type) || paused()) return false;
    try {
      if (typeof onAction === "function") onAction({ ...action });
    } catch {
      return false;
    }
    return true;
  }

  function setExpanded(next, returnFocus = false) {
    expanded = !!next;
    conversation.hidden = !expanded;
    examples.hidden = !expanded;
    root.classList.toggle("is-expanded", expanded);
    expand.setAttribute("aria-expanded", String(expanded));
    revealComposer();
    if (returnFocus) input.focus({ preventScroll: true });
  }

  function revealComposer() {
    if (expanded && !paused())
      composer.scrollIntoView?.({
        block: "nearest",
        inline: "nearest",
        behavior: "auto",
      });
  }

  function appendMessage(role, text, source = "") {
    welcome.remove();
    const item = make("div", `c-assistant-message is-${role}`);
    const author = make("b", "", role === "user" ? "Tú" : "Atlas");
    const content = make("p", "", String(text || ""));
    item.append(author, content);
    if (source) item.append(make("small", "", String(source)));
    messages.append(item);
    history.push({
      role,
      text: String(text || ""),
      source: String(source || ""),
    });
    while (history.length > HISTORY_LIMIT) {
      history.shift();
      messages.firstElementChild?.remove();
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function ask(question) {
    const value = String(question || "")
      .trim()
      .slice(0, 300);
    if (!value || paused() || pending) return null;
    setExpanded(true);
    appendMessage("user", value);
    askCount += 1;
    input.value = "";
    const version = ++requestVersion;
    const fallbackAnswer = () => ({
      text: "No puedo leer los datos en este momento. Vuelve a intentarlo en unos segundos.",
      actions: [],
      sourceLabel: "Demo local · consultas guiadas",
      mode: "local",
    });
    const finish = (answer) => {
      if (disposed || version !== requestVersion) return null;
      const result = answer?.text ? answer : fallbackAnswer();
      answerMode = result.mode === "ai" ? "ai" : "local";
      sourceLabel.textContent =
        answerMode === "ai"
          ? "IA · datos del CRM"
          : "Demo local · consultas guiadas";
      for (const action of Array.isArray(result.actions) ? result.actions : [])
        runAction(action);
      appendMessage(
        "assistant",
        result.text,
        result.sourceLabel || sourceLabel.textContent,
      );
      revealComposer();
      return result;
    };
    const release = () => {
      if (disposed || version !== requestVersion) return;
      pending = false;
      send.disabled = false;
      form.setAttribute("aria-busy", "false");
      root.classList.remove("is-pending");
      status.textContent = "Respuesta disponible";
    };
    try {
      const answer =
        typeof answerQuestion === "function"
          ? answerQuestion(value, context())
          : answerCityQuestion(value, context());
      if (answer && typeof answer.then === "function") {
        pending = true;
        send.disabled = true;
        form.setAttribute("aria-busy", "true");
        root.classList.add("is-pending");
        sourceLabel.textContent = "Consultando datos…";
        status.textContent = "Consultando los datos de tu empresa";
        return Promise.resolve(answer)
          .then(finish, () => finish(fallbackAnswer()))
          .finally(release);
      }
      return finish(answer);
    } catch {
      return finish(fallbackAnswer());
    }
  }

  function clearTimer(preserve = false) {
    if (timer != null) {
      if (preserve) remaining = Math.max(0, dueAt - Date.now());
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(delay = remaining) {
    clearTimer();
    remaining = Math.max(0, delay);
    if (paused() || muted) return;
    dueAt = Date.now() + remaining;
    timer = window.setTimeout(() => {
      timer = null;
      if (paused() || muted) return;
      showNextTip();
      schedule(TIP_INTERVAL);
    }, remaining);
  }

  function recommendations() {
    try {
      const items = companyRecommendations(context());
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  function renderTip(item) {
    visibleTip = item || null;
    if (!visibleTip) {
      tip.hidden = true;
      return;
    }
    const write = (element, value) => {
      const text = String(value || "");
      if (element.textContent !== text) element.textContent = text;
    };
    write(tipTitle, visibleTip.title || "Una idea para tu empresa");
    write(tipText, visibleTip.text);
    write(tipSource, visibleTip.sourceLabel || "Demo local · datos del CRM");
    tip.dataset.tone = visibleTip.tone === "warning" ? "warning" : "info";
    tipView.hidden = !visibleTip.action;
    tip.hidden = false;
  }

  function showNextTip() {
    const candidates = recommendations().filter(
      (item) => item?.id && !dismissed.has(item.id),
    );
    if (!candidates.length) {
      renderTip(null);
      return;
    }
    const previousIndex = candidates.findIndex(
      (item) => item.id === visibleTip?.id,
    );
    renderTip(candidates[(previousIndex + 1) % candidates.length]);
    tipCount += 1;
  }

  function setMuted(next) {
    muted = !!next;
    mute.dataset.assistantAction = muted ? "tips-resume" : "tips-mute";
    mute.textContent = muted ? "Reactivar consejos" : "Silenciar consejos";
    mute.setAttribute("aria-pressed", String(muted));
    clearTimer();
    if (muted) {
      tip.hidden = true;
      visibleTip = null;
      status.textContent = "Consejos silenciados";
    } else {
      status.textContent = "Consejos activados";
      schedule(FIRST_TIP_DELAY);
    }
  }

  function update(options = {}) {
    const wasPaused = paused();
    if (typeof options.mode === "string") mode = options.mode;
    if (typeof options.district === "string") district = options.district;
    root.hidden = mode === "tv" || mode === "replay";
    if (paused()) clearTimer(!wasPaused);
    else if (wasPaused && timer == null && !muted) schedule(remaining);
    if (visibleTip && !paused()) {
      const current = recommendations().find(
        (item) => item.id === visibleTip.id,
      );
      renderTip(current);
    }
  }

  function onVisibilityChange() {
    if (paused()) clearTimer(true);
    else if (timer == null && !muted) schedule(remaining);
  }

  function onClick(event) {
    const target = event.target.closest("[data-assistant-action]");
    if (!target || !root.contains(target)) return;
    const action = target.dataset.assistantAction;
    if (action === "expand") setExpanded(!expanded);
    else if (action === "collapse") setExpanded(false, true);
    else if (action === "example") {
      ask(target.dataset.question);
      input.focus({ preventScroll: true });
    } else if (action === "tip-view") runAction(visibleTip?.action);
    else if (action === "tip-dismiss") {
      if (visibleTip) dismissed.add(visibleTip.id);
      if (dismissed.size > 256)
        dismissed.delete(dismissed.values().next().value);
      visibleTip = null;
      tip.hidden = true;
      schedule(TIP_INTERVAL);
    } else if (action === "tips-mute") setMuted(true);
    else if (action === "tips-resume") setMuted(false);
  }

  function onSubmit(event) {
    event.preventDefault();
    ask(input.value);
  }

  function onKeydown(event) {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false, true);
    }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  form.addEventListener("submit", onSubmit);
  document.addEventListener("visibilitychange", onVisibilityChange);
  examples.hidden = true;
  schedule();

  return {
    ask,
    update,
    reset() {
      requestVersion += 1;
      pending = false;
      answerMode = "local";
      send.disabled = false;
      form.setAttribute("aria-busy", "false");
      root.classList.remove("is-pending");
      sourceLabel.textContent = "Demo local · consultas guiadas";
      clearTimer();
      remaining = FIRST_TIP_DELAY;
      dismissed.clear();
      visibleTip = null;
      tipCount = 0;
      askCount = 0;
      history.length = 0;
      messages.replaceChildren(welcome);
      input.value = "";
      tip.hidden = true;
      status.textContent = "";
      setExpanded(false);
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      requestVersion += 1;
      pending = false;
      clearTimer();
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      form.removeEventListener("submit", onSubmit);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      root.remove();
    },
    debug() {
      return {
        mode,
        district,
        disposed,
        expanded,
        hidden: root.hidden,
        paused: paused(),
        muted,
        timerActive: timer != null,
        visibleTip: visibleTip ? { ...visibleTip } : null,
        tipCount,
        askCount,
        pending,
        answerMode,
        dismissed: [...dismissed],
        history: history.map((item) => ({ ...item })),
      };
    },
  };
}
