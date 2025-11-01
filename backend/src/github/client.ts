import { Octokit } from "octokit";
import { env } from "../env";

let octokitInstance: Octokit | null = null;

export function getOctokit(): Octokit {
	if (!octokitInstance) {
		if (!env.GITHUB_TOKEN) {
			throw new Error("GITHUB_TOKEN is required for GitHub API access");
		}
		octokitInstance = new Octokit({
			auth: env.GITHUB_TOKEN,
		});
	}
	return octokitInstance;
}

export type GitHubFile = {
	path: string;
	mode: string;
	type: "blob" | "tree";
	sha: string;
	size?: number;
	url?: string;
};

export type BlobContent = {
	content: string;
	encoding: string;
	sha: string;
	size: number;
};

