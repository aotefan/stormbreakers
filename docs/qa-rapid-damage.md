# Rapid supply and proportional ship damage verification

This revision is local only. No code or default captain name was pushed or deployed.

## Implemented behavior

- Only human captains can collect supplies. AI ignores crates and cannot inherit power after taking over a disconnected human.
- Normal crates grant levels 1/2/3: 2/3/5 projectiles, 41/51/68 damage, and 3/0.65/0.35-second reload. Large orange crates immediately grant level 3. Level 3 projectiles also cause 20 splash damage within 7 units of a direct hit.
- Power lasts 15 seconds; pickups refresh it. Crates expire after 30 seconds and replenish. Expiry, sinking and AI takeover clear power.
- Holding Q/E, either cannon button, or a second finger beside the dragged ship keeps firing. Releasing the firing control stops fire. Pause, blur and touch cancellation clear controls.
- All ships use authoritative HP to drive continuously growing sail holes, scorched materials, hull breaches at impact locations and a list. Partial repair shrinks damage; full repair and respawn restore intact ships. Sinking lists and submerges the ship over five seconds with foam, debris and a spreading wake.
- A bug found during this playthrough was fixed: a joining player now sees the room's authoritative mode in the HUD instead of the mode selected on their own home screen.

## Fresh evidence

The full `npm test` passed after the feature and rematch implementations: build, AI, firepower, rapid supply, abilities, damage rules, touch rules, authoritative state, visual and touch visual. Log: `test-output/rapid-damage/full-tests.log`. The one-line mode-heading correction was rebuilt and then included in the following additional browser run.

`node scripts/rapid-damage-playthrough.mjs` passed in headed Chrome with two independent browser contexts and two idle WebSocket seats. Its isolated server uses `NODE_ENV=test` on port 8796. A test-only existing duel fixture positions the two ships; firing, damage, repair, score, collection and respawn all use normal controls and server simulation.

- An actual hit reduced remote HP to 66. Every ship's damage uniform on both browsers matched `1 - HP / 100`.
- A second hit reduced HP to 32; pressing R repaired to 62 and reduced the visible damage ratio to 0.38.
- Held cannon fire sank the target, granted at least 100 points, and the target respawned after five seconds with 100 HP and cleared wounds.
- Normal mouse dragging collected a naturally generated large crate. Both clients observed level 3 and five-shot salvos. Holding Q and E for 2.15 seconds fired six volleys from each side. Release and blur stopped new volleys.
- In both 390×844 portrait and 844×390 landscape, one finger dragged the ship while another held the right cannon button for three rapid volleys. Releasing just the firing finger stopped fire, and releasing the drag finger stopped movement. There was no overflow or page scrolling.
- The two browsers received identical authoritative snapshots. Buff expiry restored ordinary fire; disconnecting a player restored AI control.
- An additional 18-second hard practice run used actual Q/E controls against AI. Human and AI ships suffered damage; the per-frame check found zero mismatches between HP and rendered damage. Combat included hits, repairs, sinking and respawn. Pause froze simulation and water.
- No page exceptions or console errors were observed.

Full results: `test-output/rapid-damage/browser.json` and `browser.log`. Screenshots: `damage-66.png`, `damage-32.png`, `repaired-62.png`, `sinking.png`, `inferno-live.png`, `touch-portrait.png`, `touch-landscape.png`, and `practice-damage.png`.

The first multi-touch test failed because its CDP command released the dragging finger rather than the firing finger. A minimal pointer-event experiment confirmed this, and the test was corrected to target the firing finger. The final run passed. Mobile coverage is Chrome touch/viewport emulation, not a claim of physical iPhone or iPad testing.

## Library screenshots

- `damage-32.png`: `libfile_8a525a05f4f081918855e2a7accc2be7`
- `repaired-62.png`: `libfile_c264b2082b0881919063e2b808be3d3b`
- `inferno-live.png`: `libfile_d66077df55c481918d80295a7051019d`
- `touch-portrait.png`: `libfile_1cb896eb45a481918b6b62a2162e9d85`
- `touch-landscape.png`: `libfile_e058a5a85c70819198e001eaea17dd88`

Uploaded screenshots use test captain names and contain no default personal nickname. Source code remains local.
