import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './managers/RoomManager';
import { GameEngine } from './engine/GameEngine';
import { SocketEvents, GameState, PlayerRole } from '../../shared/types';
import { GAME_CONSTANTS } from '../../shared/constants';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' }, transports: ['websocket'] });

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
    if(room && room.hostId === socket.id && room.gameState === GameState.LOBBY) {
        room.gameState = GameState.STARTING;
        roomManager.assignRolesAndPositions(room.roomCode);
        
        // إعداد تصفير عداد القتل الأولي عند انطلاق المباراة لكل القتلة
        room.players.forEach(p => { if(p.role === PlayerRole.IMPOSTOR) p.lastKillTime = Date.now(); });
        
        gameEngine.broadcastRoomUpdate(room.roomCode);

        setTimeout(() => {
            const currentRoom = roomManager.getRoom(payload.roomCode);
            if (currentRoom && currentRoom.gameState === GameState.STARTING) {
                currentRoom.gameState = GameState.PLAYING;
                gameEngine.broadcastRoomUpdate(currentRoom.roomCode);
            }
        }, 4000);
    }
  });

  // استقبال ومعالجة طلب تصفية لاعب بريء (Kill Client Event)
  socket.on(SocketEvents.CLIENT_KILL, (payload: { roomCode: string, targetId: string }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.PLAYING) {
        const killer = room.players.find(p => p.socketId === socket.id);
        const victim = room.players.find(p => p.id === payload.targetId);

        if (killer && victim && killer.role === PlayerRole.IMPOSTOR && killer.isAlive && victim.isAlive) {
            // 1. فحص جدار الحماية والأمن التنازلي للـ Cooldown
            const now = Date.now();
            const lastKill = killer.lastKillTime || 0;
            const cooldownMs = room.settings.killCooldownSeconds * 1000;

            if (now - lastKill < cooldownMs) {
                socket.emit(SocketEvents.SERVER_ERROR, 'زر القتل في مرحلة الشحن، لا يمكن التصفية حالياً!');
                return;
            }

            // 2. التحقق الجغرافي الصارم من مسافة بكسلات اللاعبين لمنع برامج الغش (Distance Check)
            const distance = Math.sqrt(Math.pow(killer.position.x - victim.position.x, 2) + Math.pow(killer.position.y - victim.position.y, 2));
            if (distance > 180) { // مسموح بهامش طفيف 180 بكسل لمراعاة تأخر البنغ والإنترنت بالشبكة
                socket.emit(SocketEvents.SERVER_ERROR, 'الضحية بعيدة جداً عن نطاق سكينك المسموح!');
                return;
            }

            // 3. التنفيذ الفوري للقتل داخل السيرفر وتحديث الهويات
            victim.isAlive = false;
            // تحويل دور الضحية إلى شبح طاقم طائر
            victim.role = PlayerRole.GHOST_CREWMATE;
            
            // إعادة تدوير عداد الـ Cooldown للقاتل من اللحظة الحالية
            killer.lastKillTime = now;

            // بث التحديث الشامل فوراً ليعلم كل الهواتف بوقوع الجريمة ورسم الجثة
            io.to(room.roomCode).emit(SocketEvents.SERVER_TICK_UPDATE, { players: room.players, gameState: room.gameState });
        }
    }
  });

  socket.on(SocketEvents.CLIENT_MOVE, (payload: { roomCode: string, vec: { x: number, y: number } }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.PLAYING) {
        const player = room.players.find(p => p.socketId === socket.id);
        // تمكين اللاعبين الأحياء والأشباح (الموتى) من الحركة بالسيرفر، مع سحب الصلاحيات فقط عند تجميد المباراة
        if (player) {
            const speed = GAME_CONSTANTS.BASE_SPEED * room.settings.playerSpeedMultiplier;
            player.position.x += payload.vec.x * speed;
            player.position.y += payload.vec.y * speed;

            if (payload.vec.x > 0) player.direction = 'right';
            if (payload.vec.x < 0) player.direction = 'left';

            if (player.position.x < 0) player.position.x = 0;
            if (player.position.x > GAME_CONSTANTS.MAP_WIDTH) player.position.x = GAME_CONSTANTS.MAP_WIDTH;
            if (player.position.y < 0) player.position.y = 0;
            if (player.position.y > GAME_CONSTANTS.MAP_HEIGHT) player.position.y = GAME_CONSTANTS.MAP_HEIGHT;

            io.to(room.roomCode).emit(SocketEvents.SERVER_TICK_UPDATE, { players: room.players, gameState: room.gameState });
        }
    }
  });

  socket.on('disconnect', () => {
    const { room } = roomManager.handleDisconnect(socket.id);
    if (room) gameEngine.broadcastRoomUpdate(room.roomCode);
  });
});

httpServer.listen(3000, () => console.log('Server Online on port 3000'));
