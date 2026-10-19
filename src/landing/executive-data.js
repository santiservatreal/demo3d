// A coherent, read-only example for the marketing page. No CRM is queried.
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const stages = [
  { id: "lead", label: "Nuevos leads", count: 4, value: 20000, attention: 2, color: "#5795ef", signal: "Dos contactos esperan una primera conversación." },
  { id: "qualified", label: "Cualificados", count: 3, value: 18000, attention: 0, color: "#3baeb3", signal: "Tres oportunidades con encaje confirmado." },
  { id: "proposal", label: "Propuestas", count: 2, value: 30000, attention: 0, color: "#c1953e", signal: "Dos propuestas concentran 30.000 € del pipeline." },
  { id: "negotiation", label: "Negociación", count: 1, value: 27000, attention: 1, color: "#9c72d1", signal: "Luma SL lleva cinco días sin respuesta. Hay 27.000 € en seguimiento." },
  { id: "won", label: "Ventas ganadas", count: 4, value: 60000, attention: 0, color: "#37986d", signal: "Cuatro acuerdos ganados este mes. El último, de Marc Ruiz: 18.000 €." },
];
const reps = [
  { id: "lucia", name: "Lucía Costa", initials: "LC", wonValue: 32000, wins: 2, active: 4 },
  { id: "marc", name: "Marc Ruiz", initials: "MR", wonValue: 18000, wins: 1, active: 3 },
  { id: "ana", name: "Ana Gil", initials: "AG", wonValue: 10000, wins: 1, active: 3 },
];
const pipeline = stages.filter(stage => stage.id !== "won").reduce((sum, stage) => sum + stage.value, 0);
const won = reps.reduce((sum, rep) => sum + rep.wonValue, 0);
const invoiced = 42000;

export const LANDING_EXAMPLE = freeze({
  label: "Datos de ejemplo",
  period: "Este mes",
  stages,
  reps,
  totals: {
    pipeline,
    invoiced,
    won,
    target: 80000,
    pendingInvoice: won - invoiced,
    attention: stages.reduce((sum, stage) => sum + stage.attention, 0),
    opportunities: stages.filter(stage => stage.id !== "won").reduce((sum, stage) => sum + stage.count, 0),
  },
  attention: [
    { id: "luma", company: "Luma SL", stageId: "negotiation", value: 27000, owner: "Marc Ruiz", issue: "5 días sin respuesta" },
    { id: "arce", company: "Arce Estudio", stageId: "lead", value: 6000, owner: "Lucía Costa", issue: "Primer contacto pendiente" },
    { id: "nexo", company: "Nexo Digital", stageId: "lead", value: 4000, owner: "Ana Gil", issue: "Primer contacto pendiente" },
  ],
  recentWin: { company: "Grupo Zafiro", owner: "Marc Ruiz", value: 18000 },
});
