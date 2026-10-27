import test from "node:test";
import assert from "node:assert/strict";
import { formatContextTimestamp, mergeRecentMessages } from "../context-utils.mjs";

test("mergeRecentMessages combines D1 and Gateway rows without losing speaker metadata", () => {
  const firstId = "1430000000000000001";
  const secondId = "1430000000000000002";
  const rows = mergeRecentMessages(
    [{
      message_id: firstId,
      author_id: "111111111111111111",
      author_name: "Alice",
      content: "I ate noodles.",
      created_at: "2026-10-27T09:45:00.000Z",
      message_url: "https://discord.com/channels/1/2/" + firstId
    }],
    [
      {
        id: firstId,
        author_id: "111111111111111111",
        author_name: "Discord user",
        content: "I ate noodles.",
        created_at: "2026-10-27T09:45:00.000Z"
      },
      {
        id: secondId,
        author_id: "222222222222222222",
        author_name: "Lynx",
        content: "I had tea.",
        created_at: "2026-10-27T09:46:00.000Z"
      }
    ],
    24
  );

  assert.equal(rows.length, 2, "duplicate message IDs should merge into one record");
  assert.deepEqual(rows.map(row => row.id), [firstId, secondId], "messages should be oldest-to-newest");
  assert.equal(rows[0].author_name, "Alice", "a generic Gateway name must not overwrite a known D1 name");
  assert.equal(rows[0].author_id, "111111111111111111");
  assert.equal(rows[0].message_url, "https://discord.com/channels/1/2/" + firstId);
  assert.equal(rows[1].author_name, "Lynx");
});

test("mergeRecentMessages enforces the requested newest-message limit", () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({
    id: String(1430000000000000001n + BigInt(i)),
    author_id: "111111111111111111",
    author_name: "Alice",
    content: "message " + i,
    created_at: new Date(Date.UTC(2026, 9, 27, 9, i)).toISOString()
  }));
  assert.deepEqual(mergeRecentMessages(rows, 2).map(row => row.content), ["message 2", "message 3"]);
});

test("formatContextTimestamp exposes UTC and the configured local time", () => {
  const result = formatContextTimestamp("2026-10-27T09:49:26.000Z", "Asia/Kolkata");
  assert.equal(result.utc, "2026-10-27T09:49:26.000Z");
  assert.match(result.local, /27 Oct 2026/i);
  assert.match(result.local, /3:19:26/);
  assert.match(result.local, /IST/);
});

test("formatContextTimestamp handles missing timestamps without inventing a time", () => {
  assert.deepEqual(formatContextTimestamp("not a timestamp"), { utc: "UNKNOWN", local: "UNKNOWN" });
});
