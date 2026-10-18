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

export const STORY_TOUR_CHAPTERS = freeze(["intro", "commercial", "industrial"]);
export const STORY_TOUR = STORY_TOUR_CHAPTERS;

export const STORY_CHAPTERS = freeze({
  intro: chapter("intro", "Una empresa que puedes ver", "BIRD VIEW · PRESENTACIÓN", "all", [
    beat("world-assembles", 16, "Imagina un mundo para tu empresa",
      "Imagina que pudieras entender tu empresa como una ciudad. Primero aparecen las calles. Después, los edificios y las personas. Cada pieza ocupa su lugar, igual que los datos que ya tienes en tu CRM.",
      overview, "assemble-city", { cameraShot: "world-reveal", cameraMode: "reveal", labelMode: "none" }),
    beat("neighborhoods", 16, "Vamos a entrar en tu negocio",
      "La ciudad ya está viva. Este es el barrio comercial: nuevos contactos, propuestas y ventas. Más allá está la fábrica, con sus almacenes y repartos. Vamos a bajar a sus calles y acompañar una historia completa, paso a paso.",
      district("sales"), "none", { cameraShot: "neighborhoods", cameraMode: "district", labelMode: "districts" }),
  ]),
  commercial: chapter("commercial", "El viaje de una venta", "VENTAS · RECORRIDO GUIADO", "sales", [
    beat("sales-overview", 8, "Una oportunidad, un edificio",
      "Bienvenido al barrio comercial. Cada edificio es una oportunidad real de tu CRM. Las cinco zonas muestran en qué punto está cada posible venta. Vamos a conocerlas desde dentro.",
      district("sales"), "none", { cameraMode: "district", labelMode: "route" }),
    beat("first-contact", 10, "Nuevos leads: aquí empieza todo",
      "En esta primera calle llegan los nuevos leads. Son personas o empresas que han mostrado interés. Tu equipo empieza a escucharlas, y cada nuevo contacto encuentra su lugar en este barrio.",
      sales("lead"), "none", { cameraMode: "street", labelMode: "stage" }),
    beat("qualified-opportunity", 10, "Cualificados: hay una oportunidad",
      "Cuando el contacto encaja con tu negocio, pasa a la zona de cualificados. Ya sabemos qué necesita y podemos ayudarle. El comercial acompaña esa oportunidad hacia el siguiente paso.",
      sales("qualified"), "none", { cameraMode: "street", labelMode: "stage" }),
    beat("the-proposal", 11, "Propuestas: una solución sobre la mesa",
      "Aquí están las propuestas. El cliente ya tiene una solución y un presupuesto. Mira cómo cambia el tamaño de los edificios: puedes reconocer el valor de cada oportunidad sin abrir una hoja de cálculo.",
      sales("proposal"), "none", { cameraMode: "street", labelMode: "stage" }),
    beat("negotiation", 12, "Negociación: falta el último sí",
      "Nos acercamos a una negociación. El comercial está junto al edificio del cliente, resolviendo los últimos detalles. Este es el momento que vamos a seguir: una propuesta está a punto de convertirse en una venta ganada.",
      sales("negotiation"), "none", { cameraShot: "negotiation-close", cameraMode: "street", labelMode: "stage" }),
    beat("sale-deconstruct", 17, "El cliente dice sí. Llegan las grúas",
      "El cliente acepta. El CRM registra la venta y la ciudad responde. Las grúas desmontan el edificio, pieza a pieza. El comercial sigue aquí, junto a su cliente. La oportunidad deja atrás la negociación para ocupar su nuevo lugar.",
      sales("negotiation"), "sales-transfer", { effectRange: [0, 0.238], cameraShot: "sale-deconstruct", cameraMode: "street", labelMode: "stage" }),
    beat("sale-transport", 17, "Acompañamos la venta hasta su nuevo barrio",
      "El camión recoge las piezas y sale a la avenida. Viajamos a su lado por la ciudad. Ya no estás mirando una lista de estados: estás viendo cómo el trabajo del equipo avanza desde negociación hasta ventas ganadas.",
      sales("won"), "sales-transfer", { effectRange: [0.238, 0.578], cameraShot: "sale-transport", cameraMode: "follow", labelMode: "route" }),
    beat("sale-rebuild", 17, "Una nueva venta construye la ciudad",
      "Llegamos al barrio de ventas ganadas. Las grúas vuelven a trabajar y el edificio crece delante de nosotros. Cada planta representa el acuerdo que el equipo ha conseguido. El comercial acompaña la construcción hasta el final.",
      sales("won"), "sales-transfer", { effectRange: [0.578, 0.85], cameraShot: "sale-rebuild", cameraMode: "street", labelMode: "stage" }),
    beat("sale-won", 12, "¡Venta ganada! Un logro que se ve",
      "¡Venta ganada! El edificio está completo y el confeti celebra el logro del equipo. Así se ve el paso de una oportunidad a una venta. Ahora vamos a seguir otro viaje: el de un producto, desde la fábrica hasta las manos del cliente.",
      sales("won"), "celebrate-sale", { effectRange: [0.85, 1], cameraShot: "sale-celebration", cameraMode: "celebration", labelMode: "stage" }),
  ]),
  industrial: chapter("industrial", "De la fábrica a la entrega", "OPERACIONES · RECORRIDO GUIADO", "industry", [
    beat("industry-overview", 10, "La empresa también produce y entrega",
      "Cruzamos hacia el barrio industrial. Aquí la historia continúa: fabricar, empacar, almacenar, transportar y entregar. Cada zona muestra una etapa del producto, conectada con los datos de tus operaciones.",
      district("industry"), "none", { cameraShot: "industry-arrival", cameraMode: "district", labelMode: "route" }),
    beat("manufacturing", 16, "Fabricación: nace un nuevo lote",
      "Entramos en la fábrica. Un nuevo lote empieza a tomar forma. Los materiales avanzan por la línea de producción y las cajas se agrupan a la salida. Puedes ver qué se está fabricando y dónde empieza el trabajo.",
      industry("manufacturing"), "production-flow", { effectRange: [0, 0.24], cameraShot: "factory-floor", cameraMode: "street", labelMode: "stage" }),
    beat("packing", 15, "Empacado: listo para proteger y preparar",
      "Seguimos las cajas hasta empacado. Aquí el producto se prepara para viajar, protegido e identificado. Es otra etapa del mismo lote. Si el proceso se detiene, sabes en qué punto de la ciudad necesita atención.",
      industry("packing"), "production-flow", { effectRange: [0.24, 0.45], cameraShot: "packing-line", cameraMode: "follow", labelMode: "stage" }),
    beat("warehouse", 15, "Almacén: el stock tiene su lugar",
      "El lote llega al almacén. Aquí puedes distinguir lo que ya está preparado de lo que todavía se está fabricando. Las cajas esperan su salida y el camión se acerca para cargar el próximo reparto.",
      industry("warehouse"), "production-flow", { effectRange: [0.45, 0.63], cameraShot: "warehouse-loading", cameraMode: "street", labelMode: "stage" }),
    beat("production-in-motion", 20, "En transporte: viajamos con el reparto",
      "El camión sale del almacén y acompañamos su recorrido. La ciudad nos muestra dónde va el producto. Cuando hay ubicación real, puede seguirla; cuando solo hay una duración prevista, puede mostrar una estimación claramente identificada.",
      industry("transit"), "production-flow", { effectRange: [0.63, 0.89], cameraShot: "follow-production", cameraMode: "follow", labelMode: "stage" }),
    beat("delivery-arrives", 10, "La entrega llega al cliente",
      "Ya estamos en el destino. El camión se detiene y el pedido llega al cliente. Cuando la entrega se confirma en tus datos, la ciudad completa este último paso. Todo el recorrido queda a la vista.",
      industry("delivered"), "delivery", { effectRange: [0.89, 0.96], cameraShot: "follow-delivery", cameraMode: "street", labelMode: "stage" }),
    beat("delivered", 10, "¡Producto entregado! Otro objetivo cumplido",
      "¡Producto entregado! El confeti celebra el final de la ruta. Hemos seguido una venta y un producto desde dentro de la ciudad. Ahora tú eliges: podemos volver a ventas, recorrer la fábrica o descubrir las conversaciones con tus clientes.",
      industry("delivered"), "delivery", { effectRange: [0.96, 1], cameraShot: "delivery-celebration", cameraMode: "celebration", labelMode: "stage" }),
  ]),
  communications: chapter("communications", "Las relaciones dan vida al negocio", "RELACIONES · RECORRIDO GUIADO", "communications", [
    beat("communications-overview", 8, "El barrio de las conversaciones",
      "Detrás de cada oportunidad hay personas hablando. Este barrio reúne la actividad que registra tu CRM. Correos, llamadas y reuniones encuentran aquí un lugar propio.",
      district("communications"), "communications-flow", { effectRange: [0, 0.25], cameraMode: "district", labelMode: "route" }),
    beat("email", 7, "Cada mensaje abre una puerta",
      "La oficina de correos representa los mensajes. Sus indicadores muestran la actividad del equipo y ayudan a reconocer las conversaciones que mantienen vivo el negocio.",
      communication("email"), "communications-flow", { effectRange: [0.25, 0.5], cameraMode: "street", labelMode: "stage" }),
    beat("calls", 7, "Una llamada acerca al cliente",
      "Aquí viven las llamadas: conversaciones que resuelven dudas y ayudan a que las oportunidades avancen. Los datos de contacto se convierten en actividad visible en la ciudad.",
      communication("call"), "communications-flow", { effectRange: [0.5, 0.75], cameraMode: "street", labelMode: "stage" }),
    beat("meetings", 8, "Las reuniones crean confianza",
      "Y esta cafetería reúne los encuentros con clientes. Cada reunión registrada se suma a su actividad. Así puedes entender dónde se están construyendo las relaciones de tu empresa.",
      communication("meeting"), "communications-flow", { effectRange: [0.75, 1], cameraMode: "street", labelMode: "stage" }),
  ]),
});

export const STORY_TOUR_DURATION = STORY_TOUR_CHAPTERS.reduce((sum, id) => sum + STORY_CHAPTERS[id].duration, 0);
export function getStoryTourDuration() { return STORY_TOUR_DURATION; }

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
    cameraProgress: Math.min(progress / 0.65, 1),
    camera: { shot: current.cameraShot ?? current.id, mode: current.cameraMode ?? "district", pace: "calm", progress: Math.min(progress / 0.65, 1) },
    labels: {
      mode: current.choice ? "none" : current.labelMode ?? "stage",
      section: chapterData.section,
      activeId: current.target.kind.endsWith("stage") || current.target.kind === "communication" ? current.target.id : null,
      visibleIds: current.labelMode === "none" || current.choice ? [] : chapterData.section === "sales" ? ["lead", "qualified", "proposal", "negotiation", "won"] : chapterData.section === "industry" ? ["manufacturing", "packing", "warehouse", "transit", "delivered"] : chapterData.section === "communications" ? ["email", "call", "meeting"] : ["commercial", "industrial", "communications"],
    },
    holdingChoice: current.choice === true, choices: current.choice ? STORY_CHOICES : [],
    fictional: true,
  });
}
