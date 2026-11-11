import { http, HttpResponse } from "msw";
import { recordCall } from "../calls";

// The admin song tools ask for JSON (response_format json_object); an empty object means "no
// suggestions", which every caller already handles.
export const openaiHandlers = [
  http.post("https://api.openai.com/v1/chat/completions", async ({ request }) => {
    const body = JSON.parse(await recordCall("openai", request)) as { model?: string };
    return HttpResponse.json({
      id: "chatcmpl-mock",
      object: "chat.completion",
      created: 0,
      model: body.model ?? "mock",
      choices: [{ index: 0, message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }),
];
