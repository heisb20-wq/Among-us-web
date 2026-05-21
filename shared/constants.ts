export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'wall' | 'table' | 'room';
  color: string;
  name: string;
}

export const GAME_CONSTANTS = {
  MAP_WIDTH: 2000,
  MAP_HEIGHT: 2000,
  BASE_SPEED: 4,
  PLAYER_RADIUS: 20,
  // 🚀 الإضافة البرمجية الحرجة لحل مشكلة بناء السيرفر (معدل التحديث)
  TICK_INTERVAL_MS: 33 
};

export const MAP_OBSTACLES: Obstacle[] = [
  // حدود الكافتيريا المركزية (الجدران المحيطة بالغرفة الأساسية)
  { id: 'cafeteria_top', x: 700, y: 600, width: 600, height: 25, type: 'wall', color: '#2d3748', name: 'جدار الكافتيريا العلوي' },
  { id: 'cafeteria_bottom', x: 700, y: 1300, width: 600, height: 25, type: 'wall', color: '#2d3748', name: 'جدار الكافتيريا السفلي' },
  { id: 'cafeteria_left', x: 675, y: 600, width: 25, height: 725, type: 'wall', color: '#2d3748', name: 'جدار الكافتيريا الأيسر' },
  { id: 'cafeteria_right', x: 1300, y: 600, width: 25, height: 725, type: 'wall', color: '#2d3748', name: 'جدار الكافتيريا الأيمن' },
  
  // طاولات الكافتيريا الداخلية (عوائق مادية مصمتة)
  { id: 'table_center', x: 950, y: 920, width: 100, height: 100, type: 'table', color: '#4a5568', name: 'الطاولة المركزية' },
  { id: 'table_top_left', x: 780, y: 720, width: 75, height: 75, type: 'table', color: '#4a5568', name: 'طاولة 1' },
  { id: 'table_top_right', x: 1120, y: 720, width: 75, height: 75, type: 'table', color: '#4a5568', name: 'طاولة 2' },
  { id: 'table_bottom_left', x: 780, y: 1120, width: 75, height: 75, type: 'table', color: '#4a5568', name: 'طاولة 3' },
  { id: 'table_bottom_right', x: 1120, y: 1120, width: 75, height: 75, type: 'table', color: '#4a5568', name: 'طاولة 4' },

  // غرف وهياكل جانبية مضافة لتوسيع الخريطة
  { id: 'electrical_room', x: 250, y: 750, width: 250, height: 300, type: 'room', color: '#1a202c', name: 'غرفة الكهرباء (Electrical)' },
  { id: 'admin_room', x: 1450, y: 850, width: 300, height: 250, type: 'room', color: '#1a202c', name: 'غرفة التحكم (Admin)' }
];
