import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { authSessions, users } from "../../drizzle/schema.js";
import { getDb } from "../db.js";
import { hashPassword } from "../auth/password.js";

const emailSchema = z.string().trim().email().max(320).transform(value => value.toLowerCase());
function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") throw new Error("Execute este comando em um terminal interativo para informar a senha com segurança.");
  return new Promise((resolve, reject) => {
    stdout.write(question);
    let value = "";
    const onData = (buffer: Buffer) => {
      for (const char of buffer.toString("utf8")) {
        if (char === "\u0003") { cleanup(); reject(new Error("Operação cancelada.")); return; }
        if (char === "\r" || char === "\n") { cleanup(); stdout.write("\n"); resolve(value); return; }
        if (char === "\u007f" || char === "\b") { value = value.slice(0, -1); continue; }
        if (char >= " " && char <= "~") value += char;
      }
    };
    const cleanup = () => { stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); };
    stdin.resume();
    stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL não está configurada ou o banco está indisponível.");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const name = z.string().trim().min(2).max(140).parse(await rl.question("Nome do proprietário: "));
    const email = emailSchema.parse(await rl.question("E-mail do proprietário: "));
    rl.close();
    const password = await askHidden("Senha pessoal (mínimo 16 caracteres; entrada oculta): ");
    if (password.length < 16 || password.length > 128) throw new Error("A senha precisa conter entre 16 e 128 caracteres.");
    const passwordHash = await hashPassword(password);
    const [existing] = await db.select().from(users).where(or(eq(users.emailNormalized, email), eq(users.email, email))).limit(1);
    const [admin] = await db.select({ id: users.id, emailNormalized: users.emailNormalized }).from(users).where(eq(users.role, "admin")).limit(1);
    if (admin && (!existing || existing.id !== admin.id)) throw new Error(`Já existe um proprietário no banco (${admin.emailNormalized}). Entre com ele ou use a ferramenta administrativa de recuperação no servidor.`);
    if (existing) {
      await db.transaction(async tx => {
        await tx.update(users).set({ name, email, emailNormalized: email, passwordHash, passwordResetRequired: false, isActive: true, failedLoginAttempts: 0, lockedUntil: null, role: "admin", loginMethod: "password", lastSignedIn: new Date() }).where(eq(users.id, existing.id));
        await tx.delete(authSessions).where(eq(authSessions.userId, existing.id));
      });
    } else {
      await db.insert(users).values({ openId: `local_${randomBytes(24).toString("hex")}`, name, email, emailNormalized: email, passwordHash, passwordResetRequired: false, isActive: true, loginMethod: "password", role: "admin" });
    }
    console.log(`Proprietário configurado para ${email}. A senha não foi exibida nem armazenada em texto puro.`);
  } finally {
    rl.close();
    await db.$client.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha ao configurar proprietário."); process.exitCode = 1; });
