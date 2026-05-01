import { app } from "@azure/functions";
import { accountExport } from "../features/account/exportHandler";

export { accountExport } from "../features/account/exportHandler";

app.http("accountExport", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/export",
  handler: accountExport
});
