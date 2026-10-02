# 破风者 / Stormbreakers

React + TypeScript + Three.js naval battle game with a Node.js authoritative WebSocket server.

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
