import { MieterForm } from "../mieter-form";
import { createMieter } from "../actions";

export default function NeuerMieterPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neuer Mieter</h1>
      <MieterForm action={createMieter} />
    </div>
  );
}
