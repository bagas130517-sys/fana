import assert from "node:assert/strict";
import test from "node:test";
import { paged, pageParams } from "./pagination.js";

/**
 * `perPage` comes from a query string, so it is whatever the caller types. The
 * clamp is the only thing standing between a dashboard endpoint and "give me
 * every row".
 */

test("defaults when nothing is asked for", () => {
  assert.deepEqual(pageParams({}), { page: 1, perPage: 10, offset: 0 });
});

test("offset follows the page", () => {
  assert.equal(pageParams({ page: "3", perPage: "10" }).offset, 20);
  assert.equal(pageParams({ page: "1", perPage: "25" }).offset, 0);
});

test("perPage is capped", () => {
  assert.equal(pageParams({ perPage: "100" }).perPage, 100);
  assert.equal(pageParams({ perPage: "1000000" }).perPage, 100);
});

test("a page below one is page one", () => {
  for (const page of ["0", "-5"]) {
    assert.equal(pageParams({ page }).page, 1, page);
    assert.equal(pageParams({ page }).offset, 0, page);
  }
});

test("nonsense falls back rather than producing NaN", () => {
  for (const bad of ["abc", "", "NaN", "Infinity"]) {
    const p = pageParams({ page: bad, perPage: bad });
    assert.equal(p.page, 1, bad);
    assert.equal(p.perPage, 10, bad);
    assert.equal(p.offset, 0, bad);
  }
});

test("fractional input is floored, not rounded up into an extra page", () => {
  assert.equal(pageParams({ page: "2.9" }).page, 2);
  assert.equal(pageParams({ perPage: "10.9" }).perPage, 10);
});

test("a caller-supplied default is still capped", () => {
  assert.equal(pageParams({}, 20).perPage, 20);
  assert.equal(pageParams({ perPage: "500" }, 20).perPage, 100);
});

test("page count covers the remainder", () => {
  const p = pageParams({ perPage: "10" });
  assert.equal(paged([], 0, p).pages, 1, "an empty table is still page 1 of 1");
  assert.equal(paged([], 10, p).pages, 1);
  assert.equal(paged([], 11, p).pages, 2);
  assert.equal(paged([], 100, p).pages, 10);
});

test("the response echoes what was asked for", () => {
  const p = pageParams({ page: "2", perPage: "5" });
  const result = paged([{ id: 1 }], 42, p);
  assert.deepEqual(result, {
    rows: [{ id: 1 }],
    page: 2,
    perPage: 5,
    total: 42,
    pages: 9,
  });
});
