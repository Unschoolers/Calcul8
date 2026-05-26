import assert from "node:assert/strict";
import { test } from "vitest";
import {
  getSinglesImageDataUrlByteLength,
  isSinglesImageUploadFile,
  SINGLES_IMAGE_UPLOAD_MAX_BYTES,
  SINGLES_IMAGE_UPLOAD_MAX_EDGE
} from "../src/components/windows/singles/singlesImageUpload.ts";

test("singles image uploads accept raster images and reject non-images", () => {
  assert.equal(isSinglesImageUploadFile({ type: "image/jpeg", name: "item.jpg" }), true);
  assert.equal(isSinglesImageUploadFile({ type: "image/png", name: "item.png" }), true);
  assert.equal(isSinglesImageUploadFile({ type: "", name: "item.webp" }), true);
  assert.equal(isSinglesImageUploadFile({ type: "image/svg+xml", name: "item.svg" }), false);
  assert.equal(isSinglesImageUploadFile({ type: "application/pdf", name: "item.pdf" }), false);
  assert.equal(isSinglesImageUploadFile(null), false);
});

test("singles image upload constants keep local-first images bounded", () => {
  assert.equal(SINGLES_IMAGE_UPLOAD_MAX_EDGE, 640);
  assert.equal(SINGLES_IMAGE_UPLOAD_MAX_BYTES, 160_000);
  assert.equal(getSinglesImageDataUrlByteLength("data:image/jpeg;base64,YWJjZA=="), 4);
  assert.equal(getSinglesImageDataUrlByteLength(""), 0);
});
