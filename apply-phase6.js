const fs = require('fs');
const path = require('path');

// دالة مساعدة لإنشاء المجلدات والكتابة الآمنة داخلها
function updateFile(relativePath, content) {
    const fullPath = path.join(__dirname, relativePath);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content.trim(), 'utf8');
    console.log(`[✔] تم تحديث وإنشاء الملف بنجاح: ${relativePath}`);
}

console.log('--- جاري بدء تحديث المشروع للمرحلة السادسة تلقائياً ---');

// 1. تحديث ملف shared/types.ts
updateFile('shared/types.ts', `
export enum GameState {
  LOBBY = 'LOBBY',
  STARTING = 'STARTING',
  PLAYING = 'PLAYING',
  MEETING = 'MEETING',
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
  lastKillTime?: number;
  hasVoted?: boolean;
  votedFor?: string | null;
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
  meetingTimer?: number;
}

export const SocketEvents = {
  CLIENT_CREATE_ROOM: 'c_create_room',
  CLIENT_JOIN_CODE: 'c_join_code',
  CLIENT_JOIN_RANDOM: 'c_join_random',
  CLIENT_UPDATE_SETTINGS: 'c_update_settings',
  CLIENT_START_GAME: 'c_start_game',
  CLIENT_MOVE: 'c_move',
  CLIENT_KILL: 'c_kill',
  CLIENT_REPORT_BODY: 'c_report_body',
  CLIENT_SEND_CHAT: 'c_send_chat',
  CLIENT_CAST_VOTE: 'c_cast_vote',
  CLIENT_LEAVE: 'c_leave',
  SERVER_ROOM_UPDATED: 's_room_updated',
  SERVER_ERROR: 's_error',
  SERVER_JOIN_SUCCESS: 's_join_success',
  SERVER_TICK_UPDATE: 's_tick',
  SERVER_CHAT_RECEIVE: 's_chat_recv',
  SERVER_GAME_OVER: 's_game_over'
};
`);

// 2. تحديث ملف client/index.html
updateFile('client/index.html', `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Among Us Web</title>
    <link rel="stylesheet" href="./src/style.css">
</head>
<body>
    <div id="app">
        <div id="menuContainer" class="menu-container">
            <h1 class="game-title">AMONG US</h1>
            <div class="input-group">
                <label for="playerName" class="label-title">اسم اللاعب:</label>
                <input type="text" id="playerName" placeholder="أدخل اسمك هنا..." maxlength="14">
            </div>
            <div class="actions-group">
                <button id="btnCreate" class="btn btn-host">إنشاء غرفة (Host)</button>
                <div class="join-box">
                    <input type="text" id="roomCode" placeholder="كود" maxlength="6">
                    <button id="btnJoinCode" class="btn btn-join">انضمام</button>
                </div>
                <button id="btnJoinRandom" class="btn btn-public">غرفة عشوائية</button>
            </div>
            <div id="errorMessage" class="error-msg hidden"></div>
        </div>

        <div id="lobbyScreen" class="lobby-screen menu-container hidden">
            <h2>غرفة: <span id="displayRoomCode" style="color: #00ffff;">------</span></h2>
            <div class="status-indicator">بانتظار المضيف لبدء المباراة...</div>
            <h3>اللاعبون المتصلون:</h3>
            <ul id="playersList"></ul>
            <button id="btnStartGame" class="btn btn-host hidden" style="margin-top: 20px;">بدء المباراة 🚀</button>
        </div>

        <div id="roleScreen" class="role-screen hidden">
            <div class="role-content">
                <h1 id="roleTitle" class="role-title">SHHH!</h1>
                <p id="roleSubtitle" class="role-subtitle">تم تحديد دورك السرّي</p>
            </div>
        </div>

        <div id="meetingOverlay" class="meeting-overlay hidden">
            <div class="meeting-box">
                <h2 class="meeting-title">🚨 اجتماع طوارئ / بلاغ جثة 🚨</h2>
                <div id="meetingTimer" class="meeting-timer">الوقت المتبقي للتصويت: -- ثانية</div>
                
                <div class="meeting-layout">
                    <div class="players-voting-grid" id="playersVotingGrid"></div>
                    
                    <div class="meeting-chat-box">
                        <div class="chat-logs" id="chatLogs"></div>
                        <div class="chat-input-area">
                            <input type="text" id="chatInput" placeholder="اكتب تظلمك أو اتهامك هنا..." maxlength="60">
                            <button id="btnSendChat" class="btn-send">إرسال</button>
                        </div>
                    </div>
                </div>
                <button id="btnSkipVote" class="btn-skip">تخطي التصويت (Skip Vote)</button>
            </div>
        </div>

        <div id="gameScreen" class="game-screen hidden">
            <canvas id="gameCanvas"></canvas>
            
            <div id="joystickZone" class="joystick-zone">
                <div class="joystick-base">
                    <div id="joystickKnob" class="joystick-knob"></div>
                </div>
            </div>

            <div id="actionZone" class="action-zone">
                <button id="btnKill" class="btn-action btn-kill hidden" disabled>
                    <span class="action-text">KILL</span>
                    <span id="killCooldownTimer" class="cooldown-overlay"></span>
                </button>
                <button id="btnReport" class="btn-action btn-report hidden" disabled>
                    <span class="action-text">REPORT</span>
                </button>
            </div>
        </div>
    </div>
    <script type="module" src="./src/index.ts"></script>
</body>
</html>
`);

// 3. تحديث ملف client/src/style.css
updateFile('client/src/style.css', `
body {
    background-color: #05070a; color: #ffffff;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 0; padding: 0; display: flex; justify-content: center; align-items: center;
    height: 100vh; overflow: hidden; user-select: none; -webkit-user-select: none;
}
.menu-container {
    background: rgba(15, 22, 33, 0.98); padding: 25px; border-radius: 16px;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.9); border: 3px solid #2d3748; width: 340px; text-align: center; z-index: 10;
}
.game-title { color: #ff3333; font-size: 2.5rem; margin: 0 0 20px 0; text-shadow: 3px 3px 0px #000; }
.label-title { display: block; margin-bottom: 6px; text-align: right; color: #a0aec0; font-weight: bold; }
input {
    width: 100%; padding: 12px; box-sizing: border-box; background: #000;
    border: 2px solid #4a5568; color: #fff; border-radius: 8px; font-size: 1rem; text-align: center;
}
input:focus { border-color: #ff3333; outline: none; }
.btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: bold; cursor: pointer; margin-bottom: 10px; }
.btn-host { background: #38a169; color: white; }
.btn-join { background: #3182ce; color: white; }
.btn-public { background: #dd6b20; color: white; margin-bottom: 0; }
.join-box { display: flex; gap: 8px; margin-bottom: 10px; }
.join-box input { width: 60%; }
.join-box button { width: 40%; margin-bottom: 0; }
.error-msg { color: #ff3333; background: rgba(255, 51, 51, 0.1); padding: 8px; border-radius: 6px; margin-top: 12px; border: 1px solid #ff3333; }
.hidden { display: none !important; }
#playersList { list-style: none; padding: 0; text-align: right; }
#playersList li { padding: 8px; background: rgba(0, 0, 0, 0.5); margin-bottom: 6px; border-radius: 6px; border-right: 5px solid #fff; }

.role-screen { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: center; z-index: 100; background-color: #000000; animation: fadeInBackground 0.5s ease-out forwards; }
.role-screen.impostor-theme { box-shadow: inset 0 0 150px rgba(255, 0, 0, 0.6); }
.role-screen.crewmate-theme { box-shadow: inset 0 0 150px rgba(0, 191, 255, 0.4); }
.role-content { text-align: center; }
.role-title { font-size: 4rem; font-weight: 900; letter-spacing: 4px; margin: 0; text-shadow: 0 0 20px rgba(0,0,0,0.8); animation: scalePop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
.impostor-text { color: #ff3333; }
.crewmate-text { color: #00bfff; }
.role-subtitle { font-size: 1.4rem; color: #cbd5e0; margin-top: 15px; font-weight: 500; }

.game-screen { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; }
canvas { display: block; width: 100%; height: 100%; }

.joystick-zone { position: absolute; bottom: 40px; left: 40px; width: 120px; height: 120px; display: flex; justify-content: center; align-items: center; z-index: 20; }
.joystick-base { width: 100px; height: 100px; background: rgba(255, 255, 255, 0.15); border: 2px solid rgba(255, 255, 255, 0.4); border-radius: 50%; display: flex; justify-content: center; align-items: center; touch-action: none; }
.joystick-knob { width: 45px; height: 45px; background: rgba(255, 255, 255, 0.7); border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.5); touch-action: none; }

.action-zone { position: absolute; bottom: 45px; right: 45px; display: flex; flex-direction: column; gap: 15px; z-index: 20; }
.btn-action { position: relative; width: 85px; height: 85px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.6); font-weight: 900; font-size: 1.0rem; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 6px 12px rgba(0,0,0,0.6); overflow: hidden; outline: none; touch-action: none; }
.btn-kill { background: linear-gradient(135deg, #8a0000 0%, #ff1a1a 100%); color: #fff; text-shadow: 1px 1px 2px #000; }
.btn-kill:disabled { background: #2a1010; border-color: rgba(255,255,255,0.2); color: rgba(255, 255, 255, 0.3); }
.cooldown-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; font-size: 1.3rem; color: #ff8888; font-weight: bold; }
.btn-report { background: linear-gradient(135deg, #cc7a00 0%, #ffaa00 100%); color: white; text-shadow: 1px 1px 2px #000; }
.btn-report:disabled { background: #2b1f0d; border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.2); cursor: not-allowed; }
.action-text { pointer-events: none; }

/* تصميم لوحة شاشة اجتماع الطوارئ المتقدمة للهواتف */
.meeting-overlay {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(5, 8, 15, 0.95); z-index: 200; display: flex; justify-content: center; align-items: center;
}
.meeting-box {
    background: #111622; width: 90%; height: 90%; border-radius: 16px; border: 3px solid #4a5568;
    display: flex; flex-direction: column; padding: 20px; box-sizing: border-box;
}
.meeting-title { text-align: center; color: #ffcc00; margin: 0 0 5px 0; font-size: 1.8rem; text-shadow: 2px 2px 0 #000; }
.meeting-timer { text-align: center; color: #cbd5e0; margin-bottom: 15px; font-weight: bold; font-size: 1.1rem; }
.meeting-layout { flex: 1; display: flex; gap: 20px; overflow: hidden; margin-bottom: 15px; }

.players-voting-grid { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; overflow-y: auto; padding-right: 5px; }
.vote-card {
    background: #1a2234; border: 2px solid #2d3748; border-radius: 10px; padding: 14px;
    display: flex; justify-content: space-between; align-items: center; color: #fff; cursor: pointer;
    font-weight: bold; font-size: 1.1rem; transition: transform 0.1s;
}
.vote-card.voted { border-color: #38a169; background: #13201a; }
.vote-card.dead { opacity: 0.4; cursor: not-allowed; border-color: #e53e3e; background: #221212; }

.meeting-chat-box { width: 340px; background: #080c14; border-radius: 10px; border: 2px solid #2d3748; display: flex; flex-direction: column; overflow: hidden; }
.chat-logs { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; text-align: right; }
.chat-msg { font-size: 1rem; line-height: 1.4; word-break: break-word; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 6px; }
.chat-input-area { display: flex; border-top: 2px solid #2d3748; }
.chat-input-area input { flex: 1; border: none; border-radius: 0; background: #000; text-align: right; padding: 14px; color: #fff; font-size: 1rem; }
.btn-send { background: #3182ce; color: #fff; border: none; padding: 0 20px; font-weight: bold; cursor: pointer; font-size: 1rem; }

.btn-skip { background: #4a5568; color: #fff; border: none; padding: 14px; border-radius: 8px; font-weight: bold; cursor: pointer; align-self: center; width: 240px; font-size: 1.1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
.btn-skip:active { transform: scale(0.98); }

@keyframes fadeInBackground { from { opacity: 0; } to { opacity: 1; } }
@keyframes scalePop { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
`);

// 4. تحديث ملف client/src/index.ts
updateFile('client/src/index.ts', `
import './style.css';
import { network } from './network/NetworkManager';
import { InputHandler } from './game/InputHandler';
import { Room, GameState, Player, SocketEvents, PlayerRole } from '../../shared/types';
import { GAME_CONSTANTS } from '../../shared/constants';

let currentRoom: Room | null = null;
let myPlayerId: string | null = null;
let gameActive = false;
let allowMovement = false;

const inputHandler = new InputHandler();

const menuContainer = document.getElementById('menuContainer') as HTMLDivElement;
const lobbyScreen = document.getElementById('lobbyScreen') as HTMLDivElement;
const gameScreen = document.getElementById('gameScreen') as HTMLDivElement;
const roleScreen = document.getElementById('roleScreen') as HTMLDivElement;
const meetingOverlay = document.getElementById('meetingOverlay') as HTMLDivElement;

const roleTitle = document.getElementById('roleTitle') as HTMLHeadingElement;
const roleSubtitle = document.getElementById('roleSubtitle') as HTMLParagraphElement;
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const btnKill = document.getElementById('btnKill') as HTMLButtonElement;
const btnReport = document.getElementById('btnReport') as HTMLButtonElement;
const killCooldownTimer = document.getElementById('killCooldownTimer') as HTMLSpanElement;
const meetingTimer = document.getElementById('meetingTimer') as HTMLDivElement;
const playersVotingGrid = document.getElementById('playersVotingGrid') as HTMLDivElement;
const chatLogs = document.getElementById('chatLogs') as HTMLDivElement;
const chatInput = document.getElementById('chatInput') as HTMLInputElement;
const btnSendChat = document.getElementById('btnSendChat') as HTMLButtonElement;
const btnSkipVote = document.getElementById('btnSkipVote') as HTMLButtonElement;

const playerNameInput = document.getElementById('playerName') as HTMLInputElement;
const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
const btnCreate = document.getElementById('btnCreate') as HTMLButtonElement;
const btnJoinCode = document.getElementById('btnJoinCode') as HTMLButtonElement;
const btnJoinRandom = document.getElementById('btnJoinRandom') as HTMLButtonElement;
const btnStartGame = document.getElementById('btnStartGame') as HTMLButtonElement;
const displayRoomCode = document.getElementById('displayRoomCode') as HTMLSpanElement;
const playersList = document.getElementById('playersList') as HTMLUListElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

btnCreate.addEventListener('click', () => { const n = playerNameInput.value.trim(); if(n) network.createRoom(n); });
btnJoinCode.addEventListener('click', () => { const n = playerNameInput.value.trim(); const c = roomCodeInput.value.trim().toUpperCase(); if(n && c) network.joinByCode(n, c); });
btnJoinRandom.addEventListener('click', () => { const n = playerNameInput.value.trim(); if(n) network.joinRandom(n); });

btnStartGame.addEventListener('click', () => {
    if(currentRoom) (network as any).socket?.emit(SocketEvents.CLIENT_START_GAME, { roomCode: currentRoom.roomCode });
});

btnKill.addEventListener('click', () => {
    if (!currentRoom || !myPlayerId || btnKill.disabled) return;
    const me = currentRoom.players.find(p => p.id === myPlayerId);
    if (!me || me.role !== PlayerRole.IMPOSTOR || !me.isAlive) return;

    const targets = currentRoom.players.filter(p => p.id !== myPlayerId && p.isAlive && p.role === PlayerRole.CREWMATE);
    let closestTarget: Player | null = null;
    let minDistance = 150;

    targets.forEach(t => {
        const dist = Math.sqrt(Math.pow(me.position.x - t.position.x, 2) + Math.pow(me.position.y - t.position.y, 2));
        if (dist < minDistance) { minDistance = dist; closestTarget = t; }
    });

    if (closestTarget) {
        (network as any).socket?.emit(SocketEvents.CLIENT_KILL, { roomCode: currentRoom.roomCode, targetId: (closestTarget as Player).id });
    }
});

btnReport.addEventListener('click', () => {
    if (currentRoom && myPlayerId && !btnReport.disabled) {
        (network as any).socket?.emit(SocketEvents.CLIENT_REPORT_BODY, { roomCode: currentRoom.roomCode });
    }
});

btnSendChat.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (text && currentRoom) {
        (network as any).socket?.emit(SocketEvents.CLIENT_SEND_CHAT, { roomCode: currentRoom.roomCode, text: text });
        chatInput.value = '';
    }
});

btnSkipVote.addEventListener('click', () => {
    if (currentRoom && myPlayerId) {
        (network as any).socket?.emit(SocketEvents.CLIENT_CAST_VOTE, { roomCode: currentRoom.roomCode, targetId: 'skip' });
    }
});

network.onJoinSuccessCallback = (roomCode, playerId) => {
    myPlayerId = playerId;
    menuContainer.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    displayRoomCode.innerText = roomCode;
};

network.onRoomUpdateCallback = (room: Room) => {
    currentRoom = room;
    if (room.gameState === GameState.STARTING && !gameActive) triggerRoleReveal(room);
    if (room.gameState === GameState.PLAYING && !gameActive) startGameLoop();

    // فرز وعرض واجهة شاشة الاجتماعات التزامنية والدردشة
    if (room.gameState === GameState.MEETING) {
        allowMovement = false;
        meetingOverlay.classList.remove('hidden');
        if (room.meetingTimer !== undefined) {
            meetingTimer.innerText = "الوقت المتبقي للتصويت: " + room.meetingTimer + " ثانية";
        }
        renderVotingGrid(room);
    } else {
        meetingOverlay.classList.add('hidden');
    }

    playersList.innerHTML = '';
    room.players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p.name + (room.hostId === p.id ? ' 👑' : '') + (!p.isAlive ? ' 💀 (ميت)' : '');
        li.style.borderRightColor = p.color;
        playersList.appendChild(li);
    });

    if (room.hostId === myPlayerId && room.gameState === GameState.LOBBY) {
        btnStartGame.classList.remove('hidden');
    } else {
        btnStartGame.classList.add('hidden');
    }
};

network.onErrorCallback = (msg) => { errorMessage.innerText = msg; errorMessage.classList.remove('hidden'); };

function renderVotingGrid(room: Room) {
    playersVotingGrid.innerHTML = '';
    const me = room.players.find(p => p.id === myPlayerId);

    room.players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'vote-card' + (!p.isAlive ? ' dead' : '') + (p.hasVoted ? ' voted' : '');
        card.style.borderRight = '6px solid ' + p.color;
        
        let txt = p.name;
        if (!p.isAlive) txt += ' 💀 (تصفية)';
        else if (p.hasVoted) txt += ' ✅ (صوّت)';
        card.innerText = txt;

        if (p.isAlive && me && me.isAlive && !me.hasVoted) {
            card.addEventListener('click', () => {
                (network as any).socket?.emit(SocketEvents.CLIENT_CAST_VOTE, { roomCode: room.roomCode, targetId: p.id });
            });
        }
        playersVotingGrid.appendChild(card);
    });
}

function triggerRoleReveal(room: Room) {
    gameActive = true; 
    lobbyScreen.classList.add('hidden');
    roleScreen.classList.remove('hidden');
    
    const me = room.players.find(p => p.id === myPlayerId);
    if (!me) return;

    if (me.role === PlayerRole.IMPOSTOR) {
        roleScreen.className = 'role-screen impostor-theme';
        roleTitle.innerText = 'IMPOSTOR';
        roleTitle.className = 'role-title impostor-text';
        roleSubtitle.innerText = 'تسلل واقضِ على الطاقم دون أن يكشفك أحد!';
    } else {
        roleScreen.className = 'role-screen crewmate-theme';
        roleTitle.innerText = 'CREWMATE';
        roleTitle.className = 'role-title crewmate-text';
        roleSubtitle.innerText = 'أنهِ المهام واكشف هوية المخادع المختبئ!';
    }

    setTimeout(() => {
        roleScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        resizeCanvas();
        allowMovement = true;
    }, 4000);

    // الاستماع لشات السيرفر
    (network as any).socket?.on(SocketEvents.SERVER_CHAT_RECEIVE, (msg: { senderName: string, senderColor: string, text: string }) => {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = '<strong style="color:' + msg.senderColor + '">' + msg.senderName + ':</strong> ' + msg.text;
        chatLogs.appendChild(div);
        chatLogs.scrollTop = chatLogs.scrollHeight;
    });

    // الاستماع لنهاية المباراة وإعلان الفوز
    (network as any).socket?.on(SocketEvents.SERVER_GAME_OVER, (data: { winner: string, text: string }) => {
        gameActive = false;
        allowMovement = false;
        alert("انتهت المباراة!\n" + data.text);
        window.location.reload();
    });

    (network as any).socket?.on(SocketEvents.SERVER_TICK_UPDATE, (data: { players: Player[], gameState: GameState, meetingTimer?: number }) => {
        if (currentRoom) {
            currentRoom.players = data.players;
            if (data.gameState) currentRoom.gameState = data.gameState;
            if (data.meetingTimer !== undefined) {
                currentRoom.meetingTimer = data.meetingTimer;
                meetingTimer.innerText = "الوقت المتبقي للتصويت: " + data.meetingTimer + " ثانية";
            }
        }
    });

    requestAnimationFrame(renderLoop);
}

function startGameLoop() {
    gameActive = true; allowMovement = true;
    lobbyScreen.classList.add('hidden'); roleScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
    resizeCanvas(); requestAnimationFrame(renderLoop);
}

function renderLoop() {
    if (!gameActive || !currentRoom || !myPlayerId) return;

    const me = currentRoom.players.find(p => p.id === myPlayerId);

    if (allowMovement && me && me.isAlive && currentRoom.gameState === GameState.PLAYING) {
        const vec = inputHandler.getMovementVector();
        if (vec.x !== 0 || vec.y !== 0) {
            (network as any).socket?.emit(SocketEvents.CLIENT_MOVE, { roomCode: currentRoom.roomCode, vec: vec });
        }
    }

    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cameraX = me ? me.position.x - canvas.width / 2 : 0;
    const cameraY = me ? me.position.y - canvas.height / 2 : 0;

    ctx.strokeStyle = '#1c2431'; ctx.lineWidth = 1; const gridSize = 100;
    for (let x = 0; x < GAME_CONSTANTS.MAP_WIDTH; x += gridSize) { ctx.beginPath(); ctx.moveTo(x - cameraX, 0 - cameraY); ctx.lineTo(x - cameraX, GAME_CONSTANTS.MAP_HEIGHT - cameraY); ctx.stroke(); }
    for (let y = 0; y < GAME_CONSTANTS.MAP_HEIGHT; y += gridSize) { ctx.beginPath(); ctx.moveTo(0 - cameraX, y - cameraY); ctx.lineTo(GAME_CONSTANTS.MAP_WIDTH - cameraX, y - cameraY); ctx.stroke(); }

    // إدارة زر القتل
    if (me && me.role === PlayerRole.IMPOSTOR && me.isAlive && currentRoom.gameState === GameState.PLAYING) {
        btnKill.classList.remove('hidden');
        const now = Date.now();
        const lastKill = me.lastKillTime || 0;
        const cooldownMs = currentRoom.settings.killCooldownSeconds * 1000;
        const timePassed = now - lastKill;

        if (timePassed < cooldownMs) {
            btnKill.disabled = true;
            killCooldownTimer.innerText = Math.ceil((cooldownMs - timePassed) / 1000).toString();
        } else {
            killCooldownTimer.innerText = '';
            const crewmates = currentRoom.players.filter(p => p.id !== myPlayerId && p.isAlive && p.role === PlayerRole.CREWMATE);
            let targetInCloseRange = false;
            crewmates.forEach(c => {
                const dist = Math.sqrt(Math.pow(me.position.x - c.position.x, 2) + Math.pow(me.position.y - c.position.y, 2));
                if (dist <= 150) targetInCloseRange = true;
            });
            btnKill.disabled = !targetInCloseRange;
        }
    } else { btnKill.classList.add('hidden'); }

    // إدارة زر البلاغ التفاعلي (Report) للجميع عند الاقتراب من جثة ميتة
    if (me && me.isAlive && currentRoom.gameState === GameState.PLAYING) {
        btnReport.classList.remove('hidden');
        let closeToBody = false;
        currentRoom.players.forEach(p => {
            if (!p.isAlive) {
                const dist = Math.sqrt(Math.pow(me.position.x - p.position.x, 2) + Math.pow(me.position.y - p.position.y, 2));
                if (dist <= 150) closeToBody = true;
            }
        });
        btnReport.disabled = !closeToBody;
    } else { btnReport.classList.add('hidden'); }

    // رسم اللاعبين
    currentRoom.players.forEach(p => {
        const screenX = p.position.x - cameraX;
        const screenY = p.position.y - cameraY;

        if (p.isAlive) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = (me && !me.isAlive) ? 0.4 : 1.0;
            ctx.beginPath(); ctx.arc(screenX, screenY, 20, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
            ctx.globalAlpha = 1.0;

            if (p.role === PlayerRole.IMPOSTOR && me && me.role === PlayerRole.IMPOSTOR) { ctx.fillStyle = '#ff3333'; } 
            else { ctx.fillStyle = '#ffffff'; }

            ctx.font = 'bold 14px Segoe UI'; ctx.textAlign = 'center';
            ctx.fillText(p.name, screenX, screenY - 30);
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(screenX, screenY + 10, 18, Math.PI, 0, false); ctx.lineTo(screenX + 18, screenY + 18); ctx.lineTo(screenX - 18, screenY + 18); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.fillRect(screenX - 4, screenY - 2, 8, 12);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '12px Segoe UI'; ctx.textAlign = 'center';
            ctx.fillText(p.name + " (جثة)", screenX, screenY - 15);
        }
    });

    requestAnimationFrame(renderLoop);
}
`);

// 5. تحديث ملف server/src/server.ts
updateFile('server/src/server.ts', `
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

const meetingIntervals = new Map<string, NodeJS.Timeout>();

function resolveVotes(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    if (meetingIntervals.has(roomCode)) {
        clearInterval(meetingIntervals.get(roomCode)!);
        meetingIntervals.delete(roomCode);
    }

    const voteCounts: Record<string, number> = {};
    let skipCount = 0;
    const alivePlayers = room.players.filter(p => p.isAlive);

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

    // فحص شروط الفوز الحاسمة (Win Conditions)
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

    // إذا لم تنته اللعبة، يتم تصفير الجثث وإعادة الجميع لمركز الخريطة
    room.gameState = GameState.PLAYING;
    room.players.forEach(p => {
        p.position = { x: 1000, y: 1000 };
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
`);

console.log('--- [نجاح تام] تم تحديث كافة الملفات في ثانية واحدة! ---');
