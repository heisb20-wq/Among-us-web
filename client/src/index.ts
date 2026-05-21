import './style.css';
import { network } from './network/NetworkManager';
import { InputHandler } from './game/InputHandler';
import { Room, GameState, Player, SocketEvents, PlayerRole } from '../../shared/types';
import { GAME_CONSTANTS } from '../../shared/constants';

let currentRoom: Room | null = null;
let myPlayerId: string | null = null;
let gameActive = false;
let allowMovement = false; // تجميد وتحرير حركة اللاعبين

const inputHandler = new InputHandler();

// عناصر الـ DOM للواجهات
const menuContainer = document.getElementById('menuContainer') as HTMLDivElement;
const lobbyScreen = document.getElementById('lobbyScreen') as HTMLDivElement;
const gameScreen = document.getElementById('gameScreen') as HTMLDivElement;
const roleScreen = document.getElementById('roleScreen') as HTMLDivElement;
const roleTitle = document.getElementById('roleTitle') as HTMLHeadingElement;
const roleSubtitle = document.getElementById('roleSubtitle') as HTMLParagraphElement;
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
    
    // مراقبة الانتقال لحالة توزيع الأدوار والبدء السينمائي
    if (room.gameState === GameState.STARTING && !gameActive) {
        triggerRoleReveal(room);
    }
    // في حال الانتقال الفعلي للعب بعد المؤقت السري
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

// تشغيل الشاشة السينمائية المؤقتة لظهور الدور
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

    // انتهاء المؤقت بعد 4 ثوان وتحويل اللعبة إلى اللعب الحر وتفعيل الكانفاس
    setTimeout(() => {
        roleScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        resizeCanvas();
        allowMovement = true; // تحرير الحركة للجميع بالتزامن
        
        // إذا كنت أنت المستضيف، أخبر السيرفر رسمياً ببدء فتح بوابات الحركة وحالة اللعب
        if (room.hostId === myPlayerId) {
            currentRoom!.gameState = GameState.PLAYING;
            // يمكن الاستغناء عن كتابة الـ emit هنا بفضل إدارة السيرفر المباشرة بالمؤقت الموازي
        }
    }, 4000);

    // الاستماع الفوري للبث التزامني للإحداثيات
    (network as any).socket?.on(SocketEvents.SERVER_TICK_UPDATE, (data: { players: Player[], gameState: GameState }) => {
        if (currentRoom) {
            currentRoom.players = data.players;
            if (data.gameState) currentRoom.gameState = data.gameState;
        }
    });

    requestAnimationFrame(renderLoop);
}

function startGameLoop() {
    gameActive = true;
    allowMovement = true;
    lobbyScreen.classList.add('hidden');
    roleScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    resizeCanvas();
    requestAnimationFrame(renderLoop);
}

function renderLoop() {
    if (!gameActive || !currentRoom || !myPlayerId) return;

    // إرسال طلب الحركة فقط إذا كانت الحركة مسموحة حالياً وغير مجمدة سينمائياً
    if (allowMovement) {
        const vec = inputHandler.getMovementVector();
        if (vec.x !== 0 || vec.y !== 0) {
            (network as any).socket?.emit(SocketEvents.CLIENT_MOVE, {
                roomCode: currentRoom.roomCode,
                vec: vec
            });
        }
    }

    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const me = currentRoom.players.find(p => p.id === myPlayerId);
    const cameraX = me ? me.position.x - canvas.width / 2 : 0;
    const cameraY = me ? me.position.y - canvas.height / 2 : 0;

    // رسم خطوط الشبكة للخريطة
    ctx.strokeStyle = '#1c2431';
    ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = 0; x < GAME_CONSTANTS.MAP_WIDTH; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x - cameraX, 0 - cameraY); ctx.lineTo(x - cameraX, GAME_CONSTANTS.MAP_HEIGHT - cameraY); ctx.stroke();
    }
    for (let y = 0; y < GAME_CONSTANTS.MAP_HEIGHT; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0 - cameraX, y - cameraY); ctx.lineTo(GAME_CONSTANTS.MAP_WIDTH - cameraX, y - cameraY); ctx.stroke();
    }

    // رسم اللاعبين
    currentRoom.players.forEach(p => {
        const screenX = p.position.x - cameraX;
        const screenY = p.position.y - cameraY;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();

        // تلوين الاسم باللون الأحمر للمخادع فقط إذا كنت أنت أيضاً مخادعاً (نفس نظام اللعبة الحقيقية لرؤية زملائك)
        const mySelf = currentRoom!.players.find(pl => pl.id === myPlayerId);
        if (p.role === PlayerRole.IMPOSTOR && mySelf && mySelf.role === PlayerRole.IMPOSTOR) {
            ctx.fillStyle = '#ff3333';
        } else {
            ctx.fillStyle = '#ffffff';
        }
        
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, screenX, screenY - 30);
    });

    requestAnimationFrame(renderLoop);
}
