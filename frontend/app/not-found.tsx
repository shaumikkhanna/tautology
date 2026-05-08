import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12 text-center">
      <h1 className="font-mono text-4xl font-bold uppercase tracking-normal text-ink">
        Not found
      </h1>
      <Link
        href="/"
        className="mx-auto mt-6 inline-block border-2 border-ink bg-soot px-4 py-3 font-mono text-sm uppercase text-paper shadow-hard hover:bg-brass hover:text-ink"
      >
        Home
      </Link>
    </section>
  );
}
