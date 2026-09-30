import { redirect } from "next/navigation";

// Die Quartalsübersicht ist in die Jahresübersicht integriert (Auswahl "Zeitraum").
export default async function QuartalsuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; quartal?: string }>;
}) {
  const { jahr, quartal } = await searchParams;
  const params = new URLSearchParams();
  if (jahr) params.set("jahr", jahr);
  if (quartal) params.set("quartal", quartal);
  redirect(`/jahresuebersicht?${params}`);
}
