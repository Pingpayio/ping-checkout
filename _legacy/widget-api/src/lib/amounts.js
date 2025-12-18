export function toSmallestUnits(decimalStr, decimals) {
  // decimalStr like "49.99" or "1"
  const [intPart, frac = ""] = String(decimalStr).split(".");
  if (!/^\d+$/.test(intPart) || (frac && !/^\d+$/.test(frac))) {
    const e = new Error(`Invalid decimal amount: ${decimalStr}`);
    e.status = 400; throw e;
  }
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const raw = (intPart + fracPadded).replace(/^0+/, "");
  return raw === "" ? "0" : raw;
}
