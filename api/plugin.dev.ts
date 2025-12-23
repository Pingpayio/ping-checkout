// import packageJson from "./package.json" with { type: "json" };
import "dotenv/config";

export default {
  pluginId: "api",
  port: 3014,
  config: {
    variables: {
    },
    secrets: {
      DATABASE_URL: "file:test.db",
      DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || "",
      NEAR_INTENTS_API_KEY: process.env.NEAR_INTENTS_API_KEY || "",
    },
  },
};
