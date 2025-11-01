import { z } from "zod";
import { ingestRepository, getIngestJob, deltaUpdate } from "../github/ingest";
import { getOctokit } from "../github/client";
import { getDocumentsCollection } from "../db/collections";

const IngestSchema = z.object({
	owner: z.string().min(1, "owner is required"),
	repo: z.string().min(1, "repo is required"),
	branch: z.string().optional(),
	rootPath: z.string().optional(),
});

const WebhookPayloadSchema = z.object({
	ref: z.string().optional(),
	before: z.string().optional(),
	after: z.string().optional(),
	repository: z.object({
		name: z.string(),
		owner: z.object({
			login: z.string().optional(),
			name: z.string().optional(),
		}),
	}).optional(),
}).loose(); 

export const ingestRoute = async (req: Request) => {
	if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

	const contentType = req.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return new Response(JSON.stringify({ error: "Expected application/json" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}

	const parsed = IngestSchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response(
			JSON.stringify({
				error: "Invalid payload",
				details: z.treeifyError(parsed.error),
			}),
			{ status: 400, headers: { "content-type": "application/json" } }
		);
	}

	try {
		const jobId = await ingestRepository(parsed.data);
		return new Response(JSON.stringify({ jobId }), {
			headers: { "content-type": "application/json" },
		});
	} catch (error) {
		console.error("/api/github/ingest failed", error);
		return new Response(
			JSON.stringify({
				error: "Internal Server Error",
				message: error instanceof Error ? error.message : String(error),
			}),
			{ status: 500, headers: { "content-type": "application/json" } }
		);
	}
};

export const ingestStatusRoute = async (req: Request, params: { jobId: string }) => {
	if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

	const job = getIngestJob(params.jobId);
	if (!job) {
		return new Response(JSON.stringify({ error: "Job not found" }), {
			status: 404,
			headers: { "content-type": "application/json" },
		});
	}

	return new Response(JSON.stringify(job), {
		headers: { "content-type": "application/json" },
	});
};

export const webhookRoute = async (req: Request) => {
	if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

	const contentType = req.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return new Response(JSON.stringify({ error: "Expected application/json" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}

	try {
		const parsed = WebhookPayloadSchema.safeParse(await req.json());
		if (!parsed.success) {
			// For webhooks, we want to be lenient - just log and return received
			console.warn("/api/github/webhook validation failed", z.treeifyError(parsed.error));
			return new Response(JSON.stringify({ received: true, skipped: "invalid payload" }), {
				headers: { "content-type": "application/json" },
			});
		}

		const payload = parsed.data;
		// TODO: Verify webhook signature using X-Hub-Signature-256 header

		if (payload.ref && payload.before && payload.after && payload.repository) {
			const owner = payload.repository.owner.login || payload.repository.owner.name;
			const repo = payload.repository.name;
			const beforeSha = payload.before;
			const afterSha = payload.after;

			if (!owner || !repo) {
				return new Response(JSON.stringify({ received: true, skipped: "missing owner or repo" }), {
					headers: { "content-type": "application/json" },
				});
			}

			// Skip if this is a tag or delete event
			if (!payload.ref.startsWith("refs/heads/")) {
				return new Response(JSON.stringify({ received: true, skipped: "not a branch" }), {
					headers: { "content-type": "application/json" },
				});
			}

			const branch = payload.ref.replace("refs/heads/", "");

			// Process delta update
			const octokit = getOctokit();
			const collection = await getDocumentsCollection();
			const result = await deltaUpdate(octokit, collection, owner, repo, beforeSha, afterSha, branch);

			return new Response(
				JSON.stringify({
					received: true,
					owner,
					repo,
					beforeSha,
					afterSha,
					...result,
				}),
				{
					headers: { "content-type": "application/json" },
				}
			);
		}

		return new Response(JSON.stringify({ received: true }), {
			headers: { "content-type": "application/json" },
		});
	} catch (error) {
		console.error("/api/github/webhook failed", error);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

