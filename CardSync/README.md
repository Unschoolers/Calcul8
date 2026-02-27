# CardSync

Small local TypeScript utility to upsert card JSON arrays into Cosmos DB.

## Quick Start

1. Install deps:
   - `npm --prefix CardSync install`
2. Configure environment:
   - copy `CardSync/.env.example` to `CardSync/.env.local`
   - set `COSMOS_CONNECTION_STRING` (or `COSMOS_ENDPOINT` + `COSMOS_KEY`)
   - set `EXBURST_API_KEY` and `EXBURST_BEARER_TOKEN`
3. Run fetch:
   - `npm --prefix CardSync run fetch:ua -- --out ".\\ua-export.json"`
4. Run import:
   - `npm --prefix CardSync run import:file -- --file ".\\ua-export.json" --game ua`
   - for Pokemon JSON arrays: `npm --prefix CardSync run import:file -- --file ".\\pokemon-export.json" --game pokemon --pokemon-sets-file ".\\pokemondata_real\\sets\\en.json"`

## Expected Input

- A JSON file containing an array of objects (your card records).
- Union Arena records should contain `cardNo` (or at least `originalId`) so a stable `id` can be generated.
- Pokemon records are normalized on import:
  - `cardNo`: `number/printedTotal` (for example `64/128`) when set metadata is available
  - `series`: `set.id` (fallback `id` prefix)
  - `seriesName`: `set.name` (fallback `"Pokemon"`)
  - `image`: `images.small` / `images.large`
  - `marketPrice`: `marketPrice`, or best `tcgplayer.prices.*.market`, or `cardmarket.prices.averageSellPrice`
  - stable ID key prefers source `originalId` / `id` to avoid collisions across sets

## Output Shape

Each input row is upserted as:

- `id`: `<game>:<cardNo-or-originalId-or-id>`
- `pk`: always `<game>`
- `kind`: `"card"`
- `game`: e.g. `"ua"`
- plus all original input fields

## Commands

- `fetch-ua`:
  - fetches all UA cards via paginated REST
  - options:
    - `--out <path>` optional, write fetched array to JSON file
    - `--limit <n>` default `1000`
    - `--offset <n>` default `0`
    - `--include-unpublished` optional

- `import-file`:
  - imports a local JSON array into Cosmos

## CLI Options (import-file)

- `--file <path>` required
- `--game <ua|pkmn|...>` default: `CARDSYNC_GAME` or `ua`
- `--pokemon-sets-file <path>` optional, used when `--game pokemon|pkmn` to enrich set names and `number/printedTotal`
- `--batch-size <n>` default: env or `100`
- `--concurrency <n>` default: env or `4`
- `--dry-run` only validate/transform, no writes

## Notes

- Safe to re-run due to `upsert`.
- This tool writes directly to the configured container. Use `--dry-run` first against prod.
- Exported methods:
  - `fetchUnionArenaCards()`
  - `importCardsToCosmosFromRows()`
  - `importCardsToCosmosFromFile()`
