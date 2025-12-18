// src/services/allowlist.js
import fs from "fs/promises";
let cache = null, mtimeMs = 0;

export async function loadAllowlist(path = process.env.ALLOWLIST_PATH || "./allowlist.csv") {
  const stat = await fs.stat(path).catch(() => null);
  if (!stat) return [];
  if (cache && stat.mtimeMs === mtimeMs) return cache;

  const raw = await fs.readFile(path, "utf8");
  cache = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  mtimeMs = stat.mtimeMs;
  return cache;
}
