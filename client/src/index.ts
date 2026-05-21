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

// جلب واجهات الأكشن
const menuContainer = document.getElementById('menuContainer') as HTMLDivElement;
const lobbyScreen = document.getElementById('lobbyScreen') as HTMLDivElement;
const gameScreen = document.getElementById('gameScreen') as HTMLDivElement;
const roleScreen = document.getElementById('roleScreen') as HTMLDivElement;
const roleTitle = document.getElementById('roleTitle') as HTMLHeadingElement;
const roleSubtitle = document.getElementById('roleSubtitle') as HTMLParagraphElement;
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const btnKill = document.getElementById('btnKill') as HTMLButtonElement;
const killCooldownTimer = document.getElementById('killCooldownTimer') as HTMLSpanElement;

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

// نقر زر القتل من هاتف الاندرويد
btnKill.addEventListener('touchstart', (e) => {
    e.preventDefault();
    executeKillAction();
});
btnKill.addEventListener('click', () => { executeKillAction(); });

function executeKillAction() {
    if (!currentRoom || !myPlayerId || btnKill.disabled) return;
    const me = currentRoom.players.find(p => p.id === myPlayerId);
    if (!me || me.role !== PlayerRole.IMPOSTOR || !me.isAlive) return;

    // العثور على أقرب ضحية حية لإرسال رقم الـ ID الخاص بها للسيرفر لقتلها
    const targets = currentRoom.players.filter(p => p.id !== myPlayerId && p.isAlive && p.role === PlayerRole.CREWMATE);
    let closestTarget: Player | null = null;
    let minDistance = 150; // الحد الأقصى للمسافة المسموحة بكسل

    targets.forEach(t => {
        const dist = Math.sqrt(Math.pow(me.position.x - t.position.x, 2) + Math.pow(me.position.y - t.position.y, 2));
        if (dist < minDistance) {
            minDistance = dist;
            closestTarget = t;
        }
    });

    if (closestTarget) {
        (network as any).socket?.emit(SocketEvents.CLIENT_KILL, {
            roomCode: currentRoom.roomCode,
            targetId: (closestTarget as Player).id
        });
    }
}

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

    (network as any).socket?.on(SocketEvents.SERVER_TICK_UPDATE, (data: { players: Player[], gameState: GameState }) => {
        if (currentRoom) {
            currentRoom.players = data.players;
            if (data.gameState) currentRoom.gameState = data.gameState;
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

    // إرسال كود طلب إحداثيات الحركة التزامنية
    if (allowMovement && me && me.isAlive) {
        const vec = inputHandler.getMovementVector();
        if (vec.x !== 0 || vec.y !== 0) {
            (network as any).socket?.emit(SocketEvents.CLIENT_MOVE, { roomCode: currentRoom.roomCode, vec: vec });
        }
    }

    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // تركيز الكاميرا حول موقعي (حتى لو كنت شبحاً ميتاً أستطيع التحرك ورؤية الخريطة)
    const cameraX = me ? me.position.x - canvas.width / 2 : 0;
    const cameraY = me ? me.position.y - canvas.height / 2 : 0;

    // رسم شبكة الخريطة
    ctx.strokeStyle = '#1c2431'; ctx.lineWidth = 1; const gridSize = 100;
    for (let x = 0; x < GAME_CONSTANTS.MAP_WIDTH; x += gridSize) { ctx.beginPath(); ctx.moveTo(x - cameraX, 0 - cameraY); ctx.lineTo(x - cameraX, GAME_CONSTANTS.MAP_HEIGHT - cameraY); ctx.stroke(); }
    for (let y = 0; y < GAME_CONSTANTS.MAP_HEIGHT; y += gridSize) { ctx.beginPath(); ctx.moveTo(0 - cameraX, y - cameraY); ctx.lineTo(GAME_CONSTANTS.MAP_WIDTH - cameraX, y - cameraY); ctx.stroke(); }

    // إدارة منطق تحديث وحساب الـ Cooldown وعرض زر القتل لشاشة الـ Impostor باللمس
    if (me && me.role === PlayerRole.IMPOSTOR && me.isAlive) {
        btnKill.classList.remove('hidden');
        
        const now = Date.now();
        const lastKill = me.lastKillTime || 0;
        const cooldownMs = currentRoom.settings.killCooldownSeconds * 1000;
        const timePassed = now - lastKill;

        if (timePassed < cooldownMs) {
            btnKill.disabled = true;
            const secsLeft = Math.ceil((cooldownMs - timePassed) / 1000);
            killCooldownTimer.innerText = secsLeft.toString();
        } else {
            // تفقد المسافة مع طاقم السفينة الأبرياء الأحياء للإضاءة التفاعلية
            killCooldownTimer.innerText = '';
            const crewmates = currentRoom.players.filter(p => p.id !== myPlayerId && p.isAlive && p.role === PlayerRole.CREWMATE);
            let targetInCloseRange = false;

            crewmates.forEach(c => {
                const dist = Math.sqrt(Math.pow(me.position.x - c.position.x, 2) + Math.pow(me.position.y - c.position.y, 2));
                if (dist <= 150) targetInCloseRange = true; // اللاعب في نطاق التصفية
            });

            btnKill.disabled = !targetInCloseRange;
        }
    } else {
        btnKill.classList.add('hidden');
    }

    // 3. رسم اللاعبين والجثث الهامدة
    currentRoom.players.forEach(p => {
        const screenX = p.position.x - cameraX;
        const screenY = p.position.y - cameraY;

        if (p.isAlive) {
            // رسم اللاعب الحي كدائرة كاملة
            ctx.fillStyle = p.color;
            // إذا كان اللاعب الحالي ميتاً (شبحاً)، نرسم اللاعبين الأحياء كشفافين جزئياً كأجواء الأشباح
            ctx.globalAlpha = (me && !me.isAlive) ? 0.4 : 1.0;
            ctx.beginPath(); ctx.arc(screenX, screenY, 20, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
            ctx.globalAlpha = 1.0; // تصفير الشفافية للحلقات التالية

            // تلوين الأسماء
            if (p.role === PlayerRole.IMPOSTOR && me && me.role === PlayerRole.IMPOSTOR) {
                ctx.fillStyle = '#ff3333';
            } else { ctx.fillStyle = '#ffffff'; }

            ctx.font = 'bold 14px Segoe UI'; ctx.textAlign = 'center';
            ctx.fillText(p.name, screenX, screenY - 30);
        } else {
            // رسم اللاعب الميت (جثة ملقاة على الأرض كصف كبسولة مقطوعة النصف)
            ctx.fillStyle = p.color;
            ctx.beginPath();
            // رسم قوس نصف دائرة لتمثيل العظام الملقاة والجسد السفلي المطروح أرضاً
            ctx.arc(screenX, screenY + 10, 18, Math.PI, 0, false);
            ctx.lineTo(screenX + 18, screenY + 18);
            ctx.lineTo(screenX - 18, screenY + 18);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();

            // رسم العظمة الناتئة الصغيرة باللون الأبيض بمنتصف الجثة المطروحة
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(screenX - 4, screenY - 2, 8, 12);

            ctx.fillStyle = rgbaConvert(p.color, 0.6);
            ctx.font = '12px Segoe UI'; ctx.textAlign = 'center';
            ctx.fillText(`${p.name} (جثة)`, screenX, screenY - 15);
        }
    });

    requestAnimationFrame(renderLoop);
}

// دالة مساعدة لدمج الشفافية مع لون الجثة الميتة في النصوص
function rgbaConvert(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
