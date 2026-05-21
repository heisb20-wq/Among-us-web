import { io, Socket } from 'socket.io-client';
import { SocketEvents, Room } from '../../../shared/types';

export class NetworkManager {
  // تم تحويلها إلى public لأن ملف index.ts يستدعيها مباشرة
  // وتم إلغاء الحاجة لاستخدام (network as any)
  public socket: Socket | null = null;
  private currentRoomCode: string | null = null;
  private localPlayerId: string | null = null;

  public onRoomUpdateCallback: ((room: Room) => void) | null = null;
  public onErrorCallback: ((errorMessage: string) => void) | null = null;
  public onJoinSuccessCallback: ((roomCode: string, playerId: string) => void) | null = null;

  constructor() {
    // اكتشاف بيئة التشغيل تلقائياً لضمان العمل على السيرفر المحلي وسيرفر Render أونلاين
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    const targetUrl = isLocalhost ? 'http://localhost:3000' : window.location.origin;
    
    console.log(`[NetworkManager] جاري الاتصال بالسيرفر على العنوان: ${targetUrl}`);
    this.connect(targetUrl);
  }

  public connect(serverUrl: string): void {
    if (this.socket) return;
    
    try {
      this.socket = io(serverUrl, { transports: ['websocket'] });
      this.setupListeners();
    } catch (error) {
      console.error('[NetworkManager] فشل إنشاء اتصال عبر الـ Socket:', error);
    }
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[NetworkManager] تم الاتصال بالسيرفر بنجاح وعمل الـ Handshake!');
    });

    this.socket.on(SocketEvents.SERVER_JOIN_SUCCESS, (data: { roomCode: string, playerId: string }) => {
      console.log('[NetworkManager] تم استقبال نجاح الانضمام من السيرفر:', data);
      this.currentRoomCode = data.roomCode;
      this.localPlayerId = data.playerId;
      if (this.onJoinSuccessCallback) this.onJoinSuccessCallback(data.roomCode, data.playerId);
    });

    this.socket.on(SocketEvents.SERVER_ROOM_UPDATED, (room: Room) => {
      if (this.onRoomUpdateCallback) this.onRoomUpdateCallback(room);
    });

    this.socket.on(SocketEvents.SERVER_ERROR, (msg: string) => {
      console.warn('[NetworkManager] استقبلت الواجهة خطأ من السيرفر:', msg);
      if (this.onErrorCallback) this.onErrorCallback(msg);
    });
  }

  public createRoom(playerName: string): void { 
    if (!this.socket || !this.socket.connected) {
      console.error('[NetworkManager] خطأ: لا يوجد اتصال نشط بالسيرفر لإرسال امر إنشاء الغرفة!');
      if (this.onErrorCallback) this.onErrorCallback('السيرفر غير متصل حالياً، يرجى إعادة المحاولة.');
      return;
    }
    console.log(`[NetworkManager] جاري إرسال طلب إنشاء غرفة للاعب: ${playerName}`);
    this.socket.emit(SocketEvents.CLIENT_CREATE_ROOM, { playerName }); 
  }

  public joinByCode(playerName: string, roomCode: string): void { 
    this.socket?.emit(SocketEvents.CLIENT_JOIN_CODE, { playerName, roomCode }); 
  }

  public joinRandom(playerName: string): void { 
    this.socket?.emit(SocketEvents.CLIENT_JOIN_RANDOM, { playerName }); 
  }
}

// التصدير الصافي والنهائي للمتغير المستخدم في الواجهة
export const network = new NetworkManager();
