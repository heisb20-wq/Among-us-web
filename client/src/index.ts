import './style.css';
import { network } from './network/NetworkManager';
import { InputHandler } from './game/InputHandler';
import { Room, GameState, Player, SocketEvents, PlayerRole } from '../../shared/types';
import { GAME_CONSTANTS, MAP_OBSTACLES } from '../../shared/constants';

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

    (network as any).socket?.on(SocketEvents.SERVER_CHAT_RECEIVE, (msg: { senderName: string, senderColor: string, text: string }) => {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = '<strong style="color:' + msg.senderColor + '">' + msg.senderName + ':</strong> ' + msg.text;
        chatLogs.appendChild(div);
        chatLogs.scrollTop = chatLogs.scrollHeight;
    });

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

    // رسم الغرف والجدران والعوائق الصلبة على الخريطة بشكل ديناميكي
    MAP_OBSTACLES.forEach(obs => {
        ctx.fillStyle = obs.color;
        ctx.fillRect(obs.x - cameraX, obs.y - cameraY, obs.width, obs.height);
        
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x - cameraX, obs.y - cameraY, obs.width, obs.height);

        // طباعة أسماء الغرف داخل الهياكل
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.font = 'bold 12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(obs.name, obs.x + obs.width / 2 - cameraX, obs.y + obs.height / 2 - cameraY);
    });

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

    currentRoom.players.forEach(p => {
        const screenX = p.position.x - cameraX;
        const screenY = p.position.y - cameraY;

        if (p.isAlive) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = (me && !me.isAlive) ? 0.4 : 1.0;
            ctx.beginPath(); ctx.arc(screenX, screenY, GAME_CONSTANTS.PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill();
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
