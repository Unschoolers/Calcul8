import type { ApiConfig } from "../../types";
import { deleteWhatnotConnection } from "../../lib/cosmos/whatnotRepository";

export async function eraseAccountData(config: ApiConfig, userId: string): Promise<void> {
  // Whatnot credentials are scoped secrets. Account deletion only erases the
  // personal scope; workspace-owned credentials need explicit workspace policy.
  await deleteWhatnotConnection(config, userId);
}
