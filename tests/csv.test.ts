import assert from "node:assert/strict";
import test from "node:test";
import { extractUrlsFromCsv, parseCsv, toCsv } from "../server/lib/csv.js";

test("parseCsv handles BOM, quoted commas, escaped quotes, and CRLF", () => {
  const rows = parseCsv('\uFEFFurl,note\r\n"https://example.com/a,b","say ""hello"""\r\n');
  assert.deepEqual(rows, [
    ["url", "note"],
    ["https://example.com/a,b", 'say "hello"'],
  ]);
});

test("extractUrlsFromCsv reads a URL header and embedded links", () => {
  const csv = [
    "name,URL,notes",
    "one,https://example.com/one,plain",
    'two,"https://example.com/two,with-comma",see https://example.org/embedded',
    "three,redirect https://example.net/inside,not a url",
  ].join("\n");
  assert.deepEqual(extractUrlsFromCsv(csv), [
    "https://example.com/one",
    "https://example.com/two,with-comma",
    "https://example.net/inside",
  ]);
});

test("extractUrlsFromCsv scans every cell when there is no URL header", () => {
  assert.deepEqual(extractUrlsFromCsv("alpha,https://a.example/x\nbeta,https://b.example/y"), [
    "https://a.example/x",
    "https://b.example/y",
  ]);
});

test("toCsv escapes delimiters and quotes and preserves column order", () => {
  const csv = toCsv(
    [{ id: "1", note: 'a,"b"', nested: { ok: true }, empty: null }],
    ["id", "note", "nested", "empty"],
  );
  assert.equal(csv, 'id,note,nested,empty\n1,"a,""b""","{""ok"":true}",\n');
});
