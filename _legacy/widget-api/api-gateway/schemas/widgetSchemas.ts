import { z } from "zod";

export const WidgetBootstrapQuerySchema = z.object({
  publishableKey: z.string().min(1, "publishableKey is required"),
});

export const ThemeConfigSchema = z.object({
  brandColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  buttonText: z.string().optional(),
  mode: z.enum(["light", "dark", "auto"]).optional(),
});

export const WidgetBootstrapResponseSchema = z.object({
  merchantId: z.string(),
  allowedOrigins: z.array(z.string()),
  apiBaseUrl: z.string().url(),
  defaultTheme: ThemeConfigSchema,
});

