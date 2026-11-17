import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { NavBar } from "@/components/nav-bar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-8 lg:px-8">{children}</main>
    </div>
  );
}
