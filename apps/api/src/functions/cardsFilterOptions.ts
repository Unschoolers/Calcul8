import { app } from "@azure/functions";
import { cardsFilterOptions } from "../features/cards/filterOptionsHandler";

export { cardsFilterOptions } from "../features/cards/filterOptionsHandler";

app.http("cardsFilterOptions", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "cards/filter-options",
  handler: cardsFilterOptions
});
