const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Is this route parameter a row id rather than a slug or short code?
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// "1 jammer", "12 jammers": how many people have a song in their repertoire.
export function formatJammers(count: number): string {
  return `${count} ${count === 1 ? "jammer" : "jammers"}`;
}
