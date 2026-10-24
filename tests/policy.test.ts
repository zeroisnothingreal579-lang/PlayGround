import assert from "node:assert/strict";
import test from "node:test";
import { isAdContainerDescriptor, reviewAgentAction } from "../server/services/policy.js";

test("permits ordinary interface controls", () => {
  assert.equal(reviewAgentAction({ type: "click_skip", selector: "#skip", label: "Skip intro" }).allowed, true);
  assert.equal(reviewAgentAction({ type: "click_continue", selector: "button.next", label: "Continue to article" }).allowed, true);
  assert.equal(reviewAgentAction({ type: "click_close", selector: ".modal-close", label: "Close dialog" }).allowed, true);
  assert.equal(reviewAgentAction({ type: "wait", ms: 2500 }).allowed, true);
  assert.equal(reviewAgentAction({ type: "scroll" }).allowed, true);
});

test("blocks sponsored, reward, and verification controls", () => {
  assert.equal(reviewAgentAction({ type: "click_skip", selector: "#go", label: "Sponsored offer" }).allowed, false);
  assert.equal(reviewAgentAction({ type: "click_continue", selector: "#go", label: "Claim reward" }).allowed, false);
  assert.equal(reviewAgentAction({ type: "click_close", selector: "#go", label: "Verify you are human" }).allowed, false);
  assert.equal(reviewAgentAction({ type: "click_skip", selector: ".adsbygoogle iframe", label: "Skip" }).allowed, false);
});

test("requires a selector and bounded waits", () => {
  assert.equal(reviewAgentAction({ type: "click_skip", label: "Skip" }).allowed, false);
  assert.equal(reviewAgentAction({ type: "wait", ms: 20_000 }).allowed, false);
  assert.equal(reviewAgentAction({ type: "wait", ms: -1 }).allowed, false);
});

test("detects advertising container descriptors", () => {
  assert.equal(isAdContainerDescriptor("div#ad-slot"), true);
  assert.equal(isAdContainerDescriptor("sponsored-results"), true);
  assert.equal(isAdContainerDescriptor("taboola-widget"), true);
  assert.equal(isAdContainerDescriptor("article-body"), false);
});
