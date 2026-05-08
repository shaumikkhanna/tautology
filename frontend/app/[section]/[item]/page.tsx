import { notFound } from "next/navigation";
import {
  getSection,
  getSectionItem,
  getSectionItems,
  sections,
} from "@/lib/sections";

type ItemPageProps = {
  params: Promise<{
    section: string;
    item: string;
  }>;
};

export function generateStaticParams() {
  return sections.flatMap((section) =>
    getSectionItems(section.slug)
      .filter((item) => item.href === `/${section.slug}/${item.slug}`)
      .map((item) => ({ section: section.slug, item: item.slug })),
  );
}

export async function generateMetadata({ params }: ItemPageProps) {
  const { section, item } = await params;
  const sectionItem = getSectionItem(section, item);

  return {
    title: sectionItem ? `${sectionItem.title} | Tautology` : "Tautology",
  };
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { section: sectionSlug, item: itemSlug } = await params;
  const section = getSection(sectionSlug);
  const item = getSectionItem(sectionSlug, itemSlug);

  if (!section || !item) {
    notFound();
  }

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-12">
      <div
        className={[
          "grid gap-6 border-2 border-ink bg-paperLight p-5 shadow-hard sm:p-6",
          item.image ? "sm:grid-cols-[minmax(0,1fr)_220px]" : "",
        ].join(" ")}
      >
        <div>
          <p className="font-mono text-xs uppercase text-rule">
            /{section.slug}/{item.slug}
          </p>
          <h1 className="mt-3 font-mono text-4xl font-bold uppercase tracking-normal text-ink">
            {item.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-ink">
            {item.body ?? item.description}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {item.playHref ? (
              <a
                href={item.playHref}
                className="border-2 border-ink bg-soot px-5 py-3 font-mono text-sm uppercase text-paper shadow-hard hover:bg-brass hover:text-ink"
              >
                Play
              </a>
            ) : null}
          </div>
        </div>

        {item.image ? (
          <img
            src={item.image}
            alt=""
            className="h-44 w-full border-2 border-ink object-cover sm:h-full"
          />
        ) : null}
      </div>
    </article>
  );
}
