import { Suspense } from "react";
import { ConnectionsGame } from "./ConnectionsGame";

export const metadata = {
  title: "Connections | toomuchmaths",
};

export default function ConnectionsPage() {
  return (
    <Suspense>
      <ConnectionsGame />
    </Suspense>
  );
}
