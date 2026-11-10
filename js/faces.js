// Opponent faces: tiny line drawings with a distinguishing feature each, and a
// handful of moods the game switches between (see setMood in main.js).
const EYES = `
  <g class="e e-open"><circle cx="11" cy="14" r="2.2"/><circle cx="21" cy="14" r="2.2"/></g>
  <g class="e e-think"><circle cx="12.4" cy="12.4" r="2.2"/><circle cx="22.4" cy="12.4" r="2.2"/></g>
  <g class="e e-happy" fill="none"><path d="M8.6 14.6 Q11 11 13.4 14.6"/><path d="M18.6 14.6 Q21 11 23.4 14.6"/></g>
  <g class="e e-sad"><circle cx="11" cy="15" r="2"/><circle cx="21" cy="15" r="2"/><path d="M8 11.5 L13 10" fill="none"/><path d="M24 11.5 L19 10" fill="none"/></g>
  <g class="e e-shock"><circle cx="11" cy="13.5" r="3" fill="#f6eedb"/><circle cx="21" cy="13.5" r="3" fill="#f6eedb"/><circle cx="11" cy="13.5" r="1.1"/><circle cx="21" cy="13.5" r="1.1"/></g>`;
const MOUTHS = `
  <path class="m m-idle" d="M11.5 22 Q16 24.5 20.5 22" fill="none"/>
  <path class="m m-think" d="M12.5 22.8 L19 21.8" fill="none"/>
  <path class="m m-happy" d="M10 20.5 Q16 28.5 22 20.5 Z" fill="#f6eedb"/>
  <path class="m m-sad" d="M11.5 24.5 Q16 20 20.5 24.5" fill="none"/>
  <ellipse class="m m-shock" cx="16" cy="23.5" rx="2.4" ry="3" fill="#f6eedb"/>`;
const EXTRA = {
  Mav: '<path d="M6 7 L9 2.5 L12 6.5 L16 1.5 L20 6.5 L23 2.5 L26 7" fill="none"/>', // spiky hair
  Dot: '<g fill="none"><circle cx="11" cy="14" r="4.4"/><circle cx="21" cy="14" r="4.4"/><path d="M15.4 14 L16.6 14"/></g>', // round glasses
  Rex: '<g fill="none"><path d="M6.5 8.5 L13.5 11"/><path d="M25.5 8.5 L18.5 11"/></g>', // heavy brows
  Ivy: '<g fill="none"><path d="M7.5 11.5 L6 9.5"/><path d="M10 10.5 L9.6 8.2"/><path d="M24.5 11.5 L26 9.5"/><path d="M22 10.5 L22.4 8.2"/></g>', // lashes
  Vera: '<g fill="none"><path d="M5 9.5 Q16 4 27 9.5"/><path d="M5 9.5 L27 9.5"/></g><circle cx="24" cy="20" r="0.9"/>', // dealer's visor and a beauty spot
  Otto: '<g fill="none"><circle cx="21" cy="14" r="4.6"/><path d="M25 17.5 L27 24"/></g>', // monocle on a chain
  Stone: '<path d="M6 10 L26 10" fill="none" stroke-width="2.6"/>', // one flat brow
  Gus: '<path d="M9.5 19.5 Q12.5 16.5 16 19 Q19.5 16.5 22.5 19.5 Q19.5 21 16 19.6 Q12.5 21 9.5 19.5 Z"/>', // moustache
};
export function face(name) {
  return `<svg viewBox="0 0 32 32" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <g class="eyes">${EYES}</g>${EXTRA[name] || ''}<g ${name === 'Gus' ? 'transform="translate(0 2.2)"' : ''}>${MOUTHS}</g></svg>`;
}
