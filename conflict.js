// conflict.js：读写集冲突（基线：不检测冲突、全部提交）
export function commit(attempts) {
  const committed = attempts.map((item) => item.tx);
  return { committed: committed, conflicts: [], versions: {} };
}
