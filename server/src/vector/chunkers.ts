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

// Generic chunking for simple text (used by addText in storage.ts)
export function chunkText(input: string): string[] {
	return input
		.trim()
		.split(".")
		.filter((i) => i !== "");
}

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

export function chunkCode(
	content: string,
	language: string,
	options: Required<ChunkerOptions>
): Chunk[] {
	const lines = content.split("\n");
	const chunks: Chunk[] = [];
	let currentChunk: string[] = [];
	let currentStartLine = 1;
	let braceDepth = 0;
	let parenDepth = 0;
	let bracketDepth = 0;
	let inString = false;
	let stringChar = "";

	// Heuristic function boundaries for common languages
	const functionPatterns: Record<string, RegExp> = {
		typescript: /^(export\s+)?(async\s+)?(function|const|let|var)\s+\w+\s*[=:]?\s*(\(|async\s*\()/,
		javascript: /^(export\s+)?(async\s+)?(function|const|let|var)\s+\w+\s*[=:]?\s*(\(|async\s*\()/,
		python: /^(def|async\s+def|class)\s+\w+/,
		go: /^func\s+(\([^)]*\)\s+)?\w+/,
		rust: /^(pub\s+)?(async\s+)?(fn|impl|struct|enum|trait)\s+\w+/,
		java: /^(public|private|protected)?\s*(static\s+)?(final\s+)?\w+\s+\w+\s*\(/,
	};

	const funcPattern = functionPatterns[language] || /^(function|const|let|var|def|fn|class|struct|enum|trait)\s+/;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		const isFunctionStart = funcPattern.test(line.trim());
		const currentSize = currentChunk.join("\n").length;

		// Track brace/ paren/ bracket depth
		for (const char of line) {
			if (char === '"' || char === "'" || char === "`") {
				if (!inString) {
					inString = true;
					stringChar = char;
				} else if (char === stringChar) {
					inString = false;
					stringChar = "";
				}
				continue;
			}

			if (inString) continue;

			if (char === "{") braceDepth++;
			else if (char === "}") braceDepth--;
			else if (char === "(") parenDepth++;
			else if (char === ")") parenDepth--;
			else if (char === "[") bracketDepth++;
			else if (char === "]") bracketDepth--;
		}

		const isCompleteFunction =
			isFunctionStart && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && currentChunk.length > 0;
		const shouldSplit = isCompleteFunction && currentSize >= options.targetSize * 0.7;

		if (shouldSplit) {
			const firstLine = currentChunk[0];
			const symbolName = firstLine ? extractSymbolName(firstLine, language) : undefined;
			const symbolKind = firstLine ? extractSymbolKind(firstLine, language) : undefined;
			
			const chunk: Chunk = {
				text: currentChunk.join("\n"),
				startLine: currentStartLine,
				endLine: i,
			};
			
			// Only include metadata if at least one field is defined
			if (symbolName !== undefined || symbolKind !== undefined) {
				chunk.metadata = {};
				if (symbolName !== undefined) chunk.metadata.symbolName = symbolName;
				if (symbolKind !== undefined) chunk.metadata.symbolKind = symbolKind;
			}
			
			chunks.push(chunk);

			// Start new chunk with overlap
			const overlapLines = Math.max(1, Math.floor(options.overlap / 50));
			currentChunk = currentChunk.slice(-overlapLines);
			currentStartLine = i + 1 - overlapLines;
		}

		currentChunk.push(line);

		// Force split if exceeds max size
		const chunkText = currentChunk.join("\n");
		if (chunkText.length > options.maxSize) {
			// Split at a reasonable boundary (empty line, closing brace, etc.)
			let splitIndex = currentChunk.length - 1;
			for (let j = currentChunk.length - 1; j >= Math.floor(currentChunk.length / 2); j--) {
				const line = currentChunk[j];
				if (line === undefined) continue;
				if (
					line.trim() === "" ||
					line.trim() === "}" ||
					line.trim() === "};"
				) {
					splitIndex = j;
					break;
				}
			}

			const firstPart = currentChunk.slice(0, splitIndex + 1);
			const secondPart = currentChunk.slice(splitIndex + 1);

			if (firstPart.length > 0) {
				chunks.push({
					text: firstPart.join("\n"),
					startLine: currentStartLine,
					endLine: currentStartLine + firstPart.length - 1,
				});
			}

			currentChunk = secondPart;
			currentStartLine = currentStartLine + firstPart.length;
		}
	}

	// Add remaining chunk
	if (currentChunk.length > 0) {
		chunks.push({
			text: currentChunk.join("\n"),
			startLine: currentStartLine,
			endLine: lines.length,
		});
	}

	return chunks.length > 0 ? chunks : [{ text: content, startLine: 1, endLine: lines.length }];
}

function extractSymbolName(line: string, language: string): string | undefined {
	if (!line) return undefined;
	
	const patterns: Record<string, RegExp> = {
		typescript: /(?:function|const|let|var|class|interface|enum|type)\s+(\w+)/,
		javascript: /(?:function|const|let|var|class|interface|enum)\s+(\w+)/,
		python: /(?:def|class)\s+(\w+)/,
		go: /(?:func|type|var|const)\s+(?:\([^)]*\)\s+)?(\w+)/,
		rust: /(?:fn|struct|enum|trait|impl|mod)\s+(\w+)/,
		java: /\w+\s+(\w+)\s*\(/,
	};

	const pattern = patterns[language] || /(?:function|const|let|var|def|fn|class|struct|enum)\s+(\w+)/;
	const match = line.match(pattern);
	return match?.[1];
}

function extractSymbolKind(line: string, language: string): string | undefined {
	if (!line) return undefined;
	
	if (/^(export\s+)?(async\s+)?(function|const|let|var)\s+\w+/i.test(line)) return "function";
	if (/^(export\s+)?(class|interface|enum|type)\s+\w+/i.test(line)) return "class";
	if (/^(def|async\s+def)\s+\w+/i.test(line)) return "function";
	if (/^class\s+\w+/i.test(line)) return "class";
	if (/^(pub\s+)?(fn|impl)\s+\w+/i.test(line)) return "function";
	if (/^(pub\s+)?(struct|enum|trait)\s+\w+/i.test(line)) return "type";
	return undefined;
}

export function chunkMarkdown(
	content: string,
	options: Required<ChunkerOptions>
): Chunk[] {
	const lines = content.split("\n");
	const chunks: Chunk[] = [];
	let currentChunk: string[] = [];
	let currentStartLine = 1;
	let currentLine = 1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		const isHeading = /^#{1,3}\s/.test(line);
		const currentSize = currentChunk.join("\n").length;

		// If we hit a heading and have content, save current chunk
		if (isHeading && currentChunk.length > 0 && currentSize >= options.targetSize * 0.7) {
			chunks.push({
				text: currentChunk.join("\n"),
				startLine: currentStartLine,
				endLine: currentLine - 1,
			});
			// Start new chunk with overlap
			const overlapLines = Math.floor(options.overlap / 50); // Rough estimate
			currentChunk = currentChunk.slice(-overlapLines);
			currentStartLine = currentLine - overlapLines;
		}

		currentChunk.push(line);

		// If chunk exceeds max size, split it
		const chunkText = currentChunk.join("\n");
		if (chunkText.length > options.maxSize) {
			// Split at paragraph boundary or code block
			let splitIndex = currentChunk.length - 1;
			for (let j = currentChunk.length - 1; j >= Math.floor(currentChunk.length / 2); j--) {
				const chunkLine = currentChunk[j];
				if (chunkLine === undefined) continue;
				if (
					chunkLine.trim() === "" ||
					chunkLine.startsWith("```") ||
					chunkLine.startsWith("---")
				) {
					splitIndex = j;
					break;
				}
			}

			const firstPart = currentChunk.slice(0, splitIndex + 1);
			const secondPart = currentChunk.slice(splitIndex + 1);

			if (firstPart.length > 0) {
				chunks.push({
					text: firstPart.join("\n"),
					startLine: currentStartLine,
					endLine: currentStartLine + firstPart.length - 1,
				});
			}

			currentChunk = secondPart;
			currentStartLine = currentStartLine + firstPart.length;
		}

		currentLine++;
	}

	// Add remaining chunk
	if (currentChunk.length > 0) {
		chunks.push({
			text: currentChunk.join("\n"),
			startLine: currentStartLine,
			endLine: currentLine - 1,
		});
	}

	return chunks.length > 0 ? chunks : [{ text: content, startLine: 1, endLine: lines.length }];
}

