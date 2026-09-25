// app.js：渲染结果
import { commit } from "./conflict.js";
import { drive } from "./retry.js";

export function render(spec) {
  const result = commit(spec.attempts || []);
  const driven = drive(spec.attempts || [], spec.budget);
  return { committed: result.committed, conflicts: result.conflicts, versions: result.versions,
           rounds: driven.rounds, applied: driven.applied, givenUp: driven.givenUp,
           repeated: driven.repeated };
}
