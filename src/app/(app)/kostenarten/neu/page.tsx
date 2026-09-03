import { KostenartForm } from "../kostenart-form";
import { createKostenart } from "../actions";

export default function NeueKostenartPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neue Kostenart</h1>
      <KostenartForm action={createKostenart} />
    </div>
  );
}
