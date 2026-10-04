import type { BoatState } from './protocol';

export const WEAPONS = [
  { count: 1, damage: 34, reload: 3, bonus: 0, explosive: false },
  { count: 2, damage: 41, reload: 3, bonus: 20, explosive: false },
  { count: 3, damage: 51, reload: .65, bonus: 50, explosive: false },
  { count: 5, damage: 68, reload: .35, bonus: 100, explosive: true },
] as const;

export function weaponLevel(boat: BoatState | undefined, now: number): number {
  return boat && !boat.ai && boat.powerUntil > now ? Math.max(0, Math.min(3, boat.weaponLevel)) : 0;
}

export function clearWeaponPower(boat: BoatState): void {
  boat.weaponLevel = 0;
  boat.salvoCount = 1;
  boat.powerUntil = 0;
}
