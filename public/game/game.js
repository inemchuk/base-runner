/* ===== save.js ===== */
/**
 * save.js — Система сохранений (Local Storage)
 * Хранит: рекорды, данные check-in, монеты.
 * Все данные сохраняются в браузере пользователя.
 */

const Save = (() => {

  const KEY = 'crossy_save_v1';

  // Дефолтное состояние нового игрока
  const defaults = () => ({
    bestScore: 0,
    scores: [],          // последние 10 результатов для таблицы лидеров
    coins: 0,
    checkin: {
      lastDate: null,    // строка 'YYYY-MM-DD' по UTC
      streak: 0,
      total: 0,
    }
  });

  // Загрузить данные из localStorage
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  // Сохранить данные в localStorage
  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Не удалось сохранить данные:', e);
    }
  }

  // Добавить новый результат и обновить рекорд
  function addScore(score) {
    const data = load();
    if (score > data.bestScore) data.bestScore = score;

    data.scores.push(score);
    // Оставляем только 10 лучших результатов
    data.scores.sort((a, b) => b - a);
    data.scores = data.scores.slice(0, 10);

    save(data);
    return data.bestScore;
  }

  // Получить текущий рекорд
  function getBest() {
    return load().bestScore;
  }

  // Получить топ-10 результатов
  function getScores() {
    return load().scores;
  }

  // Получить данные check-in
  function getCheckin() {
    return load().checkin;
  }

  // Сохранить данные check-in
  function saveCheckin(checkinData) {
    const data = load();
    data.checkin = checkinData;
    save(data);
  }

  // Добавить монеты
  function addCoins(amount) {
    const data = load();
    data.coins += amount;
    save(data);
    return data.coins;
  }

  function getCoins() {
    return load().coins;
  }

  // Публичный API
  return { load, save, addScore, getBest, getScores, getCheckin, saveCheckin, addCoins, getCoins };

})();


/* ===== checkin.js ===== */
/**
 * checkin.js — Система ежедневного Check-in
 *
 * Правила:
 * - Один check-in в день (сброс в 00:00 UTC)
 * - streak растёт при ежедневных check-in подряд
 * - Пропуск дня → streak сбрасывается в 0
 * - Награда = 10 монет (можно масштабировать со streak)
 */

const CheckIn = (() => {

  // Check if on-chain check-in is available via React hook
  function _hasOnChain() {
    return typeof window !== 'undefined' && window.__BASE_CHECKIN;
  }

  // Получить текущую дату UTC в формате 'YYYY-MM-DD'
  function todayUTC() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Вычислить вчерашнюю дату UTC
  function yesterdayUTC() {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - 1);
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Проверить, доступен ли check-in сегодня
  function isAvailable() {
    if (_hasOnChain()) return window.__BASE_CHECKIN.isAvailable;
    const ci = Save.getCheckin();
    return ci.lastDate !== todayUTC();
  }

  // Выполнить check-in
  function perform() {
    // On-chain check-in: dispatch event to React, tx happens async
    if (_hasOnChain()) {
      if (!window.__BASE_CHECKIN.isAvailable) {
        return { success: false, message: 'Already checked in today. Come back tomorrow!' };
      }
      if (window.__BASE_CHECKIN.isPending) {
        return { success: false, message: 'Transaction in progress...' };
      }
      // Trigger on-chain claim via React hook
      window.dispatchEvent(new CustomEvent('base-checkin-claim'));
      return { success: true, pending: true, message: 'Confirming on-chain...' };
    }

    // Fallback: localStorage check-in
    if (!isAvailable()) {
      return { success: false, message: 'Already claimed today. Come back tomorrow!' };
    }

    const ci = Save.getCheckin();
    const today     = todayUTC();
    const yesterday = yesterdayUTC();

    let newStreak = (ci.lastDate === yesterday) ? ci.streak + 1 : 1;
    let newTotal  = ci.total + 1;

    const DAY_COINS = [5, 5, 5, 10, 10, 20, 30];
    const daySlot = (newStreak - 1) % 7;
    const reward  = DAY_COINS[daySlot];

    const newCheckin = {
      lastDate: today,
      streak:   newStreak,
      total:    newTotal,
    };

    Save.saveCheckin(newCheckin);
    Save.addCoins(reward);

    return {
      success: true,
      streak:  newStreak,
      total:   newTotal,
      coins:   reward,
      message: `+${reward} coins! 🎉`,
    };
  }

  // Получить текущее состояние для отображения UI
  function getState() {
    // On-chain state
    if (_hasOnChain()) {
      const oc = window.__BASE_CHECKIN;
      const DAY_COINS = [5, 5, 5, 10, 10, 20, 30];
      const nextStreak = oc.isAvailable ? oc.streak + 1 : oc.streak;
      return {
        streak:    oc.streak,
        total:     oc.total,
        available: oc.isAvailable,
        isPending: oc.isPending,
        reward:    DAY_COINS[(Math.max(0, nextStreak - 1)) % 7],
      };
    }

    // Fallback: localStorage
    const ci        = Save.getCheckin();
    const available = isAvailable();
    return {
      streak:    ci.streak,
      total:     ci.total,
      available,
      isPending: false,
      reward:    (() => {
        const DAY_COINS = [5, 5, 5, 10, 10, 20, 30];
        const nextStreak = available ? ci.streak + 1 : ci.streak;
        return DAY_COINS[(Math.max(0, nextStreak - 1)) % 7];
      })(),
    };
  }

  return { perform, isAvailable, getState };

})();


/* ===== leaderboard.js ===== */
/**
 * leaderboard.js — Система таблицы лидеров
 * Хранит топ-10 результатов локально.
 * Показывает медали для первых трёх мест.
 */

const Leaderboard = (() => {

  const MEDALS = ['🥇', '🥈', '🥉'];
  let mode = 'personal'; // 'personal' | 'global' | 'coins'

  function setMode(m) {
    mode = m;
    // Update tab styles
    const btnP = document.getElementById('btn-lb-personal');
    const btnG = document.getElementById('btn-lb-global');
    const btnC = document.getElementById('btn-lb-coins');
    if (btnP) btnP.className = 'lb-tab' + (m === 'personal' ? ' lb-tab-active' : '');
    if (btnG) btnG.className = 'lb-tab' + (m === 'global'   ? ' lb-tab-active' : '');
    if (btnC) btnC.className = 'lb-tab' + (m === 'coins'    ? ' lb-tab-active' : '');
    if (m === 'coins') {
      renderCoins();
      // Запускаем загрузку данных если ещё не были загружены
      const fetchFn = window.__BASE_FETCH_COIN_LB;
      if (fetchFn) fetchFn();
    } else {
      render();
    }
  }

  function renderPersonal() {
    const container = document.getElementById('lb-list');
    if (!container) return;
    const scores = Save.getScores();
    if (scores.length === 0) {
      container.innerHTML = '<p class="lb-empty">No scores yet.<br>Play to set a record! 🐔</p>';
      return;
    }
    container.innerHTML = scores.map((score, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const medal = MEDALS[i] || `${i + 1}.`;
      return `<div class="lb-row ${rankClass}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">You</span>
        <span class="lb-pts">${score}</span>
      </div>`;
    }).join('');
  }

  function renderGlobal() {
    const container = document.getElementById('lb-list');
    if (!container) return;
    const onChain = window.__BASE_LEADERBOARD_ENTRIES;
    if (!onChain || onChain.length === 0) {
      container.innerHTML = '<p class="lb-empty">Loading global scores…</p>';
      return;
    }
    container.innerHTML = onChain.map((entry, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const medal = MEDALS[i] || `${i + 1}.`;
      return `<div class="lb-row ${rankClass}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${entry.name}</span>
        <span class="lb-pts">${entry.score}</span>
      </div>`;
    }).join('');
  }

  function renderCoins() {
    const container = document.getElementById('lb-list');
    if (!container) return;
    const entries = window.__BASE_COIN_LB_ENTRIES;
    if (!entries || entries.length === 0) {
      container.innerHTML = '<p class="lb-empty">Loading coin rankings…</p>';
      return;
    }
    container.innerHTML = entries.map((entry, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const medal = MEDALS[i] || `${i + 1}.`;
      return `<div class="lb-row ${rankClass}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${entry.name}</span>
        <span class="lb-pts" style="display:flex;align-items:center;gap:4px;">
          <img src="/game/coin.png" style="width:14px;height:14px;object-fit:contain;"> ${entry.balance}
        </span>
      </div>`;
    }).join('');
  }

  function render() {
    if (mode === 'global') renderGlobal();
    else if (mode === 'coins') renderCoins();
    else renderPersonal();
  }

  // Re-render when данные приходят
  window.addEventListener('base-leaderboard-loaded', () => {
    if (mode === 'global') renderGlobal();
  });
  window.addEventListener('base-coin-lb-loaded', () => {
    if (mode === 'coins') renderCoins();
  });

  return { render, setMode };

})();


/* ===== sound.js ===== */
/**
 * sound.js — Web Audio sound effects
 * All sounds generated procedurally via Web Audio API.
 * No external files needed.
 */

const Sound = (() => {

  let ctx = null;
  let muted = false;

  // Load mute preference
  function init() {
    muted = localStorage.getItem('baserunner_muted') === 'true';
    updateMuteBtn();
  }

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function isMuted() { return muted; }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('baserunner_muted', muted);
    updateMuteBtn();
  }

  function updateMuteBtn() {
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = muted ? '🔇' : '🔊';
  }

  // ── Sound primitives ─────────────────────────────────

  function playTone({ freq = 440, type = 'sine', duration = 0.1,
                      vol = 0.3, attack = 0.005, decay = 0.05,
                      freqEnd = null, detune = 0 } = {}) {
    if (muted) return;
    try {
      const c   = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);

      osc.type      = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (freqEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + duration);
      }
      osc.detune.setValueAtTime(detune, c.currentTime);

      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration + 0.01);
    } catch(e) {}
  }

  function playNoise({ duration = 0.1, vol = 0.2, attack = 0.002,
                       lowFreq = 200, highFreq = 800 } = {}) {
    if (muted) return;
    try {
      const c      = getCtx();
      const buf    = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const src    = c.createBufferSource();
      src.buffer   = buf;

      const filter = c.createBiquadFilter();
      filter.type  = 'bandpass';
      filter.frequency.value = (lowFreq + highFreq) / 2;
      filter.Q.value         = 0.8;

      const gain   = c.createGain();
      src.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);

      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

      src.start(c.currentTime);
      src.stop(c.currentTime + duration + 0.01);
    } catch(e) {}
  }

  // ── Game sounds ──────────────────────────────────────

  // Hop forward
  function jump() {
    playTone({ freq: 380, freqEnd: 520, type: 'square',
               duration: 0.1, vol: 0.18, attack: 0.003 });
  }

  // Step sideways (lighter)
  function step() {
    playTone({ freq: 300, freqEnd: 400, type: 'square',
               duration: 0.07, vol: 0.12, attack: 0.003 });
  }

  // Landing on log
  function log() {
    playTone({ freq: 180, freqEnd: 140, type: 'sine',
               duration: 0.12, vol: 0.22, attack: 0.004 });
    playNoise({ duration: 0.08, vol: 0.1, lowFreq: 150, highFreq: 400 });
  }

  // Death by car
  function death() {
    playNoise({ duration: 0.35, vol: 0.45, attack: 0.002, lowFreq: 80, highFreq: 600 });
    playTone({ freq: 220, freqEnd: 60, type: 'sawtooth',
               duration: 0.4, vol: 0.3, attack: 0.005 });
  }

  // Drowning in water
  function splash() {
    playNoise({ duration: 0.25, vol: 0.35, attack: 0.005, lowFreq: 200, highFreq: 1200 });
    playTone({ freq: 320, freqEnd: 80, type: 'sine',
               duration: 0.3, vol: 0.2, attack: 0.01 });
  }

  // Train warning horn
  function trainHorn() {
    playTone({ freq: 220, type: 'sawtooth', duration: 0.5, vol: 0.35, attack: 0.01 });
    playTone({ freq: 277, type: 'sawtooth', duration: 0.5, vol: 0.25, attack: 0.01, detune: 5 });
  }

  // New record
  function newRecord() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => playTone({ freq, type: 'sine', duration: 0.18,
                                  vol: 0.28, attack: 0.005 }), i * 80);
    });
  }

  // Collect coin
  function coin() {
    playTone({ freq: 880, freqEnd: 1320, type: 'sine',
               duration: 0.12, vol: 0.22, attack: 0.003 });
  }

  return { init, toggleMute, isMuted,
           jump, step, log, death, splash, trainHorn, newRecord, coin };
})();


/* ===== world.js ===== */
/**
 * world.js — v7
 *
 * ═══════════════════════════════════════════════════════════
 * АРХИТЕКТУРА СПАВНА (Queue Spawn из v6 — сохранена)
 * ═══════════════════════════════════════════════════════════
 *
 * Каждый ряд хранит:
 *   obstacles  — активные объекты, движущиеся по полю
 *   spawnQueue — очередь объектов, ещё не въехавших на поле
 *   spawnTimer — накопленный путь (px) с момента последнего спавна
 *
 * Спавн: когда spawnTimer ≥ gap следующего объекта в очереди,
 *   объект появляется СТРОГО за краем поля:
 *     dir=+1 → x = -(SPAWN_EDGE + width)   (за левым краем)
 *     dir=-1 → x = WORLD_W + SPAWN_EDGE    (за правым краем)
 *   Игрок никогда не видит момент появления.
 *
 * Выход: когда объект полностью уходит за противоположный край,
 *   он возвращается в хвост очереди — не телепортируется.
 *
 * ═══════════════════════════════════════════════════════════
 * PRE-SPAWN (новое в v7)
 * ═══════════════════════════════════════════════════════════
 *
 * При создании ряда сразу симулируем движение виртуальным dt,
 * пока нужное количество объектов не распределится по полю.
 * Объекты стартуют за левым краем, но симуляция "проматывает"
 * их вперёд — к моменту первого рендера поле уже заполнено.
 * Симуляция не "видит" экран — спавн всё равно идёт из-за края.
 *
 * ═══════════════════════════════════════════════════════════
 * БРЁВНА GRID-BASED (новое в v7)
 * ═══════════════════════════════════════════════════════════
 *
 * Длина бревна = N клеток, ширина = N * CELL.
 * Генерация river lane: [log2] [gap3] [log4] [gap2] ...
 * пока не заполнена вся ширина поля (WORLD_W).
 * Один объект = одно бревно, занимает несколько клеток.
 *
 * ═══════════════════════════════════════════════════════════
 * СИСТЕМА СЛОЖНОСТИ (score-based)
 * ═══════════════════════════════════════════════════════════
 *
 * score <  50 : 2–3 машины, 3–4 бревна, базовая скорость
 * score  50–150: 3–4 машины, 3–5 брёвен, ×1.2 скорость
 * score > 150 : 4   машины, 4–5 брёвен, ×1.4 скорость
 */

const World = (() => {

  // ── Константы ────────────────────────────────────────────
  const CELL    = 64;
  const COLS    = 9;
  const WORLD_W = COLS * CELL;   // 576 px

  // Спавн-буфер: объекты появляются за этой границей от края поля.
  // 4 клетки = 256 px — перекрывает любой горизонтальный отступ
  // при центрировании поля на экране смартфона.
  const SPAWN_EDGE = CELL * 4;   // 256 px

  // Скорость автосимуляции pre-spawn (секунд виртуального времени).
  // Нужна чтобы за разумное время заполнить поле при старте.
  const PRE_SIM_STEP = 0.1;      // 100 ms на шаг симуляции
  const PRE_SIM_MAX  = 300;      // максимум шагов (защита от бесконечного цикла)

  // Генерируем на столько рядов вперёд камеры
  const LOOK_AHEAD = 22;

  // ── Параметры объектов ────────────────────────────────────
  const CAR_W      = CELL * 1.5;   // ширина обычной машины
  const CAR_H      = CELL * 0.72;
  const LOG_H      = CELL * 0.68;

  // Типы транспорта: { w, h, sprite }
  const VEHICLE_TYPES = [
    { w: CELL * 1.5, h: CELL * 0.72, sprite: 'orange',      weight: 14 },
    { w: CELL * 1.5, h: CELL * 0.72, sprite: 'yellow_taxi', weight: 12 },
    { w: CELL * 1.5, h: CELL * 0.72, sprite: 'green_taxi',  weight: 10 },
    { w: CELL * 1.5, h: CELL * 0.72, sprite: 'taxi',        weight: 8  },
    { w: CELL * 1.5, h: CELL * 0.72, sprite: 'police',      weight: 4  },
    { w: CELL * 2.0, h: CELL * 0.72, sprite: 'ambulance',   weight: 4  },
    { w: CELL * 3.0, h: CELL * 0.72, sprite: 'truck',       weight: 4  },
    { w: CELL * 3.0, h: CELL * 0.72, sprite: 'bus',         weight: 4  },
    { w: CELL * 3.0, h: CELL * 0.72, sprite: 'firetruck',   weight: 3  },
  ];

  // Pick a random vehicle type by weight
  function pickVehicle() {
    const total = VEHICLE_TYPES.reduce((s, v) => s + v.weight, 0);
    let r = Math.random() * total;
    for (const v of VEHICLE_TYPES) { r -= v.weight; if (r <= 0) return v; }
    return VEHICLE_TYPES[0];
  }

  // Минимальный зазор между объектами уже на поле
  const MIN_CAR_GAP = CELL * 0.5;
  const MIN_LOG_GAP = CELL * 0.5;

  // Расстояния между машинами при спавне: 3–6 клеток
  const CAR_DIST_MIN = CELL * 3;
  const CAR_DIST_MAX = CELL * 6;

  // Поезд — один длинный состав
  const TRAIN_CAR_W = CELL * 2;   // ширина одного вагона
  const TRAIN_CAR_H = CELL * 0.82;
  const TRAIN_CARS  = 4;          // вагонов в составе
  const TRAIN_GAP   = CELL * 0.08; // зазор между вагонами

  // ── Состояние ────────────────────────────────────────────
  let rows         = [];
  let topRowIdx    = 0;
  let currentScore = 0;   // обновляется снаружи через setScore()
  let lastTrainRow = -50; // следим чтобы поезда не шли подряд

  // ── Biome system ──────────────────────────────────────────
  function getBiomeForRow(rowIdx) {
    if (rowIdx <= 2) return { biome: 'default', nextBiome: null, blendT: 0 };
    const totalCycle = 80 * 3; // 80 rows per biome × 3 biomes
    const cyclePos   = rowIdx % totalCycle;
    const biomeSlot  = Math.floor(cyclePos / 80);
    const posInBiome = cyclePos - biomeSlot * 80;
    const order      = ['default', 'desert', 'snow'];
    const current    = order[biomeSlot];
    const next       = order[(biomeSlot + 1) % order.length];
    // Last 5 rows of a biome zone = smooth transition
    if (posInBiome >= 75) {
      const t = (posInBiome - 75) / 5;
      return { biome: current, nextBiome: next, blendT: t };
    }
    return { biome: current, nextBiome: null, blendT: 0 };
  }

  // ── Police Siren Event ───────────────────────────────────
  // States: 'idle' | 'clearing' | 'running' | 'done'
  const SIREN_COOLDOWN  = 35;   // seconds between events
  let sirenState        = 'idle';
  let sirenTimer        = 15;   // start first event after 15s
  let sirenRow          = null; // targeted road row
  let sirenCar          = null; // the siren car obstacle object

  // ═══════════════════════════════════════════════════════
  // СИСТЕМА СЛОЖНОСТИ
  // ═══════════════════════════════════════════════════════

  /**
   * Плавная прогрессия: 0.0 при score<=start, 1.0 при score>=end.
   * ease-out кривая: быстрый рост вначале, замедление к концу.
   */
  function smoothProgress(score, start, end) {
    const t = Math.max(0, Math.min(1, (score - start) / (end - start)));
    return t * (2 - t);
  }
  function _lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * Возвращает параметры сложности для текущего счёта.
   * Плавная интерполяция вместо ступенчатых milestones.
   */
  function getDifficulty() {
    const s = currentScore;
    const p = smoothProgress(s, 0, 250);

    // ── Личность полосы (вместо бинарных fast/busy) ──────
    const roll = Math.random();
    let personality;
    if      (roll < 0.10)              personality = 'sparse';  // 10% — лёгкая передышка
    else if (roll < 0.10 + 0.15 * p)  personality = 'rush';    // 0–15% — плотная + быстрая
    else if (roll < 0.35 + 0.10 * p)  personality = 'dense';   // 25–35% — просто больше машин
    else                               personality = 'normal';  // остальное

    // ── Скорость машин: 60 → 100 px/s ───────────────────
    const carSpeedBase = _lerp(60, 100, p);
    const carSpeedVar  = _lerp(15, 25, p);

    // ── Скорость брёвен: 38 → 60 px/s ───────────────────
    const logSpeedBase = _lerp(38, 60, p);
    const logSpeedVar  = _lerp(10, 16, p);

    // ── Кол-во машин: 2–3 → 5–6 ─────────────────────────
    const countMin = Math.round(_lerp(2, 5, p));
    const countMax = Math.round(_lerp(3, 6, p));
    let carCount = countMin + Math.floor(Math.random() * (countMax - countMin + 1));

    // ── Промежутки: большие → тесные ─────────────────────
    let carDistMin = _lerp(CELL * 4, CELL * 2, p);
    let carDistMax = _lerp(CELL * 6, CELL * 3, p);

    // ── Модификаторы личности ────────────────────────────
    if (personality === 'sparse') {
      carCount    = Math.max(2, carCount - 1);
      carDistMin *= 1.3;
      carDistMax *= 1.3;
    } else if (personality === 'dense') {
      carCount    = Math.min(7, carCount + 1);
      carDistMin *= 0.8;
      carDistMax *= 0.8;
    } else if (personality === 'rush') {
      carCount   = Math.min(7, carCount + 1);
      carDistMin *= 0.75;
      carDistMax *= 0.75;
      return {
        carCount,
        carDistMin,
        carDistMax,
        logCount:     weightedPick([4, 5, 6], [30, 50, 20]),
        carSpeedBase: carSpeedBase * 1.6,
        carSpeedVar:  10,
        logSpeedBase,
        logSpeedVar,
        isFast: true,
      };
    }

    // ── Кол-во брёвен: больше коротких на высоком score ──
    const logCount = weightedPick(
      [4, 5, 6],
      [Math.round(_lerp(40, 20, p)), 50, Math.round(_lerp(10, 30, p))]
    );

    return {
      carCount,
      carDistMin,
      carDistMax,
      logCount,
      carSpeedBase,
      carSpeedVar,
      logSpeedBase,
      logSpeedVar,
      isFast: false,
    };
  }

  /** Взвешенный случайный выбор из массива значений с весами */
  function weightedPick(values, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < values.length; i++) {
      r -= weights[i];
      if (r <= 0) return values[i];
    }
    return values[values.length - 1];
  }

  // ═══════════════════════════════════════════════════════
  // ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════════════════════════════
  function init() {
    rows         = [];
    topRowIdx    = 0;
    currentScore = 0;
    recentTypes  = [];

    resetPatternGen();
    lastTrainRow = -50;

    // Ряды ниже старта — заполняют экран на мобиле (без пустоты снизу)
    for (let i = -12; i < 0; i++) {
      rows.push(makeGrassRow(i));
    }

    // 3 стартовых ряда — трава (безопасная зона)
    for (let i = 0; i < 3; i++) {
      rows.push(makeGrassRow(i));
    }

    // Процедурные ряды вперёд
    for (let i = 3; i < 3 + LOOK_AHEAD; i++) {
      rows.push(makeSmartRow(i));
    }
    topRowIdx = 2 + LOOK_AHEAD;
  }

  // ═══════════════════════════════════════════════════════
  // PATTERN-BASED GENERATION
  // ═══════════════════════════════════════════════════════
  //
  // Вместо случайного одиночного ряда генерируются группы
  // (паттерны) из 3–5 рядов.  Это создаёт осмысленные
  // "секции" уровня и позволяет точно контролировать баланс.
  //
  // Алгоритм:
  //   1. По currentScore выбираем пул паттернов (simple/medium/hard)
  //   2. С вероятностью RARE_CHANCE берём rare-паттерн
  //   3. С вероятностью SAFE_BONUS добавляем лишний grass-ряд
  //   4. Ряды из паттерна создаются по одному через makeRow()
  //
  // Безопасность:
  //   – максимум 4 road подряд (учитывает хвост предыдущего паттерна)
  //   – максимум 3 river подряд
  //   – последний ряд паттерна всегда grass (задаётся в PATTERNS)
  //
  // Интеграция: makeSmartRow() — точка входа, вызывается из
  // extendWorld() так же как раньше.  Внутри хранится буфер
  // (patternBuffer), из которого extendWorld берёт по одному ряду.
  // ═══════════════════════════════════════════════════════

  // ── Библиотека паттернов ─────────────────────────────────────────────────
  //
  // Паттерн = группа из 3–5 рядов, выдаётся целиком.
  // Grass — только в конце паттерна (1 ряд), не в середине.
  // Это создаёт ощущение "секций" и убирает пустые участки.
  //
  // Безопасность:
  //   – max 4 road подряд (с учётом стыка двух паттернов)
  //   – max 3 water подряд
  //   – max 1 grass подряд
  //   – если предыдущий паттерн закончился на grass, следующий
  //     не может начинаться с grass (проверяется через lastType)
  const PATTERNS = {

    // Simple (score < 50): 2–3 опасных ряда + grass
    simple: [
      ['road',  'road',  'grass'],                          // S1
      ['road',  'water', 'grass'],                          // S2
      ['water', 'road',  'grass'],                          // S3
      ['road',  'road',  'water', 'grass'],                 // S4
    ],

    // Medium (score 50–150): 3–4 опасных ряда + grass
    medium: [
      ['road',  'road',  'road',  'grass'],                 // M1
      ['road',  'water', 'road',  'grass'],                 // M2
      ['water', 'road',  'road',  'grass'],                 // M3
      ['road',  'water', 'water', 'grass'],                 // M4
      ['road',  'road',  'water', 'road',  'grass'],        // M5
    ],

    // Hard (score > 150): 4–5 опасных рядов + grass
    hard: [
      ['road',  'road',  'road',  'water', 'grass'],        // H1
      ['water', 'road',  'water', 'road',  'grass'],        // H2
      ['road',  'water', 'road',  'water', 'grass'],        // H3
      ['road',  'road',  'road',  'road',  'grass'],        // H4
      ['road',  'water', 'road',  'road',  'grass'],        // H5
    ],
  };

  const RARE_CHANCE = 0.0;    // rare-паттерны убраны — используем hard при score>150

  let patternBuffer = [];
  let streakRoad    = 0;
  let streakWater   = 0;
  let streakGrass   = 0;
  let lastType      = 'grass';  // тип последнего выданного ряда

  function randFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Выбрать паттерн по сложности
  function pickPattern() {
    const s = currentScore;
    if (s < 50)  return randFrom(PATTERNS.simple);
    if (s < 150) return randFrom(PATTERNS.medium);
    return randFrom(PATTERNS.hard);
  }

  // Проверка safety limits
  function isSafe(type) {
    if (type === 'road'  && streakRoad  >= 4) return false;
    if (type === 'water' && streakWater >= 3) return false;
    if (type === 'grass' && streakGrass >= 1) return false;
    return true;
  }

  function updateStreaks(type) {
    streakRoad  = type === 'road'  ? streakRoad  + 1 : 0;
    streakWater = type === 'water' ? streakWater + 1 : 0;
    streakGrass = type === 'grass' ? streakGrass + 1 : 0;
    lastType    = type;
  }

  // Заполнить буфер одним паттерном
  function fillBuffer() {
    const pattern = pickPattern();
    for (let i = 0; i < pattern.length; i++) {
      let type = pattern[i];

      // Если предыдущий ряд — grass, следующий паттерн не начинается с grass
      if (i === 0 && lastType === 'grass' && type === 'grass') {
        type = 'road';
      }

      // Safety: заменяем нарушителя на grass (только если это не опасно)
      if (!isSafe(type)) {
        type = streakGrass >= 1 ? 'road' : 'grass';
      }

      patternBuffer.push(type);
      updateStreaks(type);
    }
  }

  // Следующий тип ряда из буфера
  function nextRowType() {
    if (patternBuffer.length === 0) fillBuffer();
    return patternBuffer.shift();
  }

  function resetPatternGen() {
    patternBuffer = [];
    streakRoad    = 0;
    streakWater   = 0;
    streakGrass   = 0;
    lastType      = 'grass';
  }

  // Создать ряд нужного типа
  function makeSmartRow(rowIdx) {
    const type = nextRowType();
    let row;
    if (type === 'grass') { row = makeGrassRow(rowIdx); }
    else if (type === 'road') {
      // Поезд: 7% шанс, только если score >= 20 и давно не было поезда
      const trainChance = currentScore >= 20 ? 0.04 : 0;
      const farEnough   = rowIdx - lastTrainRow >= 25;
      if (farEnough && Math.random() < trainChance) {
        lastTrainRow = rowIdx;
        row = makeTrainRow(rowIdx);
      } else {
        row = makeRoadRow(rowIdx);
      }
    } else {
      row = makeWaterRow(rowIdx);
    }
    // Stamp biome info
    const bi = getBiomeForRow(rowIdx);
    row.biome     = bi.biome;
    row.nextBiome = bi.nextBiome;
    row.blendT    = bi.blendT;
    return row;
  }

  // ═══════════════════════════════════════════════════════
  // СОЗДАНИЕ РЯДОВ
  // ═══════════════════════════════════════════════════════

  function makeGrassRow(rowIdx) {
    // Generate decorations — bushes, trees, rocks on grid cells
    // Player starts at row 1, col COLS/2 — always keep that clear
    const decorations = [];

    // Start rows (0-2) and player's starting row stay empty
    if (rowIdx <= 2) {
      return { idx: rowIdx, type: 'grass', obstacles: [], spawnQueue: [], spawnTimer: 0, dir: 0, speed: 0, decorations };
    }

    // Deterministic seed per row so decorations don't change each frame
    const seed = rowIdx * 2654435761;
    const rng = (n) => {
      const x = Math.sin(seed + n) * 43758.5453123;
      return x - Math.floor(x);
    };

    // 25-35% density, but ensure at least one gap (path through)
    const biomeInfo = getBiomeForRow(rowIdx);
    const BIOME_DECO = { default: ['bush', 'bush', 'tree', 'rock'], desert: ['cactus', 'cactus', 'tumbleweed', 'rock'], snow: ['pine', 'pine', 'snowman', 'rock'] };
    const TYPES = BIOME_DECO[biomeInfo.biome] || BIOME_DECO.default;
    const occupied = new Set();
    const targetCount = 2 + Math.floor(rng(0) * 2);  // 2-3 objects per row

    // Generate candidate columns, avoid blocking the full row
    // Also ensure no 3 adjacent occupied columns (max 2 in a row)
    let attempts = 0;
    while (decorations.length < targetCount && attempts < 20) {
      attempts++;
      const col = Math.floor(rng(attempts + 10) * COLS);
      if (occupied.has(col)) continue;

      // Safety: ensure this doesn't block ALL columns
      const wouldBlock = occupied.size + 1 >= COLS - 1;
      if (wouldBlock) continue;

      // No 3 consecutive occupied: check if col-1 AND col-2 are both occupied,
      // or col+1 AND col+2 are both occupied, or col-1 AND col+1 are occupied
      const left1  = occupied.has(col - 1);
      const left2  = occupied.has(col - 2);
      const right1 = occupied.has(col + 1);
      const right2 = occupied.has(col + 2);
      if (left1 && left2)   continue;  // would make 3 in a row on the left
      if (right1 && right2) continue;  // would make 3 in a row on the right
      if (left1 && right1)  continue;  // would fill a gap making 3 consecutive

      occupied.add(col);
      const type = TYPES[Math.floor(rng(attempts + 50) * TYPES.length)];
      decorations.push({ col, type });
    }

    // Coins: ~12% chance of 1 coin per grass row → roughly 1 coin every 15-20 steps
    const coinOccupied = new Set(decorations.map(d => d.col));
    const coinCount = rng(99) < 0.12 ? 1 : 0;
    const coinsList = [];
    let coinAttempts = 0;
    while (coinsList.length < coinCount && coinAttempts < 20) {
      coinAttempts++;
      const col = Math.floor(rng(coinAttempts + 70) * COLS);
      if (!coinOccupied.has(col)) { coinOccupied.add(col); coinsList.push({ col, collected: false }); }
    }

    return { idx: rowIdx, type: 'grass', obstacles: [], spawnQueue: [], spawnTimer: 0, dir: 0, speed: 0, decorations, coins: coinsList };
  }

  // ── Дорога ──────────────────────────────────────────────
  function makeRoadRow(rowIdx) {
    const dir  = Math.random() < 0.5 ? 1 : -1;
    const diff = getDifficulty();

    // Единая скорость для всех машин ряда — ключ к отсутствию рывков
    const speed = (diff.carSpeedBase + Math.random() * diff.carSpeedVar) * dir;

    // Строим очередь спавна машин.
    // gap = CAR_W + дистанция (2–4 клетки обычно, 2–3 на busy lane).
    // Первый объект — gap=0 (стартует немедленно в pre-sim).
    const count      = diff.carCount;
    const distMin    = diff.carDistMin;
    const distMax    = diff.carDistMax;
    const spawnQueue = [];
    for (let i = 0; i < count; i++) {
      const veh  = pickVehicle();
      const dist = distMin + Math.random() * (distMax - distMin);
      const gap  = i === 0 ? 0 : veh.w + dist;
      spawnQueue.push({ width: veh.w, height: veh.h, gap, sprite: veh.sprite });
    }

    const row = {
      idx: rowIdx, type: 'road', dir, speed,
      obstacles:  [],
      spawnQueue: [...spawnQueue],
      spawnTimer: 0,
      baseQueue:  spawnQueue,
      spawnCount: 0,   // total cars ever spawned in this row → stable sprite slot
    };

    // Pre-spawn: симулируем движение пока не заполним ряд
    preSimRow(row, count, MIN_CAR_GAP);
    return row;
  }

  // ── Поезд ───────────────────────────────────────────────
  //
  // Один состав из TRAIN_CARS вагонов, очень высокая скорость.
  // Предупреждение: ряд хранит flashing=true первые 1.2 сек.
  // Коллизия: такая же как у дороги (машины), только hitbox шире.
  function makeTrainRow(rowIdx) {
    const dir   = Math.random() < 0.5 ? 1 : -1;
    const speed = (330 + Math.random() * 90) * dir;  // очень быстро

    // Строим один сплошной состав: 4 вагона почти вплотную
    // Весь состав = одна "машина" шириной TRAIN_CARS * TRAIN_CAR_W
    const totalW = TRAIN_CARS * TRAIN_CAR_W + (TRAIN_CARS - 1) * TRAIN_GAP;

    const spawnQueue = [{ width: totalW, height: TRAIN_CAR_H, gap: 0 }];

    const row = {
      idx: rowIdx, type: 'train', dir, speed,
      obstacles:  [],
      spawnQueue: [...spawnQueue],
      spawnTimer: 0,
      // Warning flash: true for first 1.2s before train arrives
      warning: true,
      warningTimer: 0,
    };

    // Pre-spawn: одиночный состав, но стартует далеко за краем
    preSimRow(row, 1, CELL);
    return row;
  }

  // ── Река (grid-based) ────────────────────────────────────
  //
  // Генерация: [log 2–4 tiles][gap 2–3 tiles]... пока filled < WORLD_W
  // Минимум 4 бревна гарантируется явной проверкой.
  // gap ≤ 3 клетки — игрок почти всегда имеет путь через реку.
  // Все брёвна: единая скорость + единое направление.
  // Pre-spawn: сразу заполняем ряд через preSimRow.
  function makeWaterRow(rowIdx) {
    const dir  = Math.random() < 0.5 ? 1 : -1;
    const diff = getDifficulty();
    const speed = (diff.logSpeedBase + Math.random() * diff.logSpeedVar) * dir;

    // ── Строим spawnQueue: [log][gap][log][gap]... ────────
    const p = smoothProgress(currentScore, 0, 250);

    // Промежутки масштабируются: 2–3 клетки → 1–2 клетки
    const gapMin = Math.round(_lerp(2, 1, p));
    const gapMax = Math.round(_lerp(3, 2, p));

    // Длина брёвен: больше коротких на высоком score (сложнее)
    const logWeights = [
      Math.round(_lerp(30, 50, p)),  // 2 клетки: растёт
      50,                             // 3 клетки: стабильно
      Math.round(_lerp(20, 10, p)),  // 4 клетки: уменьшается
    ];

    const spawnQueue = [];
    let filled   = 0;
    let prevLogW = 0;
    let logsBuilt = 0;
    let consecutiveLargeGaps = 0;

    // Гарантируем minimum 4 бревна И заполняем всю ширину поля
    while (filled < WORLD_W || logsBuilt < 4) {
      const lenCells = weightedPick([2, 3, 4], logWeights);
      const logW     = lenCells * CELL;

      // Gap с защитой: после 2 больших подряд — принудительно маленький
      let gapCells;
      if (consecutiveLargeGaps >= 2) {
        gapCells = gapMin;
        consecutiveLargeGaps = 0;
      } else {
        gapCells = gapMin + Math.floor(Math.random() * (gapMax - gapMin + 1));
        if (gapCells >= gapMax) consecutiveLargeGaps++;
        else consecutiveLargeGaps = 0;
      }
      const gapW = gapCells * CELL;

      const qGap = spawnQueue.length === 0 ? 0 : prevLogW + gapW;
      spawnQueue.push({ width: logW, height: LOG_H, gap: qGap });
      prevLogW  = logW;
      filled   += logW + gapW;
      logsBuilt++;
    }

    const row = {
      idx: rowIdx, type: 'water', dir, speed,
      obstacles:  [],
      spawnQueue: [...spawnQueue],
      spawnTimer: 0,
    };

    // Pre-spawn: сразу заполняем поле min(logCount, доступных) брёвнами
    const target = Math.min(diff.logCount, spawnQueue.length);
    preSimRow(row, target, MIN_LOG_GAP);
    return row;
  }

  // ═══════════════════════════════════════════════════════
  // PRE-SPAWN — симуляция заполнения ряда при старте
  // ═══════════════════════════════════════════════════════
  /**
   * Прогоняем processRow с виртуальным dt пока активных объектов
   * не станет targetCount или не исчерпаем MAX шагов.
   *
   * После симуляции объекты распределены по полю [0..WORLD_W],
   * как будто ряд уже давно существует. Игрок не ждёт появления.
   *
   * Важно: симуляция использует тот же processRow что и игровой
   * цикл → никаких специальных случаев, спавн всё ещё из-за края.
   */
  function preSimRow(row, targetCount, minGap) {
    const minGapArg = minGap;
    let steps = 0;

    while (row.obstacles.length < targetCount && steps < PRE_SIM_MAX) {
      processRow(row, PRE_SIM_STEP, minGapArg);
      steps++;
    }
  }

  // ═══════════════════════════════════════════════════════
  // ОБНОВЛЕНИЕ (каждый кадр)
  // ═══════════════════════════════════════════════════════
  function update(dt) {
    for (const row of rows) {
      if (row.type === 'road')  {
        // Skip normal processing if this row is locked for siren event
        if (!row.sirenLocked) processRow(row, dt, MIN_CAR_GAP);
        else {
          // Still move existing cars so they clear the lane
          for (const o of row.obstacles) o.x += o.speed * dt;
        }
      }
      if (row.type === 'water') processRow(row, dt, MIN_LOG_GAP);
      if (row.type === 'train') {
        processRow(row, dt, CELL);
        if (row.warning) {
          row.warningTimer += dt;
          if (row.warningTimer >= 1.2) row.warning = false;
        }
      }
    }
    updateSirenEvent(dt);
  }

  function updateSirenEvent(dt) {
    sirenTimer -= dt;

    if (sirenState === 'idle') {
      if (sirenTimer > 0) return;
      // Pick a random visible road row
      const roadRows = rows.filter(r => r.type === 'road' && !r.sirenLocked);
      if (roadRows.length === 0) return;
      sirenRow = roadRows[Math.floor(Math.random() * roadRows.length)];
      sirenRow.sirenLocked = true;
      sirenRow.spawnQueue  = [];   // clear pending spawns
      sirenState = 'clearing';

    } else if (sirenState === 'clearing') {
      // Wait until lane is empty
      if (!sirenRow || !rows.includes(sirenRow)) { _resetSiren(); return; }
      const lane = sirenRow;
      // Remove cars that have left the screen
      lane.obstacles = lane.obstacles.filter(o => {
        const out = lane.dir > 0 ? o.x >= WORLD_W + SPAWN_EDGE : o.x + o.width <= -SPAWN_EDGE;
        return !out;
      });
      if (lane.obstacles.length === 0) {
        // Lane clear — spawn siren car
        const speed = lane.speed * 2.5;   // 2.5x faster
        const spawnX = speed > 0 ? -(SPAWN_EDGE + CAR_W) : WORLD_W + SPAWN_EDGE;
        sirenCar = {
          type: 'car', x: spawnX, width: CAR_W, height: CAR_H,
          speed, dir: lane.dir, spriteSlot: 999, isSirenCar: true,
        };
        lane.obstacles.push(sirenCar);
        sirenState = 'running';
      }

    } else if (sirenState === 'running') {
      if (!sirenRow || !rows.includes(sirenRow)) { _resetSiren(); return; }
      const lane = sirenRow;
      if (!lane.obstacles.includes(sirenCar)) { _resetSiren(); return; }
      // Check if siren car has left the screen
      const out = sirenCar.speed > 0
        ? sirenCar.x >= WORLD_W + SPAWN_EDGE
        : sirenCar.x + sirenCar.width <= -SPAWN_EDGE;
      if (out) {
        lane.obstacles = lane.obstacles.filter(o => o !== sirenCar);
        _resetSiren();
      }
    }
  }

  function _resetSiren() {
    if (sirenRow) {
      sirenRow.sirenLocked = false;
      // Rebuild spawn queue so normal traffic resumes
      const diff = getDifficulty();
      sirenRow.spawnQueue = [];
      sirenRow.spawnTimer = 0;
      for (let i = 0; i < diff.carCount; i++) {
        const veh  = pickVehicle();
        const dist = diff.carDistMin + Math.random() * (diff.carDistMax - diff.carDistMin);
        sirenRow.spawnQueue.push({ width: veh.w, height: veh.h, gap: i === 0 ? veh.w * 3 : veh.w + dist, sprite: veh.sprite });
      }
    }
    sirenRow  = null;
    sirenCar  = null;
    sirenState = 'idle';
    sirenTimer = SIREN_COOLDOWN + Math.random() * 10;
  }

  /**
   * processRow — обработка одного ряда за один тик:
   *
   *  1. ДВИЖЕНИЕ:   каждый активный объект сдвигается на speed*dt
   *
   *  2. ВЫХОД:      объект полностью покинул поле → убираем из
   *                 obstacles, добавляем в хвост spawnQueue.
   *                 gap при re-queue = расстояние между машинами (3–6 клеток)
   *                 + ширина самого объекта.
   *
   *  3. СПАВН:      spawnTimer += |speed| * dt
   *                 Если timer ≥ gap следующего в очереди:
   *                   — обнуляем timer
   *                   — создаём объект за краем поля
   *                   — сортируем obstacles (для корректного anti-overlap)
   *
   *  4. ПРОВЕРКА ДИСТАНЦИИ перед спавном:
   *                 Проверяем расстояние от точки спавна до ближайшего
   *                 активного объекта. Если < MIN_GAP — откладываем спавн.
   *
   *  5. ANTI-OVERLAP: проходим по отсортированному массиву,
   *                 раздвигаем объекты если зазор < minGap.
   */
  function processRow(row, dt, minGap) {
    const { dir, speed } = row;
    const spd = Math.abs(speed);
    const obs = row.obstacles;

    // ── 1. Движение ──────────────────────────────────────
    for (const o of obs) o.x += speed * dt;

    // ── 2. Выход за край → в очередь ────────────────────
    for (let i = obs.length - 1; i >= 0; i--) {
      const o   = obs[i];
      const out = dir > 0
        ? o.x >= WORLD_W + SPAWN_EDGE          // ушёл за правый
        : o.x + o.width <= -SPAWN_EDGE;        // ушёл за левый

      if (out) {
        obs.splice(i, 1);
        // Re-queue: зазор соответствует типу ряда.
        // Дороги: 2–4 клетки (сохраняем плотность). Реки: 2–4 клетки.
        const rp = smoothProgress(currentScore, 0, 250);
        const reqMin = _lerp(3, 2, rp);
        const reqMax = _lerp(5, 3, rp);
        const requeueDist = (reqMin + Math.random() * (reqMax - reqMin)) * CELL;
        row.spawnQueue.push({ width: o.width, height: o.height, gap: o.width + requeueDist, sprite: o.spriteKey || null });
      }
    }

    // ── 3 & 4. Спавн с проверкой дистанции ──────────────
    if (row.spawnQueue.length > 0) {
      row.spawnTimer += spd * dt;
      const next = row.spawnQueue[0];

      if (row.spawnTimer >= next.gap) {
        // Точка спавна
        const spawnX = dir > 0
          ? -(SPAWN_EDGE + next.width)   // за левым краем
          :  WORLD_W + SPAWN_EDGE;       // за правым краем

        // Проверка дистанции до ближайшего активного объекта
        const tooClose = obs.some(o => {
          const dist = dir > 0
            ? o.x - (spawnX + next.width)    // зазор справа от точки спавна
            : spawnX - (o.x + o.width);      // зазор слева
          return dist < minGap;
        });

        if (!tooClose) {
          row.spawnTimer = 0;
          row.spawnQueue.shift();

          const spriteSlot = (row.type === 'road' && row.spawnCount !== undefined)
            ? row.spawnCount++
            : undefined;

          obs.push({
            type:      row.type === 'road' ? 'car' : 'log',
            x:         spawnX,
            width:     next.width,
            height:    next.height,
            speed,
            dir,
            spriteSlot,
            spriteKey: next.sprite || null,  // explicit sprite name if set
          });

          // Сортируем: dir=+1 → по возрастанию x; dir=-1 → по убыванию
          obs.sort((a, b) => dir > 0 ? a.x - b.x : b.x - a.x);
        }
        // Если слишком близко — не сбрасываем timer, проверим снова на след. кадре
      }
    }

    // ── 5. Anti-overlap (страховка) ──────────────────────
    if (dir > 0) {
      for (let i = 1; i < obs.length; i++) {
        const gap = obs[i].x - (obs[i-1].x + obs[i-1].width);
        if (gap < minGap) obs[i].x = obs[i-1].x + obs[i-1].width + minGap;
      }
    } else {
      for (let i = 1; i < obs.length; i++) {
        const gap = obs[i-1].x - (obs[i].x + obs[i].width);
        if (gap < minGap) obs[i].x = obs[i-1].x - obs[i].width - minGap;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // РАСШИРЕНИЕ МИРА
  // ═══════════════════════════════════════════════════════
  function extendWorld(playerRowIdx) {
    while (topRowIdx < playerRowIdx + LOOK_AHEAD) {
      topRowIdx++;
      rows.push(makeSmartRow(topRowIdx));
    }
    rows = rows.filter(r => r.idx >= playerRowIdx - 14);
  }

  // ═══════════════════════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════════════════════

  /** Вызывается из main.js каждый кадр для обновления сложности */
  function setScore(score) { currentScore = score; }

  function getRow(rowIdx) { return rows.find(r => r.idx === rowIdx) || null; }
  function rowToY(rowIdx) { return -rowIdx * CELL; }
  function getRows()      { return rows; }

  function collectCoin(rowIdx, col) {
    const row = getRow(rowIdx);
    if (!row || !row.coins) return false;
    const coin = row.coins.find(c => c.col === col && !c.collected);
    if (!coin) return false;
    coin.collected = true;
    return true;
  }

  return { init, update, extendWorld, setScore, getRow, getRows, rowToY, getBiomeForRow, collectCoin, CELL, COLS };

})();


/* ===== player.js ===== */
/**
 * player.js — Контроллер игрока
 *
 * Движение в 4 направлениях: вперёд / назад / влево / вправо.
 * Каждый шаг = одна клетка, с плавной анимацией прыжка.
 * Нельзя начать новый шаг, пока не завершился предыдущий.
 *
 * Ограничение назад: игрок не может отступить дальше
 * чем на MAX_BACK_STEPS клеток от своего рекорда.
 */

const Player = (() => {

  const CELL         = World.CELL;
  const COLS         = World.COLS;
  const JUMP_DURATION = 0.16; // секунд на одну анимацию шага

  // Динамический лимит отступа назад:
  // - До 2 рядов прогресса: назад на 1 клетку
  // - После 2+ рядов прогресса: назад до 3 клеток
  function maxBackSteps(maxRow) {
    return maxRow >= 3 ? 3 : 1;
  }

  let state = {};

  // ===== Инициализация =====
  function init() {
    state = {
      col: Math.floor(COLS / 2),  // центр по X
      row: 1,                      // стартовый ряд

      visualX: 0,
      visualY: 0,

      // Анимация шага
      jumping:    false,
      jumpTimer:  0,
      jumpFrom:   { x: 0, y: 0 },
      jumpTo:     { x: 0, y: 0 },
      jumpHeight: 0,

      // Направление взгляда (для визуала)
      facingDir: 0,   // -1 = влево, 1 = вправо, 0 = вверх

      onLog:  null,
      alive:  true,
      score:  0,
      maxRow: 1,
    };

    state.visualX  = state.col * CELL + CELL / 2;
    state.visualY  = World.rowToY(state.row) + CELL / 2;
    state.jumpFrom = { x: state.visualX, y: state.visualY };
  }

  // ===== Движение в направлении (dRow, dCol) =====
  // dRow: +1 = вперёд, -1 = назад
  // dCol: +1 = вправо, -1 = влево
  function move(dRow, dCol) {
    if (!state.alive)  return false;
    if (state.jumping) return false;   // нельзя начать новый шаг во время анимации

    const newRow = state.row + dRow;
    const newCol = state.col + dCol;

    // --- Ограничение: не уходим за боковые границы ---
    if (newCol < 0 || newCol >= COLS) return false;

    // --- Ограничение назад: динамический лимит от рекорда ---
    // Стартовый ряд = 1, никогда не уходим ниже него
    const backLimit = maxBackSteps(state.maxRow);
    if (newRow < state.maxRow - backLimit) return false;
    if (newRow < 1) return false;  // нижняя граница карты

    // --- Проверка коллизии с декорациями (кусты, деревья, камни) ---
    const targetRow = World.getRow(newRow);
    if (Collision.isCellBlocked(targetRow, newCol)) return false;

    // --- Применяем новую логическую позицию ---
    state.row = newRow;
    state.col = newCol;

    // --- Обновляем рекорд и счёт ---
    if (state.row > state.maxRow) {
      state.maxRow = state.row;
      state.score  = state.row - 1;
    }

    // --- Сбор монеты ---
    if (World.collectCoin(state.row, state.col)) {
      const newTotal = Save.addCoins(1);
      _sessionCoins++;
      if (typeof Vibrate !== 'undefined') Vibrate.coin();
      if (typeof UI !== 'undefined') UI.updateCoins(newTotal);
      if (typeof Renderer !== 'undefined') Renderer.addCoinEffect(state.col * CELL + CELL / 2, World.rowToY(state.row) + CELL / 2);
    }

    // --- Направление взгляда ---
    if      (dCol > 0) state.facingDir =  1;
    else if (dCol < 0) state.facingDir = -1;
    else               state.facingDir =  0;

    // --- Вибрация при прыжке ---
    if (typeof Vibrate !== 'undefined') Vibrate.tap();
    // --- Звук прыжка ---
    if (typeof Sound !== 'undefined') {
      if (dRow !== 0) Sound.jump(); else Sound.step();
    }

    // --- Запуск анимации ---
    state.jumping   = true;
    state.jumpTimer = 0;
    state.jumpFrom  = { x: state.visualX, y: state.visualY };
    state.jumpTo    = {
      x: state.col * CELL + CELL / 2,
      y: World.rowToY(state.row) + CELL / 2,
    };
    // Для бокового шага дуга меньше, для вперёд/назад — нормальная
    state.jumpHeight = (dRow !== 0) ? CELL * 0.55 : CELL * 0.3;

    state.onLog = null;  // при любом шаге — слазим с бревна
    return true;
  }

  // Удобные обёртки для 4 направлений
  function moveForward()  { move( 1,  0); }
  function moveBackward() { move(-1,  0); }
  function moveLeft()     { move( 0, -1); }
  function moveRight()    { move( 0,  1); }

  // Устаревший alias (для совместимости с main.js)
  function jump()         { moveForward(); }

  // ===== Обновление каждый кадр =====
  function update(dt) {
    if (!state.alive) return;

    // --- Анимация шага ---
    if (state.jumping) {
      state.jumpTimer += dt;
      const t = Math.min(state.jumpTimer / JUMP_DURATION, 1);

      state.visualX = lerp(state.jumpFrom.x, state.jumpTo.x, t);
      state.visualY = lerp(state.jumpFrom.y, state.jumpTo.y, t);

      // Дуга прыжка через sin
      const arc = Math.sin(Math.PI * t) * state.jumpHeight;
      state.visualY -= arc;

      if (t >= 1) {
        state.jumping = false;
        state.visualX = state.jumpTo.x;
        state.visualY = World.rowToY(state.row) + CELL / 2;
        // Leave a footprint on landing
        if (typeof Renderer !== 'undefined' && Renderer.addTrail) {
          const row = World.getRow(state.row);
          Renderer.addTrail(state.visualX, state.visualY, row ? row.type : 'grass');
        }
      }
    }

    // --- Движение вместе с бревном ---
    if (state.onLog && !state.jumping) {
      state.visualX += state.onLog.speed * dt;
      state.col = Math.round((state.visualX - CELL / 2) / CELL);

      // Уплыл за края → тонем
      if (state.visualX < -CELL * 0.5 || state.visualX > COLS * CELL + CELL * 0.5) {
        kill();
      }
    }
  }

  // ===== Убить игрока =====
  function kill() {
    if (!state.alive) return;
    state.alive   = false;
    state.onLog   = null;
    state.jumping = false;
  }

  // ===== Вспомогательные =====
  function lerp(a, b, t) { return a + (b - a) * t; }

  function getState()     { return state; }
  function isAlive()      { return state.alive; }
  function getScore()     { return state.score; }
  function setOnLog(log)  { state.onLog = log; }

  return {
    init, update, kill,
    jump, move,
    moveForward, moveBackward, moveLeft, moveRight,
    getState, isAlive, getScore, setOnLog,
  };

})();



/* ===== obstacles.js ===== */
/**
 * obstacles.js — Контроллер препятствий
 *
 * Логика машин и брёвен встроена прямо в World (генерация)
 * и Renderer (отрисовка), так как они тесно связаны с рядами.
 *
 * Этот файл является точкой расширения — здесь можно добавить
 * дополнительные типы препятствий: велосипеды, поезда, животных и т.д.
 *
 * Пример расширения:
 *
 * const Obstacles = (() => {
 *   function spawnBird(row) { ... }
 *   function updateBirds(dt) { ... }
 *   return { spawnBird, updateBirds };
 * })();
 */

// Заглушка — модуль подготовлен для расширения
const Obstacles = (() => {
  return {};
})();


/* ===== collision.js ===== */
/**
 * collision.js — Система коллизий
 *
 * Проверяет три типа событий:
 *  1. Столкновение с машиной → Game Over
 *  2. Падение в воду (игрок не на бревне) → Game Over
 *  3. Стояние на бревне → игрок движется вместе с бревном
 */

const Collision = (() => {

  const CELL = World.CELL;

  // Радиус "хитбокса" игрока (немного меньше клетки для честной игры)
  const PLAYER_RADIUS = CELL * 0.3;

  // ===== Основная проверка коллизий =====
  function check() {
    const ps = Player.getState();
    if (!ps.alive || ps.jumping) return;   // во время прыжка — неуязвим

    const row = World.getRow(ps.row);
    if (!row) return;

    if (row.type === 'road' || row.type === 'train') {
      checkCars(ps, row);
    } else if (row.type === 'water') {
      checkWater(ps, row);
    } else {
      // Трава — безопасно, но декорации блокируют движение
      Player.setOnLog(null);
    }
  }

  // ===== Проверка столкновения с машиной =====
  function checkCars(ps, row) {
    Player.setOnLog(null);

    for (const car of row.obstacles) {
      if (overlapsX(ps.visualX, PLAYER_RADIUS, car.x, car.width)) {
        Player.kill();
        return;
      }
    }
  }

  // ===== Проверка воды и брёвен =====
  function checkWater(ps, row) {
    // Ищем бревно, на котором стоит игрок
    let foundLog = null;
    for (const log of row.obstacles) {
      if (overlapsX(ps.visualX, PLAYER_RADIUS, log.x, log.width)) {
        foundLog = log;
        break;
      }
    }

    if (foundLog) {
      // Вибрация и звук при первом касании бревна
      const ps = Player.getState();
      if (!ps.onLog) {
        if (typeof Vibrate !== 'undefined') Vibrate.log();
        if (typeof Sound  !== 'undefined') Sound.log();
      }
      // Игрок на бревне — двигаемся вместе
      Player.setOnLog(foundLog);
    } else {
      // Нет бревна под игроком — тонем
      Player.setOnLog(null);
      Player.kill();
    }
  }

  // ===== Вспомогательная функция: пересечение по X =====
  // Проверяет, находится ли центральная точка playerX в пределах [obsX, obsX + obsW]
  // с учётом радиуса игрока
  function overlapsX(playerX, playerR, obsX, obsW) {
    return playerX + playerR > obsX && playerX - playerR < obsX + obsW;
  }

  // Check if a grid cell is blocked by a grass decoration
  function isCellBlocked(row, col) {
    if (!row || row.type !== 'grass' || !row.decorations) return false;
    return row.decorations.some(d => d.col === col);
  }

  return { check, isCellBlocked };

})();


/* ===== car_sprites.js ===== */
const CAR_SPRITES_B64 = {
  taxi: "data:image/png;base64,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",
  police: "data:image/png;base64,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",
  truck: "data:image/png;base64,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",
  firetruck: "data:image/png;base64,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",
  ambulance: "data:image/png;base64,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",
  orange: "data:image/png;base64,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",
  green_taxi: "data:image/png;base64,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",
  bus: "data:image/png;base64,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",
  yellow_taxi: "data:image/png;base64,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",
};


/* ===== renderer.js ===== */
const Renderer = (() => {

  const CELL = World.CELL;
  const COLS = World.COLS;

  let canvas, ctx;
  let cameraY     = 0;
  let targetCamY  = 0;
  let waterTime  = 0;   // animates water waves
  let walkTime   = 0;   // drives leg/arm swing animation

  // ── Weather system ───────────────────────────────────────
  // 0=clear, 1=rain, 2=fog, 3=storm, 4=windy
  let weatherState  = 0;
  let weatherRatio  = 0;   // 0→1 blend for current weather
  let rainParticles = [];
  let rainInitDone  = false;
  let windParticles = [];
  let windInitDone  = false;

  // Lightning state
  let lightningFlash = 0;       // 0→1 flash intensity
  let lightningTimer = 0;       // seconds until next flash
  let lightningCooldown = 4;    // randomized 3-8s

  const RAIN_COUNT       = 80;
  const STORM_RAIN_COUNT = 130;
  const WIND_COUNT       = 35;

  function initRain(count) {
    const targetCount = count || RAIN_COUNT;
    if (rainInitDone && rainParticles.length === targetCount) return;
    rainInitDone = true;
    rainParticles = Array.from({ length: targetCount }, () => ({
      x:     Math.random(),
      y:     Math.random(),
      speed: 0.18 + Math.random() * 0.15,
      len:   0.012 + Math.random() * 0.012,
      alpha: 0.3 + Math.random() * 0.4,
      width: 0.8 + Math.random() * 0.7,  // lineWidth variety
    }));
  }

  function initWind() {
    if (windInitDone) return;
    windInitDone = true;
    windParticles = Array.from({ length: WIND_COUNT }, () => ({
      x:     Math.random(),
      y:     Math.random(),
      speed: 0.12 + Math.random() * 0.1,
      len:   0.03 + Math.random() * 0.04,
      alpha: 0.08 + Math.random() * 0.12,
    }));
  }

  let _lastWeatherScore = -1;

  function setWeather(score) {
    const threshold = Math.floor(score / 30);
    if (threshold === _lastWeatherScore) return;
    _lastWeatherScore = threshold;

    const prevState = weatherState;

    if (score < 30) {
      weatherState = 0;
    } else {
      // Взвешенный рандом в зависимости от score
      const r = Math.random();
      if (score < 80) {
        // clear 50%, rain 25%, fog 15%, windy 10%
        if      (r < 0.50) weatherState = 0;
        else if (r < 0.75) weatherState = 1;
        else if (r < 0.90) weatherState = 2;
        else                weatherState = 4;
      } else {
        // clear 30%, rain 25%, fog 15%, storm 15%, windy 15%
        if      (r < 0.30) weatherState = 0;
        else if (r < 0.55) weatherState = 1;
        else if (r < 0.70) weatherState = 2;
        else if (r < 0.85) weatherState = 3;
        else                weatherState = 4;
      }
      // Не повторять ту же погоду подряд (кроме clear)
      if (weatherState !== 0 && weatherState === prevState) {
        weatherState = 0;
      }
    }

    if (weatherState !== prevState) {
      weatherRatio = 0;
      // Переинициализировать частицы дождя с правильным количеством
      if (weatherState === 3) { rainInitDone = false; initRain(STORM_RAIN_COUNT); }
      else if (weatherState === 1) { rainInitDone = false; initRain(RAIN_COUNT); }
    }
  }

  // ── Coin pickup effects ──────────────────────────────────
  const coinEffects = [];   // { x, y, age }
  const COIN_EFFECT_DUR = 0.7;

  // ── Footprint trails ─────────────────────────────────────
  const trails = [];          // { x, y, age, maxAge, rowType }
  const TRAIL_MAX_AGE = 0.7;  // seconds before fading out

  // ── Death animation state ────────────────────────────────
  let deathActive    = false;
  let deathTimer     = 0;
  const DEATH_DUR    = 0.9;
  let deathX         = 0;
  let deathY         = 0;
  let deathType      = 'car';
  let deathParticles = [];

  function triggerDeath(x, y, type) {
    deathActive    = true;
    deathTimer     = 0;
    deathX         = x;
    deathY         = y;
    deathType      = type || 'car';
    deathParticles = buildParticles(x, y, type);
  }

  function buildParticles(x, y, type) {
    const parts = [];
    const count = type === 'car' ? 14 : 10;
    for (let i = 0; i < count; i++) {
      const angle  = (Math.PI * 2 * i / count) + Math.random() * 0.4;
      const speed  = 55 + Math.random() * 80;
      const size   = 4 + Math.random() * 7;
      const colors = type === 'car'
        ? ['#FF6F00','#FF3D00','#FFD600','#FF8F00','#fff']
        : ['#64B5F6','#90CAF9','#fff','#B3E5FC','#E1F5FE'];
      parts.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (type === 'car' ? 20 : 60),
        size,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: type === 'car' ? 180 : 90,
        life: 0.6 + Math.random() * 0.4,
      });
    }
    return parts;
  }

  function isDying()   { return deathActive; }
  function deathDone() { return deathTimer >= DEATH_DUR; }

  // ── Day / Night cycle ────────────────────────────────────
  // nightRatio: 0 = full day, 1 = full night
  // Transitions smoothly when score crosses 100
  let nightRatio  = 0;   // current blend value
  let nightTarget = 0;   // target (0 or 1)

  // Call this every frame from main.js with current score
  let _lastNightScore = -1;
  let _nightOn = false;

  function setScore(score) {
    if (_dbgNightForce !== null) return; // debug override active
    if (score < 40) {
      _nightOn = false;
      nightTarget = 0;
      return;
    }
    // Toggle night every 40 score, randomly (independent of weather)
    const nThreshold = Math.floor(score / 40);
    if (nThreshold !== _lastNightScore) {
      _lastNightScore = nThreshold;
      _nightOn = Math.random() < 0.5;
    }
    nightTarget = _nightOn ? 1 : 0;
  }

  // Lerp two hex colours by t (0=a, 1=b)
  function lerpColor(a, b, t) {
    const ah = parseInt(a.slice(1), 16);
    const bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b2= Math.round(ab + (bb - ab) * t);
    return '#' + [r, g, b2].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // Day colours → Night colours
  const PALETTE = {
    sky:     ['#87CEEB', '#0a0a2e'],
    grass0:  ['#4CAF50', '#1a3a1a'],
    grass1:  ['#43A047', '#162e16'],
    road0:   ['#555555', '#222233'],
    road1:   ['#4a4a4a', '#1c1c2a'],
    water0:  ['#1565C0', '#0a1a40'],
    water1:  ['#1976D2', '#0c2050'],
    bush:    ['#2E7D32', '#0f2a0f'],
    bushLt:  ['#388E3C', '#1a3a1a'],
    treeDk:  ['#1B5E20', '#091a09'],
    treeMd:  ['#2E7D32', '#0f2a0f'],
    treeLt:  ['#388E3C', '#1a3a1a'],
    trunk:   ['#795548', '#3a2a1a'],
    rockDk:  ['#757575', '#333344'],
    rockLt:  ['#9E9E9E', '#555566'],
    logDk:   ['#795548', '#3a2a1a'],
    logLt:   ['#8D6E63', '#4a3828'],
    stripe:  ['#FFD700', '#886600'],
    water_fx:['rgba(255,255,255,0.08)', 'rgba(100,150,255,0.12)'],
  };

  // ── Biome palettes ─────────────────────────────────────────
  const BIOME_PALETTES = {
    default: PALETTE,

    desert: {
      sky:      ['#E8D5A3', '#1a1005'],
      grass0:   ['#C2B280', '#3a2e1a'],
      grass1:   ['#B8A872', '#352a16'],
      road0:    ['#6B5B45', '#2a2218'],
      road1:    ['#5F5040', '#252015'],
      water0:   ['#1565C0', '#0a1a40'],
      water1:   ['#1976D2', '#0c2050'],
      bush:     ['#5B7F3B', '#1a2a0f'],
      bushLt:   ['#6B8F4B', '#223615'],
      treeDk:   ['#2E5E1A', '#0a1a06'],
      treeMd:   ['#3E7E2A', '#142a0a'],
      treeLt:   ['#4E9E3A', '#1e3a0e'],
      trunk:    ['#8B7355', '#3a2e1a'],
      rockDk:   ['#A0876A', '#443828'],
      rockLt:   ['#C4A882', '#665540'],
      logDk:    ['#8B7355', '#3a2e1a'],
      logLt:    ['#A08E6E', '#4a3e28'],
      stripe:   ['#FFD700', '#886600'],
      water_fx: ['rgba(255,255,255,0.08)', 'rgba(100,150,255,0.12)'],
    },

    snow: {
      sky:      ['#B0C4DE', '#0a0a1e'],
      grass0:   ['#E8E8F0', '#2a2a3a'],
      grass1:   ['#D8D8E8', '#252536'],
      road0:    ['#707080', '#222233'],
      road1:    ['#606070', '#1c1c2a'],
      water0:   ['#4A8BB5', '#0a1a30'],
      water1:   ['#5A9BC5', '#0c2040'],
      bush:     ['#E0E0E8', '#2a2a35'],
      bushLt:   ['#F0F0F8', '#353540'],
      treeDk:   ['#1B5E3A', '#091a12'],
      treeMd:   ['#2E7D4A', '#0f2a18'],
      treeLt:   ['#388E5C', '#1a3a22'],
      trunk:    ['#5D4037', '#2a1a10'],
      rockDk:   ['#8899AA', '#334455'],
      rockLt:   ['#AABBCC', '#556677'],
      logDk:    ['#6D5548', '#2a1a10'],
      logLt:    ['#7D6E58', '#3a2818'],
      stripe:   ['#FFFFFF', '#888888'],
      water_fx: ['rgba(200,220,255,0.10)', 'rgba(120,160,255,0.14)'],
    },
  };

  const BIOME_DECORATIONS = {
    default: ['bush', 'bush', 'tree', 'rock'],
    desert:  ['cactus', 'cactus', 'tumbleweed', 'rock'],
    snow:    ['pine', 'pine', 'snowman', 'rock'],
  };

  const BIOME_ORDER     = ['default', 'desert', 'snow'];
  const BIOME_CYCLE_LEN = 80;
  const BIOME_BLEND_LEN = 5;

  // Darken a hex color by a factor (0=no change, 1=black)
  function darkenHex(hex, factor) {
    const c = hex.replace('#', '');
    const r = Math.round(parseInt(c.substr(0,2), 16) * (1 - factor));
    const g = Math.round(parseInt(c.substr(2,2), 16) * (1 - factor));
    const b = Math.round(parseInt(c.substr(4,2), 16) * (1 - factor));
    return '#' + [r,g,b].map(v => Math.max(0,v).toString(16).padStart(2,'0')).join('');
  }

  // Biome info for player's current row (set each frame)
  let _currentBiomeInfo = { biome: 'default', nextBiome: null, blendT: 0 };

  // Get current blended colour (uses player's biome for global elements)
  function dc(key) {
    return dcBiome(key, _currentBiomeInfo);
  }

  // Biome-aware color: palette lookup + day/night + biome blend
  function dcBiome(key, bi) {
    const pal = BIOME_PALETTES[bi.biome] || PALETTE;
    if (!pal[key]) return '#ff00ff'; // debug fallback
    const base = lerpColor(pal[key][0], pal[key][1], nightRatio);
    if (bi.blendT > 0 && bi.nextBiome) {
      const nextPal = BIOME_PALETTES[bi.nextBiome] || PALETTE;
      if (!nextPal[key]) return base;
      const next = lerpColor(nextPal[key][0], nextPal[key][1], nightRatio);
      return lerpColor(base, next, bi.blendT);
    }
    return base;
  }

  let playerImg = null;
  let coinImg   = null;

  function init() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx    = canvas.getContext('2d');
    loadCarSprites();
    loadPlayerSprite();
    loadCoinSprite();
    resize();
  }

  function loadPlayerSprite() {
    const img = new Image();
    img.onload = () => { playerImg = img; };
    img.src = '/game/player.png';
  }

  function loadCoinSprite() {
    const img = new Image();
    img.onload = () => { coinImg = img; };
    img.src = '/game/coin.png';
  }

  // ── Car sprites loaded from embedded base64 ──────────────
  // Weighted sprite pool — police is rare, siren police is very rare
  // Drawn deterministically per rowIdx so sprite doesn't flicker
  // SPRITE_POOL is fallback only — cars carry spriteKey from world.js
  const SPRITE_POOL = [
    'orange', 'yellow_taxi', 'green_taxi', 'taxi',
    'police', 'orange', 'yellow_taxi', 'green_taxi',
  ];

  function getSpriteName(rowIdx) {
    return SPRITE_POOL[rowIdx % SPRITE_POOL.length];
  }

  // Siren blink state
  let sirenPhase = 0;  // advances in draw()
  const carImages = {};
  let spritesReady = false;

  function loadCarSprites() {
    if (typeof CAR_SPRITES_B64 === 'undefined') return;
    // Load ALL sprites from CAR_SPRITES_B64
    const allNames = Object.keys(CAR_SPRITES_B64);
    let loaded = 0;
    const total = allNames.length;
    allNames.forEach(name => {
      const img = new Image();
      img.onload = () => { if (++loaded === total) spritesReady = true; };
      img.src = CAR_SPRITES_B64[name];
      carImages[name] = img;
    });
    if (total === 0) spritesReady = true;
  }

  function resize() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function updateCamera(dt) {
    if (!canvas) return;
    const ps = Player.getState();
    const worldY  = World.rowToY(ps.row) + CELL / 2;
    // Учитываем масштаб: видимая высота в мировых координатах = canvas.height / scale
    const worldW = COLS * CELL;
    const scale = Math.min(1, (canvas.width / worldW) * 1.25);
    const visibleH = canvas.height / scale;
    targetCamY = worldY - visibleH * 0.65;
    // Не показывать пустоту ниже карты: камера не должна показывать область ниже нижних рядов
    // rowToY(-12) = 12*CELL = 768, нижний край экрана = cameraY + visibleH
    // Нужно: cameraY + visibleH <= 12*CELL + CELL => cameraY <= 13*CELL - visibleH
    const maxCamY = 13 * CELL - visibleH;
    if (targetCamY > maxCamY) targetCamY = maxCamY;
    const SPEED = 8;
    cameraY += (targetCamY - cameraY) * Math.min(dt * SPEED, 1);
  }

  function draw() {
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;

    // Advance water animation
    const dt_approx = 0.016;
    waterTime  += dt_approx;
    sirenPhase += dt_approx;

    // Advance walk cycle — only when player is jumping/moving
    const _ps = Player.getState();
    if (_ps.jumping || _ps.onLog) walkTime += dt_approx;

    // Advance weather blend (slower for smoother transitions)
    const targetRatio = weatherState > 0 ? 1 : 0;
    weatherRatio += (targetRatio - weatherRatio) * 0.012;

    // Advance rain particles (rain + storm)
    if (weatherState === 1 || weatherState === 3 || weatherRatio > 0.05) {
      initRain(weatherState === 3 ? STORM_RAIN_COUNT : RAIN_COUNT);
      for (const p of rainParticles) {
        p.y += p.speed * dt_approx;
        // Storm: add horizontal drift
        if (weatherState === 3) p.x += 0.02 * dt_approx;
        if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
        if (p.x > 1.05) { p.x = -0.05; }
      }
    }

    // Advance wind particles
    if (weatherState === 4 || (windParticles.length > 0 && weatherRatio > 0.05)) {
      initWind();
      for (const p of windParticles) {
        p.x += p.speed * dt_approx;
        if (p.x > 1.1) { p.x = -0.1; p.y = Math.random(); }
      }
    }

    // Lightning timer (storm only)
    if (weatherState === 3 && weatherRatio > 0.5) {
      lightningTimer -= dt_approx;
      if (lightningTimer <= 0) {
        lightningFlash = 1;
        lightningTimer = 3 + Math.random() * 5; // 3-8 sec
      }
    }
    if (lightningFlash > 0) {
      lightningFlash -= dt_approx * 4; // flash fades in 0.25s
      if (lightningFlash < 0) lightningFlash = 0;
    }

    // Age and prune trails
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].age += dt_approx;
      if (trails[i].age >= TRAIL_MAX_AGE) trails.splice(i, 1);
    }

    // Advance death animation timer
    if (deathActive) {
      deathTimer += dt_approx;
    }

    // Smoothly advance nightRatio toward target (slower for cinematic feel)
    const NIGHT_SPEED = 0.005;
    if (nightRatio < nightTarget) nightRatio = Math.min(nightRatio + NIGHT_SPEED, nightTarget);
    if (nightRatio > nightTarget) nightRatio = Math.max(nightRatio - NIGHT_SPEED, nightTarget);

    ctx.clearRect(0, 0, W, H);

    // Sky — blend with weather tint
    let skyColor = dc('sky');
    if (weatherRatio > 0.02) {
      const wR = Math.min(weatherRatio * 1.5, 1);
      let weatherSky;
      if (weatherState === 1) {
        // Rain: grey-blue
        weatherSky = nightRatio > 0.5 ? '#050a18' : '#6b7a8c';
      } else if (weatherState === 2) {
        // Fog: pale milky / dark blue
        weatherSky = nightRatio > 0.5 ? '#0a0e1a' : '#c8cfd8';
      } else if (weatherState === 3) {
        // Storm: very dark
        weatherSky = nightRatio > 0.5 ? '#030610' : '#3a4555';
      } else if (weatherState === 4) {
        // Wind: slightly desaturated
        weatherSky = nightRatio > 0.5 ? '#08102a' : '#7ba0b8';
      } else {
        weatherSky = dc('sky');
      }
      skyColor = lerpColor(skyColor, weatherSky, wR * 0.55);
    }
    ctx.fillStyle = skyColor;
    ctx.fillRect(0, 0, W, H);

    // Stars (only visible at night, hidden in overcast weather)
    const overcast = (weatherState === 1 || weatherState === 2 || weatherState === 3) ? weatherRatio : 0;
    if (nightRatio > 0.05 && overcast < 0.7) {
      drawStars(W, H);
    }

    // Moon (appears at night, dimmed by overcast)
    if (nightRatio > 0.1 && overcast < 0.9) {
      drawMoon(W, H);
    }

    const worldW = COLS * CELL;
    // Zoom: on narrow screens, scale up 25% for closer camera (crops sides slightly)
    const baseScale = W / worldW;
    const scale = Math.min(1, baseScale * 1.25);
    const scaledW = worldW * scale;
    const offsetX = (W - scaledW) / 2;
    ctx.save();
    ctx.translate(offsetX, 0);
    ctx.scale(scale, scale);
    ctx.translate(0, -cameraY);
    // Set current biome for global elements (sky)
    _currentBiomeInfo = World.getBiomeForRow(Player.getState().row);
    drawRows();
    drawTrails();
    drawPlayer();
    drawCoinEffects(dt_approx);
    // Draw death particles in world space (before restore)
    if (deathActive) {
      drawDeathAnimation(dt_approx);
    }

    ctx.restore();

    // Night overlay
    if (nightRatio > 0) {
      ctx.fillStyle = `rgba(0,0,20,${nightRatio * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Weather overlays (screen space — after world restore)
    if (weatherRatio > 0.01) {
      if (weatherState === 1) {
        drawRain(W, H, false);
      } else if (weatherState === 2) {
        drawFog(W, H);
      } else if (weatherState === 3) {
        drawRain(W, H, true);
        drawLightning(W, H);
      } else if (weatherState === 4) {
        drawWind(W, H);
      }
    }
  }

  // ── Stars ─────────────────────────────────────────────────
  // Deterministic star field (same positions every frame)
  const STAR_POSITIONS = Array.from({length: 60}, (_, i) => ({
    x: ((i * 2654435761) % 10000) / 10000,
    y: ((i * 1234567891) % 10000) / 10000,
    r: 0.5 + ((i * 987654321) % 1000) / 2000,
  }));

  function drawStars(W, H) {
    const alpha = nightRatio;
    for (const s of STAR_POSITIONS) {
      const twinkle = 0.6 + 0.4 * Math.sin(Date.now() * 0.001 + s.x * 20);
      ctx.fillStyle = `rgba(255,255,220,${alpha * twinkle * 0.9})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H * 0.5, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Moon ──────────────────────────────────────────────────
  function drawMoon(W, H) {
    const alpha = Math.min(nightRatio * 2, 1);
    const mx = W * 0.82, my = H * 0.08, mr = 22;
    // Glow
    const grd = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 2.5);
    grd.addColorStop(0, `rgba(255,255,200,${alpha * 0.25})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Moon body
    ctx.fillStyle = `rgba(255,250,220,${alpha})`;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    // Crescent shadow
    ctx.fillStyle = dc('sky');
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.1, mr * 0.82, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRows() {
    for (const row of World.getRows()) {
      const y = World.rowToY(row.idx);
      const bi = { biome: row.biome || 'default', nextBiome: row.nextBiome || null, blendT: row.blendT || 0 };
      if (row.type === 'grass') {
        drawGrassRow(row, y, bi);
      } else if (row.type === 'road') {
        ctx.fillStyle = row.idx % 2 === 0 ? dcBiome('road0', bi) : dcBiome('road1', bi);
        ctx.fillRect(0, y, COLS * CELL, CELL);
        drawRoadMarkings(y, bi);
        drawCars(row, y);
      } else if (row.type === 'water') {
        let waterColor = row.idx % 2 === 0 ? dcBiome('water0', bi) : dcBiome('water1', bi);
        if (weatherRatio > 0.05 && (weatherState === 1 || weatherState === 3)) {
          const wetWater = nightRatio > 0.3 ? '#0a1a45' : '#0d3a6e';
          const blend = weatherState === 3 ? 0.5 : 0.35;
          waterColor = lerpColor(waterColor, wetWater, Math.min(weatherRatio, 1) * blend);
        }
        ctx.fillStyle = waterColor;
        ctx.fillRect(0, y, COLS * CELL, CELL);
        drawWaterEffect(y);
        drawLogs(row, y, bi);
      } else if (row.type === 'train') {
        drawTrainRow(row, y);
      }
    }
  }

  function drawGrassRow(row, y, bi) {
    // Ground — day/night + biome blended colour
    let grassColor = row.idx % 2 === 0 ? dcBiome('grass0', bi) : dcBiome('grass1', bi);
    if (weatherRatio > 0.05 && weatherState > 0) {
      // Darken biome grass for weather effect
      const baseGrass = dcBiome('grass0', bi);
      const wetGrass = darkenHex(baseGrass, weatherState === 2 ? 0.15 : weatherState === 4 ? 0.08 : 0.25);
      const blend = weatherState === 3 ? 0.4 : 0.3;
      grassColor = lerpColor(grassColor, wetGrass, Math.min(weatherRatio, 1) * blend);
    }
    ctx.fillStyle = grassColor;
    ctx.fillRect(0, y, COLS * CELL, CELL);

    // Coins
    if (row.coins) {
      const t = Date.now() / 600;
      const size = CELL * 0.72;
      for (const coin of row.coins) {
        if (coin.collected) continue;
        const cx = coin.col * CELL + CELL / 2;
        const cy = y + CELL / 2;
        const bob    = Math.sin(t + coin.col * 1.3) * CELL * 0.07;
        const scaleX = Math.abs(Math.cos(t * 0.9 + coin.col * 0.7));
        const drawW  = size * Math.max(scaleX, 0.08);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + size * 0.46, drawW * 0.48, CELL * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(cx, cy + bob);
        if (coinImg) {
          // Спрайт пользователя — spinning эффект через scaleX
          ctx.drawImage(coinImg, -drawW / 2, -size / 2, drawW, size);
        } else {
          // Fallback: нарисованная монета
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.ellipse(0, 0, drawW / 2, size / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Decorations — wind/storm sway
    if (row.decorations) {
      const windSway = (weatherState === 4 || weatherState === 3) && weatherRatio > 0.1
        ? Math.sin(Date.now() * 0.003 + y * 0.05) * weatherRatio * (weatherState === 3 ? 4 : 3)
        : 0;
      for (const d of row.decorations) {
        const cx = d.col * CELL + CELL / 2;
        const cy = y + CELL / 2;
        const swayX = d.type === 'rock' || d.type === 'snowman' ? 0 : windSway;
        if      (d.type === 'bush')       drawBush(cx + swayX, cy, bi);
        else if (d.type === 'tree')       drawTree(cx + swayX * 1.5, cy, bi);
        else if (d.type === 'rock')       drawRock(cx, cy, bi);
        else if (d.type === 'cactus')     drawCactus(cx + swayX * 0.5, cy, bi);
        else if (d.type === 'tumbleweed') drawTumbleweed(cx + swayX * 2, cy, bi);
        else if (d.type === 'pine')       drawPine(cx + swayX * 1.2, cy, bi);
        else if (d.type === 'snowman')    drawSnowman(cx, cy, bi);
      }
    }
  }

  // ── Bush: round dark-green blob ────────────────────────────
  function drawBush(cx, cy, bi) {
    const r = CELL * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.9, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    const clusters = [
      {dx:  0,   dy: -r*0.1, r: r * 0.72},
      {dx: -r*0.45, dy:  r*0.15, r: r * 0.55},
      {dx:  r*0.45, dy:  r*0.15, r: r * 0.55},
    ];
    for (const c of clusters) {
      ctx.fillStyle = dcBiome('bush', bi);
      ctx.beginPath();
      ctx.arc(cx + c.dx, cy + c.dy, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dcBiome('bushLt', bi);
      ctx.beginPath();
      ctx.arc(cx + c.dx - c.r*0.2, cy + c.dy - c.r*0.25, c.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(cx - r*0.18, cy - r*0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Tree: trunk + round canopy ──────────────────────────────
  function drawTree(cx, cy, bi) {
    const r = CELL * 0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.7, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    const trunkW = r * 0.32, trunkH = r * 0.55;
    ctx.fillStyle = dcBiome('trunk', bi);
    ctx.fillRect(cx - trunkW/2, cy + r*0.15, trunkW, trunkH);
    ctx.fillStyle = dcBiome('treeDk', bi);
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.1, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dcBiome('treeMd', bi);
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.18, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dcBiome('treeLt', bi);
    ctx.beginPath();
    ctx.arc(cx - r*0.15, cy - r * 0.3, r * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx - r*0.25, cy - r*0.5, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Rock: flat grey stone ───────────────────────────────────
  function drawRock(cx, cy, bi) {
    const rw = CELL * 0.3, rh = CELL * 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + rh * 0.9, rw * 0.9, rh * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dcBiome('rockDk', bi);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Cactus: tall green column with arms (desert) ────────────
  function drawCactus(cx, cy, bi) {
    const h = CELL * 0.6, w = CELL * 0.12;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.35, w * 2.5, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main trunk
    ctx.fillStyle = dcBiome('treeMd', bi);
    roundRect(ctx, cx - w/2, cy - h * 0.35, w, h, w/2);
    ctx.fill();
    // Left arm
    ctx.fillStyle = dcBiome('treeDk', bi);
    const armW = w * 0.8, armH = h * 0.22;
    roundRect(ctx, cx - w*2, cy - h * 0.1, w * 1.6, armW, armW/2);
    ctx.fill();
    roundRect(ctx, cx - w*2, cy - h * 0.1 - armH, armW, armH + armW/2, armW/2);
    ctx.fill();
    // Right arm
    ctx.fillStyle = dcBiome('treeLt', bi);
    roundRect(ctx, cx + w*0.4, cy + h * 0.05, w * 1.4, armW, armW/2);
    ctx.fill();
    roundRect(ctx, cx + w*1.4, cy + h * 0.05 - armH * 0.7, armW, armH * 0.7 + armW/2, armW/2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(cx - w*0.15, cy - h * 0.3, w * 0.2, h * 0.5);
  }

  // ── Tumbleweed: round tangled ball (desert) ────────────────
  function drawTumbleweed(cx, cy, bi) {
    const r = CELL * 0.2;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.7, r * 0.85, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = dcBiome('trunk', bi);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Wire arcs
    ctx.strokeStyle = darkenHex(dcBiome('trunk', bi), 0.2);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * r * 0.2, cy + Math.sin(angle) * r * 0.2, r * 0.6, angle, angle + Math.PI * 0.8);
      ctx.stroke();
    }
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Pine: triangular evergreen (snow) ──────────────────────
  function drawPine(cx, cy, bi) {
    const h = CELL * 0.55, w = CELL * 0.38;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.35, w * 0.6, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // Trunk
    const trunkW = CELL * 0.08, trunkH = CELL * 0.12;
    ctx.fillStyle = dcBiome('trunk', bi);
    ctx.fillRect(cx - trunkW/2, cy + h * 0.1, trunkW, trunkH);
    // Three stacked triangles
    const layers = [
      { y: cy + h * 0.1,  w: w * 0.9, h: h * 0.4, key: 'treeDk' },
      { y: cy - h * 0.1,  w: w * 0.7, h: h * 0.35, key: 'treeMd' },
      { y: cy - h * 0.28, w: w * 0.5, h: h * 0.3, key: 'treeLt' },
    ];
    for (const l of layers) {
      ctx.fillStyle = dcBiome(l.key, bi);
      ctx.beginPath();
      ctx.moveTo(cx, l.y - l.h);
      ctx.lineTo(cx - l.w / 2, l.y);
      ctx.lineTo(cx + l.w / 2, l.y);
      ctx.closePath();
      ctx.fill();
    }
    // Snow cap
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - h * 0.28 - h * 0.3);
    ctx.lineTo(cx - w * 0.12, cy - h * 0.28 - h * 0.15);
    ctx.lineTo(cx + w * 0.12, cy - h * 0.28 - h * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  // ── Snowman: three stacked circles (snow) ──────────────────
  function drawSnowman(cx, cy, bi) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + CELL * 0.22, CELL * 0.22, CELL * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bottom ball
    ctx.fillStyle = '#F0F0F5';
    ctx.beginPath();
    ctx.arc(cx, cy + CELL * 0.08, CELL * 0.18, 0, Math.PI * 2);
    ctx.fill();
    // Middle ball
    ctx.fillStyle = '#E8E8ED';
    ctx.beginPath();
    ctx.arc(cx, cy - CELL * 0.1, CELL * 0.14, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = '#F5F5FA';
    ctx.beginPath();
    ctx.arc(cx, cy - CELL * 0.25, CELL * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(cx - CELL * 0.03, cy - CELL * 0.27, CELL * 0.015, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + CELL * 0.03, cy - CELL * 0.27, CELL * 0.015, 0, Math.PI * 2);
    ctx.fill();
    // Carrot nose
    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.moveTo(cx, cy - CELL * 0.25);
    ctx.lineTo(cx + CELL * 0.06, cy - CELL * 0.24);
    ctx.lineTo(cx, cy - CELL * 0.23);
    ctx.closePath();
    ctx.fill();
    // Shade on right side
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.arc(cx + CELL * 0.04, cy + CELL * 0.08, CELL * 0.16, -0.5, 0.5);
    ctx.fill();
  }

  // Keep for fallback (unused now but kept for safety)
  function drawGrassDetails(y) {}

  function drawRoadMarkings(y, bi) {
    ctx.strokeStyle = dcBiome('stripe', bi);
    ctx.lineWidth   = 2;
    ctx.setLineDash([14, 14]);
    ctx.beginPath();
    ctx.moveTo(0,           y + CELL / 2);
    ctx.lineTo(COLS * CELL, y + CELL / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCars(row, rowY) {
    for (let carI = 0; carI < row.obstacles.length; carI++) {
      const car = row.obstacles[carI];
      const x = car.x;
      const y = rowY + (CELL - car.height) / 2;

      // Use explicit spriteKey from world if available, else fall back to pool
      const isSiren    = car.isSirenCar === true;
      const slot       = (car.spriteSlot !== undefined) ? car.spriteSlot : carI;
      const spriteName = isSiren ? 'police_siren'
                       : (car.spriteKey || getSpriteName(row.idx * 7 + slot));
      const imageKey   = spriteName === 'police_siren' ? 'police' : spriteName;
      const sprite     = carImages[imageKey];

      if (spritesReady && sprite && sprite.complete) {
        if (car.speed < 0) {
          ctx.save();
          ctx.translate(x + car.width, y);
          ctx.scale(-1, 1);
          ctx.drawImage(sprite, 0, 0, car.width, car.height);
          ctx.restore();
        } else {
          ctx.drawImage(sprite, x, y, car.width, car.height);
        }
      } else {
        ctx.fillStyle = isSiren ? '#CFD8DC' : CAR_COLORS[row.idx % CAR_COLORS.length];
        roundRect(ctx, x, y, car.width, car.height, 6);
        ctx.fill();
      }

      // Headlights & taillights at night — per-sprite pixel-accurate positions
      if (nightRatio > 0.15) {
        const hlAlpha = nightRatio * 0.85;
        const sprW = spriteName === 'truck' || spriteName === 'firetruck' || spriteName === 'bus' ? 192 : spriteName === 'ambulance' ? 128 : 96;
        const sx = car.width / sprW;
        const sy = car.height / 46;

        const LIGHT_MAP = {
          taxi:        { front: [{x:92,y:8},{x:92,y:38}],  rear: [{x:5,y:8},{x:5,y:38}] },
          police:      { front: [{x:90,y:8},{x:90,y:38}],  rear: [{x:6,y:8},{x:6,y:38}] },
          orange:      { front: [{x:92,y:10},{x:92,y:36}], rear: [{x:7,y:8},{x:7,y:38}] },
          green_taxi:  { front: [{x:93,y:12},{x:93,y:34}], rear: [{x:7,y:9},{x:7,y:37}] },
          yellow_taxi: { front: [{x:92,y:8},{x:92,y:38}],  rear: [{x:7,y:8},{x:7,y:38}] },
          ambulance:   { front: [{x:122,y:9},{x:122,y:38}],rear: [{x:4,y:7},{x:4,y:39}] },
          truck:       { front: [{x:187,y:9},{x:187,y:36}],rear: [{x:3,y:9},{x:3,y:38}] },
          firetruck:   { front: [{x:186,y:10},{x:186,y:35}],rear:[{x:4,y:8},{x:4,y:37}] },
          bus:         { front: [{x:188,y:8},{x:188,y:38}],rear: [{x:3,y:9},{x:3,y:37}] }
        };
        const lights = LIGHT_MAP[imageKey] || LIGHT_MAP.taxi;
        const facingRight = car.speed > 0;
        const lightR = 2.5 * sx;
        const beamDir = facingRight ? 1 : -1;

        const toCanvas = (lx, ly) => {
          const cx = facingRight ? x + lx * sx : x + (sprW - lx) * sx;
          const cy = y + ly * sy;
          return { cx, cy };
        };

        // === Layer 3: Soft beam cone (road illumination) — drawn first (underneath) ===
        if (lights.front.length >= 2) {
          const topF = toCanvas(lights.front[0].x, lights.front[0].y);
          const botF = toCanvas(lights.front[1].x, lights.front[1].y);
          const midFx = (topF.cx + botF.cx) / 2;
          const midFy = (topF.cy + botF.cy) / 2;
          const beamLen = CELL * 1.6;
          const beamEndX = midFx + beamLen * beamDir;
          const halfSpread = (botF.cy - topF.cy) / 2;

          // Road illumination — wide soft glow on road surface
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const roadGrd = ctx.createRadialGradient(
            midFx, midFy, CELL * 0.1,
            midFx + beamLen * 0.5 * beamDir, midFy, beamLen * 0.7
          );
          roadGrd.addColorStop(0, `rgba(255,235,170,${hlAlpha * 0.08})`);
          roadGrd.addColorStop(0.4, `rgba(255,235,170,${hlAlpha * 0.04})`);
          roadGrd.addColorStop(1, 'rgba(255,235,170,0)');
          ctx.fillStyle = roadGrd;
          ctx.beginPath();
          ctx.moveTo(midFx, topF.cy - lightR * 2);
          ctx.lineTo(beamEndX, topF.cy - halfSpread - CELL * 0.4);
          ctx.lineTo(beamEndX, botF.cy + halfSpread + CELL * 0.4);
          ctx.lineTo(midFx, botF.cy + lightR * 2);
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();

          // Inner beam cone — brighter, narrower
          ctx.save();
          const coneGrd = ctx.createLinearGradient(midFx, midFy, beamEndX, midFy);
          coneGrd.addColorStop(0, `rgba(255,240,190,${hlAlpha * 0.18})`);
          coneGrd.addColorStop(0.3, `rgba(255,240,190,${hlAlpha * 0.10})`);
          coneGrd.addColorStop(0.7, `rgba(255,240,190,${hlAlpha * 0.03})`);
          coneGrd.addColorStop(1, 'rgba(255,240,190,0)');
          ctx.fillStyle = coneGrd;
          ctx.beginPath();
          ctx.moveTo(topF.cx, topF.cy);
          ctx.lineTo(beamEndX, topF.cy - CELL * 0.3);
          ctx.lineTo(beamEndX, botF.cy + CELL * 0.3);
          ctx.lineTo(botF.cx, botF.cy);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // === Layer 2: Circular glow halo around each headlight ===
        for (const fl of lights.front) {
          const { cx: fx, cy: fy } = toCanvas(fl.x, fl.y);
          const glowR = CELL * 0.5;
          const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR);
          grd.addColorStop(0, `rgba(255,238,180,${hlAlpha * 0.55})`);
          grd.addColorStop(0.15, `rgba(255,238,180,${hlAlpha * 0.3})`);
          grd.addColorStop(0.4, `rgba(255,235,170,${hlAlpha * 0.1})`);
          grd.addColorStop(1, 'rgba(255,235,170,0)');
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // === Layer 1: Bright hot-spot at each headlight ===
        for (const fl of lights.front) {
          const { cx: fx, cy: fy } = toCanvas(fl.x, fl.y);
          const dotGrd = ctx.createRadialGradient(fx, fy, 0, fx, fy, lightR * 1.8);
          dotGrd.addColorStop(0, `rgba(255,252,235,${hlAlpha})`);
          dotGrd.addColorStop(0.5, `rgba(255,245,200,${hlAlpha * 0.5})`);
          dotGrd.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.fillStyle = dotGrd;
          ctx.beginPath();
          ctx.arc(fx, fy, lightR * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // === Rear taillights — two layers ===
        for (const rl of lights.rear) {
          const { cx: rx, cy: ry } = toCanvas(rl.x, rl.y);
          // Outer red glow
          const rGrd = ctx.createRadialGradient(rx, ry, 0, rx, ry, CELL * 0.22);
          rGrd.addColorStop(0, `rgba(255,25,15,${hlAlpha * 0.55})`);
          rGrd.addColorStop(0.3, `rgba(255,15,10,${hlAlpha * 0.2})`);
          rGrd.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = rGrd;
          ctx.beginPath();
          ctx.arc(rx, ry, CELL * 0.22, 0, Math.PI * 2);
          ctx.fill();
          // Inner bright red dot
          const rDot = ctx.createRadialGradient(rx, ry, 0, rx, ry, lightR * 0.8);
          rDot.addColorStop(0, `rgba(255,60,40,${hlAlpha * 0.95})`);
          rDot.addColorStop(0.6, `rgba(255,30,20,${hlAlpha * 0.4})`);
          rDot.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = rDot;
          ctx.beginPath();
          ctx.arc(rx, ry, lightR * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Siren lights — pixel-perfect over the lightbar on the sprite.
      // On the 96×46 sprite (facing right):
      //   Blue light: x=48–53, y=13–18  → top siren square
      //   Red  light: x=48–53, y=27–32  → bottom siren square
      // When car faces LEFT (speed<0), sprite is flipped: mirror x as (95-x)
      if (isSiren) {
        const blink    = Math.sin(sirenPhase * Math.PI * 6) > 0;
        const sx = car.width  / 96;   // x scale factor
        const sy = car.height / 46;   // y scale factor

        // Light block dimensions (6px wide, 6px tall in sprite space)
        const lw = 6 * sx;
        const lh = 6 * sy;

        // Sprite coords for lights (facing right)
        const lightSX = 48 * sx;    // x in drawn coords
        const blueTopY = 13 * sy;
        const redTopY  = 27 * sy;

        let lx;
        if (car.speed < 0) {
          // Flipped: mirror x = (96 - 48 - 6) * sx = 42 * sx
          lx = x + 42 * sx;
        } else {
          lx = x + lightSX;
        }

        const blueAlpha = blink ? 0.95 : 0.12;
        const redAlpha  = blink ? 0.12 : 0.95;

        ctx.fillStyle = `rgba(20,100,255,${blueAlpha})`;
        ctx.fillRect(lx, y + blueTopY, lw, lh);

        ctx.fillStyle = `rgba(255,20,20,${redAlpha})`;
        ctx.fillRect(lx, y + redTopY, lw, lh);

        // Soft glow matching active colour
        ctx.fillStyle = blink
          ? 'rgba(20,100,255,0.06)'
          : 'rgba(255,20,20,0.06)';
        ctx.fillRect(x, y, car.width, car.height);
      }
    }
  }

  const CAR_COLORS = ['#E53935','#1E88E5','#43A047','#FB8C00','#8E24AA','#00ACC1'];

  function drawWaterEffect(rowY) {
    const W  = COLS * CELL;
    const wt = waterTime;

    // Weather-dependent wave boost: rain 1.2x, storm 1.8x, wind 1.3x
    let wBoostVal = 0;
    if (weatherState === 1) wBoostVal = 1.2;
    else if (weatherState === 3) wBoostVal = 1.8;
    else if (weatherState === 4) wBoostVal = 1.3;
    const wBoost = 1 + Math.min(weatherRatio, 1) * wBoostVal;
    const waveStep  = 4;

    const allWaves = [
      { yOff: 10, amp: 3.5 * wBoost, freq: 0.045, speed: 0.9  * wBoost, alpha: 0.22, h: 3 },
      { yOff: 36, amp: 4   * wBoost, freq: 0.038, speed: 0.75 * wBoost, alpha: 0.20, h: 3 },
      { yOff: 22, amp: 2.5 * wBoost, freq: 0.055, speed: -0.6 * wBoost, alpha: 0.15, h: 2.5 },
      { yOff: 50, amp: 2   * wBoost, freq: 0.06,  speed: -0.5 * wBoost, alpha: 0.13, h: 2 },
    ];

    // Wave color — boost alpha at night so waves stay visible
    const nightAlphaBoost = 1 + nightRatio * 0.5;
    const r  = Math.round(255 * (1 - nightRatio * 0.35));  // less red reduction
    const gb = Math.round(255 - nightRatio * 40);           // less green reduction

    for (const w of allWaves) {
      const baseY = rowY + w.yOff;
      ctx.fillStyle = `rgba(${r},${gb},255,${w.alpha * nightAlphaBoost})`;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= W; x += waveStep) {
        const waveY = baseY + Math.sin(x * w.freq + wt * w.speed) * w.amp;
        ctx.lineTo(x, waveY);
      }
      ctx.lineTo(W, baseY + w.h + w.amp);
      ctx.lineTo(0, baseY + w.h + w.amp);
      ctx.closePath();
      ctx.fill();
    }

    // Glints — moonlight reflections at night
    {
      const glintBase = nightRatio > 0.3 ? 0.35 : 0.55;
      ctx.fillStyle = `rgba(255,255,255,${glintBase + 0.25 * Math.sin(wt * 3)})`;
      const glints = [
        {x: W * 0.12, yo: 15}, {x: W * 0.35, yo: 40},
        {x: W * 0.58, yo: 20}, {x: W * 0.78, yo: 48},
        {x: W * 0.92, yo: 30},
      ];
      for (const g of glints) {
        const flicker = 0.3 + 0.7 * Math.abs(Math.sin(wt * 2.5 + g.x));
        if (flicker > 0.6) {
          ctx.globalAlpha = flicker * (nightRatio > 0.3 ? 0.7 : 0.5);
          ctx.fillRect(g.x, rowY + g.yo, 2, 2);
        }
      }
      // Moonlight shimmer on water at night
      if (nightRatio > 0.3) {
        const moonGlints = [
          {x: W * 0.7,  yo: 25}, {x: W * 0.75, yo: 35},
          {x: W * 0.82, yo: 18},
        ];
        for (const mg of moonGlints) {
          const shimmer = 0.5 + 0.5 * Math.sin(wt * 1.8 + mg.x * 0.1);
          ctx.globalAlpha = shimmer * nightRatio * 0.4;
          ctx.fillStyle = 'rgba(200,220,255,1)';
          ctx.fillRect(mg.x, rowY + mg.yo, 3, 1.5);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Rain ripples on water surface
    if ((weatherState === 1 || weatherState === 3) && weatherRatio > 0.2) {
      const rippleCount = weatherState === 3 ? 5 : 3;
      const ripAlpha = Math.min(weatherRatio, 1) * 0.25;
      ctx.strokeStyle = `rgba(${r},${gb},255,${ripAlpha})`;
      ctx.lineWidth = 0.8;
      for (let i = 0; i < rippleCount; i++) {
        const rx = ((wt * 40 + i * W / rippleCount) % W);
        const ry = rowY + 15 + (i * 13) % 45;
        const rr = 2 + Math.sin(wt * 3 + i * 2) * 1.5;
        ctx.globalAlpha = ripAlpha * (0.5 + 0.5 * Math.cos(wt * 4 + i));
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr * 1.8, rr * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawLogs(row, rowY, bi) {
    for (const log of row.obstacles) {
      const x = log.x;
      const y = rowY + (CELL - log.height) / 2;
      ctx.fillStyle = dcBiome('logDk', bi);
      roundRect(ctx, x, y, log.width, log.height, 8);
      ctx.fill();
      ctx.strokeStyle = darkenHex(dcBiome('logDk', bi), 0.15);
      ctx.lineWidth   = 2;
      const stripes = Math.floor(log.width / 14);
      for (let s = 1; s < stripes; s++) {
        ctx.beginPath();
        ctx.moveTo(x + s * 14, y + 4);
        ctx.lineTo(x + s * 14, y + log.height - 4);
        ctx.stroke();
      }
      ctx.fillStyle = dcBiome('logLt', bi);
      roundRect(ctx, x, y, 12, log.height, 8);
      ctx.fill();
      roundRect(ctx, x + log.width - 12, y, 12, log.height, 8);
      ctx.fill();
    }
  }

  // ── Weather Effects ──────────────────────────────────────

  function drawRain(W, H, isStorm) {
    const intensity = Math.min(weatherRatio * 1.5, 1);
    ctx.save();

    // Rain darkening overlay (stronger for storm)
    const darkAlpha = isStorm ? intensity * 0.28 : intensity * 0.18;
    ctx.fillStyle = `rgba(20,30,60,${darkAlpha})`;
    ctx.fillRect(0, 0, W, H);

    // Rain streaks — storm has steeper angle and thicker drops
    const tilt = isStorm ? 0.45 : 0.2;
    ctx.strokeStyle = nightRatio > 0.5
      ? `rgba(150,180,255,${intensity * 0.55})`
      : `rgba(180,210,255,${intensity * 0.45})`;

    for (const p of rainParticles) {
      const px  = p.x * W;
      const py  = p.y * H;
      const len = p.len * H * (isStorm ? 1.4 : 1);
      ctx.lineWidth = p.width || 1;
      ctx.globalAlpha = p.alpha * intensity;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - len * tilt, py + len);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawFog(W, H) {
    const fogAlpha = Math.min(weatherRatio * 1.2, 1);
    ctx.save();

    // Fog gradient — thicker at bottom
    const isNight = nightRatio > 0.3;
    const fogR = isNight ? 20 : 180;
    const fogG = isNight ? 30 : 190;
    const fogB = isNight ? 60 : 210;

    const fogGrd = ctx.createLinearGradient(0, 0, 0, H);
    fogGrd.addColorStop(0,   `rgba(${fogR},${fogG},${fogB},${fogAlpha * 0.06})`);
    fogGrd.addColorStop(0.4, `rgba(${fogR},${fogG},${fogB},${fogAlpha * 0.15})`);
    fogGrd.addColorStop(0.7, `rgba(${fogR},${fogG},${fogB},${fogAlpha * 0.25})`);
    fogGrd.addColorStop(1,   `rgba(${fogR},${fogG},${fogB},${fogAlpha * 0.35})`);
    ctx.fillStyle = fogGrd;
    ctx.fillRect(0, 0, W, H);

    // Drifting fog wisps — subtle horizontal bands
    const wispCount = 5;
    const time = Date.now() * 0.0003;
    for (let i = 0; i < wispCount; i++) {
      const baseY = H * (0.2 + i * 0.15);
      const drift = Math.sin(time + i * 1.7) * W * 0.08;
      const wispAlpha = fogAlpha * (0.04 + 0.03 * Math.sin(time * 0.7 + i));
      const wispGrd = ctx.createLinearGradient(drift, 0, W * 0.6 + drift, 0);
      wispGrd.addColorStop(0,   `rgba(${fogR},${fogG},${fogB},0)`);
      wispGrd.addColorStop(0.3, `rgba(${fogR},${fogG},${fogB},${wispAlpha})`);
      wispGrd.addColorStop(0.7, `rgba(${fogR},${fogG},${fogB},${wispAlpha})`);
      wispGrd.addColorStop(1,   `rgba(${fogR},${fogG},${fogB},0)`);
      ctx.fillStyle = wispGrd;
      ctx.fillRect(0, baseY - 20, W, 40);
    }

    ctx.restore();
  }

  function drawLightning(W, H) {
    if (lightningFlash <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(220,230,255,${lightningFlash * 0.3})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawWind(W, H) {
    const intensity = Math.min(weatherRatio * 1.5, 1);
    if (intensity < 0.05) return;
    ctx.save();

    const isNight = nightRatio > 0.5;
    ctx.strokeStyle = isNight
      ? `rgba(150,170,200,${intensity * 0.3})`
      : `rgba(200,220,240,${intensity * 0.25})`;
    ctx.lineWidth = 1;

    for (const p of windParticles) {
      const px  = p.x * W;
      const py  = p.y * H;
      const len = p.len * W;
      ctx.globalAlpha = p.alpha * intensity;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + len, py + len * 0.05);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }


  // ── Footprint Trail ──────────────────────────────────────
  function addTrail(x, y, rowType) {
    // Only leave footprints on grass
    if (rowType !== 'grass') return;
    trails.push({ x, y, age: 0, maxAge: TRAIL_MAX_AGE });
  }

  function drawTrails() {
    for (const t of trails) {
      const progress = t.age / t.maxAge;        // 0→1
      const alpha    = (1 - progress) * 0.22;   // fade out
      const size     = CELL * 0.12 * (1 - progress * 0.4);

      ctx.save();
      ctx.globalAlpha = alpha * 0.45;  // extra subtle
      ctx.fillStyle   = '#1a3a0a';

      // Two small ovals — left and right footprint
      ctx.beginPath();
      ctx.ellipse(t.x - CELL * 0.1, t.y + CELL * 0.08, size * 0.5, size * 0.85, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(t.x + CELL * 0.1, t.y - CELL * 0.08, size * 0.5, size * 0.85, -0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // ── Train Row ─────────────────────────────────────────────
  function drawTrainRow(row, y) {
    const W = COLS * World.CELL;
    const CELL = World.CELL;

    // Track bed — dark grey with two rails
    ctx.fillStyle = nightRatio > 0.5 ? '#1a1a22' : '#3a3a3a';
    ctx.fillRect(0, y, W, CELL);

    // Railway sleepers (ties)
    ctx.fillStyle = nightRatio > 0.5 ? '#2a2010' : '#5a4a30';
    for (let sx = 0; sx < W; sx += 20) {
      ctx.fillRect(sx, y + CELL * 0.2, 14, CELL * 0.6);
    }

    // Rails
    ctx.fillStyle = nightRatio > 0.5 ? '#555566' : '#888';
    ctx.fillRect(0, y + CELL * 0.22, W, 4);
    ctx.fillRect(0, y + CELL * 0.72, W, 4);

    // Warning flash — blink red/yellow before train arrives
    if (row.warning) {
      const blink = Math.sin(row.warningTimer * Math.PI * 8) > 0;
      if (blink) {
        ctx.fillStyle = 'rgba(255, 60, 0, 0.35)';
        ctx.fillRect(0, y, W, CELL);
        // Warning triangles on both sides
        ctx.fillStyle = '#FF3D00';
        ctx.font = 'bold ' + Math.round(CELL * 0.55) + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠', CELL * 0.5, y + CELL * 0.5);
        ctx.fillText('⚠', W - CELL * 0.5, y + CELL * 0.5);
      }
    }

    // Draw train wagons
    for (const train of row.obstacles) {
      drawTrain(train, y, row.dir);
    }
  }

  function drawTrain(train, rowY, dir) {
    const CELL   = World.CELL;
    const CARS   = 4;
    const carW   = CELL * 2;
    const carH   = train.height;
    const gap    = CELL * 0.08;
    const totalW = train.width;
    const y      = rowY + (CELL - carH) / 2;

    for (let i = 0; i < CARS; i++) {
      // Draw from front to back based on direction
      const carIdx = dir > 0 ? i : (CARS - 1 - i);
      const cx     = train.x + carIdx * (carW + gap);

      // Wagon body
      const isEngine = (dir > 0 && i === 0) || (dir < 0 && i === CARS - 1);
      ctx.fillStyle = isEngine ? '#B71C1C' : '#C62828';
      roundRect(ctx, cx, y, carW, carH, 5);
      ctx.fill();

      // Dark top stripe
      ctx.fillStyle = '#7f0000';
      ctx.fillRect(cx + 4, y + 3, carW - 8, carH * 0.22);

      // Windows
      ctx.fillStyle = 'rgba(255,220,100,0.75)';
      const ww = carW * 0.18, wh = carH * 0.28;
      const wy = y + carH * 0.38;
      ctx.fillRect(cx + carW * 0.15, wy, ww, wh);
      ctx.fillRect(cx + carW * 0.42, wy, ww, wh);
      ctx.fillRect(cx + carW * 0.68, wy, ww, wh);

      // Engine details
      if (isEngine) {
        // Headlight
        ctx.fillStyle = '#FFEE58';
        const hx = dir > 0 ? cx + carW - 6 : cx + 2;
        ctx.fillRect(hx, y + carH * 0.3, 5, carH * 0.4);
        // Chimney
        ctx.fillStyle = '#333';
        ctx.fillRect(cx + carW * 0.3, y - 6, 8, 8);
      }

      // Coupling between wagons
      if (i < CARS - 1) {
        ctx.fillStyle = '#555';
        ctx.fillRect(cx + carW - 2, y + carH * 0.45, gap + 4, carH * 0.1);
      }
    }
  }

  // ── Death Animation ──────────────────────────────────────
  function drawDeathAnimation(dt) {
    const t = deathTimer / DEATH_DUR;   // 0→1 progress

    // Flash — bright white/orange circle that fades fast
    if (t < 0.35) {
      const flashT = t / 0.35;
      const alpha  = (1 - flashT) * (deathType === 'car' ? 0.85 : 0.65);
      const radius = CELL * (0.4 + flashT * 1.2);
      const color  = deathType === 'car' ? '255,140,0' : '100,200,255';
      const grd = ctx.createRadialGradient(deathX, deathY, 0, deathX, deathY, radius);
      grd.addColorStop(0,   `rgba(255,255,255,${alpha})`);
      grd.addColorStop(0.4, `rgba(${color},${alpha * 0.7})`);
      grd.addColorStop(1,   `rgba(${color},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(deathX, deathY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ring shockwave expanding outward
    if (t < 0.5) {
      const ringT  = t / 0.5;
      const radius = CELL * (0.3 + ringT * 1.8);
      const alpha  = (1 - ringT) * 0.7;
      ctx.strokeStyle = deathType === 'car'
        ? `rgba(255,180,0,${alpha})`
        : `rgba(150,220,255,${alpha})`;
      ctx.lineWidth = 3 * (1 - ringT) + 1;
      ctx.beginPath();
      ctx.arc(deathX, deathY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles — physics simulation
    for (const p of deathParticles) {
      const age   = deathTimer / p.life;
      if (age > 1) continue;
      const alpha = Math.max(0, 1 - age * age);
      const px    = p.x + p.vx * deathTimer;
      const py    = p.y + p.vy * deathTimer + 0.5 * p.gravity * deathTimer * deathTimer;
      const size  = p.size * (1 - age * 0.5);

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(px, py, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Water death: sinking ripples
    if (deathType === 'water' && t < 0.7) {
      const rT = t / 0.7;
      for (let i = 0; i < 3; i++) {
        const delay = i * 0.2;
        const rt    = Math.max(0, (t - delay) / (0.7 - delay));
        if (rt <= 0) continue;
        const r     = CELL * (0.2 + rt * 0.9);
        const a     = (1 - rt) * 0.5;
        ctx.strokeStyle = `rgba(150,220,255,${a})`;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.ellipse(deathX, deathY, r, r * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function addCoinEffect(x, y) {
    coinEffects.push({ x, y, age: 0 });
  }

  function drawCoinEffects(dt) {
    for (let i = coinEffects.length - 1; i >= 0; i--) {
      const e = coinEffects[i];
      e.age += dt;
      if (e.age >= COIN_EFFECT_DUR) { coinEffects.splice(i, 1); continue; }
      const t = e.age / COIN_EFFECT_DUR;
      const alpha = 1 - t;
      const rise  = CELL * 0.9 * t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = '#FFD700';
      ctx.strokeStyle = '#7A5800';
      ctx.lineWidth   = 2;
      ctx.font = `bold ${Math.round(CELL * 0.32)}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('+1', e.x, e.y - rise);
      ctx.fillText  ('+1', e.x, e.y - rise);
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (typeof currentState !== 'undefined' && currentState === GameState.MENU) return;
    if (deathActive && deathTimer > 0.05) return;

    const ps   = Player.getState();
    const x    = ps.visualX;
    const y    = ps.visualY;
    const fd   = ps.facingDir;
    const flip = fd === -1 ? -1 : 1;

    // ── Sprite-based render ───────────────────────────────
    if (playerImg) {
      const WALK_FREQ = 9;
      const walkPhase = walkTime * WALK_FREQ * Math.PI * 2;
      const jumpArc   = ps.jumping
        ? Math.sin(Math.PI * Math.min(ps.jumpTimer / 0.16, 1)) * CELL * 0.18
        : 0;
      const bobY = ps.jumping ? Math.abs(Math.sin(walkPhase)) * CELL * 0.025 : 0;
      const baseY = y - jumpArc;

      const size = CELL * 1.5;

      // Shadow — under feet
      const shadowScale = ps.jumping ? Math.max(0.5, 1 - jumpArc / (CELL * 0.3)) : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y + CELL * 0.2, CELL * 0.28 * shadowScale, CELL * 0.09 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(x, baseY + bobY);
      ctx.scale(flip, 1);
      ctx.drawImage(playerImg, -size / 2, -size * 0.72, size, size);
      ctx.restore();
      return;
    }

    // ── Fallback: procedural render ───────────────────────

    // ── Walk cycle parameters ──────────────────────────────
    // walkPhase drives all limb swings (0→2π per step cycle)
    const WALK_FREQ  = 9;    // cycles per second
    const walkPhase  = walkTime * WALK_FREQ * Math.PI * 2;
    const swing      = ps.jumping ? Math.sin(walkPhase) : 0;      // ±1 limb swing
    const bodyBob    = ps.jumping ? Math.abs(Math.sin(walkPhase)) * CELL * 0.025 : 0;
    const jumpArc    = ps.jumping
      ? Math.sin(Math.PI * Math.min(ps.jumpTimer / 0.16, 1)) * CELL * 0.18
      : 0;  // body lift during jump arc

    const baseY = y - jumpArc;  // whole character lifts during jump

    // ── Shadow (squishes on jump peak) ───────────────────
    const shadowScale = ps.jumping ? Math.max(0.5, 1 - jumpArc / (CELL * 0.3)) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + CELL * 0.3, CELL * 0.28 * shadowScale, CELL * 0.09 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Leg positions with swing ──────────────────────────
    const legW   = CELL * 0.12;
    const legH   = CELL * 0.18;
    const legBaseY = baseY + CELL * 0.08 + bodyBob;
    const legSwing  = swing * CELL * 0.07;  // fore/aft swing

    // When moving sideways — legs swing forward/back (left-right in screen space)
    // When moving forward — legs alternate up/down
    const isMovingLR = (fd === -1 || fd === 1);

    // Left leg
    const lLegX = x - CELL * 0.2 - legW / 2;
    const lLegY = isMovingLR ? legBaseY - Math.max(0, swing) * CELL * 0.06
                             : legBaseY + legSwing;
    // Right leg
    const rLegX = x + CELL * 0.08;
    const rLegY = isMovingLR ? legBaseY + Math.max(0, -swing) * CELL * 0.06
                             : legBaseY - legSwing;

    ctx.fillStyle = '#BDBDBD';  // light grey pants
    roundRect(ctx, lLegX, lLegY, legW, legH, 3); ctx.fill();
    roundRect(ctx, rLegX, rLegY, legW, legH, 3); ctx.fill();

    // ── Shoes ─────────────────────────────────────────────
    ctx.fillStyle = '#212121';
    const shoeW = CELL * 0.14, shoeH = CELL * 0.08;
    roundRect(ctx, lLegX - shoeW * 0.1, lLegY + legH - 2, shoeW, shoeH, 3); ctx.fill();
    roundRect(ctx, rLegX - shoeW * 0.1, rLegY + legH - 2, shoeW, shoeH, 3); ctx.fill();

    // ── Body / jacket — white hoodie ──────────────────────
    const bodyW = CELL * 0.46, bodyH = CELL * 0.32;
    const bodyX = x - bodyW / 2;
    const bodyY = baseY - CELL * 0.28 + bodyBob;
    ctx.fillStyle = '#9E9E9E';
    roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 6); ctx.fill();
    // Subtle hoodie shading
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    roundRect(ctx, bodyX, bodyY + bodyH * 0.6, bodyW, bodyH * 0.4, 6); ctx.fill();

    // Base logo — blue rounded square on chest
    const logoS = CELL * 0.17;
    const logoX = x - logoS / 2;
    const logoY = bodyY + bodyH * 0.28;
    ctx.fillStyle = '#0052FF';
    roundRect(ctx, logoX, logoY, logoS, logoS, Math.round(logoS * 0.22));
    ctx.fill();

    // ── Arms with swing ───────────────────────────────────
    const armW  = CELL * 0.1;
    const armH  = CELL * 0.24;
    const armSwing = swing * CELL * 0.08;

    ctx.fillStyle = '#BDBDBD';  // darker grey arms
    // Left arm swings opposite to right leg
    const lArmY = bodyY + 4 - armSwing;
    const rArmY = bodyY + 4 + armSwing;
    roundRect(ctx, bodyX - armW + 2, lArmY, armW, armH, 4); ctx.fill();
    roundRect(ctx, bodyX + bodyW - 2, rArmY, armW, armH, 4); ctx.fill();

    // ── Hands ─────────────────────────────────────────────
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.ellipse(bodyX - armW / 2 + 2, lArmY + armH + 2, CELL * 0.07, CELL * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bodyX + bodyW + armW / 2 - 2, rArmY + armH + 2, CELL * 0.07, CELL * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Neck ──────────────────────────────────────────────
    ctx.fillStyle = '#FFCC80';
    ctx.fillRect(x - CELL * 0.07, bodyY - CELL * 0.07, CELL * 0.14, CELL * 0.1);

    // ── Head with slight tilt on walk ─────────────────────
    const headR  = CELL * 0.2;
    const headTilt = swing * 0.06;   // subtle head rock
    const headY  = bodyY - headR - CELL * 0.04;
    ctx.save();
    ctx.translate(x, headY);
    ctx.rotate(headTilt);
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.ellipse(0, 0, headR, headR * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#4E342E';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.1, headR * 1.05, headR * 1.08, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-headR * 1.0, -headR * 0.5, headR * 0.22, headR * 0.9);
    ctx.fillRect(headR * 0.78, -headR * 0.5, headR * 0.22, headR * 0.9);
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.ellipse(0, headR * 0.15, headR * 0.78, headR * 0.62, 0, 0, Math.PI);
    ctx.fill();

    // Eyes
    const eyeY2   = headR * 0.05;
    const eyeOffX = CELL * 0.07;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-eyeOffX * flip, eyeY2, CELL * 0.055, CELL * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    if (fd !== 0) {
      ctx.beginPath();
      ctx.ellipse(eyeOffX * 0.2 * flip, eyeY2, CELL * 0.04, CELL * 0.055, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(eyeOffX, eyeY2, CELL * 0.055, CELL * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1A237E';
    ctx.beginPath();
    ctx.ellipse(-eyeOffX * flip + CELL * 0.015 * flip, eyeY2, CELL * 0.03, CELL * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    if (fd === 0) {
      ctx.beginPath();
      ctx.ellipse(eyeOffX + CELL * 0.015, eyeY2, CELL * 0.03, CELL * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mouth
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(-CELL * 0.01 * flip, eyeY2 + CELL * 0.1, CELL * 0.055, 0.1, Math.PI - 0.1);
    ctx.stroke();

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function stopDeath() { deathActive = false; deathTimer = 0; deathParticles = []; }
  function resetWeather() { _lastWeatherScore = -1; weatherState = 0; weatherRatio = 0; lightningFlash = 0; lightningTimer = 4; }
  // Debug: force a specific weather state (0=clear,1=rain,2=fog,3=storm,4=windy)
  function _dbgWeather(state) { weatherState = state; weatherRatio = 0; if (state===3) { rainInitDone=false; initRain(STORM_RAIN_COUNT); } else if (state===1) { rainInitDone=false; initRain(RAIN_COUNT); } }
  let _dbgNightForce = null;
  function _dbgNight(on) { _dbgNightForce = on; nightTarget = on ? 1 : 0; _nightOn = on; }
  return { init, resize, updateCamera, draw, setScore, setWeather, triggerDeath, isDying, deathDone, stopDeath, resetWeather, addTrail, addCoinEffect, _dbgWeather, _dbgNight };

})();


/* ===== ui.js ===== */
/**
 * ui.js — Система пользовательского интерфейса
 *
 * Управляет переключением экранов и обновлением HUD.
 * Все экраны — HTML div с классом .screen.
 * Активный экран видим, остальные скрыты классом .hidden.
 */

const UI = (() => {

  // Все экраны игры
  const SCREENS = {
    menu:     document.getElementById('screen-menu'),
    gameover: document.getElementById('screen-gameover'),
    lb:       document.getElementById('screen-lb'),
    ci:       document.getElementById('screen-ci'),
    shop:     document.getElementById('screen-shop'),
  };

  const hud       = document.getElementById('hud');
  const scoreVal  = document.getElementById('score-val');
  const bestVal   = document.getElementById('best-val');

  // ===== Показать нужный экран =====
  function show(name) {
    if (name !== 'ci') _stopCiTimer();
    Object.values(SCREENS).forEach(s => { if (s) s.classList.add('hidden'); });
    if (hud) hud.classList.add('hidden');

    const hint = document.getElementById('swipe-hint');
    if (hint) hint.classList.add('hidden');

    if (name === 'game') {
      if (hud) hud.classList.remove('hidden');
      // Показать хинт свайпа — автоматически скрывается через 3 сек (CSS анимация)
      if (hint) {
        hint.classList.remove('hidden');
        // Перезапустить анимацию
        hint.style.animation = 'none';
        hint.offsetHeight;   // reflow
        hint.style.animation = '';
      }
    } else if (SCREENS[name]) {
      SCREENS[name].classList.remove('hidden');
    }
  }

  // ===== Обновить счётчик очков в HUD =====
  const scoreBox  = document.getElementById('score-combined');
  const bestBox   = document.getElementById('best-box');
  const badge     = document.getElementById('new-record-badge');
  let   _lastBest = 0;
  let   _badgeTimer = null;

  function updateScore(score) {
    if (scoreVal) scoreVal.textContent = score;

    // Check if we just beat the record in real time
    const currentBest = Save.getBest();
    if (score > 0 && score > currentBest && score > _lastBest) {
      _lastBest = score;
      _flashRecord(score);
    }
  }

  function _flashRecord(score) {
    // New record sound
    if (typeof Sound !== 'undefined') Sound.newRecord();
    // Pulse the score box
    if (scoreBox) {
      scoreBox.classList.remove('record-beat');
      void scoreBox.offsetWidth;  // reflow to restart animation
      scoreBox.classList.add('record-beat');
      scoreBox.addEventListener('animationend', () => {
        scoreBox.classList.remove('record-beat');
      }, { once: true });
    }

    // Show NEW BEST badge on best box
    if (badge) {
      badge.classList.add('visible');
      if (_badgeTimer) clearTimeout(_badgeTimer);
      _badgeTimer = setTimeout(() => badge.classList.remove('visible'), 1800);
    }
  }

  // ===== Обновить рекорд в HUD =====
  function updateBest(best) {
    if (bestVal) bestVal.textContent = best;
    _lastBest = best;
    // Hide badge when game resets
    if (badge) badge.classList.remove('visible');
  }

  // ===== Показать экран Game Over =====
  function showGameOver(score, best) {
    const goScore = document.getElementById('go-score');
    const goBest  = document.getElementById('go-best');
    if (goScore) goScore.textContent = score;
    if (goBest)  goBest.textContent  = best;

    // Submit Score button: show only if score > on-chain best
    const submitBtn = document.getElementById('btn-submit-score');
    if (submitBtn) {
      const lb = window.__BASE_LEADERBOARD;
      const onChainBest = lb ? lb.myBest : 0;
      if (score > onChainBest) {
        submitBtn.style.display = '';
        submitBtn.textContent = '⛓ Submit Score';
        submitBtn.disabled = false;
        submitBtn._score = score;
      } else {
        submitBtn.style.display = 'none';
      }
    }

    // Claim Coins button: show if coins were collected this run
    const claimBtn = document.getElementById('btn-claim-coins');
    const coinsEarnedEl = document.getElementById('go-coins-earned');
    if (claimBtn) {
      if (_sessionCoins > 0) {
        claimBtn.style.display = '';
        claimBtn.disabled = false;
        claimBtn._amount = _sessionCoins;
        if (coinsEarnedEl) coinsEarnedEl.textContent = _sessionCoins;
      } else {
        claimBtn.style.display = 'none';
      }
    }

    show('gameover');
  }

  // ===== Check-in screen =====

  let _ciTimerInterval = null;

  // Rewards per day (day 1-7 in a streak cycle)
  const COIN_IMG_HTML = '<img src="/game/coin.png" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;position:relative;top:-1px;">';
  const DAY_REWARDS = [
    { coins: 5,  icon: COIN_IMG_HTML },
    { coins: 5,  icon: COIN_IMG_HTML },
    { coins: 5,  icon: COIN_IMG_HTML },
    { coins: 10, icon: '💰' },
    { coins: 10, icon: '💰' },
    { coins: 20, icon: '💎' },
    { coins: 30, icon: '👑' },
  ];

  function _msUntilUTCMidnight() {
    const now = new Date();
    const midnight = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    return midnight.getTime() - now.getTime();
  }

  function _formatCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
  }

  function _stopCiTimer() {
    if (_ciTimerInterval) { clearInterval(_ciTimerInterval); _ciTimerInterval = null; }
  }

  function _renderDays(streak, available) {
    const grid = document.getElementById('ci-days-grid');
    if (!grid) return;

    // Which slot in the 7-day cycle are we on?
    // After claim today: streak % 7 (1-7 → slot 1-7)
    // If available: next slot = (streak % 7) + 1 (today's slot, not yet claimed)
    const claimedCount = available ? streak : streak;          // days already done
    const todaySlot    = available ? (streak % 7) + 1 : ((streak - 1) % 7) + 1;

    grid.innerHTML = DAY_REWARDS.map((day, i) => {
      const dayNum    = i + 1;
      const isClaimed = dayNum <= (available ? claimedCount : claimedCount) &&
                        !(available && dayNum === todaySlot);
      const isToday   = dayNum === todaySlot;
      const isFuture  = !isClaimed && !isToday;

      // Recalculate: claimed = days we've ALREADY done this cycle
      // If available=true: streak days claimed, today not yet
      // If available=false: streak days claimed including today
      const doneDays  = available ? (streak % 7) : (((streak - 1) % 7) + 1);
      const isDone    = dayNum <= doneDays && !(available && dayNum > doneDays);

      let cls = 'ci-day';
      if (dayNum <= doneDays && !available) cls += ' claimed';
      else if (dayNum < todaySlot && available) cls += ' claimed';
      if (isToday) cls += ' today';

      const checkMark = (cls.includes('claimed')) ? '<span class="ci-check">✓</span>' : '';
      const opacity   = isFuture && !isToday ? 'opacity:0.45;' : '';

      return `<div class="${cls}" style="${opacity}">
        ${checkMark}
        <div class="ci-day-icon">${day.icon}</div>
        <div class="ci-day-coins">+${day.coins}</div>
        <div class="ci-day-label">Day ${dayNum}</div>
      </div>`;
    }).join('');
  }

  function showCheckIn() {
    const state    = CheckIn.getState();
    const streak   = state.streak;
    const available = state.available;
    const isPending = state.isPending || false;

    // Today's reward based on day in cycle
    const daySlot   = ((streak % 7)) + (available ? 1 : 0);
    const slotIdx   = available ? (streak % 7) : ((streak - 1) % 7);
    const todayReward = DAY_REWARDS[Math.max(0, Math.min(6, slotIdx))];

    const ciStreak = document.getElementById('ci-streak');
    if (ciStreak) ciStreak.textContent = streak;
    _renderDays(streak, available);

    const statusEl = document.getElementById('ci-status-text');
    const claimBtn = document.getElementById('btn-do-ci');
    _stopCiTimer();

    if (isPending) {
      // Transaction in progress
      if (statusEl) {
        statusEl.className = 'ci-status';
        statusEl.innerHTML = '⏳ Confirming on-chain...';
      }
      if (claimBtn) {
        claimBtn.disabled      = true;
        claimBtn.style.opacity = '0.5';
        claimBtn.textContent   = '⏳ Confirming...';
      }
    } else if (available) {
      if (statusEl) {
        statusEl.className = 'ci-status';
        statusEl.innerHTML = `✅ Claim <strong>+${todayReward.coins} coins</strong> today!`;
      }
      if (claimBtn) {
        claimBtn.disabled      = false;
        claimBtn.style.opacity = '1';
        claimBtn.innerHTML     = `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle;">${todayReward.icon} Claim +${todayReward.coins}</span>`;
      }
    } else {
      if (statusEl) statusEl.className = 'ci-status unavail';
      if (claimBtn) {
        claimBtn.disabled      = true;
        claimBtn.style.opacity = '0.35';
        claimBtn.textContent   = '✓ Claimed today';
      }

      // Live countdown
      const tick = () => {
        const ms = _msUntilUTCMidnight();
        if (statusEl) statusEl.innerHTML = `<span class="ci-countdown">${_formatCountdown(ms)}</span><br><span style="font-size:0.72rem;color:#666;letter-spacing:1px">UNTIL NEXT CHECK-IN</span>`;
        if (ms <= 1000) { _stopCiTimer(); showCheckIn(); }
      };
      tick();
      _ciTimerInterval = setInterval(tick, 1000);
    }

    show('ci');
  }

  // ===== Показать Leaderboard =====
  function showLeaderboard() {
    Leaderboard.render();
    show('lb');
  }

  // ===== Обновить баланс монет (HUD + меню + магазин) =====
  const coinCountEl     = document.getElementById('coin-count');
  const menuCoinCountEl = document.getElementById('menu-coin-count');
  function updateCoins(total) {
    if (coinCountEl)     coinCountEl.textContent     = total;
    if (menuCoinCountEl) menuCoinCountEl.textContent = total;
    const shopEl = document.getElementById('shop-coin-count');
    if (shopEl) shopEl.textContent = total;
  }

  return { show, updateScore, updateBest, showGameOver, showCheckIn, showLeaderboard, updateCoins };

})();


/* ===== shop.js ===== */
const Shop = (() => {
  // Каталог предметов магазина
  const ITEMS = [
    { id: 'skin_default',    name: 'Builder',    price: 0,   icon: '👷', desc: 'Default character',     owned: true  },
    { id: 'skin_astronaut',  name: 'Astronaut',  price: 150, icon: '🧑‍🚀', desc: 'Out of this world!',    owned: false },
    { id: 'skin_ninja',      name: 'Ninja',      price: 200, icon: '🥷', desc: 'Silent and swift',       owned: false },
    { id: 'skin_robot',      name: 'Robot',      price: 300, icon: '🤖', desc: 'Fully automated',        owned: false },
    { id: 'skin_wizard',     name: 'Wizard',     price: 500, icon: '🧙', desc: 'Pure magic',             owned: false },
  ];

  const SAVE_KEY = 'shop_v1';

  function loadShopData() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { return {}; }
  }
  function saveShopData(d) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch {}
  }
  function getOwned() {
    const d = loadShopData();
    return d.owned || ['skin_default'];
  }
  function getEquipped() {
    return loadShopData().equipped || 'skin_default';
  }
  function own(id) {
    const d = loadShopData();
    const owned = d.owned || ['skin_default'];
    if (!owned.includes(id)) owned.push(id);
    d.owned = owned;
    saveShopData(d);
  }
  function equip(id) {
    const d = loadShopData();
    d.equipped = id;
    saveShopData(d);
  }

  function render() {
    const container = document.getElementById('shop-items');
    const coinEl    = document.getElementById('shop-coin-count');
    if (!container) return;
    const balance = Save.getCoins();
    if (coinEl) coinEl.textContent = balance;

    const owned    = getOwned();
    const equipped = getEquipped();

    container.innerHTML = '';
    for (const item of ITEMS) {
      const isOwned    = owned.includes(item.id);
      const isEquipped = equipped === item.id;
      const canAfford  = balance >= item.price;

      const el = document.createElement('div');
      el.className = 'shop-item' + (isEquipped ? ' shop-item-equipped' : '');
      el.innerHTML = `
        <span class="shop-icon">${item.icon}</span>
        <div class="shop-info">
          <span class="shop-name">${item.name}</span>
          <span class="shop-desc">${item.desc}</span>
        </div>
        <div class="shop-action">
          ${isEquipped
            ? '<span class="shop-badge-on">✓ ON</span>'
            : isOwned
              ? `<button class="shop-btn shop-btn-equip" data-id="${item.id}">Equip</button>`
              : `<button class="shop-btn shop-btn-buy${canAfford ? '' : ' disabled'}" data-id="${item.id}" data-price="${item.price}" style="display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;"><img src="/game/coin.png" style="width:14px;height:14px;object-fit:contain;display:block;flex-shrink:0;"> ${item.price}</button>`
          }
        </div>`;
      container.appendChild(el);
    }

    // Button handlers
    container.querySelectorAll('.shop-btn-equip').forEach(btn => {
      btn.addEventListener('click', () => { equip(btn.dataset.id); render(); });
    });
    container.querySelectorAll('.shop-btn-buy').forEach(btn => {
      if (btn.classList.contains('disabled')) return;
      btn.addEventListener('click', () => {
        const price = parseInt(btn.dataset.price);
        const cur   = Save.getCoins();
        if (cur < price) return;
        // Spend coins
        const d = Save.load();
        d.coins -= price;
        Save.save(d);
        own(btn.dataset.id);
        equip(btn.dataset.id);
        if (typeof UI !== 'undefined') {
          UI.updateCoins(Save.getCoins());
        }
        render();
      });
    });
  }

  function show() {
    render();
    if (typeof UI !== 'undefined') UI.show('shop');
  }

  return { show, getEquipped };
})();

/* ===== main.js ===== */
/**
 * main.js — Главный файл игры
 *
 * Game Loop + обработка ввода:
 *   - Свайпы (мобильные): вверх/вниз/влево/вправо
 *   - Клавиатура (десктоп): WASD / стрелки
 *   - Тап на канвас = шаг вперёд (обратная совместимость)
 */

// ===== ВИБРАЦИЯ =====
const Vibrate = {
  tap:   () => navigator.vibrate && navigator.vibrate(18),   // лёгкий прыжок
  log:   () => navigator.vibrate && navigator.vibrate(35),   // бревно
  coin:  () => navigator.vibrate && navigator.vibrate(25),   // монета
  death: () => navigator.vibrate && navigator.vibrate([60, 40, 80]),  // смерть: удар-пауза-удар
  water: () => navigator.vibrate && navigator.vibrate([30, 20, 30, 20, 40]), // тонет
};

// ===== СОСТОЯНИЕ ИГРЫ =====
const GameState = {
  MENU:     'menu',
  PLAYING:  'playing',
  GAMEOVER: 'gameover',
};

let currentState    = GameState.MENU;
let lastTime        = 0;
let deathTriggered  = false;  // tracks if death anim was started this game

// ===== ФОНОВАЯ АНИМАЦИЯ МЕНЮ =====
function initMenuBackground() {
  Renderer.init();
  World.init();
  // Position camera at a mid row so traffic is visible
  Player.init();  // needed so camera has a position to follow
  // Override player row to put camera in the middle of traffic
  Player.getState().row    = 6;
  Player.getState().visualY = World.rowToY(6) + World.CELL / 2;
  Player.getState().alive  = false;  // player invisible in menu

  lastTime = performance.now();
  requestAnimationFrame(menuLoop);
}

// Menu background loop — only updates world + renders, no player logic
function menuLoop(timestamp) {
  if (currentState !== GameState.MENU) return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  // Slowly scroll camera forward
  const ps = Player.getState();
  ps.row     += dt * 0.6;   // drift forward at 0.6 rows/sec
  ps.visualY  = World.rowToY(ps.row) + World.CELL / 2;
  World.extendWorld(Math.floor(ps.row));
  World.update(dt);

  Renderer.updateCamera(dt);
  Renderer.draw();

  requestAnimationFrame(menuLoop);
}

// ===== ИНИЦИАЛИЗАЦИЯ ИГРЫ =====
let _sessionCoins = 0;

function initGame() {
  _sessionCoins = 0;
  Renderer.init();
  World.init();
  Player.init();
  Input.reset();
  deathTriggered = false;
  Renderer.stopDeath();
  if (typeof Sound !== 'undefined') Sound.init();

  currentState = GameState.PLAYING;
  UI.show('game');
  UI.updateBest(Save.getBest());
  UI.updateCoins(Save.getCoins());

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ===== ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ =====
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (currentState === GameState.PLAYING) {
    World.update(dt);
    Player.update(dt);
    World.extendWorld(Player.getState().row);
    World.setScore(Player.getScore());   // обновляем сложность каждый кадр
    Renderer.setScore(Player.getScore());   // день/ночь
    Renderer.setWeather(Player.getScore());  // погода
    Collision.check();
    UI.updateScore(Player.getScore());

    if (!Player.isAlive()) {
      // Trigger animation exactly once
      if (!deathTriggered) {
        deathTriggered = true;
        const ps = Player.getState();
        const row = World.getRow(ps.row);
        const type = row && row.type === 'water' ? 'water' : 'car';
        Renderer.triggerDeath(ps.visualX, ps.visualY, type);
        // Вибрация при смерти
        if (type === 'water') Vibrate.water();
        else                  Vibrate.death();
        if (row && row.type === 'train') navigator.vibrate && navigator.vibrate([80, 30, 120]);
        // Death sounds
        if (typeof Sound !== 'undefined') {
          if (type === 'water') Sound.splash();
          else                  Sound.death();
        }
      }
      // Wait for animation to finish, then show game over
      if (Renderer.deathDone()) {
        Renderer.stopDeath();
        onGameOver();
        return;
      }
    }
  }

  Renderer.updateCamera(dt);
  Renderer.draw();
  requestAnimationFrame(gameLoop);
}

// ===== КОНЕЦ ИГРЫ =====
function onGameOver() {
  currentState = GameState.GAMEOVER;
  const score = Player.getScore();
  const best  = Save.addScore(score);
  // Синхронизируем монеты с глобальным лидербордом
  const syncFn = window.__BASE_SYNC_COINS;
  if (syncFn) syncFn(Save.getCoins());
  setTimeout(() => UI.showGameOver(score, best), 600);
}

// ===================================================
// ===== INPUT — Свайпы и клавиатура =====
// ===================================================
const Input = (() => {

  // Минимальная длина свайпа в пикселях
  const SWIPE_MIN = 25;
  // Кэш canvas-элемента для быстрой проверки в touch-обработчиках
  let _cachedCanvas = null;
  function _isCanvas(target) {
    if (!_cachedCanvas) _cachedCanvas = document.getElementById('gameCanvas');
    return target === _cachedCanvas;
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved  = false;   // был ли это свайп или просто тап

  function reset() {
    touchStartX = 0;
    touchStartY = 0;
    touchMoved  = false;
  }

  // Определить направление свайпа и вызвать нужный метод
  function handleSwipe(dx, dy) {
    if (currentState !== GameState.PLAYING) return;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Определяем основное направление (горизонталь или вертикаль)
    if (absDx > absDy) {
      // Горизонтальный свайп
      if (dx > 0) Player.moveRight();
      else        Player.moveLeft();
    } else {
      // Вертикальный свайп
      if (dy < 0) Player.moveForward();   // свайп вверх = вперёд
      else        Player.moveBackward();  // свайп вниз  = назад
    }
  }

  // ===== Touch events =====
  document.addEventListener('touchstart', (e) => {
    if (!_isCanvas(e.target)) return;
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoved  = false;
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!_isCanvas(e.target)) return;
    e.preventDefault();

    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    // Если двинулись достаточно — считаем свайпом
    if (!touchMoved && (Math.abs(dx) > SWIPE_MIN || Math.abs(dy) > SWIPE_MIN)) {
      touchMoved = true;
      handleSwipe(dx, dy);
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (!_isCanvas(e.target)) return;
    e.preventDefault();

    // Если не было свайпа → это тап → шаг вперёд
    if (!touchMoved) {
      if (currentState === GameState.PLAYING) Player.moveForward();
    }
    touchMoved = false;
  }, { passive: false });

  // ===== Mouse click (десктоп: тап = вперёд) =====
  document.addEventListener('mousedown', (e) => {
    if (_isCanvas(e.target)) {
      if (currentState === GameState.PLAYING) Player.moveForward();
    }
  });

  // ===== Клавиатура =====
  document.addEventListener('keydown', (e) => {
    if (currentState !== GameState.PLAYING) return;

    switch (e.code) {
      case 'ArrowUp':    case 'KeyW': e.preventDefault(); Player.moveForward();  break;
      case 'ArrowDown':  case 'KeyS': e.preventDefault(); Player.moveBackward(); break;
      case 'ArrowLeft':  case 'KeyA': e.preventDefault(); Player.moveLeft();     break;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); Player.moveRight();    break;
    }
  });

  return { reset };

})();

// ===== Ресайз окна =====
window.addEventListener('resize', () => Renderer.resize());

// ===== БЕЗОПАСНАЯ ПРИВЯЗКА СОБЫТИЙ =====
function _bind(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function _initUI() {
  // Кнопки меню
  _bind('btn-start', 'click', () => initGame());
  _bind('btn-lb',    'click', () => UI.showLeaderboard());
  _bind('btn-ci',    'click', () => UI.showCheckIn());
  _bind('btn-shop',  'click', () => Shop.show());
  _bind('btn-shop-back', 'click', () => UI.show('menu'));

  // Кнопка звука
  _bind('btn-mute', 'click', () => Sound.toggleMute());

  // Кнопки game over
  _bind('btn-restart', 'click', () => initGame());
  _bind('btn-go-menu', 'click', () => {
    currentState = GameState.MENU;
    UI.show('menu');
  });
  _bind('btn-submit-score', 'click', () => {
    const btn = document.getElementById('btn-submit-score');
    if (!btn || btn.disabled) return;
    const score = btn._score;
    if (!score) return;
    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';
    window.dispatchEvent(new CustomEvent('base-submit-score', { detail: { score } }));
  });

  // Listen for score submission confirmation
  window.addEventListener('base-score-submitted', () => {
    const btn = document.getElementById('btn-submit-score');
    if (btn) {
      btn.textContent = '✅ Submitted!';
      btn.disabled = true;
    }
  });

  // Claim Coins button
  _bind('btn-claim-coins', 'click', () => {
    const btn = document.getElementById('btn-claim-coins');
    if (!btn || btn.disabled) return;
    const amount = btn._amount;
    if (!amount) return;
    btn.disabled = true;
    btn.innerHTML = '⏳ Claiming...';
    window.dispatchEvent(new CustomEvent('base-claim-coins', { detail: { amount } }));
  });

  // Coin claim confirmed
  window.addEventListener('base-coins-claimed', () => {
    const btn = document.getElementById('btn-claim-coins');
    if (btn) {
      btn.innerHTML = '✅ Claimed!';
      btn.disabled = true;
    }
    // Синхронизируем лидерборд монет
    const syncFn = window.__BASE_SYNC_COINS;
    if (syncFn) syncFn(Save.getCoins());
  });

  // Refresh leaderboard when new data loads
  window.addEventListener('base-leaderboard-loaded', () => {
    const lbScreen = document.getElementById('screen-lb');
    if (lbScreen && !lbScreen.classList.contains('hidden')) {
      Leaderboard.render();
    }
  });

  // Кнопки leaderboard
  _bind('btn-lb-back',     'click', () => UI.show('menu'));
  _bind('btn-lb-personal', 'click', () => Leaderboard.setMode('personal'));
  _bind('btn-lb-global',   'click', () => Leaderboard.setMode('global'));
  _bind('btn-lb-coins',    'click', () => Leaderboard.setMode('coins'));

  // Кнопки check-in
  _bind('btn-do-ci', 'click', () => {
    const result = CheckIn.perform();
    if (result.success) {
      if (result.pending) {
        // On-chain: show confirming state, wait for event
        UI.showCheckIn();
      } else {
        // localStorage fallback
        alert(`🎉 Check-in! ${result.message}\nStreak: ${result.streak} days 🔥`);
        UI.showCheckIn();
      }
    } else {
      alert(`⏳ ${result.message}`);
    }
  });

  // Listen for on-chain check-in confirmation from React
  window.addEventListener('base-checkin-confirmed', () => {
    // Начислить монеты за on-chain чекин
    const DAY_COINS = [5, 5, 5, 10, 10, 20, 30];
    const ci = Save.getCheckin();
    const newStreak = ci.streak + 1;
    const daySlot = (newStreak - 1) % 7;
    const reward = DAY_COINS[daySlot];
    const today = new Date().toISOString().slice(0, 10);
    Save.saveCheckin({ lastDate: today, streak: newStreak, total: (ci.total || 0) + 1 });
    const newTotal = Save.addCoins(reward);
    UI.updateCoins(newTotal);
    UI.showCheckIn();
  });
  _bind('btn-ci-back', 'click', () => UI.show('menu'));

  // Старт
  UI.show('menu');
  initMenuBackground();
}

// ===== СТАРТ — ждём готовности DOM =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { _initUI(); UI.updateCoins(Save.getCoins()); });
} else {
  _initUI();
  UI.updateCoins(Save.getCoins());
}

