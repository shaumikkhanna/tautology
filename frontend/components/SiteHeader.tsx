import Link from "next/link";
import { sections } from "@/lib/sections";

export function SiteHeader() {
  return (
    <header className="border-b-2 border-ink bg-soot text-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="font-mono text-sm uppercase tracking-normal text-paper hover:text-brass"
        >
          P or not P
        </Link>
        <nav aria-label="Sections">
          <ul className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
            {sections.map((section) => (
              <li key={section.slug}>
                <Link
                  href={`/${section.slug}`}
                  className="font-mono text-sm uppercase tracking-normal text-paper underline-offset-4 hover:text-brass hover:underline"
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
