import { Octokit } from "octokit";
import { env } from "../env";

if (!env.GITHUB_TOKEN) {
	throw new Error("GITHUB_TOKEN is required for GitHub API access");
}

export const octokit = new Octokit({
	auth: env.GITHUB_TOKEN,
});

// Extract types from Octokit API responses
type GitGetTreeResponse = Awaited<ReturnType<typeof octokit.rest.git.getTree>>;
export type GitHubFile = NonNullable<GitGetTreeResponse["data"]["tree"]>[number];

type ReposGetContentResponse = Awaited<ReturnType<typeof octokit.rest.repos.getContent>>;
type ReposContentData = ReposGetContentResponse["data"];
// Extract the file content type (when response.data is not an array and type is "file")
export type BlobContent = ReposContentData extends Array<any>
	? never
	: ReposContentData extends { type: "file" }
		? ReposContentData
		: never;