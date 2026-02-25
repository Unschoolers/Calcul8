import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applySinglesCsvImportRows,
  buildSinglesCsvImportDraft,
  isValidCsvColumnIndex,
  parseSinglesCsvRowsWithMapping,
  summarizeSinglesCsvImportOutcome
} from "../src/app-core/methods/config-lots-import.ts";

test("isValidCsvColumnIndex validates bounds", () => {
  assert.equal(isValidCsvColumnIndex(0, 3), true);
  assert.equal(isValidCsvColumnIndex(2, 3), true);
  assert.equal(isValidCsvColumnIndex(3, 3), false);
  assert.equal(isValidCsvColumnIndex(-1, 3), false);
  assert.equal(isValidCsvColumnIndex(null, 3), false);
});

test("buildSinglesCsvImportDraft infers mapping from known headers", () => {
  const draft = buildSinglesCsvImportDraft(
    "Item,Card Number,Condition,Language,Price,Qty,Market Value\nPikachu,025,Near Mint,English,3.5,2,5.5"
  );

  assert.ok(draft);
  assert.deepEqual(draft.headers, ["Item", "Card Number", "Condition", "Language", "Price", "Qty", "Market Value"]);
  assert.equal(draft.mapping.item, 0);
  assert.equal(draft.mapping.cardNumber, 1);
  assert.equal(draft.mapping.condition, 2);
  assert.equal(draft.mapping.language, 3);
  assert.equal(draft.mapping.cost, 4);
  assert.equal(draft.mapping.quantity, 5);
  assert.equal(draft.mapping.marketValue, 6);
  assert.equal(draft.rows.length, 1);
});

test("buildSinglesCsvImportDraft uses generated column names when no header aliases match", () => {
  const draft = buildSinglesCsvImportDraft(
    "Blue-Eyes White Dragon,2,14.99\nDark Magician,1,9.99"
  );

  assert.ok(draft);
  assert.deepEqual(draft.headers, ["Column 1", "Column 2", "Column 3"]);
  assert.equal(draft.mapping.item, null);
  assert.equal(draft.mapping.quantity, null);
  assert.equal(draft.rows.length, 2);
});

test("buildSinglesCsvImportDraft returns null when there are no data rows", () => {
  assert.equal(buildSinglesCsvImportDraft(""), null);
  assert.equal(buildSinglesCsvImportDraft("Item,Qty"), null);
});

test("buildSinglesCsvImportDraft supports quoted cells and escaped quotes", () => {
  const draft = buildSinglesCsvImportDraft(
    "Item,Qty\n\"Charizard, Alt \"\"Special\"\"\",2"
  );

  assert.ok(draft);
  assert.equal(draft.rows[0]?.[0], "Charizard, Alt \"Special\"");
  assert.equal(draft.rows[0]?.[1], "2");
});

test("parseSinglesCsvRowsWithMapping parses and trims all mapped fields", () => {
  const parsed = parseSinglesCsvRowsWithMapping(
    [
      [" Pikachu ", "025", " Near Mint ", " English ", "$3.50", "2", "$5.75"]
    ],
    7,
    {
      item: 0,
      cardNumber: 1,
      condition: 2,
      language: 3,
      cost: 4,
      quantity: 5,
      marketValue: 6
    },
    "USD"
  );

  assert.equal(parsed.skippedCount, 0);
  assert.equal(parsed.entries.length, 1);
  assert.deepEqual(parsed.entries[0], {
    item: "Pikachu",
    cardNumber: "025",
    condition: "Near Mint",
    language: "English",
    cost: 3.5,
    currency: "USD",
    quantity: 2,
    marketValue: 5.75
  });
});

test("parseSinglesCsvRowsWithMapping skips rows missing item or quantity", () => {
  const parsed = parseSinglesCsvRowsWithMapping(
    [
      ["", "1"],
      ["Card A", ""],
      ["Card B", "0"],
      ["Card C", "2"]
    ],
    2,
    {
      item: 0,
      cardNumber: null,
      condition: null,
      language: null,
      cost: null,
      quantity: 1,
      marketValue: null
    },
    "CAD"
  );

  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.item, "Card C");
  assert.equal(parsed.skippedCount, 3);
});

test("parseSinglesCsvRowsWithMapping sanitizes invalid currency-like numbers", () => {
  const parsed = parseSinglesCsvRowsWithMapping(
    [["Card A", "-4", "1", "-2"]],
    4,
    {
      item: 0,
      cardNumber: null,
      condition: null,
      language: null,
      cost: 1,
      quantity: 2,
      marketValue: 3
    },
    "CAD"
  );

  assert.equal(parsed.entries[0]?.cost, 0);
  assert.equal(parsed.entries[0]?.marketValue, 0);
});

test("applySinglesCsvImportRows merge mode merges on item+card and increments quantity by one per duplicate row", () => {
  const existingRows = [
    { id: 1, item: "Pikachu", cardNumber: "025", cost: 1, quantity: 2, marketValue: 3 }
  ];
  const parsedRows = [
    { item: "Pikachu", cardNumber: "025", cost: 2, quantity: 5, marketValue: 4 },
    { item: "Pikachu", cardNumber: "025", cost: 2, quantity: 1, marketValue: 4 },
    { item: "Charmander", cardNumber: "004", cost: 2, quantity: 2, marketValue: 4 }
  ];

  const applied = applySinglesCsvImportRows({
    existingRows,
    parsedRows,
    importMode: "merge",
    now: 1000
  });

  assert.equal(applied.mode, "merge");
  assert.equal(applied.replacedCount, 0);
  assert.equal(applied.mergedCount, 2);
  assert.equal(applied.addedCount, 1);
  assert.equal(applied.rows.length, 2);
  assert.equal(applied.rows[0]?.quantity, 4);
  assert.equal(applied.rows[1]?.item, "Charmander");
  assert.equal(existingRows[0]?.quantity, 2);
});

test("applySinglesCsvImportRows append mode never merges", () => {
  const existingRows = [
    { id: 1, item: "Pikachu", cardNumber: "025", cost: 1, quantity: 2, marketValue: 3 }
  ];
  const parsedRows = [
    { item: "Pikachu", cardNumber: "025", cost: 2, quantity: 5, marketValue: 4 },
    { item: "Pikachu", cardNumber: "025", cost: 2, quantity: 1, marketValue: 4 }
  ];

  const applied = applySinglesCsvImportRows({
    existingRows,
    parsedRows,
    importMode: "append",
    now: 2000
  });

  assert.equal(applied.mode, "append");
  assert.equal(applied.replacedCount, 0);
  assert.equal(applied.mergedCount, 0);
  assert.equal(applied.addedCount, 2);
  assert.equal(applied.rows.length, 3);
  assert.equal(applied.rows[1]?.id, 2000);
  assert.equal(applied.rows[2]?.id, 2001);
});

test("applySinglesCsvImportRows sync mode replaces existing rows and still merges duplicates from import", () => {
  const applied = applySinglesCsvImportRows({
    existingRows: [
      { id: 10, item: "Old Card", cardNumber: "001", cost: 1, quantity: 2, marketValue: 3 }
    ],
    parsedRows: [
      { item: "Pikachu", cardNumber: "025", cost: 2, quantity: 5, marketValue: 4 },
      { item: "Pikachu", cardNumber: "025", cost: 2, quantity: 1, marketValue: 4 },
      { item: "Charmander", cardNumber: "004", cost: 2, quantity: 2, marketValue: 4 }
    ],
    importMode: "sync",
    now: 3000
  });

  assert.equal(applied.mode, "sync");
  assert.equal(applied.replacedCount, 1);
  assert.equal(applied.mergedCount, 1);
  assert.equal(applied.addedCount, 2);
  assert.equal(applied.rows.length, 2);
  assert.equal(applied.rows[0]?.item, "Pikachu");
  assert.equal(applied.rows[0]?.quantity, 6);
});

test("applySinglesCsvImportRows does not merge when card number is missing", () => {
  const applied = applySinglesCsvImportRows({
    existingRows: [],
    parsedRows: [
      { item: "Pikachu", cardNumber: "", cost: 2, quantity: 2, marketValue: 4 },
      { item: "Pikachu", cardNumber: "", cost: 2, quantity: 2, marketValue: 4 }
    ],
    importMode: "merge",
    now: 4000
  });

  assert.equal(applied.mergedCount, 0);
  assert.equal(applied.addedCount, 2);
  assert.equal(applied.rows.length, 2);
});

test("applySinglesCsvImportRows does not merge when condition or language differs", () => {
  const applied = applySinglesCsvImportRows({
    existingRows: [
      {
        id: 1,
        item: "Pikachu",
        cardNumber: "025",
        condition: "Near Mint",
        language: "English",
        cost: 2,
        quantity: 1,
        marketValue: 3
      }
    ],
    parsedRows: [
      {
        item: "Pikachu",
        cardNumber: "025",
        condition: "Good",
        language: "English",
        cost: 2,
        quantity: 1,
        marketValue: 3
      },
      {
        item: "Pikachu",
        cardNumber: "025",
        condition: "Near Mint",
        language: "French",
        cost: 2,
        quantity: 1,
        marketValue: 3
      }
    ],
    importMode: "merge",
    now: 5000
  });

  assert.equal(applied.mergedCount, 0);
  assert.equal(applied.addedCount, 2);
  assert.equal(applied.rows.length, 3);
});

test("applySinglesCsvImportRows merges blank condition/language row into a unique item+number match", () => {
  const applied = applySinglesCsvImportRows({
    existingRows: [
      {
        id: 1,
        item: "Pikachu",
        cardNumber: "025",
        condition: "Near Mint",
        language: "English",
        cost: 2,
        quantity: 1,
        marketValue: 3
      }
    ],
    parsedRows: [
      {
        item: "Pikachu",
        cardNumber: "025",
        condition: "",
        language: "",
        cost: 2,
        quantity: 10,
        marketValue: 3
      }
    ],
    importMode: "merge",
    now: 5500
  });

  assert.equal(applied.mergedCount, 1);
  assert.equal(applied.ambiguousCount, 0);
  assert.equal(applied.addedCount, 0);
  assert.equal(applied.rows.length, 1);
  assert.equal(applied.rows[0]?.quantity, 2);
});

test("applySinglesCsvImportRows keeps blank condition/language row separate when item+number match is ambiguous", () => {
  const applied = applySinglesCsvImportRows({
    existingRows: [
      {
        id: 1,
        item: "Pikachu",
        cardNumber: "025",
        condition: "Near Mint",
        language: "English",
        cost: 2,
        quantity: 1,
        marketValue: 3
      },
      {
        id: 2,
        item: "Pikachu",
        cardNumber: "025",
        condition: "Good",
        language: "English",
        cost: 1,
        quantity: 1,
        marketValue: 2
      }
    ],
    parsedRows: [
      {
        item: "Pikachu",
        cardNumber: "025",
        condition: "",
        language: "",
        cost: 2,
        quantity: 1,
        marketValue: 3
      }
    ],
    importMode: "merge",
    now: 5600
  });

  assert.equal(applied.mergedCount, 0);
  assert.equal(applied.ambiguousCount, 1);
  assert.equal(applied.addedCount, 1);
  assert.equal(applied.rows.length, 3);
  assert.equal(applied.rows[2]?.condition, "");
  assert.equal(applied.rows[2]?.language, "");
});

test("applySinglesCsvImportRows generates non-colliding ids when now matches existing id", () => {
  const applied = applySinglesCsvImportRows({
    existingRows: [
      { id: 7000, item: "A", cardNumber: "001", cost: 1, quantity: 1, marketValue: 1 }
    ],
    parsedRows: [
      { item: "B", cardNumber: "002", cost: 1, quantity: 1, marketValue: 1 }
    ],
    importMode: "append",
    now: 7000
  });

  assert.equal(applied.rows.length, 2);
  assert.equal(applied.rows[1]?.id, 7001);
});

test("summarizeSinglesCsvImportOutcome formats merge summary", () => {
  const summary = summarizeSinglesCsvImportOutcome({
    mode: "merge",
    addedCount: 1,
    mergedCount: 2,
    ambiguousCount: 0,
    replacedCount: 0,
    skippedCount: 3
  });
  assert.equal(summary, "Imported 1 item from CSV (2 merged into existing rows; 3 skipped: missing Item or Quantity).");
});

test("summarizeSinglesCsvImportOutcome formats sync summary with replaced rows", () => {
  const summary = summarizeSinglesCsvImportOutcome({
    mode: "sync",
    addedCount: 2,
    mergedCount: 1,
    ambiguousCount: 0,
    replacedCount: 4,
    skippedCount: 0
  });
  assert.equal(summary, "Synced 2 items from CSV (4 existing rows replaced; 1 merged into existing rows).");
});

test("summarizeSinglesCsvImportOutcome formats append summary without extras", () => {
  const summary = summarizeSinglesCsvImportOutcome({
    mode: "append",
    addedCount: 3,
    mergedCount: 0,
    ambiguousCount: 0,
    replacedCount: 0,
    skippedCount: 0
  });
  assert.equal(summary, "Appended 3 items from CSV.");
});

test("summarizeSinglesCsvImportOutcome includes ambiguity note when fallback merge is ambiguous", () => {
  const summary = summarizeSinglesCsvImportOutcome({
    mode: "merge",
    addedCount: 1,
    mergedCount: 0,
    ambiguousCount: 2,
    replacedCount: 0,
    skippedCount: 0
  });
  assert.equal(summary, "Imported 1 item from CSV (2 not merged: ambiguous Item + Number match).");
});
