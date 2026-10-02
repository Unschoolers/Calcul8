import { createApp } from "vue";
import "vuetify/styles";
import "../../../src/styles/app.css";
import { vuetify } from "../../../src/vuetify.ts";
import ShopifyFixture from "./ShopifyFixture.vue";

const params = new URLSearchParams(window.location.search);
const language = params.get("locale") === "fr-CA" ? "fr-CA" : "en";
const theme = params.get("theme") === "unionArenaDark" ? "unionArenaDark" : "unionArenaLight";
vuetify.theme.change(theme);
document.documentElement.lang = language;

createApp(ShopifyFixture, {
  language,
  longTitle: params.get("longTitle") === "1",
  scenario: params.get("scenario") ?? "linked"
}).use(vuetify).mount("#shopify-fixture");
