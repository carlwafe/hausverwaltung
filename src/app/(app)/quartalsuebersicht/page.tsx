import { BerichtSeite } from "../jahresuebersicht/bericht-seite";

export default async function QuartalsuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; quartal?: string }>;
}) {
  const { jahr, quartal } = await searchParams;
  const heute = new Date();
  const q = Number(quartal);
  return (
    <BerichtSeite
      jahr={Number(jahr) || heute.getFullYear()}
      quartal={q >= 1 && q <= 4 ? q : Math.floor(heute.getMonth() / 3) + 1}
    />
  );
}
