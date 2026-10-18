// Presentation-only choreography. Sampling never edits a CRM record or starts a service.
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const overview = { kind: "district", id: "all" };
const district = (id) => ({ kind: "district", id });
const sales = (id) => ({ kind: "sales-stage", id });
const industry = (id) => ({ kind: "industry-stage", id });
const communication = (id) => ({ kind: "communication", id });
const beat = (id, duration, title, narration, target, effect = "none", extra = {}) => ({
  id, duration, title, narration, target, effect, ...extra,
});

export const STORY_CHOICES = freeze([
  { id: "commercial", label: "Explorar ventas", description: "De la primera oportunidad a la venta ganada", section: "sales" },
  { id: "industrial", label: "Ver producción", description: "De la fábrica hasta la entrega", section: "industry" },
  { id: "communications", label: "Descubrir relaciones", description: "Correos, llamadas y reuniones cobran vida", section: "communications" },
]);

function chapter(id, title, eyebrow, section, beats) {
  let elapsed = 0;
  const timed = beats.map((entry) => {
    const result = { ...entry, start: elapsed, end: elapsed + entry.duration };
    elapsed += entry.duration;
    return result;
  });
  const lastTarget = timed.at(-1)?.target ?? overview;
  timed.push({
    id: id === "intro" ? "choose-path" : "choose-next", duration: 0,
    start: elapsed, end: elapsed, title: "¿Qué parte de la empresa quieres descubrir?",
    narration: "Tú eliges el siguiente recorrido. Podemos descubrir las ventas, la producción o las conversaciones con los clientes.",
    target: lastTarget, effect: id === "commercial" ? "celebrate-sale" : id === "industrial" ? "delivery" : "none", effectRange: [1, 1], choice: true,
  });
  return { id, title, eyebrow, section, duration: elapsed, beats: timed };
}

export const STORY_CHAPTERS = freeze({
  intro: chapter("intro", "Una empresa que puedes ver", "BIRD VIEW · PRESENTACIÓN", "all", [
    beat("world-assembles", 12, "Imagina un mundo para tu empresa",
      "Imagina entender tu empresa como una ciudad. Tus datos empiezan a tomar forma: calles, edificios y personas se conectan, pieza a pieza, delante de ti.",
      overview, "assemble-city", { cameraShot: "world-reveal" }),
    beat("neighborhoods", 12, "Cada barrio cuenta una historia",
      "Aquí viven tus oportunidades. Al otro lado, la fábrica y los repartos. Y entre ambos, las conversaciones que hacen crecer las relaciones con tus clientes.",
      district("sales"), "none", { cameraShot: "neighborhoods" }),
  ]),
  commercial: chapter("commercial", "El viaje de una venta", "VENTAS · RECORRIDO GUIADO", "sales", [
    beat("sales-overview", 4, "Una oportunidad, un edificio",
      "Entremos en el barrio comercial. Cada edificio representa una oportunidad de tu CRM.", district("sales")),
    beat("first-contact", 5, "Todo empieza con un contacto",
      "En este primer barrio llegan los nuevos contactos. Tu equipo empieza a conocer sus necesidades.", sales("lead")),
    beat("qualified-opportunity", 4, "Una oportunidad con futuro",
      "Cuando encaja con tu negocio, el contacto se convierte en una oportunidad cualificada.", sales("qualified")),
    beat("the-proposal", 5, "La propuesta toma forma",
      "Aquí el equipo prepara la propuesta. Puedes entender en un vistazo qué negocios están avanzando.", sales("proposal")),
    beat("negotiation", 6, "Estamos a un paso del sí",
      "Llegamos a la negociación. El comercial acompaña al cliente y trabaja en los últimos detalles del acuerdo.", sales("negotiation")),
    beat("sale-in-motion", 15, "El acuerdo cambia el paisaje",
      "El trato avanza. Las grúas desmontan el edificio, el camión cruza al siguiente barrio y la venta vuelve a construirse. Un cambio de tu CRM se convierte en una historia visible.",
      sales("won"), "sales-transfer", { effectRange: [0, 0.85], cameraShot: "follow-sale" }),
    beat("sale-won", 9, "¡Venta ganada!",
      "¡Venta ganada! Celebramos el logro del equipo. Una oportunidad cerrada tiene ahora su propio lugar en la ciudad.",
      sales("won"), "celebrate-sale", { effectRange: [0.85, 1], cameraShot: "sale-celebration" }),
  ]),
  industrial: chapter("industrial", "De la fábrica a la entrega", "OPERACIONES · RECORRIDO GUIADO", "industry", [
    beat("industry-overview", 5, "El negocio también se mueve aquí",
      "Viajemos a la zona industrial. Aquí puedes seguir los productos desde la fabricación hasta el cliente.", district("industry")),
    beat("manufacturing", 7, "La producción cobra vida",
      "Un nuevo lote empieza a fabricarse. Máquinas, materiales y personas forman parte del mismo proceso.", industry("manufacturing")),
    beat("production-in-motion", 12, "Fabricar, preparar y salir",
      "El producto pasa a empacado, llega al almacén y se prepara para salir. El movimiento conecta las etapas y muestra dónde está cada lote.",
      industry("transit"), "production-flow", { effectRange: [0, 0.72], cameraShot: "follow-production" }),
    beat("delivery-arrives", 8, "El último tramo hasta el cliente",
      "El camión recorre su ruta y llega al destino. La entrega se refleja en la ciudad, de forma clara y visible.",
      industry("delivered"), "delivery", { effectRange: [0.72, 1], cameraShot: "follow-delivery" }),
    beat("delivered", 4, "¡Producto entregado!",
      "Producto entregado. El recorrido se completa y el equipo puede celebrar otro objetivo conseguido.",
      industry("delivered"), "delivery", { effectRange: [1, 1], cameraShot: "delivery-celebration" }),
  ]),
  communications: chapter("communications", "Las relaciones dan vida al negocio", "RELACIONES · RECORRIDO GUIADO", "communications", [
    beat("communications-overview", 6, "El barrio de las conversaciones",
      "Detrás de cada oportunidad hay personas hablando. Este barrio reúne la actividad que registra tu CRM.",
      district("communications"), "communications-flow", { effectRange: [0, 0.25] }),
    beat("email", 5, "Cada mensaje abre una puerta",
      "La oficina de correos representa los mensajes. Sus indicadores muestran la actividad de tu equipo.",
      communication("email"), "communications-flow", { effectRange: [0.25, 0.5] }),
    beat("calls", 5, "Una llamada acerca al cliente",
      "Aquí viven las llamadas: conversaciones que resuelven dudas y ayudan a que las oportunidades avancen.",
      communication("call"), "communications-flow", { effectRange: [0.5, 0.75] }),
    beat("meetings", 6, "Las reuniones crean confianza",
      "Y esta cafetería reúne los encuentros con clientes. La actividad del CRM se convierte en un lugar que puedes entender de un vistazo.",
      communication("meeting"), "communications-flow", { effectRange: [0.75, 1] }),
  ]),
});

export function getStoryChapter(id = "intro") {
  const result = STORY_CHAPTERS[id];
  if (!result) throw new RangeError(`Unknown presentation chapter: ${String(id)}`);
  return result;
}

/** Sample at an absolute chapter time in seconds, including the final choice hold. */
export function sampleStory(chapterId = "intro", elapsedSeconds = 0) {
  const chapterData = getStoryChapter(chapterId);
  const numeric = Number(elapsedSeconds);
  const chapterElapsed = Number.isNaN(numeric) ? 0 : Math.min(chapterData.duration, Math.max(0, numeric));
  const beatIndex = chapterData.beats.findIndex((entry) => entry.choice || chapterElapsed < entry.end);
  const current = chapterData.beats[beatIndex];
  const beatElapsed = current.choice ? 0 : chapterElapsed - current.start;
  const progress = current.duration > 0 ? Math.min(1, beatElapsed / current.duration) : 0;
  const [effectStart, effectEnd] = current.effectRange ?? [0, 1];
  const fromTarget = beatIndex > 0 ? chapterData.beats[beatIndex - 1].target : overview;
  return freeze({
    chapterId, chapterTitle: chapterData.title, chapterDuration: chapterData.duration,
    chapterElapsed, chapterProgress: chapterData.duration > 0 ? chapterElapsed / chapterData.duration : 1,
    beatId: current.id, beatIndex, beatCount: chapterData.beats.length, beatStart: current.start,
    beatElapsed, duration: current.duration, progress,
    title: current.title, eyebrow: chapterData.eyebrow, narration: current.narration,
    section: chapterData.section, target: current.target, fromTarget,
    effect: current.effect, effectProgress: progress,
    effectStageProgress: effectStart + (effectEnd - effectStart) * progress,
    cityProgress: chapterId === "intro" && beatIndex === 0 ? progress : 1,
    cameraProgress: Math.min(progress / 0.45, 1),
    camera: { shot: current.cameraShot ?? current.id, progress: Math.min(progress / 0.45, 1) },
    holdingChoice: current.choice === true, choices: current.choice ? STORY_CHOICES : [],
    fictional: true,
  });
}
