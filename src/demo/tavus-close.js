/** Close only this page's embed, using its public API. Never end other calls. */
export async function closeTavusEmbed(element, { connected = false, callEnded = !connected, modeEnded = !connected, conversationId = null, timeoutMs = 8000 } = {}) {
  let timer, done = false;
  let signalEnd;
  const ended = new Promise((resolve) => { signalEnd = resolve; });
  const observe = (event) => {
    if (event.target !== element) return;
    if (event.type === "tavus:mode-change" && event.detail?.mode === "ended") modeEnded = true;
    if (event.type === "tavus:conversation-ended" && conversationId && event.detail?.conversationId && event.detail.conversationId !== conversationId) return;
    if (event.type === "tavus:conversation-ended" ||
        (!conversationId && event.type === "tavus:state-change" && event.detail?.state === "ended")) callEnded = true;
    if (modeEnded && callEnded) signalEnd();
  };
  const events = ["tavus:conversation-ended", "tavus:state-change", "tavus:mode-change"];
  for (const name of events) element.addEventListener(name, observe);
  if (modeEnded && callEnded) signalEnd();
  element.setAttribute?.("inert", "");
  element.setAttribute?.("aria-busy", "true");
  try {
    return await Promise.race([
      (async () => {
        await element.endConversation?.();
        if (connected) {
          await ended;
          if (done) return { ok: false, code: "CLOSE_TIMEOUT" };
          // 0.19.3 resolves the first call as soon as the call view leaves.
          // After mode=ended, the same public method awaits the shared pending
          // backend end / Daily leave operation. Daily ended alone is earlier.
          await element.endConversation?.();
        }
        return { ok: true };
      })().catch(() => ({ ok: false, code: "CLOSE_FAILED" })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, code: "CLOSE_TIMEOUT" }), timeoutMs);
      }),
    ]);
  } finally {
    done = true;
    clearTimeout(timer);
    signalEnd();
    for (const name of events) element.removeEventListener(name, observe);
    // A stalled close must still release local media and DOM resources.
    try { element.destroy?.(); } catch { /* Remove is the fallback. */ }
    try { element.remove?.(); } catch { /* It may already have been removed. */ }
  }
}
