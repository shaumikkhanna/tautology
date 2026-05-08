import { Suspense } from "react";
import { ConnectionsGame } from "../../ConnectionsGame";

type ConnectionsPlayPageProps = {
  params: Promise<{
    gameCode: string;
  }>;
};

export const metadata = {
  title: "Connections | Tautology",
};

export default async function ConnectionsPlayPage({ params }: ConnectionsPlayPageProps) {
  const { gameCode } = await params;

  return (
    <Suspense>
      <ConnectionsGame initialCode={gameCode} />
    </Suspense>
  );
}
