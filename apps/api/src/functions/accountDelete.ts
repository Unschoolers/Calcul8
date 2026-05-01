import { app } from "@azure/functions";
import { accountDelete } from "../features/account/deleteHandler";

export { accountDelete } from "../features/account/deleteHandler";

app.http("accountDelete", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/delete",
  handler: accountDelete
});
