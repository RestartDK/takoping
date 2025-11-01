import type { Chunk, ChunkerOptions } from "./index";

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
			chunks.push({
				text: currentChunk.join("\n"),
				startLine: currentStartLine,
				endLine: i,
				metadata: {
					symbolName: extractSymbolName(currentChunk[0], language),
					symbolKind: extractSymbolKind(currentChunk[0], language),
				},
			});

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
				if (
					currentChunk[j].trim() === "" ||
					currentChunk[j].trim() === "}" ||
					currentChunk[j].trim() === "};"
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
	if (/^(export\s+)?(async\s+)?(function|const|let|var)\s+\w+/i.test(line)) return "function";
	if (/^(export\s+)?(class|interface|enum|type)\s+\w+/i.test(line)) return "class";
	if (/^(def|async\s+def)\s+\w+/i.test(line)) return "function";
	if (/^class\s+\w+/i.test(line)) return "class";
	if (/^(pub\s+)?(fn|impl)\s+\w+/i.test(line)) return "function";
	if (/^(pub\s+)?(struct|enum|trait)\s+\w+/i.test(line)) return "type";
	return undefined;
}

