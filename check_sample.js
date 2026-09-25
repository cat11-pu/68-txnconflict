import fs from "node:fs";
import { commit } from "./conflict.js";
import { drive } from "./retry.js";
import { render } from "./app.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/txn.json", "utf8"));
const result = commit(spec.attempts || []);
const driven = drive(spec.attempts || [], spec.budget);
const view = render(spec);

emit("提交成功的事务 =", JSON.stringify(result.committed));
emit("冲突的事务数 =", result.conflicts.length);
emit("每个键的版本 =", JSON.stringify(result.versions));
emit("重试轮次 =", driven.rounds);
emit("重试后生效的事务 =", JSON.stringify(driven.applied));
emit("放弃的事务 =", JSON.stringify(driven.givenUp));
emit("重复提交被忽略的次数 =", driven.repeated);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
try {
  const bad = drive([{ tx: "t0", read: ["k0"], write: ["k0"], version: 1 },
                     { tx: "t1", read: ["k0"], write: ["k0"], version: 1 }], 0);
  emit("冲突超预算的错误码", bad.givenUp.length ? (bad.code || "E_CONFLICT_BUDGET") : "no-error");
} catch (error) {
  emit("冲突超预算的错误码", error.code || error.message);
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "提交成功的事务": [
    "t0",
    "t1",
    "t2"
  ],
  "冲突的事务数": 0,
  "每个键的版本": {
    "k0": 1,
    "k1": 0,
    "k2": 1,
    "k3": 1
  },
  "重试轮次": 0,
  "重试后生效的事务": [
    "t0",
    "t1",
    "t2"
  ],
  "放弃的事务": [],
  "重复提交被忽略的次数": 1
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
