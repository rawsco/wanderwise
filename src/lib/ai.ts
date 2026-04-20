export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export async function generateText(opts: GenerateOptions): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? "lmstudio";
  if (provider === "bedrock") return generateBedrock(opts);
  return generateLMStudio(opts);
}

async function generateLMStudio(opts: GenerateOptions): Promise<string> {
  const base = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
  const model = process.env.LMSTUDIO_MODEL ?? "local-model";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 800,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LM Studio request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LM Studio returned no content");
  return content.trim();
}

async function generateBedrock(_opts: GenerateOptions): Promise<string> {
  throw new Error("Bedrock provider not yet wired up — set AI_PROVIDER=lmstudio for local dev");
}
