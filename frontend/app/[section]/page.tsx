import { notFound } from "next/navigation";
import { SectionCard } from "@/components/SectionCard";
import { getSection, getSectionItems, sections } from "@/lib/sections";

type SectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export function generateStaticParams() {
  return sections.map((section) => ({ section: section.slug }));
}

export async function generateMetadata({ params }: SectionPageProps) {
  const { section: sectionSlug } = await params;
  const section = getSection(sectionSlug);

  return {
    title: section ? `${section.label} | Tautology` : "Tautology",
  };
}

export default async function SectionPage({ params }: SectionPageProps) {
  const { section: sectionSlug } = await params;
  const section = getSection(sectionSlug);

  if (!section) {
    notFound();
  }

  const items = getSectionItems(section.slug);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="border-b-2 border-ink pb-5">
        <p className="font-mono text-xs uppercase text-rule">/{section.slug}</p>
        <h1 className="mt-2 font-mono text-4xl font-bold uppercase tracking-normal text-ink">
          {section.label}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-ink">
          {section.description}
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {items.map((item) => (
          <SectionCard key={item.slug} item={item} />
        ))}
      </div>
    </section>
  );
}
