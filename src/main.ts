import { createApp } from "vue";
import "vuetify/styles";
import { appOptions } from "./app.ts";
import { vuetify } from "./vuetify.ts";

createApp(appOptions).use(vuetify).mount("#app");
