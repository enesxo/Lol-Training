const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const healthEl = document.getElementById('health');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('startButton');
const nameInput = document.getElementById('playerName');
const leaderboardList = document.getElementById('leaderboardList');
const panelEyebrow = document.getElementById('panelEyebrow');
const panelTitle = document.getElementById('panelTitle');
const setupBlock = document.getElementById('setupBlock');
const resultBlock = document.getElementById('resultBlock');
const settingsButton = document.getElementById('settingsButton');
const menuEl = document.getElementById('menu');
const panelEl = document.querySelector('.panel');
const playerLine = document.getElementById('playerLine');
const backButton = document.getElementById('backButton');
const cardDodge = document.getElementById('cardDodge');
const cardLastHit = document.getElementById('cardLastHit');
const lastBadge = document.getElementById('lastBadge');
const recordHpEl = document.getElementById('recordHp');
const recordValueEl = document.getElementById('recordValue');
const lastModeStorageKey = 'hextech-last-mode';
const lhResultEl = document.getElementById('lhResult');
const pausePanel = document.getElementById('pausePanel');
let paused = false;
let gameMode = 'dodge'; // 'dodge' oder 'lasthit'
const champEl = document.getElementById('champSelect');
const champGrid = document.getElementById('champGrid');
const champInfo = document.getElementById('champInfo');
const champSearch = document.getElementById('champSearch');
const champStatus = document.getElementById('champStatus');
const champTagButtons = Array.from(document.querySelectorAll('#champTagFilter button'));
const champRangeButtons = Array.from(document.querySelectorAll('#champRangeFilter button'));
const lhChampionEl = document.getElementById('lhChampion');
const panelKeys = document.getElementById('panelKeys');
const resultScore = document.getElementById('resultScore');
const resultLabel = document.getElementById('resultLabel');
const resultBadge = document.getElementById('resultBadge');
const resultLevel = document.getElementById('resultLevel');
const resultTime = document.getElementById('resultTime');
const dashButton = document.getElementById('dashButton');
const hpButtons = Array.from(document.querySelectorAll('.hp-option'));
const boardButtons = Array.from(document.querySelectorAll('.lb-option'));
let selectedHp = 2;
let leaderboardView = selectedHp; // welche HP-Stufe das Leaderboard gerade zeigt
let runHp = selectedHp; // HP-Stufe des laufenden Runs
let runTime = 0; // Sekunden, die der laufende Run überlebt wurde
let overlayMode = 'start'; // 'start' (Startbildschirm) oder 'over' (Game Over)
let showSettings = false; // Game Over: Name/HP statt Ergebnis anzeigen
let lastRun = null; // { hp, rank }: Platz des letzten Runs in der Bestenliste (0 = nicht in den Top 5)
const leaderboardStorageKey = 'hextech-dodge-leaderboard-v2';
const legacyLeaderboardStorageKey = 'hextech-dodge-leaderboard';

const mapImage = new Image();
mapImage.src = 'Mid_Lane_Update.webp';

// ---------------------------------------------------------------------------
// Kamera
// Die Spielwelt bleibt 960x800 groß (Wände, Spawns, Tempo ändern sich nicht).
// Gezeichnet wird nur der begehbare Arena-Bereich plus Rand, damit die Arena
// das Canvas ausfüllt. Das Seitenverhältnis (6:5) bleibt gleich.
// ---------------------------------------------------------------------------
const CAMERA = { x: 195, y: 89, width: 600, height: 500 };
const DESPAWN_MARGIN = 60; // Projektile verschwinden, sobald sie so weit außerhalb der Kamera sind

ctx.imageSmoothingQuality = 'high';

function applyCamera() {
  const sx = canvas.width / CAMERA.width;
  const sy = canvas.height / CAMERA.height;
  ctx.setTransform(sx, 0, 0, sy, -CAMERA.x * sx, -CAMERA.y * sy);
}

function resetCamera() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Maus-/Touch-Position (Bildschirm) in Weltkoordinaten umrechnen
function eventToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: CAMERA.x + ((event.clientX - rect.left) / rect.width) * CAMERA.width,
    y: CAMERA.y + ((event.clientY - rect.top) / rect.height) * CAMERA.height,
  };
}

function isOutsideArena(x, y) {
  return (
    x < CAMERA.x - DESPAWN_MARGIN ||
    x > CAMERA.x + CAMERA.width + DESPAWN_MARGIN ||
    y < CAMERA.y - DESPAWN_MARGIN ||
    y > CAMERA.y + CAMERA.height + DESPAWN_MARGIN
  );
}

// ---------------------------------------------------------------------------
// Schwierigkeit (hier lässt sich das Balancing anpassen)
// ---------------------------------------------------------------------------
const DIFFICULTY = {
  projectileBaseSpeed: 120,
  projectileSpeedPerLevel: 18,
  projectileMaxBaseSpeed: 200, // + Zufall bis 40 -> maximal 240, also unter dem Spielertempo (280)
  spawnIntervalStart: 1.1,
  spawnIntervalPerLevel: 0.07,
  spawnIntervalMin: 0.28,
};
const HIT_INVULNERABILITY = 0.6; // Sekunden Unverwundbarkeit nach einem Treffer

// ---------------------------------------------------------------------------
// Eis-Pfeil: Projektil mit Grafik. Trifft er, ist die Figur kurz betäubt
// (kann sich nicht bewegen und nicht dashen), es werden aber keine HP abgezogen.
// ---------------------------------------------------------------------------
const ARROW = {
  chance: 0.15, // Anteil der Spawns, der ein Pfeil ist
  stunTime: 0.3, // Sekunden Betäubung bei einem Treffer
  drawLength: 84, // Länge der Grafik im Spiel (Weltpixel)
  hitRadius: 8, // Dicke der Hitbox (kleiner als die Grafik)
  hitFrom: -24, // Hitbox verläuft als Strecke entlang der Flugrichtung ...
  hitTo: 30, // ... von hitFrom bis hitTo, gemessen vom Mittelpunkt (vorne ist die Spitze)
  color: '#7dd3fc',
  // Daten der Grafik blauer_pfeil.png (208x163 px): Spitze zeigt nach rechts oben
  spriteAngle: -0.6458, // Richtung der Spitze im Bild (Radiant, y nach unten)
  pivotX: 107, // Drehpunkt im Bild (Mitte des Pfeils)
  pivotY: 80,
  naturalLength: 230, // Länge des Pfeils im Bild entlang seiner Achse
};

const arrowImage = new Image();
arrowImage.src = 'blauer_pfeil.png';

// ---------------------------------------------------------------------------
// Feuerball: breiter als die normalen Kugeln (Radius 12-20) und zieht beim
// Treffer HP ab. Die Hitbox ist ein Kreis um den Kern der Grafik.
// ---------------------------------------------------------------------------
const FIREBALL = {
  chance: 0.12, // Anteil der Spawns, der ein Feuerball ist
  damage: 1, // abgezogene HP bei einem Treffer
  hitRadius: 27, // Radius der Hitbox (normale Kugeln: maximal 20)
  drawScale: 0.58, // Größe der Grafik (1 = Originalgröße 154x120 px)
  color: '#fbbf24',
  // Daten der Grafik gelber_feuerball.png: Der Kern zeigt nach links unten, der Schweif nach rechts oben
  spriteAngle: 2.4649, // Flugrichtung der Grafik im Bild (Radiant, y nach unten)
  pivotX: 58, // Mittelpunkt des Feuerballs im Bild
  pivotY: 72,
};

const fireballImage = new Image();
fireballImage.src = 'gelber_feuerball.png';

// ---------------------------------------------------------------------------
// Normale Projektile: blaue Energiekugel mit Schweif. Die Hitbox ist ein Kreis um
// den hellen Kern (Radius 12-20 px), der Schweif ist nur Optik.
// ---------------------------------------------------------------------------
const BALL = {
  color: '#60a5fa', // Farbe der Treffer-Funken (und der Ersatzgrafik)
  // Daten der Grafik blaue_kugel.png (259x133 px): Kopf rechts, Schweif links
  spriteAngle: -0.06, // Flugrichtung der Grafik im Bild (Radiant, y nach unten)
  pivotX: 190, // Mittelpunkt des Kopfes im Bild
  pivotY: 68,
  coreRadius: 42, // Radius des hellen Kerns im Bild (entspricht der Hitbox)
};

const ballImage = new Image();
ballImage.src = 'blaue_kugel.png';

// ---------------------------------------------------------------------------
// Unsichtbare Wände
// Die Koordinaten stammen aus der Vorlage (hellblaue Linien, 640x532 px) und
// werden auf die Canvas-Größe skaliert. Mit der Taste H (oder ?walls in der URL)
// werden die Wände zum Testen sichtbar gemacht.
// ---------------------------------------------------------------------------
const WALL_TEMPLATE_SIZE = { width: 640, height: 532 };
const WALL_PADDING = 14; // Abstand, den die Spielfigur zu einer Wand einhält
const WALL_POLYLINES = [
  [[419, 89], [514, 159]],
  [[146, 268], [255, 354], [261, 353], [308, 321]],
  [[162, 186], [166, 192], [195, 212], [195, 234], [146, 267]],
  [[258, 119], [254, 113], [227, 94], [225, 88], [228, 85], [250, 83], [328, 137], [338, 140]],
  [[321, 296], [310, 302], [308, 320]],
  [[162, 184], [257, 121]],
  [[378, 105], [375, 100], [308, 60], [308, 52], [317, 38]],
  [[461, 230], [490, 183], [514, 160]],
  [[325, 163], [265, 121], [259, 120]],
  [[418, 89], [409, 91], [392, 103], [379, 105]],
  [[342, 148], [339, 141]],
  [[145, 268], [137, 266], [86, 234], [86, 224], [106, 154], [115, 154], [151, 181], [161, 185]],
  [[574, 113], [524, 155], [515, 159]],
  [[507, 282], [461, 231]],
  [[339, 139], [378, 106]],
  [[419, 88], [423, 82], [480, 45]],
  [[342, 150], [335, 159], [326, 163]],
  [[309, 321], [314, 322], [396, 381], [458, 402]],
  [[507, 284], [411, 364], [402, 362], [322, 296]]
];

const WALL_SCALE_X = canvas.width / WALL_TEMPLATE_SIZE.width;
const WALL_SCALE_Y = canvas.height / WALL_TEMPLATE_SIZE.height;

// Jede Polylinie wird in einzelne Strecken (Canvas-Koordinaten) zerlegt.
const walls = [];
for (const line of WALL_POLYLINES) {
  for (let i = 0; i < line.length - 1; i += 1) {
    walls.push({
      ax: line[i][0] * WALL_SCALE_X,
      ay: line[i][1] * WALL_SCALE_Y,
      bx: line[i + 1][0] * WALL_SCALE_X,
      by: line[i + 1][1] * WALL_SCALE_Y,
    });
  }
}

let showWalls = new URLSearchParams(window.location.search).has('walls');

function closestPointOnWall(wall, x, y) {
  const abx = wall.bx - wall.ax;
  const aby = wall.by - wall.ay;
  const lengthSq = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((x - wall.ax) * abx + (y - wall.ay) * aby) / lengthSq));
  return { x: wall.ax + abx * t, y: wall.ay + aby * t };
}

function isBlockedByWall(x, y, radius = WALL_PADDING) {
  for (const wall of walls) {
    const point = closestPointOnWall(wall, x, y);
    if (Math.hypot(x - point.x, y - point.y) < radius) return true;
  }
  return false;
}

// Schiebt die Figur aus den Wänden heraus. Dadurch rutscht sie an Wänden entlang.
function pushOutOfWalls(entity, radius = WALL_PADDING) {
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;

    for (const wall of walls) {
      const point = closestPointOnWall(wall, entity.x, entity.y);
      const dx = entity.x - point.x;
      const dy = entity.y - point.y;
      const distance = Math.hypot(dx, dy);

      if (distance >= radius) continue;

      if (distance > 0.0001) {
        const push = (radius - distance) / distance;
        entity.x += dx * push;
        entity.y += dy * push;
      } else {
        const nx = -(wall.by - wall.ay);
        const ny = wall.bx - wall.ax;
        const length = Math.hypot(nx, ny) || 1;
        entity.x += (nx / length) * radius;
        entity.y += (ny / length) * radius;
      }
      moved = true;
    }

    if (!moved) break;
  }
}

// ---------------------------------------------------------------------------
// Spawn-Bereiche der Projektile
// Die Koordinaten stammen aus der Vorlage (lila Hilfslinien, gleiche Größe wie
// die Wand-Vorlage). Projektile starten zufällig entlang dieser Linien und
// zielen auf die Position der Spielfigur. Mit H werden sie lila angezeigt.
// ---------------------------------------------------------------------------
const SPAWN_POLYLINES = [
  [[410, 91], [495, 150], [501, 158]],
  [[303, 320], [260, 347]],
  [[385, 111], [343, 141]],
  [[164, 186], [261, 126]],
  [[490, 173], [501, 160]],
  [[258, 347], [249, 345], [154, 272]],
  [[409, 359], [501, 281]]
];
const MIN_SPAWN_DISTANCE = 180; // so nah an der Figur darf kein Projektil starten

const spawnSegments = [];
let spawnTotalLength = 0;
for (const line of SPAWN_POLYLINES) {
  for (let i = 0; i < line.length - 1; i += 1) {
    const segment = {
      ax: line[i][0] * WALL_SCALE_X,
      ay: line[i][1] * WALL_SCALE_Y,
      bx: line[i + 1][0] * WALL_SCALE_X,
      by: line[i + 1][1] * WALL_SCALE_Y,
    };
    segment.length = Math.hypot(segment.bx - segment.ax, segment.by - segment.ay);
    spawnTotalLength += segment.length;
    spawnSegments.push(segment);
  }
}

// Zufälliger Punkt auf den Spawn-Linien; längere Linien werden häufiger gewählt.
function randomSpawnPoint() {
  let pick = Math.random() * spawnTotalLength;
  for (const segment of spawnSegments) {
    if (pick <= segment.length) {
      const t = segment.length ? pick / segment.length : 0;
      return {
        x: segment.ax + (segment.bx - segment.ax) * t,
        y: segment.ay + (segment.by - segment.ay) * t,
      };
    }
    pick -= segment.length;
  }
  const last = spawnSegments[spawnSegments.length - 1];
  return { x: last.bx, y: last.by };
}

// Wählt einen Spawn-Punkt, der nicht direkt neben der Spielfigur liegt.
function pickSpawnPoint() {
  let best = null;
  let bestDistance = -1;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const point = randomSpawnPoint();
    const distance = Math.hypot(point.x - player.x, point.y - player.y);
    if (distance >= MIN_SPAWN_DISTANCE) return point;
    if (distance > bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
}

// Startbildschirm neu zeichnen, sobald die Map geladen ist
mapImage.onload = () => {
  if (!hasStarted) redrawIdleScreen();
};

const keys = {};
const projectiles = [];
const particles = [];

const mouse = {
  x: canvas.width / 2,
  y: canvas.height / 2,
};

const moveTarget = {
  x: canvas.width / 2,
  y: canvas.height / 2,
};

// Kleiner Ring am Ziel eines Bewegungsbefehls (wie der Klick-Marker in LoL)
const CLICK_MARKER_TIME = 0.45;
const clickMarker = { x: 0, y: 0, timer: 0 };
let usingMouse = false; // Maus aktiv (false bei Touch): W dasht dann zum Mauszeiger
let pointerHeld = false;
let lastTargetUpdate = 0;

let animationFrameId;
let hasStarted = false;
let lastTime = 0;
let spawnTimer = 0;
let score = 0;
let level = 1;
let gameOver = false;

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 18,
  speed: 280,
  hp: 5,
  dashCooldown: 0,
  dashTimer: 0,
  dashStrength: 420,
  facingX: 1,
  facingY: 0,
  invulnerableTimer: 0,
  stunTimer: 0,
  facing: -Math.PI / 2, // Blickrichtung (Radiant), am Anfang nach oben
  path: [], // Wegpunkte bis zum Bewegungsziel
  trailTimer: 0,
};

// ---------------------------------------------------------------------------
// Erreichbarer Bereich der Arena
// Die Wände schließen die Arena komplett ein. Klicks außerhalb davon werden auf
// den nächsten erreichbaren Punkt gelegt, damit die Figur nicht an der Wand hängt.
// ---------------------------------------------------------------------------
const REACH_CELL = 6;
const reachCols = Math.floor(canvas.width / REACH_CELL);
const reachRows = Math.floor(canvas.height / REACH_CELL);
const reachable = new Uint8Array(reachCols * reachRows);
const reachableCells = [];

function isFreeCell(col, row) {
  const x = col * REACH_CELL + REACH_CELL / 2;
  const y = row * REACH_CELL + REACH_CELL / 2;
  return (
    x >= player.radius &&
    x <= canvas.width - player.radius &&
    y >= player.radius &&
    y <= canvas.height - player.radius &&
    !isBlockedByWall(x, y)
  );
}

(function buildReachableArea() {
  const startCol = Math.floor(canvas.width / 2 / REACH_CELL);
  const startRow = Math.floor(canvas.height / 2 / REACH_CELL);
  if (!isFreeCell(startCol, startRow)) return;

  const stack = [[startCol, startRow]];
  reachable[startRow * reachCols + startCol] = 1;

  while (stack.length) {
    const [col, row] = stack.pop();
    reachableCells.push({ x: col * REACH_CELL + REACH_CELL / 2, y: row * REACH_CELL + REACH_CELL / 2 });

    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= reachCols || r >= reachRows) continue;
      const index = r * reachCols + c;
      if (reachable[index] || !isFreeCell(c, r)) continue;
      reachable[index] = 1;
      stack.push([c, r]);
    }
  }
})();

function nearestReachablePoint(x, y) {
  if (!reachableCells.length) return { x, y };

  const col = Math.floor(x / REACH_CELL);
  const row = Math.floor(y / REACH_CELL);
  if (col >= 0 && row >= 0 && col < reachCols && row < reachRows && reachable[row * reachCols + col]) {
    return { x, y };
  }

  let best = reachableCells[0];
  let bestDistance = Infinity;
  for (const cell of reachableCells) {
    const distance = (cell.x - x) ** 2 + (cell.y - y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }
  return { x: best.x, y: best.y };
}

// ---------------------------------------------------------------------------
// Bewegung wie in LoL
// Rechtsklick (oder Linksklick/Tippen) setzt ein Ziel, die Figur läuft mit
// gleichbleibendem Tempo hin und findet selbst den Weg um die Wände.
// Maustaste gedrückt halten = dem Cursor folgen.
// ---------------------------------------------------------------------------
const PATH_CLEARANCE = WALL_PADDING - 0.5; // Mindestabstand des Wegs zu den Wänden
const DASH_TO_CURSOR = true; // W dasht zum Mauszeiger (sonst in Laufrichtung)

function cellCenter(index) {
  const col = index % reachCols;
  const row = (index - col) / reachCols;
  return { x: col * REACH_CELL + REACH_CELL / 2, y: row * REACH_CELL + REACH_CELL / 2 };
}

// Nächste erreichbare Gitterzelle zu einem Punkt (-1, falls es keine Arena gibt)
function nearestReachableCell(x, y) {
  if (!reachableCells.length) return -1;

  const col = Math.floor(x / REACH_CELL);
  const row = Math.floor(y / REACH_CELL);
  let best = -1;
  let bestDistance = Infinity;

  for (let r = row - 4; r <= row + 4; r += 1) {
    for (let c = col - 4; c <= col + 4; c += 1) {
      if (c < 0 || r < 0 || c >= reachCols || r >= reachRows) continue;
      const index = r * reachCols + c;
      if (!reachable[index]) continue;
      const center = cellCenter(index);
      const distance = (center.x - x) ** 2 + (center.y - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
  }
  if (best >= 0) return best;

  const point = nearestReachablePoint(x, y);
  return Math.floor(point.y / REACH_CELL) * reachCols + Math.floor(point.x / REACH_CELL);
}

function pointToSegmentDistance(px, py, segment) {
  const point = closestPointOnWall(segment, px, py);
  return Math.hypot(px - point.x, py - point.y);
}

function segmentsIntersect(a, b) {
  const d1x = a.bx - a.ax;
  const d1y = a.by - a.ay;
  const d2x = b.bx - b.ax;
  const d2y = b.by - b.ay;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-9) return false;
  const t = ((b.ax - a.ax) * d2y - (b.ay - a.ay) * d2x) / cross;
  const u = ((b.ax - a.ax) * d1y - (b.ay - a.ay) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// Freie Sichtlinie: Strecke schneidet keine Wand und hält den Mindestabstand ein
function segmentClear(ax, ay, bx, by, clearance = PATH_CLEARANCE) {
  const path = { ax, ay, bx, by };
  for (const wall of walls) {
    if (segmentsIntersect(path, wall)) return false;
    if (
      pointToSegmentDistance(ax, ay, wall) < clearance ||
      pointToSegmentDistance(bx, by, wall) < clearance ||
      pointToSegmentDistance(wall.ax, wall.ay, path) < clearance ||
      pointToSegmentDistance(wall.bx, wall.by, path) < clearance
    ) {
      return false;
    }
  }
  return true;
}

const pathCost = new Float32Array(reachCols * reachRows);
const pathFrom = new Int32Array(reachCols * reachRows);
const pathClosed = new Uint8Array(reachCols * reachRows);

// A*-Suche auf dem Zellgitter der Arena (8 Richtungen, ohne Ecken zu schneiden)
function findGridPath(startIndex, goalIndex) {
  pathCost.fill(Infinity);
  pathFrom.fill(-1);
  pathClosed.fill(0);

  const goalCol = goalIndex % reachCols;
  const goalRow = (goalIndex - goalCol) / reachCols;
  const heuristic = (index) => {
    const col = index % reachCols;
    const dc = Math.abs(col - goalCol);
    const dr = Math.abs((index - col) / reachCols - goalRow);
    return dc + dr + (Math.SQRT2 - 2) * Math.min(dc, dr);
  };

  const heap = []; // Binär-Heap aus [Gesamtkosten, Zelle]
  const push = (cost, index) => {
    heap.push([cost, index]);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  pathCost[startIndex] = 0;
  push(heuristic(startIndex), startIndex);

  while (heap.length) {
    const current = pop()[1];
    if (pathClosed[current]) continue;
    pathClosed[current] = 1;
    if (current === goalIndex) break;

    const col = current % reachCols;
    const row = (current - col) / reachCols;

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dc && !dr) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= reachCols || r >= reachRows) continue;
        const next = r * reachCols + c;
        if (!reachable[next] || pathClosed[next]) continue;
        if (dc && dr && (!reachable[row * reachCols + c] || !reachable[r * reachCols + col])) continue;

        const cost = pathCost[current] + (dc && dr ? Math.SQRT2 : 1);
        if (cost < pathCost[next]) {
          pathCost[next] = cost;
          pathFrom[next] = current;
          push(cost + heuristic(next), next);
        }
      }
    }
  }

  if (startIndex !== goalIndex && pathFrom[goalIndex] === -1) return null;

  const cells = [];
  for (let i = goalIndex; i !== -1; i = pathFrom[i]) cells.push(i);
  return cells.reverse();
}

// Weg von (startX, startY) nach (goalX, goalY) als Liste von Wegpunkten
function findPath(startX, startY, goalX, goalY) {
  const direct = [{ x: goalX, y: goalY }];

  // Freie Sichtlinie: einfach geradeaus laufen
  if (segmentClear(startX, startY, goalX, goalY)) return direct;

  const startIndex = nearestReachableCell(startX, startY);
  const goalIndex = nearestReachableCell(goalX, goalY);
  if (startIndex < 0 || goalIndex < 0) return direct;

  const cells = findGridPath(startIndex, goalIndex);
  if (!cells) return direct;

  const points = [{ x: startX, y: startY }, ...cells.map(cellCenter), { x: goalX, y: goalY }];

  // Weg glätten: immer zum am weitesten entfernten Punkt mit freier Sichtlinie
  const result = [];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !segmentClear(points[i].x, points[i].y, points[j].x, points[j].y)) j -= 1;
    result.push(points[j]);
    i = j;
  }
  return result;
}

// Bewegungsbefehl: Ziel setzen (Ziele außerhalb der Arena landen am nächsten erreichbaren Punkt)
function setMoveTarget(x, y) {
  let goal = nearestReachablePoint(x, y);
  if (reachableCells.length && isBlockedByWall(goal.x, goal.y, PATH_CLEARANCE)) {
    const index = nearestReachableCell(goal.x, goal.y);
    if (index >= 0) goal = cellCenter(index);
  }

  moveTarget.x = goal.x;
  moveTarget.y = goal.y;
  player.path = Math.hypot(goal.x - player.x, goal.y - player.y) < 1 ? [] : findPath(player.x, player.y, goal.x, goal.y);
}

function stopMoving() {
  player.path = [];
  moveTarget.x = player.x;
  moveTarget.y = player.y;
}

// Richtung des Dashs: zum Mauszeiger, sonst in Laufrichtung bzw. zum Ziel
function dashAimPoint() {
  if (DASH_TO_CURSOR && usingMouse) return { x: mouse.x, y: mouse.y };
  if (player.path.length) return player.path[0];
  return { x: moveTarget.x, y: moveTarget.y };
}

function resetGame() {
  score = 0;
  level = 1;
  gameOver = false;
  player.radius = 18; // Last Hit verkleinert die Figur auf echte Proportionen
  player.speed = 280;
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  player.hp = selectedHp;
  runHp = selectedHp;
  runTime = 0;
  player.dashCooldown = 0;
  player.dashTimer = 0;
  player.invulnerableTimer = 0;
  player.stunTimer = 0;
  player.facing = -Math.PI / 2;
  player.trailTimer = 0;
  player.path = [];
  clickMarker.timer = 0;
  moveTarget.x = canvas.width / 2;
  moveTarget.y = canvas.height / 2;
  mouse.x = canvas.width / 2;
  mouse.y = canvas.height / 2;
  projectiles.length = 0;
  particles.length = 0;
  spawnTimer = 0;
  updateHUD();
}

function setHudMode(mode) {
  const lastHit = mode === 'lasthit';
  document.getElementById('hudBrand').textContent = lastHit ? 'HEXTECH LAST HIT' : 'HEXTECH DODGE';
  document.getElementById('scoreLabel').textContent = lastHit ? 'CS' : 'Score';
  document.getElementById('clockStat').hidden = !lastHit;
}

function updateHUD() {
  scoreEl.textContent = Math.floor(score).toString();
  healthEl.textContent = player.hp.toString();
  levelEl.textContent = level.toString();
}

const LEADERBOARD_SIZE = 5;
let fallbackBoards = null; // wird genutzt, wenn localStorage nicht verfügbar ist

function sanitizeName(value) {
  const cleaned = String(value || 'PLAYER').replace(/\s+/g, ' ').trim().slice(0, 12);
  return cleaned || 'PLAYER';
}

function cleanEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const entryScore = Number(entry.score);
  if (!Number.isFinite(entryScore)) return null;
  return { name: sanitizeName(entry.name), score: Math.max(0, Math.floor(entryScore)) };
}

function cleanEntries(list) {
  if (!Array.isArray(list)) return [];
  return list.map(cleanEntry).filter(Boolean).slice(0, LEADERBOARD_SIZE);
}

// Ein Leaderboard pro HP-Stufe: { 1: [...], 2: [...], 3: [...] }
function readLeaderboards() {
  if (fallbackBoards) return fallbackBoards;

  const boards = { 1: [], 2: [], 3: [] };
  try {
    const raw = localStorage.getItem(leaderboardStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const hp of [1, 2, 3]) {
        boards[hp] = cleanEntries(parsed && parsed[hp]);
      }
    } else {
      // Alte Liste ohne HP-Angabe: wird der Standardstufe (2 HP) zugeordnet
      const legacy = localStorage.getItem(legacyLeaderboardStorageKey);
      if (legacy) boards[2] = cleanEntries(JSON.parse(legacy));
    }
  } catch (error) {
    // Speicher nicht lesbar oder kaputt: mit leeren Listen weitermachen
  }
  return boards;
}

function saveLeaderboards(boards) {
  try {
    localStorage.setItem(leaderboardStorageKey, JSON.stringify(boards));
  } catch (error) {
    // Speichern nicht möglich (voll, Privatmodus ...): nur für diese Sitzung merken
    fallbackBoards = boards;
  }
}

function renderLeaderboard() {
  const entries = readLeaderboards()[leaderboardView] || [];

  boardButtons.forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.boardHp) === leaderboardView);
  });

  leaderboardList.replaceChildren();

  if (!entries.length) {
    const item = document.createElement('li');
    item.className = 'empty';
    const label = document.createElement('span');
    label.textContent = 'Noch keine Einträge';
    item.append(label);
    leaderboardList.append(item);
    return;
  }

  // Beim Game Over wird der Eintrag des gerade beendeten Runs hervorgehoben
  const highlight =
    overlayMode === 'over' && lastRun && lastRun.hp === leaderboardView && lastRun.rank > 0 ? lastRun.rank - 1 : -1;

  // textContent statt innerHTML: Namen werden nie als HTML interpretiert
  entries.forEach((entry, index) => {
    const item = document.createElement('li');
    const rank = document.createElement('span');
    const name = document.createElement('span');
    const points = document.createElement('span');
    rank.className = 'rank';
    name.className = 'entry-name';
    points.className = 'entry-score';
    rank.textContent = String(index + 1);
    name.textContent = entry.name;
    points.textContent = entry.score.toLocaleString('de-DE');

    if (index === highlight) {
      item.className = 'me';
      const tag = document.createElement('span');
      tag.className = 'me-tag';
      tag.textContent = 'DU';
      name.append(tag);
    }

    item.append(rank, name, points);
    leaderboardList.append(item);
  });
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Zeigt je nach Zustand Einstellungen (Start) oder Ergebnis (Game Over)
function renderOverlay() {
  const over = overlayMode === 'over';

  panelEyebrow.textContent = over ? 'Game Over' : 'Arena Ready';
  panelEyebrow.classList.toggle('is-over', over);
  panelTitle.textContent = over ? 'Run Ended' : 'Hextech Dodge';

  setupBlock.hidden = over && !showSettings;
  resultBlock.hidden = !over || showSettings;
  settingsButton.hidden = !over || showSettings;
  panelKeys.hidden = over;
  startButton.textContent = over ? 'Nochmal spielen' : 'Spiel starten';
  playerLine.textContent = sanitizeName(nameInput.value);

  renderLeaderboard();
}

function submitScoreToLeaderboard(finalScore, hp) {
  const boards = readLeaderboards();
  const list = boards[hp] || [];
  const entry = { name: sanitizeName(nameInput.value), score: Math.floor(finalScore) };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  boards[hp] = list.slice(0, LEADERBOARD_SIZE);
  saveLeaderboards(boards);

  // Platz in der Bestenliste (0 = nicht in den Top 5)
  return boards[hp].indexOf(entry) + 1;
}

function createBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      radius: 2 + Math.random() * 4,
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 220,
      life: 0.5 + Math.random() * 0.5,
      color,
    });
  }
}

function spawnProjectile() {
  const { x, y } = pickSpawnPoint();

  const angle = Math.atan2(player.y - y, player.x - x);
  const baseSpeed = Math.min(
    DIFFICULTY.projectileBaseSpeed + level * DIFFICULTY.projectileSpeedPerLevel,
    DIFFICULTY.projectileMaxBaseSpeed,
  );
  const speed = baseSpeed + Math.random() * 40;

  // Art des Projektils auswürfeln: Pfeil, Feuerball oder normale Kugel
  const roll = Math.random();
  let type = 'ball';
  if (roll < ARROW.chance) type = 'arrow';
  else if (roll < ARROW.chance + FIREBALL.chance) type = 'fireball';

  let radius = 12 + Math.random() * 8;
  let color = BALL.color;
  let damage = 1;
  if (type === 'arrow') {
    radius = ARROW.hitRadius;
    color = ARROW.color;
  } else if (type === 'fireball') {
    radius = FIREBALL.hitRadius;
    color = FIREBALL.color;
    damage = FIREBALL.damage;
  }

  projectiles.push({
    type,
    x,
    y,
    angle,
    radius,
    damage,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    color,
  });
}

// Hitbox-Test Projektil <-> Spielfigur. Kugeln sind Kreise, der Pfeil ist eine
// Strecke mit Dicke (Kapsel) entlang seiner Flugrichtung.
function projectileHitsPlayer(projectile) {
  if (projectile.type === 'arrow') {
    const dirX = Math.cos(projectile.angle);
    const dirY = Math.sin(projectile.angle);
    const ax = projectile.x + dirX * ARROW.hitFrom;
    const ay = projectile.y + dirY * ARROW.hitFrom;
    const abx = dirX * (ARROW.hitTo - ARROW.hitFrom);
    const aby = dirY * (ARROW.hitTo - ARROW.hitFrom);
    const t = Math.max(0, Math.min(1, ((player.x - ax) * abx + (player.y - ay) * aby) / (abx * abx + aby * aby)));
    const distance = Math.hypot(player.x - (ax + abx * t), player.y - (ay + aby * t));
    return distance < player.radius + ARROW.hitRadius;
  }

  return Math.hypot(player.x - projectile.x, player.y - projectile.y) < player.radius + projectile.radius;
}

function triggerDash() {
  if (player.dashCooldown > 0 || player.stunTimer > 0 || gameOver) return;

  const aim = dashAimPoint();
  const targetX = aim.x - player.x;
  const targetY = aim.y - player.y;
  const length = Math.hypot(targetX, targetY);
  if (length < 1) return; // kein Ziel, in das gedasht werden könnte

  const dirX = targetX / length;
  const dirY = targetY / length;

  // Der Dash läuft in kleinen Schritten, damit er nicht durch Wände springt,
  // direkt vor der Wand stoppt und spätestens am Ziel endet.
  const dashDistance = Math.min(110, length);
  const stepSize = 5;
  let travelled = 0;

  while (travelled < dashDistance) {
    const step = Math.min(stepSize, dashDistance - travelled);
    const nextX = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x + dirX * step));
    const nextY = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y + dirY * step));

    if (isBlockedByWall(nextX, nextY)) break;

    player.x = nextX;
    player.y = nextY;
    travelled += step;
  }

  // Direkt an der Wand: kein Dash, kein Cooldown
  if (travelled === 0) return;

  player.facing = Math.atan2(dirY, dirX);
  player.dashTimer = 0.18;
  player.dashCooldown = 0.8;
  createBurst(player.x, player.y, '#5eead4', 18);

  // Lief die Figur gerade zu einem Ziel, wird der Weg von der neuen Position aus neu berechnet
  if (player.path.length) setMoveTarget(moveTarget.x, moveTarget.y);
}

function handleInput(dt) {
  const startX = player.x;
  const startY = player.y;
  clickMarker.timer = Math.max(0, clickMarker.timer - dt);

  // Betäubt: keine Bewegung (Ziel und Weg bleiben erhalten)
  if (player.stunTimer <= 0 && player.path.length) {
    // Figur dreht sich weich in Laufrichtung
    const first = player.path[0];
    if (Math.hypot(first.x - player.x, first.y - player.y) > 2) {
      const heading = Math.atan2(first.y - player.y, first.x - player.x);
      const diff = Math.atan2(Math.sin(heading - player.facing), Math.cos(heading - player.facing));
      player.facing += diff * Math.min(1, dt * 16);
    }

    // Mit gleichbleibendem Tempo entlang der Wegpunkte laufen (kein Beschleunigen, kein Abbremsen)
    let remaining = player.speed * dt;
    while (remaining > 0 && player.path.length) {
      const waypoint = player.path[0];
      const dx = waypoint.x - player.x;
      const dy = waypoint.y - player.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= remaining) {
        player.x = waypoint.x;
        player.y = waypoint.y;
        remaining -= distance;
        player.path.shift();
      } else {
        player.x += (dx / distance) * remaining;
        player.y += (dy / distance) * remaining;
        remaining = 0;
      }
    }
  }

  pushOutOfWalls(player);

  player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

  // Beim Laufen eine kleine leuchtende Spur hinter der Figur
  if (Math.hypot(player.x - startX, player.y - startY) > 0.3) {
    player.trailTimer -= dt;
    if (player.trailTimer <= 0) {
      player.trailTimer = 0.04;
      particles.push({
        x: player.x - Math.cos(player.facing) * player.radius * 0.6 + (Math.random() - 0.5) * 6,
        y: player.y - Math.sin(player.facing) * player.radius * 0.6 + (Math.random() - 0.5) * 6,
        radius: 2 + Math.random() * 2.5,
        vx: -Math.cos(player.facing) * 18 + (Math.random() - 0.5) * 22,
        vy: -Math.sin(player.facing) * 18 + (Math.random() - 0.5) * 22,
        life: 0.25 + Math.random() * 0.15,
        color: '#5eead4',
      });
    }
  }

  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.dashTimer = Math.max(0, player.dashTimer - dt);
  player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
  player.stunTimer = Math.max(0, player.stunTimer - dt);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    if (projectileHitsPlayer(projectile)) {
      // Pfeil: Betäubung statt Schaden. Ist die Figur schon betäubt oder unverwundbar,
      // fliegt er durch (so gibt es keine Dauer-Betäubung).
      if (projectile.type === 'arrow') {
        if (player.stunTimer > 0 || player.invulnerableTimer > 0) continue;

        player.stunTimer = ARROW.stunTime;
        createBurst(projectile.x, projectile.y, ARROW.color, 22);
        projectiles.splice(i, 1);
        continue;
      }

      // Nach einem Treffer kurz unverwundbar: Projektile fliegen dann durch die Figur
      if (player.invulnerableTimer > 0) continue;

      player.hp = Math.max(0, player.hp - (projectile.damage || 1));
      player.invulnerableTimer = HIT_INVULNERABILITY;
      if (projectile.type === 'fireball') {
        createBurst(projectile.x, projectile.y, FIREBALL.color, 28);
      } else {
        createBurst(projectile.x, projectile.y, BALL.color, 20);
      }
      projectiles.splice(i, 1);
      updateHUD();

      if (player.hp <= 0) {
        endGame();
        return;
      }
      continue;
    }

    if (isOutsideArena(projectile.x, projectile.y)) {
      projectiles.splice(i, 1);
      score += 5;
      updateHUD();
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function update(dt) {
  if (gameOver) return;

  runTime += dt;
  handleInput(dt);
  updateProjectiles(dt);
  if (gameOver) return;
  updateParticles(dt);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnProjectile();
    const interval = Math.max(
      DIFFICULTY.spawnIntervalMin,
      DIFFICULTY.spawnIntervalStart - level * DIFFICULTY.spawnIntervalPerLevel,
    );
    spawnTimer = interval * (Math.random() * 0.7 + 0.7);
  }

  score += dt * 10;
  level = 1 + Math.floor(score / 150);
  updateHUD();
}

function drawBackground() {
  resetCamera();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  applyCamera();

  if (mapImage.complete && mapImage.naturalWidth > 0) {
    ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);
    return;
  }

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#1d2c4a');
  sky.addColorStop(0.3, '#2b3c58');
  sky.addColorStop(0.78, '#2d4a39');
  sky.addColorStop(1, '#131d1a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#3a5d2d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#476b3c';
  for (let i = 0; i < 10; i += 1) {
    const x = (i * 140 + 40) % (canvas.width + 160);
    const y = (i * 78 + 60) % (canvas.height + 90);
    ctx.beginPath();
    ctx.ellipse(x, y, 110, 52, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#5d7d40';
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 96 + 22) % (canvas.width + 80);
    const y = (i * 58 + 40) % (canvas.height + 60);
    ctx.beginPath();
    ctx.arc(x, y, 26 + (i % 5) * 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#2a4f54';
  ctx.beginPath();
  ctx.ellipse(canvas.width * 0.42, canvas.height * 0.5, 220, 150, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2f5d67';
  ctx.beginPath();
  ctx.ellipse(canvas.width * 0.72, canvas.height * 0.47, 180, 120, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3a3428';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(canvas.width * 0.18, 0);
  ctx.lineTo(canvas.width * 0.12, canvas.height * 0.24);
  ctx.lineTo(0, canvas.height * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.84, 0);
  ctx.lineTo(canvas.width, 0);
  ctx.lineTo(canvas.width, canvas.height * 0.22);
  ctx.lineTo(canvas.width * 0.9, canvas.height * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(200, 170, 110, 0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    const y = 80 + i * 58;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    ctx.bezierCurveTo(canvas.width * 0.22, y - 32, canvas.width * 0.48, y + 36, canvas.width + 40, y - 8);
    ctx.stroke();
  }

  const rockColors = ['#7a7b78', '#9a9d93', '#6a6d68'];
  for (let i = 0; i < 12; i += 1) {
    const x = 60 + i * 90 + ((i % 3) * 18);
    const y = 90 + ((i * 53) % (canvas.height - 120));
    ctx.fillStyle = rockColors[i % rockColors.length];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y - 18);
    ctx.lineTo(x + 44, y - 10);
    ctx.lineTo(x + 54, y + 22);
    ctx.lineTo(x + 15, y + 28);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#244b2d';
  ctx.beginPath();
  ctx.arc(canvas.width * 0.18, canvas.height * 0.67, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(canvas.width * 0.77, canvas.height * 0.72, 62, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 175, 55, 0.18)';
  for (let i = 0; i < 8; i += 1) {
    const x = 80 + i * 117;
    const y = 80 + ((i % 4) * 120);
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 30; i += 1) {
    const x = (i * 71 + 16) % canvas.width;
    const y = (i * 43 + 30) % canvas.height;
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawWalls() {
  ctx.save();
  ctx.strokeStyle = 'rgba(153, 217, 234, 0.9)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const line of WALL_POLYLINES) {
    ctx.beginPath();
    line.forEach(([x, y], index) => {
      const px = x * WALL_SCALE_X;
      const py = y * WALL_SCALE_Y;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // Spawn-Bereiche der Projektile (lila)
  ctx.strokeStyle = 'rgba(163, 73, 164, 0.95)';
  for (const line of SPAWN_POLYLINES) {
    ctx.beginPath();
    line.forEach(([x, y], index) => {
      const px = x * WALL_SCALE_X;
      const py = y * WALL_SCALE_Y;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  ctx.restore();
}

function redrawIdleScreen() {
  drawBackground();
  if (showWalls) drawWalls();
  drawPlayer();
  resetCamera();
}

// Sechseck mit einer Ecke in Blickrichtung (x-Achse)
function hexPath(radius, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = rotation + (i * Math.PI) / 3;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Hextech-Kern: Sechseck-Körper mit Blickrichtung, leuchtendem Kristall und Rune-Ring.
// Die Hitbox bleibt der Kreis mit player.radius.
function drawPlayer() {
  const time = performance.now() / 1000;
  const r = player.radius;
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);

  ctx.save();
  ctx.translate(player.x, player.y);

  // Blinken, solange die Figur nach einem Treffer unverwundbar ist
  if (player.invulnerableTimer > 0 && Math.floor(player.invulnerableTimer * 12) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  // Bodenschatten
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.6, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dash: Nachbilder entgegen der Blickrichtung
  if (player.dashTimer > 0) {
    const fade = player.dashTimer / 0.18;
    for (let k = 3; k >= 1; k -= 1) {
      ctx.save();
      ctx.translate(-Math.cos(player.facing) * k * 11, -Math.sin(player.facing) * k * 11);
      ctx.rotate(player.facing);
      ctx.fillStyle = `rgba(94, 234, 212, ${(0.24 * fade) / k})`;
      hexPath(r, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  // Weicher Schein
  const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.7);
  glow.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
  glow.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();

  // Rune-Ring: drei kreisende Bögen
  ctx.save();
  ctx.rotate(time * 1.2);
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.8)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 3, (i * Math.PI * 2) / 3, (i * Math.PI * 2) / 3 + 0.9);
    ctx.stroke();
  }
  ctx.restore();

  // Körper, in Blickrichtung gedreht
  ctx.save();
  ctx.rotate(player.facing);

  const body = ctx.createLinearGradient(-r, -r, r, r);
  body.addColorStop(0, '#c4b5fd');
  body.addColorStop(0.5, '#8b5cf6');
  body.addColorStop(1, '#5b21b6');
  ctx.fillStyle = body;
  hexPath(r, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(237, 233, 254, 0.9)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Facetten
  ctx.strokeStyle = 'rgba(237, 233, 254, 0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const angle = (i * Math.PI * 2) / 3 + Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    ctx.stroke();
  }

  // Blickrichtung: heller Keil an der vorderen Ecke
  ctx.fillStyle = '#ecfeff';
  ctx.beginPath();
  ctx.moveTo(r * 0.95, 0);
  ctx.lineTo(r * 0.5, -r * 0.3);
  ctx.lineTo(r * 0.5, r * 0.3);
  ctx.closePath();
  ctx.fill();

  // Leuchtender Kristallkern (pulsiert leicht)
  const core = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.5);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.5, '#5eead4');
  core.addColorStop(1, '#0891b2');
  ctx.shadowColor = '#5eead4';
  ctx.shadowBlur = 8 + pulse * 6;
  ctx.fillStyle = core;
  hexPath(r * 0.4 + pulse * 1.5, Math.PI / 6);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Betäubt: eisblauer Schimmer und kreisender Ring
  if (player.stunTimer > 0) {
    ctx.fillStyle = 'rgba(125, 211, 252, 0.5)';
    hexPath(r, 0);
    ctx.fill();
  }

  ctx.restore();

  if (player.stunTimer > 0) {
    ctx.save();
    ctx.rotate(time * 6);
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}


function drawArrow(projectile) {
  const scale = ARROW.drawLength / ARROW.naturalLength;

  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  ctx.rotate(projectile.angle - ARROW.spriteAngle);

  if (arrowImage.complete && arrowImage.naturalWidth > 0) {
    ctx.shadowColor = ARROW.color;
    ctx.shadowBlur = 10;
    ctx.drawImage(
      arrowImage,
      -ARROW.pivotX * scale,
      -ARROW.pivotY * scale,
      arrowImage.naturalWidth * scale,
      arrowImage.naturalHeight * scale,
    );
  } else {
    // Ersatzgrafik, falls das Bild nicht geladen werden konnte
    ctx.rotate(ARROW.spriteAngle);
    ctx.fillStyle = ARROW.color;
    ctx.beginPath();
    ctx.moveTo(ARROW.drawLength / 2, 0);
    ctx.lineTo(-ARROW.drawLength / 2, -7);
    ctx.lineTo(-ARROW.drawLength / 2, 7);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawBall(projectile) {
  if (!(ballImage.complete && ballImage.naturalWidth > 0)) {
    // Ersatzgrafik, falls das Bild nicht geladen werden konnte
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Der helle Kern der Grafik soll so groß sein wie die Hitbox
  const scale = projectile.radius / BALL.coreRadius;

  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  ctx.rotate(projectile.angle - BALL.spriteAngle);
  ctx.drawImage(
    ballImage,
    -BALL.pivotX * scale,
    -BALL.pivotY * scale,
    ballImage.naturalWidth * scale,
    ballImage.naturalHeight * scale,
  );
  ctx.restore();
}

function drawFireball(projectile) {
  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  ctx.rotate(projectile.angle - FIREBALL.spriteAngle);

  if (fireballImage.complete && fireballImage.naturalWidth > 0) {
    ctx.shadowColor = 'rgba(251, 146, 60, 0.9)';
    ctx.shadowBlur = 14;
    ctx.drawImage(
      fireballImage,
      -FIREBALL.pivotX * FIREBALL.drawScale,
      -FIREBALL.pivotY * FIREBALL.drawScale,
      fireballImage.naturalWidth * FIREBALL.drawScale,
      fireballImage.naturalHeight * FIREBALL.drawScale,
    );
  } else {
    // Ersatzgrafik, falls das Bild nicht geladen werden konnte
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, FIREBALL.hitRadius);
    glow.addColorStop(0, '#fff7cc');
    glow.addColorStop(1, '#f97316');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, FIREBALL.hitRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawClickMarker() {
  if (clickMarker.timer <= 0) return;

  const progress = 1 - clickMarker.timer / CLICK_MARKER_TIME; // 0 -> 1
  ctx.save();
  ctx.strokeStyle = `rgba(94, 234, 212, ${1 - progress})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(clickMarker.x, clickMarker.y, 8 + progress * 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(94, 234, 212, ${0.8 * (1 - progress)})`;
  ctx.beginPath();
  ctx.arc(clickMarker.x, clickMarker.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawProjectiles() {
  for (const projectile of projectiles) {
    if (projectile.type === 'arrow') {
      drawArrow(projectile);
      continue;
    }

    if (projectile.type === 'fireball') {
      drawFireball(projectile);
      continue;
    }

    drawBall(projectile);
  }
}

// Debug (Taste H): Hitboxen von Projektilen und Spielfigur
function drawHitboxes() {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(250, 255, 120, 0.95)';

  for (const projectile of projectiles) {
    if (projectile.type === 'arrow') {
      const dirX = Math.cos(projectile.angle);
      const dirY = Math.sin(projectile.angle);
      ctx.save();
      ctx.lineWidth = ARROW.hitRadius * 2;
      ctx.strokeStyle = 'rgba(250, 255, 120, 0.35)';
      ctx.beginPath();
      ctx.moveTo(projectile.x + dirX * ARROW.hitFrom, projectile.y + dirY * ARROW.hitFrom);
      ctx.lineTo(projectile.x + dirX * ARROW.hitTo, projectile.y + dirY * ARROW.hitTo);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.stroke();

  // Weg der Figur zum Ziel
  if (player.path.length) {
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.95)';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    for (const point of player.path) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life * 1.6);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function gameLoop(timestamp) {
  if (!hasStarted) {
    redrawIdleScreen();
    return;
  }

  const dt = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.03);
  lastTime = timestamp;

  if (gameMode === 'lasthit') {
    lastHitStep(dt);
    lastHitDraw();
    animationFrameId = requestAnimationFrame(gameLoop);
    return;
  }

  update(dt);
  drawBackground();
  if (showWalls) drawWalls();
  drawClickMarker();
  drawProjectiles();
  drawParticles();
  drawPlayer();
  if (showWalls) drawHitboxes();
  resetCamera();

  animationFrameId = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (gameOver) return; // mehrere Treffer im selben Frame zählen nur einmal
  gameOver = true;

  const finalScore = Math.floor(score);
  const rank = submitScoreToLeaderboard(score, runHp);
  lastRun = { hp: runHp, rank };
  leaderboardView = runHp;

  resultScore.textContent = finalScore.toLocaleString('de-DE');
  resultLabel.textContent = `${finalScore === 1 ? 'Punkt' : 'Punkte'} · ${runHp} HP`;
  if (rank === 1 && finalScore > 0) resultBadge.textContent = 'Platz 1 · Neuer Rekord';
  else if (rank > 0) resultBadge.textContent = `Platz ${rank}`;
  else resultBadge.textContent = 'Nicht in den Top 5';
  resultBadge.classList.toggle('muted', rank === 0);
  resultLevel.textContent = `Level ${level}`;
  resultTime.textContent = formatTime(runTime);

  overlayMode = 'over';
  showSettings = false;
  renderOverlay();

  overlay.classList.remove('hidden');
  startButton.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Champion-Auswahl: Liste, Werte und Icons kommen live aus Riots Data Dragon.
// Die Liste wird zwischengespeichert, damit sie auch ohne Internet erscheint
// (die Icons brauchen dann trotzdem eine Verbindung).
// ---------------------------------------------------------------------------
const DDRAGON = 'https://ddragon.leagueoflegends.com';
const DDRAGON_LANGUAGE = 'de_DE';
const champCacheKey = 'hextech-ddragon-champions';
const selectedChampKey = 'hextech-selected-champion';
const MELEE_RANGE_LIMIT = 300; // Angriffsreichweite darunter gilt als Nahkampf

const TAG_LABELS = {
  Assassin: 'Assassine',
  Fighter: 'Kämpfer',
  Mage: 'Magier',
  Marksman: 'Schütze',
  Support: 'Unterstützer',
  Tank: 'Tank',
};

let champData = null; // { version, list: [...], offline }
let champLoading = null;
let champFilter = { text: '', tag: '', range: '' };

function readChampCache() {
  try {
    const raw = localStorage.getItem(champCacheKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.list) && parsed.version ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeChampCache(data) {
  try {
    localStorage.setItem(champCacheKey, JSON.stringify({ version: data.version, list: data.list }));
  } catch (error) {
    // Speicher voll oder gesperrt: dann eben ohne Zwischenspeicher
  }
}

function readSelectedChampion() {
  try {
    return localStorage.getItem(selectedChampKey);
  } catch (error) {
    return null;
  }
}

function saveSelectedChampion(id) {
  try {
    localStorage.setItem(selectedChampKey, id);
  } catch (error) {
    // nicht speicherbar: Auswahl gilt nur für diese Sitzung
  }
  selectedChampion = id;
}

let selectedChampion = readSelectedChampion();

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function toChampion(raw) {
  return {
    id: String(raw.id),
    name: String(raw.name),
    title: String(raw.title || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    image: raw.image && raw.image.full ? String(raw.image.full) : `${raw.id}.png`,
    stats: raw.stats || {},
  };
}

function loadChampions() {
  if (champData && !champData.offline) return Promise.resolve(champData);
  if (champLoading) return champLoading;

  champLoading = (async () => {
    const cached = readChampCache();
    try {
      const versions = await fetchJson(`${DDRAGON}/api/versions.json`);
      const version = String(versions[0]);
      if (cached && cached.version === version) {
        champData = { ...cached, offline: false };
        return champData;
      }
      const json = await fetchJson(`${DDRAGON}/cdn/${version}/data/${DDRAGON_LANGUAGE}/champion.json`);
      const list = Object.values(json.data || {})
        .map(toChampion)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      champData = { version, list, offline: false };
      writeChampCache(champData);
      return champData;
    } catch (error) {
      if (cached) {
        champData = { ...cached, offline: true };
        return champData;
      }
      throw error;
    } finally {
      champLoading = null;
    }
  })();

  return champLoading;
}

function champIconUrl(champ) {
  return `${DDRAGON}/cdn/${champData.version}/img/champion/${encodeURIComponent(champ.image)}`;
}

function isMelee(champ) {
  return Number(champ.stats.attackrange) < MELEE_RANGE_LIMIT;
}

function normalizeText(value) {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function findChampion(id) {
  if (!id) return null;
  const list = champData ? champData.list : (readChampCache() || {}).list || [];
  return list.find((champ) => champ.id === id) || null;
}

// Icon mit Ersatz-Initiale, falls das Bild nicht lädt (z. B. ohne Internet)
function createChampIcon(champ) {
  const wrap = document.createElement('span');
  wrap.className = 'champ-icon';
  wrap.textContent = champ.name.charAt(0);
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.src = champIconUrl(champ);
  img.addEventListener('error', () => img.remove());
  wrap.append(img);
  return wrap;
}

function filteredChampions() {
  const text = normalizeText(champFilter.text);
  return champData.list.filter((champ) => {
    if (text && !normalizeText(champ.name).includes(text)) return false;
    if (champFilter.tag && !champ.tags.includes(champFilter.tag)) return false;
    if (champFilter.range === 'melee' && !isMelee(champ)) return false;
    if (champFilter.range === 'ranged' && isMelee(champ)) return false;
    return true;
  });
}

function renderChampGrid() {
  champGrid.replaceChildren();
  const list = filteredChampions();

  if (!list.length) {
    const message = document.createElement('div');
    message.className = 'cs-message';
    message.textContent = 'Kein Champion passt zu deiner Suche.';
    champGrid.append(message);
    return;
  }

  for (const champ of list) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'champ-tile';
    tile.dataset.id = champ.id;
    tile.title = champ.name;
    if (champ.id === selectedChampion) tile.classList.add('selected');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = champ.name;
    tile.append(createChampIcon(champ), name);
    tile.addEventListener('click', () => selectChampion(champ.id));
    champGrid.append(tile);
  }
}

function formatStat(value, digits = 0) {
  const number = Number(value) || 0;
  return number.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function renderChampInfo() {
  champInfo.replaceChildren();
  const champ = findChampion(selectedChampion);

  if (!champ || !champData) {
    const hint = document.createElement('p');
    hint.textContent = 'Wähle links einen Champion. Seine Werte erscheinen hier.';
    champInfo.append(hint);
    return;
  }

  const st = champ.stats;
  const title = document.createElement('h3');
  title.textContent = champ.name;
  const subtitle = document.createElement('p');
  subtitle.className = 'title';
  subtitle.textContent = champ.title;

  const tags = document.createElement('div');
  tags.className = 'cs-tags';
  for (const tag of [...champ.tags.map((t) => TAG_LABELS[t] || t), isMelee(champ) ? 'Nahkampf' : 'Fernkampf']) {
    const chip = document.createElement('span');
    chip.textContent = tag;
    tags.append(chip);
  }

  const stats = document.createElement('dl');
  stats.className = 'cs-stats';
  const rows = [
    ['Leben', formatStat(st.hp), `+${formatStat(st.hpperlevel)}/Lvl`],
    ['Rüstung', formatStat(st.armor), `+${formatStat(st.armorperlevel, 1)}/Lvl`],
    ['Angriffsschaden', formatStat(st.attackdamage), `+${formatStat(st.attackdamageperlevel, 1)}/Lvl`],
    ['Angriffstempo', formatStat(st.attackspeed, 3), `+${formatStat(st.attackspeedperlevel, 1)} %/Lvl`],
    ['Reichweite', formatStat(st.attackrange), ''],
    ['Lauftempo', formatStat(st.movespeed), ''],
    ...(typeof LH_ATTACK_DATA !== 'undefined' && LH_ATTACK_DATA[champ.id]
      ? [
          ['Animation', `${formatStat(LH_ATTACK_DATA[champ.id][0] * 100, 1)} %`, ''],
          ['Projektil', LH_ATTACK_DATA[champ.id][1] ? formatStat(LH_ATTACK_DATA[champ.id][1]) : (isMelee(champ) ? 'Nahkampf' : '–'), ''],
        ]
      : []),
  ];
  for (const [label, value, growth] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (growth) {
      const small = document.createElement('small');
      small.textContent = ` ${growth}`;
      dd.append(small);
    }
    stats.append(dt, dd);
  }

  const source = document.createElement('p');
  source.className = 'source';
  source.textContent = `Werte auf Level 1 · Data Dragon ${champData.version}`;

  const passive = typeof LH_PASSIVES !== 'undefined' ? LH_PASSIVES[champ.id] : null;
  const parts = [createChampIcon(champ), title, subtitle, tags];
  if (passive) {
    // kurze Markierung oben, ausführliche Beschreibung unter den Werten
    const badge = document.createElement('p');
    badge.className = 'passive-note on';
    badge.textContent = `✓ Passive berechnet: ${passive.name}`;
    parts.push(badge, stats);
    const detail = document.createElement('p');
    detail.className = 'passive-note';
    detail.textContent = passive.summary;
    parts.push(detail);
  } else {
    const note = document.createElement('p');
    note.className = 'passive-note';
    note.textContent = 'Auto-Angriffe werden ohne Passiv-Bonus berechnet.';
    parts.push(stats, note);
  }
  parts.push(source);
  champInfo.append(...parts);
}

function renderChampStatus() {
  const champ = findChampion(selectedChampion);
  const startBtn = document.getElementById('champStart');
  startBtn.disabled = !champ;
  startBtn.title = champ ? '' : 'Wähle zuerst einen Champion';
  champStatus.textContent = champ
    ? `Bereit mit ${champ.name}. Rechtsklick auf einen Minion greift an, S stoppt.`
    : 'Wähle einen Champion, um das Training zu starten.';
}

function selectChampion(id) {
  saveSelectedChampion(id);
  champGrid.querySelectorAll('.champ-tile').forEach((tile) => {
    tile.classList.toggle('selected', tile.dataset.id === id);
  });
  renderChampInfo();
  renderChampStatus();
}

function showChampMessage(text, withRetry) {
  champGrid.replaceChildren();
  const message = document.createElement('div');
  message.className = 'cs-message';
  message.textContent = text;
  if (withRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Erneut versuchen';
    retry.addEventListener('click', () => refreshChampSelect());
    message.append(document.createElement('br'), retry);
  }
  champGrid.append(message);
}

async function refreshChampSelect() {
  showChampMessage('Champions werden geladen …', false);
  champInfo.replaceChildren();
  try {
    await loadChampions();
    renderChampGrid();
    renderChampInfo();
    renderChampStatus();
    if (champData.offline) {
      champStatus.textContent = 'Offline: gespeicherte Champion-Liste, Icons fehlen eventuell.';
    }
  } catch (error) {
    showChampMessage('Die Champion-Liste konnte nicht geladen werden. Dafür ist eine Internetverbindung nötig.', true);
    champStatus.textContent = '';
  }
}

function openChampSelect() {
  if (typeof lhStop === 'function') lhStop();
  lhResultEl.hidden = true;
  menuEl.hidden = true;
  panelEl.hidden = true;
  champEl.hidden = false;
  overlay.classList.remove('hidden');
  refreshChampSelect();
  champSearch.focus({ preventScroll: true });
}

function readLastMode() {
  try {
    return localStorage.getItem(lastModeStorageKey);
  } catch (error) {
    return null;
  }
}

function saveLastMode(mode) {
  try {
    localStorage.setItem(lastModeStorageKey, mode);
  } catch (error) {
    // nicht speicherbar: kein Problem, die Markierung fehlt dann nur
  }
}

// Startseite: Rekord der gewählten HP-Stufe und Markierung des zuletzt gespielten Modus
function renderMenu() {
  const best = (readLeaderboards()[selectedHp] || [])[0];
  recordHpEl.textContent = String(selectedHp);
  recordValueEl.textContent = best ? best.score.toLocaleString('de-DE') : 'noch kein Wert';
  recordValueEl.classList.toggle('none', !best);

  const wasLast = readLastMode() === 'dodge';
  lastBadge.hidden = !wasLast;
  cardDodge.classList.toggle('last', wasLast);

  const champ = findChampion(selectedChampion);
  lhChampionEl.textContent = champ ? champ.name : 'noch keiner gewählt';
  lhChampionEl.classList.toggle('none', !champ);
  cardLastHit.classList.toggle('last', readLastMode() === 'lasthit');
  if (typeof lhRenderCard === 'function') lhRenderCard();
}

// Zurück zur Startseite (Modus wechseln)
// ---------------------------------------------------------------------------
// Pause (Esc): Spiel anhalten, weiterspielen oder den Run abbrechen
// ---------------------------------------------------------------------------
function canPause() {
  return hasStarted && !gameOver && !paused && overlay.classList.contains('hidden');
}

function pauseGame() {
  if (!canPause()) return;
  paused = true;
  pointerHeld = false;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;

  document.getElementById('pauseInfo').textContent =
    gameMode === 'lasthit'
      ? `${lhFormatClock(lh.time)} · ${lh.cs} CS · Level ${lh.level}`
      : `Score ${Math.floor(score)} · ${player.hp} HP · Level ${level}`;

  menuEl.hidden = true;
  champEl.hidden = true;
  panelEl.hidden = true;
  lhResultEl.hidden = true;
  pausePanel.hidden = false;
  overlay.classList.remove('hidden');
  document.getElementById('resumeButton').focus({ preventScroll: true });
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  pausePanel.hidden = true;
  overlay.classList.add('hidden');
  lastTime = 0; // kein Zeitsprung nach der Pause
  animationFrameId = requestAnimationFrame(gameLoop);
}

// Neu starten: Run verwerfen (nicht speichern) und mit denselben Einstellungen neu beginnen
function restartRun() {
  paused = false;
  pausePanel.hidden = true;
  if (gameMode === 'lasthit') startLastHit();
  else startGame();
}

// Run abbrechen: zurück zur Startseite, der Run wird nicht gespeichert
function abortRun() {
  paused = false;
  pausePanel.hidden = true;
  showMenu();
}

function showMenu() {
  paused = false;
  pausePanel.hidden = true;
  if (typeof lhStop === 'function') lhStop();
  gameMode = 'dodge';
  setHudMode('dodge');
  lhResultEl.hidden = true;
  resetGame();
  hasStarted = false;
  overlayMode = 'start';
  showSettings = false;
  lastRun = null;

  menuEl.hidden = false;
  panelEl.hidden = true;
  champEl.hidden = true;
  overlay.classList.remove('hidden');
  renderMenu();
  redrawIdleScreen();
}

// Dodge-Overlay: HP wählen, Bestenliste ansehen, starten
function openDodge() {
  lhResultEl.hidden = true;
  menuEl.hidden = true;
  champEl.hidden = true;
  panelEl.hidden = false;
  overlayMode = 'start';
  showSettings = false;
  renderOverlay();
  startButton.focus({ preventScroll: true });
}

function startGame() {
  if (nameInput) {
    nameInput.value = sanitizeName(nameInput.value);
  }

  gameMode = 'dodge';
  setHudMode('dodge');
  resetGame();
  hasStarted = true;
  overlayMode = 'start';
  showSettings = false;
  lastRun = null;
  menuEl.hidden = true;
  champEl.hidden = true;
  panelEl.hidden = false;
  overlay.classList.add('hidden');
  saveLastMode('dodge');

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  lastTime = 0;
  animationFrameId = requestAnimationFrame(gameLoop);
}

// Bewegungsbefehl sofort beim Drücken (nicht erst beim Loslassen)
function issueMoveCommand(event, showMarker) {
  if (!hasStarted || gameOver) return;
  if (gameMode === 'lasthit') lhCancelAttack();

  const world = eventToWorld(event);
  setMoveTarget(world.x, world.y);
  lastTargetUpdate = performance.now();

  if (showMarker) {
    clickMarker.x = moveTarget.x;
    clickMarker.y = moveTarget.y;
    clickMarker.timer = CLICK_MARKER_TIME;
  }
}

canvas.addEventListener('pointerdown', (event) => {
  usingMouse = event.pointerType === 'mouse';
  // Maus: rechte (LoL) oder linke Taste; Touch: Tippen
  if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;

  event.preventDefault();
  pointerHeld = true;
  if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);

  const world = eventToWorld(event);
  mouse.x = world.x;
  mouse.y = world.y;
  // Last Hit: Klick auf einen gegnerischen Minion = angreifen (wie in LoL)
  if (gameMode === 'lasthit' && hasStarted && !gameOver && lhPointerCommand(world)) return;
  issueMoveCommand(event, true);
});

canvas.addEventListener('pointermove', (event) => {
  const world = eventToWorld(event);
  mouse.x = world.x;
  mouse.y = world.y;
  if (event.pointerType === 'mouse') usingMouse = true;

  // Taste gedrückt halten: Ziel folgt dem Cursor (leicht gedrosselt)
  if (pointerHeld && !(gameMode === 'lasthit' && lh.holdAttack) && performance.now() - lastTargetUpdate > 40) {
    issueMoveCommand(event, false);
  }
});

['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => {
  canvas.addEventListener(name, () => {
    pointerHeld = false;
  });
});

// Kein Kontextmenü beim Rechtsklick auf die Arena
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

function isTypingTarget(target) {
  return target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]');
}

window.addEventListener('keydown', (event) => {
  // Esc: Pause an/aus während eines laufenden Runs
  if (event.key === 'Escape' && !event.repeat) {
    if (paused) {
      event.preventDefault();
      resumeGame();
      return;
    }
    if (canPause()) {
      event.preventDefault();
      pauseGame();
      return;
    }
  }
  // R im Pausenfenster: neu starten
  if (paused && !event.repeat && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    restartRun();
    return;
  }
  if (paused) return; // während der Pause keine Spieltasten

  const overlayVisible = !overlay.classList.contains('hidden');
  const onButton = event.target.tagName === 'BUTTON';

  if (event.key === 'Enter' && gameOver && gameMode === 'dodge' && (!onButton || event.target === startButton)) {
    startGame();
    return;
  }

  if (event.key === 'Enter' && gameOver && gameMode === 'lasthit' && (!onButton || event.target.id === 'lhAgain')) {
    startLastHit();
    return;
  }

  // Startseite: 1 = Dodge starten, 2 = Last Hit (noch nicht verfügbar), Enter = zuletzt gespielten Modus starten
  if (overlayVisible && !menuEl.hidden && !event.repeat && !onButton) {
    if (event.key === 'Enter') {
      if (readLastMode() === 'lasthit' && findChampion(selectedChampion)) startLastHit();
      else startGame();
      return;
    }
    if (!isTypingTarget(event.target) && event.key === '1') {
      event.preventDefault();
      startGame();
      return;
    }
    if (!isTypingTarget(event.target) && event.key === '2') {
      event.preventDefault(); // sonst landet die "2" im Suchfeld der Champion-Auswahl
      openChampSelect();
      return;
    }
  }

  // Champion-Auswahl: Escape = zurück zur Startseite
  if (overlayVisible && !champEl.hidden && event.key === 'Escape') {
    showMenu();
    return;
  }

  // Dodge-Overlay vor dem ersten Start: Enter startet
  if (overlayVisible && !panelEl.hidden && !hasStarted && event.key === 'Enter' && !onButton) {
    startGame();
    return;
  }

  // Beim Tippen (z. B. im Namensfeld) keine Spieltasten auslösen
  if (isTypingTarget(event.target)) return;

  const key = event.key.toLowerCase();
  keys[key] = true;

  // Ein Tastendruck = ein Dash (gehaltene Taste wiederholt ihn nicht)
  if (key === 'w' && !event.repeat && hasStarted && !gameOver && gameMode === 'dodge') {
    triggerDash();
  }

  // S = Stopp (wie in LoL)
  if (key === 's' && !event.repeat && hasStarted && !gameOver) {
    stopMoving();
    if (gameMode === 'lasthit') lhCancelAttack();
  }

  // Debug: Wände ein-/ausblenden
  if (key === 'h' && !event.repeat) {
    showWalls = !showWalls;
    if (!hasStarted) redrawIdleScreen();
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.key.toLowerCase()] = false;
});

// Fenster verliert den Fokus: keine Taste bleibt "hängen"
window.addEventListener('blur', () => {
  for (const key of Object.keys(keys)) keys[key] = false;
  pauseGame(); // automatische Pause beim Fensterwechsel (nur während eines laufenden Runs)
});

// Tab gewechselt oder Fenster minimiert: ebenfalls pausieren
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

// Dash-Button für Touch-Geräte
dashButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (hasStarted && !gameOver && gameMode === 'dodge') triggerDash();
});

hpButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedHp = Number(button.dataset.hp);
    leaderboardView = selectedHp;
    hpButtons.forEach((entry) => {
      entry.classList.toggle('active', entry === button);
    });
    renderLeaderboard();

    // Vor dem ersten Start soll das HUD die gewählte HP zeigen
    if (!hasStarted) {
      player.hp = selectedHp;
      updateHUD();
    }
  });
});

boardButtons.forEach((button) => {
  button.addEventListener('click', () => {
    leaderboardView = Number(button.dataset.boardHp);
    renderLeaderboard();
  });
});

startButton.addEventListener('click', () => {
  startGame();
});

// Game Over: Name und HP ändern, statt das Ergebnis zu zeigen
document.getElementById('resumeButton').addEventListener('click', resumeGame);
document.getElementById('abortButton').addEventListener('click', abortRun);
document.getElementById('restartButton').addEventListener('click', restartRun);

settingsButton.addEventListener('click', () => {
  showSettings = true;
  renderOverlay();
});

cardDodge.addEventListener('click', openDodge);
cardLastHit.addEventListener('click', openChampSelect);
document.getElementById('champBack').addEventListener('click', showMenu);

champSearch.addEventListener('input', () => {
  champFilter.text = champSearch.value;
  if (champData) renderChampGrid();
});

champTagButtons.forEach((button) => {
  button.addEventListener('click', () => {
    champFilter.tag = button.dataset.tag;
    champTagButtons.forEach((entry) => entry.classList.toggle('active', entry === button));
    if (champData) renderChampGrid();
  });
});

champRangeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    champFilter.range = button.dataset.range;
    champRangeButtons.forEach((entry) => entry.classList.toggle('active', entry === button));
    if (champData) renderChampGrid();
  });
});
backButton.addEventListener('click', showMenu);

nameInput.addEventListener('input', () => {
  playerLine.textContent = sanitizeName(nameInput.value);
});

renderOverlay();
showMenu();
animationFrameId = null;
requestAnimationFrame(gameLoop);
