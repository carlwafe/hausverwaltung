import { DienstleisterForm } from "../dienstleister-form";
import { createDienstleister } from "../actions";
import { ladeKostenartenOptionen } from "../lade-optionen";

export default async function NeuerDienstleisterPage() {
  const kostenarten = await ladeKostenartenOptionen();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neuer Dienstleister</h1>
      <DienstleisterForm kostenarten={kostenarten} action={createDienstleister} />
    </div>
  );
}
