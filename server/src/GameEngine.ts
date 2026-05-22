import { Server } from 'socket.io';
import { RoomManager } from './RoomManager';
import { GAME_CONSTANTS } from './shared/constants';
import { SocketEvents } from './shared/types';

export class GameEngine {
  private io: Server;
  private roomManager: RoomManager;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(io: Server, roomManager: RoomManager) {
    this.io = io;
    this.roomManager = roomManager;
  }

  public start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      // حلقة الـ Tick الدورية 20Hz
    }, GAME_CONSTANTS.TICK_INTERVAL_MS);
  }

  public broadcastRoomUpdate(roomCode: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (room) {
      this.io.to(roomCode).emit(SocketEvents.SERVER_ROOM_UPDATED, room);
    }
  }
}
