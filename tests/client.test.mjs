import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  buildGame, CLIENT_HASH, CLIENT_NAME, CLIENT_SIZE, extractClient, importClient,
  mergeOptions, normalizeSettings, readLimited, verifyClient,
} from "../docs/client.js";

test("normalizes malformed settings and rounds touch opacity", () => {
  assert.deepEqual(normalizeSettings(null), { profile: "balanced", opacity: 85 });
  assert.deepEqual(normalizeSettings({ profile: "__proto__", opacity: Infinity }), { profile: "balanced", opacity: 85 });
  assert.deepEqual(normalizeSettings({ profile: "sharp", opacity: 72 }), { profile: "sharp", opacity: 70 });
});

test("merges graphics options without replacing unrelated keybindings", () => {
  const saved = "renderDistance:12\r\nlang:ga_IE\r\ntouchControlOpacity:1\r\nkey_key.forward:17\r\n";
  const result = mergeOptions(saved, { profile: "battery", opacity: 55 });
  const options = Object.fromEntries(result.trim().split("\n").map(line => line.split(":")));
  assert.equal(options.lang, "ga_IE");
  assert.equal(options["key_key.forward"], "17");
  assert.equal(options.renderDistance, "3");
  assert.equal(options.particles, "2");
  assert.equal(options.touchControlOpacity, "0.55");
  assert.equal(options.enableVsyncEag, "true");
  assert.equal(options.shaders, "false");
  assert.equal(result.match(/renderDistance:/g).length, 1);
});

test("rejects server plugins, malformed ZIPs, and unverified HTML", async () => {
  await assert.rejects(importClient(new File(["test"], "server.jar")), /server JAR/);
  await assert.rejects(importClient(new File(["test"], "fake.html")), /isn’t the supported/);
  await assert.rejects(extractClient(new ArrayBuffer(43)), /could not be read/);
  await assert.rejects(verifyClient(new ArrayBuffer(CLIENT_SIZE)), /isn’t the supported/);
  await assert.rejects(readLimited(new Blob(["too long"]).stream(), 3), /could not be read/);
});

const fixture = process.env.VOXELPAD_FIXTURE;
test("exact user-supplied client: ZIP import, digest, launch adapter and signed body", { skip: !fixture }, async () => {
  const source = await readFile(fixture);
  const bytes = await importClient(new File([source], fixture.endsWith(".zip") ? "fixture.zip" : CLIENT_NAME));
  assert.equal(Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex"), CLIENT_HASH);
  const previous = gzipSync("lang:ga_IE\nrenderDistance:12\n").toString("base64");
  const result = await (await buildGame(bytes, { profile: "balanced", opacity: 70 }, "test-token", previous)).text();
  const original = new TextDecoder().decode(bytes);
  const marker = /<style type="eaglercraft" id="eaglercraftXClient(?:Signature|Bundle)">[^<]+/g;
  assert.deepEqual([...result.matchAll(marker)].map(x => x[0]), [...original.matchAll(marker)].map(x => x[0]));
  assert.match(result, /Content-Security-Policy/);
  assert.match(result, /"dpr":1.5/);
  const compressed = result.match(/"options":"([^"]+)"/)[1];
  const options = gunzipSync(Buffer.from(compressed, "base64")).toString();
  assert.match(options, /lang:ga_IE\n/);
  assert.match(options, /renderDistance:4\n/);
  assert.match(options, /touchControlOpacity:0.7\n/);
});
