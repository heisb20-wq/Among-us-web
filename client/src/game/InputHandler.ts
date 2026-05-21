export class InputHandler {
  private keys: { [key: string]: boolean } = {};
  private joystickVector = { x: 0, y: 0 };
  private isTouching = false;
  private joystickBase: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;

  constructor() {
    this.setupKeyboard();
    // تأخير طفيف لضمان بناء واجهة الـ DOM قبل الإمساك بعناصر اللمس
    setTimeout(() => {
      this.joystickBase = document.querySelector('.joystick-base');
      this.joystickKnob = document.getElementById('joystickKnob');
      if (this.joystickBase) this.setupTouch();
    }, 100);
  }

  private setupKeyboard() {
    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
  }

  private setupTouch() {
    if (!this.joystickBase || !this.joystickKnob) return;

    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.joystickBase!.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let deltaX = touch.clientX - centerX;
      let deltaY = touch.clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const maxRadius = rect.width / 2;

      if (distance > maxRadius) {
        deltaX = (deltaX / distance) * maxRadius;
        deltaY = (deltaY / distance) * maxRadius;
      }

      this.joystickKnob!.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      // تحويل القيم إلى متجهات حركية بين -1 و 1
      this.joystickVector.x = deltaX / maxRadius;
      this.joystickVector.y = deltaY / maxRadius;
    };

    this.joystickBase.addEventListener('touchstart', (e) => { this.isTouching = true; handleTouch(e); });
    this.joystickBase.addEventListener('touchmove', handleTouch);
    this.joystickBase.addEventListener('touchend', () => {
      this.isTouching = false;
      this.joystickVector = { x: 0, y: 0 };
      this.joystickKnob!.style.transform = 'translate(0px, 0px)';
    });
  }

  public getMovementVector(): { x: number; y: number } {
    if (this.isTouching) {
      return this.joystickVector;
    }

    let x = 0;
    let y = 0;
    if (this.keys['w'] || this.keys['arrowup']) y = -1;
    if (this.keys['s'] || this.keys['arrowdown']) y = 1;
    if (this.keys['a'] || this.keys['arrowleft']) x = -1;
    if (this.keys['d'] || this.keys['arrowright']) x = 1;

    // معالجة الحركة المائلة للحفاظ على ثبات السرعة
    if (x !== 0 && y !== 0) {
      x *= 0.7071;
      y *= 0.7071;
    }
    return { x, y };
  }
}
