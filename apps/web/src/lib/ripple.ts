import type { PointerEvent } from 'react';

/** Material-style ripple: call from onPointerDown on an element that is `relative overflow-hidden`. */
export function ripple(e: PointerEvent<HTMLElement>): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const wave = document.createElement('span');
  wave.className = 'ripple-wave';
  wave.style.width = wave.style.height = `${size}px`;
  wave.style.left = `${e.clientX - rect.left - size / 2}px`;
  wave.style.top = `${e.clientY - rect.top - size / 2}px`;
  el.appendChild(wave);
  wave.addEventListener('animationend', () => wave.remove());
}
