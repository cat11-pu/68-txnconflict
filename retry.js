// retry.js：重试预算（基线：无限重试、不记轮次）
export function drive(attempts, budget) {
  return { rounds: 0, applied: attempts.map((item) => item.tx), givenUp: [], repeated: 0 };
}
