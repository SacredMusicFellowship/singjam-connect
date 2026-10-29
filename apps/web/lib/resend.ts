import { Resend } from "resend";
import { sideEffectsBlocked, DEV_SAFETY_ERROR } from "./devSafety";

const client = new Resend(process.env.RESEND_API_KEY);

export const FROM_ADDRESS = "SingJam <hello@singjam.org>";

// Event logistics — ticket confirmations, host messages to attendees, event
// reminders — come from the events inbox itself, so the address a buyer sees
// is the one they'll reply to and hear back from.
export const EVENTS_FROM_ADDRESS = "SingJam <events@singjam.org>";

// Replies go to a monitored inbox, not to the sending address. hello@ is a
// send-only identity, and someone answering a ticket confirmation or a jam
// invite is almost always asking the events team something.
export const REPLY_TO = "events@singjam.org";

// Applied to the client rather than at each call site: fourteen files send mail
// and the next one written would have forgotten. Wrapping in place (instead of
// exporting a plain object) keeps this a real Resend, which several helpers take
// as a parameter type. Anything a caller passes still wins, so a one-off can
// override the reply address.
//
// The dev-safety guard lives here for the same reason. A blocked send comes back
// as an error, so every caller that records delivery leaves the row unsent.
const blockedResult = () => ({
  data: null,
  error: { name: DEV_SAFETY_ERROR, message: "Email sending is disabled in local development" },
});

const sendEmail = client.emails.send.bind(client.emails);
client.emails.send = (async (payload: any, options?: any) => {
  if (sideEffectsBlocked(`email to ${payload?.to}`)) return blockedResult();
  return sendEmail({ replyTo: REPLY_TO, ...payload }, options);
}) as typeof client.emails.send;

const sendBatch = client.batch.send.bind(client.batch);
client.batch.send = (async (payloads: any, options?: any) => {
  if (sideEffectsBlocked(`batch of ${Array.isArray(payloads) ? payloads.length : "?"} emails`)) {
    return blockedResult();
  }
  return sendBatch(
    Array.isArray(payloads) ? payloads.map((p: any) => ({ replyTo: REPLY_TO, ...p })) : payloads,
    options,
  );
}) as typeof client.batch.send;

export const resend = client;
