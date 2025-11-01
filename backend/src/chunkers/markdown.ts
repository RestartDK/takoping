import type { Chunk, ChunkerOptions } from "./index";

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
				if (
					currentChunk[j].trim() === "" ||
					currentChunk[j].startsWith("```") ||
					currentChunk[j].startsWith("---")
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

