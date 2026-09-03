import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "VERWALTER";
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: "ADMIN" | "VERWALTER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "VERWALTER";
  }
}
