import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reply = vi.hoisted(() => ({ gpt: "{}" as string | Error, claude: { stop_reason: "end_turn", text: "{}" } as { stop_reason: string; text: string } | Error, schema: null as unknown }));

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => {
          if (reply.gpt instanceof Error) throw reply.gpt;
          return { model: "gpt-5.5", usage: { prompt_tokens: 10, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 2 } }, choices: [{ message: { content: reply.gpt } }] };
        },
      },
    };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: async (req: any) => {
          reply.schema = req.output_config.format.schema;
          if (reply.claude instanceof Error) throw reply.claude;
          return { model: "claude-opus-5-5", usage: { input_tokens: 7, output_tokens: 3 }, stop_reason: reply.claude.stop_reason, content: [{ type: "text", text: reply.claude.text }] };
        },
      },
    };
  },
}));

import { askClaudeJson, askGptJson, type ModelUsage } from "./enrichmentModels";

const p = { system: "s", user: "u" };

describe("askGptJson / askClaudeJson", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "k";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("picks the answer out by key, or returns the whole object, and records usage", async () => {
    const usage: ModelUsage[] = [];
    reply.gpt = JSON.stringify({ recordings: [{ artist: "A" }] });
    reply.claude = { stop_reason: "end_turn", text: JSON.stringify({ notes: "n", productions: [] }) };
    expect(await askGptJson(p, "recordings", "t", usage)).toEqual([{ artist: "A" }]);
    expect(await askClaudeJson(p, { type: "object" }, null, 100, "t", usage)).toEqual({ notes: "n", productions: [] });
    expect(reply.schema).toEqual({ type: "object" });
    expect(usage).toEqual([
      { model: "gpt-5.5", input: 10, output: 5, reasoning: 2 },
      { model: "claude-opus-5-5", input: 7, output: 3 },
    ]);
  });

  it("answers null for a missing key, a refusal, an error or no API key", async () => {
    reply.gpt = JSON.stringify({ other: 1 });
    expect(await askGptJson(p, "recordings", "t", [])).toBeNull();
    reply.claude = { stop_reason: "refusal", text: "{}" };
    expect(await askClaudeJson(p, {}, "recordings", 100, "t", [])).toBeNull();
    reply.gpt = new Error("down");
    expect(await askGptJson(p, null, "t", [])).toBeNull();
    delete process.env.ANTHROPIC_API_KEY;
    expect(await askClaudeJson(p, {}, null, 100, "t", [])).toBeNull();
  });
});
