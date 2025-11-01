import { ragRoute, ragAddRoute } from "./src/routes/rag";
import { ingestRoute, ingestStatusRoute, webhookRoute } from "./src/routes/github";
import { getTreeRoute, getPresetsRoute, savePresetRoute } from "./src/routes/diagrams";
import { initSchema } from "./src/db/postgres";

// Initialize PostgreSQL schema
await initSchema();

Bun.serve({
	port: process.env.PORT ? Number(process.env.PORT) : 3000,
	routes: {
		// Health check
		"/health": new Response("ok"),

		// RAG routes
		"/api/rag/query": {
			POST: ragRoute,
		},
		"/api/rag/add": {
			POST: ragAddRoute,
		},

		// GitHub routes
		"/api/github/ingest": {
			POST: ingestRoute,
		},
		"/api/github/ingest/status/:jobId": {
			GET: (req) => ingestStatusRoute(req, { jobId: req.params.jobId }),
		},
		"/api/github/webhook": {
			POST: webhookRoute,
		},

		// Diagram routes
		"/api/diagrams/tree": {
			GET: getTreeRoute,
		},
		"/api/diagrams/presets": {
			GET: getPresetsRoute,
		},
		"/api/diagrams/preset": {
			POST: savePresetRoute,
		},
	},
	fetch(req) {
		return new Response("Not Found", { status: 404 });
	},
});

console.log("Server running on port", process.env.PORT || 3000);
