import { DienstleisterForm } from "../dienstleister-form";
import { createDienstleister } from "../actions";
import { ladeFormularOptionen } from "../lade-optionen";

export default async function NeuerDienstleisterPage() {
  const { kostenarten, gebaeude } = await ladeFormularOptionen();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neuer Dienstleister</h1>
      <DienstleisterForm kostenarten={kostenarten} gebaeude={gebaeude} action={createDienstleister} />
    </div>
  );
}
