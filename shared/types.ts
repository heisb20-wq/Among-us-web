export enum GameState {
  LOBBY = 'LOBBY',
  STARTING = 'STARTING',
  PLAYING = 'PLAYING',
  MEETING = 'MEETING',
  VOTING = 'VOTING',
  ENDED = 'ENDED'
}

export enum PlayerRole {
  NONE = 'NONE',
  CREWMATE = 'CREWMATE',
  IMPOSTOR = 'IMPOSTOR',
  GHOST_CREWMATE = 'GHOST_CREWMATE',
  GHOST_IMPOSTOR = 'GHOST_IMPOSTOR'
}

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  socketId: string;
  name: string;
  color: string;
  roomId: string;
  role: PlayerRole;
  isAlive: boolean;
  isConnected: boolean;
  position: Position;
  direction: 'left' | 'right';
  canVote: boolean;
  tasksProgress: number;
  lastKillTime?: number; // تتبع وقت آخر عملية قتل لحساب الـ Cooldown
}

export interface RoomSettings {
  playerSpeedMultiplier: number;
  killCooldownSeconds: number;
  impostorCount: number;
  votingTimeSeconds: number;
}

export interface Room {
  roomCode: string;
  hostId: string;
  players: Player[];
  settings: RoomSettings;
  gameState: GameState;
  createdAt: number;
}

export interface ClientJoinCodePayload {
  playerName: string;
  roomCode: string;
}

export interface ClientUpdateSettingsPayload {
  settings: Partial<RoomSettings>;
}

export const SocketEvents = {
  CLIENT_CREATE_ROOM: 'c_create_room',
  CLIENT_JOIN_CODE: 'c_join_code',
  CLIENT_JOIN_RANDOM: 'c_join_random',
  CLIENT_UPDATE_SETTINGS: 'c_update_settings',
  CLIENT_START_GAME: 'c_start_game',
  CLIENT_MOVE: 'c_move',
  CLIENT_KILL: 'c_kill', // حدث طلب القتل
  CLIENT_LEAVE: 'c_leave',
  SERVER_ROOM_UPDATED: 's_room_updated',
  SERVER_ERROR: 's_error',
  SERVER_JOIN_SUCCESS: 's_join_success',
  SERVER_TICK_UPDATE: 's_tick'
};
