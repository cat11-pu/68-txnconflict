// conflict.js：读写集冲突检测（OCC 校验，按键索引版本，O(键数)）
// 冲突规则：
//   1. 读集里任一键的当前版本高于该事务读到时的版本 -> 冲突，本轮不提交；
//   2. 同一轮里已有别的事务提交了某个写键（写-写碰撞，首个提交者获胜）-> 冲突。
// 提交成功的事务把它写的每个键版本加一；同一事务编号只提交一次。

export function dedupe(attempts) {
  const seen = new Set();
  const items = [];
  let repeated = 0;
  for (const item of attempts) {
    if (seen.has(item.tx)) { repeated += 1; continue; }
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

// 推进一轮：把 items 按顺序尝试提交到共享 versions 上。
// 返回 committed（事务编号）与 conflicts（未提交的完整 attempt，供重试）。
export function applyBatch(items, versions) {
  const committed = [];
  const conflicts = [];
  const writtenThisRound = new Set();
  for (const item of items) {
    const readKeys = item.read || [];
    const writeKeys = item.write || [];
    touch(versions, readKeys);
    touch(versions, writeKeys);
    const readVersion = item.version || 0;
    let stale = false;
    for (const key of readKeys) {
      if (versions.get(key) > readVersion) { stale = true; break; }
    }
    if (!stale) {
      for (const key of writeKeys) {
        if (writtenThisRound.has(key)) { stale = true; break; }
      }
    }
    if (stale) { conflicts.push(item); continue; }
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
  for (const key of Array.from(versions.keys()).sort()) out[key] = versions.get(key);
  return out;
}

export function commit(attempts) {
  const { items } = dedupe(attempts);
  const versions = new Map();
  const { committed, conflicts } = applyBatch(items, versions);
  return {
    committed,
    conflicts: conflicts.map((item) => item.tx),
    versions: snapshotVersions(versions)
  };
}
