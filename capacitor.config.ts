import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.whatfees",
  appName: "WhatFees",
  webDir: "dist",
  loggingBehavior: "debug",
  android: {
    path: "apps/android",
    backgroundColor: "#000000"
  },
  server: {
    hostname: "app.whatfees.ca",
    androidScheme: "https",
    cleartext: false
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css"
    }
  }
};

export default config;
