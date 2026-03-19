import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: "unionArenaDark",
    themes: {
      unionArenaDark: {
        dark: true,
        colors: {
          primary: "#E63946",
          secondary: "#FFB800",
          error: "#FF3B30",
          success: "#34C759",
          background: "#121212",
          surface: "#1E1E1E"
        }
      },
      unionArenaLight: {
        dark: false,
        colors: {
          primary: "#E63946",
          secondary: "#B77900",
          error: "#FF3B30",
          success: "#34C759",
          background: "#E7E0D7",
          surface: "#F1E7D9",
          "surface-bright": "#FBF5EC",
          "surface-variant": "#DDD0BE",
          "on-surface": "#221F1A",
          "on-background": "#221F1A"
        }
      }
    }
  }
});
