import './style.css';
import { network } from './network/NetworkManager';
import { InputHandler } from './game/InputHandler';
import { Room, GameState, Player, SocketEvents } from '../../shared/types';
import { GAME_CONSTANTS } from '../../shared/constants';

let currentRoom: Room | null = null;
let myPlayerId: string | null = null;
let gameActive = false;

const inputHandler = new InputHandler();

// عناصر الواجهة
const menuContainer = document.getElementById('menuContainer') as HTMLDivElement;
const lobbyScreen = document.getElementById('lobbyScreen') as HTMLDivElement;
const gameScreen = document.getElementById('gameScreen') as HTMLDivElement;
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const playerNameInput = document.getElementById('playerName') as HTMLInputElement;
const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
const btnCreate = document.getElementById('btnCreate') as HTMLButtonElement;
const btnJoinCode = document.getElementById('btnJoinCode') as HTMLButtonElement;
const btnJoinRandom = document.getElementById('btnJoinRandom') as HTMLButtonElement;
const btnStartGame = document.getElementById('btnStartGame') as HTMLButtonElement;
const displayRoomCode = document.getElementById('displayRoomCode') as HTMLSpanElement;
const playersList = document.getElementById('playersList') as HTMLUListElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;

// تكييف مساحة الكانفاس لتملأ الشاشة تلقائياً
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

btnCreate.addEventListener('click', () => {
    const n = playerNameInput.value.trim();
    if(n) network.createRoom(n);
});

btnJoinCode.addEventListener('click', () => {
    const n = playerNameInput.value.trim();
    const c = roomCodeInput.value.trim().toUpperCase();
    if(n && c) network.joinByCode(n, c);
});

btnJoinRandom.addEventListener('click', () => {
    const n = playerNameInput.value.trim();
    if(n) network.joinRandom(n);
});

btnStartGame.addEventListener('click', () => {
    if(currentRoom) {
        // إخطار السيرفر ببدء المباراة
        (network as any).socket?.emit(SocketEvents.CLIENT_START_GAME, { roomCode: currentRoom.roomCode });
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
    
    // في حال قام المضيف ببدء اللعبة
    if (room.gameState === GameState.PLAYING && !gameActive) {
        startGameLoop();
    }

    playersList.innerHTML = '';
    room.players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p.name + (room.hostId === p.id ? ' 👑' : '');
        li.style.borderRightColor = p.color;
        playersList.appendChild(li);
    });

    // إظهار زر البدء للمضيف فقط عند وجود لاعبين اثنين على الأقل
    if (room.hostId === myPlayerId && room.gameState === GameState.LOBBY) {
        btnStartGame.classList.remove('hidden');
    } else {
        btnStartGame.classList.add('hidden');
    }
};

network.onErrorCallback = (msg) => {
    errorMessage.innerText = msg;
    errorMessage.classList.remove('hidden');
};

function startGameLoop() {
    gameActive = true;
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    resizeCanvas();

    // الاستماع لتحديثات الاحداثيات السريعة القادمة من السيرفر
    (network as any).socket?.on(SocketEvents.SERVER_TICK_UPDATE, (data: { players: Player[] }) => {
        if (currentRoom) currentRoom.players = data.players;
    });

    requestAnimationFrame(renderLoop);
}

function renderLoop() {
    if (!gameActive || !currentRoom || !myPlayerId) return;

    // 1. حساب حركتي المحلية وإرسالها الفوري للسيرفر
    const vec = inputHandler.getMovementVector();
    if (vec.x !== 0 || vec.y !== 0) {
        (network as any).socket?.emit(SocketEvents.CLIENT_MOVE, {
            roomCode: currentRoom.roomCode,
            vec: vec
        });
    }

    // 2. إخلاء الشاشة ورسم الخلفية
    ctx.fillStyle = '#111622';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // العثور على مركزي كلاعب لتركيز الكاميرا عليّ
    const me = currentRoom.players.find(p => p.id === myPlayerId);
    const cameraX = me ? me.position.x - canvas.width / 2 : 0;
    const cameraY = me ? me.position.y - canvas.height / 2 : 0;

    // رسم شبكة الخريطة البرمجية (Grid Lines)
    ctx.strokeStyle = '#232d42';
    ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = 0; x < GAME_CONSTANTS.MAP_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - cameraX, 0 - cameraY);
        ctx.lineTo(x - cameraX, GAME_CONSTANTS.MAP_HEIGHT - cameraY);
        ctx.stroke();
    }
    for (let y = 0; y < GAME_CONSTANTS.MAP_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0 - cameraX, y - cameraY);
        ctx.lineTo(GAME_CONSTANTS.MAP_WIDTH - cameraX, y - cameraY);
        ctx.stroke();
    }

    // 3. رسم كافة اللاعبين المتواجدين في الغرفة بالوانهم وأسمائهم
    currentRoom.players.forEach(p => {
        const screenX = p.position.x - cameraX;
        const screenY = p.position.y - cameraY;

        // رسم كبسولة شخصية اللاعب (دائرة مبدئية بديلة للأنيميشن)
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();

        // كتابة اسم اللاعب فوق رأسه
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, screenX, screenY - 30);
    });

    requestAnimationFrame(renderLoop);
}
