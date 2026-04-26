import type { NextConfig } from "next";

// Per-worktree dev servers (spawned by bin/start-ticket) bind to a LAN IP
// so other devices can hit them. Without that origin in allowedDevOrigins,
// Next.js blocks the HMR websocket and React doesn't hydrate (see CLAUDE.md).
// LAN_HOST is written into .env.development.local by bin/start-ticket.
const lanHost = process.env.LAN_HOST;
const allowedDevOrigins = ["192.168.50.20", ...(lanHost ? [lanHost] : [])];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  allowedDevOrigins,
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
