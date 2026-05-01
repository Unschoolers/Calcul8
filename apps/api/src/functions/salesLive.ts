import { app } from "@azure/functions";
import { lotSalesRoute, allSalesRoute, lotSalesMetaGet, lotSalesDelete, lotLivePricingRoute, lotRealtimeTokenGet, workspaceRealtimeTokenGet } from "../features/sales/handlers";

export { lotSalesRoute, allSalesRoute, lotSalesList, allSalesList, lotSalesMetaGet, lotSalesUpsert, lotSalesDelete, lotLivePricingRoute, lotLivePricingGet, lotLivePricingSave, lotRealtimeTokenGet, workspaceRealtimeTokenGet } from "../features/sales/handlers";

app.http("lotSalesRoute", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/sales",
  handler: lotSalesRoute
});

app.http("allSalesRoute", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "sales",
  handler: allSalesRoute
});

app.http("lotSalesMetaRoute", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/sales-meta",
  handler: lotSalesMetaGet
});

app.http("lotSalesDelete", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/sales/{saleId}",
  handler: lotSalesDelete
});

app.http("lotLivePricingRoute", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/live-pricing",
  handler: lotLivePricingRoute
});

app.http("lotRealtimeTokenRoute", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/realtime-token",
  handler: lotRealtimeTokenGet
});

app.http("workspaceRealtimeTokenRoute", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/realtime-token",
  handler: workspaceRealtimeTokenGet
});
