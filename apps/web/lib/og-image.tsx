const BRAND_TEXT = "SingJam";
const BRAND_FONT_WEIGHT = 800 as const;

let fontDataPromise: Promise<ArrayBuffer> | null = null;

// Satori needs actual font bytes (not just a CSS font-family name), and only
// understands TTF/OTF/WOFF — not WOFF2. Requesting Google Fonts' CSS with a
// `text=` param gets us back a tiny file subset to just the glyphs we use.
async function loadBrandFont(): Promise<ArrayBuffer> {
  if (!fontDataPromise) {
    fontDataPromise = (async () => {
      const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${BRAND_FONT_WEIGHT}&text=${encodeURIComponent(BRAND_TEXT)}`;
      const css = await fetch(cssUrl).then((res) => res.text());
      const match = css.match(/src: url\(([^)]+)\) format\('(opentype|truetype|woff)'\)/);
      if (!match) throw new Error("Could not resolve Inter font file from Google Fonts CSS");
      const res = await fetch(match[1]);
      return res.arrayBuffer();
    })();
  }
  return fontDataPromise;
}

/**
 * Inter at one weight, subset to just the characters in `text`, for cards
 * that set their own copy. Null if Google Fonts can't be reached, so the card
 * still renders in Satori's default font.
 */
export async function loadInterSubset(weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl).then((res) => res.text());
    const match = css.match(/src: url\(([^)]+)\) format\('(opentype|truetype|woff)'\)/);
    if (!match) return null;
    return await fetch(match[1]).then((res) => res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function getBrandOgImageOptions(size: { width: number; height: number }) {
  try {
    const data = await loadBrandFont();
    return {
      ...size,
      fonts: [{ name: "Inter", data, weight: BRAND_FONT_WEIGHT, style: "normal" as const }],
    };
  } catch {
    // Google Fonts hiccup shouldn't take down every share preview — fall
    // back to Satori's default sans-serif rather than erroring.
    return size;
  }
}

export function BrandMark() {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#f59e0b",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -180,
          left: -180,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.14) 0%, transparent 70%)",
          display: "flex",
        }}
      />
      <svg width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
      <span style={{ marginTop: 28, fontSize: 68, fontWeight: BRAND_FONT_WEIGHT, color: "white", letterSpacing: "-1px" }}>
        {BRAND_TEXT}
      </span>
    </div>
  );
}
