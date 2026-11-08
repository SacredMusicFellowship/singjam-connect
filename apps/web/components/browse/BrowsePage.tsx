import Link from "next/link";
import { notFound } from "next/navigation";
import { browsePath, type BrowseKind, type TagType } from "@singjam/core";
import { BROWSE_LIMIT, loadBrowseEntity, loadBrowseSongs, type LinkedTag } from "@/lib/browse";

export const KIND_LABEL: Record<BrowseKind, string> = {
  genre: "Genre",
  form: "Form",
  occasion: "Occasion",
  community: "Community",
  culture: "Culture",
  language: "Language",
  theme: "Theme",
  person: "Songwriter",
  artist: "Recording artist",
  show: "Show",
};

// The Song Library filter for a tag, so a long list can continue there.
const SEARCH_PARAM: Record<TagType, string> = {
  genre: "genre", form: "form", occasion: "occasion", community: "community", culture: "culture", language: "lang", theme: "theme",
};

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

export default async function BrowsePage({ kind, slug }: { kind: BrowseKind; slug: string }) {
  const entity = await loadBrowseEntity(kind, decodeURIComponent(slug));
  if (!entity) notFound();
  const { songs, members } = await loadBrowseSongs(entity.songIds);
  const total = entity.songIds.length;
  const isTag = kind !== "person" && kind !== "artist" && kind !== "show";
  const sameTypeRelated = entity.related.filter((t) => t.type === kind);
  const otherRelated = entity.related.filter((t) => t.type !== kind);

  return (
    <div className="space-y-6 pb-16">
      <div className="space-y-1">
        <Link href="/browse" className="text-xs font-medium uppercase tracking-wide text-amber-700 hover:underline">
          {KIND_LABEL[kind]}
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 text-balance">{entity.name}</h1>
        {entity.subtitle && <p className="text-base text-slate-500">{entity.subtitle}</p>}
        <p className="text-sm text-slate-500">
          {total} song{total === 1 ? "" : "s"}
          {members > 0 && <> · {members} member{members === 1 ? "" : "s"} know{members === 1 ? "s" : ""} at least one</>}
        </p>
      </div>

      {entity.notes && <p className="max-w-prose text-sm text-slate-600">{entity.notes}</p>}

      {(entity.parents.length > 0 || entity.children.length > 0 || entity.related.length > 0) && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <TagLinks label="Part of" tags={entity.parents} />
          <TagLinks label="Includes" tags={entity.children} />
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
        <section className="space-y-2">
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {songs.map((s) => {
              const show = s.production_credits?.[0];
              const line = [entity.roles.get(s.song_id), s.byline ?? s.display_artist].filter(Boolean).join(" · ");
              return (
                <li key={s.song_id}>
                  <Link href={`/songs/${s.slug ?? s.song_id}`} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-amber-50/40">
                    <span className="min-w-0">
                      <span className="block font-medium text-zinc-900">{s.title}</span>
                      <span className="block truncate text-sm text-zinc-500">
                        {kind !== "show" && show ? <>from <em>{show.name}</em>{show.year ? ` (${show.year})` : ""}{line ? " · " : ""}</> : null}
                        {line}
                      </span>
                    </span>
                    {s.popularity > 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400">{s.popularity} know{s.popularity === 1 ? "s" : ""} it</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {total > BROWSE_LIMIT && (
            <p className="px-1 text-sm text-zinc-500">
              Showing the {BROWSE_LIMIT} best-known.{" "}
              {isTag ? (
                <Link href={`/search?${SEARCH_PARAM[kind as TagType]}=${encodeURIComponent(entity.name)}`} className="font-medium text-amber-600 hover:underline">
                  See all {total} in the Song Library
                </Link>
              ) : null}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export async function browseMetadata(kind: BrowseKind, slug: string) {
  const entity = await loadBrowseEntity(kind, decodeURIComponent(slug));
  if (!entity) return { title: KIND_LABEL[kind] };
  const title = `${entity.name} | ${KIND_LABEL[kind]}`;
  const description = `${entity.songIds.length} songs on SingJam: ${KIND_LABEL[kind].toLowerCase()} ${entity.name}. Find people to sing them with.`;
  return { title, description, openGraph: { title, description } };
}
