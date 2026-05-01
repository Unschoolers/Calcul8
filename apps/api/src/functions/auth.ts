import { app } from "@azure/functions";
import { authMe, authLogout, authLogoutAll } from "../features/auth/handlers";

export { authMe, authLogout, authLogoutAll } from "../features/auth/handlers";

app.http("authMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: authMe
});

app.http("authLogout", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/logout",
  handler: authLogout
});

app.http("authLogoutAll", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/logout-all",
  handler: authLogoutAll
});
