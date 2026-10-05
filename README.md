# 破风者 / Stormbreakers

React + TypeScript + Three.js naval battle game with a Node.js authoritative WebSocket server.

## Controls and supplies

- WASD sails; hold Q/E or either cannon button for repeated port/starboard fire. On touch, drag your ship and hold a second finger on either half of the sea to fire. Release stops firing; releasing the drag stops the ship.
- Only human players collect floating supplies. Normal crates progress through 2 balls (+20%), 3 balls (+50%, 0.65s reload), then 5 explosive balls (+100%, 0.35s reload). Orange large crates grant maximum power immediately.
- Power lasts 15 seconds; further pickups refresh it. Crates expire and replenish after 30 seconds. Sinking, expiry and AI takeover clear power.
- Every ship shows sail tears, scorched wood and a list proportional to lost health. R repairs 30 HP and restores the corresponding appearance; full repair or respawn restores the intact ship.
- Cannon hits leave localized ragged hull breaches and burnt edges. Sunk ships list and descend over 5 seconds with foam, an expanding wake and floating planks; pause freezes the effect and respawn clears damage.
- Space boosts while sailing (+50% maximum speed for 1.4s, 9s cooldown). F immediately readies both cannons (18s cooldown); R repairs with a 14s cooldown. Buttons show effects, remaining cooldown and unavailable reasons; idle boost, full-health repair and unnecessary reload do not consume cooldowns.
- Solo pause freezes the simulation. Pause, window blur and touch cancellation clear held controls.
- After an online round ends, Play again restarts everyone in the same room with fresh ships, scores and timers. Joining a finished room also starts a new round; joining an active room keeps its current progress.
- Storm Survival uses moving waterspouts with tapered spiral funnels, broad storm-cloud crowns, orbiting mist, rising spray and a sea-surface footprint matching the damage radius. Quality settings limit cloud density; solo pause freezes all storm animation.

## Local

```bash
npm install
npm run build
npm start
```

Open `http://localhost:8787` after `npm start`, or use `npm run dev` for Vite + server development.

## Render Free

Use a Node Web Service.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/healthz`
- The server binds `0.0.0.0:${PORT}` and serves both the built static frontend and `/ws`.
- Public HTTPS pages automatically use `wss://<host>/ws`.

Render Free notes: free web services can spin down after idle time, restart with a cold start, use ephemeral local files, and run as a single instance. The client reconnects WebSocket sessions; active game state is in memory and is reset if the service restarts.
