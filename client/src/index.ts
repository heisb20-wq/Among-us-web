// استيراد ملف التنسيقات ليتم دمجه بواسطة Vite أثناء البناء (الحل الجذري للمشكلة)
import './style.css'; 
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

const socket: Socket = io();

let localPlayerId: string = '';
let currentRoomCode: string = '';
let playersMap: Map<string, Player> = new Map();
let isGameActive: boolean = false;
let gameSettings: GameSettings = { impostorsCount: 1, playerSpeed: 6, killCooldown: 25 };

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;
let cameraX = 0;
let cameraY = 0;

let joystickTouchId: number | null = null;
let joystickBase: TouchPosition = { x: 140, y: 0 }; 
let joystickStick: TouchPosition = { x: 140, y: 0 };
let moveVector = { x: 0, y: 0 };
const JOYSTICK_MAX_RADIUS = 55;
const JOYSTICK_STICK_RADIUS = 25;

let killCooldownTimer = 0;
let killCooldownInterval: any = null;

// ==========================================================================
// 2. جلب مراجع العناصر (DOM References)
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
const playersListUl = document.getElementById('playersList')!;
const errorMessageDiv = document.getElementById('errorMessage')!;
const btnCreate = document.getElementById('btnCreate')!;
const btnJoinCode = document.getElementById('btnJoinCode')!;
const btnJoinRandom = document.getElementById('btnJoinRandom')!;
const btnStartGame = document.getElementById('btnStartGame') as HTMLButtonElement;
const btnKill = document.getElementById('btnKill') as HTMLButtonElement;
const btnReport = document.getElementById('btnReport') as HTMLButtonElement;
const btnSkipVote = document.getElementById('btnSkipVote')!;
const btnSendChat = document.getElementById('btnSendChat')!;
const killCooldownTimerDiv = document.getElementById('killCooldownTimer') as HTMLSpanElement;
const hostSettingsPanel = document.getElementById('hostSettingsPanel')!;
const settingImpostors = document.getElementById('settingImpostors') as HTMLSelectElement;
const settingSpeed = document.getElementById('settingSpeed') as HTMLSelectElement;
const settingKillCd = document.getElementById('settingKillCd') as HTMLSelectElement;
const chatLogs = document.getElementById('chatLogs')!;
const chatInput = document.getElementById('chatInput') as HTMLInputElement;
const playersVotingGrid = document.getElementById('playersVotingGrid')!;
const meetingTimerDiv = document.getElementById('meetingTimer')!;
const roleTitle = document.getElementById('roleTitle')!;
const roleSubtitle = document.getElementById('roleSubtitle')!;
const animKillerCard = document.getElementById('animKillerCard')!;
const animVictimCard = document.getElementById('animVictimCard')!;
const killAnimDescription = document.getElementById('killAnimDescription')!;

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    joystickBase.y = window.innerHeight - 140;
    joystickStick.y = window.innerHeight - 140;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==========================================================================
// 3. الدوال البرمجية ومنطق اللعبة (تتضمن باقي منطق الـ Socket والـ Loop)
// ==========================================================================
// (استخدم نفس المنطق المعتمد لديك في الدوال التي أرسلتها سابقاً: 
// getValidName, showError, socket events, gameLoop, draw functions)
// تأكد فقط من أنك قمت بنسخ باقي الأجزاء من 3 إلى 9 من ملفك السابق 
// ووضعها بعد سطر الاستيراد الذي أضفناه في الأعلى.

// ملحوظة: تأكد أن ملف style.css موجود في نفس المجلد الذي يحتوي على index.ts
