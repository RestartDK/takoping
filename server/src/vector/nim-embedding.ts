// TODO: Properly implement this when deployed embeddings service
import type { EmbeddingFunction } from "chromadb";

type NIMEmbeddingOptions = {
  apiKey: string;
  baseURL: string; // e.g., https://integrate.api.nvidia.com/v1
  model: string; // e.g., NV-Embed-QA or similar
};

export class NIMEmbedding implements EmbeddingFunction {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly model: string;

  constructor(opts: NIMEmbeddingOptions) {
    this.apiKey = opts.apiKey;
    this.baseURL = opts.baseURL.replace(/\/$/, "");
    this.model = opts.model;
  }

  public async generate(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: "passage", // Required for asymmetric models
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`NIM embeddings request failed: ${res.status} ${msg}`);
    }

    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => d.embedding);
  }
}

