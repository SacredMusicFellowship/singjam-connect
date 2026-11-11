// Under the e2e suite (E2E=1), the server answers every outside service with the shared MSW
// handlers. The runtime check comes first so the edge bundle never includes MSW.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.E2E === "1") {
    await import("./lib/e2eMockServer");
  }
}
