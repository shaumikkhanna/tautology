import { Suspense } from "react";
import { CrypticCrosswordArchiveApp } from "./CrypticCrosswordArchiveApp";

export const metadata = {
  title: "Cryptic Crossword Archive | Tautology",
};

export default function CrypticCrosswordArchivePage() {
  return (
    <Suspense>
      <CrypticCrosswordArchiveApp />
    </Suspense>
  );
}
