import { ragRoute, ragAddRoute } from "./src/routes/rag";
import { ingestRoute, ingestStatusRoute, webhookRoute } from "./src/routes/github";
import { getTreeRoute, getPresetsRoute, savePresetRoute } from "./src/routes/diagrams";
import { initSchema } from "./src/db/postgres";

// Initialize PostgreSQL schema
await initSchema();

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

// Wrapper to add CORS headers to responses
function withCors(handler: (req: Request) => Response | Promise<Response>) {
	return async (req: Request) => {
		// Handle preflight OPTIONS requests
		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		const response = await handler(req);
		
		// Add CORS headers to response
		const newHeaders = new Headers(response.headers);
		Object.entries(corsHeaders).forEach(([key, value]) => {
			newHeaders.set(key, value);
		});

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		});
	};
}

Bun.serve({
	port: process.env.PORT ? Number(process.env.PORT) : 3000,
	routes: {
		// Health check
		"/health": new Response("ok", { headers: corsHeaders }),

		// RAG routes
		"/api/rag/query": {
			POST: withCors(ragRoute),
		},
		"/api/rag/add": {
			POST: withCors(ragAddRoute),
		},

		// GitHub routes
		"/api/github/ingest": {
			POST: withCors(ingestRoute),
		},
		"/api/github/ingest/status/:jobId": {
			GET: withCors((req) => {
				const url = new URL(req.url);
				const jobId = url.pathname.split('/').pop() || '';
				return ingestStatusRoute(req, { jobId });
			}),
		},
		"/api/github/webhook": {
			POST: withCors(webhookRoute),
		},

		// Diagram routes
		"/api/diagrams/tree": {
			GET: withCors(getTreeRoute),
		},
		"/api/diagrams/presets": {
			GET: withCors(getPresetsRoute),
		},
		"/api/diagrams/preset": {
			POST: withCors(savePresetRoute),
		},
	},
	fetch(req) {
		// Handle OPTIONS for unmatched routes
		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}
		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
});

console.log("Server running on port", process.env.PORT || 3000);
