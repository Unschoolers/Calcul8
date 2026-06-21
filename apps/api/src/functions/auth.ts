import { app } from "@azure/functions";
import { authMe, authLogout, authLogoutAll, authRefresh } from "../features/auth/handlers";

export { authMe, authLogout, authLogoutAll, authRefresh } from "../features/auth/handlers";

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

app.http("authRefresh", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/refresh",
  handler: authRefresh
});

app.http("authLogoutAll", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/logout-all",
  handler: authLogoutAll
});
