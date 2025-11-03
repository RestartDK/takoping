import { sql } from "bun";
import { pg } from "../../db/client";
import { getRepository } from "../../db/queries";

export async function queryFileTree(params: {
	owner: string;
	repo: string;
	query: string;
	filters?: {
		pathPatterns?: string[];
		languages?: string[];
		maxDepth?: number;
	};
}) {
	const { owner, repo, query, filters } = params;

	// Get repository
	const repoRecord = await getRepository(`${owner}/${repo}`);
	if (!repoRecord) {
		throw new Error(`Repository ${owner}/${repo} not found`);
	}

	// Build path pattern filter SQL fragment
	const buildPathFilter = (pathPatterns: string[]) => {
		if (pathPatterns.length === 0) return pg``;
		if (pathPatterns.length === 1) {
			const sqlPattern = pathPatterns[0]!.replace(/\*\*/g, "%").replace(/\*/g, "%");
			return pg`AND path LIKE ${sqlPattern}`;
		}
		// Build OR conditions manually for multiple patterns
		let result = pg`AND (`;
		pathPatterns.forEach((pattern, idx) => {
			const sqlPattern = pattern.replace(/\*\*/g, "%").replace(/\*/g, "%");
			if (idx === 0) {
				result = pg`${result}path LIKE ${sqlPattern}`;
			} else {
				result = pg`${result} OR path LIKE ${sqlPattern}`;
			}
		});
		return pg`${result})`;
	};

	// Build language filter SQL fragment using ANY with array
	const buildLanguageFilter = (languages: string[]) => {
		if (languages.length === 0) return pg``;
		// Use ANY with PostgreSQL array literal
		return pg`AND language = ANY(${sql.array(languages)})`;
	};

	// Build depth filter SQL fragment
	const buildDepthFilter = (maxDepth?: number) => {
		if (maxDepth === undefined) return pg``;
		return pg`AND depth <= ${maxDepth}`;
	};

	// Execute query for summary stats
	const summaryResult = await pg`
    SELECT 
      COUNT(*) FILTER (WHERE node_type = 'file') as total_files,
      COUNT(*) FILTER (WHERE node_type = 'directory') as total_directories,
      COALESCE(SUM(file_size), 0)::bigint as total_size,
      COALESCE(MAX(depth), 0) as max_depth
    FROM file_tree_nodes
    WHERE repo_id = ${repoRecord.id}
    ${buildPathFilter(filters?.pathPatterns || [])}
    ${buildLanguageFilter(filters?.languages || [])}
    ${buildDepthFilter(filters?.maxDepth)}
  `;

	const summary = summaryResult[0] || {
		total_files: 0,
		total_directories: 0,
		total_size: 0,
		max_depth: 0,
	};

	// Get language breakdown
	const languageResult = await pg`
    SELECT 
      language,
      COUNT(*) as file_count,
      SUM(file_size) as total_size
    FROM file_tree_nodes
    WHERE repo_id = ${repoRecord.id}
      AND node_type = 'file'
      AND language IS NOT NULL
    ${buildPathFilter(filters?.pathPatterns || [])}
    ${buildLanguageFilter(filters?.languages || [])}
    ${buildDepthFilter(filters?.maxDepth)}
    GROUP BY language
    ORDER BY file_count DESC
  `;

	const languages: Record<string, number> = {};
	for (const row of languageResult) {
		if (row.language) {
			languages[row.language] = parseInt(row.file_count as string);
		}
	}

	// Find largest folder (by file count)
	const largestFolderResult = await pg`
    SELECT 
      path,
      file_count,
      cumulative_size
    FROM file_tree_nodes
    WHERE repo_id = ${repoRecord.id}
      AND node_type = 'directory'
    ${buildPathFilter(filters?.pathPatterns || [])}
    ORDER BY file_count DESC, cumulative_size DESC
    LIMIT 1
  `;

	const largestFolder = largestFolderResult[0]?.path || undefined;

	// Build natural language answer
	let answer = `In the ${owner}/${repo} repository`;
	if (filters?.pathPatterns && filters.pathPatterns.length > 0) {
		answer += ` (filtered to ${filters.pathPatterns.join(", ")})`;
	}
	answer += `:\n`;
	answer += `- Total files: ${summary.total_files}\n`;
	answer += `- Total directories: ${summary.total_directories}\n`;
	answer += `- Total size: ${(Number(summary.total_size) / 1024).toFixed(2)} KB\n`;
	answer += `- Maximum depth: ${summary.max_depth}\n`;

	if (Object.keys(languages).length > 0) {
		answer += `- Languages: ${Object.entries(languages)
			.map(([lang, count]) => `${lang} (${count} files)`)
			.join(", ")}\n`;
	}

	if (largestFolder) {
		answer += `- Largest folder: ${largestFolder}\n`;
	}

	return {
		summary: {
			totalFiles: Number(summary.total_files),
			totalDirectories: Number(summary.total_directories),
			languages,
			totalSize: Number(summary.total_size),
			maxDepth: Number(summary.max_depth),
			largestFolder,
		},
		answer,
	};
}

