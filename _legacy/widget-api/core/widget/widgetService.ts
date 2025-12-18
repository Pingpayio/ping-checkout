import { apiKeyStore } from "../../api-gateway/utils/db.js";

export class InvalidPublishableKeyError extends Error {
  constructor(message: string = "Invalid publishable key") {
    super(message);
    this.name = "InvalidPublishableKeyError";
  }
}

export type WidgetBootstrapConfig = {
  merchantId: string;
  allowedOrigins: string[];
  apiBaseUrl: string;
  defaultTheme: {
    brandColor?: string;
    logoUrl?: string;
    buttonText?: string;
    mode?: "light" | "dark" | "auto";
  };
};

export async function getWidgetBootstrapConfig(
  publishableKey: string,
): Promise<WidgetBootstrapConfig> {
  const record = await apiKeyStore.findActiveByKey(publishableKey);

  if (!record || record.type !== "publishable" || record.revokedAt) {
    throw new InvalidPublishableKeyError("Publishable key is invalid or revoked");
  }

  // Get allowed origins from environment or use defaults
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : ["*"]; // Default to allow all origins

  // Get API base URL from environment or use default
  const apiBaseUrl =
    process.env.API_BASE_URL || "https://api.pingpay.io/api/v1";

  // Default theme - can be customized per merchant later
  const defaultTheme = {
    brandColor: process.env.DEFAULT_BRAND_COLOR || "#0EA5E9",
    logoUrl: process.env.DEFAULT_LOGO_URL || "https://cdn.pingpay.io/logo.png",
    buttonText: process.env.DEFAULT_BUTTON_TEXT || "Pay",
    mode: (process.env.DEFAULT_THEME_MODE || "light") as
      | "light"
      | "dark"
      | "auto",
  };

  return {
    merchantId: record.merchantId,
    allowedOrigins,
    apiBaseUrl,
    defaultTheme,
  };
}

