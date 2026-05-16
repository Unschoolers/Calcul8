import { createRealtimeGateway } from "./realtime-gateway.js";
import {
  normalizeOptionalBoolean,
  normalizeOptionalString,
  parseAllowedOrigins
} from "./realtime-helpers.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);

const gateway = createRealtimeGateway({
  allowedOrigins: parseAllowedOrigins(process.env.REALTIME_ALLOWED_ORIGIN),
  internalApiKey: normalizeOptionalString(process.env.REALTIME_INTERNAL_API_KEY),
  tokenSecret: normalizeOptionalString(process.env.REALTIME_TOKEN_SECRET),
  allowUnauthenticatedSubscribe: normalizeOptionalBoolean(
    process.env.REALTIME_DEV_ALLOW_UNAUTH_SUBSCRIBE,
    process.env.NODE_ENV !== "production"
  )
});

gateway.server.listen(port, () => {
  console.log(`[realtime] listening on :${port}`);
});
