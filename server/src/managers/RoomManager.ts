import { Room, Player, GameState, PlayerRole, RoomSettings } from '../../../shared/types';
import { GAME_CONSTANTS } from '../../../shared/constants';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  public generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  public createRoom(hostSocketId: string, playerName: string): Room {
    const roomCode = this.generateRoomCode();
    const cleanName = this.validateAndCleanName(playerName);
    
    const hostPlayer: Player = this.createNewPlayer(hostSocketId, hostSocketId, cleanName, roomCode, GAME_CONSTANTS.AVAILABLE_COLORS[0]);
    
    const defaultSettings: RoomSettings = {
      playerSpeedMultiplier: 1.0,
      killCooldownSeconds: 15,
      impostorCount: 1,
      votingTimeSeconds: 45
    };

    const newRoom: Room = {
      roomCode,
      hostId: hostPlayer.id,
      players: [hostPlayer],
      settings: defaultSettings,
      gameState: GameState.LOBBY,
      createdAt: Date.now()
    };

    this.rooms.set(roomCode, newRoom);
    return newRoom;
  }

  public joinRoomByCode(socketId: string, playerName: string, roomCode: string): Room {
    const code = roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) throw new Error('الغرفة غير موجودة، تحقق من الكود المكتوب.');
    if (room.gameState !== GameState.LOBBY) throw new Error('لا يمكن الانضمام، المباراة بدأت بالفعل.');
    if (room.players.length >= GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM) throw new Error('الغرفة ممتلئة بالكامل.');

    const cleanName = this.validateAndCleanName(playerName);
    const usedColors = room.players.map(p => p.color);
    const availableColor = GAME_CONSTANTS.AVAILABLE_COLORS.find(c => !usedColors.includes(c)) || GAME_CONSTANTS.AVAILABLE_COLORS[0];

    const newPlayer = this.createNewPlayer(socketId, socketId, cleanName, code, availableColor);
    room.players.push(newPlayer);
    
    this.autoAdjustImpostorCount(room);
    return room;
  }

  public findRandomAvailableRoom(): Room | null {
    for (const room of this.rooms.values()) {
      if (room.gameState === GameState.LOBBY && room.players.length < GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM) {
        return room;
      }
    }
    return null;
  }

  public handleDisconnect(socketId: string): { room: Room | null; destroyRoom: boolean } {
    for (const room of this.rooms.values()) {
      const playerIndex = room.players.findIndex(p => p.socketId === socketId);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        if (room.gameState === GameState.LOBBY) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            this.rooms.delete(room.roomCode);
            return { room: null, destroyRoom: true };
          }
          if (room.hostId === player.id) {
            room.hostId = room.players[0].id;
          }
          this.autoAdjustImpostorCount(room);
          return { room, destroyRoom: false };
        } else {
          player.isConnected = false;
          return { room, destroyRoom: false };
        }
      }
    }
    return { room: null, destroyRoom: false };
  }

  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  public updateRoomSettings(roomCode: string, hostSocketId: string, newSettings: Partial<RoomSettings>): Room {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('الغرفة غير موجودة.');
    
    const hostPlayer = room.players.find(p => p.socketId === hostSocketId);
    if (!hostPlayer || room.hostId !== hostPlayer.id) throw new Error('صلاحية التعديل للمضيف فقط.');

    if (newSettings.playerSpeedMultiplier !== undefined) room.settings.playerSpeedMultiplier = newSettings.playerSpeedMultiplier;
    if (newSettings.killCooldownSeconds !== undefined) room.settings.killCooldownSeconds = newSettings.killCooldownSeconds;
    if (newSettings.votingTimeSeconds !== undefined) room.settings.votingTimeSeconds = newSettings.votingTimeSeconds;
    if (newSettings.impostorCount !== undefined) {
      room.settings.impostorCount = newSettings.impostorCount;
      this.autoAdjustImpostorCount(room);
    }
    return room;
  }

  private validateAndCleanName(name: string): string {
    if (!name) throw new Error('الاسم لا يمكن أن يكون فارغاً.');
    let clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length < GAME_CONSTANTS.MIN_NAME_LENGTH || clean.length > GAME_CONSTANTS.MAX_NAME_LENGTH) {
      throw new Error('طول الاسم غير مسموح به.');
    }
    return clean.replace(/[<>:"'/\\|?*]/g, '');
  }

  private createNewPlayer(id: string, socketId: string, name: string, roomId: string, color: string): Player {
    return {
      id, socketId, name, color, roomId,
      role: PlayerRole.NONE, isAlive: true, isConnected: true,
      position: { x: GAME_CONSTANTS.MAP_WIDTH / 2, y: GAME_CONSTANTS.MAP_HEIGHT / 2 },
      direction: 'right', canVote: true, tasksProgress: 0
    };
  }

  private autoAdjustImpostorCount(room: Room): void {
    const count = room.players.length;
    let max = 1;
    if (count >= 7 && count <= 10) max = 2;
    else if (count >= 11 && count <= 13) max = 3;
    else if (count >= 14 && count <= 16) max = 4;
    if (room.settings.impostorCount > max) room.settings.impostorCount = max;
  }
}
