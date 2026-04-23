export function jsonReplacer(_k: string, v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  return v;
}

export function stringifySafe(obj: unknown): string {
  return JSON.stringify(obj, jsonReplacer);
}

import type { Response } from "express";
export function sendJson(res: Response, body: unknown, status = 200): void {
  res.status(status).type("application/json").send(stringifySafe(body));
}
