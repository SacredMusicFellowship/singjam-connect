import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { browsePath, KIND_LABEL, traditionalCultureChips, type BrowseKind } from "@singjam/core";
import { loadBrowseEntity, loadBrowseRelated, loadBrowseSongs, type LinkedTag } from "@/lib/browse";
import BrowseSongList from "@/components/browse/BrowseSongList";
import CreditLinks from "@/components/CreditLinks";

function TagLinks({ label, tags }: { label: string; tags: LinkedTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {tags.map((t) => (
        <Link key={`${t.type}:${t.slug}`} href={browsePath(t.type, t.slug)} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700 hover:border-amber-300 hover:text-amber-700">
          {t.name}
        </Link>
      ))}
    </div>
  );
}

export default async function BrowsePage({ kind, slug, traditional = false }: { kind: BrowseKind; slug: string; traditional?: boolean }) {
  const decoded = decodeURIComponent(slug);
  const entity = await loadBrowseEntity(kind, decoded, traditional);
  if (!entity) notFound();
  if (entity.slug && entity.slug !== decoded) redirect(browsePath(kind, entity.slug, { traditional }));
  const [{ songs, members }, related] = await Promise.all([
    loadBrowseSongs(entity.songIds),
    loadBrowseRelated(entity.songIds, { kind, slug: decoded }),
  ]);
  const total = entity.songIds.length;
  const sameTypeRelated = entity.related.filter((t) => t.type === kind);
  const otherRelated = entity.related.filter((t) => t.type !== kind);
  const byCulture = kind === "person" && entity.slug === "traditional" ? traditionalCultureChips(songs) : [];

  return (
    <div className="space-y-6 pb-16">
      <div className="space-y-1">
        <Link href="/browse" className="text-xs font-medium uppercase tracking-wide text-amber-700 hover:underline">
          {entity.label ?? KIND_LABEL[kind]}
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 text-balance">{entity.name}</h1>
        {entity.subtitle && <p className="text-base text-slate-500">{entity.subtitle}</p>}
        {entity.facts && entity.facts.length > 0 && (
          <div className="flex flex-col gap-1 pt-1">
            {entity.facts.map((line) => (
              <p key={line.label} className="text-sm text-slate-600">
                <span className="font-medium">{line.label}:</span>{" "}
                {line.groups.map((g, i) => <Fragment key={i}>{i > 0 && " · "}<CreditLinks credits={g} /></Fragment>)}
              </p>
            ))}
          </div>
        )}
        <p className="text-sm text-slate-500">
          {entity.traditionalOnly ? (
            <>
              {total} traditional song{total === 1 ? "" : "s"} · <Link href={browsePath(kind, entity.slug ?? decoded)} className="font-medium text-amber-700 hover:underline">Show all {entity.allSongCount}</Link>
              {" · "}<Link href={browsePath("person", "traditional")} className="font-medium text-amber-700 hover:underline">All traditional songs</Link>
            </>
          ) : <>{total} song{total === 1 ? "" : "s"}</>}
          {members > 0 && <> · {members} member{members === 1 ? "" : "s"} know{members === 1 ? "s" : ""} at least one</>}
        </p>
      </div>

      {entity.notes && <p className="max-w-prose text-sm text-slate-600">{entity.notes}</p>}

      {entity.readUrl && (
        <a href={entity.readUrl.href} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-amber-700 hover:underline">
          Read {entity.name} on {entity.readUrl.site} ↗
        </a>
      )}

      {kind === "person" && entity.slug === "traditional" && byCulture.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">By culture</h2>
          <div className="flex flex-wrap gap-1.5">
            {byCulture.map((c) => (
              <Link key={c.href} href={c.href} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-amber-300 hover:text-amber-700">
                {c.label} <span className="tabular-nums text-slate-400">{c.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(entity.parents.length > 0 || entity.children.length > 0 || entity.related.length > 0) && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <TagLinks label="Part of" tags={entity.parents} />
          <TagLinks label={kind === "scripture" ? "Chapters" : "Includes"} tags={entity.children} />
          <TagLinks label="Related" tags={sameTypeRelated} />
          <TagLinks label="See also" tags={otherRelated} />
        </section>
      )}

      {songs.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-500">
          No songs here yet.{" "}
          <Link href="/search" className="font-medium text-amber-600 hover:underline">Browse the Song Library</Link>
        </div>
      ) : (
        <BrowseSongList songs={songs} roles={Object.fromEntries(entity.roles)} />
      )}

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Explore from here</h2>
          {related.map((g) => (
            <div key={g.key} className="flex flex-wrap items-baseline gap-1.5">
              <span className="mr-1 w-full text-xs text-slate-500 sm:w-32">{g.title}</span>
              {g.chips.map((c) => (
                <Link key={c.href} href={c.href} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700 hover:border-amber-300 hover:text-amber-700">
                  {c.label} <span className="tabular-nums text-slate-400">{c.count}</span>
                </Link>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export async function browseMetadata(kind: BrowseKind, slug: string, traditional = false) {
  const entity = await loadBrowseEntity(kind, decodeURIComponent(slug), traditional);
  if (!entity) return { title: KIND_LABEL[kind] };
  const title = `${traditional ? "Traditional · " : ""}${entity.name} | ${entity.label ?? KIND_LABEL[kind]}`;
  const description = `${entity.songIds.length} songs on SingJam: ${KIND_LABEL[kind].toLowerCase()} ${entity.name}. Find people to sing them with.`;
  return { title, description, openGraph: { title, description } };
}
