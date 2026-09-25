import assert from "node:assert";
import { commit } from "../conflict.js";
import { drive } from "../retry.js";
import { render } from "../app.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

const attempts = [{ tx: "t0", read: ["k0"], write: ["k0"], version: 1 }];

check("commit returns committed list", () => {
  assert.ok(Array.isArray(commit(attempts).committed));
});

check("commit returns conflicts", () => {
  assert.ok(Array.isArray(commit(attempts).conflicts));
});

check("drive reports rounds", () => {
  assert.strictEqual(typeof drive(attempts, 3).rounds, "number");
});

check("drive reports givenUp", () => {
  assert.ok(Array.isArray(drive(attempts, 3).givenUp));
});

check("render exposes repeated count", () => {
  assert.strictEqual(typeof render({ attempts: attempts, budget: 3 }).repeated, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
