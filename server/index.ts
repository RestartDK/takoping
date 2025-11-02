import { chatRoute, chatAddRoute } from "./src/routes/chat";
import { ingestRoute, ingestStatusRoute, webhookRoute, getFileContentRoute } from "./src/routes/github";
import { getTreeRoute, getPresetsRoute, savePresetRoute } from "./src/routes/diagrams";
import { initSchema } from "./src/db/client";

// Initialize PostgreSQL schema
await initSchema();

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, x-vercel-ai-data-stream, User-Agent",
	"Access-Control-Expose-Headers": "x-vercel-ai-data-stream, x-vercel-ai-ui-message-stream",
};

// Wrapper to add CORS headers to responses
// Properly handles streaming responses by adding headers without re-wrapping
function withCors(handler: (req: Request) => Response | Promise<Response>) {
	return async (req: Request) => {
		// Handle preflight OPTIONS requests
		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		const response = await handler(req);
		
		// Add CORS headers to response (mutates existing headers)
		Object.entries(corsHeaders).forEach(([key, value]) => {
			response.headers.set(key, value);
		});

		return response;
	};
}

Bun.serve({
	port: process.env.PORT ? Number(process.env.PORT) : 3000,
	routes: {
		// Health check
		"/health": new Response("ok", { headers: corsHeaders }),

		// Chat routes
		"/api/chat/query": {
			POST: withCors(chatRoute),
		},
		"/api/chat/add": {
			POST: withCors(chatAddRoute),
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
		"/api/github/file": {
			GET: withCors(getFileContentRoute),
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
