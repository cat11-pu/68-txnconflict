// retry.js：带预算上限的重试推进。
// 首轮冲突的事务在后续轮次重新读取当前版本再提交；每重试一轮 rounds 加一。
// 冲突后剩余重试轮次不足预算时，剩余事务记入 givenUp 并报 E_CONFLICT_BUDGET，
// 绝不无限重试。同一事务编号重复出现只算一次（repeated 计数）。

import { dedupe, applyBatch } from "./conflict.js";

export function drive(attempts, budget) {
  const maxRounds = Number.isInteger(budget) && budget >= 0 ? budget : 0;
  const { items, repeated } = dedupe(attempts);
  const versions = new Map();

  const applied = [];
  let pending = items;
  let rounds = 0;

  const first = applyBatch(pending, versions);
  applied.push(...first.committed);
  pending = first.conflicts;

  while (pending.length > 0) {
    if (rounds >= maxRounds) {
      const givenUp = pending.map((item) => item.tx);
      const error = new Error("冲突重试次数超过预算 " + maxRounds);
      error.code = "E_CONFLICT_BUDGET";
      error.result = { rounds, applied, givenUp, repeated };
      throw error;
    }
    rounds += 1;
    // 重新读取读集当前版本（取最低当前版本，任一键再被改都会被下一轮检出）。
    pending = pending.map((item) => {
      const readKeys = item.read || [];
      let version = item.version || 0;
      if (readKeys.length > 0) {
        version = Math.min(...readKeys.map((key) => versions.get(key) || 0));
      }
      return { tx: item.tx, read: readKeys, write: item.write || [], version };
    });
    const next = applyBatch(pending, versions);
    applied.push(...next.committed);
    pending = next.conflicts;
  }

  return { rounds, applied, givenUp: [], repeated };
}
