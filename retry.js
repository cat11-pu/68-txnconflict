// retry.js：带预算上限的重试推进。
// 首轮冲突的事务在后续轮次重读当前版本后再提交；每重试一轮 rounds 加一。
// 同一事务的冲突重试次数超过预算时：剩余事务记入 givenUp，
// 并抛出 code 为 E_CONFLICT_BUDGET 的错误（部分结果挂在 error.result 上），绝不无限重试。
// 同一事务编号重复出现只算一次，重复次数记入 repeated。

import { dedupe, applyBatch } from "./conflict.js";

function refreshReads(items, versions) {
  return items.map((item) => {
    const readKeys = item.read || [];
    let version = Number.isFinite(item.version) ? item.version : 0;
    if (readKeys.length > 0) {
      version = Math.min(...readKeys.map((key) => versions.get(key) || 0));
    }
    return { tx: item.tx, read: readKeys, write: item.write || [], version };
  });
}

function budgetError(rounds, applied, givenUp, repeated, budget) {
  const error = new Error("冲突重试次数超过预算 " + budget);
  error.code = "E_CONFLICT_BUDGET";
  error.result = { rounds, applied, givenUp, repeated };
  return error;
}

export function drive(attempts, budget) {
  const maxRounds = Number.isInteger(budget) && budget >= 0 ? budget : 0;
  const { items, repeated } = dedupe(attempts);
  const versions = new Map();

  const applied = [];
  let rounds = 0;

  // 首轮
  let batch = applyBatch(items, versions);
  applied.push(...batch.committed);
  let pending = batch.conflicts;

  // 后续重试轮
  while (pending.length > 0) {
    if (rounds >= maxRounds) {
      const givenUp = pending.map((item) => item.tx);
      throw budgetError(rounds, applied, givenUp, repeated, maxRounds);
    }
    rounds += 1;
    batch = applyBatch(refreshReads(pending, versions), versions);
    applied.push(...batch.committed);
    pending = batch.conflicts;
  }

  return { rounds, applied, givenUp: [], repeated };
}
