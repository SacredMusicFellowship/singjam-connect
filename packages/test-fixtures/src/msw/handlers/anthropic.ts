import { http, HttpResponse } from "msw";
import { recordCall } from "../calls";

// Song enrichment asks Claude for JSON; an empty object means "nothing found", which every caller
// already handles.
export const anthropicHandlers = [
  http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
    const body = JSON.parse(await recordCall("anthropic", request)) as { model?: string };
    return HttpResponse.json({
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: body.model ?? "mock",
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  }),
];
