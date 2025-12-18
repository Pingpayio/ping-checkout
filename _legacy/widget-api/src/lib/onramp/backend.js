// src/lib/onramp/backend.js
export async function backendPost(path, body) {
  const res = await fetch(`${process.env.BACKEND_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${process.env.BACKEND_INTERNAL_TOKEN}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`backend ${path} ${res.status}`);
  return res.json();
}

export async function backendGet(path) {
  const res = await fetch(`${process.env.BACKEND_BASE_URL}${path}`, {
    headers: { "authorization": `Bearer ${process.env.BACKEND_INTERNAL_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`backend ${path} ${res.status}`);
  return res.json();
}
