import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { NavBar } from "@/components/nav-bar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
