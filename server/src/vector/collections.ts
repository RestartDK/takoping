import { chromaClient, getEmbedder } from "@/vector/client";

export async function getUsersCollection() {
	const embeddingFunction = getEmbedder();
	return await chromaClient.getOrCreateCollection({ name: "users", embeddingFunction });
}

export async function getDocumentsCollection() {
	const embeddingFunction = getEmbedder();
	return await chromaClient.getOrCreateCollection({ name: "documents", embeddingFunction });
}

