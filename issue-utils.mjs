const githubIssuePrefix = (repository) => "https://github.com/" + String(repository || "");

export function normalizeIssueSearchResults(payload, repository) {
  if (!payload || !Array.isArray(payload.items) ||
      !Number.isSafeInteger(payload.total_count) || payload.total_count < 0) {
    throw new Error("GitHub returned an invalid duplicate-search response.");
  }
  if (payload.total_count > 0 && payload.items.length === 0) {
    throw new Error("GitHub reported matches but returned no issue records.");
  }

  const prefix = githubIssuePrefix(repository) + "/issues/";
  const results = [];
  for (const item of payload.items) {
    if (!item || typeof item !== "object" ||
        !Number.isSafeInteger(Number(item.number)) || Number(item.number) < 1 ||
        typeof item.title !== "string" || typeof item.html_url !== "string" ||
        typeof item.state !== "string") {
      throw new Error("GitHub returned a malformed issue search result.");
    }
    if (item.pull_request) continue;
    const number = Number(item.number);
    if (!item.html_url.startsWith(prefix)) {
      throw new Error("GitHub duplicate search returned an issue outside the target repository.");
    }
    if (item.state.toLowerCase() !== "open") continue;
    results.push({
      number,
      title: item.title.slice(0, 180) || "Untitled issue",
      html_url: item.html_url,
      state: item.state
    });
  }
  if (payload.total_count > 0 && results.length === 0 && payload.items.length > 0) {
    throw new Error("GitHub reported matches but none could be verified as open issues in the target repository.");
  }
  return results.slice(0, 3);
}

export function normalizeCreatedIssue(payload, repository) {
  const number = Number(payload?.number);
  const expectedUrl = githubIssuePrefix(repository) + "/issues/" + number;
  if (!payload || !Number.isSafeInteger(number) || number < 1 ||
      payload.html_url !== expectedUrl ||
      typeof payload.title !== "string" || !payload.title.trim()) {
    throw new Error("GitHub did not return a verifiable created issue.");
  }
  return { number, title: payload.title.trim().slice(0, 180), url: expectedUrl };
}

export function normalizeCreatedComment(payload, repository, issueNumber) {
  const number = Number(issueNumber);
  const id = Number(payload?.id);
  const expectedPrefix = githubIssuePrefix(repository) + "/issues/" + number + "#issuecomment-";
  const commentSuffix = typeof payload?.html_url === "string" && payload.html_url.startsWith(expectedPrefix)
    ? payload.html_url.slice(expectedPrefix.length)
    : "";
  if (!Number.isSafeInteger(number) || number < 1 ||
      !Number.isSafeInteger(id) || id < 1 ||
      !/^\\d+$/.test(commentSuffix) || Number(commentSuffix) !== id) {
    throw new Error("GitHub did not return a verifiable created comment.");
  }
  return { id, url: payload.html_url };
}
