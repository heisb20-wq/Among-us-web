import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './managers/RoomManager';
import { GameEngine } from './engine/GameEngine';
import { SocketEvents, GameState } from '../../shared/types';
import { GAME_CONSTANTS } from '../../shared/constants';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket']
});

const roomManager = new RoomManager();
const gameEngine = new GameEngine(io, roomManager);
gameEngine.start();

io.on('connection', (socket) => {
  socket.on(SocketEvents.CLIENT_CREATE_ROOM, (payload: { playerName: string }) => {
    try {
      const room = roomManager.createRoom(socket.id, payload.playerName);
      socket.join(room.roomCode);
      socket.emit(SocketEvents.SERVER_JOIN_SUCCESS, { roomCode: room.roomCode, playerId: socket.id });
      gameEngine.broadcastRoomUpdate(room.roomCode);
    } catch (e: any) { socket.emit(SocketEvents.SERVER_ERROR, e.message); }
  });

  socket.on(SocketEvents.CLIENT_JOIN_CODE, (payload: { playerName: string, roomCode: string }) => {
    try {
      const room = roomManager.joinRoomByCode(socket.id, payload.playerName, payload.roomCode);
      socket.join(room.roomCode);
      socket.emit(SocketEvents.SERVER_JOIN_SUCCESS, { roomCode: room.roomCode, playerId: socket.id });
      gameEngine.broadcastRoomUpdate(room.roomCode);
    } catch (e: any) { socket.emit(SocketEvents.SERVER_ERROR, e.message); }
  });

  socket.on(SocketEvents.CLIENT_START_GAME, (payload: { roomCode: string }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if(room && room.hostId === socket.id) {
        room.gameState = GameState.PLAYING;
        gameEngine.broadcastRoomUpdate(room.roomCode);
    }
  });

  // استقبال ومعالجة إحداثيات الحركة السريعة لكل لاعب وبثها فوراً (Tick Engine)
  socket.on(SocketEvents.CLIENT_MOVE, (payload: { roomCode: string, vec: { x: number, y: number } }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.PLAYING) {
        const player = room.players.find(p => p.socketId === socket.id);
        if (player && player.isAlive) {
            // حساب السرعة والاتجاه ومراعاة حدود حجم الخريطة (Boundaries)
            const speed = GAME_CONSTANTS.BASE_SPEED * room.settings.playerSpeedMultiplier;
            player.position.x += payload.vec.x * speed;
            player.position.y += payload.vec.y * speed;

            if (payload.vec.x > 0) player.direction = 'right';
            if (payload.vec.x < 0) player.direction = 'left';

            // الحفاظ على اللاعب داخل حدود الخريطة الـ 2000 بكسل
            if (player.position.x < 0) player.position.x = 0;
            if (player.position.x > GAME_CONSTANTS.MAP_WIDTH) player.position.x = GAME_CONSTANTS.MAP_WIDTH;
            if (player.position.y < 0) player.position.y = 0;
            if (player.position.y > GAME_CONSTANTS.MAP_HEIGHT) player.position.y = GAME_CONSTANTS.MAP_HEIGHT;

            // بث إحداثيات الحركة لجميع من في الغرفة فقط بكفاءة عالية
            io.to(room.roomCode).emit(SocketEvents.SERVER_TICK_UPDATE, { players: room.players });
        }
    }
  });

  socket.on('disconnect', () => {
    const { room } = roomManager.handleDisconnect(socket.id);
    if (room) gameEngine.broadcastRoomUpdate(room.roomCode);
  });
});

httpServer.listen(3000, () => console.log('Server Online on port 3000'));
