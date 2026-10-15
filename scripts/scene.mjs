// the hero's sky follows the owner's own clock: dawn, day, dusk, night, and the season.
// a scheduled run renders every 3 hours, so each picture shows the middle of its 3 hours (now + 90 min).
// github's light theme gets the day-ish variant of the hour, dark the night-ish one.
export const SCENE_TZ = 'Asia/Kolkata';
export const AHEAD = 90 * 60e3;

// [from hour, phase]. anything before 5 is still night.
export const PHASES = [[5, 'dawn'], [8, 'day'], [17, 'dusk'], [20, 'night']];

export function sceneAt(now, tz = SCENE_TZ) {
  const t = new Date(+now + AHEAD);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', month: 'numeric' })
    .formatToParts(t).map((x) => [x.type, x.value]));
  const hour = +p.hour + +p.minute / 60, month = +p.month;
  let phase = 'night';
  for (const [h, name] of PHASES) if (hour >= h) phase = name;
  const season = month === 10 || month === 11 ? 'leaves' : month === 12 || month <= 2 ? 'snow' : month >= 4 && month <= 6 ? 'summer' : null;
  return { phase, season, hour, month };
}

// sky top/bottom, far range, its lit faces, hills, ground, the ground's lit edge.
// body: what hangs in the sky. low: sitting on the ridge, with a glow around it (dx nudges it: dawn left, dusk right,
// both clear of the flag). stars: 0 none .. 1 full.
// light night stays light enough for the title and counter to read on it: a moonlit lavender, not black.
export const SKIES = {
  light: {
    dawn: { sky0: '#cfdcf6', sky1: '#ffd7d9', far: '#dad4ec', farLit: '#ecd9e6', mid: '#b4b6dc', ground: '#58669b', edge: '#9aa4d8', body: 'sun', sun: '#fff4e6', low: true, dx: 26, glow: '#ffc1b4', glowOp: 0.6, stars: 0 },
    day: { sky0: '#bfdcff', sky1: '#fef3e2', far: '#cfdcf1', farLit: '#c8dcf6', mid: '#a3badf', ground: '#4f6a99', edge: '#8aa6d6', body: 'sun', sun: '#fffaf2', low: false, glow: '#fffaf2', glowOp: 0.4, stars: 0 },
    dusk: { sky0: '#c8cff0', sky1: '#ffb784', far: '#d6c0d6', farLit: '#ebc3c3', mid: '#a99fc9', ground: '#4b5186', edge: '#9590c6', body: 'sun', sun: '#ffd9a8', low: true, dx: 50, glow: '#ff8a45', glowOp: 0.6, stars: 0 },
    night: { sky0: '#c9d0f0', sky1: '#e4def3', far: '#b4bbe2', farLit: '#bec4e8', mid: '#8f97cb', ground: '#3d4880', edge: '#7680c2', body: 'moon', sun: '#fffdf6', low: false, glow: '#ffffff', glowOp: 0.45, stars: 0.9, star: '#ffffff' },
  },
  dark: {
    dawn: { sky0: '#141c36', sky1: '#553a5f', far: '#2b2b4b', farLit: '#363253', mid: '#202343', ground: '#0e1326', edge: '#4f4c86', body: 'sun', sun: '#ffd6c4', low: true, dx: 26, glow: '#ff9fa0', glowOp: 0.32, stars: 0.4, star: '#fffaeb' },
    day: { sky0: '#132a44', sky1: '#2c4a68', far: '#22395a', farLit: '#284262', mid: '#1a2e4a', ground: '#0d1828', edge: '#3a5f90', body: 'sun', sun: '#f5ecd8', low: false, glow: '#fff3d6', glowOp: 0.12, stars: 0 },
    dusk: { sky0: '#17142e', sky1: '#6a2f2c', far: '#2e2238', farLit: '#3b2a3c', mid: '#211a2e', ground: '#100e1c', edge: '#5e4570', body: 'sun', sun: '#ffa463', low: true, dx: 50, glow: '#ff7a3a', glowOp: 0.42, stars: 0.15, star: '#fffaeb' },
    night: { sky0: '#0d1b2e', sky1: '#1d2c4a', far: '#1a2a46', farLit: '#192a45', mid: '#142239', ground: '#0b1422', edge: '#2d4a7a', body: 'moon', sun: '#f2e8d2', low: false, glow: '#fff0d7', glowOp: 0.07, stars: 1, star: '#fffaeb' },
  },
};

// summer days run warm: a hotter low sky, warmer lit faces and a wide sun glow (see render.mjs).
const SUMMER_DAY = {
  light: { sky0: '#c4dbfb', sky1: '#ffd9a6', farLit: '#f1dcc4', far: '#d8d9ea', glow: '#ffc56b', glowOp: 0.55, haze: '#fff1d6' },
  dark: { sky1: '#4d4258', farLit: '#3a3a52', glow: '#ffb867', glowOp: 0.22, haze: '#ffcf8f' },
};
// the sky for a theme and a scene: the hour's colors, with the season on top
export function skyFor(themeName, sc) {
  return { ...SKIES[themeName][sc.phase], ...(sc.season === 'summer' && sc.phase === 'day' ? SUMMER_DAY[themeName] : {}) };
}

// snow, as it falls and as it settles. on a light sky white flakes vanish, so they're a soft blue grey with a darker rim.
export const SNOW = {
  light: { fall: '#d3ddec', rim: '#6f84a8', lie: '#fbfdff' },
  dark: { fall: '#fff', rim: null, lie: '#dde5f1' },
};

// leaves in oct-nov, snow dec-feb: a few things drifting down, landing on the ground and fading.
// each one sits at its landing spot, so a still frame (or reduced motion) shows them on the ground.
const LEAF = 'M0 -4.5C3 -3.5 4.2 1 0 5C-4.2 1 -3 -3.5 0 -4.5Z';
const LEAF_C = ['#e8590c', '#f08c00', '#d9480f', '#f59f00', '#c2410c'];
// a fixed shuffle, so every render of the same scene is the same file
const rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };

export const FALL = 270;  // px each faller drops, from above the picture down to its spot
export const SHORT = 110; // under the title and the counter they only drop this far, so nothing crosses the words

// timing lives in css classes shared by every layout in a file: .f<i> how long a fall takes and where in it
// this one starts, .s<i> how fast it sways, .r<i> how fast a leaf turns
const MAXF = 22;
const timing = (i, snow) => {
  const dur = (snow ? 9 : 8) + Math.round(rnd(i, 3) * 50) / 10;
  return { dur, delay: -Math.round(rnd(i, 4) * dur * 10) / 10 };
};

// clear: anything landing left of this x (where the words are) takes the short drop
export function fallers(season, { w, gy, n, snow, theme = 'dark', clear = 0 }) {
  if (season !== 'leaves' && season !== 'snow') return '';
  const isSnow = season === 'snow', count = Math.min(MAXF, isSnow ? snow : n), out = [], S = SNOW[theme] || SNOW.dark;
  for (let i = 0; i < count; i++) {
    const x = Math.round(12 + rnd(i, 1) * (w * 0.78 - 12)), y = Math.round(gy + 4 + rnd(i, 2) * 22);
    const shape = isSnow
      ? `<circle r="${(1.3 + rnd(i, 7) * 1.4).toFixed(1)}" fill="${S.fall}"${S.rim ? ` stroke="${S.rim}" stroke-width=".7"` : ''} opacity="${(0.7 + rnd(i, 8) * 0.25).toFixed(2)}"/>`
      : `<path class="sp r${i % 3}" d="${LEAF}" fill="${LEAF_C[i % LEAF_C.length]}" transform="scale(${(0.9 + rnd(i, 7) * 0.5).toFixed(1)})"/>`;
    const cls = x < clear ? (rnd(i, 5) < 0.5 ? 'fc' : 'fd') : (rnd(i, 5) < 0.5 ? 'fa' : 'fb');
    out.push(`<g transform="translate(${x} ${y})"><g class="${cls} f${i}"><g class="sy s${i % 4}">${shape}</g></g></g>`);
  }
  return `<g opacity=".9">${out.join('')}</g>`;
}

export function fallCss(season) {
  if (season !== 'leaves' && season !== 'snow') return '';
  const isSnow = season === 'snow', f = [];
  for (let i = 0; i < MAXF; i++) { const { dur, delay } = timing(i, isSnow); f.push(`.f${i}{animation-duration:${dur}s;animation-delay:${delay}s}`); }
  const kf = (name, dx, drop) => `@keyframes ${name}{0%{transform:translate(${dx}px,-${drop}px);opacity:0}6%,86%{opacity:1}100%{transform:translate(0,0);opacity:0}}`;
  return `.fa,.fb,.fc,.fd{animation-iteration-count:infinite;animation-timing-function:linear}.fa{animation-name:fa}.fb{animation-name:fb}.fc{animation-name:fc}.fd{animation-name:fd}`
    + f.join('')
    + kf('fa', -30, FALL) + kf('fb', 34, FALL) + kf('fc', -14, SHORT) + kf('fd', 16, SHORT)
    + `.sy{animation:sy 3s ease-in-out infinite alternate}.s1{animation-duration:2.4s}.s2{animation-duration:3.6s}.s3{animation-duration:2.8s}`
    + `@keyframes sy{from{transform:translateX(-7px)}to{transform:translateX(7px)}}`
    + (isSnow ? '' : `.sp{animation:spn 4s linear infinite;transform-box:fill-box;transform-origin:center}.r1{animation-duration:5.5s}.r2{animation-duration:3.2s;animation-direction:reverse}@keyframes spn{to{transform:rotate(360deg)}}`);
}
