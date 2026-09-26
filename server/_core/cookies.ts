import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request): boolean {
  if (req.secure || req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const values = Array.isArray(forwardedProto) ? forwardedProto : (forwardedProto ?? "").split(",");
  return values.some(value => value.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(req: Request): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  return { httpOnly: true, path: "/", sameSite: "lax", secure: isSecureRequest(req) };
}
