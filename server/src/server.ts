import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './managers/RoomManager';
import { GameEngine } from './engine/GameEngine';
import { SocketEvents, GameState, PlayerRole } from '../../shared/types';
import { GAME_CONSTANTS, MAP_OBSTACLES } from '../../shared/constants';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' }, transports: ['websocket'] });

const roomManager = new RoomManager();
const gameEngine = new GameEngine(io, roomManager);
gameEngine.start();

const meetingIntervals = new Map<string, NodeJS.Timeout>();

// دالة فحص التصادم الرياضية الصارمة على الجانب الخلفي من السيرفر
function checkCollision(x: number, y: number, radius: number): boolean {
    for (const obs of MAP_OBSTACLES) {
        const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.height));
        
        const distanceX = x - closestX;
        const distanceY = y - closestY;
        const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
        
        if (distanceSquared < (radius * radius)) {
            return true; // حدث اصطدام حقيقي، يتم الحظر
        }
    }
    return false;
}

function resolveVotes(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    if (meetingIntervals.has(roomCode)) {
        clearInterval(meetingIntervals.get(roomCode)!);
        meetingIntervals.delete(roomCode);
    }

    const voteCounts: Record<string, number> = {};
    let skipCount = 0;

    room.players.forEach(p => {
        if (p.hasVoted && p.votedFor) {
            if (p.votedFor === 'skip') skipCount++;
            else voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
        }
    });

    let maxVotes = skipCount;
    let ejectedId = 'skip';
    let isTie = false;

    for (const [id, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; ejectedId = id; isTie = false; } 
        else if (count === maxVotes && maxVotes > 0) { isTie = true; }
    }

    let reportMsg = "لم يتم طرد أحد بسبب تخطي التصويت أو التعادل!";
    if (!isTie && ejectedId !== 'skip') {
        const victim = room.players.find(p => p.id === ejectedId);
        if (victim) {
            victim.isAlive = false;
            victim.role = victim.role === PlayerRole.IMPOSTOR ? PlayerRole.GHOST_IMPOSTOR : PlayerRole.GHOST_CREWMATE;
            reportMsg = "تم قذف " + victim.name + " في الفضاء الخارجي الحارق!";
        }
    }

    const aliveImpostors = room.players.filter(p => p.isAlive && p.role === PlayerRole.IMPOSTOR).length;
    const aliveCrewmates = room.players.filter(p => p.isAlive && p.role === PlayerRole.CREWMATE).length;

    if (aliveImpostors === 0) {
        room.gameState = GameState.ENDED;
        io.to(roomCode).emit(SocketEvents.SERVER_GAME_OVER, { winner: 'CREWMATES', text: reportMsg + " فاز الأبرياء وطاقم السفينة بالكامل! 🎉" });
        return;
    } else if (aliveImpostors >= aliveCrewmates) {
        room.gameState = GameState.ENDED;
        io.to(roomCode).emit(SocketEvents.SERVER_GAME_OVER, { winner: 'IMPOSTORS', text: reportMsg + " فاز الـ Impostors والمخادعون ونجحت المؤامرة! 😈" });
        return;
    }

    room.gameState = GameState.PLAYING;
    room.players.forEach(p => {
        // نقطة رسبنة آمنة (1000, 700) داخل الكافتيريا وبعيدة تماماً عن الطاولة لئلا يعلق اللاعبون
        p.position = { x: 1000, y: 700 };
        p.hasVoted = false;
        p.votedFor = null;
        if (p.role === PlayerRole.IMPOSTOR) p.lastKillTime = Date.now();
    });

    io.to(roomCode).emit(SocketEvents.SERVER_CHAT_RECEIVE, { senderName: 'النظام', senderColor: '#ffaa00', text: reportMsg });
    gameEngine.broadcastRoomUpdate(roomCode);
}

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
        
        // إجبار نقطة رسبنة آمنة للجميع عند أول رسبنة في المباراة لمنع التعليق
        room.players.forEach(p => { 
            p.position = { x: 1000, y: 700 };
            if(p.role === PlayerRole.IMPOSTOR) p.lastKillTime = Date.now(); 
        });
        
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

  socket.on(SocketEvents.CLIENT_REPORT_BODY, (payload: { roomCode: string }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.PLAYING) {
        const reporter = room.players.find(p => p.socketId === socket.id);
        if (reporter && reporter.isAlive) {
            room.gameState = GameState.MEETING;
            room.meetingTimer = room.settings.votingTimeSeconds;
            
            room.players.forEach(p => { p.hasVoted = false; p.votedFor = null; });

            io.to(room.roomCode).emit(SocketEvents.SERVER_CHAT_RECEIVE, { senderName: '🚨 بلاغ', senderColor: '#ff3333', text: "قام اللاعب [" + reporter.name + "] بالتبليغ عن جثة! ابدأوا التصويت الآن وحللوا الموقف." });

            const timerInterval = setInterval(() => {
                const r = roomManager.getRoom(payload.roomCode);
                if (r && r.gameState === GameState.MEETING && r.meetingTimer !== undefined) {
                    r.meetingTimer--;
                    if (r.meetingTimer <= 0) {
                        clearInterval(timerInterval);
                        resolveVotes(payload.roomCode);
                    } else {
                        io.to(r.roomCode).emit(SocketEvents.SERVER_TICK_UPDATE, { players: r.players, gameState: r.gameState, meetingTimer: r.meetingTimer });
                    }
                } else { clearInterval(timerInterval); }
            }, 1000);

            meetingIntervals.set(room.roomCode, timerInterval);
            gameEngine.broadcastRoomUpdate(room.roomCode);
        }
    }
  });

  socket.on(SocketEvents.CLIENT_SEND_CHAT, (payload: { roomCode: string, text: string }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.MEETING) {
        const sender = room.players.find(p => p.socketId === socket.id);
        if (sender) {
            io.to(room.roomCode).emit(SocketEvents.SERVER_CHAT_RECEIVE, { senderName: sender.name, senderColor: sender.color, text: payload.text });
        }
    }
  });

  socket.on(SocketEvents.CLIENT_CAST_VOTE, (payload: { roomCode: string, targetId: string }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.MEETING) {
        const voter = room.players.find(p => p.socketId === socket.id);
        if (voter && voter.isAlive && !voter.hasVoted) {
            voter.hasVoted = true;
            voter.votedFor = payload.targetId;

            const alivePlayers = room.players.filter(p => p.isAlive);
            const totalVoted = alivePlayers.filter(p => p.hasVoted).length;

            if (totalVoted === alivePlayers.length) { resolveVotes(room.roomCode); } 
            else { io.to(room.roomCode).emit(SocketEvents.SERVER_TICK_UPDATE, { players: room.players, gameState: room.gameState, meetingTimer: room.meetingTimer }); }
        }
    }
  });

  socket.on(SocketEvents.CLIENT_KILL, (payload: { roomCode: string, targetId: string }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.PLAYING) {
        const killer = room.players.find(p => p.socketId === socket.id);
        const victim = room.players.find(p => p.id === payload.targetId);

        if (killer && victim && killer.role === PlayerRole.IMPOSTOR && killer.isAlive && victim.isAlive) {
            const now = Date.now();
            const lastKill = killer.lastKillTime || 0;
            const cooldownMs = room.settings.killCooldownSeconds * 1000;

            if (now - lastKill < cooldownMs) return;

            const distance = Math.sqrt(Math.pow(killer.position.x - victim.position.x, 2) + Math.pow(killer.position.y - victim.position.y, 2));
            if (distance > 180) return;

            victim.isAlive = false;
            victim.role = PlayerRole.GHOST_CREWMATE;
            killer.lastKillTime = now;

            io.to(room.roomCode).emit(SocketEvents.SERVER_TICK_UPDATE, { players: room.players, gameState: room.gameState });
        }
    }
  });

  socket.on(SocketEvents.CLIENT_MOVE, (payload: { roomCode: string, vec: { x: number, y: number } }) => {
    const room = roomManager.getRoom(payload.roomCode);
    if (room && room.gameState === GameState.PLAYING) {
        const player = room.players.find(p => p.socketId === socket.id);
        if (player && player.isAlive) {
            const speed = GAME_CONSTANTS.BASE_SPEED * room.settings.playerSpeedMultiplier;
            
            const nextX = player.position.x + payload.vec.x * speed;
            const nextY = player.position.y + payload.vec.y * speed;

            // تطبيق منطق تفكيك محاور الحركة (الانزلاق الاحترافي) عند الاصطدام بالعوائق
            if (!checkCollision(nextX, player.position.y, GAME_CONSTANTS.PLAYER_RADIUS)) {
                player.position.x = nextX;
            }
            if (!checkCollision(player.position.x, nextY, GAME_CONSTANTS.PLAYER_RADIUS)) {
                player.position.y = nextY;
            }

            if (payload.vec.x > 0) player.direction = 'right';
            if (payload.vec.x < 0) player.direction = 'left';

            // الحفاظ على حدود الخريطة الكبرى الإجمالية
            if (player.position.x < 0) player.position.x = 0;
            if (player.position.x > GAME_CONSTANTS.MAP_WIDTH) player.position.x = GAME_CONSTANTS.MAP_WIDTH;
            if (player.position.y < 0) player.position.y = 0;
            if (player.position.y > GAME_CONSTANTS.MAP_HEIGHT) player.position.y = GAME_CONSTANTS.MAP_HEIGHT;

            io.to(room.roomCode).emit(SocketEvents.SERVER_TICK_UPDATE, { players: room.players, gameState: room.gameState });
        }
    }
  });

  socket.on('disconnect', () => {
    const { roomCode, room } = roomManager.handleDisconnect(socket.id);
    if (roomCode && room) {
        if (room.gameState === GameState.MEETING) {
            const alivePlayers = room.players.filter(p => p.isAlive);
            const totalVoted = alivePlayers.filter(p => p.hasVoted).length;
            if (totalVoted === alivePlayers.length) resolveVotes(roomCode);
        }
        gameEngine.broadcastRoomUpdate(roomCode);
    }
  });
});

httpServer.listen(3000, () => console.log('Server Online on port 3000'));
