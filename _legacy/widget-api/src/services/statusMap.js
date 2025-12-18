// src/services/statusMap.js
export function mapUpstreamStatus(upstreamRaw) {
  const s = String(upstreamRaw || "").toLowerCase();
  if (["filled","executed","confirmed","success"].includes(s)) return "PAID";
  if (["failed","reverted","canceled","cancelled","error"].includes(s)) return "FAILED";
  if (["expired","timeout"].includes(s)) return "EXPIRED";
  return "PENDING";
}
