export class EmbedderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbedderError";
  }
}

export type Embedder = (input: string[]) => Promise<number[][]>;

interface EmbedArgs {
  url: string;
  model: string;
  input: string[];
}

export async function embed(args: EmbedArgs): Promise<number[][]> {
  let res: Response;
  try {
    res = await fetch(`${args.url}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: args.model, input: args.input }),
    });
  } catch {
    throw new EmbedderError(
      `Ollama non raggiungibile per embeddings. Avvia 'ollama serve' e 'ollama pull ${args.model}'.`,
    );
  }
  if (!res.ok) throw new EmbedderError(`Embeddings HTTP ${res.status} (modello ${args.model} installato?)`);
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings || data.embeddings.length === 0) throw new EmbedderError("Risposta embeddings vuota.");
  return data.embeddings;
}
