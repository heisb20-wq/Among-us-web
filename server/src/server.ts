import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './managers/RoomManager';
import { GameEngine } from './engine/GameEngine';
import { SocketEvents, ClientJoinCodePayload, ClientUpdateSettingsPayload } from '../../shared/types';

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

  socket.on(SocketEvents.CLIENT_JOIN_CODE, (payload: ClientJoinCodePayload) => {
    try {
      const room = roomManager.joinRoomByCode(socket.id, payload.playerName, payload.roomCode);
      socket.join(room.roomCode);
      socket.emit(SocketEvents.SERVER_JOIN_SUCCESS, { roomCode: room.roomCode, playerId: socket.id });
      gameEngine.broadcastRoomUpdate(room.roomCode);
    } catch (e: any) { socket.emit(SocketEvents.SERVER_ERROR, e.message); }
  });

  socket.on(SocketEvents.CLIENT_JOIN_RANDOM, (payload: { playerName: string }) => {
    try {
      let room = roomManager.findRandomAvailableRoom() || roomManager.createRoom(socket.id, payload.playerName);
      if (room.players.findIndex(p => p.socketId === socket.id) === -1) {
        room = roomManager.joinRoomByCode(socket.id, payload.playerName, room.roomCode);
      }
      socket.join(room.roomCode);
      socket.emit(SocketEvents.SERVER_JOIN_SUCCESS, { roomCode: room.roomCode, playerId: socket.id });
      gameEngine.broadcastRoomUpdate(room.roomCode);
    } catch (e: any) { socket.emit(SocketEvents.SERVER_ERROR, e.message); }
  });

  socket.on(SocketEvents.CLIENT_UPDATE_SETTINGS, (payload: ClientUpdateSettingsPayload & { roomCode: string }) => {
    try {
      const room = roomManager.updateRoomSettings(payload.roomCode, socket.id, payload.settings);
      gameEngine.broadcastRoomUpdate(room.roomCode);
    } catch (e: any) { socket.emit(SocketEvents.SERVER_ERROR, e.message); }
  });

  socket.on('disconnect', () => {
    const { room } = roomManager.handleDisconnect(socket.id);
    if (room) gameEngine.broadcastRoomUpdate(room.roomCode);
  });
});

httpServer.listen(3000, () => console.log('Server Online on port 3000'));
