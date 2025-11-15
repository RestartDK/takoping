import { chatRoute, chatAddRoute } from "./src/routes/chat";
import { ingestRoute, ingestStatusRoute, webhookRoute, getFileContentRoute } from "./src/routes/github";
import { getTreeRoute, getPresetsRoute, savePresetRoute, getPresetByIdRoute } from "./src/routes/diagrams";
import { initSchema } from "./src/db/client";

// Initialize PostgreSQL schema
await initSchema();

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, x-vercel-ai-data-stream, User-Agent",
	"Access-Control-Expose-Headers": "x-vercel-ai-data-stream, x-vercel-ai-ui-message-stream",
};

function withCors(handler: (req: Request) => Response | Promise<Response>) {
	return async (req: Request) => {
		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		const response = await handler(req);
		
		Object.entries(corsHeaders).forEach(([key, value]) => {
			response.headers.set(key, value);
		});

		return response;
	};
}

Bun.serve({
	idleTimeout: 30,
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
		"/api/diagrams/preset/:id": {
			GET: withCors((req) => {
				const url = new URL(req.url);
				const id = url.pathname.split('/').pop() || '';
				return getPresetByIdRoute(req, { id });
			}),
		},
	},
	fetch(req) {
		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}
		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
});