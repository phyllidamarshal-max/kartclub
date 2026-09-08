export type Biome =
  | "coast"
  | "harbor"
  | "desert"
  | "city"
  | "factory"
  | "space"
  | "forest"
  | "ice"
  | "mine";
export interface DrivingZone {
  readonly kind: "boost" | "sand" | "ice";
  readonly start: number;
  readonly end: number;
  readonly lateral: number;
  readonly halfWidth: number;
}
export interface LevelDefinition {
  readonly biome: Biome;
  readonly name: string;
  readonly label: string;
  readonly brief: string;
  readonly landmark: string;
  readonly sky: string;
  readonly horizon: string;
  readonly ground: string;
  readonly road: string;
  readonly accent: string;
  readonly rail: string;
  readonly water: string | null;
  readonly sun: number;
  readonly ambient: number;
  readonly preview: {
    readonly t: number;
    readonly height: number;
    readonly side: number;
    readonly forward: number;
  };
  readonly zones: readonly DrivingZone[];
}
const zone = (
  kind: DrivingZone["kind"],
  start: number,
  end: number,
  halfWidth: number,
  lateral = 0,
): DrivingZone => ({ kind, start, end, halfWidth, lateral });
const definitions: Record<string, LevelDefinition> = {
  coast: {
    biome: "coast",
    name: "晴湾环海",
    label: "海岸",
    brief: "宽弯巡航 · 出弯加速",
    landmark: "灯塔与海岸村庄",
    sky: "#299fce",
    horizon: "#dfebd8",
    ground: "#c2c694",
    road: "#aaa9a2",
    accent: "#d96051",
    rail: "#c9bda0",
    water: "#168997",
    sun: 3.5,
    ambient: 1.8,
    preview: { t: 0.28, height: 20, side: -18, forward: 22 },
    zones: [zone("boost", 0.035, 0.052, 3.4)],
  },
  "coast-harbor": {
    biome: "harbor",
    name: "落日货运港",
    label: "港口",
    brief: "集装箱折返 · 刹车走线",
    landmark: "货轮与巨型龙门吊",
    sky: "#786c9f",
    horizon: "#ffc18a",
    ground: "#88918c",
    road: "#a5a5a5",
    accent: "#f5b650",
    rail: "#475a62",
    water: "#3d7688",
    sun: 2.5,
    ambient: 1.5,
    preview: { t: 0.16, height: 25, side: -27, forward: 25 },
    zones: [zone("boost", 0.04, 0.062, 2.4, -2.5)],
  },
  "coast-breakwater": {
    biome: "desert",
    name: "赤金沙漠",
    label: "沙漠",
    brief: "遗迹连弯 · 避开沙带",
    landmark: "金字塔与砂岩拱门",
    sky: "#48b4cf",
    horizon: "#ffe1a0",
    ground: "#dca65d",
    road: "#d6bc90",
    accent: "#b85336",
    rail: "#b08453",
    water: null,
    sun: 3.7,
    ambient: 1.5,
    preview: { t: 0.12, height: 24, side: -25, forward: 22 },
    zones: [
      zone("sand", 0.2, 0.24, 2.5, -3),
      zone("sand", 0.43, 0.47, 2.5, 3),
      zone("boost", 0.74, 0.76, 2.5),
    ],
  },
  city: {
    biome: "city",
    name: "霓虹街区",
    label: "都市",
    brief: "直角街弯 · 抢占内线",
    landmark: "霓虹商街与城市天际线",
    sky: "#101733",
    horizon: "#626091",
    ground: "#353c51",
    road: "#8b91a3",
    accent: "#eb66ba",
    rail: "#788ba3",
    water: null,
    sun: 1.3,
    ambient: 1.6,
    preview: { t: 0.105, height: 52, side: 28, forward: 34 },
    zones: [zone("boost", 0.035, 0.058, 3), zone("boost", 0.67, 0.69, 2.5)],
  },
  "city-factory": {
    biome: "factory",
    name: "钢铁工厂",
    label: "工厂",
    brief: "管道穿行 · 连续折返",
    landmark: "储罐、烟囱与跨路管道",
    sky: "#65767a",
    horizon: "#d8bea0",
    ground: "#7c7568",
    road: "#a8a5a0",
    accent: "#efb637",
    rail: "#575c5b",
    water: null,
    sun: 2.4,
    ambient: 1.6,
    preview: { t: 0.145, height: 30, side: -26, forward: 28 },
    zones: [zone("boost", 0.035, 0.054, 2.5), zone("sand", 0.8, 0.82, 1.7, 3)],
  },
  "city-nightshift": {
    biome: "space",
    name: "星环空间站",
    label: "太空",
    brief: "悬空弯道 · 连续加速带",
    landmark: "环形空间站与巨型行星",
    sky: "#080d27",
    horizon: "#292d59",
    ground: "#262e4b",
    road: "#b1b9cf",
    accent: "#66e3f0",
    rail: "#5c92b1",
    water: null,
    sun: 2,
    ambient: 1.8,
    preview: { t: 0.11, height: 25, side: -30, forward: 28 },
    zones: [
      zone("boost", 0.025, 0.065, 4),
      zone("boost", 0.35, 0.375, 3.5),
      zone("boost", 0.67, 0.69, 3.5),
    ],
  },
  mountain: {
    biome: "forest",
    name: "巨木森林",
    label: "森林",
    brief: "林间发夹 · 木桥近道",
    landmark: "巨杉、木桥与林间营地",
    sky: "#75ad9a",
    horizon: "#d7ddae",
    ground: "#658a45",
    road: "#b0a284",
    accent: "#daa753",
    rail: "#9a7047",
    water: null,
    sun: 2.3,
    ambient: 1.5,
    preview: { t: 0.105, height: 23, side: -22, forward: 26 },
    zones: [zone("boost", 0.1, 0.12, 2.5)],
  },
  "mountain-pass": {
    biome: "ice",
    name: "极光冰川",
    label: "冰川",
    brief: "冰洞九曲 · 提前收油",
    landmark: "冰晶隧道与雪山",
    sky: "#24477a",
    horizon: "#a7dfec",
    ground: "#dbeaf0",
    road: "#c5e2f2",
    accent: "#5bbde1",
    rail: "#81abc7",
    water: null,
    sun: 2.5,
    ambient: 1.7,
    preview: { t: 0.115, height: 27, side: -28, forward: 26 },
    zones: [
      zone("ice", 0.13, 0.2, 5.7),
      zone("ice", 0.41, 0.48, 5.7),
      zone("ice", 0.72, 0.77, 5.7),
    ],
  },
  "mountain-summit": {
    biome: "mine",
    name: "熔岩矿山",
    label: "矿山",
    brief: "矿洞窄路 · 极限控线",
    landmark: "水晶矿脉、矿架与熔岩",
    sky: "#281e35",
    horizon: "#ac604c",
    ground: "#665355",
    road: "#9b8f8a",
    accent: "#ff9a47",
    rail: "#795944",
    water: "#b33d22",
    sun: 1.8,
    ambient: 1.5,
    preview: { t: 0.115, height: 28, side: -25, forward: 23 },
    zones: [
      zone("boost", 0.035, 0.055, 2.5),
      zone("sand", 0.32, 0.35, 1.5, -2.5),
    ],
  },
};
for (const level of Object.values(definitions)) {
  level.zones.forEach(Object.freeze);
  Object.freeze(level.zones);
  Object.freeze(level.preview);
  Object.freeze(level);
}
export const LEVELS: Readonly<Record<string, LevelDefinition>> =
  Object.freeze(definitions);
const legacy = Object.freeze({
  ...definitions.coast,
  zones: Object.freeze([]),
}) as LevelDefinition;
export function getLevel(id: string): LevelDefinition {
  return LEVELS[id] ?? legacy;
}
export function drivingZoneAt(
  id: string,
  t: number,
  lateral: number,
  branch: "main" | "shortcut" = "main",
): DrivingZone | undefined {
  if (branch !== "main") return undefined;
  return getLevel(id).zones.find(
    (z) =>
      t >= z.start &&
      t <= z.end &&
      Math.abs(lateral - z.lateral) <= z.halfWidth,
  );
}
