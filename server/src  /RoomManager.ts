import { Room, Player, GameState, PlayerRole } from './shared/types';
import { GAME_CONSTANTS } from './shared/constants';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  // مصفوفة الألوان الرسمية للعبة أمونج آس لمنحها للاعبين بالترتيب
  private availableColors: string[] = [
    '#c51111', '#132ed1', '#117f2d', '#ed54ba', '#ff7d00',
    '#f6f657', '#3f474e', '#d6e0f0', '#6b2fbb', '#71491e'
  ];

  public createRoom(socketId: string, playerName: string): Room {
    const roomCode = this.generateRoomCode();
    const newPlayer: Player = this.createNewPlayer(socketId, playerName, roomCode, this.availableColors[0]);

    const room: Room = {
      roomCode,
      hostId: socketId,
      players: [newPlayer],
      settings: {
        playerSpeedMultiplier: 1.0,
        killCooldownSeconds: 30,
        impostorCount: 1, // افتراضي قاتل واحد
        votingTimeSeconds: 60
      },
      gameState: GameState.LOBBY,
      createdAt: Date.now()
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  public joinRoomByCode(socketId: string, playerName: string, roomCode: string): Room {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('لم يتم العثور على الغرفة، تحقق من الكود!');
    if (room.gameState !== GameState.LOBBY) throw new Error('المباراة بدأت بالفعل في هذه الغرفة!');
    if (room.players.length >= 10) throw new Error('الغرفة ممتلئة بالكامل! (الحد الأقصى 10)');

    const colorUsed = room.players.map(p => p.color);
    const freeColor = this.availableColors.find(c => !colorUsed.includes(c)) || '#ffffff';

    const newPlayer = this.createNewPlayer(socketId, playerName, roomCode, freeColor);
    room.players.push(newPlayer);
    return room;
  }

  public joinRandom(socketId: string, playerName: string): Room {
    for (const [_, room] of this.rooms) {
      if (room.gameState === GameState.LOBBY && room.players.length < 10) {
        return this.joinRoomByCode(socketId, playerName, room.roomCode);
      }
    }
    return this.createRoom(socketId, playerName);
  }

  // خوارزمية توزيع الأدوار السرية وإعادة ضبط الكاميرات والمواقع للجميع
  public assignRolesAndPositions(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const totalPlayers = room.players.length;
    // التأكد من عدم زيادة عدد القتلة عن عدد اللاعبين الفعليين
    let impostorsNeeded = room.settings.impostorCount;
    if (totalPlayers <= 2) impostorsNeeded = 1; 

    // إعادة تصفير كافة الأدوار والمواقع إلى مركز الخريطة 1000، 1000
    room.players.forEach(p => {
      p.role = PlayerRole.CREWMATE;
      p.isAlive = true;
      p.position = { x: 1000, y: 1000 }; 
    });

    // خلط ترتيب اللاعبين عشوائياً بسحب الخوارزميات الرياضية
    const shuffledPlayers = [...room.players].sort(() => Math.random() - 0.5);
    
    // سحب اللاعبين الأوائل وتعيينهم كـ Impostors
    for (let i = 0; i < impostorsNeeded; i++) {
      const targetPlayer = room.players.find(p => p.id === shuffledPlayers[i].id);
      if (targetPlayer) {
        targetPlayer.role = PlayerRole.IMPOSTOR;
      }
    }
  }

  public handleDisconnect(socketId: string): { roomCode?: string; room?: Room } {
    for (const [roomCode, room] of this.rooms) {
      const index = room.players.findIndex(p => p.socketId === socketId);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          this.rooms.delete(roomCode);
          return {};
        }
        if (room.hostId === socketId && room.players.length > 0) {
          room.hostId = room.players[0].socketId;
        }
        return { roomCode, room };
      }
    }
    return {};
  }

  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  private generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private createNewPlayer(socketId: string, name: string, roomId: string, color: string): Player {
    return {
      id: socketId,
      socketId,
      name,
      color,
      roomId,
      role: PlayerRole.NONE,
      isAlive: true,
      isConnected: true,
      position: { x: 0, y: 0 },
      direction: 'right',
      canVote: true,
      tasksProgress: 0
    };
  }
}
