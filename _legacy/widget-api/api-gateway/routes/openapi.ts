import express from "express";
import { publicRateLimit } from "../middleware/rateLimit.js";
import { sendError } from "../utils/errorResponse.js";
import { getOpenApiSpec } from "../openapi/openapiBuilder.js";

const router = express.Router();

// GET /openapi.json
router.get(
  "/openapi.json",
  publicRateLimit(),
  async (_req, res) => {
    try {
      const spec = getOpenApiSpec();
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json(spec);
    } catch (err: any) {
      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        err?.message || "Failed to generate OpenAPI spec",
      );
    }
  },
);

// GET /docs
router.get(
  "/docs",
  publicRateLimit(),
  async (_req, res) => {
    try {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PingPay API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.presets.standalone
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;

      return res
        .status(200)
        .setHeader("Content-Type", "text/html; charset=utf-8")
        .send(html);
    } catch (err: any) {
      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        err?.message || "Failed to generate docs page",
      );
    }
  },
);

export default router;

