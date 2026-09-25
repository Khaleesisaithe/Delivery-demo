import type { User } from "../../drizzle/schema";

type LocalEnvironment = NodeJS.ProcessEnv;

export function isLocalDevAuthEnabled(env: LocalEnvironment = process.env): boolean {
  return env.NODE_ENV === "development" && env.LOCAL_DEV_AUTH === "true";
}

export function createLocalDevUser(env: LocalEnvironment = process.env): User {
  const role = env.LOCAL_DEV_ROLE === "staff" ? "staff" : env.LOCAL_DEV_ROLE === "user" ? "user" : "admin";
  const now = new Date();
  return {
    id: 0,
    openId: "local-vscode-user",
    name: env.LOCAL_DEV_NAME || "Desenvolvedor local",
    email: env.LOCAL_DEV_EMAIL || "dev@localhost",
    loginMethod: "local-development-only",
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}
