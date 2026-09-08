export type CollisionKind = "wall" | "obstacle" | "kart";

export interface CollisionSoundProfile {
  strength: number;
  bodyFrequency: number;
  bodyGain: number;
  bodyDuration: number;
  contactGain: number;
  contactDuration: number;
  contactLowpass: number;
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
    bodyFrequency: 105 - safeStrength * 45,
    bodyGain: (0.12 + safeStrength * 0.5) * kindScale,
    bodyDuration: 0.09 + safeStrength * 0.13,
    contactGain: (0.035 + safeStrength * 0.13) * kindScale,
    contactDuration: 0.045 + safeStrength * 0.075,
    contactLowpass: 900 + safeStrength * 850,
  };
}
