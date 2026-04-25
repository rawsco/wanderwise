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

async function generateBedrock(opts: GenerateOptions): Promise<string> {
  const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");

  const region = process.env.BEDROCK_REGION ?? "eu-west-2";
  const modelId = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";

  const system = opts.messages
    .filter(m => m.role === "system")
    .map(m => ({ text: m.content }));

  const messages = opts.messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role as "user" | "assistant",
      content: [{ text: m.content }],
    }));

  const client = new BedrockRuntimeClient({ region });
  const res = await client.send(new ConverseCommand({
    modelId,
    system: system.length > 0 ? system : undefined,
    messages,
    inferenceConfig: {
      maxTokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.7,
    },
  }));

  const content = res.output?.message?.content?.[0]?.text;
  if (typeof content !== "string") throw new Error("Bedrock returned no content");
  return content.trim();
}
