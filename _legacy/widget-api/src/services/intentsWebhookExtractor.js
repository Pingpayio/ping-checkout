// src/services/intentsWebhookExtractor.js
function pick(obj, paths) {
  for (const p of paths) {
    const val = p.split(".").reduce((o,k)=> (o && o[k]!==undefined ? o[k] : undefined), obj);
    if (val !== undefined && val !== null && String(val).length) return val;
  }
  return undefined;
}

export function extractWebhookEvent(raw) {
  let body;
  try { body = JSON.parse(raw); } catch { return { ok:false, reason:"INVALID_JSON" }; }

  // Look in multiple places for each field (flat and nested)
  const orderId = pick(body, [
    "orderId","order_id","data.orderId","data.order_id","event.orderId","event.order_id","execution.orderId"
  ]) || null;

  const quoteId = pick(body, [
    "quoteId","quote_id","data.quoteId","data.quote_id","event.quoteId","event.quote_id","execution.quoteId"
  ]) || null;

  const txId = pick(body, [
    "txId","transactionHash","data.txId","data.transactionHash","event.txId","event.transactionHash","execution.txId"
  ]) || null;

  const upstreamRaw = pick(body, [
    "status","state","data.status","data.state","event.status","event.state","execution.status","payload.status"
  ]) || "";
  const upstream = String(upstreamRaw).toLowerCase().trim();

  // Basic requirement: one identifier must be present
  if (!orderId && !quoteId) return { ok:false, reason:"NO_ID" };

  // Keep original upstream; mapping is done outside via mapUpstreamStatus()
  return { ok:true, orderId, quoteId, upstream, txId };
}
