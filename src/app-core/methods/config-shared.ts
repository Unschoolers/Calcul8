import { getTodayDate, inferDateFromTimestampId, toDateOnly } from "../../shared/lot-dates.ts";

export { getTodayDate, toDateOnly };

export function inferDateFromLotId(lotId: number): string | null {
  return inferDateFromTimestampId(lotId);
}

