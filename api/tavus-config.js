import { loadTavusToolContracts } from "../src/demo/tool-contracts.js";

// Deployment IDs are public widget configuration. API keys, persona settings
// and arbitrary environment fields are never serialized by this endpoint.
const publicId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value.trim()) ? value.trim() : null;

export function createTavusConfigHandler({ env = process.env } = {}) {
  return function tavusConfig(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.statusCode = 405;
      res.end(JSON.stringify({ code: "METHOD_NOT_ALLOWED" }));
      return;
    }
    const deploymentId = publicId(env.TAVUS_DEPLOYMENT_ID) || publicId(env.VITE_TAVUS_DEPLOYMENT_ID);
    res.statusCode = 200;
    res.end(JSON.stringify({
      configured: Boolean(deploymentId),
      code: deploymentId ? "TAVUS_DEPLOYMENT_CONFIGURED" : "TAVUS_DEPLOYMENT_NOT_CONFIGURED",
      deploymentId,
      palId: publicId(env.TAVUS_PAL_ID),
      contracts: loadTavusToolContracts(env.TAVUS_TOOL_CONTRACTS_JSON),
    }));
  };
}

export default createTavusConfigHandler();
