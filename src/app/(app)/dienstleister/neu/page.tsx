import { DienstleisterForm } from "../dienstleister-form";
import { createDienstleister } from "../actions";
import { ladeKostenartenOptionen } from "../lade-optionen";

export default async function NeuerDienstleisterPage({
  searchParams,
}: {
  searchParams: Promise<{ typ?: string }>;
}) {
  const { typ } = await searchParams;
  const standardTyp = typ === "HANDWERKER" ? "HANDWERKER" : "SONSTIGE";
  const kostenarten = await ladeKostenartenOptionen();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">
        {standardTyp === "HANDWERKER" ? "Neuer Handwerker" : "Neuer Dienstleister"}
      </h1>
      <DienstleisterForm kostenarten={kostenarten} standardTyp={standardTyp} action={createDienstleister} />
    </div>
  );
}
