import Link from "next/link";
import { parseBlogMarkdown, type BlogInline } from "@singjam/core";

function Inline({ nodes }: { nodes: BlogInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return n.text;
          case "strong":
            return <strong key={i} className="font-semibold text-slate-900"><Inline nodes={n.children} /></strong>;
          case "em":
            return <em key={i}><Inline nodes={n.children} /></em>;
          case "code":
            return <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{n.text}</code>;
          case "link":
            return n.href.startsWith("/") ? (
              <Link key={i} href={n.href} className="text-amber-700 underline underline-offset-2 hover:text-amber-800">
                <Inline nodes={n.children} />
              </Link>
            ) : (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline underline-offset-2 hover:text-amber-800">
                <Inline nodes={n.children} />
              </a>
            );
        }
      })}
    </>
  );
}

export default function BlogBody({ markdown }: { markdown: string }) {
  const blocks = parseBlogMarkdown(markdown);
  return (
    <div className="space-y-5 text-[17px] leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const cls = b.level === 3 ? "pt-2 text-lg font-semibold text-slate-900" : "pt-4 text-xl font-semibold text-slate-900 sm:text-2xl";
            return b.level === 3
              ? <h3 key={i} className={cls}><Inline nodes={b.children} /></h3>
              : <h2 key={i} className={cls}><Inline nodes={b.children} /></h2>;
          }
          case "paragraph":
            return <p key={i}><Inline nodes={b.children} /></p>;
          case "list": {
            const items = b.items.map((item, j) => <li key={j} className="pl-1"><Inline nodes={item} /></li>);
            return b.ordered
              ? <ol key={i} className="list-decimal space-y-1.5 pl-6">{items}</ol>
              : <ul key={i} className="list-disc space-y-1.5 pl-6 marker:text-amber-500">{items}</ul>;
          }
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-amber-400 pl-4 italic text-slate-600">
                <Inline nodes={b.children} />
              </blockquote>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-sm leading-normal text-slate-100">
                <code>{b.text}</code>
              </pre>
            );
          case "image":
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={b.src} alt={b.alt} loading="lazy" className="w-full rounded-lg border border-slate-200" />
            );
          case "rule":
            return <hr key={i} className="border-slate-200" />;
        }
      })}
    </div>
  );
}
