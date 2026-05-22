import './style.css';
import { io, Socket } from 'socket.io-client';
import { SocketEvents, Room, Player, GameState, PlayerRole } from './shared/types';
import { GAME_CONSTANTS, MAP_OBSTACLES } from './shared/constants';

// ==========================================================================
// 1. الاتصال بالسيرفر
// ==========================================================================
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const serverUrl = isLocalhost ? 'http://localhost:3000' : window.location.origin;
const socket: Socket = io(serverUrl, { transports: ['websocket'] });

// ==========================================================================
// 2. متغيرات الحالة العامة
// ==========================================================================
let localPlayerId = '';
let currentRoomCode = '';
let currentRoom: Room | null = null;
let myRole: PlayerRole = PlayerRole.NONE;

// متغيرات الكاميرا
let cameraX = 0;
let cameraY = 0;

// متغيرات الجويستيك
let joystickActive = false;
let joystickVector = { x: 0, y: 0 };

// مؤقت كولداون القتل
let killCooldownEnd = 0;
let killCooldownRAF = 0;

// حلقة الإرسال
let moveLoopId = 0;

// ==========================================================================
// 3. مراجع عناصر الـ DOM
// ==========================================================================
const menuContainer       = document.getElementById('menuContainer')!;
const lobbyScreen         = document.getElementById('lobbyScreen')!;
const roleScreen          = document.getElementById('roleScreen')!;
const gameScreen          = document.getElementById('gameScreen')!;
const meetingOverlay      = document.getElementById('meetingOverlay')!;
const killAnimationOverlay= document.getElementById('killAnimationOverlay')!;

const playerNameInput     = document.getElementById('playerName') as HTMLInputElement;
const roomCodeInput       = document.getElementById('roomCode') as HTMLInputElement;
const displayRoomCode     = document.getElementById('displayRoomCode')!;
const playersListUl       = document.getElementById('playersList')!;
const errorMessageDiv     = document.getElementById('errorMessage')!;
const btnCreate           = document.getElementById('btnCreate')!;
const btnJoinCode         = document.getElementById('btnJoinCode')!;
const btnJoinRandom       = document.getElementById('btnJoinRandom')!;
const btnStartGame        = document.getElementById('btnStartGame') as HTMLButtonElement;
const hostSettingsPanel   = document.getElementById('hostSettingsPanel')!;
const settingImpostors    = document.getElementById('settingImpostors') as HTMLSelectElement;
const settingSpeed        = document.getElementById('settingSpeed') as HTMLSelectElement;
const settingKillCd       = document.getElementById('settingKillCd') as HTMLSelectElement;
const btnKill             = document.getElementById('btnKill') as HTMLButtonElement;
const btnReport           = document.getElementById('btnReport') as HTMLButtonElement;
const killCooldownTimerEl = document.getElementById('killCooldownTimer')!;
const chatLogs            = document.getElementById('chatLogs')!;
const chatInput           = document.getElementById('chatInput') as HTMLInputElement;
const btnSendChat         = document.getElementById('btnSendChat')!;
const btnSkipVote         = document.getElementById('btnSkipVote')!;
const playersVotingGrid   = document.getElementById('playersVotingGrid')!;
const meetingTimerEl      = document.getElementById('meetingTimer')!;
const roleTitle           = document.getElementById('roleTitle')!;
const roleSubtitle        = document.getElementById('roleSubtitle')!;
const animKillerCard      = document.getElementById('animKillerCard')!;
const animVictimCard      = document.getElementById('animVictimCard')!;
const killAnimDescription = document.getElementById('killAnimDescription')!;

const canvas              = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx                 = canvas.getContext('2d')!;

// الجويستيك
const joystickBase        = document.getElementById('joystickBase')!;
const joystickKnob        = document.getElementById('joystickKnob')!;

// ==========================================================================
// 4. دوال مساعدة
// ==========================================================================
function showScreen(screen: HTMLElement) {
    [menuContainer, lobbyScreen, roleScreen, gameScreen, meetingOverlay, killAnimationOverlay]
        .forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

function showError(msg: string) {
    errorMessageDiv.textContent = msg;
    errorMessageDiv.classList.remove('hidden');
    setTimeout(() => errorMessageDiv.classList.add('hidden'), 4000);
}

function getValidName(): string | null {
    const name = playerNameInput.value.trim();
    if (!name || name.length < 2) { showError('أدخل اسماً لا يقل عن حرفين!'); return null; }
    return name;
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==========================================================================
// 5. أحداث واجهة القائمة
// ==========================================================================
btnCreate.addEventListener('click', () => {
    const name = getValidName();
    if (name) socket.emit(SocketEvents.CLIENT_CREATE_ROOM, { playerName: name });
});

btnJoinCode.addEventListener('click', () => {
    const name = getValidName();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!name) return;
    if (!code || code.length < 4) { showError('أدخل كود الغرفة الصحيح!'); return; }
    socket.emit(SocketEvents.CLIENT_JOIN_CODE, { playerName: name, roomCode: code });
});

btnJoinRandom.addEventListener('click', () => {
    const name = getValidName();
    if (name) socket.emit(SocketEvents.CLIENT_JOIN_RANDOM, { playerName: name });
});

btnStartGame.addEventListener('click', () => {
    socket.emit(SocketEvents.CLIENT_START_GAME, { roomCode: currentRoomCode });
});

// إرسال الإعدادات عند تغييرها
function sendSettings() {
    socket.emit(SocketEvents.CLIENT_UPDATE_SETTINGS, {
        roomCode: currentRoomCode,
        settings: {
            impostorCount: parseInt(settingImpostors.value),
            playerSpeedMultiplier: parseFloat(settingSpeed.value),
            killCooldownSeconds: parseInt(settingKillCd.value),
            votingTimeSeconds: 60
        }
    });
}
settingImpostors.addEventListener('change', sendSettings);
settingSpeed.addEventListener('change', sendSettings);
settingKillCd.addEventListener('change', sendSettings);

// ==========================================================================
// 6. أحداث واجهة اللعب
// ==========================================================================
btnKill.addEventListener('click', () => {
    if (!currentRoom) return;
    const me = currentRoom.players.find(p => p.id === localPlayerId);
    if (!me) return;

    // إيجاد أقرب لاعب حي في النطاق
    let closest: Player | null = null;
    let minDist = 180;
    for (const p of currentRoom.players) {
        if (p.id === localPlayerId || !p.isAlive || p.role === PlayerRole.IMPOSTOR || p.role === PlayerRole.GHOST_CREWMATE || p.role === PlayerRole.GHOST_IMPOSTOR) continue;
        const dist = Math.hypot(me.position.x - p.position.x, me.position.y - p.position.y);
        if (dist < minDist) { minDist = dist; closest = p; }
    }
    if (closest) {
        socket.emit(SocketEvents.CLIENT_KILL, { roomCode: currentRoomCode, targetId: closest.id });
    }
});

btnReport.addEventListener('click', () => {
    socket.emit(SocketEvents.CLIENT_REPORT_BODY, { roomCode: currentRoomCode });
});

btnSendChat.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit(SocketEvents.CLIENT_SEND_CHAT, { roomCode: currentRoomCode, text });
    chatInput.value = '';
}

btnSkipVote.addEventListener('click', () => {
    socket.emit(SocketEvents.CLIENT_CAST_VOTE, { roomCode: currentRoomCode, targetId: 'skip' });
    btnSkipVote.setAttribute('disabled', 'true');
});

// ==========================================================================
// 7. أحداث Socket من السيرفر
// ==========================================================================
socket.on(SocketEvents.SERVER_ERROR, (msg: string) => {
    showError(msg);
});

socket.on(SocketEvents.SERVER_JOIN_SUCCESS, (data: { roomCode: string; playerId: string }) => {
    localPlayerId = data.playerId;
    currentRoomCode = data.roomCode;
});

socket.on(SocketEvents.SERVER_ROOM_UPDATED, (room: Room) => {
    currentRoom = room;
    handleRoomUpdate(room);
});

socket.on(SocketEvents.SERVER_TICK_UPDATE, (data: { players: Player[]; gameState: GameState; meetingTimer?: number }) => {
    if (!currentRoom) return;
    currentRoom.players = data.players;
    currentRoom.gameState = data.gameState;
    if (data.meetingTimer !== undefined) currentRoom.meetingTimer = data.meetingTimer;

    if (data.gameState === GameState.MEETING) {
        updateMeetingUI();
    } else {
        updateGameButtonsState();
    }
});

socket.on(SocketEvents.SERVER_CHAT_RECEIVE, (msg: { senderName: string; senderColor: string; text: string }) => {
    appendChatMessage(msg.senderName, msg.senderColor, msg.text);
});

socket.on(SocketEvents.SERVER_GAME_OVER, (data: { winner: string; text: string }) => {
    stopMoveLoop();
    cancelAnimationFrame(killCooldownRAF);

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.92);
        display:flex;flex-direction:column;justify-content:center;align-items:center;
        z-index:9999;text-align:center;padding:40px;
    `;
    const isCrewWin = data.winner === 'CREWMATES';
    overlay.innerHTML = `
        <div style="font-size:5rem;font-weight:900;color:${isCrewWin ? '#10b981' : '#ff3e3e'};
             text-shadow:0 0 30px ${isCrewWin ? '#10b981' : '#ff3e3e'};margin-bottom:20px;">
            ${isCrewWin ? '🎉 فاز الأبرياء!' : '😈 فاز القتلة!'}
        </div>
        <p style="font-size:1.2rem;color:#94a3b8;max-width:500px;line-height:1.8;">${data.text}</p>
        <button onclick="location.reload()" style="
            margin-top:40px;background:#3b82f6;color:#fff;border:none;
            padding:15px 50px;border-radius:12px;font-size:1.1rem;
            font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;">
            🔄 العودة للقائمة
        </button>
    `;
    document.body.appendChild(overlay);
});

// ==========================================================================
// 8. منطق تحديث واجهة اللعب
// ==========================================================================
function handleRoomUpdate(room: Room) {
    // تحديث شاشة اللوبي
    if (room.gameState === GameState.LOBBY) {
        showScreen(lobbyScreen);
        displayRoomCode.textContent = room.roomCode;

        const isHost = room.hostId === localPlayerId;
        if (isHost) {
            hostSettingsPanel.classList.remove('hidden');
            btnStartGame.classList.remove('hidden');
            btnStartGame.disabled = room.players.length < 2;
            btnStartGame.textContent = room.players.length < 2
                ? `🔒 انتظار لاعب آخر (${room.players.length}/2)`
                : `🚀 بدء اللعبة (${room.players.length} لاعبين)`;
        } else {
            hostSettingsPanel.classList.add('hidden');
            btnStartGame.classList.add('hidden');
        }

        // رسم قائمة اللاعبين
        playersListUl.innerHTML = '';
        room.players.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span style="
                    display:inline-block;width:14px;height:14px;
                    border-radius:50%;background:${p.color};
                    margin-left:8px;vertical-align:middle;
                "></span>
                ${p.name}
                ${p.socketId === room.hostId ? ' 👑' : ''}
                ${p.id === localPlayerId ? ' (أنت)' : ''}
            `;
            playersListUl.appendChild(li);
        });
    }

    // شاشة عرض الدور
    if (room.gameState === GameState.STARTING) {
        const me = room.players.find(p => p.id === localPlayerId);
        if (me) {
            myRole = me.role;
            const isImpostor = me.role === PlayerRole.IMPOSTOR;
            roleScreen.className = `role-screen ${isImpostor ? 'impostor-theme' : 'crewmate-theme'}`;
            roleTitle.className = `role-title ${isImpostor ? 'impostor-text' : 'crewmate-text'}`;
            roleTitle.textContent = isImpostor ? '🔪 IMPOSTOR' : '✅ CREWMATE';
            roleSubtitle.textContent = isImpostor
                ? 'اقتل الجميع دون أن تُكشف!'
                : 'أكمل مهامك وكشف القاتل!';
            showScreen(roleScreen);
        }
    }

    // الانتقال لشاشة اللعب
    if (room.gameState === GameState.PLAYING) {
        const me = room.players.find(p => p.id === localPlayerId);
        if (me) myRole = me.role;

        showScreen(gameScreen);
        meetingOverlay.classList.add('hidden');
        startMoveLoop();
        requestAnimationFrame(gameLoop);
        updateGameButtonsState();

        if (myRole === PlayerRole.IMPOSTOR) {
            startKillCooldownDisplay(room.settings.killCooldownSeconds);
        }
    }

    // شاشة الاجتماع
    if (room.gameState === GameState.MEETING) {
        stopMoveLoop();
        gameScreen.classList.remove('hidden');
        meetingOverlay.classList.remove('hidden');
        updateMeetingUI();
    }
}

function updateGameButtonsState() {
    if (!currentRoom) return;
    const me = currentRoom.players.find(p => p.id === localPlayerId);
    if (!me || !me.isAlive) {
        btnKill.disabled = true;
        btnReport.disabled = true;
        return;
    }

    const isImpostor = me.role === PlayerRole.IMPOSTOR;
    btnKill.style.display = isImpostor ? 'flex' : 'none';
    killCooldownTimerEl.style.display = isImpostor ? 'inline' : 'none';

    if (isImpostor) {
        const now = Date.now();
        const cooldownMs = currentRoom.settings.killCooldownSeconds * 1000;
        const lastKill = me.lastKillTime || 0;
        const offCooldown = now - lastKill >= cooldownMs;

        // فحص وجود هدف قريب
        let hasTarget = false;
        for (const p of currentRoom.players) {
            if (p.id === localPlayerId || !p.isAlive) continue;
            if (p.role === PlayerRole.IMPOSTOR || p.role === PlayerRole.GHOST_CREWMATE || p.role === PlayerRole.GHOST_IMPOSTOR) continue;
            const dist = Math.hypot(me.position.x - p.position.x, me.position.y - p.position.y);
            if (dist < 180) { hasTarget = true; break; }
        }
        btnKill.disabled = !offCooldown || !hasTarget;
    }

    // فحص وجود جثة قريبة للتبليغ
    const deadNearby = currentRoom.players.some(p => {
        if (p.isAlive || p.id === localPlayerId) return false;
        if (p.role !== PlayerRole.GHOST_CREWMATE) return false;
        const dist = Math.hypot(me.position.x - p.position.x, me.position.y - p.position.y);
        return dist < 150;
    });
    btnReport.disabled = !deadNearby;
}

function startKillCooldownDisplay(cooldownSec: number) {
    cancelAnimationFrame(killCooldownRAF);
    killCooldownEnd = Date.now() + cooldownSec * 1000;

    function tick() {
        const remaining = Math.ceil((killCooldownEnd - Date.now()) / 1000);
        if (remaining > 0) {
            killCooldownTimerEl.textContent = `⏱ ${remaining}ث`;
            btnKill.disabled = true;
        } else {
            killCooldownTimerEl.textContent = '';
        }
        killCooldownRAF = requestAnimationFrame(tick);
    }
    tick();
}

function updateMeetingUI() {
    if (!currentRoom) return;
    if (currentRoom.meetingTimer !== undefined) {
        meetingTimerEl.textContent = `⏱ الوقت المتبقي: ${currentRoom.meetingTimer} ثانية`;
    }

    const me = currentRoom.players.find(p => p.id === localPlayerId);
    if (!me) return;

    playersVotingGrid.innerHTML = '';
    currentRoom.players.forEach(p => {
        if (!p.isAlive && p.role !== PlayerRole.GHOST_CREWMATE && p.role !== PlayerRole.GHOST_IMPOSTOR) return;

        const card = document.createElement('div');
        const isDead = !p.isAlive;
        const isMe = p.id === localPlayerId;
        card.className = `vote-card${isDead ? ' dead' : ''}${p.hasVoted ? ' voted' : ''}`;

        card.innerHTML = `
            <span style="
                display:block;width:32px;height:32px;border-radius:50%;
                background:${p.color};margin:0 auto 6px;
            "></span>
            <span style="font-size:0.85rem;font-weight:700;">${p.name}${isMe ? ' (أنت)' : ''}</span>
            ${isDead ? '<br><small style="color:#ef4444;">💀 ميت</small>' : ''}
            ${p.hasVoted && !isDead ? '<br><small style="color:#10b981;">✅ صوّت</small>' : ''}
        `;

        if (!isDead && !isMe && me.isAlive && !me.hasVoted) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                socket.emit(SocketEvents.CLIENT_CAST_VOTE, { roomCode: currentRoomCode, targetId: p.id });
                document.querySelectorAll('.vote-card').forEach(c => (c as HTMLElement).style.cursor = 'default');
                btnSkipVote.setAttribute('disabled', 'true');
            });
        }

        playersVotingGrid.appendChild(card);
    });
}

function appendChatMessage(name: string, color: string, text: string) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<span style="color:${color};font-weight:700;">${name}:</span> ${text}`;
    chatLogs.appendChild(msg);
    chatLogs.scrollTop = chatLogs.scrollHeight;
}

// ==========================================================================
// 9. حلقة الإرسال (تُرسل متجه الحركة للسيرفر)
// ==========================================================================
function startMoveLoop() {
    if (moveLoopId) return;
    moveLoopId = window.setInterval(() => {
        if (!currentRoom || currentRoom.gameState !== GameState.PLAYING) return;
        const me = currentRoom.players.find(p => p.id === localPlayerId);
        if (!me || !me.isAlive) return;

        const vec = getMoveVector();
        if (vec.x !== 0 || vec.y !== 0) {
            socket.emit(SocketEvents.CLIENT_MOVE, { roomCode: currentRoomCode, vec });
        }
    }, 50);
}

function stopMoveLoop() {
    if (moveLoopId) { clearInterval(moveLoopId); moveLoopId = 0; }
}

// ==========================================================================
// 10. مدخلات لوحة المفاتيح
// ==========================================================================
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function getMoveVector(): { x: number; y: number } {
    if (joystickActive) return joystickVector;
    let x = 0, y = 0;
    if (keys['w'] || keys['arrowup'])    y = -1;
    if (keys['s'] || keys['arrowdown'])  y = 1;
    if (keys['a'] || keys['arrowleft'])  x = -1;
    if (keys['d'] || keys['arrowright']) x = 1;
    if (x !== 0 && y !== 0) { x *= 0.7071; y *= 0.7071; }
    return { x, y };
}

// ==========================================================================
// 11. الجويستيك اللمسي
// ==========================================================================
const JOYSTICK_MAX_R = 55;

joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    updateJoystick(e.touches[0]);
}, { passive: false });

joystickBase.addEventListener('touchmove', (e) => {
    e.preventDefault();
    updateJoystick(e.touches[0]);
}, { passive: false });

joystickBase.addEventListener('touchend', () => {
    joystickActive = false;
    joystickVector = { x: 0, y: 0 };
    joystickKnob.style.transform = 'translate(-50%, -50%)';
});

function updateJoystick(touch: Touch) {
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_MAX_R) { dx = (dx / dist) * JOYSTICK_MAX_R; dy = (dy / dist) * JOYSTICK_MAX_R; }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joystickVector.x = dx / JOYSTICK_MAX_R;
    joystickVector.y = dy / JOYSTICK_MAX_R;
}

// ==========================================================================
// 12. حلقة الرسم (Game Loop)
// ==========================================================================
function gameLoop() {
    if (!currentRoom || currentRoom.gameState !== GameState.PLAYING) return;
    updateCamera();
    drawFrame();
    updateGameButtonsState();
    requestAnimationFrame(gameLoop);
}

function updateCamera() {
    if (!currentRoom) return;
    const me = currentRoom.players.find(p => p.id === localPlayerId);
    if (!me) return;
    const targetX = me.position.x - canvas.width / 2;
    const targetY = me.position.y - canvas.height / 2;
    cameraX += (targetX - cameraX) * 0.15;
    cameraY += (targetY - cameraY) * 0.15;
    cameraX = Math.max(0, Math.min(cameraX, GAME_CONSTANTS.MAP_WIDTH - canvas.width));
    cameraY = Math.max(0, Math.min(cameraY, GAME_CONSTANTS.MAP_HEIGHT - canvas.height));
}

function drawFrame() {
    if (!currentRoom) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // الخلفية (الفضاء)
    ctx.fillStyle = '#070913';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    drawMapBackground();
    drawObstacles();
    drawPlayers();
    drawDeadBodies();

    ctx.restore();
}

function drawMapBackground() {
    // أرضية الخريطة
    ctx.fillStyle = '#0f1628';
    ctx.fillRect(0, 0, GAME_CONSTANTS.MAP_WIDTH, GAME_CONSTANTS.MAP_HEIGHT);

    // شبكة خلفية خفيفة
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < GAME_CONSTANTS.MAP_WIDTH; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_CONSTANTS.MAP_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < GAME_CONSTANTS.MAP_HEIGHT; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_CONSTANTS.MAP_WIDTH, y); ctx.stroke();
    }

    // حدود الخريطة
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, GAME_CONSTANTS.MAP_WIDTH - 4, GAME_CONSTANTS.MAP_HEIGHT - 4);
}

function drawObstacles() {
    for (const obs of MAP_OBSTACLES) {
        ctx.fillStyle = obs.color;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

        // حواف خفيفة
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

        // اسم الغرفة
        if (obs.type === 'room' || obs.type === 'wall') {
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = 'bold 13px Cairo';
            ctx.textAlign = 'center';
            ctx.fillText(obs.name, obs.x + obs.width / 2, obs.y + obs.height / 2);
        }
    }
}

function drawPlayers() {
    if (!currentRoom) return;
    const me = currentRoom.players.find(p => p.id === localPlayerId);

    for (const p of currentRoom.players) {
        const isGhost = p.role === PlayerRole.GHOST_CREWMATE || p.role === PlayerRole.GHOST_IMPOSTOR;
        const isMe = p.id === localPlayerId;

        // الأشباح لا يراها الأبرياء الأحياء
        if (isGhost && me && me.isAlive && me.role === PlayerRole.CREWMATE) continue;
        if (!p.isAlive && p.role !== PlayerRole.GHOST_CREWMATE && p.role !== PlayerRole.GHOST_IMPOSTOR) continue;

        const alpha = isGhost ? 0.4 : 1.0;
        ctx.globalAlpha = alpha;

        const r = GAME_CONSTANTS.PLAYER_RADIUS;
        const x = p.position.x;
        const y = p.position.y;

        // ظل
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + r + 4, r * 0.8, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // جسم اللاعب (مستدير مع قبعة)
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, r, Math.PI, 0); // نصف الجسم العلوي (قبة)
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.arc(x, y + r * 0.8, r, 0, Math.PI); // الجزء السفلي
        ctx.closePath();
        ctx.fill();

        // خوذة (واقي)
        ctx.fillStyle = 'rgba(180,220,255,0.85)';
        ctx.beginPath();
        ctx.arc(x, y - r * 0.1, r * 0.68, Math.PI, 0);
        ctx.closePath();
        ctx.fill();

        // تأثير لمعان على الخوذة
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(x - r * 0.15, y - r * 0.3, r * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // إطار مميز للاعب الحالي
        if (isMe) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(x, y, r + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // تمييز القاتل للعاب المحلي
        const myMePlayer = currentRoom?.players.find(pp => pp.id === localPlayerId);
        if (myMePlayer?.role === PlayerRole.IMPOSTOR && p.isAlive && p.role === PlayerRole.CREWMATE) {
            const dist = Math.hypot(myMePlayer.position.x - p.position.x, myMePlayer.position.y - p.position.y);
            if (dist < 180) {
                ctx.strokeStyle = '#ff3e3e';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(x, y, r + 8, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // الاسم
        ctx.fillStyle = isGhost ? 'rgba(200,200,200,0.6)' : '#f8fafc';
        ctx.font = `bold 12px Cairo`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(p.name + (isGhost ? ' 👻' : ''), x, y - r - 8);
        ctx.shadowBlur = 0;

        ctx.globalAlpha = 1.0;
    }
}

function drawDeadBodies() {
    if (!currentRoom) return;
    const me = currentRoom.players.find(p => p.id === localPlayerId);

    for (const p of currentRoom.players) {
        if (p.isAlive) continue;
        if (p.role !== PlayerRole.GHOST_CREWMATE) continue;

        // فقط الأشخاص الأحياء يرون الجثث
        if (!me || !me.isAlive) continue;

        const x = p.position.x;
        const y = p.position.y;
        const r = GAME_CONSTANTS.PLAYER_RADIUS;

        ctx.globalAlpha = 0.85;

        // الجثة (نصف دائرة مقلوبة)
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.85, 0, Math.PI);
        ctx.closePath();
        ctx.fill();

        // علامة الوفاة
        ctx.fillStyle = '#ff3e3e';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('💀', x, y - 5);

        // مؤشر "بلّغ"
        if (me) {
            const dist = Math.hypot(me.position.x - x, me.position.y - y);
            if (dist < 150) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = 'bold 11px Cairo';
                ctx.fillText('اضغط 🚨 للتبليغ', x, y - r - 14);
            }
        }

        ctx.globalAlpha = 1.0;
    }
}
