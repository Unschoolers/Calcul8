import { app } from "@azure/functions";
import { cardsSearch } from "../features/cards/searchHandler";

export { cardsSearch } from "../features/cards/searchHandler";

app.http("cardsSearch", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "cards/search",
  handler: cardsSearch
});
