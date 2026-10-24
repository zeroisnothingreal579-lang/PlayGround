import assert from "node:assert/strict";
import test from "node:test";
import { inspectDestination, isBlockedHostname, isPrivateIp, normalizeUrl } from "../server/services/urlInspector.js";

const publicResolve = async () => ["93.184.216.34"];

test("normalizes URLs without appending a fragment", () => {
  assert.deepEqual(normalizeUrl("example.com/path"), { href: "https://example.com/path", hostname: "example.com" });
  assert.equal(normalizeUrl("https://example.com/path#section").href, "https://example.com/path#section");
  assert.throws(() => normalizeUrl("ftp://example.com/file"), /Only HTTP and HTTPS/);
  assert.throws(() => normalizeUrl("https://user:pass@example.com/"), /embedded credentials/);
  assert.throws(() => normalizeUrl(""), /empty/i);
});

test("identifies private IPv4 and IPv6 ranges", () => {
  for (const address of ["127.0.0.1", "10.2.3.4", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1"]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateIp(address), false, address);
  }
  assert.equal(isBlockedHostname("localhost"), true);
  assert.equal(isBlockedHostname("metadata.google.internal"), true);
  assert.equal(isBlockedHostname("example.com"), false);
});

test("blocks local and metadata destinations without fetching them", async () => {
  let fetched = false;
  const inspection = await inspectDestination("http://127.0.0.1/secret", {
    blockPrivateTargets: true,
    allowLocalTargets: false,
    resolveHost: publicResolve,
    fetchImpl: (async () => {
      fetched = true;
      return new Response("should not be requested");
    }) as typeof fetch,
  });
  assert.equal(fetched, false);
  assert.equal(inspection.finalUrl, null);
  assert.equal(inspection.risk, "high");
  assert.ok(inspection.flags.includes("private_address_blocked"));
  assert.match(inspection.error ?? "", /private/i);
});

test("blocks hostnames that resolve to private addresses", async () => {
  let fetched = false;
  const inspection = await inspectDestination("https://looks-public.example/", {
    blockPrivateTargets: true,
    allowLocalTargets: false,
    resolveHost: async () => ["10.0.0.42"],
    fetchImpl: (async () => {
      fetched = true;
      return new Response("nope");
    }) as typeof fetch,
  });
  assert.equal(fetched, false);
  assert.ok(inspection.flags.includes("private_address_blocked"));
});

test("follows redirects and records CAPTCHA and ad signatures", async () => {
  const requests: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url === "https://start.example/go") {
      return new Response(null, { status: 302, headers: { location: "https://dest.example/final" } });
    }
    return new Response(
      '<html><head><title>Claim your reward</title></head><body><div class="adsbygoogle"></div><p>Please verify you are a human</p></body></html>',
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }) as typeof fetch;

  const inspection = await inspectDestination("https://start.example/go", {
    blockPrivateTargets: true,
    allowLocalTargets: false,
    resolveHost: publicResolve,
    fetchImpl,
    now: (() => {
      let tick = 0;
      return () => {
        tick += 5;
        return tick;
      };
    })(),
  });

  assert.deepEqual(requests, ["https://start.example/go", "https://dest.example/final"]);
  assert.equal(inspection.chain.length, 2);
  assert.equal(inspection.finalUrl, "https://dest.example/final");
  assert.equal(inspection.finalDomain, "dest.example");
  assert.equal(inspection.httpStatus, 200);
  assert.equal(inspection.title, "Claim your reward");
  assert.equal(inspection.captcha, true);
  assert.equal(inspection.risk, "medium");
  assert.ok(inspection.flags.includes("cross_domain_redirect"));
  assert.ok(inspection.flags.includes("captcha_detected"));
  assert.ok(inspection.flags.includes("human_verification_required"));
  assert.ok(inspection.flags.includes("ad_networks_detected"));
  assert.deepEqual(inspection.adNetworks, ["Google AdSense"]);
  assert.equal(inspection.blocked, false);
  assert.ok(inspection.payoutNotes.some((note) => /CAPTCHA/i.test(note)));
});

test("detects a redirect loop", async () => {
  const fetchImpl = (async () =>
    new Response(null, { status: 302, headers: { location: "/start" } })) as typeof fetch;
  const inspection = await inspectDestination("https://loop.example/start", {
    blockPrivateTargets: true,
    allowLocalTargets: false,
    resolveHost: publicResolve,
    fetchImpl,
    maxRedirects: 5,
  });
  assert.equal(inspection.loop, true);
  assert.equal(inspection.risk, "high");
  assert.ok(inspection.flags.includes("redirect_loop"));
});

test("marks blocked HTTP responses", async () => {
  const fetchImpl = (async () =>
    new Response("<html><body>Access denied</body></html>", {
      status: 403,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;
  const inspection = await inspectDestination("https://blocked.example/", {
    blockPrivateTargets: true,
    allowLocalTargets: false,
    resolveHost: publicResolve,
    fetchImpl,
  });
  assert.equal(inspection.blocked, true);
  assert.equal(inspection.risk, "medium");
  assert.ok(inspection.flags.includes("blocked_response"));
  assert.ok(inspection.flags.includes("access_denied"));
});
