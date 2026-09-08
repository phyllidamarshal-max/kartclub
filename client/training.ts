import type { Car } from "../shared/race.ts";
import { angleDiff } from "../shared/track.ts";
export class Training {
  step = 0;
  private heading: number | null = null;
  readonly hints = [
    "起步与转向：按油门加速，再用方向键转弯",
    "基础漂移：Shift + 方向，保持有效侧滑并集气20点",
    "拉正与小喷：结束漂移拉正，松开再按油门，在提示窗口内小喷",
    "氮气：集满气槽后结束漂移收气，按Ctrl释放",
    "完成一圈：按赛道方向通过检查点并冲线",
    "教学完成！可以挑战计时或与AI竞速",
  ];
  update(c: Car) {
    this.heading ??= c.heading;
    const done = [
      c.speed > 10 && Math.abs(angleDiff(c.heading, this.heading)) > 0.15,
      c.driftTotal >= 20,
      c.miniUses > 0,
      c.nitroUses > 0,
      c.lap >= 1,
    ];
    if (done[this.step]) this.step++;
  }
  get text() {
    return `${Math.min(this.step + 1, 5)}/5 · ${this.hints[this.step]}`;
  }
}
