import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// The two research models every enrichment step asks, each answering in JSON:
// GPT 5.5 and Claude Opus 5.5, both at low effort. Each returns null when its
// key is missing or the call fails, so one model being down never fails a run.

export type ModelUsage = { model: string; input: number; output: number; reasoning?: number; searches?: number };
export type ModelPrompt = { system: string; user: string };

// `key` picks the answer out of the JSON object (null: the whole object).
export async function askGptJson<T>(p: ModelPrompt, key: string | null, label: string, usage: ModelUsage[]): Promise<T | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await new OpenAI().chat.completions.create({
      model: "gpt-5.5",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: p.system },
        { role: "user", content: p.user },
      ],
    });
    usage.push({
      model: res.model,
      input: res.usage?.prompt_tokens ?? 0,
      output: res.usage?.completion_tokens ?? 0,
      reasoning: res.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    });
    const json = JSON.parse(res.choices[0].message.content ?? "{}");
    return ((key ? json[key] : json) ?? null) as T | null;
  } catch (e) {
    console.error(`[song-enrichment] gpt ${label} failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// Claude answers to `schema` (structured output); a refusal counts as no answer.
export async function askClaudeJson<T>(
  p: ModelPrompt,
  schema: object,
  key: string | null,
  maxTokens: number,
  label: string,
  usage: ModelUsage[],
): Promise<T | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res: any = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system: p.system,
      messages: [{ role: "user", content: p.user }],
    } as any);
    usage.push({ model: res.model, input: res.usage.input_tokens, output: res.usage.output_tokens });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b: any) => b.type === "text");
    if (!text) return null;
    const json = JSON.parse(text.text);
    return ((key ? json[key] : json) ?? null) as T | null;
  } catch (e) {
    console.error(`[song-enrichment] claude ${label} failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}
