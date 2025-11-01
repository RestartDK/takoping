import { chunkMarkdown } from "./markdown";
import { chunkCode } from "./code";

export interface Chunk {
	text: string;
	startLine: number;
	endLine: number;
	metadata?: {
		symbolName?: string;
		symbolKind?: string;
	};
}

export interface ChunkerOptions {
	targetSize?: number;
	maxSize?: number;
	overlap?: number;
}

const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
	targetSize: 1000,
	maxSize: 2000,
	overlap: 150,
};

export function chunkByLanguage(
	content: string,
	language: string,
	options: ChunkerOptions = {}
): Chunk[] {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	switch (language) {
		case "markdown":
		case "md":
			return chunkMarkdown(content, opts);
		case "typescript":
		case "ts":
		case "javascript":
		case "js":
		case "tsx":
		case "jsx":
		case "python":
		case "py":
		case "go":
		case "rust":
		case "rs":
		case "java":
		case "cpp":
		case "c":
		case "csharp":
		case "cs":
		case "php":
		case "ruby":
		case "rb":
		case "swift":
		case "kotlin":
		case "kt":
		case "scala":
		case "r":
		case "matlab":
		case "shell":
		case "sh":
		case "bash":
		case "yaml":
		case "yml":
		case "json":
		case "xml":
		case "html":
		case "css":
		case "scss":
		case "sass":
		case "less":
		case "sql":
		case "dockerfile":
		case "docker":
		case "makefile":
		case "make":
		case "cmake":
		case "plaintext":
		case "txt":
		default:
			return chunkCode(content, language, opts);
	}
}

export function detectLanguage(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() || "";
	const langMap: Record<string, string> = {
		ts: "typescript",
		js: "javascript",
		tsx: "tsx",
		jsx: "jsx",
		py: "python",
		go: "go",
		rs: "rust",
		java: "java",
		cpp: "cpp",
		cc: "cpp",
		cxx: "cpp",
		c: "c",
		cs: "csharp",
		php: "php",
		rb: "ruby",
		swift: "swift",
		kt: "kotlin",
		scala: "scala",
		r: "r",
		md: "markdown",
		yml: "yaml",
		json: "json",
		xml: "xml",
		html: "html",
		css: "css",
		scss: "scss",
		sass: "sass",
		less: "less",
		sql: "sql",
		dockerfile: "docker",
		makefile: "make",
		cmake: "cmake",
		txt: "plaintext",
		sh: "shell",
		bash: "shell",
	};
	return langMap[ext] || "plaintext";
}

