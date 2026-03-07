import type { AppComputedObject } from "./context.ts";
import { authProfileComputed } from "./computed/auth-profile.ts";
import { singlesComputed } from "./computed/singles.ts";
import { forecastComputed } from "./computed/forecast.ts";
import { portfolioComputed } from "./computed/portfolio.ts";

export const appComputed: AppComputedObject = {
  ...authProfileComputed,
  ...singlesComputed,
  ...forecastComputed,
  ...portfolioComputed
};
