import { app } from "@azure/functions";
import { whatnotStatus, whatnotConnectStart, whatnotConnectCallback, whatnotDisconnect, whatnotSync, whatnotImport, whatnotReviewGet, whatnotReviewConfirm, whatnotReviewDiscard } from "../features/whatnot/handlers";

export { whatnotStatus, whatnotConnectStart, whatnotConnectCallback, whatnotDisconnect, whatnotSync, whatnotImport, whatnotReviewGet, whatnotReviewConfirm, whatnotReviewDiscard } from "../features/whatnot/handlers";

app.http("whatnotStatus", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/status",
  handler: whatnotStatus
});

app.http("whatnotConnectStart", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/connect/start",
  handler: whatnotConnectStart
});

app.http("whatnotConnectCallback", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/connect/callback",
  handler: whatnotConnectCallback
});

app.http("whatnotDisconnect", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/disconnect",
  handler: whatnotDisconnect
});

app.http("whatnotSync", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/sync",
  handler: whatnotSync
});

app.http("whatnotReviewGet", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/review",
  handler: whatnotReviewGet
});

app.http("whatnotImport", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/import",
  handler: whatnotImport
});

app.http("whatnotReviewConfirm", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/review/confirm",
  handler: whatnotReviewConfirm
});

app.http("whatnotReviewDiscard", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "integrations/whatnot/review/discard",
  handler: whatnotReviewDiscard
});
