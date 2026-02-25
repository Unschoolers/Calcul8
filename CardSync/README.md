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

## Expected Input

- A JSON file containing an array of objects (your card records).
- Each record should contain `cardNo` (or at least `originalId`) so a stable `id` can be generated.

## Output Shape

Each input row is upserted as:

- `id`: `<game>:<cardNo-or-originalId>`
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
