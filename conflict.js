// conflict.js：读写集冲突检测（乐观并发提交）
// 冲突规则：
//   1. 读集里任一键的当前版本高于该事务读到时的版本 -> 冲突，本轮不提交；
//   2. 同一轮里已有别的事务抢先提交了某个写键（写-写碰撞，先到先得）-> 冲突；
//   3. 同一事务编号重复出现只提交一次（重复次数由 retry.drive 统计）。
// 提交成功的事务把它写的每个键版本加一。版本表用 Map 按键索引，O(读集+写集)。

export function dedupe(attempts) {
  const seen = new Set();
  const items = [];
  let repeated = 0;
  for (const item of attempts) {
    if (seen.has(item.tx)) {
      repeated += 1;
      continue;
    }
    seen.add(item.tx);
    items.push(item);
  }
  return { items, repeated };
}

function touch(versions, keys) {
  for (const key of keys) {
    if (!versions.has(key)) versions.set(key, 0);
  }
}

// 在共享 versions 上顺序推进一轮，返回已提交事务与本轮冲突的 attempt。
export function applyBatch(items, versions) {
  const committed = [];
  const conflicts = [];
  const writtenThisRound = new Set();
  for (const item of items) {
    const readKeys = item.read || [];
    const writeKeys = item.write || [];
    touch(versions, readKeys);
    touch(versions, writeKeys);
    const readVersion = Number.isFinite(item.version) ? item.version : 0;
    let stale = false;
    for (const key of readKeys) {
      if (versions.get(key) > readVersion) {
        stale = true;
        break;
      }
    }
    if (!stale) {
      for (const key of writeKeys) {
        if (writtenThisRound.has(key)) {
          stale = true;
          break;
        }
      }
    }
    if (stale) {
      conflicts.push(item);
      continue;
    }
    for (const key of writeKeys) {
      versions.set(key, versions.get(key) + 1);
      writtenThisRound.add(key);
    }
    committed.push(item.tx);
  }
  return { committed, conflicts };
}

export function snapshotVersions(versions) {
  const out = {};
  for (const key of Array.from(versions.keys()).sort()) {
    out[key] = versions.get(key);
  }
  return out;
}

export function commit(attempts) {
  const { items } = dedupe(attempts);
  const versions = new Map();
  const { committed, conflicts } = applyBatch(items, versions);
  return {
    committed,
    conflicts: conflicts.map((item) => item.tx),
    versions: snapshotVersions(versions),
  };
}
