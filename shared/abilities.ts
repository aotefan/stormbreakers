import type { BoatState, PlayerInput } from './protocol';

export const ABILITIES = {
  boost: { cooldown: 9, duration: 1.4 },
  repair: { cooldown: 14, healing: 30 },
  supply: { cooldown: 18 },
} as const;

export function canBoost(boat: BoatState, input: PlayerInput): boolean {
  if (input.stop || boat.hp <= 0) return false;
  return Math.abs(input.throttle) > .05
    || !!input.dragTarget && Math.hypot(input.dragTarget.x - boat.x, input.dragTarget.z - boat.z) > 1.3;
}
