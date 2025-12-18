import express from "express";
import { publicRateLimit } from "../middleware/rateLimit.js";
import { sendError } from "../utils/errorResponse.js";
import {
  WidgetBootstrapQuerySchema,
  WidgetBootstrapResponseSchema,
} from "../schemas/widgetSchemas.js";
import {
  getWidgetBootstrapConfig,
  InvalidPublishableKeyError,
} from "../../core/widget/widgetService.js";

const router = express.Router();

// GET /widget/bootstrap
router.get(
  "/widget/bootstrap",
  publicRateLimit(),
  async (req, res) => {
    try {
      // Validate query parameters
      const query = WidgetBootstrapQuerySchema.parse(req.query);

      // Call Core service
      const config = await getWidgetBootstrapConfig(query.publishableKey);

      // Validate response
      WidgetBootstrapResponseSchema.parse(config);

      return res.status(200).json(config);
    } catch (err: any) {
      // Handle missing publishableKey
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        const firstIssue = err.issues[0];
        if (firstIssue.path.includes("publishableKey")) {
          return sendError(
            res,
            400,
            "MISSING_PUBLISHABLE_KEY",
            "publishableKey is required",
          );
        }
      }

      // Handle Zod validation errors
      if (err.name === "ZodError" && err.errors?.length > 0) {
        const firstError = err.errors[0];
        if (firstError.path?.includes("publishableKey")) {
          return sendError(
            res,
            400,
            "MISSING_PUBLISHABLE_KEY",
            "publishableKey is required",
          );
        }
      }

      // Handle invalid publishable key
      if (err instanceof InvalidPublishableKeyError) {
        return sendError(
          res,
          401,
          "INVALID_PUBLISHABLE_KEY",
          "Publishable key is invalid or revoked",
        );
      }

      // Generic error
      return sendError(
        res,
        err.statusCode || 500,
        err.code || "INTERNAL_ERROR",
        err.message || "Internal server error",
      );
    }
  },
);

export default router;

