import { Red7Game } from "../../Red7Game";

export const metadata = {
  title: "Red7 | toomuchmaths",
};

export default async function Red7RoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  return <Red7Game roomCode={roomCode} />;
}

