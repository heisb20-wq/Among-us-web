import { io, Socket } from 'socket.io-client';

// ==========================================================================
// 1. تعريف واجهات البيانات (Interfaces) وثوابت محرك اللعبة
// ==========================================================================
interface Player {
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    isImpostor: boolean;
    isDead: boolean;
    hasVoted: boolean;
    isHost: boolean;
}

interface GameSettings {
    impostorsCount: number;
    playerSpeed: number;
    killCooldown: number;
}

interface TouchPosition {
    x: number;
    y: number;
}

// تهيئة الاتصال بالسيرفر تلقائياً عبر نفس الدومين المشترك على منصة Render
const socket: Socket = io();

// متغيرات حالة اللعبة الحالية
let localPlayerId: string = '';
let currentRoomCode: string = '';
let playersMap: Map<string, Player> = new Map();
let isGameActive: boolean = false;
let gameSettings: GameSettings = { impostorsCount: 1, playerSpeed: 6, killCooldown: 25 };

// متغيرات محرك كاميرا الرسم البياني (Camera Viewport)
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;
let cameraX = 0;
let cameraY = 0;

// متغيرات عصا التحكم للحركة باللمس (Virtual Joystick)
let joystickTouchId: number | null = null;
let joystickBase: TouchPosition = { x: 140, y: 0 }; 
let joystickStick: TouchPosition = { x: 140, y: 0 };
let moveVector = { x: 0, y: 0 };
const JOYSTICK_MAX_RADIUS = 55;
const JOYSTICK_STICK_RADIUS = 25;

// مؤقتات شحن المهارات والاجتماعات
let killCooldownTimer = 0;
let killCooldownInterval: any = null;

// ==========================================================================
// 2. جلب مراجع واجهات وعناصر وثائق الـ DOM
// ==========================================================================
const menuContainer = document.getElementById('menuContainer')!;
const lobbyScreen = document.getElementById('lobbyScreen')!;
const roleScreen = document.getElementById('roleScreen')!;
const gameScreen = document.getElementById('gameScreen')!;
const meetingOverlay = document.getElementById('meetingOverlay')!;
const killAnimationOverlay = document.getElementById('killAnimationOverlay')!;

const playerNameInput = document.getElementById('playerName') as HTMLInputElement;
const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
const displayRoomCode = document.getElementById('displayRoomCode')!;
const playerQuantityLabel = document.getElementById('playerCountLabel')!;
const playersListUl = document.getElementById('playersList')!;
const errorMessageDiv = document.getElementById('errorMessage')!;

// أزرار التحكم والعمليات
const btnCreate = document.getElementById('btnCreate')!;
const btnJoinCode = document.getElementById('btnJoinCode')!;
const btnJoinRandom = document.getElementById('btnJoinRandom')!;
const btnStartGame = document.getElementById('btnStartGame') as HTMLButtonElement;
const btnKill = document.getElementById('btnKill') as HTMLButtonElement;
const btnReport = document.getElementById('btnReport') as HTMLButtonElement;
const btnSkipVote = document.getElementById('btnSkipVote')!;
const btnSendChat = document.getElementById('btnSendChat')!;

// عنصر مؤقت إعادة شحن القتل للخائن (تم تعريفه وإصلاحه ليتوافق مع أسطر العد التنازلي)
const killCooldownTimerDiv = document.getElementById('killCooldownTimer') as HTMLSpanElement;

// عناصر لوحة التحكم الخاصة بالـ Host
const hostSettingsPanel = document.getElementById('hostSettingsPanel')!;
const settingImpostors = document.getElementById('settingImpostors') as HTMLSelectElement;
const settingSpeed = document.getElementById('settingSpeed') as HTMLSelectElement;
const settingKillCd = document.getElementById('settingKillCd') as HTMLSelectElement;

// حقول المحادثات وكشف الأدوار والأنميشن
const chatLogs = document.getElementById('chatLogs')!;
const chatInput = document.getElementById('chatInput') as HTMLInputElement;
const playersVotingGrid = document.getElementById('playersVotingGrid')!;
const meetingTimerDiv = document.getElementById('meetingTimer')!;
const roleTitle = document.getElementById('roleTitle')!;
const roleSubtitle = document.getElementById('roleSubtitle')!;
const animKillerCard = document.getElementById('animKillerCard')!;
const animVictimCard = document.getElementById('animVictimCard')!;
const killAnimDescription = document.getElementById('killAnimDescription')!;

// إعداد الكانفاس (Canvas Elements)
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// ضبط أبعاد الكانفاس لتملأ الشاشة بالكامل ديناميكياً
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    joystickBase.y = window.innerHeight - 140;
    joystickStick.y = window.innerHeight - 140;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==========================================================================
// 3. معالجة أحداث القوائم والاتصال بالشبكة أونلاين
// ==========================================================================
function getValidName(): string {
    const name = playerNameInput.value.trim();
    if (!name) {
        showError("عذراً، يجب عليك كتابة اسم اللاعب أولاً قبل المتابعة.");
        throw new Error("Missing username");
    }
    return name;
}

function showError(msg: string) {
    errorMessageDiv.innerText = msg;
    errorMessageDiv.classList.remove('hidden');
    setTimeout(() => errorMessageDiv.classList.add('hidden'), 5000);
}

btnCreate.addEventListener('click', () => {
    try {
        socket.emit('createRoom', { playerName: getValidName() });
    } catch(e){}
});

btnJoinCode.addEventListener('click', () => {
    try {
        const code = roomCodeInput.value.trim().toUpperCase();
        if (code.length !== 4) return showError("كود الغرفة غير صحيح، يجب أن يتكون من 4 خانات.");
        socket.emit('joinRoom', { roomCode: code, playerName: getValidName() });
    } catch(e){}
});

btnJoinRandom.addEventListener('click', () => {
    try {
        socket.emit('joinRandomRoom', { playerName: getValidName() });
    } catch(e){}
});

// إرسال تعديلات الإعدادات فوراً من الـ Host إلى باقي اللاعبين في الغرفة
function broadcastSettings() {
    if (!playersMap.get(localPlayerId)?.isHost) return;
    const settings: GameSettings = {
        impostorsCount: parseInt(settingImpostors.value),
        playerSpeed: parseInt(settingSpeed.value),
        killCooldown: parseInt(settingKillCd.value)
    };
    socket.emit('updateGameSettings', { roomCode: currentRoomCode, settings });
}
settingImpostors.addEventListener('change', broadcastSettings);
settingSpeed.addEventListener('change', broadcastSettings);
settingKillCd.addEventListener('change', broadcastSettings);

btnStartGame.addEventListener('click', () => {
    socket.emit('requestStartGame', { roomCode: currentRoomCode });
});

// ==========================================================================
// 4. معالجة أحداث السيرفر (Socket Event Listeners)
// ==========================================================================
socket.on('init', (data: { id: string }) => {
    localPlayerId = data.id;
});

socket.on('roomUpdated', (data: { roomCode: string; players: Player[]; settings?: GameSettings }) => {
    currentRoomCode = data.roomCode;
    displayRoomCode.innerText = data.roomCode;
    playerQuantityLabel.innerText = data.players.length.toString();
    
    playersMap.clear();
    playersListUl.innerHTML = '';
    
    let isLocalPlayerHost = false;
    
    data.players.forEach(p => {
        playersMap.set(p.id, p);
        if (p.id === localPlayerId) {
            isLocalPlayerHost = p.isHost;
        }
        
        const li = document.createElement('li');
        li.innerText = `${p.name} ${p.isHost ? '👑 (المضيف)' : ''}`;
        li.style.borderRightColor = p.color;
        playersListUl.appendChild(li);
    });

    menuContainer.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    if (isLocalPlayerHost) {
        btnStartGame.classList.remove('hidden');
        hostSettingsPanel.querySelectorAll('select').forEach(el => el.removeAttribute('disabled'));
    } else {
        btnStartGame.classList.add('hidden');
        hostSettingsPanel.querySelectorAll('select').forEach(el => el.setAttribute('disabled', 'true'));
        if (data.settings) {
            gameSettings = data.settings;
            settingImpostors.value = gameSettings.impostorsCount.toString();
            settingSpeed.value = gameSettings.playerSpeed.toString();
            settingKillCd.value = gameSettings.killCooldown.toString();
        }
    }
});

socket.on('settingsSynced', (settings: GameSettings) => {
    gameSettings = settings;
    settingImpostors.value = settings.impostorsCount.toString();
    settingSpeed.value = settings.playerSpeed.toString();
    settingKillCd.value = settings.killCooldown.toString();
});

socket.on('errorNotify', (msg: string) => {
    showError(msg);
});

socket.on('roleReveal', (data: { isImpostor: boolean }) => {
    lobbyScreen.classList.add('hidden');
    roleScreen.classList.remove('hidden');
    
    const localPlayer = playersMap.get(localPlayerId);
    if (localPlayer) localPlayer.isImpostor = data.isImpostor;

    if (data.isImpostor) {
        roleScreen.className = "role-screen impostor-theme";
        roleTitle.className = "role-title impostor-text";
        roleTitle.innerText = "IMPOSTOR (خائن)";
        roleSubtitle.innerText = "تسلل، اقطع الأنوار، وقم بتصفية أفراد الطاقم دون أن يكتشفك أحد!";
    } else {
        roleScreen.className = "role-screen crewmate-theme";
        roleTitle.className = "role-title crewmate-text";
        roleTitle.innerText = "CREWMATE (طاقم)";
        roleSubtitle.innerText = "أنهِ المهام المطلوبة واكتشف من هو الخائن المندس بينكم!";
    }

    setTimeout(() => {
        roleScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        isGameActive = true;
        if (data.isImpostor) {
            killCooldownTimer = gameSettings.killCooldown;
            startKillCooldown();
        }
        requestAnimationFrame(gameLoop);
    }, 4500);
});

socket.on('playerPositionsUpdate', (positions: { id: string; x: number; y: number; isDead: boolean }[]) => {
    positions.forEach(p => {
        const cached = playersMap.get(p.id);
        if (cached) {
            cached.x = p.x;
            cached.y = p.y;
            cached.isDead = p.isDead;
        }
    });
});

// ==========================================================================
// 5. محرك وبنية الرسوميات ثنائية الأبعاد (2D Canvas Renderer)
// ==========================================================================
function drawMapThickGrid(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#161d2b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    // رسم الأرضية المعدنية الفضائية الداكنة لبلاط اللعبة الكبير
    const tileSize = 240;
    ctx.strokeStyle = '#232e42';
    ctx.lineWidth = 3;
    
    for (let x = 0; x < MAP_WIDTH; x += tileSize) {
        for (let y = 0; y < MAP_HEIGHT; y += tileSize) {
            ctx.fillStyle = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0 ? '#1a2333' : '#1e293b';
            ctx.fillRect(x, y, tileSize, tileSize);
            ctx.strokeRect(x, y, tileSize, tileSize);
        }
    }

    // إضافة عناصر جمالية وتفاصيل ميكانيكية لأرضية السفينة لكسر جمود المربعات
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(400, 500, 300, 400);
    ctx.fillRect(1500, 1200, 600, 300);

    ctx.strokeStyle = 'rgba(249, 115, 22, 0.2)'; // خطوط طاقة برتقالية تحاكي جدران أمونج اس
    ctx.lineWidth = 6;
    ctx.strokeRect(100, 100, MAP_WIDTH - 200, MAP_HEIGHT - 200);

    ctx.restore();
}

function drawCrewmateSprite(ctx: CanvasRenderingContext2D, px: number, py: number, color: string, name: string, isDead: boolean) {
    const rx = px - cameraX;
    const ry = py - cameraY;

    // التحقق من حالة الخروج عن حدود نطاق شاشة الرؤية للمستخدم لتوفير الأداء
    if (rx < -50 || rx > canvas.width + 50 || ry < -50 || ry > canvas.height + 50) return;

    ctx.save();

    if (isDead) {
        // رسم جثة مقطوعة سفلياً يخرج منها عظمة بيضاء في المنتصف (تماماً مثل اللعبة الأصلية)
        // النصف السفلي من الجسم
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(rx, ry + 8, 16, Math.PI, 0, true);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();

        // رسم العظمة المركزية
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.fillRect(rx - 4, ry - 6, 8, 14);
        ctx.strokeRect(rx - 4, ry - 6, 8, 14);

        ctx.beginPath();
        ctx.arc(rx - 4, ry - 6, 4, 0, Math.PI * 2);
        ctx.arc(rx + 4, ry - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // اسم اللاعب الميت بلون رمادي باهت
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 13px Cairo';
        ctx.textAlign = 'center';
        ctx.fillText(name, rx, ry - 24);
        ctx.restore();
        return;
    }

    // 1. رسم حقيبة الأوكسجين الخلفية (Oxygen Tank)
    ctx.fillStyle = getShadedColor(color);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fillRect(rx - 24, ry - 10, 10, 24);
    ctx.strokeRect(rx - 24, ry - 10, 10, 24);

    // 2. رسم مجسم الكبسولة الرئيسي (Crewmate Body Capsule)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(rx, ry - 10, 16, Math.PI, 0); // انحناء الرأس العلوي
    ctx.lineTo(rx + 16, ry + 16);
    // الرجل اليمنى
    ctx.lineTo(rx + 6, ry + 16);
    ctx.lineTo(rx + 6, ry + 22);
    ctx.lineTo(rx - 1, ry + 22);
    ctx.lineTo(rx - 1, ry + 16);
    // الرجل اليسرى
    ctx.lineTo(rx - 6, ry + 16);
    ctx.lineTo(rx - 6, ry + 22);
    ctx.lineTo(rx - 13, ry + 22);
    ctx.lineTo(rx - 13, ry + 16);
    ctx.lineTo(rx - 16, ry - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. رسم النظارة الزجاجية الأمامية العاكسة (Visor Face Glass)
    ctx.fillStyle = '#93c5fd'; // أزرق زجاجي فاتح
    ctx.beginPath();
    ctx.ellipse(rx + 8, ry - 10, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // لمعان أبيض داخل النظارة لإعطاء تأثير ثلاثي أبعاد كرتوني
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(rx + 6, ry - 12, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. كتابة اسم المستخدم فوق الرأس
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px Cairo';
    ctx.textAlign = 'center';
    ctx.fillText(name, rx, ry - 34);

    ctx.restore();
}

function getShadedColor(color: string): string {
    const shades: { [key: string]: string } = {
        'red': '#991b1b', 'blue': '#1e40af', 'green': '#065f46', 
        'yellow': '#854d0e', 'orange': '#9a3412', 'purple': '#6b21a8'
    };
    return shades[color] || '#334155';
}

function drawMobileJoystick(ctx: CanvasRenderingContext2D) {
    if (joystickTouchId === null) return;

    // رسم القاعدة الدائرية الخارجية الشفافة لعصا التحكم
    ctx.save();
    ctx.beginPath();
    ctx.arc(joystickBase.x, joystickBase.y, JOYSTICK_MAX_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // رسم عصا التوجيه الداخلية المتحركة تحت إصبع اللاعب
    ctx.beginPath();
    ctx.arc(joystickStick.x, joystickStick.y, JOYSTICK_STICK_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.6)'; // أزرق نيون مضيء للتحكم
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}

// ==========================================================================
// 6. تتبع معالجة مدخلات اللمس وحسابات الحركة الرياضية (Mobile Inputs)
// ==========================================================================
canvas.addEventListener('touchstart', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        // تفعيل العصا الافتراضية إذا كان اللمس يقع في النصف السفلي الأيسر من شاشة الهاتف
        if (touch.clientX < window.innerWidth / 2 && touch.clientY > window.innerHeight / 2) {
            joystickTouchId = touch.identifier;
            joystickBase = { x: touch.clientX, y: touch.clientY };
            joystickStick = { x: touch.clientX, y: touch.clientY };
            break;
        }
    }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === joystickTouchId) {
            const dx = touch.clientX - joystickBase.x;
            const dy = touch.clientY - joystickBase.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < JOYSTICK_MAX_RADIUS) {
                joystickStick = { x: touch.clientX, y: touch.clientY };
            } else {
                const angle = Math.atan2(dy, dx);
                joystickStick.x = joystickBase.x + Math.cos(angle) * JOYSTICK_MAX_RADIUS;
                joystickStick.y = joystickBase.y + Math.sin(angle) * JOYSTICK_MAX_RADIUS;
            }

            // استخراج ناقلات التوجيه الموحدة (Normalized Vectors) للحركة
            moveVector.x = (joystickStick.x - joystickBase.x) / JOYSTICK_MAX_RADIUS;
            moveVector.y = (joystickStick.y - joystickBase.y) / JOYSTICK_MAX_RADIUS;
            break;
        }
    }
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
            joystickTouchId = null;
            moveVector = { x: 0, y: 0 }; // إيقاف فوري للحركة
            break;
        }
    }
}, { passive: true });

// دعم توجيه الحركة للاعبي الحواسب عبر أزرار الكيبورد (WASD / الأسهم)
const keysState = { w: false, s: false, a: false, d: false };
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') keysState.w = true;
    if (k === 's' || k === 'arrowdown') keysState.s = true;
    if (k === 'a' || k === 'arrowleft') keysState.a = true;
    if (k === 'd' || k === 'arrowright') keysState.d = true;
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') keysState.w = false;
    if (k === 's' || k === 'arrowdown') keysState.s = false;
    if (k === 'a' || k === 'arrowleft') keysState.a = false;
    if (k === 'd' || k === 'arrowright') keysState.d = false;
});

// ==========================================================================
// 7. الحلقة الزمنية الرئيسية للمحرك والتحديث الإجرائي (Game Render Loop)
// ==========================================================================
function gameLoop() {
    if (!isGameActive) return;

    const localPlayer = playersMap.get(localPlayerId);
    if (localPlayer && !localPlayer.isDead) {
        
        // دمج وحساب سرعة التوجيه الناتجة من الكيبورد أو الجويستيك الافتراضي لشاشات اللمس
        let vx = moveVector.x;
        let vy = moveVector.y;

        if (keysState.w) vy = -1;
        if (keysState.s) vy = 1;
        if (keysState.a) vx = -1;
        if (keysState.d) vx = 1;

        if (vx !== 0 || vy !== 0) {
            // معالجة قيم التوجيه وضبط وتيرة السرعة المدخلة من إعدادات اللوبي
            localPlayer.x += vx * gameSettings.playerSpeed;
            localPlayer.y += vy * gameSettings.playerSpeed;

            // تقييد حركة الشخصية لضمان عدم الخروج عن الحدود الخارجية لجدران الخريطة
            if (localPlayer.x < 50) localPlayer.x = 50;
            if (localPlayer.x > MAP_WIDTH - 50) localPlayer.x = MAP_WIDTH - 50;
            if (localPlayer.y < 50) localPlayer.y = 50;
            if (localPlayer.y > MAP_HEIGHT - 50) localPlayer.y = MAP_HEIGHT - 50;

            // بث إحداثيات الحركة والمميزات الحركية الجديدة للسيرفر واللاعبين أونلاين فوراً
            socket.emit('playerMove', { x: localPlayer.x, y: localPlayer.y });
        }

        // جعل الكاميرا تتبع مركز إحداثيات اللاعب المحلي بسلاسة وتمرير الخريطة بناءً عليه
        cameraX = localPlayer.x - canvas.width / 2;
        cameraY = localPlayer.y - canvas.height / 2;
    }

    // تنظيف ورسم عناصر المشهد كاملاً بالترتيب الهندسي الصحيح
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMapThickGrid(ctx);

    // رسم كافة رواد الفضاء المتصلين (أفراد الطاقم + الخونة + الجثث)
    playersMap.forEach(p => {
        drawCrewmateSprite(ctx, p.x, p.y, p.color, p.name, p.isDead);
    });

    // رسم واجهة عصا التحكم لنسخة الجوال
    drawMobileJoystick(ctx);

    // إدارة تفعيل وتحديث أزرار العمليات القتالية والتبليغ بشكل مستمر
    updateActionButtonsInteractivity(localPlayer);

    requestAnimationFrame(gameLoop);
}

function updateActionButtonsInteractivity(localPlayer: Player | undefined) {
    if (!localPlayer || localPlayer.isDead) {
        btnKill.classList.add('hidden');
        btnReport.classList.add('hidden');
        return;
    }

    btnReport.classList.remove('hidden');
    let targetToReport: Player | null = null;
    let targetToKill: Player | null = null;
    let shortestKillDistance = 140; // مسافة الاغتيال القصوى المتاحة بالبكسل
    let shortestReportDistance = 180;

    playersMap.forEach(p => {
        if (p.id === localPlayerId) return;
        
        const dx = p.x - localPlayer.x;
        const dy = p.y - localPlayer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (p.isDead && dist < shortestReportDistance) {
            targetToReport = p;
        }
        if (!p.isDead && localPlayer.isImpostor && dist < shortestKillDistance) {
            targetToKill = p;
        }
    });

    // إدارة تفعيل زر التبليغ عند الاقتراب من الجثة
    btnReport.disabled = !targetToReport;

    // إدارة تفعيل وتحديث زر التصفية للخائن
    if (localPlayer.isImpostor) {
        btnKill.classList.remove('hidden');
        btnKill.disabled = (killCooldownTimer > 0 || !targetToKill);
    } else {
        btnKill.classList.add('hidden');
    }
}

// ==========================================================================
// 8. ميكانيكيات مهارة التصفية (Kill Action) وإدارة الأنيميشن والعد التنازلي
// ==========================================================================
function startKillCooldown() {
    if (killCooldownInterval) clearInterval(killCooldownInterval);
    killCooldownTimer = gameSettings.killCooldown;
    killCooldownTimerDiv.innerText = `(${killCooldownTimer})`;

    killCooldownInterval = setInterval(() => {
        killCooldownTimer--;
        if (killCooldownTimer <= 0) {
            killCooldownTimer = 0;
            killCooldownTimerDiv.innerText = '';
            clearInterval(killCooldownInterval);
        } else {
            killCooldownTimerDiv.innerText = `(${killCooldownTimer})`;
        }
    }, 1000);
}

btnKill.addEventListener('click', () => {
    const localPlayer = playersMap.get(localPlayerId);
    if (!localPlayer || !localPlayer.isImpostor || killCooldownTimer > 0) return;

    let target: Player | null = null;
    let minD = 140;

    playersMap.forEach(p => {
        if (p.id === localPlayerId || p.isDead) return;
        const d = Math.sqrt(Math.pow(p.x - localPlayer.x, 2) + Math.pow(p.y - localPlayer.y, 2));
        if (d < minD) { target = p; }
    });

    if (target) {
        socket.emit('executeKillRequest', { victimId: (target as Player).id, roomCode: currentRoomCode });
    }
});

socket.on('killSequenceTriggered', (data: { killerName: string; killerColor: string; victimName: string; victimColor: string; victimId: string }) => {
    // تحديث الحالة محلياً فوراً لمنع تحرك المقتول
    const victim = playersMap.get(data.victimId);
    if (victim) victim.isDead = true;

    // إعداد بطاقات الرسوميات لأنيميشن القتل
    animKillerCard.innerText = data.killerName;
    animKillerCard.style.borderColor = data.killerColor;
    animKillerCard.style.color = data.killerColor;

    animVictimCard.innerText = data.victimName;
    animVictimCard.style.borderColor = data.victimColor;
    animVictimCard.style.color = data.victimColor;

    if (data.victimId === localPlayerId) {
        killAnimDescription.innerText = "لقد تمت تصفيتك بالكامل من قبل الخائن المندس!";
    } else {
        killAnimDescription.innerText = `شهدنا عملية تصفية سينمائية للاعب ${data.victimName}!`;
    }

    // إظهار اللوحة السينمائية لهزة القتل المروعة
    killAnimationOverlay.classList.remove('hidden');

    setTimeout(() => {
        killAnimationOverlay.classList.add('hidden');
        if (localPlayerId === data.victimId) {
            showError("لقد قُتلت! يمكنك الآن التنقل كشبح لمشاهدة بقية مجريات المباراة فقط.");
        }
        // إعادة شحن الـ Cooldown للقاتل
        const localPlayer = playersMap.get(localPlayerId);
        if (localPlayer && localPlayer.isImpostor && data.killerName === localPlayer.name) {
            startKillCooldown();
        }
    }, 2500);
});

// ==========================================================================
// 9. إدارة نظام الاجتماعات الطارئة، المحادثة، والتصويت (Meetings & Vote)
// ==========================================================================
btnReport.addEventListener('click', () => {
    socket.emit('reportDeadBodyRequest', { roomCode: currentRoomCode });
});

socket.on('meetingStarted', (data: { timer: number }) => {
    meetingOverlay.classList.remove('hidden');
    chatLogs.innerHTML = '';
    renderVotingGrid();
    updateMeetingTimer(data.timer);
});

function updateMeetingTimer(timeLeft: number) {
    meetingTimerDiv.innerText = `الوقت المتبقي للتصويت والمناقشة: ${timeLeft} ثانية`;
}

socket.on('meetingTimerTick', (timeLeft: number) => {
    updateMeetingTimer(timeLeft);
});

function renderVotingGrid() {
    playersVotingGrid.innerHTML = '';
    playersMap.forEach(p => {
        const card = document.createElement('div');
        card.className = `vote-card ${p.isDead ? 'dead' : ''} ${p.hasVoted ? 'voted' : ''}`;
        card.style.borderRightColor = p.color;
        card.innerText = `${p.name} ${p.isDead ? '☠️ (ميت)' : ''} ${p.hasVoted ? '✓' : ''}`;

        if (!p.isDead && !playersMap.get(localPlayerId)?.isDead) {
            card.addEventListener('click', () => {
                socket.emit('submitVote', { roomCode: currentRoomCode, votedForId: p.id });
            });
        }
        playersVotingGrid.appendChild(card);
    });
}

socket.on('playerVotedNotification', (data: { playerId: string }) => {
    const p = playersMap.get(data.playerId);
    if (p) p.hasVoted = true;
    renderVotingGrid();
});

btnSkipVote.addEventListener('click', () => {
    if (playersMap.get(localPlayerId)?.isDead) return;
    socket.emit('submitVote', { roomCode: currentRoomCode, votedForId: 'skip' });
});

// إرسال الرسائل داخل صندوق دردشة الاجتماع الطارئ
btnSendChat.addEventListener('click', sendChatMessageAction);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessageAction(); });

function sendChatMessageAction() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('sendMeetingMessage', { roomCode: currentRoomCode, message: msg });
    chatInput.value = '';
}

socket.on('receiveMeetingMessage', (data: { senderName: string; message: string; color: string }) => {
    const div = document.createElement('div');
    div.className = "chat-msg";
    div.innerHTML = `<span style="color:${data.color}; font-weight:900;">${data.senderName}:</span> ${data.message}`;
    chatLogs.appendChild(div);
    chatLogs.scrollTop = chatLogs.scrollHeight;
});

socket.on('meetingEnded', (data: { evictedName: string | null; resultType: string }) => {
    meetingOverlay.classList.add('hidden');
    
    // إعادة تهيئة وتصفير وضع التصويت للاعبين
    playersMap.forEach(p => p.hasVoted = false);

    if (data.evictedName) {
        showError(`نتائج التصويت: تم إلقاء اللاعب ${data.evictedName} خارج سفينة الفضاء! (${data.resultType})`);
        // تحديث حالته كميت إذا كان هو اللاعب المحلي
        playersMap.forEach(p => { if (p.name === data.evictedName) p.isDead = true; });
    } else {
        showError("نتائج التصويت: تم تخطي التصويت لعدم إجماع الآراء أو كثرة الـ Skip.");
    }
});

socket.on('gameOver', (data: { winningTeam: string; reason: string }) => {
    isGameActive = false;
    alert(`انتهت المباراة! الفريق الفائز: ${data.winningTeam === 'impostors' ? 'الخونة (Impostors) ☠️' : 'أفراد الطاقم (Crewmates) 🚀'}\nالسبب: ${data.reason}`);
    
    // إعادة الجميع للقائمة الرئيسية
    gameScreen.classList.add('hidden');
    meetingOverlay.classList.add('hidden');
    killAnimationOverlay.classList.add('hidden');
    menuContainer.classList.remove('hidden');
});
