export function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function runFormAction(
  action: (formData: FormData) => Promise<void>,
  formData: FormData,
): Promise<string | null> {
  try {
    await action(formData);
    return null;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return err instanceof Error ? err.message : "Unbekannter Fehler";
  }
}
