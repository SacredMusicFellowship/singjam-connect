import { http, HttpResponse } from "msw";
import { recordCall } from "../calls";

let emailCounter = 0;
const emailId = () => `email_mock_${String(++emailCounter).padStart(6, "0")}`;

// Resend (emails), ActiveCampaign (mailing list sync) and Expo (push notifications): the three ways
// the app reaches real people. In tests none of them leave the machine.
export const messagingHandlers = [
  http.post("https://api.resend.com/emails", async ({ request }) => {
    await recordCall("resend", request);
    return HttpResponse.json({ id: emailId() });
  }),
  http.post("https://api.resend.com/emails/batch", async ({ request }) => {
    const body = JSON.parse(await recordCall("resend", request)) as unknown[];
    return HttpResponse.json({ data: body.map(() => ({ id: emailId() })) });
  }),

  // ActiveCampaign's host comes from AC_API_URL (one per account), so match any account host.
  http.all(/^https:\/\/[a-z0-9-]+\.(api-us\d+\.com|activehosted\.com)\/api\/3\/.*/, async ({ request }) => {
    await recordCall("activecampaign", request);
    const path = new URL(request.url).pathname.replace(/^\/api\/3\//, "");
    if (path.startsWith("contact/sync")) return HttpResponse.json({ contact: { id: "1001", email: "member@singjam.test" } });
    if (path.startsWith("contactLists")) return HttpResponse.json({ contactList: { id: "2001", status: "1" } });
    if (path.startsWith("contactTags")) return HttpResponse.json({ contactTag: { id: "3001" } });
    return HttpResponse.json({});
  }),

  http.post("https://exp.host/--/api/v2/push/send", async ({ request }) => {
    const body = JSON.parse(await recordCall("expo-push", request)) as unknown;
    const messages = Array.isArray(body) ? body : [body];
    return HttpResponse.json({ data: messages.map((_, i) => ({ status: "ok", id: `push-mock-${i + 1}` })) });
  }),
];
