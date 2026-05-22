const ROWS = 8;
const COLS = 8;
const TYPES = 6;
const SWAP_MS = 320;
const CAT_IMAGES = [
  "cat1.jpg",
  "cat2.jpg",
  "cat3.jpg",
  "cat4.jpg",
  "cat5.jpg",
  "cat6.jpg",
];

const LEVELS = [
  { level: 1, targetScore: 3000, moves: 25, name: "入门喵喵" },
  { level: 2, targetScore: 5000, moves: 28, name: "初级喵士" },
  { level: 3, targetScore: 8000, moves: 30, name: "中级喵师" },
  { level: 4, targetScore: 12000, moves: 32, name: "高级喵师" },
  { level: 5, targetScore: 16000, moves: 30, name: "喵星达人" },
  { level: 6, targetScore: 20000, moves: 30, name: "喵星大师" },
  { level: 7, targetScore: 25000, moves: 28, name: "喵神降临" },
  { level: 8, targetScore: 30000, moves: 28, name: "传说喵皇" },
];

const SPECIAL = {
  STRIPE_H: "stripe-h",
  STRIPE_V: "stripe-v",
  BOMB: "bomb",
  RAINBOW: "rainbow",
};

let grid = [];
let selected = null;
let score = 0;
let moves = 0;
let busy = false;
let gameOver = false;
let lastSwap = null;
let currentLevel = 0;

const boardEl = document.getElementById("board");
const fxLayerEl = document.getElementById("fx-layer");
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const PARTICLE_COLORS = ["#ff8fab", "#ffd166", "#fff", "#ffb7c5", "#ffc8dd", "#e85d8a"];
const movesEl = document.getElementById("moves");
const targetEl = document.getElementById("target");
const overlayEl = document.getElementById("overlay");
const overlayMsgEl = document.getElementById("overlay-msg");
const restartBtn = document.getElementById("restart-btn");
const nextLevelBtn = document.getElementById("next-level-btn");

function tile(type, special = null) {
  return { type, special };
}

function randomTile() {
  return tile(randomType());
}

function randomType() {
  return Math.floor(Math.random() * TYPES);
}

function cloneTile(t) {
  return t ? tile(t.type, t.special) : null;
}

function isEmpty(t) {
  return t == null;
}

function hasSpecial(t) {
  return t && t.special;
}

function canMatch3(t) {
  return t && t.special !== SPECIAL.RAINBOW;
}

function sameColor(a, b) {
  return a && b && a.type === b.type;
}

function createGrid() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      let type;
      do {
        type = randomType();
      } while (wouldCreateMatch(r, c, type));
      grid[r][c] = tile(type);
    }
  }
}

function wouldCreateMatch(r, c, type) {
  if (c >= 2 && grid[r][c - 1]?.type === type && grid[r][c - 2]?.type === type) return true;
  if (r >= 2 && grid[r - 1][c]?.type === type && grid[r - 2][c]?.type === type) return true;
  return false;
}

function render() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellData = grid[r][c];
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (cellData) {
        const img = document.createElement("img");
        img.src = CAT_IMAGES[cellData.type];
        img.alt = `猫咪 ${cellData.type + 1}`;
        cell.appendChild(img);
        if (cellData.special) {
          cell.classList.add(`special-${cellData.special}`);
          const aura = document.createElement("span");
          aura.className = "special-aura";
          aura.setAttribute("aria-hidden", "true");
          cell.appendChild(aura);
          const badge = document.createElement("span");
          badge.className = "special-badge";
          badge.setAttribute("aria-hidden", "true");
          badge.textContent = specialBadgeText(cellData.special);
          cell.appendChild(badge);
        }
      }
      if (selected && selected.r === r && selected.c === c) {
        cell.classList.add("selected");
      }
      cell.addEventListener("click", () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function specialBadgeText(special) {
  if (special === SPECIAL.STRIPE_H) return "横";
  if (special === SPECIAL.STRIPE_V) return "竖";
  if (special === SPECIAL.BOMB) return "💥";
  if (special === SPECIAL.RAINBOW) return "🌈";
  return "";
}

function getCellEl(r, c) {
  return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function onCellClick(r, c) {
  if (busy || gameOver || isEmpty(grid[r][c])) return;
  clearHints();
  if (!selected) {
    selected = { r, c };
    render();
    return;
  }
  if (selected.r === r && selected.c === c) {
    selected = null;
    render();
    return;
  }
  if (isAdjacent(selected, { r, c })) {
    trySwap(selected.r, selected.c, r, c);
  } else {
    selected = { r, c };
    render();
  }
}

function isAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

function waitTransform(el, ms = SWAP_MS + 40) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target === el && e.propertyName === "transform") finish();
    };
    el.addEventListener("transitionend", onEnd);
    setTimeout(finish, ms);
  });
}

async function animateSwapCells(r1, c1, r2, c2) {
  const el1 = getCellEl(r1, c1);
  const el2 = getCellEl(r2, c2);
  if (!el1 || !el2) {
    await sleep(SWAP_MS);
    return;
  }
  const rect1 = el1.getBoundingClientRect();
  const rect2 = el2.getBoundingClientRect();
  const dx = rect2.left - rect1.left;
  const dy = rect2.top - rect1.top;
  el1.classList.add("swapping");
  el2.classList.add("swapping");
  el1.style.zIndex = "6";
  el2.style.zIndex = "6";
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  el1.style.transform = `translate(${dx}px, ${dy}px)`;
  el2.style.transform = `translate(${-dx}px, ${-dy}px)`;
  await Promise.all([waitTransform(el1), waitTransform(el2)]);
}

async function trySwap(r1, c1, r2, c2) {
  busy = true;
  selected = null;
  clearHints();
  lastSwap = { r1, c1, r2, c2 };

  await animateSwapCells(r1, c1, r2, c2);
  swap(r1, c1, r2, c2);
  render();

  const a = grid[r1][c1];
  const b = grid[r2][c2];
  const specialSwap = a?.special || b?.special;

  if (specialSwap) {
    const ok = await handleSpecialSwap(r1, c1, r2, c2);
    if (!ok) {
      await animateSwapCells(r1, c1, r2, c2);
      swap(r1, c1, r2, c2);
      render();
      lastSwap = null;
      busy = false;
      return;
    }
    moves--;
    movesEl.textContent = moves;
    await settleBoard();
    checkEnd();
    lastSwap = null;
    busy = false;
    return;
  }

  const { matched } = findMatchData();
  if (matched.size === 0) {
    await animateSwapCells(r1, c1, r2, c2);
    swap(r1, c1, r2, c2);
    render();
    lastSwap = null;
    busy = false;
    return;
  }

  moves--;
  movesEl.textContent = moves;
  await resolveMatches();
  checkEnd();
  lastSwap = null;
  busy = false;
}

function swap(r1, c1, r2, c2) {
  const t = grid[r1][c1];
  grid[r1][c1] = grid[r2][c2];
  grid[r2][c2] = t;
}

function key(r, c) {
  return `${r},${c}`;
}

function parseKey(k) {
  const [r, c] = k.split(",").map(Number);
  return { r, c };
}

function pickSpawn(coords, swap) {
  if (swap) {
    for (const [r, c] of [
      [swap.r1, swap.c1],
      [swap.r2, swap.c2],
    ]) {
      if (coords.some((p) => p.r === r && p.c === c)) return { r, c };
    }
  }
  return coords[Math.floor(coords.length / 2)];
}

function findMatchData() {
  const matched = new Set();
  const runs = [];

  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const t = grid[r][c];
      if (!canMatch3(t)) {
        c++;
        continue;
      }
      let len = 1;
      while (
        c + len < COLS &&
        canMatch3(grid[r][c + len]) &&
        grid[r][c + len].type === t.type
      ) {
        len++;
      }
      if (len >= 3) {
        const cells = [];
        for (let i = 0; i < len; i++) {
          const k = key(r, c + i);
          matched.add(k);
          cells.push(k);
        }
        runs.push({ cells, dir: "h", len, type: t.type });
      }
      c += len || 1;
    }
  }

  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const t = grid[r][c];
      if (!canMatch3(t)) {
        r++;
        continue;
      }
      let len = 1;
      while (
        r + len < ROWS &&
        canMatch3(grid[r + len][c]) &&
        grid[r + len][c].type === t.type
      ) {
        len++;
      }
      if (len >= 3) {
        const cells = [];
        for (let i = 0; i < len; i++) {
          const k = key(r + i, c);
          matched.add(k);
          cells.push(k);
        }
        runs.push({ cells, dir: "v", len, type: t.type });
      }
      r += len || 1;
    }
  }

  return { matched, runs };
}

function hasLTShape(matched, runs) {
  const hRuns = runs.filter((x) => x.dir === "h" && x.len >= 3);
  const vRuns = runs.filter((x) => x.dir === "v" && x.len >= 3);
  if (!hRuns.length || !vRuns.length || matched.size < 5) return false;
  const hasStraight5 = runs.some((x) => x.len >= 5);
  return !hasStraight5;
}

function detectSpecialCreation(matched, runs) {
  if (matched.size < 4) return null;

  const coords = [...matched].map(parseKey);
  const spawn = pickSpawn(coords, lastSwap);
  const baseType = grid[spawn.r][spawn.c]?.type ?? 0;

  const line5 = runs.find((x) => x.len >= 5);
  if (line5) {
    return { spawn, special: SPECIAL.RAINBOW, type: line5.type };
  }

  if (hasLTShape(matched, runs)) {
    return { spawn, special: SPECIAL.BOMB, type: baseType };
  }

  const line4 = runs.find((x) => x.len >= 4);
  if (line4) {
    const sp = pickSpawn(line4.cells.map(parseKey), lastSwap);
    const special = line4.dir === "h" ? SPECIAL.STRIPE_H : SPECIAL.STRIPE_V;
    return { spawn: sp, special, type: line4.type };
  }

  return null;
}

function isValidCell(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function cellsInRow(r) {
  const s = new Set();
  if (!isValidCell(r, 0)) return s;
  for (let c = 0; c < COLS; c++) s.add(key(r, c));
  return s;
}

function cellsInCol(c) {
  const s = new Set();
  if (!isValidCell(0, c)) return s;
  for (let r = 0; r < ROWS; r++) s.add(key(r, c));
  return s;
}

function addCrossLines(centerR, centerC, target) {
  for (let dr = -1; dr <= 1; dr++) {
    cellsInRow(centerR + dr).forEach((k) => target.add(k));
  }
  for (let dc = -1; dc <= 1; dc++) {
    cellsInCol(centerC + dc).forEach((k) => target.add(k));
  }
}

function comboStripeBombCells(stripeR, stripeC, stripeTile, bombR, bombC) {
  const cells = new Set();
  activateStripe(stripeR, stripeC, stripeTile).forEach((k) => cells.add(k));
  activateBomb(bombR, bombC).forEach((k) => cells.add(k));
  addCrossLines(stripeR, stripeC, cells);
  return cells;
}

function cellsInBomb(r, c) {
  const s = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) s.add(key(nr, nc));
    }
  }
  return s;
}

function cellsOfColor(colorType) {
  const s = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] && grid[r][c].type === colorType) s.add(key(r, c));
    }
  }
  return s;
}

function allCells() {
  const s = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) s.add(key(r, c));
    }
  }
  return s;
}

function activateStripe(r, c, stripeTile) {
  const cells = new Set();
  if (stripeTile.special === SPECIAL.STRIPE_H) {
    cellsInRow(r).forEach((k) => cells.add(k));
  } else {
    cellsInCol(c).forEach((k) => cells.add(k));
  }
  return cells;
}

function activateBomb(r, c) {
  return cellsInBomb(r, c);
}

async function clearCells(cellSet, combo, label, opts = {}) {
  const { skipMatchAnim = false, effectCenter = null } = opts;
  const valid = new Set();
  cellSet.forEach((k) => {
    const { r, c } = parseKey(k);
    if (isValidCell(r, c)) valid.add(k);
  });
  if (valid.size === 0) return;

  const totalPoints = valid.size * 12 * combo;
  if (!skipMatchAnim) {
    valid.forEach((k) => {
      const { r, c } = parseKey(k);
      const el = getCellEl(r, c);
      if (el) el.classList.add("matching");
    });
    playMatchEffects(valid, combo, totalPoints, label);
    await sleep(450);
  } else {
    showComboLabel(combo, label);
    if (effectCenter) {
      const pos = getCellCenter(effectCenter.r, effectCenter.c);
      if (pos) {
        spawnBurst(pos.x, pos.y);
        showScorePopup(pos.x, pos.y, totalPoints);
      }
    }
    await sleep(220);
  }
  score += totalPoints;
  scoreEl.textContent = score;
  valid.forEach((k) => {
    const { r, c } = parseKey(k);
    grid[r][c] = null;
  });
}

async function handleSpecialSwap(r1, c1, r2, c2) {
  const a = grid[r1][c1];
  const b = grid[r2][c2];
  if (!a || !b) return false;

  if (a.special === SPECIAL.RAINBOW && b.special === SPECIAL.RAINBOW) {
    await clearCells(allCells(), 1, "彩虹风暴！");
    return true;
  }

  const rainbow = a.special === SPECIAL.RAINBOW ? a : b.special === SPECIAL.RAINBOW ? b : null;
  const other = rainbow === a ? b : a;
  const rainbowPos = rainbow === a ? { r: r1, c: c1 } : { r: r2, c: c2 };

  if (rainbow) {
    if (other.special === SPECIAL.BOMB) {
      return await comboRainbowBomb(other.type);
    }
    if (other.special === SPECIAL.STRIPE_H || other.special === SPECIAL.STRIPE_V) {
      return await comboRainbowStripe(other.type, other.special);
    }
    return await comboRainbowColor(other.type, rainbowPos);
  }

  if (a.special && b.special) {
    return await comboTwoSpecials(r1, c1, r2, c2, a, b);
  }

  const single = a.special ? { tile: a, r: r1, c: c1 } : { tile: b, r: r2, c: c2 };
  const cells = activateSingleSpecial(single.r, single.c, single.tile);
  await clearCells(cells, 1, specialLabel(single.tile.special));
  return true;
}

function activateSingleSpecial(r, c, t) {
  if (t.special === SPECIAL.STRIPE_H || t.special === SPECIAL.STRIPE_V) {
    return activateStripe(r, c, t);
  }
  if (t.special === SPECIAL.BOMB) return activateBomb(r, c);
  return new Set([key(r, c)]);
}

function specialLabel(special) {
  if (special === SPECIAL.STRIPE_H) return "横向扫喵！";
  if (special === SPECIAL.STRIPE_V) return "竖向扫喵！";
  if (special === SPECIAL.BOMB) return "喵喵爆破！";
  return "";
}

const VORTEX_MS = 720;

async function playRainbowVortex(colorType, rainbowPos, cellKeys) {
  const center = getCellCenter(rainbowPos.r, rainbowPos.c);
  if (!center || !fxLayerEl) {
    await sleep(VORTEX_MS);
    return;
  }

  const vortex = document.createElement("div");
  vortex.className = "rainbow-vortex";
  vortex.style.left = `${center.x}px`;
  vortex.style.top = `${center.y}px`;
  fxLayerEl.appendChild(vortex);

  const ring = document.createElement("div");
  ring.className = "rainbow-vortex-ring";
  ring.style.left = `${center.x}px`;
  ring.style.top = `${center.y}px`;
  fxLayerEl.appendChild(ring);

  const pieces = [];
  cellKeys.forEach((k) => {
    const { r, c } = parseKey(k);
    const pos = getCellCenter(r, c);
    if (!pos) return;

    const cellEl = getCellEl(r, c);
    if (cellEl) cellEl.classList.add("vortex-sucked");

    const fly = document.createElement("div");
    fly.className = "vortex-suction-piece";
    const img = document.createElement("img");
    img.src = CAT_IMAGES[colorType];
    img.alt = "";
    fly.appendChild(img);

    const dx = center.x - pos.x;
    const dy = center.y - pos.y;
    const dist = Math.hypot(dx, dy);
    fly.style.left = `${pos.x}px`;
    fly.style.top = `${pos.y}px`;
    fly.style.setProperty("--dx", `${dx}px`);
    fly.style.setProperty("--dy", `${dy}px`);
    fly.style.setProperty("--rot", `${360 + dist * 0.8}deg`);
    fly.style.animationDelay = `${Math.min(dist / 280, 0.35)}s`;
    fxLayerEl.appendChild(fly);
    pieces.push(fly);
  });

  if (cellKeys.size > 0) {
    boardEl.classList.add("vortex-active");
  }

  await sleep(VORTEX_MS);

  vortex.remove();
  ring.remove();
  pieces.forEach((p) => p.remove());
  boardEl.querySelectorAll(".vortex-sucked").forEach((el) => el.classList.remove("vortex-sucked"));
  boardEl.classList.remove("vortex-active");
}

async function comboRainbowColor(colorType, rainbowPos) {
  const cells = cellsOfColor(colorType);
  cells.add(key(rainbowPos.r, rainbowPos.c));
  await playRainbowVortex(colorType, rainbowPos, cells);
  await clearCells(cells, 1, "彩虹喵！", {
    skipMatchAnim: true,
    effectCenter: rainbowPos,
  });
  return true;
}

async function comboRainbowStripe(colorType, stripeKind) {
  const targets = [...cellsOfColor(colorType)];
  const toClear = new Set();
  const stripes = [];

  targets.forEach((k) => {
    const { r, c } = parseKey(k);
    const sp = Math.random() < 0.5 ? stripeKind : stripeKind === SPECIAL.STRIPE_H ? SPECIAL.STRIPE_V : SPECIAL.STRIPE_H;
    grid[r][c] = tile(colorType, sp);
    stripes.push({ r, c, tile: grid[r][c] });
  });

  render();
  await sleep(200);

  stripes.forEach(({ r, c, tile: t }) => {
    activateStripe(r, c, t).forEach((k) => toClear.add(k));
  });

  await clearCells(toClear, 2, "彩虹扫喵！");
  return true;
}

async function comboRainbowBomb(colorType) {
  const targets = [...cellsOfColor(colorType)];
  const toClear = new Set();

  targets.forEach((k) => {
    const { r, c } = parseKey(k);
    grid[r][c] = tile(colorType, SPECIAL.BOMB);
  });
  render();
  await sleep(200);

  targets.forEach((k) => {
    const { r, c } = parseKey(k);
    activateBomb(r, c).forEach((kk) => toClear.add(kk));
  });

  await clearCells(toClear, 2, "全屏爆破喵！");
  return true;
}

async function comboTwoSpecials(r1, c1, r2, c2, a, b) {
  const toClear = new Set();
  toClear.add(key(r1, c1));
  toClear.add(key(r2, c2));

  const stripeA = a.special === SPECIAL.STRIPE_H || a.special === SPECIAL.STRIPE_V;
  const stripeB = b.special === SPECIAL.STRIPE_H || b.special === SPECIAL.STRIPE_V;
  const bombA = a.special === SPECIAL.BOMB;
  const bombB = b.special === SPECIAL.BOMB;

  if (stripeA && stripeB) {
    activateStripe(r1, c1, a).forEach((k) => toClear.add(k));
    activateStripe(r2, c2, b).forEach((k) => toClear.add(k));
    await clearCells(toClear, 2, "十字扫喵！");
  } else if ((stripeA && bombB) || (stripeB && bombA)) {
    const sr = stripeA ? r1 : r2;
    const sc = stripeA ? c1 : c2;
    const br = bombA ? r1 : r2;
    const bc = bombA ? c1 : c2;
    const st = stripeA ? a : b;
    comboStripeBombCells(sr, sc, st, br, bc).forEach((k) => toClear.add(k));
    await clearCells(toClear, 2, "扫爆组合！");
  } else if (bombA && bombB) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r1 + dr;
        const nc = c1 + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) toClear.add(key(nr, nc));
      }
    }
    await clearCells(toClear, 2, "超级大爆破！");
  } else {
    activateSingleSpecial(r1, c1, a).forEach((k) => toClear.add(k));
    activateSingleSpecial(r2, c2, b).forEach((k) => toClear.add(k));
    await clearCells(toClear, 2, "特效组合！");
  }

  return true;
}

async function settleBoard() {
  applyGravity();
  refill();
  render();
  await sleep(280);
  await resolveMatches();
}

function getCellCenter(r, c) {
  const el = getCellEl(r, c);
  if (!el || !fxLayerEl) return null;
  const cellRect = el.getBoundingClientRect();
  const layerRect = fxLayerEl.getBoundingClientRect();
  return {
    x: cellRect.left + cellRect.width / 2 - layerRect.left,
    y: cellRect.top + cellRect.height / 2 - layerRect.top,
  };
}

function spawnParticles(x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const isPaw = i % 4 === 0;
    p.className = isPaw ? "particle paw" : "particle";
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const dist = 28 + Math.random() * 36;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
    if (isPaw) {
      p.textContent = "🐾";
    } else {
      p.style.background = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    }
    p.style.animationDelay = `${Math.random() * 0.06}s`;
    fxLayerEl.appendChild(p);
    setTimeout(() => p.remove(), 650);
  }
}

function spawnBurst(x, y) {
  ["", " inner"].forEach((extra, i) => {
    const ring = document.createElement("span");
    ring.className = `burst-ring${extra}`;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.animationDelay = `${i * 0.05}s`;
    fxLayerEl.appendChild(ring);
    setTimeout(() => ring.remove(), 550);
  });
}

function showScorePopup(x, y, points) {
  const pop = document.createElement("span");
  pop.className = "score-popup";
  pop.textContent = `+${points}`;
  pop.style.left = `${x + (Math.random() - 0.5) * 20}px`;
  pop.style.top = `${y}px`;
  fxLayerEl.appendChild(pop);
  setTimeout(() => pop.remove(), 800);
}

function showComboLabel(combo, customText) {
  const label = document.createElement("span");
  label.className = "combo-label";
  if (customText) {
    label.textContent = customText;
  } else if (combo >= 4) {
    label.textContent = `超级连喵 ×${combo}!`;
  } else if (combo >= 2) {
    label.textContent = `连喵 ×${combo}!`;
  } else {
    return;
  }
  fxLayerEl.appendChild(label);
  setTimeout(() => label.remove(), 1000);
}

function playMatchEffects(matches, combo, totalPoints, customText) {
  const centers = [];
  matches.forEach((k) => {
    const { r, c } = parseKey(k);
    const pos = getCellCenter(r, c);
    if (!pos) return;
    centers.push(pos);
    spawnBurst(pos.x, pos.y);
    spawnParticles(pos.x, pos.y, 8);
  });

  if (centers.length > 0) {
    const avg = centers.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    avg.x /= centers.length;
    avg.y /= centers.length;
    showScorePopup(avg.x, avg.y, totalPoints);
  }

  showComboLabel(combo, customText);

  if (combo >= 2) {
    boardEl.classList.add("shake");
    setTimeout(() => boardEl.classList.remove("shake"), 420);
  }

  scoreEl.classList.add("score-bump");
  setTimeout(() => scoreEl.classList.remove("score-bump"), 350);
}

async function resolveMatches() {
  let combo = 0;
  while (true) {
    const { matched, runs } = findMatchData();
    if (matched.size === 0) break;
    combo++;

    const creation = detectSpecialCreation(matched, runs);
    const spawnKey = creation ? key(creation.spawn.r, creation.spawn.c) : null;
    const toClear = new Set(matched);

    matched.forEach((k) => {
      const { r, c } = parseKey(k);
      const t = grid[r][c];
      if (!t?.special) return;
      if (t.special === SPECIAL.STRIPE_H || t.special === SPECIAL.STRIPE_V) {
        activateStripe(r, c, t).forEach((kk) => toClear.add(kk));
      } else if (t.special === SPECIAL.BOMB) {
        activateBomb(r, c).forEach((kk) => toClear.add(kk));
      }
    });

    if (spawnKey) toClear.delete(spawnKey);

    const totalPoints = toClear.size * 10 * combo;

    toClear.forEach((k) => {
      const { r, c } = parseKey(k);
      const el = getCellEl(r, c);
      if (el) el.classList.add("matching");
    });

    const fxLabel = creation ? specialCreateLabel(creation.special) : undefined;
    playMatchEffects(toClear, combo, totalPoints, fxLabel);
    await sleep(450);

    score += totalPoints;
    scoreEl.textContent = score;

    toClear.forEach((k) => {
      const { r, c } = parseKey(k);
      grid[r][c] = null;
    });

    if (creation) {
      const { r, c } = creation.spawn;
      grid[r][c] = tile(creation.type, creation.special);
    }

    applyGravity();
    refill();
    render();
    await sleep(300);
  }
}

function specialCreateLabel(special) {
  if (special === SPECIAL.RAINBOW) return "合成彩虹喵！";
  if (special === SPECIAL.BOMB) return "合成爆破喵！";
  if (special === SPECIAL.STRIPE_H) return "合成横向特效！";
  if (special === SPECIAL.STRIPE_V) return "合成竖向特效！";
  return "";
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c]) {
        grid[write][c] = grid[r][c];
        if (write !== r) grid[r][c] = null;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      grid[r][c] = null;
    }
  }
}

function refill() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!grid[r][c]) grid[r][c] = randomTile();
    }
  }
}

function swapWouldMatch(r1, c1, r2, c2) {
  swap(r1, c1, r2, c2);
  const ok = findMatchData().matched.size > 0;
  swap(r1, c1, r2, c2);
  return ok;
}

function swapWouldActivateSpecial(r1, c1, r2, c2) {
  const a = grid[r1][c1];
  const b = grid[r2][c2];
  return (a?.special || b?.special) && a && b;
}

function hasPossibleMove() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c < COLS - 1) {
        if (swapWouldMatch(r, c, r, c + 1) || swapWouldActivateSpecial(r, c, r, c + 1)) {
          return true;
        }
      }
      if (r < ROWS - 1) {
        if (swapWouldMatch(r, c, r + 1, c) || swapWouldActivateSpecial(r, c, r + 1, c)) {
          return true;
        }
      }
    }
  }
  return false;
}

function clearHints() {
  boardEl.querySelectorAll(".hint").forEach((el) => el.classList.remove("hint"));
}

function shuffleBoard() {
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) tiles.push(cloneTile(grid[r][c]));
    }
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  let idx = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = tiles[idx++];
    }
  }
  if (findMatchData().matched.size > 0 || !hasPossibleMove()) {
    createGrid();
  }
}

function getCurrentLevelData() {
  return LEVELS[currentLevel] || LEVELS[0];
}

function checkEnd() {
  const levelData = getCurrentLevelData();
  if (score >= levelData.targetScore) {
    endGame(true);
    return;
  }
  if (moves <= 0) {
    endGame(score >= levelData.targetScore);
    return;
  }
  if (!hasPossibleMove()) {
    shuffleBoard();
    render();
  }
}

function endGame(won) {
  gameOver = true;
  overlayEl.classList.remove("hidden");
  const levelData = getCurrentLevelData();
  
  if (won) {
    const hasNextLevel = currentLevel < LEVELS.length - 1;
    if (hasNextLevel) {
      overlayMsgEl.textContent = `🎉 恭喜过关！\n${levelData.name}\n得分: ${score}`;
      nextLevelBtn.classList.remove("hidden");
      restartBtn.textContent = "重玩本关";
    } else {
      overlayMsgEl.textContent = `🏆 恭喜通关！\n你已经完成了所有关卡！\n最终得分: ${score}`;
      nextLevelBtn.classList.add("hidden");
      restartBtn.textContent = "重新开始";
    }
  } else {
    overlayMsgEl.textContent = `😿 挑战失败！\n目标: ${levelData.targetScore} | 得分: ${score}\n再试一次吧～`;
    nextLevelBtn.classList.add("hidden");
    restartBtn.textContent = "重新挑战";
  }
}

function startLevel(levelIndex) {
  currentLevel = levelIndex;
  const levelData = getCurrentLevelData();
  score = 0;
  moves = levelData.moves;
  gameOver = false;
  busy = false;
  selected = null;
  lastSwap = null;
  
  levelEl.textContent = levelData.level;
  scoreEl.textContent = "0";
  movesEl.textContent = moves;
  targetEl.textContent = levelData.targetScore;
  overlayEl.classList.add("hidden");
  
  createGrid();
  while (findMatchData().matched.size > 0 || !hasPossibleMove()) {
    createGrid();
  }
  render();
}

function resetGame() {
  startLevel(0);
}

function nextLevel() {
  if (currentLevel < LEVELS.length - 1) {
    startLevel(currentLevel + 1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

restartBtn.addEventListener("click", resetGame);
nextLevelBtn.addEventListener("click", nextLevel);

resetGame();
