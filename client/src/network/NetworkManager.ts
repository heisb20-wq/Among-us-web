import { io, Socket } from 'socket.io-client';
import { SocketEvents, Room } from '../../../shared/types';

export class NetworkManager {
  private socket: Socket | null = null;
  private currentRoomCode: string | null = null;
  private localPlayerId: string | null = null;

  public onRoomUpdateCallback: ((room: Room) => void) | null = null;
  public onErrorCallback: ((errorMessage: string) => void) | null = null;
  public onJoinSuccessCallback: ((roomCode: string, playerId: string) => void) | null = null;

  public connect(serverUrl: string = 'http://localhost:3000'): void {
    if (this.socket) return;
    this.socket = io(serverUrl, { transports: ['websocket'] });
    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.socket) return;
    this.socket.on(SocketEvents.SERVER_JOIN_SUCCESS, (data: { roomCode: string, playerId: string }) => {
      this.currentRoomCode = data.roomCode;
      this.localPlayerId = data.playerId;
      if (this.onJoinSuccessCallback) this.onJoinSuccessCallback(data.roomCode, data.playerId);
    });

    this.socket.on(SocketEvents.SERVER_ROOM_UPDATED, (room: Room) => {
      if (this.onRoomUpdateCallback) this.onRoomUpdateCallback(room);
    });

    this.socket.on(SocketEvents.SERVER_ERROR, (msg: string) => {
      if (this.onErrorCallback) this.onErrorCallback(msg);
    });
  }

  public createRoom(playerName: string): void { this.socket?.emit(SocketEvents.CLIENT_CREATE_ROOM, { playerName }); }
  public joinByCode(playerName: string, roomCode: string): void { this.socket?.emit(SocketEvents.CLIENT_JOIN_CODE, { playerName, roomCode }); }
  public joinRandom(playerName: string): void { this.socket?.emit(SocketEvents.CLIENT_JOIN_RANDOM, { playerName }); }
}

// التصدير الصافي والنهائي للمتغير المستخدم في الواجهة
export const network = new NetworkManager();
