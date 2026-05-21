import './style.css';
import { network } from './network/NetworkManager';
import { Room } from '../../shared/types';

// الإمساك بعناصر واجهة المستخدم (DOM Elements)
const playerNameInput = document.getElementById('playerName') as HTMLInputElement;
const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
const btnCreate = document.getElementById('btnCreate') as HTMLButtonElement;
const btnJoinCode = document.getElementById('btnJoinCode') as HTMLButtonElement;
const btnJoinRandom = document.getElementById('btnJoinRandom') as HTMLButtonElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const lobbyScreen = document.getElementById('lobbyScreen') as HTMLDivElement;
const displayRoomCode = document.getElementById('displayRoomCode') as HTMLSpanElement;
const playersList = document.getElementById('playersList') as HTMLUListElement;
const actionsGroup = document.querySelector('.actions-group') as HTMLDivElement;
const inputGroup = document.querySelector('.input-group') as HTMLDivElement;

// تنظيف وإخفاء رسائل الخطأ عند البدء بكتابة مدخلات جديدة
const hideError = () => {
    errorMessage.classList.add('hidden');
    errorMessage.innerText = '';
};

playerNameInput.addEventListener('input', hideError);
roomCodeInput.addEventListener('input', hideError);

// 1. حدث إنشاء غرفة جديدة
btnCreate.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
        showError('الرجاء إدخال اسم اللاعب أولاً!');
        return;
    }
    network.createRoom(name);
});

// 2. حدث الانضمام عبر كود محدد
btnJoinCode.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!name) {
        showError('الرجاء إدخال اسم اللاعب أولاً!');
        return;
    }
    if (code.length < 4) {
        showError('كود الغرفة غير صالح، يرجى التحقق.');
        return;
    }
    network.joinByCode(name, code);
});

// 3. حدث الدخول لغرفة عشوائية متوفرة
btnJoinRandom.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
        showError('الرجاء إدخال اسم اللاعب أولاً!');
        return;
    }
    network.joinRandom(name);
});

// الاستماع لردود السيرفر عند نجاح الدخول للغرفة
network.onJoinSuccessCallback = (roomCode, playerId) => {
    hideError();
    // إخفاء شاشة تسجيل الاسم والأزرار الرئيسية لفتح واجهة اللوبي
    inputGroup.classList.add('hidden');
    actionsGroup.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    displayRoomCode.innerText = roomCode;
};

// الاستماع الحي والمستمر لأي تحديث يطرأ على الغرفة (مثل دخول لاعب آخر أو خروجه)
network.onRoomUpdateCallback = (room: Room) => {
    playersList.innerHTML = '';
    room.players.forEach(player => {
        const li = document.createElement('li');
        // تمييز صانع ومضيف الغرفة بـ تاغ أو تاج (👑)
        li.innerText = player.name + (room.hostId === player.id ? ' 👑 (المضيف)' : '');
        // إعطاء الحافة الجانبية لكل اسم لون الشخصية الفعلي المخصص له من السيرفر
        li.style.borderRightColor = player.color; 
        playersList.appendChild(li);
    });
};

// استقبال الأخطاء البرمجية من السيرفر وعرضها للمستخدم (مثل: الغرفة ممتلئة)
network.onErrorCallback = (msg) => {
    showError(msg);
};

function showError(message: string) {
    errorMessage.innerText = message;
    errorMessage.classList.remove('hidden');
}
