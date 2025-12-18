// src/lib/onramp/zkp2p.js
export function buildZkp2pUrl({
  referrer = "PingPay",
  referrerLogo = "https://pingpay.io/logo.svg",
  callbackUrl,
  inputCurrency = "USD",
  inputAmount,
  toToken,
  recipientAddress,
  amountUsdc
}) {
  const url = new URL("https://zkp2p.xyz/swap");
  url.searchParams.set("referrer", referrer);
  url.searchParams.set("referrerLogo", referrerLogo);
  url.searchParams.set("callbackUrl", callbackUrl);
  url.searchParams.set("inputCurrency", inputCurrency);
  if (inputAmount) url.searchParams.set("inputAmount", inputAmount.toString());
  if (amountUsdc) url.searchParams.set("amountUsdc", amountUsdc);
  if (toToken) url.searchParams.set("toToken", toToken); // e.g. "8453:0x000000..."
  if (recipientAddress) url.searchParams.set("recipientAddress", recipientAddress);
  return url.toString();
}
