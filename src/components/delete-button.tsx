"use client";

export function DeleteButton({
  action,
  confirmText = "Wirklich löschen?",
  label = "Löschen",
  size = "md",
}: {
  action: () => Promise<void>;
  confirmText?: string;
  label?: string;
  size?: "sm" | "md";
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
        className={
          size === "sm"
            ? "rounded-md border border-red-900 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-950"
            : "rounded-md border border-red-900 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-950"
        }
      >
        {label}
      </button>
    </form>
  );
}
