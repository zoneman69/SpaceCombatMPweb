# Space Combat MP

Multiplayer RTS-in-space prototype using a command-based networking model.

## Structure

- `packages/shared`: shared command and state types
- `packages/server`: Colyseus authoritative simulation server
- `packages/client`: React + Three.js client scaffold

## Getting started

```bash
pnpm install
pnpm dev:server
pnpm dev:client
```

## Client runtime assets

- The tactical client will try to load a fighter model from
  `packages/client/public/assets/models/fighter.glb`.
- If the file is missing or fails to load, the client falls back to the
  procedural fighter mesh.
