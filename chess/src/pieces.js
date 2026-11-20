// Pièces vectorielles « flat » dessinées pour ce projet (sprite SVG réutilisé via <use>).
const S = {
  p: `<circle cx="50" cy="29" r="12"/><rect x="36" y="40" width="28" height="9" rx="4.5"/><path d="M41 48H59C60 62 66 72 71 82H29C34 72 40 62 41 48Z"/><rect x="24" y="80" width="52" height="11" rx="5.5"/>`,
  r: `<path d="M29 18H40V27H46V18H54V27H60V18H71V40H29Z"/><path d="M34 38H66L63 48H37Z"/><path d="M38 46H62L67 82H33Z"/><rect x="24" y="80" width="52" height="11" rx="5.5"/>`,
  n: `<path d="M30 82C30 68 33 58 41 50C34 50 27 54 21 60L15 53C20 43 29 34 36 29L38 15L46 23C52 21 59 22 65 26C77 34 81 52 77 66C75 72 75 77 75 82Z"/><rect x="24" y="80" width="52" height="11" rx="5.5"/>`,
  b: `<circle cx="50" cy="14" r="6"/><ellipse cx="50" cy="35" rx="14" ry="19"/><rect x="36" y="52" width="28" height="9" rx="4.5"/><path d="M40 60H60C61 68 66 74 70 82H30C34 74 39 68 40 60Z"/><rect x="24" y="80" width="52" height="11" rx="5.5"/>`,
  q: `<path d="M30 56L19 28L35 44L35 19L44 44L50 15L56 44L65 19L65 44L81 28L70 56Z"/><circle cx="19" cy="25" r="5"/><circle cx="35" cy="16" r="5"/><circle cx="50" cy="12" r="5"/><circle cx="65" cy="16" r="5"/><circle cx="81" cy="25" r="5"/><path d="M33 54H67C68 66 68 74 71 82H29C32 74 32 66 33 54Z"/><rect x="24" y="80" width="52" height="11" rx="5.5"/>`,
  k: `<rect x="45.5" y="7" width="9" height="26" rx="2.5"/><rect x="38" y="14.5" width="24" height="9" rx="2.5"/><path d="M33 40H67C70 52 70 64 71 82H29C30 64 30 52 33 40Z"/><rect x="31" y="38" width="38" height="10" rx="5"/><rect x="24" y="80" width="52" height="11" rx="5.5"/>`,
};
const D = {
  p: '', r: '<path d="M38 55H62"/>', b: '<path d="M44 40L56 26"/>', q: '<path d="M38 60H62"/>', k: '<path d="M38 60H62"/>',
  n: '<circle class="eye" cx="55" cy="38" r="3.6"/><path d="M36 29L44 38"/>',
};
export const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">` +
  Object.keys(S).map((t) => `<symbol id="pc-${t}" viewBox="0 0 100 100"><g class="po">${S[t]}</g><g class="pf">${S[t]}</g><g class="pd">${D[t]}</g></symbol>`).join('') + `</svg>`;
export const pieceSVG = (p) => `<svg class="pc ${p === p.toUpperCase() ? 'w' : 'b'}" viewBox="0 0 100 100"><use href="#pc-${p.toLowerCase()}"/></svg>`;
export const PIECE_NAMES = { k: 'roi', q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };
