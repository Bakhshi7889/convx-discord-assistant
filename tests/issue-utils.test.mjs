import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeIssueSearchResults,
  normalizeCreatedIssue,
  normalizeCreatedComment
} from "../issue-utils.mjs";

const repo = "cosmictaserdev-creator/Convx";

test("duplicate search only returns verified open issues from the target repository", () => {
  const result = normalizeIssueSearchResults({
    total_count: 3,
    items: [
      { number: 12, title: "Player crashes on style change", html_url: "https://github.com/cosmictaserdev-creator/Convx/issues/12", state: "open" },
      { number: 13, title: "Closed unrelated report", html_url: "https://github.com/cosmictaserdev-creator/Convx/issues/13", state: "closed" },
      { number: 14, title: "A pull request", html_url: "https://github.com/cosmictaserdev-creator/Convx/issues/14", state: "open", pull_request: { url: "api" } }
    ]
  }, repo);
  assert.deepEqual(result, [{
    number: 12,
    title: "Player crashes on style change",
    html_url: "https://github.com/cosmictaserdev-creator/Convx/issues/12",
    state: "open"
  }]);
});

test("malformed or incomplete duplicate searches fail closed", () => {
  assert.throws(() => normalizeIssueSearchResults({ items: [] }, repo), /invalid duplicate-search response/);
  assert.throws(() => normalizeIssueSearchResults({ total_count: 2, items: [] }, repo), /reported matches/);
  assert.throws(() => normalizeIssueSearchResults({
    total_count: 1,
    items: [{ number: 4, title: "wrong repo", html_url: "https://github.com/example/other/issues/4", state: "open" }]
  }, repo), /outside the target repository/);
});

test("created issue result must include a real issue number, title and exact repository URL", () => {
  assert.deepEqual(normalizeCreatedIssue({
    number: 23, title: "Crash on playback", html_url: "https://github.com/cosmictaserdev-creator/Convx/issues/23"
  }, repo), {
    number: 23, title: "Crash on playback", url: "https://github.com/cosmictaserdev-creator/Convx/issues/23"
  });
  assert.throws(() => normalizeCreatedIssue({ number: 23, title: "Crash", html_url: "https://example.com/issues/23" }, repo), /verifiable created issue/);
});

test("created comment result must link to the requested issue comment", () => {
  assert.deepEqual(normalizeCreatedComment({
    id: 654, html_url: "https://github.com/cosmictaserdev-creator/Convx/issues/23#issuecomment-654"
  }, repo, 23), {
    id: 654, url: "https://github.com/cosmictaserdev-creator/Convx/issues/23#issuecomment-654"
  });
  assert.throws(() => normalizeCreatedComment({
    id: 654, html_url: "https://github.com/cosmictaserdev-creator/Convx/issues/24#issuecomment-654"
  }, repo, 23), /verifiable created comment/);
});
