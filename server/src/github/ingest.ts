import { getOctokit, type GitHubFile } from "./client";
import { chunkByLanguage, detectLanguage } from "../vector/chunkers";
import { getDocumentsCollection } from "../vector/collections";
import type { Collection } from "chromadb";
import { upsertRepository, buildFileTree, markFileAsIndexed, updateRepositoryIndexingStatus } from "../db/queries";
import { addGitHubChunks } from "../vector/storage";

const BINARY_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"svg",
	"ico",
	"webp",
	"pdf",
	"zip",
	"tar",
	"gz",
	"7z",
	"rar",
	"exe",
	"dll",
	"so",
	"dylib",
	"woff",
	"woff2",
	"ttf",
	"otf",
	"eot",
	"mp4",
	"mp3",
	"avi",
	"mov",
	"wmv",
	"flv",
	"webm",
]);

export interface IngestOptions {
	owner: string;
	repo: string;
	branch?: string;
	rootPath?: string;
}

export interface IngestJob {
	id: string;
	status: "queued" | "running" | "done" | "error";
	counts: {
		files: number;
		skipped: number;
		chunks: number;
	};
	error?: string;
}

const jobs = new Map<string, IngestJob>();

function isBinaryFile(path: string, size?: number): boolean {
	const ext = path.split(".").pop()?.toLowerCase() || "";
	if (BINARY_EXTENSIONS.has(ext)) return true;
	if (size && size > 2 * 1024 * 1024) return true; // >2MB
	return false;
}

async function getRepoTree(
	octokit: ReturnType<typeof getOctokit>,
	owner: string,
	repo: string,
	branch: string
): Promise<GitHubFile[]> {
	console.log(`[GITHUB] Getting ref for ${owner}/${repo} branch ${branch}`);
	const refResponse = await octokit.rest.git.getRef({
		owner,
		repo,
		ref: `heads/${branch}`,
	});
	console.log(`[GITHUB] Got ref SHA: ${refResponse.data.object.sha}`);

	const treeSha = refResponse.data.object.sha;

	console.log(`[GITHUB] Getting tree for SHA: ${treeSha}`);
	const treeResponse = await octokit.rest.git.getTree({
		owner,
		repo,
		tree_sha: treeSha,
		recursive: "1",
	});
	console.log(`[GITHUB] Got ${treeResponse.data.tree?.length || 0} items in tree`);

	return (treeResponse.data.tree || []).filter((item): item is GitHubFile => item.type === "blob");
}

export async function fetchFileContent(
	octokit: ReturnType<typeof getOctokit>,
	owner: string,
	repo: string,
	path: string,
	branch: string
): Promise<{ content: string; sha: string }> {
	const response = await octokit.rest.repos.getContent({
		owner,
		repo,
		path,
		ref: branch,
	});

	if (Array.isArray(response.data)) {
		throw new Error(`Path ${path} is a directory`);
	}

	if (response.data.type !== "file") {
		throw new Error(`Path ${path} is not a file`);
	}

	const content = Buffer.from(response.data.content, "base64").toString("utf-8");
	return { content, sha: response.data.sha };
}

async function indexFile(
	octokit: ReturnType<typeof getOctokit>,
	collection: Collection,
	owner: string,
	repo: string,
	branch: string,
	file: GitHubFile
): Promise<{ chunks: number; skipped: boolean }> {
	// file.path is already the full path from repo root, so use it directly
	const fullPath = file.path;

	if (isBinaryFile(fullPath, file.size)) {
		return { chunks: 0, skipped: true };
	}

	try {
		console.log(`[DEBUG] Starting to index ${fullPath} (size: ${file.size || "unknown"})`);
		const { content, sha } = await fetchFileContent(octokit, owner, repo, fullPath, branch);
		console.log(`[DEBUG] Fetched content for ${fullPath}: ${content.length} chars, sha: ${sha.substring(0, 8)}...`);

		const language = detectLanguage(fullPath);
		console.log(`[DEBUG] Detected language for ${fullPath}: ${language}`);
		
		const chunks = chunkByLanguage(content, language);
		console.log(`[DEBUG] Generated ${chunks.length} chunks for ${fullPath}`);

		if (chunks.length === 0) {
			console.warn(`[DEBUG] No chunks generated for ${fullPath} (language: ${language}, content length: ${content.length})`);
			return { chunks: 0, skipped: true };
		}

		// Delete old chunks for this file path
		// ChromaDB requires $and operator for multiple conditions
		await collection.delete({
			where: {
				$and: [
					{ path: fullPath },
					{ repo: `${owner}/${repo}` },
				],
			},
		});

		// Add chunks using the reusable function
		try {
			const ids = await addGitHubChunks(collection, chunks, {
				owner,
				repo,
				branch,
				path: fullPath,
				sha,
				language,
			});
			console.log(`[DEBUG] Successfully added ${ids.length} chunks for ${fullPath}`);
		} catch (addError) {
			console.error(`[DEBUG] Failed to add chunks for ${fullPath}:`, {
				error: addError instanceof Error ? addError.message : String(addError),
				stack: addError instanceof Error ? addError.stack : undefined,
			});
			throw addError;
		}

		return { chunks: chunks.length, skipped: false };
	} catch (error) {
		console.error(`[ERROR] Failed to index ${fullPath}:`, {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			file: fullPath,
			size: file.size,
		});
		return { chunks: 0, skipped: true };
	}
}

export async function ingestRepository(options: IngestOptions): Promise<string> {
	const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	const job: IngestJob = {
		id: jobId,
		status: "queued",
		counts: { files: 0, skipped: 0, chunks: 0 },
	};
	jobs.set(jobId, job);

	// Start ingestion async
	(async () => {
		try {
			job.status = "running";
			console.log(`[INGEST] Starting ingestion for ${options.owner}/${options.repo}`);
			
			const octokit = getOctokit();
			console.log(`[INGEST] Octokit client initialized`);
			
			const collection = await getDocumentsCollection();
			console.log(`[INGEST] ChromaDB collection retrieved`);

			const branch = options.branch || "main";
			
			// 1. Upsert repository metadata in PostgreSQL
			console.log(`[INGEST] Upserting repository to PostgreSQL...`);
			const repo = await upsertRepository({
				owner: options.owner,
				repo: options.repo,
				defaultBranch: branch,
			});
			console.log(`[INGEST] Repository upserted with ID: ${repo.id}`);

			await updateRepositoryIndexingStatus(`${options.owner}/${options.repo}`, "indexing");
			console.log(`[INGEST] Repository status updated to indexing`);

			const tree = await getRepoTree(octokit, options.owner, options.repo, branch);
			
			// 2. Build file tree structure for PostgreSQL
			const treeNodes = buildTreeStructure(tree, options.rootPath);
			await buildFileTree(repo.id, treeNodes);

			let filesProcessed = 0;
			let filesSkipped = 0;
			let totalChunks = 0;

			// Filter files
			const filesToProcess = tree.filter((file) => {
				if (options.rootPath && !file.path.startsWith(options.rootPath)) {
					return false;
				}
				return true;
			});

			job.counts.files = filesToProcess.length;

			// Process files in batches with concurrency limit
			const CONCURRENCY = 8;
			for (let i = 0; i < filesToProcess.length; i += CONCURRENCY) {
				const batch = filesToProcess.slice(i, i + CONCURRENCY);
				const results = await Promise.all(
					batch.map((file) =>
						indexFile(octokit, collection, options.owner, options.repo, branch, file)
					)
				);

				// Mark files as indexed in PostgreSQL
				for (let j = 0; j < batch.length; j++) {
					const file = batch[j];
					const result = results[j];
					
					if (!file || !result) continue;
					
					if (result.skipped) {
						filesSkipped++;
					} else {
						filesProcessed++;
						totalChunks += result.chunks;
						
						// Mark file as indexed with chunk count
						if (result.chunks > 0) {
							await markFileAsIndexed(repo.id, file.path, result.chunks);
						}
					}
				}

				job.counts = {
					files: filesProcessed + filesSkipped,
					skipped: filesSkipped,
					chunks: totalChunks,
				};
			}

			await updateRepositoryIndexingStatus(`${options.owner}/${options.repo}`, "done");
			job.status = "done";
			console.log(`[INGEST] Ingestion completed successfully for ${options.owner}/${options.repo}`);
		} catch (error) {
			console.error(`[INGEST] Error during ingestion for ${options.owner}/${options.repo}:`, error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			await updateRepositoryIndexingStatus(`${options.owner}/${options.repo}`, "error", errorMessage);
			job.status = "error";
			job.error = errorMessage;
		}
	})();

	return jobId;
}

export function getIngestJob(jobId: string): IngestJob | null {
	return jobs.get(jobId) || null;
}

export async function deltaUpdate(
	octokit: ReturnType<typeof getOctokit>,
	collection: Collection,
	owner: string,
	repo: string,
	beforeSha: string,
	afterSha: string,
	branch: string = "main"
): Promise<{ filesProcessed: number; filesSkipped: number; chunksAdded: number }> {
	const compareResponse = await octokit.rest.repos.compareCommits({
		owner,
		repo,
		base: beforeSha,
		head: afterSha,
	});

	const files = compareResponse.data.files || [];
	let filesProcessed = 0;
	let filesSkipped = 0;
	let chunksAdded = 0;

	for (const file of files) {
		if (file.status === "removed") {
			// Delete chunks for removed files
			await collection.delete({
				where: {
					$and: [
						{ path: file.filename },
						{ repo: `${owner}/${repo}` },
					],
				},
			});
			filesProcessed++;
			continue;
		}

		if (file.status === "added" || file.status === "modified") {
			if (!file.filename) continue;

			// Fetch file content
			try {
				const { content, sha } = await fetchFileContent(octokit, owner, repo, file.filename, branch);

				const language = detectLanguage(file.filename);
				const chunks = chunkByLanguage(content, language);

				if (chunks.length === 0) {
					filesSkipped++;
					continue;
				}

				// Delete old chunks
				await collection.delete({
					where: {
						$and: [
							{ path: file.filename },
							{ repo: `${owner}/${repo}` },
						],
					},
				});

				// Add new chunks using the reusable function
				try {
					const ids = await addGitHubChunks(collection, chunks, {
						owner,
						repo,
						branch,
						path: file.filename,
						sha,
						language,
					});
					console.log(`[DEBUG] Successfully added ${ids.length} chunks for ${file.filename}`);
				} catch (addError) {
					console.error(`[DEBUG] Failed to add chunks for ${file.filename}:`, {
						error: addError instanceof Error ? addError.message : String(addError),
						stack: addError instanceof Error ? addError.stack : undefined,
					});
					throw addError;
				}
				filesProcessed++;
				chunksAdded += chunks.length;
			} catch (error) {
				console.error(`Failed to delta update ${file.filename}:`, error);
				filesSkipped++;
			}
		}
	}

	return { filesProcessed, filesSkipped, chunksAdded };
}

// Helper to build tree structure from flat GitHub tree
function buildTreeStructure(
	githubTree: GitHubFile[],
	rootPath?: string
): Array<{
	path: string;
	name: string;
	type: "file" | "directory";
	parentPath?: string;
	size?: number;
	language?: string;
	extension?: string;
	blobSha?: string;
}> {
	const nodes = [];
	const directories = new Set<string>();

	// Collect all directory paths
	for (const file of githubTree) {
		if (!file.path) continue;
		const parts = file.path.split("/");
		for (let i = 0; i < parts.length - 1; i++) {
			directories.add(parts.slice(0, i + 1).join("/"));
		}
	}

	// Create directory nodes
	for (const dirPath of Array.from(directories).sort()) {
		const parts = dirPath.split("/");
		const name = parts[parts.length - 1];
		if (!name) continue;
		
		nodes.push({
			path: dirPath,
			name,
			type: "directory" as const,
			parentPath: parts.length > 1 ? parts.slice(0, -1).join("/") : undefined,
		});
	}

	// Create file nodes
	for (const file of githubTree) {
		if (!file.path) continue;
		if (isBinaryFile(file.path, file.size)) continue;

		const parts = file.path.split("/");
		const fileName = parts[parts.length - 1];
		if (!fileName) continue;
		
		const extension = fileName.includes(".") ? fileName.split(".").pop() : undefined;

		// Ensure size is a valid number and within BIGINT range (max: 9223372036854775807)
		const safeSize = typeof file.size === "number" && file.size >= 0 && file.size < 9223372036854775807 ? file.size : 0;

		nodes.push({
			path: file.path,
			name: fileName,
			type: "file" as const,
			parentPath: parts.length > 1 ? parts.slice(0, -1).join("/") : undefined,
			size: safeSize,
			language: detectLanguage(file.path),
			extension,
			blobSha: file.sha,
		});
	}

	return nodes;
}

