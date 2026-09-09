export type CollisionKind = "wall" | "obstacle" | "kart";

export interface CollisionSoundProfile {
  strength: number;
  bodyFrequency: number;
  bodyGain: number;
  bodyDuration: number;
  bodyLowpass: number;
  contactGain: number;
  contactDuration: number;
  contactLowpass: number;
  contactRing: number;
}

export function collisionSoundProfile(
  strength: number,
  kind: CollisionKind,
): CollisionSoundProfile {
  const safeStrength = Number.isFinite(strength)
    ? Math.min(1, Math.max(0, strength))
    : 0;
  const kindScale = kind === "kart" ? 0.82 : 1;
  return {
    strength: safeStrength,
    bodyFrequency:
      kind === "obstacle"
        ? 175 - safeStrength * 65
        : kind === "kart"
          ? 125 - safeStrength * 40
          : 105 - safeStrength * 45,
    bodyGain: (0.12 + safeStrength * 0.5) * kindScale,
    bodyDuration: 0.09 + safeStrength * 0.13,
    bodyLowpass: kind === "obstacle" ? 750 : 320,
    contactGain: (0.09 + safeStrength * 0.3) * kindScale,
    contactDuration:
      kind === "wall"
        ? 0.07 + safeStrength * 0.09
        : kind === "obstacle"
          ? 0.055 + safeStrength * 0.055
          : 0.045 + safeStrength * 0.04,
    contactLowpass:
      (kind === "wall" ? 1800 : kind === "obstacle" ? 1400 : 800) +
      safeStrength * 1100,
    contactRing: kind === "obstacle" ? 680 : kind === "kart" ? 230 : 0,
  };
}
