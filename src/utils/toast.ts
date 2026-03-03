const TOAST_DURATION = 3000;
const TOAST_CLASS = 'wtp-toast';

// Inject toast styles once
let stylesInjected = false;
let styleElement: HTMLStyleElement | null = null;
function injectStyles(): void {
    if (stylesInjected) return;
    const style = document.createElement('style');
    style.textContent = `
    .${TOAST_CLASS} {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 100000;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border-radius: 8px;
      border-left: 3px solid;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.01em;
      color: #e0e0e0;
      background: rgba(25, 25, 25, 0.94);
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transform: translateX(12px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    }
    .${TOAST_CLASS}.show {
      opacity: 1;
      transform: translateX(0);
    }
    .${TOAST_CLASS}.hide {
      opacity: 0;
      transform: translateX(12px);
    }
    .${TOAST_CLASS}.positive { border-left-color: #4ade80; }
    .${TOAST_CLASS}.negative { border-left-color: #f87171; }
  `;
    styleElement = style;
    document.head.appendChild(styleElement);
    stylesInjected = true;
}

export function showToast(message: string, positive = true): void {
    injectStyles();

    // Remove existing toast if any
    const existing = document.querySelector(`.${TOAST_CLASS}`);
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `${TOAST_CLASS} ${positive ? 'positive' : 'negative'}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger show animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto dismiss
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, TOAST_DURATION);
}

export function cleanupToast(): void {
    // Remove any visible toast
    const existing = document.querySelector(`.${TOAST_CLASS}`);
    if (existing) existing.remove();
    // Remove injected style element
    if (styleElement) {
        styleElement.remove();
        styleElement = null;
    }
    stylesInjected = false;
}
