import { World, loadContent } from "./world.ts";
import { TRACKS } from "../shared/track.ts";
import { spawnCar, stepCar, separateCars } from "../shared/race.ts";
import { aiInput } from "../shared/ai.ts";
import { createItems, stepItems, type Item } from "../shared/items.ts";
const result = document.querySelector<HTMLPreElement>("#result")!,
  button = document.querySelector<HTMLButtonElement>("#run")!;
let current: World | null = null;
button.onclick = async () => {
  button.disabled = true;
  const records = [];
  try {
    const content = await loadContent();
    for (const track of TRACKS.filter((t) =>
      ["coast", "city", "mountain", "mountain-summit"].includes(t.id),
    )) {
      current?.dispose();
      const world = new World(
        document.querySelector<HTMLCanvasElement>("#bench-scene")!,
        content,
        track,
      );
      current = world;
      world.setQuality("low");
      world.renderer.setSize(1920, 1080, false);
      world.camera.aspect = 1920 / 1080;
      world.camera.updateProjectionMatrix();
      const cars = Array.from({ length: 8 }, (_, i) => i).map((i) =>
          spawnCar(i, "bench" + i, track),
        ),
        items = createItems(
          cars.map((c) => c.id),
          track,
        );
      cars.forEach(
        (c, i) =>
          (items.players[c.id].held = (
            ["boost", "shield", "missile", "trap"] as Item[]
          )[i % 4]),
      );
      result.textContent = "正在测量 " + track.name + "，请保持页面可见…";
      const stats = await new Promise<{
        fps: number;
        p95: number;
        max: number;
        drawCalls: number;
        throttled: number;
        frames: number;
        viewport: number[];
        renderSize: number[];
      }>((resolve) => {
        let start = 0,
          last = 0,
          acc = 0,
          sim = 0,
          calls = 0,
          throttled = 0;
        const samples: number[] = [];
        function frame(ms: number) {
          if (world.canvas.width !== 1920 || world.canvas.height !== 1080) {
            world.renderer.setSize(1920, 1080, false);
            world.camera.aspect = 1920 / 1080;
            world.camera.updateProjectionMatrix();
          }
          if (!start) {
            start = last = ms;
          }
          const raw = ms - last;
          last = ms;
          acc += Math.min(raw / 1000, 0.06);
          while (acc >= 1 / 60) {
            acc -= 1 / 60;
            sim += 1 / 60;
            const inputs = Object.fromEntries(
              cars.map((c) => [c.id, aiInput(c, track, "hard", sim, cars)]),
            );
            for (const c of cars) stepCar(c, inputs[c.id], 1 / 60, track);
            separateCars(cars, track);
            stepItems(items, cars, inputs, 1 / 60, track);
          }
          world.renderItems(items);
          world.render(
            cars,
            cars[0].id,
            Math.min(raw / 1000, 0.06),
            false,
            raw,
          );
          if (ms - start > 1000 && raw > 0) {
            samples.push(raw);
            calls = Math.max(calls, world.renderer.info.render.calls);
            if (raw > 250) throttled++;
          }
          if (ms - start < 7500) {
            requestAnimationFrame(frame);
            return;
          }
          const sorted = [...samples].sort((a, b) => a - b),
            total = samples.reduce((a, b) => a + b, 0);
          resolve({
            fps: Math.round((samples.length * 10000) / total) / 10,
            p95:
              Math.round(
                (sorted[Math.floor(sorted.length * 0.95)] || 0) * 100,
              ) / 100,
            max: Math.round(Math.max(...samples) * 100) / 100,
            drawCalls: calls,
            throttled,
            frames: samples.length,
            viewport: [innerWidth, innerHeight],
            renderSize: [world.canvas.width, world.canvas.height],
          });
        }
        requestAnimationFrame(frame);
      });
      records.push({
        track: track.id,
        ...stats,
        valid: stats.throttled === 0 && stats.frames > 60,
      });
    }
    result.textContent = JSON.stringify(
      { quality: "low", date: new Date().toISOString(), records },
      null,
      2,
    );
    result.dataset.done = "true";
  } catch (e) {
    result.textContent = String(e);
  } finally {
    button.disabled = false;
  }
};
