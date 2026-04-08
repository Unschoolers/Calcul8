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
   - `npm --prefix CardSync run fetch:ua -- --series "kgr" --out ".\\ua-kagurabachi.json"`
4. Optionally filter an existing export to one set:
   - `npm --prefix CardSync run filter:file -- --file ".\\ua-export.json" --out ".\\ua-kagurabachi.json" --contains "kagurabachi"`
4. Run import:
   - `npm --prefix CardSync run import:file -- --file ".\\ua-export.json" --game ua`
   - for Pokemon JSON arrays: `npm --prefix CardSync run import:file -- --file ".\\pokemon-all.json" --game pokemon --pokemon-sets-file ".\\en.json"`
5. Update Pokemon data (git pull + rebuild pokemon-all.json):
   - `npm --prefix CardSync run fetch:pokemon`

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
    - `--name <text>` optional `ilike` filter on `name`
    - `--series <text>` optional `ilike` filter on `series`
    - `--series-name <text>` optional `ilike` filter on `seriesName`
    - `--abbreviation <text>` optional `ilike` filter on `abbreviation`
    - `--include-unpublished` optional

- `fetch-pokemon`:
  - pulls the latest from the local `pokemondata_real` git repo, merges all `cards/en/*.json` into `CardSync/pokemon-all.json`, and copies `sets/en.json` to `CardSync/en.json`
  - options:
    - `--repo <path>` override repo location (default: `../pokemondata_real`)
    - `--out <path>` override output file (default: `pokemon-all.json`)
    - `--sets-out <path>` override sets output (default: `en.json`)

- `import-file`:
  - imports a local JSON array into Cosmos

- `filter-file`:
  - filters a local JSON array into a smaller JSON array
  - useful for splitting a large UA export into one set/series file before import

## CLI Options (import-file)

- `--file <path>` required
- `--game <ua|pkmn|...>` default: `CARDSYNC_GAME` or `ua`
- `--pokemon-sets-file <path>` optional, used when `--game pokemon|pkmn` to enrich set names and `number/printedTotal`
- `--batch-size <n>` default: env or `100`
- `--concurrency <n>` default: env or `4`
- `--missing-only` query Cosmos first and import only docs whose `id` is not already present
- `--dry-run` only validate/transform, no writes

## CLI Options (filter-file)

- `--file <path>` required
- `--out <path>` required
- `--contains <text>` case-insensitive substring match across `name`, `cardNo`, `originalId`, `series`, `seriesName`, `abbreviation`
- `--series <text>` filter on `series`
- `--series-name <text>` filter on `seriesName`
- `--abbreviation <text>` filter on `abbreviation`

## Notes

- Safe to re-run due to `upsert`.
- `--missing-only` is useful for “new set only” imports when you want to skip cards already present in the catalog.
- This tool writes directly to the configured container. Use `--dry-run` first against prod.
- Exported methods:
  - `fetchUnionArenaCards()`
  - `importCardsToCosmosFromRows()`
  - `importCardsToCosmosFromFile()`

## Example: import only cards missing from Cosmos

- full file, but skip anything already in the container:
  - `npm --prefix CardSync run import:file -- --file ".\\ua-export.json" --game ua --missing-only`

- useful flow for a new UA set like Kagurabachi:
  - fetch only the target set:
    - `npm --prefix CardSync run fetch:ua -- --series "kgr" --out ".\\ua-kagurabachi.json"`
  - import only missing catalog rows:
    - `npm --prefix CardSync run import:file -- --file ".\\ua-kagurabachi.json" --game ua --missing-only`

- other fetch examples:
  - `npm --prefix CardSync run fetch:ua -- --name "chihiro" --out ".\\ua-chihiro.json"`
  - `npm --prefix CardSync run fetch:ua -- --series-name "kagurabachi" --out ".\\ua-kagurabachi.json"`
  - `npm --prefix CardSync run fetch:ua -- --abbreviation "UE08BT" --out ".\\ua-ue08bt.json"`

Because UA docs use stable ids based on `cardNo` in `src/index.ts`, existing catalog rows are detected reliably before writing.

- useful flow for a new Pokemon set like Perfect Order (me3):
  - update local data:
    - `npm --prefix CardSync run fetch:pokemon`
  - filter to just the new set:
    - `npm --prefix CardSync run filter:file -- --file ".\pokemon-all.json" --out ".\pokemon-me3.json" --contains "me3"`
  - import only missing catalog rows:
    - `npm --prefix CardSync run import:file -- --file ".\pokemon-me3.json" --game pokemon --pokemon-sets-file ".\en.json" --missing-only`
