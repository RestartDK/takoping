import { Octokit } from "octokit";
import { env } from "../env";

if (!env.GITHUB_TOKEN) {
	throw new Error("GITHUB_TOKEN is required for GitHub API access");
}

export const octokit = new Octokit({
	auth: env.GITHUB_TOKEN,
});

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

