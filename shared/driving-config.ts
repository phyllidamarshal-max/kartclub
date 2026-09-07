// Rule snapshot: seconds, radians and world units. All nested groups are immutable.
export const DRIVING_CONFIG = Object.freeze({
  version: "driving-v2",
  tickRate: 60,
  vehicle: Object.freeze({
    maxSpeed: 43,
    acceleration: 22,
    reverseSpeed: 10,
    grip: 10,
    driftGrip: 2.8,
    turnRate: 1.2,
    driftTurnRate: 1.8,
  }),
  drift: Object.freeze({
    minSpeedRatio: 0.35,
    angleMin: (10 * Math.PI) / 180,
    anglePeak: (30 * Math.PI) / 180,
    angleMax: (65 * Math.PI) / 180,
    recoverAngle: (8 * Math.PI) / 180,
    eligibility: 0.25,
    drag: 0.13,
  }),
  energy: Object.freeze({ perSecond: 300, capacity: 100 }),
  nitro: Object.freeze({
    capacity: 2,
    duration: 3,
    maxSpeed: 1.2,
    acceleration: 1.35,
    buffer: 0.15,
  }),
  mini: Object.freeze({
    window: 0.5,
    duration: 0.35,
    maxSpeed: 1.08,
    acceleration: 1.15,
  }),
  reset: Object.freeze({ wait: 1.5, protection: 1 }),
  collision: Object.freeze({ severeImpact: 0.35 }),
});
