import { BerichtSeite } from "./bericht-seite";

export default async function JahresuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr } = await searchParams;
  return <BerichtSeite jahr={Number(jahr) || new Date().getFullYear()} quartal={0} />;
}
