import { NextResponse } from "next/server";

// What the server sent to mocked outside services (emails, Stripe calls), for e2e assertions.
// Only exists while lib/e2eMockServer.ts is loaded, which happens under E2E=1 alone; everywhere
// else this is a 404.
export async function GET(req: Request) {
  const read = (globalThis as { __e2eMockCalls?: (service?: string) => unknown[] }).__e2eMockCalls;
  if (!read) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const service = new URL(req.url).searchParams.get("service") ?? undefined;
  return NextResponse.json(read(service));
}
