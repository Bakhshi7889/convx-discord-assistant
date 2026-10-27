const GENERIC_NAMES = new Set(["", "discord user", "unknown discord member", "member"]);

function normalizeMessageId(message) {
  return String(message?.id || message?.message_id || message?.messageId || "").trim();
}

function timestampMillis(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Merge transcript rows from durable short-term context and D1 history.
 * Discord snowflake IDs provide a stable chronological order and deduplicate
 * records without accidentally collapsing two identical messages.
 */
export function mergeRecentMessages(...args) {
  let limit = 24;
  if (typeof args[args.length - 1] === "number") limit = args.pop();
  const byId = new Map();

  for (const source of args) {
    for (const item of Array.isArray(source) ? source : []) {
      const id = normalizeMessageId(item);
      if (!id) continue;
      const previous = byId.get(id) || {};
      const incomingName = String(item?.author_name || item?.author?.global_name || item?.author?.username || "").trim();
      const previousName = String(previous.author_name || "").trim();
      const preferredName = incomingName && !GENERIC_NAMES.has(incomingName.toLowerCase())
        ? incomingName
        : (previousName || incomingName || "Unknown Discord member");
      const incomingContent = String(item?.content ?? "").trim();
      const previousContent = String(previous.content ?? "").trim();
      const incomingTime = String(item?.created_at || item?.timestamp || "").trim();
      const previousTime = String(previous.created_at || previous.timestamp || "").trim();

      byId.set(id, {
        ...previous,
        ...item,
        id,
        message_id: id,
        author_id: String(item?.author_id || item?.author?.id || previous.author_id || ""),
        author_name: preferredName.slice(0, 80),
        content: incomingContent || previousContent,
        created_at: timestampMillis(incomingTime) ? incomingTime : (previousTime || incomingTime),
        message_url: String(item?.message_url || previous.message_url || "")
      });
    }
  }

  const messages = [...byId.values()].filter(item => String(item.content || "").trim());
  messages.sort((a, b) => {
    try {
      const left = BigInt(a.id);
      const right = BigInt(b.id);
      if (left !== right) return left < right ? -1 : 1;
    } catch {}
    return timestampMillis(a.created_at) - timestampMillis(b.created_at) ||
      String(a.id).localeCompare(String(b.id));
  });

  const count = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 24;
  return count === 0 ? [] : messages.slice(-count);
}

/**
 * Keep the source timestamp in UTC while also exposing a human-readable
 * server-local time for answering "who said what, and when?" questions.
 */
export function formatContextTimestamp(value, timeZone = "Asia/Kolkata") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { utc: "UNKNOWN", local: "UNKNOWN" };
  const utc = date.toISOString();
  try {
    const local = new Intl.DateTimeFormat("en-IN", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short"
    }).format(date);
    return { utc, local };
  } catch {
    return { utc, local: utc + " (timezone unavailable)" };
  }
}
