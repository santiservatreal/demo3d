/** Explicit demo playback chooses ERP commands; the renderer never posts them. */
export function nextProductionAction(state, preferredId = null) {
  const batches = state?.batches || [];
  const vehicles = state?.vehicles || [];
  const batch =
    batches.find((b) => b.id === preferredId && b.stageId !== "delivered") ||
    batches.find((b) => b.stageId !== "delivered");
  if (!batch) return { type: "complete" };
  if (
    batch.stageId === "warehouse" &&
    !vehicles.some(
      (v) =>
        v.status === "available" &&
        v.location === "warehouse" &&
        !v.cargoBatchId &&
        v.capacity >= batch.quantity,
    )
  ) {
    const returning = vehicles.find((v) => v.status === "returning");
    if (returning)
      return { type: "arrive", id: returning.id, batchId: batch.id };
    const empty = vehicles.find(
      (v) => v.status === "at_customer" && !v.cargoBatchId,
    );
    if (empty) return { type: "return", id: empty.id, batchId: batch.id };
    // Finish another recorded shipment before reusing its truck.
    const loaded = batches.find(
      (b) =>
        b.stageId === "transit" &&
        vehicles.some(
          (v) =>
            v.id === b.assignedTruckId &&
            v.status === "outbound" &&
            v.cargoBatchId === b.id,
        ),
    );
    return loaded
      ? { type: "advance", id: loaded.id, batchId: batch.id }
      : { type: "waiting", batchId: batch.id };
  }
  return { type: "advance", id: batch.id, batchId: batch.id };
}
