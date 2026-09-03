import { GebaeudeForm } from "../gebaeude-form";
import { createGebaeude } from "../actions";

export default function NeuesGebaeudePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Neues Gebäude</h1>
      <GebaeudeForm action={createGebaeude} />
    </div>
  );
}
