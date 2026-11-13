// A small Markdown subset for Inside SingJam posts, parsed once here so the
// web and native renderers draw the same structure. Supported: # / ## / ###
// headings, paragraphs, - and 1. lists, > quotes, ``` code blocks, ---,
// ![alt](url) images on their own line, and inline **bold**, *italic*,
// `code` and [links](url). Raw HTML is not interpreted, only shown as text.

export type BlogInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: BlogInline[] }
  | { type: "em"; children: BlogInline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: BlogInline[] };

export type BlogBlock =
  | { type: "heading"; level: 1 | 2 | 3; children: BlogInline[] }
  | { type: "paragraph"; children: BlogInline[] }
  | { type: "list"; ordered: boolean; items: BlogInline[][] }
  | { type: "quote"; children: BlogInline[] }
  | { type: "code"; text: string }
  | { type: "image"; src: string; alt: string }
  | { type: "rule" };

/** Only web links, mail links and site-relative paths survive; anything else (javascript:, data:) becomes plain text. */
export function safeBlogHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  return null;
}

export function parseBlogInline(src: string): BlogInline[] {
  const out: BlogInline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };

  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);

    if (rest[0] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (rest.startsWith("**")) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseBlogInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if ((rest[0] === "*" || rest[0] === "_") && rest[1] && rest[1] !== " ") {
      const marker = rest[0];
      const end = src.indexOf(marker, i + 1);
      const wordStart = i === 0 || /\W/.test(src[i - 1]);
      if (end > i + 1 && src[end - 1] !== " " && (marker === "*" || wordStart)) {
        flush();
        out.push({ type: "em", children: parseBlogInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (rest[0] === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        const href = safeBlogHref(m[2]);
        flush();
        if (href) out.push({ type: "link", href, children: parseBlogInline(m[1]) });
        else out.push(...parseBlogInline(m[1]));
        i += m[0].length;
        continue;
      }
    }

    text += src[i];
    i++;
  }
  flush();
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const IMAGE = /^!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

export function parseBlogMarkdown(md: string): BlogBlock[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlogBlock[] = [];
  let i = 0;

  const startsBlock = (line: string) =>
    HEADING.test(line) || UNORDERED.test(line) || ORDERED.test(line) ||
    line.startsWith(">") || line.startsWith("```") || RULE.test(line.trim()) || IMAGE.test(line.trim());

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseBlogInline(heading[2].trim()),
      });
      i++;
      continue;
    }

    if (RULE.test(trimmed)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    const image = IMAGE.exec(trimmed);
    if (image) {
      blocks.push({ type: "image", alt: image[1], src: image[2] });
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        body.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", children: parseBlogInline(body.join(" ").trim()) });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || UNORDERED.test(line)) {
      const pattern = ordered ? ORDERED : UNORDERED;
      const items: BlogInline[][] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        let item = pattern.exec(lines[i])![1];
        i++;
        while (i < lines.length && lines[i].trim() && /^\s+/.test(lines[i]) && !UNORDERED.test(lines[i]) && !ORDERED.test(lines[i])) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(parseBlogInline(item.trim()));
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i]))) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", children: parseBlogInline(para.join(" ")) });
  }

  return blocks;
}

/** Plain text of inline content, for previews and accessibility labels. */
export function blogInlineText(nodes: BlogInline[]): string {
  return nodes
    .map((n) => (n.type === "text" || n.type === "code" ? n.text : blogInlineText(n.children)))
    .join("");
}
