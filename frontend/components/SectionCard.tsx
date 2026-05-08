import Link from "next/link";
import type { SectionItem } from "@/lib/sections";

type SectionCardProps = {
  item: SectionItem;
};

export function SectionCard({ item }: SectionCardProps) {
  return (
    <Link
      href={item.href}
      className="group block border-2 border-ink bg-paperLight p-4 text-left shadow-hard transition duration-150 hover:-translate-y-0.5 hover:bg-brass"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-mono text-lg font-bold uppercase tracking-normal text-ink">
          {item.title}
        </h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink">{item.description}</p>
      <p className="mt-5 font-mono text-xs uppercase text-rule group-hover:text-ink">
        open -&gt;
      </p>
    </Link>
  );
}
