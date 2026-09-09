const HIGH = Object.freeze({
  smoke: 288,
  sparks: 160,
  combat: 192,
  environment: 128,
  environmentInstances: 8,
  rings: 64,
  skids: 480,
});
const LOW = Object.freeze({
  smoke: 80,
  sparks: 32,
  combat: 64,
  environment: 16,
  environmentInstances: 4,
  rings: 32,
  skids: 256,
});
export const vfxBudget = (quality: string) => (quality === "low" ? LOW : HIGH);
