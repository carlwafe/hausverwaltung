import { BerichtSeite } from "./bericht-seite";

export default async function JahresuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; quartal?: string }>;
}) {
  const { jahr, quartal } = await searchParams;
  const q = Number(quartal);
  return (
    <BerichtSeite jahr={Number(jahr) || new Date().getFullYear()} quartal={q >= 1 && q <= 4 ? q : 0} />
  );
}
