// ── Shared message types ───────────────────────────────────────────────────────
// Client → Server

export const CLIENT_MSG = /** @type {const} */ ({
  JOIN: 'JOIN',
  PLAYER_UPDATE: 'PLAYER_UPDATE',
  ADMIN_SET_TIME: 'ADMIN_SET_TIME',
})

// Server → Client

export const SERVER_MSG = /** @type {const} */ ({
  WORLD_SNAPSHOT: 'WORLD_SNAPSHOT',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
})

/**
 * @typedef {{ type: 'JOIN'; userId: string; username: string }} JoinMsg
 * @typedef {{ type: 'PLAYER_UPDATE'; userId: string; x: number; y: number; z: number; health: number }} PlayerUpdateMsg
 * @typedef {{ type: 'ADMIN_SET_TIME'; timeScale: number; paused?: boolean }} AdminSetTimeMsg
 * @typedef {JoinMsg | PlayerUpdateMsg | AdminSetTimeMsg} ClientMsg
 *
 * @typedef {{ userId: string; username: string; x: number; y: number; z: number; health: number }} RemotePlayer
 * @typedef {{ x: number; y: number; z: number; id: number }} RemoteNpc
 *
 * @typedef {{
 *   type: 'WORLD_SNAPSHOT';
 *   simTime: number;
 *   epoch: string;
 *   timeScale: number;
 *   paused: boolean;
 *   players: RemotePlayer[];
 *   npcs: RemoteNpc[];
 * }} WorldSnapshotMsg
 *
 * @typedef {{ type: 'PLAYER_JOINED'; player: RemotePlayer }} PlayerJoinedMsg
 * @typedef {{ type: 'PLAYER_LEFT'; userId: string }} PlayerLeftMsg
 * @typedef {WorldSnapshotMsg | PlayerJoinedMsg | PlayerLeftMsg} ServerMsg
 */
