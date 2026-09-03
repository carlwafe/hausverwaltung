"use client";

export function DeleteButton({
  action,
  confirmText = "Wirklich löschen?",
  label = "Löschen",
}: {
  action: () => Promise<void>;
  confirmText?: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-red-900 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-950"
      >
        {label}
      </button>
    </form>
  );
}
