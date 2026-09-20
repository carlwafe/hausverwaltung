import { BuchungsartForm } from "../buchungsart-form";
import { createBuchungsart } from "../actions";

export default function NeueBuchungsartPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neue Buchungsart</h1>
      <BuchungsartForm action={createBuchungsart} />
    </div>
  );
}
