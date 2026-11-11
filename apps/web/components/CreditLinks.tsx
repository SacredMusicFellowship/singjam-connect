import { Fragment } from "react";
import Link from "next/link";
import { browsePath, type CardCredit } from "@singjam/core";

// Credits from @singjam/core (song cards, the line under a song's title), each
// linked part opening its page. `linkClassName` lets a card lift its links
// above the card's own whole-card link.
export default function CreditLinks({ credits, separator = ", ", linkClassName = "" }: { credits: CardCredit[]; separator?: string; linkClassName?: string }) {
  return credits.map((c, i) => (
    <Fragment key={`${i}-${c.text}`}>
      {i > 0 && separator}
      {c.lead}
      {c.link ? (
        <Link href={browsePath(c.link.kind, c.link.key, { traditional: c.link.traditional })} className={`hover:text-amber-700 hover:underline ${linkClassName}`}>{c.text}</Link>
      ) : c.text}
      {c.suffix}
    </Fragment>
  ));
}
