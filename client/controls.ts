import type { Input } from "../shared/race.ts";
export const DEFAULT_BINDINGS = {
  throttle: "KeyW",
  brake: "KeyS",
  left: "KeyA",
  right: "KeyD",
  drift: "ShiftLeft",
  boost: "ControlLeft",
  reset: "KeyR",
};
export type Binding = keyof typeof DEFAULT_BINDINGS;
export function readInput(
  keys: Set<string>,
  bindings: typeof DEFAULT_BINDINGS,
): Input {
  const held = (k: Binding, arrow?: string) =>
    keys.has(bindings[k]) || (!!arrow && keys.has(arrow));
  return {
    throttle:
      Number(held("throttle", "ArrowUp")) - Number(held("brake", "ArrowDown")),
    steer:
      Number(held("left", "ArrowLeft")) - Number(held("right", "ArrowRight")),
    drift: held("drift"),
    boost: held("boost"),
    reset: held("reset"),
  };
}
