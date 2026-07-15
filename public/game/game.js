/* ===== save.js ===== */
/**
 * save.js — Система сохранений (Local Storage)
 * Хранит: рекорды, данные check-in, монеты.
 * Все данные сохраняются в браузере пользователя.
 */

function _imgHtml(src, className = '', alt = '', attrs = '') {
  const cls = className ? ` class="${className}"` : '';
  const safeAlt = String(alt).replace(/"/g, '&quot;');
  return `<img src="${src}"${cls} alt="${safeAlt}"${attrs}>`;
}

function _uiIconHtml(name, className = '', alt = '') {
  const cls = `${className ? className + ' ' : ''}ui-icon`;
  return _imgHtml(`/game/ui-icons/${name}.png`, cls, alt, ' aria-hidden="true"');
}

const BOOSTER_ICON_SRCS = Object.freeze({
  boost_magnet: '/game/boosters/coin_magnet.png',
  boost_double: '/game/boosters/double_coins.png',
  boost_shield: '/game/boosters/second_chance.png',
});

function _boosterIconHtml(className = '', alt = 'booster', id = 'boost_magnet') {
  return _imgHtml(BOOSTER_ICON_SRCS[id] || BOOSTER_ICON_SRCS.boost_magnet, className, alt, ' aria-hidden="true"');
}

function _checkinDayIconHtml(day) {
  const safeDay = Math.min(7, Math.max(1, Math.floor(Number(day) || 1)));
  return _imgHtml(`/game/ui-icons/checkin/day-${safeDay}.png`, 'ci-reward-icon-img ci-checkin-day-icon', `day ${safeDay}`, ' aria-hidden="true"');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

  // In-memory cache — avoids localStorage + JSON.parse on every call
  // (addCoins runs per coin pickup, several times per frame with magnet+double)
  let _cache = null;
  let _flushTimer = null;

  // Загрузить данные из localStorage
  function load() {
    if (_cache) return _cache;
    try {
      const raw = localStorage.getItem(KEY);
      _cache = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) {
      _cache = defaults();
    }
    return _cache;
  }

  // Сохранить данные (запись в localStorage батчится, ~1 раз в секунду)
  function save(data) {
    _cache = data;
    if (_flushTimer) return;
    _flushTimer = setTimeout(_flush, 800);
  }

  function _flush() {
    _flushTimer = null;
    if (!_cache) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(_cache));
    } catch (e) {
      console.warn('Не удалось сохранить данные:', e);
    }
  }

  // Не терять несохранённый батч при уходе со страницы/сворачивании
  window.addEventListener('pagehide', _flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flush();
  });

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


const BOOSTER_IDS = ['boost_magnet', 'boost_double', 'boost_shield'];

const REWARD_CONTAINERS_LOCAL = Object.freeze({
  gear_crate: { coins: 50, fragments: 5, boosters: 3 },
  focus_chest: { fragments: 6 },
  rare_crate: { coins: 40, fragments: 8, boosters: 1 },
  epic_crate: { coins: 80, fragments: 12, boosters: 2 },
  legendary_crate: { coins: 150, fragments: 18, boosters: 3 },
  legendary_focus_bundle: { fragments: 20 },
});

const CHECKIN_REWARD_CYCLE = [
  { coins: 20, icon: () => _checkinDayIconHtml(1) },
  { coins: 15, boosters: 1, icon: () => _checkinDayIconHtml(2) },
  { fragments: 2, icon: () => _checkinDayIconHtml(3) },
  { coins: 35, boosters: 1, icon: () => _checkinDayIconHtml(4) },
  { coins: 20, fragments: 3, icon: () => _checkinDayIconHtml(5) },
  { coins: 50, xp: 75, icon: () => _checkinDayIconHtml(6) },
  { container: 'gear_crate', icon: () => _checkinDayIconHtml(7) },
];

const DAILY_FRAGMENT_CHEST_COST = 90;
const DAILY_FRAGMENT_CHEST_FRAGMENTS = 3;
const DAILY_FRAGMENT_CHEST_LIMIT = 1;
const DAILY_FRAGMENT_CHEST_LOCAL_KEY = 'daily_fragment_chest_v1';


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

    const daySlot = (newStreak - 1) % 7;
    const reward  = RewardEconomy.getCheckInReward(daySlot);

    const newCheckin = {
      lastDate: today,
      streak:   newStreak,
      total:    newTotal,
    };

    Save.saveCheckin(newCheckin);
    const applied = RewardEconomy.applyBundleLocal(reward, 'checkin');

    return {
      success: true,
      streak:  newStreak,
      total:   newTotal,
      coins:   applied.coins || 0,
      reward,
      message: `${applied.label}!`,
    };
  }

  // Получить текущее состояние для отображения UI
  function getState() {
    // On-chain state
    if (_hasOnChain()) {
      const oc = window.__BASE_CHECKIN;
      const nextStreak = oc.isAvailable ? oc.streak + 1 : oc.streak;
      const reward = RewardEconomy.getCheckInReward((Math.max(0, nextStreak - 1)) % 7);
      return {
        streak:    oc.streak,
        total:     oc.total,
        available: oc.isAvailable,
        isPending: oc.isPending,
        reward:    RewardEconomy.label(reward),
        rewardBundle: reward,
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
        const nextStreak = available ? ci.streak + 1 : ci.streak;
        return RewardEconomy.label(RewardEconomy.getCheckInReward((Math.max(0, nextStreak - 1)) % 7));
      })(),
      rewardBundle: (() => {
        const nextStreak = available ? ci.streak + 1 : ci.streak;
        return RewardEconomy.getCheckInReward((Math.max(0, nextStreak - 1)) % 7);
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

  const DEFAULT_AVATAR_SRC = '/game/ui-icons/default-avatar.png';
  const MEDALS = [
    _uiIconHtml('medal-gold', 'lb-medal-img', 'gold medal'),
    _uiIconHtml('medal-silver', 'lb-medal-img', 'silver medal'),
    _uiIconHtml('medal-bronze', 'lb-medal-img', 'bronze medal'),
  ];
  let mode = 'personal'; // 'personal' | 'global' | 'coins'

  function avatarHtml(entry) {
    const hasAvatar = Boolean(entry && entry.avatar);
    const src = hasAvatar ? _escapeHtml(entry.avatar) : DEFAULT_AVATAR_SRC;
    const fallback = hasAvatar ? ` onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_SRC}';"` : '';
    return `<img class="lb-avatar${hasAvatar ? '' : ' lb-avatar-default'}" src="${src}" alt="" aria-hidden="true"${fallback}>`;
  }

  function setMode(m) {
    mode = m;
    const btnP = document.getElementById('btn-lb-personal');
    const btnG = document.getElementById('btn-lb-global');
    const btnC = document.getElementById('btn-lb-coins');
    if (btnP) btnP.className = 'lb-tab' + (m === 'personal' ? ' lb-tab-active' : '');
    if (btnG) btnG.className = 'lb-tab' + (m === 'global'   ? ' lb-tab-active' : '');
    if (btnC) btnC.className = 'lb-tab' + (m === 'coins'    ? ' lb-tab-active' : '');
    if (m === 'coins') {
      renderCoins();
      const fetchFn = window.__BASE_FETCH_COIN_LB;
      if (fetchFn) fetchFn();
    } else if (m === 'global') {
      const fetchFn = window.__BASE_FETCH_SCORE_LB;
      if (fetchFn) fetchFn('alltime');
      render();
    } else {
      render();
    }
  }

  function renderPersonal() {
    const container = document.getElementById('lb-list');
    if (!container) return;
    const scores = Save.getScores();
    if (scores.length === 0) {
      container.innerHTML = `<p class="lb-empty">${_uiIconHtml('gamepad', 'lb-empty-icon', 'gamepad')}No scores yet.<br>Play to set a record!</p>`;
      return;
    }
    container.innerHTML = scores.map((score, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const medal = MEDALS[i] || `${i + 1}`;
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
      const medal = MEDALS[i] || `${i + 1}`;
      return `<div class="lb-row ${rankClass}">
        <span class="lb-rank">${medal}</span>
        ${avatarHtml(entry)}
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
      const medal = MEDALS[i] || `${i + 1}`;
      return `<div class="lb-row ${rankClass}">
        <span class="lb-rank">${medal}</span>
        ${avatarHtml(entry)}
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
  let muted   = false;
  let sfxVol  = 0.8; // 0.0 – 1.0

  // Load preferences
  function init() {
    muted  = localStorage.getItem('baserunner_muted') === 'true';
    const saved = parseFloat(localStorage.getItem('baserunner_sfxvol'));
    if (!isNaN(saved)) sfxVol = Math.max(0, Math.min(1, saved));
    updateMuteBtn();
  }

  function getVolume()  { return sfxVol; }
  function setVolume(v) {
    sfxVol = Math.max(0, Math.min(1, v));
    localStorage.setItem('baserunner_sfxvol', sfxVol);
    // Auto-unmute if volume raised from 0
    if (sfxVol > 0 && muted) { muted = false; updateMuteBtn(); }
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
    if (btn) {
      btn.innerHTML = _uiIconHtml('sound', 'settings-row-icon-img', 'sound');
      btn.classList.toggle('is-muted', muted);
      btn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    }
  }

  // ── Sound primitives ─────────────────────────────────

  function playTone({ freq = 440, type = 'sine', duration = 0.1,
                      vol = 0.3, attack = 0.005, decay = 0.05,
                      freqEnd = null, detune = 0 } = {}) {
    if (muted || sfxVol <= 0) return;
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

      const v = vol * sfxVol;
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(v, c.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration + 0.01);
    } catch(e) {}
  }

  function playNoise({ duration = 0.1, vol = 0.2, attack = 0.002,
                       lowFreq = 200, highFreq = 800 } = {}) {
    if (muted || sfxVol <= 0) return;
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

      const nv = vol * sfxVol;
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(nv, c.currentTime + attack);
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

  // Distant thunder — low rumble after the flash
  function thunder() {
    playNoise({ duration: 1.2, vol: 0.4, attack: 0.15, lowFreq: 30, highFreq: 120 });
    playTone({ freq: 55, freqEnd: 35, type: 'sine', duration: 1.0, vol: 0.22, attack: 0.1 });
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

  return { init, toggleMute, isMuted, getVolume, setVolume,
           jump, step, log, death, splash, trainHorn, thunder, newRecord, coin };
})();


/* ===== music.js ===== */
const Music = (() => {
  const TRACKS  = ['/game/music.mp3', '/game/music2.mp3'];
  let _audio    = null;
  let _ctx      = null;   // AudioContext — for iOS volume control
  let _gain     = null;   // GainNode    — audio.volume ignored on iOS
  let _vol      = 0.5;
  let _enabled  = true;
  let _trackIdx = -1;

  function _load() {
    const saved = parseFloat(localStorage.getItem('baserunner_musicvol'));
    if (!isNaN(saved)) _vol = Math.max(0, Math.min(1, saved));
    // Restore the on/off state from the persisted volume. Without this, _enabled
    // defaults to true every reload, so a player who turned music off (vol 0)
    // gets it re-armed on the next visit.
    _enabled = _vol > 0;
  }

  function _next() {
    let idx;
    do { idx = Math.floor(Math.random() * TRACKS.length); } while (idx === _trackIdx && TRACKS.length > 1);
    _trackIdx = idx;
    return TRACKS[_trackIdx];
  }

  // Connect audio element → GainNode → speakers (call once, after user gesture)
  function _initWebAudio() {
    if (_ctx || !_audio) return;
    try {
      _ctx  = new (window.AudioContext || window.webkitAudioContext)();
      _gain = _ctx.createGain();
      _gain.gain.value = _vol;
      _gain.connect(_ctx.destination);
      const src = _ctx.createMediaElementSource(_audio);
      src.connect(_gain);
    } catch (e) {
      _ctx = _gain = null; // fallback to audio.volume
    }
  }

  function init() {
    if (_audio) return; // идемпотентно: не пересоздаём элемент (иначе старый трек играет параллельно)
    _load();
    _audio = new Audio();
    _audio.crossOrigin = 'anonymous'; // required for createMediaElementSource
    _audio.volume = _vol;             // fallback on non-iOS
    _audio.loop   = false;
    _audio.addEventListener('ended', () => {
      _audio.src = _next();
      if (_enabled) _audio.play().catch(() => {});
    });
  }

  function play() {
    if (!_audio) init();
    if (!_enabled || _vol <= 0) return; // music is off — don't start or resume the context
    if (_audio.paused) {
      if (!_audio.src || _audio.src === window.location.href) _audio.src = _next();
      // Init Web Audio on first real play (needs user gesture — always true here)
      _initWebAudio();
      if (_ctx && _ctx.state === 'suspended') _ctx.resume();
      _audio.play().catch(() => {});
    }
  }

  function pause() {
    if (_audio && !_audio.paused) _audio.pause();
  }

  function getVolume() { return _vol; }

  function setVolume(v) {
    _vol = Math.max(0, Math.min(1, v));
    localStorage.setItem('baserunner_musicvol', _vol);
    // GainNode works on iOS; audio.volume is ignored by iOS but kept as fallback
    if (_gain) _gain.gain.value = _vol;
    else if (_audio) _audio.volume = _vol;
    _enabled = _vol > 0;
    if (_enabled) play(); else pause();
  }

  function isEnabled() { return _enabled; }

  return { init, play, pause, getVolume, setVolume, isEnabled };
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
    { w: CELL * 1.75, h: CELL * 0.72, sprite: 'blue_hatchback',  weight: 4  },
    { w: CELL * 1.60, h: CELL * 0.72, sprite: 'black_suv',       weight: 3  },
    { w: CELL * 1.65, h: CELL * 0.72, sprite: 'silver_minivan',  weight: 3  },
    { w: CELL * 1.80, h: CELL * 0.72, sprite: 'orange_pickup',   weight: 3  },
    { w: CELL * 1.90, h: CELL * 0.72, sprite: 'white_panel_van', weight: 3  },
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
  let recentTypes  = [];  // row-type history for pattern diversity
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

  /** Стадия сложности по счёту — основа для секционных бюджетов. */
  function getDifficultyStage(score) {
    if (score < 40) return 'onboarding';
    if (score < 100) return 'baseline';
    if (score < 150) return 'transition';
    if (score < 300) return 'skill';
    return 'mastery';
  }

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
      // rush = скорость ×1.4 с капом 150 px/s; дистанции обычные
      const rushSpeedBase = Math.min(carSpeedBase * 1.4, 150);
      return {
        carCount,
        carDistMin,
        carDistMax,
        logCount:     weightedPick([5, 6, 7], [30, 50, 20]),
        carSpeedBase: rushSpeedBase,
        carSpeedVar:  10,
        logSpeedBase,
        logSpeedVar,
        isFast: true,
        archetype: 'rush_road',
      };
    }

    // ── Кол-во брёвен: больше коротких на высоком score ──
    const logCount = weightedPick(
      [5, 6, 7],
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
      rows.push(_stampInitSection(makeGrassRow(i)));
    }

    // 3 стартовых ряда — трава (безопасная зона)
    for (let i = 0; i < 3; i++) {
      rows.push(_stampInitSection(makeGrassRow(i)));
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

    // Simple (onboarding/baseline, score < 100): 2–3 опасных ряда + grass
    simple: [
      ['road',  'road',  'grass'],                          // S1
      ['road',  'water', 'grass'],                          // S2
      ['water', 'road',  'grass'],                          // S3
      ['road',  'road',  'water', 'grass'],                 // S4
    ],

    // Medium (transition, score 100–150; также relief-передышка): 3–4 опасных ряда + grass
    medium: [
      ['road',  'road',  'road',  'grass'],                 // M1
      ['road',  'water', 'road',  'grass'],                 // M2
      ['water', 'road',  'road',  'grass'],                 // M3
      ['road',  'water', 'water', 'grass'],                 // M4
      ['road',  'road',  'water', 'road',  'grass'],        // M5
    ],

    // Hard (skill/mastery, score >= 150): 4–5 опасных рядов + grass
    hard: [
      ['road',  'road',  'road',  'water', 'grass'],        // H1
      ['water', 'road',  'water', 'road',  'grass'],        // H2
      ['road',  'water', 'road',  'water', 'grass'],        // H3
      ['road',  'road',  'road',  'road',  'grass'],        // H4
      ['road',  'water', 'road',  'road',  'grass'],        // H5
    ],
  };

  const RARE_CHANCE = 0.0;    // rare-паттерны убраны — используем hard при score>150

  // ── Секционные бюджеты ───────────────────────────────────────────────────
  // danger и complexity — независимые оси. Бюджет опасности тратят поезда и
  // сирена; бюджет сложности зарезервирован под будущие фичи маршрутов.
  const SECTION_BUDGETS = {
    onboarding: { danger: [3, 4], complexity: [0, 1] },
    baseline: { danger: [4, 6], complexity: [1, 2] },
    transition: { danger: [6, 8], complexity: [2, 3] },
    skill: { danger: [8, 11], complexity: [3, 5] },
    mastery: { danger: [10, 13], complexity: [4, 6] },
  };

  const ROW_DANGER_COST = {
    grass: 0,
    road: 1,
    dense_slow_road: 2,
    fast_sparse_road: 2,
    rush_road: 3,
    train: 4,
    water: 1,
    short_log_river: 2,
    river_chain: 3,
  };

  // Верхняя граница доп. монет risk-маршрута на секцию (по стадии).
  // Паттерны сейчас заканчиваются одним grass-рядом, поэтому фактически
  // добавляется ~1 монета на секцию; значения 2/3 — future-guard на случай
  // секций с несколькими grass-рядами, а не действующая эскалация.
  const REWARD_ROUTE_CAP = {
    transition: 1,
    skill: 2,
    mastery: 3,
  };

  let patternBuffer = [];
  let streakRoad    = 0;
  let streakWater   = 0;
  let streakGrass   = 0;
  let streakDanger  = 0;        // road+water подряд (не сбрасывается при смене типа)
  let lastType      = 'grass';  // тип последнего выданного ряда

  let activeSection     = null; // секция, чьи ряды сейчас в patternBuffer
  let rowSectionId      = 0;
  let highSectionStreak = 0;    // подряд идущие hard-секции

  function randFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Собрать дескриптор секции по текущей стадии сложности
  function buildSection(score) {
    const stage = getDifficultyStage(score);
    let pool = stage === 'onboarding' ? PATTERNS.simple
      : stage === 'baseline' ? PATTERNS.simple
      : stage === 'transition' ? PATTERNS.medium
      : PATTERNS.hard;
    const features = [];

    // Не более двух hard-секций подряд — затем секция-передышка
    if (pool === PATTERNS.hard && highSectionStreak >= 2) {
      pool = PATTERNS.medium;
      features.push('relief');
      highSectionStreak = 0;
    } else {
      highSectionStreak = pool === PATTERNS.hard ? highSectionStreak + 1 : 0;
    }

    const rows = [...randFrom(pool)];

    // Секция-передышка остаётся чистой: без веток и обязательств
    const isRelief = features.includes('relief');
    if (!isRelief && (stage === 'transition' || stage === 'skill' || stage === 'mastery') && Math.random() < 0.45) {
      features.push('survival_branch');
    }
    if (!isRelief && stage === 'mastery' && Math.random() < 0.35) {
      features.push('commitment_2_4');
    }
    // Опциональный risk-маршрут: доп. монеты в боковых колонках. Не единственный
    // осмысленный выбор — только шанс поверх обычной генерации, не в передышке.
    if (!isRelief && shouldAddRewardRoute(stage)) {
      features.push('reward_route');
    }

    const budget = SECTION_BUDGETS[stage];
    return {
      id: rowSectionId++,
      stage,
      rows,
      dangerBudget: budget.danger[1],
      complexityBudget: budget.complexity[1],
      features,
      rewardRouteCap: REWARD_ROUTE_CAP[stage] || 0,
      rewardCoinsAdded: 0,
    };
  }

  // Шанс risk-маршрута по стадии (нет на onboarding/baseline)
  function shouldAddRewardRoute(stage) {
    if (stage === 'transition') return Math.random() < 0.15;
    if (stage === 'skill')      return Math.random() < 0.28;
    if (stage === 'mastery')    return Math.random() < 0.35;
    return false;
  }

  // Проверка safety limits
  function isSafe(type) {
    if (type === 'road'  && streakRoad  >= 4) return false;
    if (type === 'water' && streakWater >= 3) return false;
    if (type === 'grass' && streakGrass >= 1) return false;
    return true;
  }

  function updateStreaks(type) {
    streakRoad   = type === 'road'  ? streakRoad  + 1 : 0;
    streakWater  = type === 'water' ? streakWater + 1 : 0;
    streakGrass  = type === 'grass' ? streakGrass + 1 : 0;
    streakDanger = type === 'road' || type === 'water' ? streakDanger + 1 : 0;
    lastType     = type;
  }

  // Заполнить буфер рядами одной секции
  function fillBuffer() {
    activeSection = buildSection(currentScore);
    const pattern = activeSection.rows;
    for (let i = 0; i < pattern.length; i++) {
      let type = pattern[i];

      // Если предыдущий ряд — grass, следующий паттерн не начинается с grass
      if (i === 0 && lastType === 'grass' && type === 'grass') {
        type = 'road';
      }

      // Пол передышки: после 5 опасных рядов подряд принудительный grass.
      // Future-guard: текущие паттерны заканчиваются на grass и дают максимум
      // 4 опасных ряда подряд — сработает только на более длинных/смешанных
      // паттернах (например road,water,road,water,road на стыке секций).
      if (streakDanger >= 5 && type !== 'grass') {
        type = 'grass';
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
    patternBuffer     = [];
    streakRoad        = 0;
    streakWater       = 0;
    streakGrass       = 0;
    streakDanger      = 0;
    lastType          = 'grass';
    activeSection     = null;
    rowSectionId      = 0;
    highSectionStreak = 0;
  }

  // Стартовые ряды создаются вне секций — штампуем единообразную форму,
  // чтобы потребители метаданных не проверяли undefined
  function _stampInitSection(row) {
    row.sectionId       = null;
    row.sectionStage    = 'onboarding';
    row.sectionFeatures = [];
    return row;
  }

  // Создать ряд нужного типа
  function makeSmartRow(rowIdx) {
    const type = nextRowType();
    let row;
    if (type === 'grass') { row = makeGrassRow(rowIdx); }
    else if (type === 'road') {
      // Поезд: только если score >= 20, давно не было поезда,
      // секция не передышка и в бюджете опасности хватает на поезд (4)
      const inRelief = activeSection && activeSection.features.includes('relief');
      const trainAllowedByBudget = !activeSection || activeSection.dangerBudget >= ROW_DANGER_COST.train;
      const trainChance = currentScore >= 20 && trainAllowedByBudget && !inRelief ? 0.04 : 0;
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
    // Каждый ряд списывает свою стоимость с бюджета опасности секции
    if (activeSection) activeSection.dangerBudget -= ROW_DANGER_COST[row.type] || 0;
    // Stamp biome info
    const bi = getBiomeForRow(rowIdx);
    row.biome     = bi.biome;
    row.nextBiome = bi.nextBiome;
    row.blendT    = bi.blendT;
    // Топология маршрутов: метаданные секции для будущих фич и телеметрии
    row.sectionId       = activeSection ? activeSection.id : null;
    row.sectionStage    = activeSection ? activeSection.stage : getDifficultyStage(currentScore);
    row.sectionFeatures = activeSection ? [...activeSection.features] : [];
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
    const BIOME_DECO = {
      default: ['bush', 'bush', 'bush', 'tree', 'tree', 'rock', 'rock', 'shrub', 'stump', 'rock_pile'],
      desert: ['cactus', 'cactus', 'tumbleweed', 'rock'],
      snow: ['pine', 'pine', 'snowman', 'rock'],
    };
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

    // Risk-маршрут: до rewardRouteCap доп. монет на секцию в боковых колонках.
    // Опционально и ограниченно — не единственный осмысленный путь.
    if (activeSection && activeSection.features.includes('reward_route')
        && activeSection.rewardCoinsAdded < activeSection.rewardRouteCap
        && coinsList.length < 2) {
      const sideCols = [1, 2, COLS - 3, COLS - 2].filter(col => !coinOccupied.has(col));
      if (sideCols.length) {
        const col = sideCols[Math.floor(rng(123) * sideCols.length)];
        coinOccupied.add(col);
        coinsList.push({ col, collected: false, riskRoute: true });
        activeSection.rewardCoinsAdded += 1;
      }
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

    // Промежутки масштабируются: 1–2 клетки → 1–1 клетка
    const gapMin = 1;
    const gapMax = Math.round(_lerp(2, 1, p));

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

    // Гарантируем minimum 5 брёвен И заполняем всю ширину поля
    while (filled < WORLD_W || logsBuilt < 5) {
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
        // Re-arm the warning ~1.2s before every train pass (spawnTimer advances in px)
        const next = row.spawnQueue[0];
        if (next) {
          const spd = Math.abs(row.speed);
          const timeToSpawn = (next.gap - row.spawnTimer) / spd;
          if (timeToSpawn > 1.6) {
            row.hornArmed = false; // far away again — allow the next warning
          } else if (!row.hornArmed && timeToSpawn <= 1.2 && timeToSpawn > 0) {
            row.warning      = true;
            row.warningTimer = 0;
            row.hornArmed    = true;
            // Horn only for rows near the player (score ≈ max row reached)
            if (Math.abs(row.idx - currentScore) <= 14 && typeof Sound !== 'undefined') {
              Sound.trainHorn();
            }
          }
        }
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
      // Pick a random visible road row — пропускаем ряды, где бюджет
      // опасности уже зарезервирован прошлыми сиренами
      const roadRows = rows.filter(r => r.type === 'road' && !r.sirenLocked
        && (!r.sectionDangerReserved || r.sectionDangerReserved <= 2));
      if (roadRows.length === 0) return;
      sirenRow = roadRows[Math.floor(Math.random() * roadRows.length)];
      sirenRow.sirenLocked = true;
      sirenRow.sectionDangerReserved = (sirenRow.sectionDangerReserved || 0) + 3;
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
        // Lane clear — spawn siren car (2x lane speed, capped at 330 px/s)
        const sirenAbs = Math.min(Math.abs(lane.speed) * 2.0, 330);
        const speed = sirenAbs * lane.dir;
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
    if (sirenRow && rows.includes(sirenRow)) {
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
        // Re-queue: зазор соответствует типу ряда
        const rp = smoothProgress(currentScore, 0, 250);
        let requeueDist;
        if (row.type === 'water') {
          // Реки: те же 1–2 клетки, что и в makeWaterRow — иначе ряд редеет вдвое
          const gapMax = Math.round(_lerp(2, 1, rp));
          requeueDist = (1 + Math.random() * Math.max(0, gapMax - 1)) * CELL;
        } else if (row.type === 'train') {
          // Поезда: пауза 3.5–6 с между проходами (gap в px = скорость × секунды)
          requeueDist = spd * (3.5 + Math.random() * 2.5);
        } else {
          // Дороги: 2–5 клеток, плотнее с ростом сложности
          const reqMin = _lerp(3, 2, rp);
          const reqMax = _lerp(5, 3, rp);
          requeueDist = (reqMin + Math.random() * (reqMax - reqMin)) * CELL;
        }
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

  return { init, update, extendWorld, setScore, getRow, getRows, rowToY, getBiomeForRow, collectCoin, getDifficultyStage, CELL, COLS };

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
  let _bufferedMove = null; // tap during jump animation — applied on landing

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
    _bufferedMove  = null;
    resetShield();
  }

  // ===== Движение в направлении (dRow, dCol) =====
  // dRow: +1 = вперёд, -1 = назад
  // dCol: +1 = вправо, -1 = влево
  function move(dRow, dCol) {
    if (!state.alive)  return false;
    if (state.jumping) {
      _bufferedMove = { dRow, dCol }; // запомним тап — применим в момент приземления
      return false;
    }

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
    const _isNewRow = state.row > state.maxRow;
    if (_isNewRow) {
      state.maxRow = state.row;
      state.score  = state.row - 1;
    }

    // --- Сбор монеты (+ магнит: радиус 2 клетки с анимацией) ---
    const hasMagnet   = (typeof Loadout !== 'undefined' && Loadout.isActive('boost_magnet'));
    const magnetRange = hasMagnet ? 2 : 0;
    const coinValue   = (typeof Loadout !== 'undefined' && Loadout.isActive('boost_double')) ? 2 : 1;
    const playerX = state.col * CELL + CELL / 2;
    const playerY = World.rowToY(state.row) + CELL / 2;

    // --- Score "+1" popup on new row ---
    if (_isNewRow && typeof Renderer !== 'undefined') {
      Renderer.addScoreEffect(playerX, playerY);
    }
    for (let dc = -magnetRange; dc <= magnetRange; dc++) {
      const checkCol = state.col + dc;
      if (checkCol < 0 || checkCol >= COLS) continue;
      if (World.collectCoin(state.row, checkCol)) {
        const newTotal = Save.addCoins(coinValue);
        _sessionCoins += coinValue;
        if (typeof Vibrate !== 'undefined') Vibrate.coin();
        if (typeof UI !== 'undefined') UI.updateCoins(newTotal, _sessionCoins);
        if (coinValue > 1 && typeof UI !== 'undefined' && UI.triggerRunBoosterFeedback) {
          UI.triggerRunBoosterFeedback('boost_double');
        }
        if (dc === 0) {
          if (typeof Renderer !== 'undefined') Renderer.addCoinEffect(playerX, playerY, coinValue);
        } else {
          const coinX = checkCol * CELL + CELL / 2;
          const coinY = World.rowToY(state.row) + CELL / 2;
          if (typeof UI !== 'undefined' && UI.triggerRunBoosterFeedback) UI.triggerRunBoosterFeedback('boost_magnet');
          if (typeof Renderer !== 'undefined') Renderer.addMagnetCoin(coinX, coinY, playerX, playerY, checkCol, state.row, coinValue);
        }
      }
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
    // Буфер ввода применяется на тик ПОСЛЕ приземления, а не в момент него:
    // кадр приземления должен пройти через Collision.check() (он пропускается,
    // пока jumping=true) — иначе цепочка прыжков проходит сквозь машины и воду
    if (!state.jumping && _bufferedMove) {
      const m = _bufferedMove;
      _bufferedMove = null;
      move(m.dRow, m.dCol);
    }
    // Уменьшаем таймер инвиза
    if (_invincibleTimer > 0) _invincibleTimer = Math.max(0, _invincibleTimer - dt);

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
        if (typeof Renderer !== 'undefined' && Renderer.addLandingEffect) {
          Renderer.addLandingEffect(state.visualX, state.visualY, state.row);
        }
      }
    }

    // --- Движение вместе с бревном ---
    if (state.onLog && !state.jumping) {
      state.visualX += state.onLog.speed * dt;
      state.col = Math.round((state.visualX - CELL / 2) / CELL);

      // Уплыл за края → тонем (инвиз не спасает)
      if (state.visualX < -CELL * 0.5 || state.visualX > COLS * CELL + CELL * 0.5) {
        kill('water');
      }
    }

    // --- Магнит: подбираем монеты в радиусе даже без шага ---
    if (!state.jumping && typeof Loadout !== 'undefined' && Loadout.isActive('boost_magnet')) {
      const coinValue = Loadout.isActive('boost_double') ? 2 : 1;
      const playerX = state.col * CELL + CELL / 2;
      const playerY = World.rowToY(state.row) + CELL / 2;
      for (let dc = -2; dc <= 2; dc++) {
        if (dc === 0) continue; // direct pickup handled in move()
        const checkCol = state.col + dc;
        if (checkCol < 0 || checkCol >= COLS) continue;
        if (World.collectCoin(state.row, checkCol)) {
          const newTotal = Save.addCoins(coinValue);
          _sessionCoins += coinValue;
          if (typeof Vibrate !== 'undefined') Vibrate.coin();
          if (typeof UI !== 'undefined') UI.updateCoins(newTotal, _sessionCoins);
          const coinX = checkCol * CELL + CELL / 2;
          const coinY = World.rowToY(state.row) + CELL / 2;
          if (typeof UI !== 'undefined' && UI.triggerRunBoosterFeedback) {
            UI.triggerRunBoosterFeedback('boost_magnet');
            if (coinValue > 1) UI.triggerRunBoosterFeedback('boost_double');
          }
          if (typeof Renderer !== 'undefined') Renderer.addMagnetCoin(coinX, coinY, playerX, playerY, checkCol, state.row, coinValue);
        }
      }
    }
  }

  // ===== Убить игрока =====
  let _shieldUsed      = false;
  let _invincibleTimer = 0;
  const INVINCIBLE_DUR = 3.0; // секунды инвиза

  function resetShield() {
    _shieldUsed      = false;
    _invincibleTimer = 0;
  }
  function isInvincible() { return _invincibleTimer > 0; }

  // Оживить игрока после Continue — даём краткий инвиз чтобы не умер сразу
  function revive() {
    // Water/train rows are lethal even with invincibility (water ignores it,
    // trains cross too fast) — relocate to the nearest grass row behind the player.
    const cur = World.getRow(state.row);
    if (!cur || cur.type === 'water' || cur.type === 'train') {
      let grassRow = null, roadRow = null;
      for (let r = state.row; r >= state.row - 15 && r >= 0; r--) {
        const cand = World.getRow(r);
        if (!cand) continue;
        if (cand.type === 'grass') { grassRow = r; break; }
        if (roadRow === null && cand.type === 'road') roadRow = r;
      }
      const safeIdx = grassRow !== null ? grassRow : (roadRow !== null ? roadRow : state.row);
      const safe    = World.getRow(safeIdx);
      state.row = safeIdx;

      // Clamp col back onto the field, then step sideways off blocked cells
      let col = Math.min(COLS - 1, Math.max(0, state.col));
      for (let off = 0; off < COLS; off++) {
        const free = [col + off, col - off].find(
          c => c >= 0 && c < COLS && !Collision.isCellBlocked(safe, c)
        );
        if (free !== undefined) { col = free; break; }
      }
      state.col = col;

      state.visualX  = state.col * CELL + CELL / 2;
      state.visualY  = World.rowToY(state.row) + CELL / 2;
      state.jumpFrom = { x: state.visualX, y: state.visualY };
      state.jumpTo   = { x: state.visualX, y: state.visualY };
    }

    state.alive      = true;
    state.jumping    = false;
    state.onLog      = null;
    _shieldUsed      = false;
    _invincibleTimer = 2.5;  // 2.5s invincibility so player isn't immediately killed
  }

  // type: 'car' | 'water' — вода и падение всегда убивают
  function kill(type) {
    if (!state.alive) return;
    // Инвиз от предыдущего срабатывания щита — только от машин
    if (type !== 'water' && _invincibleTimer > 0) return;
    // Second Chance — даёт инвиз 3 сек, только от машин
    if (type !== 'water' && !_shieldUsed && typeof Loadout !== 'undefined' && Loadout.isActive('boost_shield')
        && typeof Shop !== 'undefined' && Shop.spendBoosterLocal('boost_shield')) {
      _shieldUsed      = true;
      _invincibleTimer = INVINCIBLE_DUR;
      if (typeof Vibrate !== 'undefined') Vibrate.coin();
      if (typeof UI !== 'undefined') {
        if (UI.triggerRunBoosterFeedback) UI.triggerRunBoosterFeedback('boost_shield', 'Saved');
        if (UI.markRunBoosterUsed) UI.markRunBoosterUsed('boost_shield');
      }
      if (typeof Renderer !== 'undefined') {
        Renderer.addShieldBurst(state.visualX, state.visualY);
        Renderer.triggerShake(4, 0.16);
      }
      return; // saved — активирован инвиз
    }
    state.alive   = false;
    state.onLog   = null;
    state.jumping = false;
    _bufferedMove = null;
  }

  // ===== Вспомогательные =====
  function lerp(a, b, t) { return a + (b - a) * t; }

  function getState()     { return state; }
  function isAlive()      { return state.alive; }
  function getScore()     { return state.score; }
  function setOnLog(log)  { state.onLog = log; }

  return {
    init, update, kill, revive,
    jump, move,
    moveForward, moveBackward, moveLeft, moveRight,
    getState, isAlive, getScore, setOnLog, isInvincible,
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
    // Инвиз — машины не убивают
    if (Player.isInvincible()) return;

    for (const car of row.obstacles) {
      if (overlapsX(ps.visualX, PLAYER_RADIUS, car.x, car.width)) {
        Player.kill('car');
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
      // Нет бревна под игроком — тонем (инвиз не спасает)
      Player.setOnLog(null);
      Player.kill('water');
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
  yellow_taxi: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAAAuCAYAAADXyhwkAAAhtklEQVR4nL2cd5xlVZXvv2vvc26qXNWB7gY6QIMgIEgQVEAF4ZlGYAR0zMyAY0KZEREDCI5iYlAHBBPq6DA+YfQxjkpQQRxFJUkOEhq66VTdVbfiDefsvd4fe597bzXNqJ/P+7zNp/pWnXvC3iv+1m/tg/CnhwH8mWeeufTLl3/5rjzLw1ELCODjT++Q+KMAuHK5bEcXDb5904bxG4v7/RnP/X89EiDvq6Yf9yb5WGNeM1TScqWcrXvi5pEXvOCFgzMzfo8cnIIhgzzPd7i6eyxJEiDRgWois82mW716rzsfeOCB4oI/e33Jn/jegOqSJSOv/Y9rr3n1AQc8b9nc7CwK2NQixoAK6hzeORRFjGCsQdSAwsT2CbaOb6aSVlN2rq7/X6MNMNfI8lpZ+PS7d5XB6jST80Ppiw495tubxrP9jcheqkrvDwAKkoOKABYU8iwcnJzJsMbMVavNFcDUXzqpHRVgCLbb8/3Hs0aj+da5RvvEww87InNOEu9yVEw0cDDGYETChNXjvcc7j7UJT5bW+a3bNpnR0YHRxYv33NXaAetc7sKVDQCqVWg0widUwzeNBsU5jXhqtVqlGk7qXFP8FMegEc8r7h5Gs9FOKlWX/+amx0bSRPjbU5ws2m2Sxng/X/juzF+PLl7BYYccTKvdwrucPMtAoihUMcaQ2DQcEkPuchJr9Z4/3C3j2zZpZbC6av/9V2wfHh6Wvr7dtl533XW93qA8y5CeT2sNeXim4LyiGjQyNjb41cmp2dPyPFUxJlEUvMb7SpioSIg6qqDd78SAeoe1tgWiYnOMKrlXvC+BSnE5xha/G7xXXO67VhjWjbWCNQYVQb3Duybeh3NEQEyCsZUYAX3P8lTEqLYbeZJKktz34+XsteuTbNq8Cwe9btptmWlKX3/F5O2wbu/DtcXTRUDiWkXBqyICLs/xODXWtn3ufVouyaGHrz3y9//9h9sBcqfRkDvKWBABgj6NaFhE8lVwK6MExRgRr6qo7PfcvUaXX/P53XVmdqPMNQGxSBRyj4zChFXxKMYIiTEYsajLqLeWcdfESczkffTJJg5e9ANKMoViSFODMaZ7H+dxzuN9VwhJyWCwbNvcYHgkpVVZya0bXkvmywgeSFnR/zAHLvoJqhleuwahAok1GPW0/Bif++o0pxwHbzphhvsfGeSS7yr/9pONfOWDqxkdrNNoC0YWmq4JWgghSUFEEBuMqZWByT2l0hDnfrl+x5PjE+OAPeCA57znoYcefSTPfaHUBTkwOf/88+V3v7tlzeannnzxQXvw5qqdqpSrQ3z3+i1sm5jj4KFh+sWzT62f2+6akyOerxx68HbI/EL/UaJXSDcJFxpxCn0lRRKev/U2Gq6fmp1g2eAWSOd65tRzoQckzlPjAwyQJ9TXG4ZHPdRy9n3OnSBVrAGlxGjpMQYHNoF6OtqTnklaL+QlTnrXdg4/YBfKuxiePzrByl8Momo46tAWK5fXyXJDmmiYm4Y1qXoUDV4b5xXsU1FVtWoR45nPBg5eP1Gh2jfID342f1G7rY+At0NDtX+fmpq/q1cJyYUXXOAVDq9V0m/99JLd810WVd3DG5Zw54OemVbCO0aHWDOQm21jY/L68+/ks2eu4B/WVJnZPkeahDygakGUJHWgPiZnRURwTinVBvnalSNyyx1z7LHmEdQLgiDJ3mAMqor3Su78Ape3xmARwOC8R70ndzkPPLCev3ml4chDEq689kHSkmBF8AqZE9r5/pgQD0PiLEI5hiQBI1WSvkl+8qtJNr+3wq6LR7n/0XkO2qef8mCOVBy+KWia4NV0vFy9x8eQ2bE8KcIt4gxAi799s/NYryQl7rkvO2l8YpCh0WWkiTT++NjTE/V6fWNHAYiQJgma27zZnNfv31BOTj33Nt63di0vWjbGLrUWbrDEXLWEUMU5ZW6zY3pmgCQNgp6enicpKct3TTDigjWKDe7vcpLU8otbG1xzk/KJr56HJlUSH3KDGkUxcXG9Dq8kxiJxtaqKJCnNqXF++o13st+eNY584VpKB74Xk/ZhCAAg8Z40alAkhJFCWIqgeMS1MfYsbn9oM/c/0s9vvzfI+9/kSM0YJp2hNbOYia05ambJfRORBO+UEEFC4FU8xoAV6ShCRRGEzb5lnFOcf4qPvil1ydgRuvYV3/annvLOD99x54OvU9X9TDA8SUTsA3911OLRt7+cZMlwSx0VQKnkTYxxsPvufOG2J3i69Bi3fmcP9lixiaZZwes/tImZuVkSsVx63gr2W7yNbC4hTYXmTJv6TINFS0qIhdntM1zyjwO89eTlvPuTFzLTbLFkyRAf+fRFuKREBxRJFzAUghfCIlUVm1ZoD7Upl1P6qxYrOSuXl/HlASwep0GpiGAkAACDUCpVmBzfyic++GGmp+aopsL3/3kFa5aMkGDY9Xk5V14xxCcve4RaJUVR5uY8V31+NUe8uE59y3RI7qajSwTTAR7dzxg9NSRyp0JzvGlvf+BJjnn3S/joOX/P6af/zepFi0bv3223FZc99dSGryTe+336SxkH7zlDrWLFMAB4vIENAv9y71McefwA737hLC94/iY+/5WE625z7HXMO8GWwDs++rWrYG6eJE1ptJTjXzjEh95mmZxpYUuGatWxbGmd4cE2Xz6zhpAzXk/5/McuYHou7yAdiVYrERZ570Msj4E8LaWIyWm15mlmNTZsmOTjn/gk2ARrTecaCQEbxZPYBI+wZMBzyTuVsaEWOYv52rceY2a+TmJLNDJLMnY4x7ztjTQbDRRPX63MZT/+BT+8aZZ/OmsIpY5NLaaIjyGIhtoHyPOYH2LeC/nCkC5J2NfP8vdHzXLswRUm7OJ0+/bJfbZvry8OGQ3vnUdazgpiEJsC4JISj7bm+eWTT3Pa2tW8/PgJcIP86m7Pz2/dwGVnHk651k+etdiy6Wnqk1MkqQVS7qvX+eQ37ybLU/baPeGYF8xQqeYMDM7xqmNbYJWZepk7H97G9Gw7WAxgjYRCTkKJ7fKQRyPKJLFKmhpetnYpLzoAylLniDVbEDzWGlJrOpaYO4d3iohBPaxaAqec2sdDt5f47vV1NuqhzKUJqh6s49D9D+OYVx1PY34exTM8PMRZp91INj7BJ8/ehcnNdXIPaRqUG8sBXAxNw2OCtb6DPQpEZyvKbrvOcfYZNb59w0/57ZN/MGe9/3T/2LrHX/yLn916TgKYtlPUe5AEmyRAiXvnc3L17LtmjFoJWpMD3PfYMAOjJdbuu4L5RpNW5kCU173tLZQTgzpHra+PX998Cxd/6SFmJyd46cFVjjy0RtqeIWuXyduO3IHRcb5wToVWbsB3eYsiqUlRTsRvNIAPLB7DNI1WmyxTvnFeJfiHKEa0mzME1BtUBYPSdiXuu2eYK/5ziH/90QRf+OZ76BsaYz7LqFpLs9lk86aNGGPJXY53jkqq9A0aRB2NeaHVdqSpdHKVKjhncA6SSkKpBKIaQAghbJYSQXWe6pIRvn7VDTy0cczUJ+7hI+d+/JgfXfvzY5IiwztvUO8QH1DHbfVtHLFvld9+YZBaspGN9VUccfKjvO6MM/jY353E9u318CCB6Xo9uCbKtok6u65ZxSXf/DLnn/VBqrWtrNmvn00PTrBli2X3lQklHE5hNm9iRZAkunUh8IigCmsWCQvzqjg8DqVasfRbQ+4aEQ4SBRNAuhHBiMHlgk1ztm5ZzcGveYxXnHoyV/7H59i0aZzZ+S2owJQKYi1JUorxI8EYg4oBsWQuZ5fdHGla7QQdrxoSs4E8F9Y/niEo1vpuwvewbFmKTUr4Zs7w4ABjjWFarQlmZhteFZ+AxLUreEfmMiDnqx/dk6Oetwnjn0S8p+1aqHH43NFstYKVRriZWhsWrwFnSFIiqQ0w24K52W528upxLiZXA+UkZrUurosKkAWHiuo8QUEMzuWoOFQ8aRos0TvBOROebzzSE44SGzC9sRnNZpOp2QYYS8UmwbNiGee867hcmiS0shY2b1JdtBydmCB3WWdORVjEK6mFVWsKmkK7ziyWzetz5uccVib5+Fsq/HGTsNfaV7K1PmlsmpgEDIkNLhy8IQM8JTtNX7odIyWMyUJcVnDeB3LDe0RjlRMTpfOeUrXG4w/dx3cvvYQPvr6fo57XxM/VUQHvA+QUfLBwBZWF0DNMvFvh9SoiV8vktozU9mFMihilXE7AeTJtUSq1EGPpgf6o10AEmJSmA0yJobER5uabOI1hS6VTbAEYI8zOzXPKW97EtnUH8YYzbuSc05bxvP3Hac45jJFISwRSWFVIkx7mtLAa9QyPGvr6U0DZdfcWq9dM4rTEd64vc9NtMxhwJBasBbERgaA020I7Tzowy0hgATtlR/FbUexomL1JSkxtG+eO3/yaYw+Z5cijN+LadRbwfKIxpodwh8YfzMLz0PCfKiLB9fvSIT5xxQgHnew49PWeg0527HNSzs/vXEZ1eQXnMjBF4RTu4pwwUJngi2cv5zljW7jq8iuw5Kg1ZOpxdCFvgL2Gdstx4GEvYOVzD+V71z3Fhq1lJLU9tIv2XBUSsfPgVVAV1AWD6xv0jCxWRhZBaQD6R2Z48yvm2W91gqqShJgZiDAMMYEERBLwrHSnFqvTSG3F5FdQXYViPEmaYoxhaqaFm3aot6gaxOQgusBC6Syi0KwuOBSjDs2GsHHLIB+7zLPH2mEuvNDSzpRms0FfeZhrf2F4bP1izv6HfpobxwNOj4rzPqGvXOfMc4a4+KJH+OLFN3H0cS+jVO7D5W2MUYqaWxEkJu6ZuTnmZ2dIrCCmjbaV6bqhfxDKZQ0KDqRQLPKCXCQ+VzBoJDUVxRhwXti8rc3sfAKYwNJ5J3gUxHYJMSkqPgWjXR30VKbee8RYTISRwVOCgL33iDisEXLtsprd6NKrgl4EVHBChRuDGKGV5WyfMHz/xu189dgh3vrmCWjksKgPdII1+47y4x+PcPr7PBe9fxEjfePkeQxHojhnyCcymnkf1lZx6iOnEwUGiJpoSBqZVIkUiQZ2uC1s2dTG2gqVquB9HsOoEGnfWH8ERXZ8uWNwHkVIEyjF/GcgVm4uWlu8wgjdMl575aULrbcQbOENIoiY7lfatehObJceoe8wVAt2VYobhIlKwB/WWDKXAhWeeGIlp7+1nwdu6eMlLxtn79XzfP1/b6HFADYJFmdsXLg6EgPqFOc8RkyX7u/xQNGF3tmlRwymT9lz7ypDw4L3jlBnWySScjtfkzzjdxGDiCV6QCCxCizuoybEBoH5TpLsCr7XiENsjgooAEAh5whTNTq37rC4Z0o/JrcojKImUA1JW8VQTuF7/9Xkye1L2fCkctU1T/B3r12Nb1tm2wnVRDDqg3B6jCbIx3Us24oJ/FG0nBA+orMX6a1XpHEtNnWI0YVm2JHRDmguAo1exQQD7R4JCnDEWN9zkw6U2rmshF600jPZnlaexLglos+49i8boS6olMDn8KpjhznzHXUee6RGJd2bxaNNTG4xAu1c8F66SyiQWnTjQsG+ixZ7En3verqeDbEXQIj7WvBUnTD9rNPe6UFjhNQC5CEHpCUhQvoOmiEyfJ3pFJVpTCpIN1SIaCd2+s6iQzmCgIlWV3iI0Z7HPNuQoiMliPro5h5bEu66Z4Z/ucwwXp9hzaplZI2N4FNMasCEeO3VB4+L1bGJoTU81+PU4zXM0SABHMfGTSE4g2DFxrVETkrDN8Xw0lnuTkQdZYV2wjNIuCYWEqbzpdFn5MVov90D0IU9PPNPlWBZrgCqnUu6lqedOPSX+EGIsS4zuNwxNDLIr++scPEV49xwyywPrcthsERSSqPA6RpMFMTCeetO56GqQTDF6dLt0kUH6HjGgtn1koi94xma0ZjaQs1ETNSdnmpkWLuTKeJhzzyLGF84uUawXcTOTlFDR2UBosV8IcW8eianz2ZCncWFe7XUkVjDQw/VOepww5VfWsteq9rsudpAaw6ftTFisNZgkLgzI8K3DhYQgm2HmZnomS6K1gMxC4aqmt7rgidJlI2POeNZY1BvSBNwPbItJGNAsEkQTqirYvgwxSk70WIhv50YsdmJJSwU8ELl/MnRIziLpeU8++07zJJFgzz5FLzq2BGG+xvQdORZjvouGuskWFUKqBCjN1ZC2Ol8p70r7bhOd/3RChac0yPIzuqeJWkWBh2SRmEYJhRiWgS+jlBtbD6YDmKUDj8THuBEMdqNhhrPFqPYHSbZmWbHGBdO8tkm3b1HeHaaKJXE8sS6carlEZrtNr+/fZ4D96pAuQHWBqoklhJigsg15g9ipQqKmIDKfcwJiCkCAhC6c07peLiPIct7xRvfQX2C7STj/2mYAgnGM/MobANK1lZcnLTpKbQKdNCxeiLs7IGTOwsfvVzOM0eXR/lzR2EXiVWsDdtZTjg249ILDX1Vi/GCy8Odk0Q6W0q6z+tMdmFeiMeKIwawO2Q9F+/lvYIFmwSWYKfz7EGAnac/s+zHUrQyXaHyWDxJ99Feix1F3VQsnXOhA+06/xZ36v4tpueodu/QwUg7mfBOlkVRQaooxlgqieE/r2/xlndPMduwNBs5tr9E/4ClnTsgCRSAjxbXceMCEhfbXUKUNypYDSGpyBBFV62YrXcK3pC1E3IvYOPaxQeE5IstP70/iqpbID1QMEpiw7EAQ1PBGnpygOJcIRx5RjFQcBuwQy1QCLQHJ3f6pfH7TqQT/kTooYNmBIN3nnYLJqbbHHlUjXe9xzFbh3y6xbJlKd/7ToU/3JHyqQ8sp69cJ48hupsTIPeKNYK1YeNXL0ozPWYq9LAAPYagc8ITj7RYtnuZkUVJqIZ7ZVFcr91rOh/RaEViL8GHYjEBITEFIy7R5bpQrNuIjjfzoVtlikgeLVsl6r1ARdYianBeQHxP0RJpq0ILOyyyeHDvkrxCkhpGBjPe+uohNq73XHr5HJrltKZaeKny+9+1ecnBmzn7nAb5xgl8HnoDgUoI4k2GaySJwbkWpSQJ69MQ/4OM4h4fAfVh513Ykhh37JUdu65MqfaB5oVxxilrxE07GmDhgRruX1TZeaAfggJCrDDgF5JmJgETcVbR6e8wewXaiTfszeOtZgPvHP39VexAGd9qIWYHa9iZ9Xdgmu+aP6BeqdSU3Xef5bKzy1z0rW1c86+zDNYCPTHfbPC+Nw1zwssnmX2iSblsMBC3L4Yu1dTsIi74QMo2uxdvP/NkklIV71wH54ck6/Bxa4lXz8BgPwMDw+ROUU3AKpU+h7UFcNnJ5Hv/VhAbvMkDuQ90xuKxKgO10H1LAHIXOPNufS5Ua0rFeHJnKYniXaxMvY/IoJtMO8yIEbKszaKlKzjuta/l+7/YwtNPL+K1x08DU5309kxOqCdOP8ty1CuJhRnX4Jy353z4dEuaBGSkTmjpFsIuiGC9YYQdEolV5rNBPv2dRznuxCM544xTeXr906TeQwezaeDyfeDDqpUyv/75jcxuuJ+zT1vF2l3n8e2QB9RIl4Yn1io2yqEn14kYZqY9WStU3QM1YXJ2mC9drfzq3jnE2ABDs8wFeCaeRCxgGZ8cYHxyjKWL63GPZbHz0GDCPsAFkhIgESFvtlm6chVvPOxg3vvGd/D7xROceOIQ3k1gxAYEsSBXKIqL7stOR+xxY3AMjkloutBEjZJbgySC9eBdhJ2eUNkb7Vii9zmpgPiMqcl6pCl68hcRcJhAQff117juh9dSm7uLe/97T5jcQtZOSBIpzowL9wgJzUYkK2JDBsBgaE5n5JniSLj7ngoPblnCj+4e5IltTyBSj3UAIOLBJCQ2NAre86l1vHCfAb7zz7szbDeSJpaRWoUkFXB5tOSIEDq7BMJezHa7wczWLQxUhf4+g7YcuZOw7SSYBl7DVkSJ7mBM160LmqDgkgrs5Al4XvAkNtDAeSvUrSHBd2O5L6JY6J/icmWoWqVStZSskhhou7zDB4kRjImbmMXgvFKr1Si7PvL6PK5tMUnoEIZeSPRkY1BfYnxzkyx3QTU+hjGvLN+tQq0/J+0b4R2fanDP+nk2b7yBD519gf/M57+iCYCN+BpJom4dJy1dgdvS5pA3bOfz713Mia8c594bducDF/+S899/Ax+44BPBWpynv79GKU1xzlEdGODWm2/mK5/7Enne4rlLazx03xz9FcPoYsN8MwsIi4T+co2sbWlmQcg+hiEbYVunBomL1YiURT1Zq0U7zylVB0KiNNDleRV8cb1gjGW0PM89P1vBp7/+R0474S1cdtWX6R9bwnyjRWoNWbPN/Pxc6BN4Jc8dzudkzpEkwqYnlZmZNmkiuKiAYpOutY4Vq1IkscH70B5UldNqOpKqkrsGrdYcUMKDERESMD61IqpecJA7D+TsloRVX/XUFN6MUBpus6x/nKmJlM0bpqj0Vyn3D+JaDb7xpcsZ3zpBqVLCO2HfXTO++I8l5meUNbt5RofbGGPwZAz1JVBVZjbuwhvOnmSq0SLPFO8ETEhY1hiKvrH3YfOTEMJKuWSxpT5OPa6PA9Y4zvzwNCKeNLGR0dXONbE8B03Yc7nwzSvKnPvGnANWj3D5p/+Z7fOCiEddzktfcQyvPukE5udm8WIYGhqg0RSm657cwcCQoTKQYKR4e6YTtxAjJIkLzR9bhNgAaIwVDFVmn2rwgfecwF2b17pTTzlDnt749A/SSvr9BMSIEarWor5F7pqICJkou/UbTn7+nvzhgYT8qkW8+YSck1+WMzi0nOv/z7XkUoGsze7pA+yxdBxjS2Q+58i9a7z9FbO0spy0DCSeSqrMzo5w8ZWKSXLmpktMlF9Ku2rBZ/gFCKyHXYyoS1VJk5SGb/Hrn13HAc9ZwqEHLkaXHARpmdyGcBN2UDuIbUZjDGIt2yrK5754H0N9dTCWF618BOdmMNbQ9iUm1/Xx7a9MkbUbiDFUUssL9/U873+Nkbfn6B9UbNLdu1oYR5FBguX3VL0KXg2zk8ofnxrk69+f4CMXHsp+Rx+iK8/9JwvcD1ydDAwMPjg9Wx382R3JilcPNhVVUQ091MUu55xVNS6+aSu/uAmGy8Mcc9g4Jx6bc9J7f8jEjCNF+NiHRthnN8GknlJqybJZtk60WbQ4pVTJcd7yyLoBbn94CZffWGa2kbNo6RDnfvJ9SFLB+7yTSwolmBiLTdzx5lUxSYnm5GZu++Ut9JcdS5f1865z3wflYYy6zusAGrfJFIRbqWSZmtjGZ8//DNP1IaqJ8sV/HGLF2Bypgf2OzLj6m4/z2a/fQikt0W4r03M5l5+3lJcdOcv4eIsksTFMm0jThITbixyKFziKCtt7Q2uiyYb1ffxuw1Ku+uk2Vqy4I1+0aNEfTUp966ZtiaRJQpbLqRb9tz9evcTf9rCkbzpvK29Zs4pDRFmSwtggbBwb5m9+fDefeMci3veGKVpZmSQNXf9t22dJrLJ0uUF9hk1s2GWhiuZKeXSUvz5D+MHNLS762qXkUiF3jmaztaCAkdi6yYsMB7E3HT3CJvjGJJ8552wueGcff/+2PfjCb87A2Qqow8VK2xK2tgOxCRS2UJZrfXhj8K0Gnzv7/TTntgElbvrGSp6zZp5adZjB/jrzs23Gtzja7Xmca2OS0Kw3cQdEqJpCseg0gpCOHkLv2qAYsTQbfa5deb7u+/LP+JNOOYufXv+rh2u16gHNZgvvvSRZnpOmabVWSq2nqq976ZQ78voDedM5m/Q3901w1rIVjBm1UjYCOUnFUluSoFvrJGmIf7vtmkQIlsV6zuG9xN6Aks81OOUVg6zaDeTeD6OZB6eUpESpbMPOZrrbN3Ln0aLuiJ03ESFNQv/6tNeUOXx/gcY6htZdSO7z2NOItYlJA1SOGvDOk7U9becD2kmGqJUaHLzXEg47oMItvxUu+oZw7yNPccu3+lm9YhtLliXY1ICWAQkdNLoKKN4L6KSCYueHt9QGEk9JlNIyTnz9tP35H26lVDmeseGB844++uiv/fKXv4wvvaJy/vnnm2uuuWZFXyU5eJe+rVcNpM1qua/Mj349RX17iwOGh6mqssfqAV53Wo2D9qmzYlUd2q67h6pb93SH9nx6hSGjyCrdOH4cbenTimxll+H/AqYEY+O9NFIeQqdvV3SFPJAYIUtpPplRGfFQXsJTs6/Bm1pUXYkl5UfoG75RkDzyYUX5HidqneBXSW3N05z99mVc8KlpMDmfuGCY8774NA9dvZzVyzbTdibsdo6FqXOBoAx70EKzJunQNAKox6u2sn4u+ffUbprIGBgc4Dd3ua/fevf63wHJ4ODgz6anpx+l9xWlCy64QIH1wHqqA9/FlVaSt1U026LiW3fUJxThJZvq7HVKacjffKcz87/qxyS2B6tLh10o9sx71wHKiElQn8lMVpKH58pkUqbP9LPP4FAooHzQnhiDEYOxgrUhnoa3JQOy8SjiLXP1Jn0DlmYywj1bK+RSwViPsRWWVPrZZ3iUPGuRZUVjABIrpCWL4PDOcNLLxjjgOW3m1jmuv6XGb++cAzK+dW3O2GAlXBaNIRB3gdcq6Gkh7O0plS0mkHvGZ55mXuVr17rbN463tkma25cd9+KL5J71j4MwPT1dXNoxVen5NIk1LlAjQhZfETUIS5eNXLF16/TfOl9GrE0QRfOe1xcjfWg6WwJD8wNjwbeBFlDehtBEm9uBJp1KvjwC1OjQfwQCRZtbQTM67XtVKC0CKcdGIIgXtDUNzPSsRaEyDPRFC+i53jfBLAUdfOrG5ey2/Ck2rF/GXq+eyBtezS67LJLpmTZeY+vRFGRgiPHqtVNIqg8G05ifAd92mPRxfGsKvN9777GTnni8vlFVyfL4Klg3Rix4TbX4QgGXO286GyUju3Dk0Ufl999/z9JqrZK85q9e2TZGvHMOdeFlbBEBK0jcsuhVI18kVCoVHn/8cfe7W39rn/vc5e+4++5v/CRNX94sGiYinjxvmnXr3lZatWpQ160blVWrwsPT5MJmp1cQZ5Tn1yfr1t2cZNmorl0LMCil0ulN5xbGPucasm7dx8urVo0qTAjr4PqHqR1//Lt2H1206q+NMx+p1kxOzSZLRkoy1O+T4f5lPP+gA2m2m/g8D6greiSAc6HitsYiRvDOYa3l3nv/wFR9snnppe9/8RlnfHpcFR5+eLuwsFm4w87dZyqgGH7Hv2+++Wbdd9+9/31mrvnQ7Xfee7YxYjTLwwtpVmLl6BeU5ia+SJ2kCRPbJw0modn0TuSlTQL71XVBEU/wiB3HM+hSkZfmz7IYWXie6I73/Ob558Pxlfl6vekrSSqfvVLTkcooM/Pk/f2DX3p0w7rn/WTTusMI+zl3SkwZU9BvnRpAAenr75v94Q/vVec6TFy3YPgTYyec8DOfC/jPfOYzAx/92Id/mrWd3ck5abyXATKIfhSm4Gq1kl25csUHH3zwif+O57g/Yw47W8Cfe+7OzjOAq1RKZyPpWc1G1g4vubmN0D7koUevf9GHPvLZ8Uce3dSc3z4hU1Ot7j0rMFKtUKmE/01CM/5TqVTYtGkT0NBjj33Nxquvvtrt5Ln/4/i/MZ7P1CTHx0wAAAAASUVORK5CYII=",
};

const CAR_SPRITE_SRCS = {
  taxi: '/game/vehicles/traffic-premium-v1/taxi.png',
  yellow_taxi: '/game/vehicles/traffic-premium-v1/yellow_taxi.png',
  green_taxi: '/game/vehicles/traffic-premium-v1/green_taxi.png',
  orange: '/game/vehicles/traffic-premium-v1/orange.png',
  police: '/game/vehicles/traffic-premium-v1/police.png',
  ambulance: '/game/vehicles/traffic-premium-v1/ambulance.png',
  truck: '/game/vehicles/traffic-premium-v1/truck.png',
  bus: '/game/vehicles/traffic-premium-v1/bus.png',
  firetruck: '/game/vehicles/traffic-premium-v1/firetruck.png',
  black_suv: '/game/vehicles/traffic-addons-v1/black_suv.png',
  blue_hatchback: '/game/vehicles/traffic-addons-v1/blue_hatchback.png',
  white_panel_van: '/game/vehicles/traffic-addons-v1/white_panel_van.png',
  orange_pickup: '/game/vehicles/traffic-addons-v1/orange_pickup.png',
  silver_minivan: '/game/vehicles/traffic-addons-v1/silver_minivan.png',
};


/* ===== vfx-system.js ===== */
const GameVfx = (() => {
  const PRIORITY = Object.freeze({ ambient: 0, contact: 1, feedback: 2, impact: 3 });

  const SURFACES = Object.freeze({
    neutral: Object.freeze({ id: 'neutral', shadowRgb: '30,36,46', shadowAlpha: 0.18, mark: '#596170' }),
    grass: Object.freeze({ id: 'grass', shadowRgb: '18,47,26', shadowAlpha: 0.22, mark: '#315D2E' }),
    sand: Object.freeze({ id: 'sand', shadowRgb: '91,61,24', shadowAlpha: 0.20, mark: '#9B7138' }),
    snow: Object.freeze({ id: 'snow', shadowRgb: '50,82,125', shadowAlpha: 0.18, mark: '#A9BDD8' }),
    dryRoad: Object.freeze({ id: 'dryRoad', shadowRgb: '20,23,31', shadowAlpha: 0.24, mark: '#777D86' }),
    wetRoad: Object.freeze({ id: 'wetRoad', shadowRgb: '12,22,38', shadowAlpha: 0.22, mark: '#91ABC5' }),
    water: Object.freeze({ id: 'water', shadowRgb: '0,30,67', shadowAlpha: 0.24, mark: '#C9EDFF' }),
    railBed: Object.freeze({ id: 'railBed', shadowRgb: '29,27,31', shadowAlpha: 0.24, mark: '#8D8277' }),
  });

  const LANDING = Object.freeze({
    neutral: Object.freeze({ kind: 'dust', life: 0.55, count: 3 }),
    grass: Object.freeze({ kind: 'grass', life: 1.0, count: 5 }),
    sand: Object.freeze({ kind: 'sand', life: 0.85, count: 6 }),
    snow: Object.freeze({ kind: 'snow', life: 2.5, count: 6 }),
    dryRoad: Object.freeze({ kind: 'roadDust', life: 0.45, count: 3 }),
    wetRoad: Object.freeze({ kind: 'splash', life: 0.65, count: 5 }),
    water: Object.freeze({ kind: 'ripple', life: 0.9, count: 6 }),
    railBed: Object.freeze({ kind: 'ballast', life: 0.55, count: 4 }),
  });

  function getSurface(id) {
    return SURFACES[id] || SURFACES.neutral;
  }

  function getLanding(id) {
    return LANDING[id] || LANDING.neutral;
  }

  function resolveSurface({ rowType, biome = 'default', weatherState = 0, weatherRatio = 0 }) {
    let id = 'neutral';
    if (rowType === 'water') id = 'water';
    else if (rowType === 'train') id = 'railBed';
    else if (rowType === 'road') {
      const rain = (weatherState === 1 || weatherState === 3) && weatherRatio > 0.2;
      id = rain && biome !== 'desert' ? 'wetRoad' : 'dryRoad';
    } else if (rowType === 'grass') {
      id = biome === 'desert' ? 'sand' : biome === 'snow' ? 'snow' : 'grass';
    }
    return Object.freeze({
      id,
      biome,
      wet: id === 'wetRoad' || id === 'water',
      reflective: id === 'wetRoad' || id === 'water',
    });
  }

  function priorityOf(name) {
    return PRIORITY[name] ?? PRIORITY.ambient;
  }

  function surfaceVariant(rowIdx, variantCount = 4) {
    const count = Math.max(1, Math.floor(variantCount) || 1);
    let value = (Number.isFinite(rowIdx) ? Math.trunc(rowIdx) : 0) >>> 0;
    value = Math.imul(value ^ 0x9E3779B9, 0x85EBCA6B);
    value ^= value >>> 13;
    value = Math.imul(value, 0xC2B2AE35);
    value ^= value >>> 16;
    return (value >>> 0) % count;
  }

  function createPool(limit = 160) {
    const items = [];
    const free = [];

    function releaseAt(index) {
      if (index < 0 || index >= items.length) return;
      const item = items[index];
      items.splice(index, 1);
      for (const key of Object.keys(item)) delete item[key];
      free.push(item);
    }

    function spawn(data, priority = 'ambient') {
      const nextPriority = priorityOf(priority);
      if (items.length >= limit) {
        let replaceIndex = -1;
        let replacePriority = nextPriority;
        for (let i = 0; i < items.length; i++) {
          const current = items[i]._priority ?? 0;
          if (current < replacePriority) {
            replacePriority = current;
            replaceIndex = i;
          }
        }
        if (replaceIndex === -1) return null;
        releaseAt(replaceIndex);
      }
      const item = free.pop() || {};
      Object.assign(item, data, { _priority: nextPriority });
      items.push(item);
      return item;
    }

    function clear() {
      while (items.length) releaseAt(items.length - 1);
    }

    function stats() {
      return { active: items.length, free: free.length, limit };
    }

    return { items, spawn, releaseAt, clear, stats };
  }

  return { resolveSurface, getSurface, getLanding, createPool, priorityOf, surfaceVariant };
})();


/* ===== renderer.js ===== */
const Renderer = (() => {

  const CELL = World.CELL;
  const COLS = World.COLS;

  let canvas, ctx;
  let cameraY     = 0;
  let targetCamY  = 0;
  let waterTime  = 0;   // animates water waves (constant-rate clock)
  let waveTime   = 0;   // wave-phase clock: advances at dt * weather boost
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
  let _boltSeed      = 0;       // random seed for the bolt polyline shape
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

  // Two-phase weather change: fade current weather out, then swap in the new one
  let pendingWeather = null;

  function _applyWeatherState(state) {
    weatherState   = state;
    pendingWeather = null;
    // Переинициализировать частицы дождя с правильным количеством
    if (state === 3)      { rainInitDone = false; initRain(STORM_RAIN_COUNT); }
    else if (state === 1) { rainInitDone = false; initRain(RAIN_COUNT); }
  }

  function setWeather(score) {
    const threshold = Math.floor(score / 30);
    if (threshold === _lastWeatherScore) return;
    _lastWeatherScore = threshold;

    const prevState = weatherState;
    let next;

    if (score < 30) {
      next = 0;
    } else {
      // Взвешенный рандом в зависимости от score
      const r = Math.random();
      if (score < 80) {
        // clear 50%, rain 25%, fog 15%, windy 10%
        if      (r < 0.50) next = 0;
        else if (r < 0.75) next = 1;
        else if (r < 0.90) next = 2;
        else                next = 4;
      } else {
        // clear 30%, rain 25%, fog 15%, storm 15%, windy 15%
        if      (r < 0.30) next = 0;
        else if (r < 0.55) next = 1;
        else if (r < 0.70) next = 2;
        else if (r < 0.85) next = 3;
        else                next = 4;
      }
      // Не повторять ту же погоду подряд (кроме clear)
      if (next !== 0 && next === prevState) next = 0;
    }

    if (next === prevState) {
      pendingWeather = null; // re-rolled the current weather — cancel any pending swap
    } else if (prevState === 0 || weatherRatio < 0.05) {
      _applyWeatherState(next); // nothing visible to fade out — switch immediately
    } else {
      pendingWeather = next; // draw() fades the current weather to 0, then swaps
    }
  }

  // ── Coin pickup effects ──────────────────────────────────
  const coinEffects  = [];   // { x, y, age, value }
  const COIN_EFFECT_DUR  = 0.7;
  const scoreEffects = [];   // { x, y, age } — row-advance "+1"
  const SCORE_EFFECT_DUR = 0.55;
  const GAME_FX_FONT = "'Courier New', monospace";
  let secondChanceFx = null;

  // ── Magnet attract animations ───────────────────────────
  const magnetCoins = [];   // { fromX, fromY, toX, toY, age, col, rowIdx, value }
  const MAGNET_DUR  = 0.25; // seconds for coin to fly to player

  // ── Booster moment effects ──────────────────────────────
  const shieldBursts = [];  // { x, y, age }
  const SHIELD_BURST_DUR = 0.55;

  // ── Footprint / landing trails ───────────────────────────
  // Each trail: { x, y, age, maxAge, type, seed, particles? }
  // Surface-aware (default): 'footprint' (grass) | 'dust' (road/train) | 'ripple' (water/log)
  // Custom (shop variant):   'sparkle' | 'hearts' | 'fire' | 'coins' | 'rainbow'
  const trails = [];
  const physicalFxPool = GameVfx.createPool(96);
  const TRAIL_LIFE = {
    footprint: 0.75,
    dust:      0.55,
    ripple:    0.85,
    sparkle:   0.85,
    hearts:    0.95,
    fire:      0.70,
    coins:     0.80,
    rainbow:   0.85,
  };
  const RAINBOW_COLORS = ['#FF3B3B', '#FF8C1F', '#FFD700', '#2ECC40', '#3AAFFF', '#B026FF'];

  // ── Death animation state ────────────────────────────────
  let deathActive    = false;
  let deathTimer     = 0;
  const DEATH_DUR    = 0.9;
  let deathX         = 0;
  let deathY         = 0;
  let deathType      = 'car';
  let deathDirection = 0;
  let deathSurfaceId = 'neutral';
  const deathFxPool = GameVfx.createPool(40);
  const deathParticles = deathFxPool.items;

  // ── Screen shake ─────────────────────────────────────────
  let shakeTimer = 0;
  let shakeDuration = 0;
  let shakePeak = 0;
  let shakeDirectionX = 0;
  let shakeDirectionY = 0.2;
  let shakePhase = 0;

  // ── Squash & stretch ──────────────────────────────────────
  let squashTimer  = 0;      // post-landing spring countdown
  let _wasJumping  = false;  // edge-detect jump→land transition
  const SQUASH_DUR  = 0.18;  // spring duration after landing
  const SQUASH_PEAK = 0.14;  // 14% max deformation

  // ── Jump ring ─────────────────────────────────────────────
  let _ringState  = null;    // { x, y, timer } — null when inactive
  const RING_DUR  = 0.30;    // ring persists this long after jump starts

  function triggerDeath(x, y, type, direction = 0) {
    deathActive = true;
    deathTimer = 0;
    deathX = x;
    deathY = y;
    deathType = type || 'car';
    deathDirection = Math.max(-1, Math.min(1, direction));
    deathSurfaceId = _surfaceForRow(World.getRow(Player.getState().row)).id;
    deathFxPool.clear();
    for (const particle of buildParticles(x, y, deathType)) {
      deathFxPool.spawn(particle, 'impact');
    }
    const magnitude = deathType === 'train' ? 14 : deathType === 'water' ? 2 : 9;
    const duration = deathType === 'train' ? 0.52 : deathType === 'water' ? 0.18 : 0.34;
    triggerShake(magnitude, duration, deathDirection, deathType === 'water' ? 0.05 : 0.22);
  }

  function triggerShake(magnitude, duration, directionX = 0, directionY = 0.2) {
    const nextPeak = magnitude || 8;
    const nextDuration = duration || 0.38;
    if (shakeTimer <= 0) {
      shakePeak = nextPeak;
      shakeDuration = nextDuration;
    } else {
      shakePeak = Math.max(shakePeak, nextPeak);
      shakeDuration = Math.max(shakeDuration, nextDuration);
    }
    shakeTimer = Math.max(shakeTimer, nextDuration);
    shakeDirectionX = Math.max(-1, Math.min(1, directionX));
    shakeDirectionY = Math.max(-1, Math.min(1, directionY));
    shakePhase = 0;
  }

  function buildParticles(x, y, type) {
    const pack = (typeof Shop !== 'undefined') ? Shop.getEquippedDeath() : 'default';
    const parts = [];
    const isImpactCause = type === 'car' || type === 'train';
    const impactColors = type === 'train'
      ? ['#FFD8A0', '#B9C0C8', '#8E969F', '#FFF2CC']
      : ['#FFC56B', '#E89A45', '#8E8174', '#FFF0C8'];

    if (pack === 'death_pixel') {
      // Pixel pack: square particles
      const count = isImpactCause ? 20 : 14;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + Math.random() * 0.3;
        const speed = 40 + Math.random() * 100;
        const colors = isImpactCause
          ? (type === 'train' ? impactColors : ['#FF0000','#FF4400','#FFAA00','#FFFFFF','#FF6600'])
          : ['#00AAFF','#0066FF','#88DDFF','#FFFFFF','#0088CC'];
        parts.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30,
          size: 3 + Math.random() * 5, color: colors[Math.floor(Math.random() * colors.length)],
          gravity: 120, life: 0.5 + Math.random() * 0.5, square: true,
        });
      }
    } else if (pack === 'death_dramatic') {
      // Dramatic: fewer but bigger, slower particles
      const count = isImpactCause ? 8 : 6;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + Math.random() * 0.5;
        const speed = 30 + Math.random() * 50;
        const colors = isImpactCause
          ? (type === 'train' ? impactColors : ['#FFD700','#FFA500','#FF4500','#fff','#FFEC8B'])
          : ['#E0F7FA','#80DEEA','#4DD0E1','#fff','#B2EBF2'];
        parts.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40,
          size: 8 + Math.random() * 10, color: colors[Math.floor(Math.random() * colors.length)],
          gravity: 60, life: 0.8 + Math.random() * 0.4, square: false,
        });
      }
    } else if (pack === 'death_comic') {
      // Comic: bouncy, cartoonish
      const count = isImpactCause ? 16 : 12;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + Math.random() * 0.6;
        const speed = 60 + Math.random() * 90;
        const colors = isImpactCause
          ? (type === 'train' ? impactColors : ['#FF1744','#FFEA00','#FF9100','#FFFFFF','#F50057'])
          : ['#40C4FF','#00E5FF','#18FFFF','#FFFFFF','#84FFFF'];
        parts.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (isImpactCause ? 50 : 80),
          size: 5 + Math.random() * 8, color: colors[Math.floor(Math.random() * colors.length)],
          gravity: isImpactCause ? 250 : 120, life: 0.7 + Math.random() * 0.3, square: false,
        });
      }
    } else {
      // Default
      const count = isImpactCause ? 14 : 10;
      for (let i = 0; i < count; i++) {
        const angle  = (Math.PI * 2 * i / count) + Math.random() * 0.4;
        const speed  = 55 + Math.random() * 80;
        const size   = 4 + Math.random() * 7;
        const colors = isImpactCause
          ? impactColors
          : ['#64B5F6','#90CAF9','#fff','#B3E5FC','#E1F5FE'];
        parts.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (isImpactCause ? 20 : 60),
          size, color: colors[Math.floor(Math.random() * colors.length)],
          gravity: isImpactCause ? 180 : 90, life: 0.6 + Math.random() * 0.4,
        });
      }
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
  let _now        = 0;   // cached Date.now() — set once per draw(), shared by all sub-functions
  let _frameDt    = 0.016; // cached frame delta — set once per draw(), for weather sub-draws

  // Call this every frame from main.js with current score
  let _lastNightScore = -1;
  let _nightOn = false;

  function setScore(score) {
    _camScore = _dbgZoomForce !== null ? _dbgZoomForce : score;
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
    default: ['bush', 'bush', 'bush', 'tree', 'tree', 'rock', 'rock', 'shrub', 'stump', 'rock_pile'],
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
  let playerImgSrc = '';
  let pendingPlayerImgSrc = '';
  let playerFrameSet = null;
  let playerFrameSetSrc = '';
  let coinImg   = null;

  const PLAYER_SPRITE_SETS = {
    '/game/chars/cryptokid.png': {
      idle:  '/game/chars/cryptokid-genesis/idle.png',
      walkA: '/game/chars/cryptokid-genesis/walk-a.png',
      walkB: '/game/chars/cryptokid-genesis/walk-b.png',
    },
  };

  // ── Procedural grass tile (offscreen canvas, built once at init) ──
  const _GRASS_PATTERNS = {};

  // Seeded pseudo-random (mulberry32)
  function _seedRng(seed) {
    let s = seed >>> 0;
    return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // Colours for speck variations per biome
  const _GRASS_TILE_CFG = {
    default: { base: '#4CAF50', dark: '#357A38', light: '#69C46D', darkAlpha: 0.28, lightAlpha: 0.18 },
    desert:  { base: '#C2B280', dark: '#8C7A50', light: '#D8CC9C', darkAlpha: 0.25, lightAlpha: 0.18 },
    snow:    { base: '#E0E0EC', dark: '#A8A8C0', light: '#F5F5FF', darkAlpha: 0.20, lightAlpha: 0.16 },
  };

  function _buildGrassTile(biome) {
    // Crossy Road style: clean flat tile, no noisy specks.
    // Depth is achieved in drawGrassRow via edge shadow + bottom highlight.
    const cfg  = _GRASS_TILE_CFG[biome] || _GRASS_TILE_CFG.default;
    const SIZE = 128;
    const oc   = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(SIZE, SIZE)
      : (() => { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; })();
    const ox   = oc.getContext('2d');

    // Solid base — no noise
    ox.fillStyle = cfg.base;
    ox.fillRect(0, 0, SIZE, SIZE);

    return oc;
  }

  function loadGrassTextures() {
    for (const biome of ['default', 'desert', 'snow']) {
      const tile = _buildGrassTile(biome);
      const pat  = ctx.createPattern(tile, 'repeat');
      if (pat) _GRASS_PATTERNS[biome] = pat;
    }
  }

  function _applyGrassTexture(/* y, bi — unused now; kept for signature compat */) {
    // Crossy Road style: no texture overlay — depth comes from edge shadows in drawGrassRow
  }

  // ── Material surface tiles ───────────────────────────────
  // Transparent, deterministic detail tiles: the row palette remains the source
  // of truth and these overlays only add restrained material character.
  let _surfaceTiles = null;
  const SURFACE_TILE_VARIANTS = 4;
  const SURFACE_TILE_SEEDS = Object.freeze({ grass: 0x41C64E6D, sand: 0xC2B28035, snow: 0xA8BDD8F1 });
  const SURFACE_TEXTURE_PROFILE = Object.freeze({
    grass: Object.freeze({ blades: 96, tufts: 18, alpha: 0.64 }),
    sand: Object.freeze({ grains: 120, ripples: 5, alpha: 0.74 }),
    snow: Object.freeze({ drifts: 12, crystals: 48, alpha: 0.70 }),
  });

  function _dominantBiome(bi) {
    return bi && bi.blendT > 0.5 && bi.nextBiome ? bi.nextBiome : (bi && bi.biome) || 'default';
  }

  function _surfaceForRow(row) {
    const fallbackRow = typeof Player !== 'undefined' ? Player.getState().row : 1;
    const idx = row && Number.isFinite(row.idx) ? row.idx : fallbackRow;
    const bi = World.getBiomeForRow(idx);
    return GameVfx.resolveSurface({
      rowType: row ? row.type : 'grass',
      biome: _dominantBiome(bi),
      weatherState,
      weatherRatio,
    });
  }

  function _buildSurfaceTile(surfaceId, variant) {
    const width = COLS * CELL;
    const height = CELL;
    const c = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : (() => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; })();
    const g = c.getContext('2d');
    const profile = SURFACE_TEXTURE_PROFILE[surfaceId];
    const seed = (SURFACE_TILE_SEEDS[surfaceId] + Math.imul(variant + 1, 0x9E3779B9)) >>> 0;
    const rng = _seedRng(seed);

    if (surfaceId === 'grass') {
      // A restrained field of short independent strokes reads as turf without
      // introducing dirt-like dots or large repeated patches.
      for (let i = 0; i < profile.blades; i++) {
        const x = 3 + rng() * (width - 6);
        const baseY = 4 + rng() * (height - 7);
        const bladeHeight = 1.4 + rng() * 2.4;
        const lean = (rng() - 0.5) * 1.4;
        g.strokeStyle = i % 5 === 0 ? 'rgba(211,237,159,0.10)' : 'rgba(18,74,31,0.13)';
        g.lineWidth = 0.55 + rng() * 0.25;
        g.beginPath();
        g.moveTo(x, baseY);
        g.lineTo(x + lean, baseY - bladeHeight);
        g.stroke();
      }

      for (let i = 0; i < profile.tufts; i++) {
        const x = 4 + rng() * (width - 8);
        const baseY = 6 + rng() * (height - 10);
        const tuftHeight = 2.6 + rng() * 2;
        const lean = (rng() - 0.5) * 1.8;
        g.strokeStyle = i % 4 === 0 ? 'rgba(203,233,145,0.14)' : 'rgba(16,70,29,0.17)';
        g.lineWidth = 0.75;
        g.beginPath();
        g.moveTo(x - 1, baseY);
        g.lineTo(x - 1 + lean, baseY - tuftHeight * 0.78);
        g.moveTo(x, baseY);
        g.lineTo(x - lean * 0.35, baseY - tuftHeight);
        g.moveTo(x + 1, baseY);
        g.lineTo(x + 1 - lean, baseY - tuftHeight * 0.68);
        g.stroke();
      }
    } else if (surfaceId === 'sand') {
      for (let i = 0; i < profile.ripples; i++) {
        const x = rng() * width;
        const y = 6 + rng() * (height - 12);
        g.strokeStyle = 'rgba(130,92,42,0.11)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.ellipse(x, y, 10 + rng() * 16, 1.1 + rng(), 0, Math.PI * 1.08, Math.PI * 1.92);
        g.stroke();
      }
      for (let i = 0; i < profile.grains; i++) {
        const x = rng() * width;
        const y = rng() * height;
        const r = 0.35 + rng() * 0.65;
        g.fillStyle = i % 4 === 0 ? 'rgba(255,238,184,0.22)' : 'rgba(114,76,31,0.17)';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    } else if (surfaceId === 'snow') {
      for (let i = 0; i < profile.drifts; i++) {
        const x = rng() * width;
        const y = rng() * height;
        const rx = 3 + rng() * 6;
        g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.24)' : 'rgba(95,125,170,0.13)';
        g.beginPath();
        g.ellipse(x, y, rx * 1.45, rx * 0.28, -0.18, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < profile.crystals; i++) {
        const x = rng() * width;
        const y = rng() * height;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function _drawSurfaceTexture(row, y) {
    const surfaceId = _surfaceForRow(row).id;
    if (surfaceId !== 'grass' && surfaceId !== 'sand' && surfaceId !== 'snow') return;
    if (!_surfaceTiles) {
      _surfaceTiles = {
        grass: Array.from({ length: SURFACE_TILE_VARIANTS }, (_, variant) => _buildSurfaceTile('grass', variant)),
        sand: Array.from({ length: SURFACE_TILE_VARIANTS }, (_, variant) => _buildSurfaceTile('sand', variant)),
        snow: Array.from({ length: SURFACE_TILE_VARIANTS }, (_, variant) => _buildSurfaceTile('snow', variant)),
      };
    }
    const variants = _surfaceTiles[surfaceId];
    const rowIdx = row && Number.isFinite(row.idx) ? row.idx : 0;
    const tile = variants[GameVfx.surfaceVariant(rowIdx, variants.length)];
    ctx.save();
    ctx.globalAlpha = SURFACE_TEXTURE_PROFILE[surfaceId].alpha;
    if ((rowIdx & 1) !== 0) {
      ctx.translate(COLS * CELL, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(tile, 0, y, COLS * CELL, CELL);
    ctx.restore();
  }

  // ── Unified soft shadows ─────────────────────────────────
  // Shadow masks are cached by material. Individual objects only supply
  // footprint, lift and a tiny directional offset from the global light.
  const _shadowSpriteCache = new Map();

  function _shadowSprite(surfaceId) {
    if (_shadowSpriteCache.has(surfaceId)) return _shadowSpriteCache.get(surfaceId);
    const style = GameVfx.getSurface(surfaceId);
    const size = 128;
    const c = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : (() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; return canvas; })();
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
    grd.addColorStop(0, `rgba(${style.shadowRgb},1)`);
    grd.addColorStop(0.52, `rgba(${style.shadowRgb},0.68)`);
    grd.addColorStop(1, `rgba(${style.shadowRgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    _shadowSpriteCache.set(surfaceId, c);
    return c;
  }

  function drawGroundShadow(x, y, width, height, options = {}) {
    const surfaceId = options.surfaceId || 'neutral';
    const style = GameVfx.getSurface(surfaceId);
    const lift = Math.max(0, Math.min(1, options.lift || 0));
    const lightningFade = 1 - Math.min(lightningFlash, 1) * 0.45;
    const alpha = (options.alpha ?? style.shadowAlpha) * (1 - lift * 0.48) * lightningFade;
    const contactAlpha = Math.min(0.52, alpha * 1.9);
    const offsetX = options.offsetX ?? width * 0.08;
    const offsetY = options.offsetY ?? height * 0.16;
    const sprite = _shadowSprite(surfaceId);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha * 0.78;
    ctx.drawImage(sprite, x - width * 0.5 + offsetX, y - height * 0.5 + offsetY, width, height);
    if (options.contact !== false) {
      ctx.globalAlpha = contactAlpha;
      ctx.drawImage(sprite, x - width * 0.34, y - height * 0.24, width * 0.68, height * 0.48);
    }
    ctx.restore();
  }

  function drawPropContact(type, cx, baseY, surfaceId) {
    ctx.save();
    if (surfaceId === 'snow') {
      ctx.fillStyle = 'rgba(246,250,255,0.76)';
      ctx.beginPath();
      ctx.ellipse(cx, baseY, CELL * 0.20, CELL * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (surfaceId === 'sand') {
      ctx.strokeStyle = 'rgba(118,79,35,0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, baseY, CELL * 0.18, CELL * 0.04, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (surfaceId === 'grass' && type !== 'rock') {
      ctx.strokeStyle = 'rgba(27,78,35,0.35)';
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * CELL * 0.045, baseY);
        ctx.lineTo(cx + i * CELL * 0.04, baseY - CELL * (0.035 + Math.abs(i) * 0.004));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Environment sprite images
  const _ENV_SPRITES = {};
  const _ENV_SPRITE_SRCS = {
    bush:       '/game/env/bush.png',
    tree:       '/game/env/tree.png',
    rock:       '/game/env/rock.png',
    rock_pile:  '/game/env/addons-v1/rock_pile.png',
    stump:      '/game/env/addons-v1/stump.png',
    shrub:      '/game/env/addons-v1/shrub.png',
    cactus:     '/game/env/cactus.png',
    tumbleweed: '/game/env/tumbleweed.png',
    pine:       '/game/env/pine.png',
    snowman:    '/game/env/snowman.png',
  };
  const TRAIN_SPRITE_SRC = '/game/vehicles/train-premium-v1.png';
  const LOG_SPRITE_SRC   = '/game/env/log.png';
  let _trainSpriteImg = null;
  let _logSpriteImg = null;

  function loadEnvSprites() {
    for (const [key, src] of Object.entries(_ENV_SPRITE_SRCS)) {
      const img = new Image();
      img.onload = () => { _ENV_SPRITES[key] = img; };
      img.src = src;
    }
  }

  function loadTrainSprite() {
    const img = new Image();
    img.onload = () => { _trainSpriteImg = img; };
    img.src = TRAIN_SPRITE_SRC;
  }

  function loadLogSprite() {
    const img = new Image();
    img.onload = () => { _logSpriteImg = img; };
    img.src = LOG_SPRITE_SRC;
  }

  // Per-type config for environment sprites
  // size:  sprite scale (× CELL)
  // sw:    shadow ellipse half-width (× CELL)
  // sh:    shadow ellipse half-height (× CELL)
  // base:  ground-contact point in cell (0 = top, 1 = bottom)
  // shadowLift: raises shadow to match visible sprite base when PNG has bottom padding
  const _ENV_SPRITE_CFG = {
    bush:       { size: 0.82, sw: 0.32, sh: 0.09, base: 0.92, shadowLift: 0.14 },
    tree:       { size: 1.05, sw: 0.30, sh: 0.08, base: 0.94 },
    rock:       { size: 0.72, sw: 0.28, sh: 0.08, base: 0.90, shadowLift: 0.12 },
    rock_pile:  { size: 0.76, sw: 0.30, sh: 0.08, base: 0.83, shadowLift: 0.05 },
    stump:      { size: 0.74, sw: 0.28, sh: 0.08, base: 0.88, shadowLift: 0.04 },
    shrub:      { size: 0.82, sw: 0.32, sh: 0.09, base: 0.86, shadowLift: 0.08 },
    cactus:     { size: 0.88, sw: 0.22, sh: 0.07, base: 0.94 },
    tumbleweed: { size: 0.65, sw: 0.20, sh: 0.06, base: 0.92 },
    pine:       { size: 1.05, sw: 0.28, sh: 0.08, base: 0.94 },
    snowman:    { size: 0.80, sw: 0.22, sh: 0.07, base: 0.92 },
  };

  function drawEnvSprite(type, cx, cy, surfaceId = 'grass') {
    const img = _ENV_SPRITES[type];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const cfg    = _ENV_SPRITE_CFG[type] || { size: 0.85, sw: 0.28, sh: 0.08, base: 0.92 };
    const size   = CELL * cfg.size;
    const baseY  = cy - CELL * 0.5 + CELL * cfg.base; // ground contact
    const shadowY = baseY - CELL * (cfg.shadowLift || 0);
    const tallCaster = type === 'tree' || type === 'pine' || type === 'cactus';
    drawGroundShadow(cx, shadowY, CELL * cfg.sw * 2.15, CELL * cfg.sh * 2.7, {
      surfaceId,
      offsetX: CELL * (tallCaster ? 0.10 : 0.04),
      offsetY: CELL * 0.02,
    });
    drawPropContact(type, cx, baseY, surfaceId);
    // Sprite: image bottom sits at baseY
    ctx.drawImage(img, cx - size / 2, baseY - size, size, size);
    return true;
  }

  function init() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx    = canvas.getContext('2d');
    loadCarSprites();
    loadPlayerSprite();
    loadCoinSprite();
    loadEnvSprites();
    loadTrainSprite();
    loadLogSprite();
    loadGrassTextures();
    resize();
  }

  function getEquippedPlayerSpriteSrc() {
    let src = '/game/chars/cryptokid.png';
    if (typeof Shop !== 'undefined') {
      const equippedId = Shop.getEquipped();
      const spriteSrc  = Shop.getSprite(equippedId);
      if (spriteSrc) src = spriteSrc;
    }
    return src;
  }

  function loadPlayerSprite(src = getEquippedPlayerSpriteSrc()) {
    loadPlayerFrameSet(src);
    if (playerImg && playerImgSrc === src) return;
    if (pendingPlayerImgSrc === src) return;

    pendingPlayerImgSrc = src;
    const img = new Image();
    img.onload = () => {
      if (pendingPlayerImgSrc !== src) return;
      playerImg = img;
      playerImgSrc = src;
      pendingPlayerImgSrc = '';
    };
    img.onerror = () => {
      if (pendingPlayerImgSrc === src) pendingPlayerImgSrc = '';
      if (src !== '/game/chars/cryptokid.png') {
        loadPlayerSprite('/game/chars/cryptokid.png');
      }
    };
    img.src = src;
  }

  function loadPlayerFrameSet(src) {
    if (playerFrameSetSrc === src) return;
    playerFrameSetSrc = src;
    playerFrameSet = null;

    const def = PLAYER_SPRITE_SETS[src];
    if (!def) return;

    const frames = { ready: false, idle: null, walkA: null, walkB: null };
    const entries = Object.entries(def);
    let loaded = 0;

    entries.forEach(([key, frameSrc]) => {
      const img = new Image();
      img.onload = () => {
        loaded += 1;
        if (loaded === entries.length) frames.ready = true;
      };
      img.onerror = () => { frames.ready = false; };
      img.src = frameSrc;
      frames[key] = img;
    });

    playerFrameSet = frames;
  }

  function getPlayerFrameImage(ps, walkPhase) {
    if (!playerFrameSet || !playerFrameSet.ready) return playerImg;
    if (!ps.jumping) return playerFrameSet.idle || playerImg;
    return (Math.sin(walkPhase) >= 0 ? playerFrameSet.walkA : playerFrameSet.walkB) || playerFrameSet.idle || playerImg;
  }

  function reloadPlayerSprite() {
    loadPlayerSprite(getEquippedPlayerSpriteSrc());
  }

  function loadCoinSprite() {
    const img = new Image();
    img.onload = () => { coinImg = img; };
    img.src = '/game/coin.png';
  }

  // ── Vehicle light anchors in normalized sprite coordinates ──────────────
  // Each profile is calibrated to the actual lamp clusters of its source
  // sprite. Normalized points keep the anchors correct at every game scale
  // and avoid the old hidden half-resolution coordinate convention.
  const _lightProfile = (front, rear, beam, halo) => Object.freeze({
    front: Object.freeze(front),
    rear: Object.freeze(rear),
    beam: Object.freeze(beam),
    halo: Object.freeze(halo),
  });
  const _SEDAN_BEAM = Object.freeze({ length: 1.34, width: 0.74, offset: 0.038, alpha: 0.62 });
  const _VAN_BEAM = Object.freeze({ length: 1.48, width: 0.68, offset: 0.042, alpha: 0.64 });
  const _LONG_BEAM = Object.freeze({ length: 1.62, width: 0.64, offset: 0.046, alpha: 0.66 });
  const _COMPACT_HALO = Object.freeze({ head: 0.225, tail: 0.135, dot: 0.060 });
  const _LONG_HALO = Object.freeze({ head: 0.205, tail: 0.125, dot: 0.054 });

  const _CAR_LIGHT_PROFILES = Object.freeze({
    taxi:             _lightProfile([[0.940, 0.225], [0.940, 0.775]], [[0.075, 0.220], [0.075, 0.780]], _SEDAN_BEAM, _COMPACT_HALO),
    yellow_taxi:      _lightProfile([[0.930, 0.220], [0.930, 0.780]], [[0.075, 0.250], [0.075, 0.750]], _SEDAN_BEAM, _COMPACT_HALO),
    green_taxi:       _lightProfile([[0.940, 0.220], [0.940, 0.780]], [[0.055, 0.220], [0.055, 0.780]], _SEDAN_BEAM, _COMPACT_HALO),
    orange:           _lightProfile([[0.925, 0.210], [0.925, 0.790]], [[0.055, 0.290], [0.055, 0.710]], _SEDAN_BEAM, _COMPACT_HALO),
    police:           _lightProfile([[0.950, 0.300], [0.950, 0.700]], [[0.040, 0.200], [0.040, 0.800]], _SEDAN_BEAM, _COMPACT_HALO),
    ambulance:        _lightProfile([[0.900, 0.315], [0.900, 0.680]], [[0.040, 0.205], [0.040, 0.795]], _VAN_BEAM, _COMPACT_HALO),
    truck:            _lightProfile([[0.975, 0.215], [0.975, 0.780]], [[0.020, 0.220], [0.020, 0.780]], _LONG_BEAM, _LONG_HALO),
    bus:              _lightProfile([[0.972, 0.200], [0.972, 0.800]], [[0.022, 0.220], [0.022, 0.780]], _LONG_BEAM, _LONG_HALO),
    firetruck:        _lightProfile([[0.970, 0.255], [0.970, 0.745]], [[0.155, 0.330], [0.155, 0.660]], _LONG_BEAM, _LONG_HALO),
    black_suv:        _lightProfile([[0.890, 0.280], [0.890, 0.690]], [[0.080, 0.220], [0.080, 0.780]], _SEDAN_BEAM, _COMPACT_HALO),
    blue_hatchback:   _lightProfile([[0.860, 0.250], [0.860, 0.750]], [[0.115, 0.240], [0.115, 0.760]], _SEDAN_BEAM, _COMPACT_HALO),
    white_panel_van:  _lightProfile([[0.890, 0.330], [0.890, 0.670]], [[0.045, 0.225], [0.045, 0.775]], _VAN_BEAM, _COMPACT_HALO),
    silver_minivan:   _lightProfile([[0.855, 0.330], [0.855, 0.660]], [[0.090, 0.220], [0.090, 0.780]], _VAN_BEAM, _COMPACT_HALO),
    orange_pickup:    _lightProfile([[0.900, 0.305], [0.900, 0.680]], [[0.090, 0.220], [0.090, 0.780]], _VAN_BEAM, _COMPACT_HALO),
  });
  const _DEFAULT_CAR_LIGHT_PROFILE = _CAR_LIGHT_PROFILES.taxi;

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
    const embedded = (typeof CAR_SPRITES_B64 !== 'undefined') ? CAR_SPRITES_B64 : {};
    const external = (typeof CAR_SPRITE_SRCS !== 'undefined') ? CAR_SPRITE_SRCS : {};
    const allNames = Array.from(new Set([
      ...Object.keys(embedded),
      ...Object.keys(external),
    ]));
    let loaded = 0;
    const total = allNames.length;

    const markLoaded = () => {
      if (++loaded === total) spritesReady = true;
    };

    allNames.forEach(name => {
      const img = new Image();
      const externalSrc = external[name];
      const fallbackSrc = embedded[name];
      let triedFallback = false;

      img.onload = markLoaded;
      img.onerror = () => {
        if (!triedFallback && fallbackSrc && externalSrc) {
          triedFallback = true;
          img.src = fallbackSrc;
          return;
        }
        delete carImages[name];
        markLoaded();
      };

      img.src = externalSrc || fallbackSrc;
      carImages[name] = img;
    });
    if (total === 0) spritesReady = true;
  }

  // CSS-px view size + device pixel ratio (backing store is scaled by _dpr)
  let _viewW = 0, _viewH = 0, _dpr = 1;

  function resize() {
    if (!canvas) return;
    // Use game-container bounds on desktop, fallback to window
    const container = document.getElementById('game-container');
    const rect = container
      ? container.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    _dpr   = Math.min(window.devicePixelRatio || 1, 2); // cap: retina sharpness without 3x fill cost
    _viewW = rect.width;
    _viewH = rect.height;
    canvas.width  = Math.round(_viewW * _dpr);
    canvas.height = Math.round(_viewH * _dpr);
    canvas.style.width  = _viewW + 'px';
    canvas.style.height = _viewH + 'px';
  }

  // ── Dynamic camera zoom ───────────────────────────────────
  // 1.25x close-up below score 100, smoothstep out to 1.0x by score 300.
  // Curve is deliberately independent of World's difficulty smoothProgress
  // so camera tuning never shifts silently with balance changes.
  let _camScore     = 0;    // raw score, fed every frame via setScore()
  let _zoomCur      = 1.25; // eased zoom factor, advanced once per frame
  let _dbgZoomForce = null; // debug: non-null pins the curve to this score

  function _zoomTarget() {
    const t = Math.min(Math.max((_camScore - 100) / 200, 0), 1);
    const s = t * t * (3 - 2 * t); // smoothstep
    return 1.25 - 0.25 * s;
  }

  // Single source of truth for the world scale. The min(1,…) clamp keeps
  // desktop unchanged and never pulls back wider than the 9-column field.
  function getViewScale() {
    const worldW = COLS * CELL;
    return Math.min(1, ((_viewW || canvas.width) / worldW) * _zoomCur);
  }

  function updateCamera(dt) {
    if (!canvas) return;
    const ps = Player.getState();
    const worldY  = World.rowToY(ps.row) + CELL / 2;
    // Учитываем масштаб: видимая высота в мировых координатах = высота вью / scale
    // Ease zoom toward its score target; steps in-run are ~0.1%, the ease
    // exists for run restarts (300→0 reads as a ~1.5s dive back in)
    _zoomCur += (_zoomTarget() - _zoomCur) * Math.min(1, dt * 2);
    const scale = getViewScale();
    const visibleH = (_viewH || canvas.height) / scale;
    targetCamY = worldY - visibleH * 0.65;
    // Не показывать пустоту ниже карты: камера не должна показывать область ниже нижних рядов
    // rowToY(-12) = 12*CELL = 768, нижний край экрана = cameraY + visibleH
    // Нужно: cameraY + visibleH <= 12*CELL + CELL => cameraY <= 13*CELL - visibleH
    const maxCamY = 13 * CELL - visibleH;
    if (targetCamY > maxCamY) targetCamY = maxCamY;
    const SPEED = 8;
    cameraY += (targetCamY - cameraY) * Math.min(dt * SPEED, 1);
  }

  function draw(dt) {
    if (!canvas) return;
    const W = _viewW || canvas.width;
    const H = _viewH || canvas.height;
    _now = Date.now(); // single timestamp for all animations this frame

    // Real frame delta from the game loop; clamped, with a fallback for stray calls
    const dt_approx = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.05) : 0.016;
    const visualDt = _visualDt(dt_approx);
    _frameDt   = visualDt;
    waterTime  += visualDt;
    waveTime   += visualDt * _waveBoost(); // integrate: speed changes smoothly, phase never jumps
    sirenPhase += dt_approx;

    // Advance walk cycle — only when player is jumping/moving
    const _ps = Player.getState();
    if (_ps.jumping || _ps.onLog) walkTime += visualDt;

    // Advance weather blend; a pending swap first fades the current weather to zero
    const targetRatio = pendingWeather !== null ? 0 : (weatherState > 0 ? 1 : 0);
    weatherRatio += (targetRatio - weatherRatio) * Math.min(1, dt_approx * 0.72);
    if (weatherRatio < 0.005) weatherRatio = 0; // snap to zero — stop residual work
    if (pendingWeather !== null && weatherRatio === 0) _applyWeatherState(pendingWeather);

    // Advance rain particles (rain + storm) — biome changes what "rain" is:
    // snow biome gets slow flakes, desert gets a sideways sandstorm
    if (weatherState === 1 || weatherState === 3 || weatherRatio > 0.05) {
      initRain(weatherState === 3 ? STORM_RAIN_COUNT : RAIN_COUNT);
      const pMode = _precipBiome();
      for (const p of rainParticles) {
        if (pMode === 'snow') {
          p.y += p.speed * 0.35 * dt_approx;
          if (weatherState === 3) p.x += 0.03 * dt_approx; // blizzard drift
        } else if (pMode === 'desert') {
          p.x += p.speed * 1.1 * dt_approx;
          p.y += p.speed * 0.25 * dt_approx;
        } else {
          p.y += p.speed * dt_approx;
          // Storm: add horizontal drift
          if (weatherState === 3) p.x += 0.02 * dt_approx;
        }
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
        _boltSeed = Math.random() * 1000;
        lightningTimer = 3 + Math.random() * 5; // 3-8 sec
        // Гром с задержкой после вспышки
        if (typeof Sound !== 'undefined' && Sound.thunder) {
          setTimeout(() => Sound.thunder(), 400 + Math.random() * 800);
        }
      }
    }
    if (lightningFlash > 0) {
      lightningFlash -= dt_approx * 2; // double-flash envelope over ~0.5s
      if (lightningFlash < 0) lightningFlash = 0;
    }

    // Age and prune trails
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].age += dt_approx;
      if (trails[i].age >= trails[i].maxAge) trails.splice(i, 1);
    }

    // Advance death animation timer
    if (deathActive) {
      deathTimer += dt_approx;
    }

    // Advance screen shake
    if (shakeTimer > 0) {
      shakeTimer -= dt_approx;
      if (shakeTimer < 0) shakeTimer = 0;
    }

    // Squash & stretch — detect landing moment and advance spring timer
    const _isJumping = _ps.jumping;
    if (_wasJumping && !_isJumping) squashTimer = SQUASH_DUR;   // just landed
    if (!_wasJumping && _isJumping) {                            // just launched → spawn ring
      _ringState = { x: _ps.jumpFrom.x, y: _ps.jumpFrom.y, timer: RING_DUR };
    }
    _wasJumping = _isJumping;
    if (squashTimer > 0) {
      squashTimer -= dt_approx;
      if (squashTimer < 0) squashTimer = 0;
    }
    // Advance jump ring timer
    if (_ringState) {
      _ringState.timer -= dt_approx;
      if (_ringState.timer <= 0) _ringState = null;
    }
    // Directional, deterministic impulse: readable without random camera jitter.
    let shakeX = 0;
    let shakeY = 0;
    if (shakeTimer > 0 && shakeDuration > 0) {
      shakePhase += dt_approx * 52;
      const envelope = Math.pow(shakeTimer / shakeDuration, 2);
      const impulse = Math.sin(shakePhase) * shakePeak * envelope;
      shakeX = impulse * (shakeDirectionX || 0.35);
      shakeY = impulse * shakeDirectionY;
    }

    // Smoothly advance nightRatio toward target (0.005/frame @60fps = 0.3/s)
    const NIGHT_STEP = 0.3 * dt_approx;
    if (nightRatio < nightTarget) nightRatio = Math.min(nightRatio + NIGHT_STEP, nightTarget);
    if (nightRatio > nightTarget) nightRatio = Math.max(nightRatio - NIGHT_STEP, nightTarget);

    ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0); // all draw code below works in CSS px
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
      drawMoon(W, H, skyColor);
    }

    // Distant precipitation belongs behind the playfield, so cars, props and
    // the player retain readable silhouettes even during a storm.
    drawWeatherFar(W, H);

    const worldW = COLS * CELL;
    // Dynamic zoom: close-up early game, pulls back to full field by score 300
    const scale = getViewScale();
    const scaledW = worldW * scale;
    const offsetX = (W - scaledW) / 2;
    ctx.save();
    ctx.translate(offsetX + shakeX, shakeY);
    ctx.scale(scale, scale);
    ctx.translate(0, -cameraY);
    // Set current biome for global elements (sky)
    _currentBiomeInfo = World.getBiomeForRow(Player.getState().row);
    drawRows();
    drawPhysicalTrails();
    drawTrails();
    drawPlayer();
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

    drawSecondChanceScreen(W, H);

    // Emissive effects must be composited after the night veil — otherwise
    // headlights, coins and shields get dimmed exactly when they matter most.
    ctx.save();
    _applyWorldTransform(W);
    drawWorldEmissive();
    ctx.restore();

    // Close precipitation, fog and lightning are intentionally foreground
    // effects. This completes the depth stack without a second world pass.
    drawWeatherNear(W, H);
  }

  function drawWeatherFar(W, H) {
    if (weatherRatio <= 0.01 || weatherState === 2) return;
    if (weatherState !== 1 && weatherState !== 3) return;
    drawPrecipitationLayer(W, H, 'far');
  }

  function drawWeatherNear(W, H) {
    if (weatherRatio <= 0.01) return;
    if (weatherState === 2) drawFog(W, H);
    else if (weatherState === 1) drawPrecipitationLayer(W, H, 'near');
    else if (weatherState === 3) {
      drawPrecipitationLayer(W, H, 'near');
      drawLightning(W, H);
    } else if (weatherState === 4) drawWind(W, H);
  }

  function drawSandGrainCluster(x, y, size, alpha, seed) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.72, 0, Math.PI * 2);
    ctx.arc(x - size * (1.35 + (seed % 0.45)), y + size * 0.22, size * 0.42, 0, Math.PI * 2);
    ctx.arc(x + size * 0.95, y - size * 0.28, size * 0.30, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPrecipitationLayer(W, H, layer) {
    const intensity = Math.min(weatherRatio * 1.5, 1);
    const mode = _precipBiome();
    const split = Math.floor(rainParticles.length * 0.68);
    const start = layer === 'far' ? 0 : split;
    const end = layer === 'far' ? split : rainParticles.length;
    const near = layer === 'near';
    const scale = near ? 1.35 : 0.72;
    const sway = _now * 0.0012;

    ctx.save();
    if (mode === 'desert') {
      ctx.fillStyle = nightRatio > 0.5 ? 'rgb(160,126,76)' : 'rgb(231,197,132)';
      if (near) {
        ctx.globalAlpha = intensity * 0.05;
        ctx.beginPath();
        ctx.ellipse(W * 0.28, H * 0.34, W * 0.46, H * 0.045, -0.04, 0, Math.PI * 2);
        ctx.ellipse(W * 0.78, H * 0.64, W * 0.42, H * 0.04, -0.04, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = start; i < end; i++) {
        const p = rainParticles[i];
        const size = Math.max(0.55, (p.width || 1) * scale);
        drawSandGrainCluster(
          p.x * W,
          p.y * H,
          size,
          p.alpha * intensity * (near ? 0.72 : 0.4) * 0.78,
          i * 0.173 + p.x * 11,
        );
      }
    } else if (mode === 'snow') {
      ctx.fillStyle = 'rgb(240,248,255)';
      for (let i = start; i < end; i++) {
        const p = rainParticles[i];
        const px = (p.x + Math.sin(sway * (0.6 + p.speed) + p.x * 12) * 0.015) * W;
        const py = p.y * H;
        ctx.globalAlpha = p.alpha * intensity * (near ? 0.72 : 0.40);
        ctx.beginPath();
        ctx.arc(px, py, (p.width || 1) * scale * (weatherState === 3 ? 1.2 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = nightRatio > 0.5 ? 'rgb(150,180,255)' : 'rgb(185,215,255)';
      for (let i = start; i < end; i++) {
        const p = rainParticles[i];
        const px = p.x * W;
        const py = p.y * H;
        const len = p.len * H * scale * (weatherState === 3 ? 1.25 : 1);
        ctx.globalAlpha = p.alpha * intensity * (near ? 0.72 : 0.40);
        ctx.lineWidth = (p.width || 1) * scale;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - len * (weatherState === 3 ? 0.45 : 0.2), py + len);
        ctx.stroke();
      }
    }
    if (near && mode !== 'snow' && mode !== 'desert') {
      _drawSplashes(W, H, intensity, weatherState === 3);
    }
    ctx.restore();
  }

  function _applyWorldTransform(W) {
    const worldW = COLS * CELL;
    const scale = getViewScale();
    ctx.translate((W - worldW * scale) / 2, 0);
    ctx.scale(scale, scale);
    ctx.translate(0, -cameraY);
  }

  function _visualDt(dt) {
    return secondChanceFx && secondChanceFx.age < 0.18 ? dt * 0.45 : dt;
  }

  function drawSecondChanceScreen(W, H) {
    if (!secondChanceFx) return;
    secondChanceFx.age += _frameDt;
    if (secondChanceFx.age >= secondChanceFx.life) {
      secondChanceFx = null;
      return;
    }
    const t = secondChanceFx.age / secondChanceFx.life;
    const fade = 1 - t;
    ctx.save();
    ctx.fillStyle = `rgba(105,135,205,${fade * 0.10})`;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(155,190,255,${fade * 0.55})`;
    ctx.lineWidth = Math.max(1, 3 * fade);
    for (let ring = 0; ring < 2; ring++) {
      const radius = Math.min(W, H) * (0.10 + t * 0.28 + ring * 0.05);
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.56, radius, radius * 0.42, 0, Math.PI * 0.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
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
      const twinkle = 0.6 + 0.4 * Math.sin(_now * 0.001 + s.x * 20);
      ctx.fillStyle = `rgba(255,255,220,${alpha * twinkle * 0.9})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H * 0.5, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Moon ──────────────────────────────────────────────────
  function drawMoon(W, H, skyColor) {
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
    // Crescent shadow — must match the weather-blended sky, not the clear-sky color
    ctx.fillStyle = skyColor || dc('sky');
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.1, mr * 0.82, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRows() {
    // Viewport culling — рисуем только видимые ряды (+1 ряд запаса)
    const scale  = getViewScale();
    const visTop = cameraY - CELL;
    const visBot = cameraY + (_viewH || canvas.height) / scale + CELL;
    const rows = [...World.getRows()].sort((a, b) => b.idx - a.idx);
    // Aerial-perspective fog: rows wash out toward the fog colour with
    // distance from the player, in world space (wisps live in drawFog)
    const fogT = weatherState === 2 ? Math.min(weatherRatio * 1.2, 1) : 0;
    let fogColor = null, playerRow = 0;
    if (fogT > 0.02) {
      fogColor = lerpColor(FOG_DAY, FOG_NIGHT, nightRatio);
      playerRow = Player.getState().row;
    }
    // Wet asphalt during rain/storm (sandstorms don't wet anything)
    let wetRoadColor = null, wetRoadBlend = 0;
    if (weatherRatio > 0.05 && (weatherState === 1 || weatherState === 3) && _precipBiome() !== 'desert') {
      wetRoadColor = lerpColor('#33333e', '#12121e', nightRatio);
      wetRoadBlend = Math.min(weatherRatio, 1) * (weatherState === 3 ? 0.45 : 0.3);
    }
    for (const row of rows) {
      const y = World.rowToY(row.idx);
      if (y + CELL < visTop || y > visBot) continue;
      const bi = { biome: row.biome || 'default', nextBiome: row.nextBiome || null, blendT: row.blendT || 0 };
      if (row.type === 'grass') {
        drawGrassRow(row, y, bi);
      } else if (row.type === 'road') {
        let roadColor = row.idx % 2 === 0 ? dcBiome('road0', bi) : dcBiome('road1', bi);
        if (wetRoadColor) roadColor = lerpColor(roadColor, wetRoadColor, wetRoadBlend);
        ctx.fillStyle = roadColor;
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
        drawWaterEffect(y, row.idx);
        drawLogs(row, y, bi);
      } else if (row.type === 'train') {
        drawTrainRow(row, y);
      }
      if (fogColor) {
        // Depth cue: quadratic ramp over ~14 rows ahead; rows behind haze at half rate
        const dist  = row.idx - playerRow;
        const depth = Math.min(Math.max(dist > 0 ? dist : -dist * 0.5, 0) / 14, 1);
        ctx.globalAlpha = fogT * (0.06 + 0.58 * depth * depth);
        ctx.fillStyle = fogColor;
        ctx.fillRect(0, y, COLS * CELL, CELL);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ── Pre-rendered gradient sprites ─────────────────────────
  // Hot-path gradients (grass depth strips, coin glow, car lights) have
  // constant colours — only position/size/overall alpha vary per draw.
  // Rendering them once and blitting via drawImage avoids hundreds of
  // CanvasGradient allocations per frame (GC jank on low-end mobile).
  // Variable brightness is applied through ctx.globalAlpha, which scales
  // all stops linearly — visually identical to baking alpha into stops.
  let _fxSprites = null;
  function _fxS() {
    if (_fxSprites) return _fxSprites;
    const mk = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      return c;
    };
    // 64px radial sprite; innerFrac = inner radius as a fraction of the outer
    const radial = (innerFrac, stops) => mk(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 32 * innerFrac, 32, 32, 32);
      for (const [p, col] of stops) grd.addColorStop(p, col);
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
    const vStrip = (h, stops) => mk(COLS * CELL, h, (g, w) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      for (const [p, col] of stops) grd.addColorStop(p, col);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
    const headlightBeam = mk(192, 96, (g) => {
      const grd = g.createLinearGradient(0, 48, 192, 48);
      grd.addColorStop(0, 'rgba(255,236,178,0.15)');
      grd.addColorStop(0.30, 'rgba(255,231,164,0.07)');
      grd.addColorStop(1, 'rgba(255,226,150,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(0, 40);
      g.lineTo(192, 4);
      g.lineTo(192, 92);
      g.lineTo(0, 56);
      g.closePath();
      g.fill();
    });
    _fxSprites = {
      grassTop: vStrip(Math.ceil(CELL * 0.18), [[0, 'rgba(0,0,0,0.18)'], [1, 'rgba(0,0,0,0)']]),
      grassBot: vStrip(Math.ceil(CELL * 0.15), [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.05)']]),
      coinGlow: radial(0.08 / 0.70, [[0, 'rgba(80,150,255,1)'], [0.45, 'rgba(0,82,255,0.5)'], [1, 'rgba(0,40,220,0)']]),
      hlGlow:   radial(0, [[0, 'rgba(255,238,180,0.55)'], [0.15, 'rgba(255,238,180,0.3)'], [0.4, 'rgba(255,235,170,0.1)'], [1, 'rgba(255,235,170,0)']]),
      hlDot:    radial(0, [[0, 'rgba(255,252,235,1)'], [0.5, 'rgba(255,245,200,0.5)'], [1, 'rgba(255,240,180,0)']]),
      hlBeam:   headlightBeam,
      tlGlow:   radial(0, [[0, 'rgba(255,25,15,0.55)'], [0.3, 'rgba(255,15,10,0.2)'], [1, 'rgba(255,0,0,0)']]),
      tlDot:    radial(0, [[0, 'rgba(255,60,40,0.95)'], [0.6, 'rgba(255,30,20,0.4)'], [1, 'rgba(255,0,0,0)']]),
    };
    return _fxSprites;
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
    _drawSurfaceTexture(row, y);

    // ── Crossy Road 3D depth: top shadow + bottom highlight (cached sprites) ──
    const fxs = _fxS();
    ctx.drawImage(fxs.grassTop, 0, y, COLS * CELL, CELL * 0.18);
    ctx.drawImage(fxs.grassBot, 0, y + CELL * 0.85, COLS * CELL, CELL * 0.15);

    // Coins
    if (row.coins) {
      const t = _now / 600;
      const size = CELL * 0.72;
      for (const coin of row.coins) {
        if (coin.collected) continue;
        const cx = coin.col * CELL + CELL / 2;
        const cy = y + CELL / 2;
        const bob    = Math.sin(t + coin.col * 1.3) * CELL * 0.07;
        const scaleX = Math.abs(Math.cos(t * 0.9 + coin.col * 0.7));
        const drawW  = size * Math.max(scaleX, 0.08);
        drawGroundShadow(cx, cy + size * 0.46, drawW * 0.96, CELL * 0.12, {
          surfaceId: _surfaceForRow(row).id,
          alpha: 0.16,
          offsetX: CELL * 0.02,
          offsetY: 0,
        });
        ctx.save();
        ctx.translate(cx, cy + bob);

        // Glow — radial gradient beneath coin sprite.
        // Alpha scales with scaleX (face-factor): no glow when coin is edge-on.
        // Slow breathing pulse (~2.5s period) offset per column so coins don't sync.
        const glowPulse = 0.17 + 0.11 * Math.sin(t * 1.5 + coin.col * 2.1);
        const glowAlpha = glowPulse * scaleX;   // scaleX: 1=face-on, 0=edge-on
        if (glowAlpha > 0.015) {
          const gR = size * 0.70;
          // Cached sprite, squished vertically — matches isometric shadow below
          ctx.globalAlpha = glowAlpha;
          ctx.drawImage(_fxS().coinGlow, -gR, -gR * 0.72, gR * 2, gR * 1.44);
          ctx.globalAlpha = 1;
        }

        if (coinImg) {
          // Спрайт пользователя — spinning эффект через scaleX
          ctx.drawImage(coinImg, -drawW / 2, -size / 2, drawW, size);
        } else {
          // Fallback: нарисованная монета
          ctx.fillStyle = '#0052FF';
          ctx.beginPath();
          ctx.ellipse(0, 0, drawW / 2, size / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Decorations — wind/storm sway
    if (row.decorations) {
      const decorationSurfaceId = _surfaceForRow(row).id;
      const windSway = (weatherState === 4 || weatherState === 3) && weatherRatio > 0.1
        ? Math.sin(_now * 0.003 + y * 0.05) * weatherRatio * (weatherState === 3 ? 4 : 3)
        : 0;
      for (const d of row.decorations) {
        const cx = d.col * CELL + CELL / 2;
        const cy = y + CELL / 2;
        const swayX = d.type === 'rock' || d.type === 'snowman' ? 0 : windSway;
        const spriteCx = d.type === 'bush'       ? cx + swayX
                       : d.type === 'tree'       ? cx + swayX * 1.5
                       : d.type === 'cactus'     ? cx + swayX * 0.5
                       : d.type === 'tumbleweed' ? cx + swayX * 2
                       : d.type === 'pine'       ? cx + swayX * 1.2
                       : cx;
        if (!drawEnvSprite(d.type, spriteCx, cy, decorationSurfaceId)) {
          if      (d.type === 'bush')       drawBush(spriteCx, cy, bi, decorationSurfaceId);
          else if (d.type === 'tree')       drawTree(spriteCx, cy, bi, decorationSurfaceId);
          else if (d.type === 'rock')       drawRock(cx, cy, bi, decorationSurfaceId);
          else if (d.type === 'cactus')     drawCactus(spriteCx, cy, bi, decorationSurfaceId);
          else if (d.type === 'tumbleweed') drawTumbleweed(spriteCx, cy, bi, decorationSurfaceId);
          else if (d.type === 'pine')       drawPine(spriteCx, cy, bi, decorationSurfaceId);
          else if (d.type === 'snowman')    drawSnowman(cx, cy, bi, decorationSurfaceId);
        }
      }
    }
  }

  // ── Bush: round dark-green blob ────────────────────────────
  function drawBush(cx, cy, bi, surfaceId) {
    const r = CELL * 0.3;
    drawGroundShadow(cx, cy + r * 0.9, r * 1.8, r * 0.56, { surfaceId, offsetX: CELL * 0.04, offsetY: 0 });
    drawPropContact('bush', cx, cy + r * 0.9, surfaceId);
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
  function drawTree(cx, cy, bi, surfaceId) {
    const r = CELL * 0.32;
    drawGroundShadow(cx, cy + r * 0.7, r * 1.9, r * 0.60, { surfaceId, offsetX: CELL * 0.10, offsetY: CELL * 0.02 });
    drawPropContact('tree', cx, cy + r * 0.7, surfaceId);
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
  function drawRock(cx, cy, bi, surfaceId) {
    const rw = CELL * 0.3, rh = CELL * 0.22;
    drawGroundShadow(cx, cy + rh * 0.9, rw * 1.8, rh * 0.70, { surfaceId, offsetX: CELL * 0.03, offsetY: 0 });
    drawPropContact('rock', cx, cy + rh * 0.9, surfaceId);
    ctx.fillStyle = dcBiome('rockDk', bi);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Cactus: tall green column with arms (desert) ────────────
  function drawCactus(cx, cy, bi, surfaceId) {
    const h = CELL * 0.6, w = CELL * 0.12;
    drawGroundShadow(cx, cy + h * 0.35, w * 5, h * 0.22, { surfaceId, offsetX: CELL * 0.10, offsetY: CELL * 0.02 });
    drawPropContact('cactus', cx, cy + h * 0.35, surfaceId);
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
  function drawTumbleweed(cx, cy, bi, surfaceId) {
    const r = CELL * 0.2;
    drawGroundShadow(cx, cy + r * 0.7, r * 1.7, r * 0.50, { surfaceId, offsetX: CELL * 0.05, offsetY: 0 });
    drawPropContact('tumbleweed', cx, cy + r * 0.7, surfaceId);
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
  function drawPine(cx, cy, bi, surfaceId) {
    const h = CELL * 0.55, w = CELL * 0.38;
    drawGroundShadow(cx, cy + h * 0.35, w * 1.2, h * 0.16, { surfaceId, offsetX: CELL * 0.10, offsetY: CELL * 0.02 });
    drawPropContact('pine', cx, cy + h * 0.35, surfaceId);
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
  function drawSnowman(cx, cy, bi, surfaceId) {
    drawGroundShadow(cx, cy + CELL * 0.22, CELL * 0.44, CELL * 0.12, { surfaceId, offsetX: CELL * 0.03, offsetY: 0 });
    drawPropContact('snowman', cx, cy + CELL * 0.22, surfaceId);
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

  function drawVehicleContact(row, rowY, car) {
    if (_surfaceForRow(row).id !== 'wetRoad') return;
    const direction = Math.sign(car.speed || 1);
    const rearX = direction > 0 ? car.x + car.width * 0.18 : car.x + car.width * 0.82;
    const wheelY = rowY + CELL * 0.68;
    ctx.save();
    ctx.strokeStyle = 'rgba(175,210,232,0.26)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const spread = CELL * (0.04 + i * 0.025);
      ctx.globalAlpha = 0.28 - i * 0.06;
      ctx.beginPath();
      ctx.moveTo(rearX, wheelY + (i - 1) * CELL * 0.06);
      ctx.lineTo(rearX - direction * CELL * 0.30, wheelY + (i - 1) * spread);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCars(row, rowY) {
    for (let carI = 0; carI < row.obstacles.length; carI++) {
      const car = row.obstacles[carI];
      const x = car.x;
      const y = rowY + (CELL - car.height) / 2;

      drawGroundShadow(x + car.width / 2, y + car.height * 0.91, car.width * 0.94, car.height * 0.40, {
        surfaceId: _surfaceForRow(row).id,
        offsetX: car.width * 0.035,
        offsetY: car.height * 0.025,
      });
      drawVehicleContact(row, rowY, car);

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

    }
  }

  function _lightPointToCanvas(point, facingRight, x, y, width, height) {
    return {
      x: x + (facingRight ? point[0] : 1 - point[0]) * width,
      y: y + point[1] * height,
    };
  }

  function drawCarLights(row, rowY, car) {
    const isSiren = car.isSirenCar === true;
    if (nightRatio <= 0.15 && !isSiren) return;

    const x = car.x;
    const y = rowY + (CELL - car.height) / 2;
    const spriteName = isSiren
      ? 'police_siren'
      : (car.spriteKey || getSpriteName(row.idx * 7 + (car.spriteSlot || 0)));
    const imageKey = spriteName === 'police_siren' ? 'police' : spriteName;
    const facingRight = car.speed > 0;
    const direction = facingRight ? 1 : -1;
    const profile = _CAR_LIGHT_PROFILES[imageKey] || _DEFAULT_CAR_LIGHT_PROFILE;
    const frontLights = profile.front.map(point => _lightPointToCanvas(point, facingRight, x, y, car.width, car.height));
    const rearLights = profile.rear.map(point => _lightPointToCanvas(point, facingRight, x, y, car.width, car.height));
    const fxs = _fxS();
    const alpha = Math.max(nightRatio * 0.85, isSiren ? 0.35 : 0);

    ctx.save();
    if (nightRatio > 0.15 && frontLights.length >= 2) {
      const beamMidX = (frontLights[0].x + frontLights[1].x) / 2;
      const beamMidY = (frontLights[0].y + frontLights[1].y) / 2;
      const beamOriginX = beamMidX + direction * car.width * profile.beam.offset;
      const beamLength = CELL * profile.beam.length;
      const beamWidth = CELL * profile.beam.width;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha * profile.beam.alpha;
      ctx.save();
      ctx.translate(beamOriginX, beamMidY);
      ctx.scale(direction, 1);
      ctx.drawImage(fxs.hlBeam, 0, -beamWidth / 2, beamLength, beamWidth);
      ctx.restore();

      ctx.globalAlpha = alpha;
      for (const point of frontLights) {
        const glowR = CELL * profile.halo.head;
        const dotR = Math.max(1.5, car.height * profile.halo.dot);
        ctx.drawImage(fxs.hlGlow, point.x - glowR, point.y - glowR, glowR * 2, glowR * 2);
        ctx.drawImage(fxs.hlDot, point.x - dotR, point.y - dotR, dotR * 2, dotR * 2);
      }

      if (_surfaceForRow(row).id === 'wetRoad') {
        ctx.fillStyle = 'rgb(255,235,180)';
        ctx.globalAlpha = alpha * 0.055 * Math.min(weatherRatio, 1);
        for (const point of frontLights) {
          ctx.beginPath();
          ctx.ellipse(point.x, point.y + CELL * 0.075, CELL * 0.018, CELL * 0.070, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (nightRatio > 0.15) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha;
      for (const point of rearLights) {
        const glowR = CELL * profile.halo.tail;
        const dotR = Math.max(1.2, car.height * profile.halo.dot * 0.58);
        ctx.drawImage(fxs.tlGlow, point.x - glowR, point.y - glowR, glowR * 2, glowR * 2);
        ctx.drawImage(fxs.tlDot, point.x - dotR, point.y - dotR, dotR * 2, dotR * 2);
      }
    }

    if (isSiren) {
      const blink = Math.sin(sirenPhase * Math.PI * 6) > 0;
      const NW = 192, NH = 92;
      const sirenSx = car.width / NW;
      const sirenSy = car.height / NH;
      const red = { x: 77, y: 24, w: 8, h: 16 };
      const blue = { x: 77, y: 50, w: 8, h: 16 };
      const nativeX = (light) => facingRight ? light.x : (NW - light.x - light.w);
      const drawLight = (light, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(x + nativeX(light) * sirenSx, y + light.y * sirenSy, light.w * sirenSx, light.h * sirenSy);
      };
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      drawLight(red, `rgba(255,20,20,${blink ? 0.95 : 0.12})`);
      drawLight(blue, `rgba(20,100,255,${blink ? 0.12 : 0.95})`);
      ctx.fillStyle = blink ? 'rgba(255,20,20,0.06)' : 'rgba(20,100,255,0.06)';
      ctx.fillRect(x, y, car.width, car.height);
    }
    ctx.restore();
  }

  function drawWorldEmissive() {
    const scale = getViewScale();
    const visTop = cameraY - CELL;
    const visBot = cameraY + (_viewH || canvas.height) / scale + CELL;
    for (const row of World.getRows()) {
      if (row.type !== 'road') continue;
      const y = World.rowToY(row.idx);
      if (y + CELL < visTop || y > visBot) continue;
      for (const car of row.obstacles) drawCarLights(row, y, car);
    }
    if (lightningFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(lightningFlash, 1) * 0.12;
      ctx.fillStyle = '#C9D8FF';
      ctx.fillRect(0, cameraY, COLS * CELL, (_viewH || canvas.height) / scale);
      ctx.restore();
    }
    drawShieldBursts(_frameDt);
    drawCoinEffects(_frameDt);
    drawScoreEffects(_frameDt);
  }

  const CAR_COLORS = ['#E53935','#1E88E5','#43A047','#FB8C00','#8E24AA','#00ACC1'];

  // Weather-dependent wave boost: rain 1.2x, storm 1.8x, wind 1.3x.
  // Feeds wave amplitude AND the waveTime clock rate. Never multiply an
  // absolute time by this — the phase would jump by waterTime*Δboost per
  // frame whenever weatherRatio ramps (waves visibly thrash during fades).
  function _waveBoost() {
    let v = 0;
    if (weatherState === 1) v = 1.2;
    else if (weatherState === 3) v = 1.8;
    else if (weatherState === 4) v = 1.3;
    return 1 + Math.min(weatherRatio, 1) * v;
  }

  function drawWaterEffect(rowY, rowIdx) {
    const W   = COLS * CELL;
    const wt  = waterTime; // constant clock — glints/shimmer
    const wvt = waveTime;  // weather-integrated clock — wave phase
    const salt = ((rowIdx || 0) * 137) % W; // per-row offset — no vertical glint columns

    const wBoost = _waveBoost(); // amplitude only; speed boost lives in waveTime
    const waveStep  = 4;

    const allWaves = [
      { yOff: 10, amp: 3.5 * wBoost, freq: 0.045, speed: 0.9,  alpha: 0.22, h: 3 },
      { yOff: 36, amp: 4   * wBoost, freq: 0.038, speed: 0.75, alpha: 0.20, h: 3 },
      { yOff: 22, amp: 2.5 * wBoost, freq: 0.055, speed: -0.6, alpha: 0.15, h: 2.5 },
      { yOff: 50, amp: 2   * wBoost, freq: 0.06,  speed: -0.5, alpha: 0.13, h: 2 },
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
        const waveY = baseY + Math.sin(x * w.freq + wvt * w.speed) * w.amp;
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
        const flicker = 0.3 + 0.7 * Math.abs(Math.sin(wt * 2.5 + g.x + salt));
        if (flicker > 0.6) {
          ctx.globalAlpha = flicker * (nightRatio > 0.3 ? 0.7 : 0.5);
          ctx.fillRect((g.x + salt) % W, rowY + g.yo, 2, 2);
        }
      }
      // Moonlight shimmer on water at night
      if (nightRatio > 0.3) {
        const moonGlints = [
          {x: W * 0.7,  yo: 25}, {x: W * 0.75, yo: 35},
          {x: W * 0.82, yo: 18},
        ];
        for (const mg of moonGlints) {
          const shimmer = 0.5 + 0.5 * Math.sin(wt * 1.8 + (mg.x + salt) * 0.1);
          ctx.globalAlpha = shimmer * nightRatio * 0.4;
          ctx.fillStyle = 'rgba(200,220,255,1)';
          ctx.fillRect((mg.x + salt) % W, rowY + mg.yo, 3, 1.5);
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
        const cycle = wt * 0.9 + i / rippleCount + (rowIdx || 0) * 0.37;
        const phase = cycle % 1;                       // 0→1 жизненный цикл
        const seed  = Math.floor(cycle);               // новая позиция на каждый цикл
        const hx = Math.abs(Math.sin(seed * 12.9898 + i * 78.233)) % 1;
        const hy = Math.abs(Math.sin(seed * 39.3468 + i * 11.135)) % 1;
        const rx = hx * W;
        const ry = rowY + 10 + hy * 45;
        const rr = 1 + phase * 6;                      // расширяется
        ctx.globalAlpha = ripAlpha * (1 - phase);      // и тает
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr * 1.6, rr * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawLogWake(log, rowY) {
    const dir = Math.sign(log.speed || 1);
    const centerX = log.x + log.width / 2;
    const waterY = rowY + CELL * 0.53;
    const pulse = 0.85 + Math.sin(waterTime * 2 + log.x * 0.01) * 0.15;
    ctx.save();
    ctx.strokeStyle = 'rgba(210,242,255,0.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(centerX + dir * log.width * 0.34, waterY, CELL * 0.13 * pulse, CELL * 0.045, 0, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(centerX - dir * log.width * 0.38, waterY - CELL * 0.05);
    ctx.lineTo(centerX - dir * log.width * 0.62, waterY);
    ctx.lineTo(centerX - dir * log.width * 0.38, waterY + CELL * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  function drawLogs(row, rowY, bi) {
    for (const log of row.obstacles) {
      const x = log.x;
      // Лёгкое покачивание на воде + тень — бревно "сидит" в воде, а не парит
      const bob = Math.sin(waterTime * 2 + log.x * 0.01) * 1.5;
      const y = rowY + (CELL - log.height) / 2 + bob;
      drawGroundShadow(x + log.width / 2, rowY + CELL * 0.80, log.width * 0.96, CELL * 0.18, {
        surfaceId: 'water',
        alpha: 0.22,
        offsetX: log.speed > 0 ? 3 : -3,
        offsetY: 1,
      });
      drawLogWake(log, rowY);
      if (_logSpriteImg && _logSpriteImg.complete && _logSpriteImg.naturalWidth) {
        ctx.drawImage(_logSpriteImg, x, y, log.width, log.height);
        continue;
      }

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

  // Which precipitation style the current biome gets (dominant side of a blend)
  function _precipBiome() {
    const bi = _currentBiomeInfo;
    return (bi.blendT > 0.5 && bi.nextBiome) ? bi.nextBiome : bi.biome;
  }

  // Splash pool — short-lived ground rings where raindrops land
  const SPLASH_MAX = 18;
  let _splashes = [];

  function _drawSplashes(W, H, intensity, isStorm) {
    const cap = isStorm ? SPLASH_MAX : 10;
    if (_splashes.length < cap && Math.random() < intensity * (isStorm ? 0.9 : 0.6)) {
      const n = isStorm ? 2 : 1;
      for (let i = 0; i < n && _splashes.length < cap; i++) {
        _splashes.push({
          x: Math.random(),
          y: 0.45 + Math.random() * 0.53, // lower half — reads as "ground near the player"
          t: 0,
          life: 0.18 + Math.random() * 0.1,
        });
      }
    }
    ctx.strokeStyle = 'rgb(200,225,255)';
    ctx.lineWidth = 1;
    for (let i = _splashes.length - 1; i >= 0; i--) {
      const s = _splashes[i];
      s.t += _frameDt;
      if (s.t >= s.life) { _splashes.splice(i, 1); continue; }
      const k = s.t / s.life;
      const r = 1.5 + k * 4;
      ctx.globalAlpha = (1 - k) * 0.55 * intensity;
      ctx.beginPath();
      // Flattened expanding upper arc — a splash ring seen from above
      ctx.ellipse(s.x * W, s.y * H, r, r * 0.45, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Fog colours match the fog weatherSky values so distant rows wash into the sky
  const FOG_DAY   = '#c8cfd8';
  const FOG_NIGHT = '#0a0e1a';
  let _fogSprites = null; // [day, night] pre-rendered blobs — no per-frame gradient allocs

  function _makeFogSprite(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0,    color + 'cc');
    grd.addColorStop(0.55, color + '66');
    grd.addColorStop(1,    color + '00');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  // Deterministic blob field: fractions of screen size
  const FOG_BLOBS = Array.from({ length: 9 }, (_, i) => {
    const rnd = (k) => Math.abs(Math.sin(i * 37.7 + k * 91.3)) % 1;
    return {
      x0:    rnd(1),
      y0:    rnd(2),
      r:     0.22 + rnd(3) * 0.28,
      speed: 0.05 + rnd(4) * 0.12,
      phase: rnd(5) * Math.PI * 2,
      alpha: 0.10 + rnd(6) * 0.10,
    };
  });

  function drawFog(W, H) {
    const fogT = Math.min(weatherRatio * 1.2, 1);
    if (fogT < 0.01) return;
    if (!_fogSprites) _fogSprites = [_makeFogSprite(FOG_DAY), _makeFogSprite(FOG_NIGHT)];
    ctx.save();

    // Thin uniform veil; the depth gradient lives in drawRows' per-row tint
    ctx.fillStyle = lerpColor(FOG_DAY, FOG_NIGHT, nightRatio);
    ctx.globalAlpha = fogT * 0.06;
    ctx.fillRect(0, 0, W, H);

    // Soft blobs parallaxed against the camera (0.4) so fog drifts past
    // as the player advances instead of sticking to the screen
    const time = _now * 0.0001;
    for (const b of FOG_BLOBS) {
      const r    = b.r * W;
      const span = H + r * 2;
      const sy = (((b.y0 * span - cameraY * 0.4) % span) + span) % span - r;
      const sx = (b.x0 + Math.sin(time * (1 + b.speed * 8) + b.phase) * 0.08) * W;
      const breath = 0.75 + 0.25 * Math.sin(time * 2.3 + b.phase * 3);
      const a = fogT * b.alpha * breath;
      if (a < 0.01) continue;
      if (nightRatio < 0.999) {
        ctx.globalAlpha = a * (1 - nightRatio);
        ctx.drawImage(_fogSprites[0], sx - r, sy - r, r * 2, r * 2);
      }
      if (nightRatio > 0.001) {
        ctx.globalAlpha = a * nightRatio;
        ctx.drawImage(_fogSprites[1], sx - r, sy - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawLightning(W, H) {
    if (lightningFlash <= 0) return;
    ctx.save();
    const t = 1 - lightningFlash; // 0→1 за время вспышки
    // Двойная вспышка: яркий пик → провал → тусклое эхо
    const env = t < 0.22 ? (1 - t / 0.22 * 0.85)
              : t < 0.34 ? 0.15
              : t < 0.75 ? 0.55 * (1 - (t - 0.34) / 0.41)
              : 0;
    if (env > 0.01) {
      ctx.fillStyle = `rgba(220,230,255,${env * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Зигзаг молнии — только в первый пик
    if (t < 0.22) {
      const rnd = (i) => Math.abs(Math.sin(_boltSeed + i * 127.1)) % 1;
      let bx = W * (0.2 + rnd(0) * 0.6);
      let by = 0;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - t / 0.22) * 0.9})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const segs = 6;
      for (let i = 1; i <= segs; i++) {
        bx += (rnd(i) - 0.5) * W * 0.16;
        by = (H * 0.6) * (i / segs);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWind(W, H) {
    const intensity = Math.min(weatherRatio * 1.5, 1);
    if (intensity < 0.05) return;
    ctx.save();

    const isNight = nightRatio > 0.5;
    const isDesert = _precipBiome() === 'desert';
    if (isDesert) {
      ctx.fillStyle = isNight ? 'rgb(160,126,76)' : 'rgb(231,197,132)';
      for (let i = 0; i < windParticles.length; i++) {
        const p = windParticles[i];
        drawSandGrainCluster(
          p.x * W,
          p.y * H,
          Math.max(0.5, p.len * W * 0.035),
          p.alpha * intensity * 1.7,
          i * 0.271 + p.y * 9,
        );
      }
    } else {
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
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }


  // ── Landing Trails ───────────────────────────────────────
  function _addEquippedCosmeticTrail(x, y) {
    const variant = (typeof Shop !== 'undefined' && Shop.getEquippedTrail)
                      ? Shop.getEquippedTrail()
                      : 'default';
    if (!variant || variant === 'default') return;

    // Custom trail — pre-compute particle burst so it doesn't jitter
    // Strip 'trail_' prefix so type matches the draw-branch keys ('hearts', 'fire', …)
    const shortType = variant.replace(/^trail_/, '');
    trails.push({
      x, y,
      age:       0,
      maxAge:    TRAIL_LIFE[shortType] || 0.85,
      type:      shortType,
      seed:      Math.random(),
      particles: _makeTrailParticles(shortType),
    });
  }

  function addLandingEffect(x, y, rowIdx) {
    const row = World.getRow(rowIdx);
    const surface = _surfaceForRow(row || { idx: rowIdx, type: 'grass' });
    const preset = GameVfx.getLanding(surface.id);
    physicalFxPool.spawn({
      event: 'land',
      surfaceId: surface.id,
      kind: preset.kind,
      x,
      y,
      age: 0,
      life: preset.life,
      count: preset.count,
      seed: Math.random(),
    }, 'contact');
    _addEquippedCosmeticTrail(x, y);
  }

  // Compatibility for older callers. New gameplay calls addLandingEffect with
  // a row id so desert and snow rows cannot inherit grass behavior.
  function addTrail(x, y) {
    addLandingEffect(x, y, Player.getState().row);
  }

  function drawPhysicalTrails() {
    const items = physicalFxPool.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const fx = items[i];
      fx.age += _frameDt;
      if (fx.age >= fx.life) {
        physicalFxPool.releaseAt(i);
        continue;
      }

      const t = fx.age / fx.life;
      const fade = 1 - t;
      const surface = GameVfx.getSurface(fx.surfaceId);
      ctx.save();

      if (fx.kind === 'grass') {
        ctx.globalAlpha = fade * 0.34;
        ctx.fillStyle = surface.mark;
        ctx.beginPath();
        ctx.ellipse(fx.x - CELL * 0.09, fx.y + CELL * 0.07, CELL * 0.055, CELL * 0.11, 0.28, 0, Math.PI * 2);
        ctx.ellipse(fx.x + CELL * 0.09, fx.y - CELL * 0.06, CELL * 0.055, CELL * 0.11, -0.28, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.kind === 'sand' || fx.kind === 'roadDust' || fx.kind === 'ballast') {
        ctx.globalAlpha = fade * (fx.kind === 'sand' ? 0.42 : 0.25);
        ctx.fillStyle = surface.mark;
        for (let p = 0; p < fx.count; p++) {
          const angle = fx.seed * 8 + p * 2.399;
          const dist = CELL * t * (0.08 + p * 0.012);
          const radius = CELL * (0.025 + (p % 3) * 0.008) * fade;
          ctx.beginPath();
          ctx.arc(fx.x + Math.cos(angle) * dist, fx.y + Math.sin(angle) * dist * 0.42 - t * CELL * 0.06, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.kind === 'snow') {
        ctx.globalAlpha = Math.min(0.38, fade * 0.52);
        ctx.fillStyle = surface.mark;
        ctx.beginPath();
        ctx.ellipse(fx.x, fx.y + CELL * 0.05, CELL * 0.14, CELL * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(245,250,255,0.9)';
        for (let p = 0; p < fx.count; p++) {
          const angle = fx.seed * 6 + p * 2.1;
          const dist = CELL * t * (0.08 + p * 0.01);
          ctx.beginPath();
          ctx.arc(fx.x + Math.cos(angle) * dist, fx.y + Math.sin(angle) * dist * 0.35 - t * CELL * 0.08, CELL * 0.018 * fade, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.kind === 'splash' || fx.kind === 'ripple') {
        ctx.strokeStyle = fx.surfaceId === 'water' ? 'rgba(215,244,255,0.9)' : 'rgba(190,220,240,0.8)';
        ctx.lineWidth = Math.max(0.8, 2 * fade);
        for (let ring = 0; ring < 2; ring++) {
          const rt = Math.max(0, t - ring * 0.16);
          if (rt === 0) continue;
          const rx = CELL * (0.12 + rt * 0.42);
          ctx.globalAlpha = fade * (ring === 0 ? 0.65 : 0.35);
          ctx.beginPath();
          ctx.ellipse(fx.x, fx.y + CELL * 0.05, rx, rx * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // Pre-generate randomized particles for a custom trail variant.
  // Each particle has world-relative offset (dx,dy), velocity, and per-variant fields.
  function _makeTrailParticles(variant) {
    const parts = [];
    const rnd = (min, max) => min + Math.random() * (max - min);

    if (variant === 'sparkle') {
      for (let i = 0; i < 6; i++) {
        parts.push({
          dx: rnd(-0.25, 0.25) * CELL,
          dy: rnd(-0.12, 0.12) * CELL,
          vx: rnd(-0.15, 0.15) * CELL,
          vy: rnd(-0.45, -0.15) * CELL,
          size: rnd(0.06, 0.11) * CELL,
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (variant === 'fire') {
      for (let i = 0; i < 7; i++) {
        parts.push({
          dx: rnd(-0.18, 0.18) * CELL,
          dy: rnd(-0.08, 0.08) * CELL,
          vx: rnd(-0.1, 0.1) * CELL,
          vy: rnd(-0.55, -0.3) * CELL,
          size: rnd(0.09, 0.16) * CELL,
        });
      }
    } else if (variant === 'hearts') {
      for (let i = 0; i < 4; i++) {
        parts.push({
          dx: rnd(-0.22, 0.22) * CELL,
          dy: rnd(-0.1, 0.08) * CELL,
          vx: rnd(-0.08, 0.08) * CELL,
          vy: rnd(-0.35, -0.2) * CELL,
          size: rnd(0.1, 0.14) * CELL,
          tilt: rnd(-0.4, 0.4),
        });
      }
    } else if (variant === 'coins') {
      for (let i = 0; i < 4; i++) {
        parts.push({
          dx: rnd(-0.2, 0.2) * CELL,
          dy: rnd(-0.08, 0.08) * CELL,
          vx: rnd(-0.12, 0.12) * CELL,
          vy: rnd(-0.5, -0.3) * CELL,
          size: rnd(0.11, 0.15) * CELL,
          phase: Math.random() * Math.PI * 2,
          spin:  rnd(4, 10) * (Math.random() < 0.5 ? -1 : 1),
        });
      }
    } else if (variant === 'rainbow') {
      for (let i = 0; i < RAINBOW_COLORS.length; i++) {
        const a = (i / RAINBOW_COLORS.length) * Math.PI * 2 + rnd(-0.25, 0.25);
        parts.push({
          dx: Math.cos(a) * CELL * 0.12,
          dy: Math.sin(a) * CELL * 0.08 - CELL * 0.02,
          vx: Math.cos(a) * CELL * 0.22,
          vy: Math.sin(a) * CELL * 0.10 - CELL * 0.2,
          size: CELL * 0.09,
          color: RAINBOW_COLORS[i],
        });
      }
    }
    return parts;
  }

  // Draw a small filled heart (centered on origin, given halfSize)
  function _drawHeart(cx, cy, s, tilt) {
    ctx.save();
    ctx.translate(cx, cy);
    if (tilt) ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(s * 1.1, -s * 0.45, s * 0.55, -s * 1.15, 0, -s * 0.4);
    ctx.bezierCurveTo(-s * 0.55, -s * 1.15, -s * 1.1, -s * 0.45, 0, s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw a 4-point sparkle (centered on origin)
  function _drawSparkle(cx, cy, s, phase) {
    const tw = 0.5 + 0.5 * Math.abs(Math.sin(phase));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -s * tw);
    ctx.lineTo(s * 0.2, -s * 0.2);
    ctx.lineTo(s * tw, 0);
    ctx.lineTo(s * 0.2, s * 0.2);
    ctx.lineTo(0, s * tw);
    ctx.lineTo(-s * 0.2, s * 0.2);
    ctx.lineTo(-s * tw, 0);
    ctx.lineTo(-s * 0.2, -s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTrails() {
    ctx.save();
    for (const t of trails) {
      const progress = t.age / t.maxAge;       // 0 → 1
      const fade     = 1 - progress;

      if (t.type === 'footprint') {
        // Grass: two dark oval footprints, shrink + fade
        ctx.globalAlpha = fade * 0.35;
        ctx.fillStyle   = '#1a3a0a';
        const size = CELL * 0.13 * (1 - progress * 0.3);
        ctx.beginPath();
        ctx.ellipse(t.x - CELL * 0.1, t.y + CELL * 0.08, size * 0.5, size * 0.85, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(t.x + CELL * 0.1, t.y - CELL * 0.08, size * 0.5, size * 0.85, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      else if (t.type === 'dust') {
        // Road / train: light dust puff that expands upward and dissipates
        ctx.globalAlpha = fade * 0.55;
        // Brighten at night so it's visible against dark asphalt
        ctx.fillStyle = nightRatio > 0.5 ? 'rgba(220,225,240,1)' : 'rgba(245,245,235,1)';
        const rise   = -progress * CELL * 0.18;
        const baseR  = CELL * 0.11 * (0.6 + progress * 1.1);   // expands
        const offX   = (t.seed - 0.5) * CELL * 0.05;
        // Three overlapping puffs for a soft cloud shape
        ctx.beginPath();
        ctx.arc(t.x - CELL * 0.09 + offX, t.y + rise + CELL * 0.03, baseR * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(t.x + CELL * 0.10 + offX, t.y + rise - CELL * 0.02, baseR * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(t.x + offX,                t.y + rise - CELL * 0.08, baseR * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      else if (t.type === 'ripple') {
        // Water / log: expanding ellipse ring
        ctx.globalAlpha = fade * 0.7;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth   = 2;
        const rx = CELL * 0.14 + progress * CELL * 0.38;
        const ry = rx * 0.45;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + CELL * 0.05, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        // A faint inner ring for depth
        if (progress > 0.15) {
          ctx.globalAlpha = fade * 0.35;
          const rx2 = CELL * 0.08 + (progress - 0.15) * CELL * 0.28;
          ctx.beginPath();
          ctx.ellipse(t.x, t.y + CELL * 0.05, rx2, rx2 * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // ↓↓↓ CUSTOM SHOP TRAILS ↓↓↓
      else if (t.type === 'sparkle') {
        // Golden twinkling stars that rise and fade
        if (!t.particles) continue;
        const tAge = t.age;
        for (const p of t.particles) {
          const px = t.x + p.dx + p.vx * tAge;
          const py = t.y + p.dy + p.vy * tAge + CELL * 0.4 * tAge * tAge; // slight gravity
          const twinkle = 0.6 + 0.4 * Math.abs(Math.sin(p.phase + tAge * 9));
          ctx.globalAlpha = fade * 0.95 * twinkle;
          ctx.fillStyle   = '#FFE25E';
          _drawSparkle(px, py, p.size, p.phase + tAge * 9);
          // Bright core
          ctx.globalAlpha = fade * 0.7 * twinkle;
          ctx.fillStyle   = '#FFF6C2';
          ctx.beginPath();
          ctx.arc(px, py, p.size * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      else if (t.type === 'fire') {
        // Flame puffs — color shifts red → orange → yellow over life
        if (!t.particles) continue;
        const tAge = t.age;
        for (const p of t.particles) {
          const px = t.x + p.dx + p.vx * tAge;
          const py = t.y + p.dy + p.vy * tAge;
          // Color interpolation
          let color;
          if      (progress < 0.33) color = '#FFE15E';
          else if (progress < 0.66) color = '#FF8A1F';
          else                      color = '#D13A1F';
          ctx.globalAlpha = fade * 0.8;
          ctx.fillStyle   = color;
          const size = p.size * (1 - progress * 0.5);
          ctx.beginPath();
          // Teardrop-ish flame: circle with slight vertical stretch
          ctx.ellipse(px, py, size * 0.85, size * 1.15, 0, 0, Math.PI * 2);
          ctx.fill();
          // Bright inner core
          ctx.globalAlpha = fade * 0.6;
          ctx.fillStyle   = '#FFEFA0';
          ctx.beginPath();
          ctx.arc(px, py + size * 0.1, size * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      else if (t.type === 'hearts') {
        // Pink/red hearts floating up
        if (!t.particles) continue;
        const tAge = t.age;
        for (const p of t.particles) {
          const px = t.x + p.dx + p.vx * tAge;
          const py = t.y + p.dy + p.vy * tAge;
          // Soft wobble
          const wobble = Math.sin(tAge * 6 + p.dx) * CELL * 0.02;
          ctx.globalAlpha = fade * 0.9;
          ctx.fillStyle   = '#FF4D7A';
          _drawHeart(px + wobble, py, p.size, p.tilt);
          // Highlight
          ctx.globalAlpha = fade * 0.5;
          ctx.fillStyle   = '#FFC6D6';
          ctx.beginPath();
          ctx.arc(px + wobble - p.size * 0.25, py - p.size * 0.45, p.size * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      else if (t.type === 'coins') {
        // Small spinning gold coins
        if (!t.particles) continue;
        const tAge = t.age;
        for (const p of t.particles) {
          const px = t.x + p.dx + p.vx * tAge;
          const py = t.y + p.dy + p.vy * tAge + CELL * 0.5 * tAge * tAge; // gravity pulls down
          // Spin: horizontal squash for edge-on effect
          const squash = Math.abs(Math.cos(p.phase + tAge * p.spin));
          const w = p.size * (0.15 + squash * 0.85);
          ctx.globalAlpha = fade * 0.95;
          // Outer ring
          ctx.fillStyle = '#C48A10';
          ctx.beginPath();
          ctx.ellipse(px, py, w, p.size, 0, 0, Math.PI * 2);
          ctx.fill();
          // Face
          ctx.fillStyle = '#FFD740';
          ctx.beginPath();
          ctx.ellipse(px, py, w * 0.78, p.size * 0.82, 0, 0, Math.PI * 2);
          ctx.fill();
          // Highlight shine
          ctx.globalAlpha = fade * 0.55;
          ctx.fillStyle = '#FFF2B0';
          ctx.beginPath();
          ctx.ellipse(px - w * 0.25, py - p.size * 0.25, w * 0.18, p.size * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      else if (t.type === 'rainbow') {
        // Six colored circles spraying in arc
        if (!t.particles) continue;
        const tAge = t.age;
        for (const p of t.particles) {
          const px = t.x + p.dx + p.vx * tAge;
          const py = t.y + p.dy + p.vy * tAge + CELL * 0.6 * tAge * tAge; // gravity
          ctx.globalAlpha = fade * 0.9;
          ctx.fillStyle   = p.color;
          ctx.beginPath();
          ctx.arc(px, py, p.size * (1 - progress * 0.3), 0, Math.PI * 2);
          ctx.fill();
          // White highlight
          ctx.globalAlpha = fade * 0.45;
          ctx.fillStyle   = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px - p.size * 0.25, py - p.size * 0.25, p.size * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
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

    // Track-side signals preserve the rail silhouette and show entry direction.
    if (row.warning) {
      const blink = Math.sin(row.warningTimer * Math.PI * 8) > 0;
      if (blink) {
        const entryX = row.dir > 0 ? CELL * 0.38 : W - CELL * 0.38;
        ctx.fillStyle = 'rgba(255,45,30,0.18)';
        ctx.fillRect(0, y + CELL * 0.16, W, CELL * 0.08);
        ctx.fillRect(0, y + CELL * 0.70, W, CELL * 0.08);
        ctx.fillStyle = '#FF493D';
        ctx.beginPath();
        ctx.arc(entryX, y + CELL * 0.28, CELL * 0.085, 0, Math.PI * 2);
        ctx.arc(entryX, y + CELL * 0.72, CELL * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,210,170,0.9)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const x = entryX + row.dir * CELL * (0.18 + i * 0.12);
          ctx.beginPath();
          ctx.moveTo(x - row.dir * CELL * 0.06, y + CELL * 0.40);
          ctx.lineTo(x, y + CELL * 0.50);
          ctx.lineTo(x - row.dir * CELL * 0.06, y + CELL * 0.60);
          ctx.stroke();
        }
      }
    }

    // Draw train wagons
    for (const train of row.obstacles) {
      drawTrain(train, y, row.dir);
    }
  }

  function drawTrain(train, rowY, dir) {
    if (drawTrainSprite(train, rowY, dir)) return;
    drawTrainFallback(train, rowY, dir);
  }

  function drawTrainContact(train, rowY, dir) {
    const phase = Math.sin(_now * 0.035 + train.x * 0.02);
    const contactY = rowY + CELL * 0.74;
    ctx.save();
    ctx.strokeStyle = 'rgba(205,190,170,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(train.x, contactY + phase);
    ctx.lineTo(train.x + train.width, contactY - phase);
    ctx.stroke();
    if (Math.abs(phase) > 0.96) {
      const sparkX = dir > 0 ? train.x + train.width * 0.78 : train.x + train.width * 0.22;
      ctx.strokeStyle = 'rgba(255,208,120,0.52)';
      ctx.beginPath();
      ctx.moveTo(sparkX, contactY);
      ctx.lineTo(sparkX - dir * CELL * 0.10, contactY - CELL * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrainSprite(train, rowY, dir) {
    if (!_trainSpriteImg || !_trainSpriteImg.complete || !_trainSpriteImg.naturalWidth) return false;

    const CELL = World.CELL;
    const drawW = train.width;
    const drawH = Math.min(CELL * 0.92, train.height * 1.08);
    const centerX = train.x + train.width / 2;
    const centerY = rowY + CELL / 2;

    ctx.save();
    drawGroundShadow(centerX, centerY + drawH * 0.14, drawW * 0.98, drawH * 0.56, {
      surfaceId: 'railBed',
      offsetX: dir * CELL * 0.05,
      offsetY: CELL * 0.02,
    });
    drawTrainContact(train, rowY, dir);

    ctx.translate(centerX, centerY);
    ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.drawImage(_trainSpriteImg, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    return true;
  }

  function drawTrainFallback(train, rowY, dir) {
    const CELL   = World.CELL;
    const CARS   = 4;
    const carW   = CELL * 2;
    const carH   = train.height;
    const gap    = CELL * 0.08;
    const totalW = train.width;
    const y      = rowY + (CELL - carH) / 2;

    drawGroundShadow(train.x + totalW / 2, rowY + CELL * 0.60, totalW * 0.98, carH * 0.56, {
      surfaceId: 'railBed',
      offsetX: dir * CELL * 0.05,
      offsetY: CELL * 0.02,
    });
    drawTrainContact(train, rowY, dir);

    for (let i = 0; i < CARS; i++) {
      // Draw from front to back based on direction
      const carIdx = dir > 0 ? i : (CARS - 1 - i);
      const cx     = train.x + carIdx * (carW + gap);

      // Wagon body
      const isEngine = (dir > 0 && carIdx === CARS - 1) || (dir < 0 && carIdx === 0);
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
    const t = deathTimer / DEATH_DUR;
    drawPhysicalDeath(t);
    const pack = typeof Shop !== 'undefined' && Shop.getEquippedDeath
      ? Shop.getEquippedDeath()
      : 'default';
    if (pack === 'death_comic') drawDeathComic(dt);
    else if (pack === 'death_pixel') drawDeathPixel(dt);
    else if (pack === 'death_dramatic') drawDeathDramatic(dt);
  }

  function drawPhysicalDeath(t) {
    if (deathType === 'water') {
      for (let i = 0; i < 3; i++) {
        const rt = Math.max(0, t - i * 0.14);
        if (rt === 0) continue;
        ctx.strokeStyle = `rgba(180,228,255,${Math.max(0, 0.55 - rt * 0.65)})`;
        ctx.lineWidth = Math.max(0.8, 2.4 * (1 - rt));
        ctx.beginPath();
        ctx.ellipse(deathX, deathY, CELL * (0.2 + rt), CELL * (0.07 + rt * 0.34), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    const train = deathType === 'train';
    const count = train ? 10 : 6;
    const surface = GameVfx.getSurface(deathSurfaceId);
    ctx.fillStyle = train ? '#FFD8A0' : surface.mark;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399 + deathDirection * 0.45;
      const distance = CELL * t * (train ? 1.15 : 0.72);
      ctx.globalAlpha = Math.max(0, 1 - t * 1.25);
      ctx.beginPath();
      ctx.arc(
        deathX + Math.cos(angle) * distance + deathDirection * distance * 0.45,
        deathY + Math.sin(angle) * distance * 0.45,
        CELL * 0.025,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDeathComic(dt) {
    const t = deathTimer / DEATH_DUR;

    // Comic squish flash (car) or bubble pop (water)
    if (t < 0.3) {
      const ft = t / 0.3;
      const alpha = (1 - ft) * 0.9;
      if (deathType !== 'water') {
        // Yellow star-burst flash
        ctx.save();
        ctx.translate(deathX, deathY);
        ctx.globalAlpha = alpha;
        const spikes = 8;
        const outer = CELL * (0.5 + ft * 1.0);
        const inner = outer * 0.45;
        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const angle = (i * Math.PI) / spikes - Math.PI / 2;
          const r = i % 2 === 0 ? outer : inner;
          i === 0 ? ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r)
                  : ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // Blue bubble
        const r = CELL * (0.3 + ft * 0.9);
        const grd = ctx.createRadialGradient(deathX, deathY - r * 0.2, r * 0.1, deathX, deathY, r);
        grd.addColorStop(0, `rgba(200,240,255,${alpha * 0.9})`);
        grd.addColorStop(0.7, `rgba(100,200,255,${alpha * 0.4})`);
        grd.addColorStop(1, `rgba(100,200,255,0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(deathX, deathY, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Bouncy particles (circle, with extra vertical bounce)
    for (const p of deathParticles) {
      const age   = deathTimer / p.life;
      if (age > 1) continue;
      const bounce = Math.abs(Math.sin(age * Math.PI * 2.5)) * (1 - age) * CELL * 0.3;
      const alpha  = Math.max(0, 1 - age * 1.2);
      const px     = p.x + p.vx * deathTimer;
      const py     = p.y + p.vy * deathTimer + 0.5 * p.gravity * deathTimer * deathTimer - bounce;
      const size   = p.size * (1 - age * 0.4) * (1 + Math.sin(age * Math.PI) * 0.3);
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(px, py, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Comic stars fly off (car death) — 4 spinning ★ symbols
    if (deathType !== 'water' && t < 0.85) {
      const starOffsets = [[1.2, -1.0], [-1.3, -0.8], [0.7, 1.1], [-0.9, 1.2]];
      starOffsets.forEach(([ox, oy], i) => {
        const delay = i * 0.08;
        const st    = Math.max(0, (t - delay));
        if (st <= 0) return;
        const a = Math.max(0, 1 - st * 1.1);
        const sx = deathX + ox * CELL * st * 1.5;
        const sy = deathY + oy * CELL * st * 1.5;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(st * Math.PI * 3);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#FFE600';
        ctx.font = `${CELL * 0.45}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', 0, 0);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }

    // Water: floating bubbles rise up
    if (deathType === 'water' && t < 0.8) {
      const bubbleData = [[0, 0], [-0.5, -0.3], [0.5, -0.2], [-0.3, 0.4], [0.4, 0.3]];
      bubbleData.forEach(([ox, oy], i) => {
        const delay = i * 0.1;
        const bt    = Math.max(0, (t - delay));
        if (bt <= 0) return;
        const a = Math.max(0, 1 - bt * 1.2);
        const bx = deathX + ox * CELL + Math.sin(bt * 5 + i) * CELL * 0.15;
        const by = deathY + oy * CELL - bt * CELL * 1.4;
        const r  = CELL * (0.12 + i * 0.04) * (1 - bt * 0.5);
        ctx.globalAlpha = a * 0.75;
        ctx.strokeStyle = 'rgba(150,220,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.stroke();
        // Highlight
        ctx.fillStyle = 'rgba(220,245,255,0.5)';
        ctx.beginPath();
        ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
  }

  function drawDeathPixel(dt) {
    const t = deathTimer / DEATH_DUR;

    if (deathType !== 'water') {
      // Pixelated flash grid
      if (t < 0.25) {
        const ft = t / 0.25;
        const gridSize = Math.floor(CELL * 0.22);
        const cols = 5, rows = 5;
        ctx.globalAlpha = (1 - ft) * 0.85;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const hue = (r * cols + c) * 25;
            ctx.fillStyle = `hsl(${hue},100%,65%)`;
            ctx.fillRect(
              deathX - (cols / 2) * gridSize + c * gridSize,
              deathY - (rows / 2) * gridSize + r * gridSize,
              gridSize - 1, gridSize - 1
            );
          }
        }
        ctx.globalAlpha = 1;
      }

      // Square pixel particles
      for (const p of deathParticles) {
        const age   = deathTimer / p.life;
        if (age > 1) continue;
        const alpha = Math.max(0, 1 - age);
        const px    = p.x + p.vx * deathTimer;
        const py    = p.y + p.vy * deathTimer + 0.5 * p.gravity * deathTimer * deathTimer;
        const size  = p.size * (1 - age * 0.3);
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = p.color;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

    } else {
      // Water: pixel vortex — squares spiral inward then dissolve outward
      const phase = t < 0.5 ? 'vortex' : 'dissolve';
      const pt    = phase === 'vortex' ? t / 0.5 : (t - 0.5) / 0.5;

      // Square pixel particles
      for (const p of deathParticles) {
        const age   = deathTimer / p.life;
        if (age > 1) continue;
        const alpha = Math.max(0, 1 - age);
        const px    = p.x + p.vx * deathTimer;
        const py    = p.y + p.vy * deathTimer + 0.5 * p.gravity * deathTimer * deathTimer;
        const size  = p.size * (1 - age * 0.3);
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = p.color;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // Vortex ring
      if (phase === 'vortex') {
        const numDots = 10;
        const radius  = CELL * (0.5 + pt * 0.4);
        for (let i = 0; i < numDots; i++) {
          const angle = (i / numDots) * Math.PI * 2 + pt * Math.PI * 4;
          const dx = Math.cos(angle) * radius;
          const dy = Math.sin(angle) * radius * 0.4;
          const a  = (1 - pt) * 0.8;
          const sz = CELL * 0.1;
          ctx.globalAlpha = a;
          ctx.fillStyle = '#4FC3F7';
          ctx.fillRect(deathX + dx - sz / 2, deathY + dy - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
      }

      // Dissolve: random pixel scatter fade
      if (phase === 'dissolve') {
        for (let i = 0; i < 12; i++) {
          const seed = i * 137.508;
          const angle = seed % (Math.PI * 2);
          const dist  = CELL * (0.3 + (seed % 1.0) * 1.0);
          const px    = deathX + Math.cos(angle) * dist * pt;
          const py    = deathY + Math.sin(angle) * dist * pt;
          const a     = Math.max(0, 1 - pt * 1.2);
          const sz    = CELL * 0.12;
          ctx.globalAlpha = a;
          ctx.fillStyle = i % 2 === 0 ? '#4FC3F7' : '#B3E5FC';
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawDeathDramatic(dt) {
    const t = deathTimer / DEATH_DUR;

    if (deathType !== 'water') {
      // Spin-away: large arc flash then body spins up and away
      if (t < 0.4) {
        const ft = t / 0.4;
        const alpha = (1 - ft) * 0.9;
        const radius = CELL * (0.3 + ft * 2.0);
        const grd = ctx.createRadialGradient(deathX, deathY, 0, deathX, deathY, radius);
        grd.addColorStop(0,   `rgba(255,255,255,${alpha})`);
        grd.addColorStop(0.3, `rgba(255,80,0,${alpha * 0.8})`);
        grd.addColorStop(1,   `rgba(255,0,0,0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(deathX, deathY, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Slow dramatic particles — bigger, linger longer
      for (const p of deathParticles) {
        const age   = deathTimer / p.life;
        if (age > 1) continue;
        const alpha = Math.max(0, 1 - age * 0.7);
        const px    = p.x + p.vx * deathTimer;
        const py    = p.y + p.vy * deathTimer + 0.5 * p.gravity * deathTimer * deathTimer;
        const size  = p.size * (1 - age * 0.2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(px, py, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Final flash-out at end
      if (t > 0.75) {
        const ft = (t - 0.75) / 0.25;
        ctx.globalAlpha = ft * 0.5;
        ctx.fillStyle = '#fff';
        ctx.fillRect(deathX - CELL * 2, deathY - CELL * 2, CELL * 4, CELL * 4);
        ctx.globalAlpha = 1;
      }

    } else {
      // Water: slow sink with heavy ripples
      // Slow dramatic particles
      for (const p of deathParticles) {
        const age   = deathTimer / p.life;
        if (age > 1) continue;
        const alpha = Math.max(0, 1 - age * 0.7);
        const px    = p.x + p.vx * deathTimer;
        const py    = p.y + p.vy * deathTimer + 0.5 * p.gravity * deathTimer * deathTimer;
        const size  = p.size * (1 - age * 0.2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(px, py, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Heavy slow ripples
      for (let i = 0; i < 4; i++) {
        const delay = i * 0.15;
        const rt    = Math.max(0, (t - delay));
        if (rt <= 0) continue;
        const rtN = Math.min(rt / (1 - delay), 1);
        const r   = CELL * (0.2 + rtN * 1.5);
        const a   = (1 - rtN) * 0.65;
        const lw  = 3 * (1 - rtN) + 1;
        ctx.strokeStyle = `rgba(80,180,255,${a})`;
        ctx.lineWidth   = lw;
        ctx.beginPath();
        ctx.ellipse(deathX, deathY, r, r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sinking dark vignette overlay
      if (t > 0.5) {
        const st = (t - 0.5) / 0.5;
        const r  = CELL * 1.5;
        const grd = ctx.createRadialGradient(deathX, deathY, 0, deathX, deathY, r);
        grd.addColorStop(0,   `rgba(0,20,60,${st * 0.7})`);
        grd.addColorStop(1,   `rgba(0,20,60,0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(deathX, deathY, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function emitGameEffect(event, payload) {
    if (event === 'coinPickup') coinEffects.push({ ...payload, age: 0 });
    else if (event === 'scoreTick') scoreEffects.push({ ...payload, age: 0 });
    else if (event === 'magnetPull') magnetCoins.push({ ...payload, age: 0 });
    else if (event === 'shieldHit') shieldBursts.push({ ...payload, age: 0 });
  }

  function addCoinEffect(x, y, value = 1) {
    emitGameEffect('coinPickup', { x, y, value });
  }

  function addScoreEffect(x, y) {
    emitGameEffect('scoreTick', { x, y });
  }

  function addMagnetCoin(fromX, fromY, toX, toY, col, rowIdx, value = 1) {
    emitGameEffect('magnetPull', { fromX, fromY, toX, toY, col, rowIdx, value });
  }

  function addShieldBurst(x, y) {
    emitGameEffect('shieldHit', { x, y, direction: 0 });
    secondChanceFx = { x, y, age: 0, life: 0.42 };
  }

  function drawMagnetCoins(dt) {
    for (let i = magnetCoins.length - 1; i >= 0; i--) {
      const m = magnetCoins[i];
      m.age += dt;
      if (m.age >= MAGNET_DUR) {
        magnetCoins.splice(i, 1);
        addCoinEffect(m.toX, m.toY, m.value || 1);
        continue;
      }
      const t = m.age / MAGNET_DUR;
      // Ease-in curve for acceleration feel
      const eased = t * t;
      const x = m.fromX + (m.toX - m.fromX) * eased;
      const y = m.fromY + (m.toY - m.fromY) * eased;
      // Arc upward slightly
      const arc = -CELL * 0.5 * Math.sin(t * Math.PI);
      const size = CELL * 0.72;
      const scale = 1 - t * 0.3; // shrink slightly as it flies

      ctx.save();
      ctx.globalAlpha = 0.42 * (1 - t);
      ctx.strokeStyle = 'rgba(76,205,255,0.72)';
      ctx.lineWidth = Math.max(1, CELL * 0.032 * (1 - t * 0.35));
      ctx.beginPath();
      ctx.moveTo(m.fromX, m.fromY);
      ctx.quadraticCurveTo((m.fromX + m.toX) / 2, (m.fromY + m.toY) / 2 - CELL * 0.44, x, y + arc);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.translate(x, y + arc);
      if (coinImg) {
        const drawSize = size * scale;
        ctx.drawImage(coinImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      } else {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, 0, size * scale * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawShieldBursts(dt) {
    for (let i = shieldBursts.length - 1; i >= 0; i--) {
      const b = shieldBursts[i];
      b.age += dt;
      if (b.age >= SHIELD_BURST_DUR) { shieldBursts.splice(i, 1); continue; }
      const t = b.age / SHIELD_BURST_DUR;
      const ease = 1 - Math.pow(1 - t, 3);
      const alpha = 1 - t;
      const impactX = b.x + (b.direction || 0) * CELL * 0.08;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(120,164,255,0.82)';
      ctx.lineWidth = Math.max(1, CELL * 0.055 * (1 - t));
      ctx.beginPath();
      ctx.ellipse(impactX, b.y, CELL * (0.38 + ease * 1.08), CELL * (0.18 + ease * 0.42), 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let fracture = 0; fracture < 3; fracture++) {
        const angle = -0.7 + fracture * 0.7 + (b.direction || 0) * 0.25;
        const length = CELL * (0.18 + fracture * 0.04) * (1 - t);
        ctx.globalAlpha = alpha * 0.68;
        ctx.beginPath();
        ctx.moveTo(impactX, b.y - CELL * 0.08);
        ctx.lineTo(impactX + Math.cos(angle) * length, b.y - CELL * 0.08 + Math.sin(angle) * length);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawCoinEffects(dt) {
    drawMagnetCoins(dt);
    for (let i = coinEffects.length - 1; i >= 0; i--) {
      const e = coinEffects[i];
      e.age += dt;
      if (e.age >= COIN_EFFECT_DUR) { coinEffects.splice(i, 1); continue; }
      const t = e.age / COIN_EFFECT_DUR;
      const alpha = 1 - t;
      const rise  = CELL * 0.9 * t;
      ctx.save();
      ctx.globalAlpha = alpha;
      const value = e.value || 1;
      const isDouble = value > 1;
      ctx.fillStyle   = isDouble ? '#FFE86A' : '#FFD700';
      ctx.strokeStyle = isDouble ? '#5B3B00' : '#7A5800';
      ctx.lineWidth   = 1.25;
      ctx.font = `700 ${Math.round(CELL * (isDouble ? 0.34 : 0.29))}px ${GAME_FX_FONT}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(`+${value}`, e.x, e.y - rise);
      ctx.fillText  (`+${value}`, e.x, e.y - rise);
      if (isDouble && t < 0.45) {
        const arcFade = 1 - t / 0.45;
        ctx.strokeStyle = `rgba(255,224,92,${arcFade * 0.75})`;
        ctx.lineWidth = 1.5;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(e.x + side * CELL * 0.16, e.y - rise, CELL * 0.11, side < 0 ? -1.2 : 1.95, side < 0 ? 1.2 : 4.35);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawScoreEffects(dt) {
    for (let i = scoreEffects.length - 1; i >= 0; i--) {
      const e = scoreEffects[i];
      e.age += dt;
      if (e.age >= SCORE_EFFECT_DUR) { scoreEffects.splice(i, 1); continue; }
      const t     = e.age / SCORE_EFFECT_DUR;
      // Ease-out rise: fast start, slow finish
      const rise  = CELL * 1.3 * (1 - Math.pow(1 - t, 2));
      // Fade: stays opaque until halfway, then fades
      const alpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
      ctx.save();
      ctx.globalAlpha  = alpha * 0.72;
      ctx.font         = `700 ${Math.round(CELL * 0.23)}px ${GAME_FX_FONT}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const py = e.y - rise - CELL * 0.5;   // starts above player head
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth   = 3;
      ctx.strokeText('+1', e.x, py);
      ctx.fillStyle   = '#FFFFFF';
      ctx.fillText  ('+1', e.x, py);
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (typeof currentState !== 'undefined' && currentState === GameState.MENU) return;
    if (deathActive && deathTimer > 0.05) return;

    // ── Jump ring — expanding shadow ripple at launch origin ──
    if (_ringState) {
      const progress = 1 - _ringState.timer / RING_DUR;   // 0→1 as ring expands
      const alpha    = (1 - progress) * 0.30;             // fades out linearly
      const rW       = CELL * (0.28 + progress * 0.55);   // expands from shadow width
      const rH       = rW * 0.32;                         // isometric aspect ratio (= shadow ratio)
      const lw       = Math.max(0.5, 2.5 * (1 - progress)); // stroke thins as it grows
      ctx.save();
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.lineWidth   = lw;
      ctx.beginPath();
      ctx.ellipse(_ringState.x, _ringState.y + CELL * 0.2, rW, rH, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const ps   = Player.getState();
    const x    = ps.visualX;
    const y    = ps.visualY;
    const fd   = ps.facingDir;
    const flip = fd === -1 ? -1 : 1;
    const playerJumpT = ps.jumping ? Math.min(ps.jumpTimer / 0.16, 1) : 0;
    const playerLift = ps.jumping ? Math.sin(Math.PI * playerJumpT) : 0;
    const playerRow = World.getRow(ps.row);
    drawGroundShadow(x, y + CELL * 0.22, CELL * (0.58 - playerLift * 0.18), CELL * (0.20 - playerLift * 0.05), {
      surfaceId: _surfaceForRow(playerRow).id,
      lift: playerLift,
      offsetX: CELL * 0.04,
      offsetY: CELL * 0.015,
    });

    // ── Sprite-based render ───────────────────────────────
    if (playerImg) {
      const WALK_FREQ = 9;
      const walkPhase = walkTime * WALK_FREQ * Math.PI * 2;
      const jumpArc   = playerLift * CELL * 0.18;
      const bobY = ps.jumping ? Math.abs(Math.sin(walkPhase)) * CELL * 0.025 : 0;
      const baseY = y - jumpArc;

      const size = CELL * 1.5;

      // ── Squash & stretch ──────────────────────────────────
      let sqX = 1, sqY = 1;
      if (ps.jumping) {
        const jt = Math.min(ps.jumpTimer / 0.16, 1);
        if (jt < 0.25) {
          // Launch: stretch tall, narrow — character springs off ground
          const a = SQUASH_PEAK * (1 - jt / 0.25);
          sqY = 1 + a;  sqX = 1 - a * 0.45;
        } else if (jt > 0.72) {
          // Pre-land: squash wide, short — anticipates impact
          const a = SQUASH_PEAK * ((jt - 0.72) / 0.28);
          sqY = 1 - a;  sqX = 1 + a * 0.5;
        }
      } else if (squashTimer > 0) {
        // Post-landing damped spring: squash → overshoot stretch → settle
        const phase = 1 - squashTimer / SQUASH_DUR;           // 0→1
        const a = SQUASH_PEAK * Math.exp(-phase * 5) * Math.cos(phase * Math.PI * 2.5);
        sqY = 1 - a;  sqX = 1 + a * 0.5;
      }

      // ── Idle breath — only when fully grounded, no active squash ──
      let idleBobY = 0;
      if (!ps.jumping && squashTimer <= 0) {
        const s = Math.sin(_now * 0.0018);   // period ~3.5s
        idleBobY = s * CELL * 0.022;               // ±~1.5px vertical float
        sqY *= 1 + s * 0.018;                      // synced scale: taller at top, shorter at bottom
        sqX *= 1 - s * 0.008;                      // opposing X (volume conservation)
      }

      // Мигание при инвизе (щит активен)
      const invincible = Player.isInvincible();
      const blinkAlpha = invincible ? (Math.sin(_now / 80) > 0 ? 1.0 : 0.15) : 1.0;
      ctx.save();
      ctx.globalAlpha = blinkAlpha;
      ctx.translate(x, baseY + bobY + idleBobY);
      ctx.scale(flip * sqX, sqY);
      ctx.drawImage(getPlayerFrameImage(ps, walkPhase), -size / 2, -size * 0.72, size, size);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    // ── Fallback: procedural render ───────────────────────

    // Squash & stretch (reuse sqX/sqY from sprite block above if already set,
    // otherwise compute here for the rare case sprite isn't loaded yet)
    let sqXp = 1, sqYp = 1;
    if (ps.jumping) {
      const jt = Math.min(ps.jumpTimer / 0.16, 1);
      if (jt < 0.25)      { const a = SQUASH_PEAK*(1-jt/0.25);         sqYp=1+a; sqXp=1-a*0.45; }
      else if (jt > 0.72) { const a = SQUASH_PEAK*((jt-0.72)/0.28);   sqYp=1-a; sqXp=1+a*0.5;  }
    } else if (squashTimer > 0) {
      const phase = 1 - squashTimer/SQUASH_DUR;
      const a = SQUASH_PEAK * Math.exp(-phase*5) * Math.cos(phase*Math.PI*2.5);
      sqYp=1-a; sqXp=1+a*0.5;
    }

    // Idle breath for procedural fallback
    let idleBobYp = 0;
    if (!ps.jumping && squashTimer <= 0) {
      const s = Math.sin(_now * 0.0018);
      idleBobYp = s * CELL * 0.022;
      sqYp *= 1 + s * 0.018;
      sqXp *= 1 - s * 0.008;
    }

    // ── Walk cycle parameters ──────────────────────────────
    // walkPhase drives all limb swings (0→2π per step cycle)
    const WALK_FREQ  = 9;    // cycles per second
    const walkPhase  = walkTime * WALK_FREQ * Math.PI * 2;
    const swing      = ps.jumping ? Math.sin(walkPhase) : 0;      // ±1 limb swing
    const bodyBob    = ps.jumping ? Math.abs(Math.sin(walkPhase)) * CELL * 0.025 : 0;
    const jumpArc    = playerLift * CELL * 0.18;  // body lift during jump arc

    const baseY = y - jumpArc + idleBobYp;  // whole character lifts during jump / idle

    // Apply squash & stretch — scale around foot anchor, all coords below unchanged
    const _sqAnchorY = y + CELL * 0.2;
    ctx.save();
    ctx.translate(x, _sqAnchorY);
    ctx.scale(sqXp, sqYp);
    ctx.translate(-x, -_sqAnchorY);

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

    ctx.restore();         // head tilt restore
    ctx.restore();         // squash & stretch restore
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

  function stopDeath() {
    deathActive = false;
    deathTimer = 0;
    deathFxPool.clear();
    trails.length = 0;
  }
  function resetWeather() { _lastWeatherScore = -1; weatherState = 0; pendingWeather = null; weatherRatio = 0; lightningFlash = 0; lightningTimer = 4; }
  // Debug: force a specific weather state (0=clear,1=rain,2=fog,3=storm,4=windy)
  function _dbgWeather(state) { pendingWeather = null; weatherState = state; weatherRatio = 0; if (state===3) { rainInitDone=false; initRain(STORM_RAIN_COUNT); } else if (state===1) { rainInitDone=false; initRain(RAIN_COUNT); } }
  let _dbgNightForce = null;
  function _dbgNight(on) { _dbgNightForce = on; nightTarget = on ? 1 : 0; _nightOn = on; }
  // Pin the zoom curve to an arbitrary "score" (null = back to real score)
  function _dbgZoom(score) { _dbgZoomForce = (typeof score === 'number') ? score : null; }
  return { init, resize, updateCamera, draw, setScore, setWeather, triggerDeath, triggerShake, isDying, deathDone, stopDeath, resetWeather, addTrail, addLandingEffect, addCoinEffect, addScoreEffect, addMagnetCoin, addShieldBurst, reloadPlayerSprite, _dbgWeather, _dbgNight, _dbgZoom };

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
    loadout:  document.getElementById('screen-loadout'),
    runcomplete: document.getElementById('screen-loadout'),
    lb:       document.getElementById('screen-lb'),
    ci:       document.getElementById('screen-ci'),
    shop:     document.getElementById('screen-shop'),
    profile:  document.getElementById('screen-profile'),
    quests:   document.getElementById('screen-quests'),
    spin:     document.getElementById('screen-spin'),
    settings: document.getElementById('screen-settings'),
  };

  const hud       = document.getElementById('hud');
  const scoreVal  = document.getElementById('score-val');
  const bestVal   = document.getElementById('best-val');
  // ===== Показать нужный экран =====
  // Screens where music plays
  const MUSIC_SCREENS = new Set(['menu','loadout','profile','lb','shop','quests','spin','ci','settings']);
  const HUB_SCREENS = new Set(['menu', 'shop', 'quests', 'lb', 'profile']);

  function _updateHubNavigation(name) {
    const nav = document.getElementById('runner-hub-nav');
    if (!nav) return;
    nav.classList.toggle('hidden', !HUB_SCREENS.has(name));
    nav.querySelectorAll('[data-hub-screen]').forEach((button) => {
      const isCurrent = button.dataset.hubScreen === name;
      button.classList.toggle('tab-current', isCurrent);
      if (isCurrent) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function show(name) {
    if (name !== 'ci') _stopCiTimer();
    // Stop menu banner interval when leaving menu
    if (name !== 'menu' && _menuCiInterval) { clearInterval(_menuCiInterval); _menuCiInterval = null; }
    Object.values(SCREENS).forEach(s => { if (s) s.classList.add('hidden'); });
    if (hud) hud.classList.add('hidden');
    _updateHubNavigation(name);

    // Music: play on UI screens, pause during gameplay / gameover
    if (typeof Music !== 'undefined') {
      if (MUSIC_SCREENS.has(name)) Music.play();
      else                         Music.pause();
    }

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

    // Quest badge on menu button
    if (name === 'menu') {
      const qBtn = document.getElementById('btn-quests');
      if (qBtn) {
        if (typeof Quests !== 'undefined' && Quests.hasClaimable()) {
          qBtn.classList.add('quest-badge');
        } else {
          qBtn.classList.remove('quest-badge');
        }
      }
      // Update daily spin banner visibility
      if (typeof DailySpin !== 'undefined') DailySpin.updateBanner();
      if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
      _updateCiBanner();
      // Tick the banner every second while on menu
      if (_menuCiInterval) clearInterval(_menuCiInterval);
      _menuCiInterval = setInterval(_updateCiBanner, 1000);
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

  function renderRunComplete(snapshot) {
    if (!snapshot) return;
    const goScore = document.getElementById('go-score');
    const goBest  = document.getElementById('go-best');
    const recordLabel = document.getElementById('go-record-label');
    const recordState = document.getElementById('go-record-state');
    if (goScore) goScore.textContent = snapshot.score;
    if (goBest)  goBest.textContent  = snapshot.best;
    if (recordLabel) recordLabel.textContent = snapshot.isNewRecord ? 'PERSONAL BEST' : 'RECORD';
    if (recordState) recordState.classList.toggle('hidden', !snapshot.isNewRecord);

    const ratingRow   = document.getElementById('go-rating-row');
    const ratingLabel = document.getElementById('go-rating-label');
    const rating = snapshot.rating;
    const showRating = rating && rating.id && rating.id !== 'casual';
    if (showRating && ratingLabel && ratingRow) {
      ratingLabel.textContent = `${rating.label || rating.id} Run`;
      ratingRow.style.display = 'flex';
    } else if (ratingRow) {
      ratingRow.style.display = 'none';
    }

    const coinsRow    = document.getElementById('go-coins-row');
    const coinsEarned = document.getElementById('go-coins-earned');
    if (snapshot.sessionCoins > 0) {
      if (coinsEarned) coinsEarned.textContent = snapshot.sessionCoins;
      if (coinsRow)    coinsRow.style.display   = 'flex';
    } else {
      if (coinsRow) coinsRow.style.display = 'none';
    }

    const xpRow      = document.getElementById('go-xp-row');
    const xpEarnedEl = document.getElementById('go-xp-earned');
    const xpMultiEl  = document.getElementById('go-xp-multi');
    const xpBonusEl  = document.getElementById('go-xp-bonus');
    const xpBreakdown = snapshot.xpBreakdown;
    if (snapshot.xpEarned > 0 && xpBreakdown) {
      if (xpEarnedEl) xpEarnedEl.textContent = snapshot.xpEarned;
      const multiplier = Number(xpBreakdown.multi) || 1;
      if (xpMultiEl) {
        xpMultiEl.textContent = multiplier > 1 ? `×${multiplier}` : '';
        xpMultiEl.style.display = multiplier > 1 ? '' : 'none';
      }
      const bonuses = [];
      if (xpBreakdown.recordBonus)  bonuses.push(`${_uiIconHtml('leaderboard', 'go-xp-bonus-icon', 'record')} +${xpBreakdown.recordBonus}`);
      if (xpBreakdown.streakBonus)  bonuses.push(`${_uiIconHtml('fire', 'go-xp-bonus-icon', 'streak')} +${xpBreakdown.streakBonus}`);
      if (xpBreakdown.dailyQualityBonus)  bonuses.push(`${_uiIconHtml('celebration', 'go-xp-bonus-icon', 'daily')} daily +${xpBreakdown.dailyQualityBonus}`);
      if (xpBonusEl) {
        xpBonusEl.innerHTML     = bonuses.map(item => `<span class="go-xp-bonus-chip">${item}</span>`).join('');
        xpBonusEl.style.display = bonuses.length ? '' : 'none';
      }
      if (xpRow) xpRow.style.display = 'flex';
    } else {
      if (xpRow) xpRow.style.display = 'none';
    }

    const questNotify = document.getElementById('go-quest-notify');
    if (questNotify) {
      questNotify.style.display = snapshot.hasClaimableQuest ? 'inline-flex' : 'none';
    }

    const claimScoreBtn = document.getElementById('btn-claim-score');
    if (claimScoreBtn) {
      claimScoreBtn.style.display = '';
      claimScoreBtn.setAttribute('aria-live', 'polite');
      if (snapshot.canClaimOnchain) {
        claimScoreBtn.dataset.runId = String(snapshot.runId);
        claimScoreBtn.dataset.score = String(snapshot.score);
        claimScoreBtn.dataset.claimState = snapshot.claimState;
        const labels = {
          idle: 'CLAIM ONCHAIN',
          claiming: 'CLAIMING...',
          confirming: 'CONFIRMING...',
          claimed: '✓ CLAIMED',
        };
        claimScoreBtn.disabled = snapshot.claimState !== 'idle';
        claimScoreBtn.style.opacity = snapshot.claimState === 'claiming' || snapshot.claimState === 'confirming' ? '0.55' : '1';
        claimScoreBtn.textContent = labels[snapshot.claimState] || labels.idle;
      } else {
        delete claimScoreBtn.dataset.runId;
        delete claimScoreBtn.dataset.score;
        delete claimScoreBtn.dataset.claimState;
        claimScoreBtn.disabled = !snapshot.canClaimOnchain;
        claimScoreBtn.style.opacity = '0.55';
        claimScoreBtn.textContent = snapshot.score > 0 ? 'CONNECT WALLET TO CLAIM' : 'CLAIM UNAVAILABLE';
      }
    }
  }

  function presentRunComplete(snapshot) {
    renderRunComplete(snapshot);
    Loadout.showRunComplete();
  }

  function patchRunComplete(runId, snapshot) {
    const flow = window.__BASE_RUN_COMPLETE_FLOW;
    if (!flow || !snapshot || snapshot.runId !== runId || !flow.isPresentedRun(runId)) return;
    renderRunComplete(snapshot);
  }

  // ===== Check-in screen =====

  let _ciTimerInterval = null;

  // Rewards per day (day 1-7 in a streak cycle)
  const DAY_REWARDS = CHECKIN_REWARD_CYCLE.map(day => ({
    ...day,
    icon: typeof day.icon === 'function'
      ? day.icon()
      : _uiIconHtml('starter-pack', 'ci-reward-icon-img', 'reward'),
  }));

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

  function _rewardParts(bundle) {
    const totals = RewardEconomy.collect(bundle);
    const parts = [];
    if (totals.coins) parts.push({ kind: 'coins', value: totals.coins, label: '', icon: _imgHtml('/game/coin.png', 'ci-reward-chip-icon', 'coins') });
    if (totals.fragments) parts.push({ kind: 'frags', value: totals.fragments, label: '', icon: _uiIconHtml('fragments', 'ci-reward-chip-icon', 'fragments') });
    if (totals.boosters) parts.push({ kind: 'boost', value: totals.boosters, label: totals.boosters === 1 ? 'boost' : 'boosts', icon: _boosterIconHtml('ci-reward-chip-icon', 'boosters', 'boost_magnet') });
    if (totals.xp) parts.push({ kind: 'xp', value: totals.xp, label: 'XP', icon: _uiIconHtml('xp', 'ci-reward-chip-icon', 'xp') });
    return parts;
  }

  function _rewardChipsHtml(bundle, variant = '') {
    const parts = _rewardParts(bundle);
    if (!parts.length) return '';
    return `<div class="ci-reward-chips${variant ? ' ' + variant : ''}">${parts.map(part => `
      <span class="ci-reward-chip ci-reward-chip-${part.kind}">
        ${part.icon}
        <span class="ci-reward-chip-value">${part.value}</span>
        ${part.label ? `<span class="ci-reward-chip-label">${part.label}</span>` : ''}
      </span>`).join('')}</div>`;
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
      if (dayNum === 7) cls += ' ci-day-final';
      if (dayNum <= doneDays && !available) cls += ' claimed';
      else if (dayNum < todaySlot && available) cls += ' claimed';
      if (isToday) cls += ' today';

      const checkMark = (cls.includes('claimed')) ? '<span class="ci-check">✓</span>' : '';
      const opacity   = isFuture && !isToday ? 'opacity:0.4;' : '';

      if (dayNum === 7) {
        return `<div class="${cls}" style="${opacity}">
          ${checkMark}
          <div class="ci-day-icon">${day.icon}</div>
          <div class="ci-day-final-text">
            <span class="ci-day-final-badge">Weekly Reward</span>
            <span class="ci-day-final-title">Gear Crate</span>
            ${_rewardChipsHtml(REWARD_CONTAINERS_LOCAL[day.container], 'ci-reward-chips-final')}
            <span class="ci-day-label">Day 7</span>
          </div>
        </div>`;
      }

      return `<div class="${cls}" style="${opacity}">
        ${checkMark}
        <div class="ci-day-icon">${day.icon}</div>
        ${_rewardChipsHtml(day)}
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
    const screenEl = document.getElementById('screen-ci');
    _stopCiTimer();

    // Toggle compact mode — shrink UI when already claimed
    if (screenEl) screenEl.classList.toggle('ci-compact', !available && !isPending);

    if (isPending) {
      // Transaction in progress
      if (statusEl) {
        statusEl.className = 'ci-status';
        statusEl.innerHTML = '';
      }
      if (claimBtn) {
        claimBtn.disabled      = true;
        claimBtn.style.opacity = '0.5';
        claimBtn.style.display = '';
        claimBtn.textContent   = '⏳ Confirming...';
      }
    } else if (available) {
      if (statusEl) {
        statusEl.className = 'ci-status';
        statusEl.innerHTML = '';
      }
      if (claimBtn) {
        claimBtn.disabled      = false;
        claimBtn.style.opacity = '1';
        claimBtn.style.display = '';
        claimBtn.innerHTML     = `<span class="ci-claim-content"><span class="ci-claim-copy">CLAIM</span>${_rewardChipsHtml(todayReward, 'ci-reward-chips-claim')}</span>`;
      }
    } else {
      if (statusEl) statusEl.className = 'ci-status unavail';
      // Hide the useless disabled button in compact mode
      if (claimBtn) {
        claimBtn.style.display = 'none';
      }

      // Live countdown
      const tick = () => {
        const ms = _msUntilUTCMidnight();
        if (statusEl) statusEl.innerHTML = `<span class="ci-countdown">${_formatCountdown(ms)}</span><span class="ci-countdown-label">until next check-in</span>`;
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

  // ===== Обновить баланс монет =====
  // total  — общий баланс (меню, шоп)
  // hudVal — монеты этой сессии (HUD во время игры); если не передан — равен total
  const coinCountEl     = document.getElementById('coin-count');
  const menuCoinCountEl = document.getElementById('menu-coin-count');
  const runBoosterHud   = document.getElementById('run-booster-hud');
  const runBoostToast   = document.getElementById('run-boost-toast');
  const runBoostEls = {
    boost_magnet: document.getElementById('run-boost-magnet'),
    boost_double: document.getElementById('run-boost-double'),
    boost_shield: document.getElementById('run-boost-shield'),
  };
  let _runToastTimer = null;
  let _coinHudPopTimer = null;

  function updateCoins(total, hudVal) {
    const hud = hudVal !== undefined ? hudVal : total;
    if (coinCountEl)     coinCountEl.textContent     = hud;
    if (menuCoinCountEl) menuCoinCountEl.textContent = total;
    const shopEl = document.getElementById('shop-coin-count');
    if (shopEl) shopEl.textContent = total;
  }

  function setRunBoosters(activeBoosters) {
    const activeIds = new Set(Object.keys(activeBoosters || {}).filter(id => activeBoosters[id]));
    if (runBoosterHud) runBoosterHud.classList.toggle('hidden', activeIds.size === 0);
    for (const [id, el] of Object.entries(runBoostEls)) {
      if (!el) continue;
      const isActive = activeIds.has(id);
      el.classList.toggle('hidden', !isActive);
      el.classList.remove('pulse');
      el.classList.toggle('used', false);
    }
    if (runBoostToast) {
      runBoostToast.classList.add('hidden');
      runBoostToast.classList.remove('show');
    }
  }

  function _restartAnimation(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function _showRunBoostToast(label) {
    if (!runBoostToast || !label) return;
    runBoostToast.textContent = label;
    runBoostToast.classList.remove('hidden');
    _restartAnimation(runBoostToast, 'show');
    if (_runToastTimer) clearTimeout(_runToastTimer);
    _runToastTimer = setTimeout(() => {
      runBoostToast.classList.add('hidden');
      runBoostToast.classList.remove('show');
    }, 760);
  }

  function _popCoinHud() {
    const coinHud = document.getElementById('coin-hud');
    if (!coinHud) return;
    coinHud.classList.remove('coin-hud-pop');
    void coinHud.offsetWidth;
    coinHud.classList.add('coin-hud-pop');
    if (_coinHudPopTimer) clearTimeout(_coinHudPopTimer);
    _coinHudPopTimer = setTimeout(() => coinHud.classList.remove('coin-hud-pop'), 180);
  }

  function triggerRunBoosterFeedback(id, label) {
    const el = runBoostEls[id];
    if (!el || el.classList.contains('hidden')) return;
    _restartAnimation(el, 'pulse');
    if (id === 'boost_double') _popCoinHud();
    _showRunBoostToast(label);
  }

  function markRunBoosterUsed(id) {
    const el = runBoostEls[id];
    if (!el) return;
    el.classList.add('used');
  }

  return { show, updateScore, updateBest, presentRunComplete, patchRunComplete, showCheckIn, showLeaderboard, updateCoins, setRunBoosters, triggerRunBoosterFeedback, markRunBoosterUsed };

})();


/* ===== nft-utils.js ===== */
// Module-level NFT helpers — used by Shop, DailySpin, and Xp
function _isNftClaimed(itemId) {
  try { return JSON.parse(localStorage.getItem('nft_claimed') || '[]').includes(itemId); } catch { return false; }
}
function _markNftClaimed(itemId) {
  try {
    const c = JSON.parse(localStorage.getItem('nft_claimed') || '[]');
    if (!c.includes(itemId)) { c.push(itemId); localStorage.setItem('nft_claimed', JSON.stringify(c)); }
  } catch {}
}
// Render an NFT button or claimed badge for an owned item
function _nftBtnHtml(itemId) {
  if (!window.__NFT_DEPLOYED) return '';
  if (_isNftClaimed(itemId)) return '<span class="shop-nft-claimed">✓ CLAIMED</span>';
  return `<button class="shop-nft-btn claim-action" data-id="${itemId}">CLAIM ONCHAIN</button>`;
}
// Bind click handlers on all .shop-nft-btn inside a container
function _bindNftBtns(container) {
  container.querySelectorAll('.shop-nft-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.id;
      const mintFn = window.__NFT_MINT;
      if (!mintFn || window.__NFT_PENDING) return;
      btn.textContent = 'CLAIMING...';
      btn.disabled = true;
      mintFn(itemId);
    });
  });
}

/* ===== shop.js ===== */
const Shop = (() => {
  // ── Скины ──
  const ITEMS = [
    { id: 'skin_cryptokid',     name: 'Genesis Runner',    price: 0,    desc: 'Born on-chain',            sprite: '/game/chars/cryptokid.png'     },
    { id: 'skin_street_runner', name: 'City Runner',        price: 150,  desc: 'Fast on the streets',      sprite: '/game/chars/street_runner.png' },
    { id: 'skin_default',       name: 'Base Builder',       price: 800,  desc: 'Builds on Base',           sprite: '/game/player.png'              },
    { id: 'skin_3',             name: 'Night Operator',     price: 750,  desc: 'Moves after dark',         sprite: '/game/chars/skin3.png'         },
    { id: 'skin_6',             name: 'Doctor',             price: 800,  desc: 'Keeps the run alive',      sprite: '/game/chars/skin6.png'         },
    { id: 'skin_9',             name: 'Firefighter',        price: 850,  desc: 'Runs toward the heat',      sprite: '/game/chars/skin9.png'         },
    { id: 'skin_10',            name: 'Police Officer',     price: 900,  desc: 'Patrols the streets',       sprite: '/game/chars/skin10.png'        },
    { id: 'skin_2',             name: 'Justin Sun',         price: 1200, desc: 'TRON founder',             sprite: '/game/chars/skin2.png'         },
    { id: 'skin_5',             name: 'Anatoly Yakovenko',  price: 1300, desc: 'Solana co-founder',         sprite: '/game/chars/skin5.png'         },
    { id: 'skin_7',             name: 'Bitcoin Maxi',       price: 1350, desc: 'Never sells',               sprite: '/game/chars/skin7.png'         },
    { id: 'skin_4',             name: 'Satoshi Nakamoto',   price: 1400, desc: 'The anonymous genesis',     sprite: '/game/chars/skin4.png'         },
    { id: 'skin_11',            name: 'Ape Holder',         price: 1500, desc: 'Diamond hands',             sprite: '/game/chars/skin11.png'        },
    { id: 'skin_8',             name: 'Brian Armstrong',    price: null, desc: 'Coinbase co-founder',       sprite: '/game/chars/skin8.png'         },
    { id: 'skin_founder',       name: 'Vitalik Buterin',    price: null, desc: 'Ethereum co-founder',       sprite: '/game/chars/founder.png'       },
    { id: 'skin_base_king',     name: 'Base King',          price: null, desc: 'Jesse Pollak inspired',     sprite: '/game/chars/base_king.png'     },
  ];

  const REMOVED_SKIN_IDS = new Set(['skin_1']);

  // ── Бустеры (расходуемые, покупаются паками) ──
  const BOOSTERS = [
    { id: 'boost_magnet', name: 'Coin Magnet',   packPrice: 60,  packSize: 3, sprite: '/game/boosters/coin_magnet.png',   desc: 'Pulls coins from distance' },
    { id: 'boost_double', name: 'Double Coins',  packPrice: 90,  packSize: 3, sprite: '/game/boosters/double_coins.png',  desc: 'Every coin counts as x2'   },
    { id: 'boost_shield', name: 'Second Chance', packPrice: 100, packSize: 3, sprite: '/game/boosters/second_chance.png', desc: 'Extra life on death'        },
  ];

  // ── Паки анимаций смерти ──
  const DEATH_PACKS = [
    { id: 'death_comic',    name: 'Comic',    price: 200,  iconSrc: '/game/ui-icons/celebration.png', desc: 'Squish, bubbles and star fly-off' },
    { id: 'death_pixel',    name: 'Pixel',    price: 800,  iconSrc: '/game/ui-icons/gamepad.png',      desc: 'Pixel burst, vortex and dissolve' },
    { id: 'death_dramatic', name: 'Dramatic', price: 1200, iconSrc: '/game/ui-icons/fire.png',         desc: 'Spin away, slow sink and flash out' },
  ];

  // ── Следы персонажа (trail skins) ──
  const TRAIL_PACKS = [
    { id: 'trail_sparkle', name: 'Sparkle', price: 150, sprite: '/nft/images/trail_sparkle.png', desc: 'Golden twinkling stars',  color: 'rgba(255,215,0,0.22)',   glow: 'rgba(255,215,0,0.5)'   },
    { id: 'trail_hearts',  name: 'Hearts',  price: 750, sprite: '/nft/images/trail_hearts.png',  desc: 'Floating heart burst',    color: 'rgba(255,100,170,0.22)', glow: 'rgba(255,100,170,0.5)' },
    { id: 'trail_fire',    name: 'Fire',    price: 800, sprite: '/nft/images/trail_fire.png',    desc: 'Blazing flame puffs',     color: 'rgba(255,110,0,0.22)',   glow: 'rgba(255,110,0,0.5)'   },
    { id: 'trail_coins',   name: 'Coins',   price: 1200, sprite: '/nft/images/trail_coins.png',   desc: 'Shiny spinning coins',    color: 'rgba(255,200,0,0.22)',   glow: 'rgba(255,200,0,0.5)'   },
    { id: 'trail_rainbow', name: 'Rainbow', price: 600, sprite: '/nft/images/trail_rainbow.png', desc: 'Six-color rainbow burst', color: 'rgba(140,100,255,0.22)', glow: 'rgba(140,100,255,0.5)' },
  ];
  const DEFAULT_TRAIL = { id: 'default', name: 'Default', sprite: '/nft/images/trail_default.png', desc: 'Footprints, dust and ripples', color: 'rgba(255,255,255,0.07)', glow: 'rgba(255,255,255,0.12)' };

  const ECONOMY_TIERS = Object.freeze({
    common:    { fragments: 10, craftFee: 40,  topUpCost: 20,  topUpCapPct: 0.2, poolCapPct: 1 },
    rare:      { fragments: 20, craftFee: 100, topUpCost: 35,  topUpCapPct: 0.2, poolCapPct: 1 },
    epic:      { fragments: 35, craftFee: 220, topUpCost: 60,  topUpCapPct: 0.2, poolCapPct: 1 },
    legendary: { fragments: 60, craftFee: 500, topUpCost: 160, topUpCapPct: 0,   poolCapPct: 0.5 },
  });

  const CRAFT_CONFIG = Object.freeze({
    trail_sparkle: { type: 'trail', tier: 'common' },
    trail_hearts:  { type: 'trail', tier: 'rare' },
    trail_fire:    { type: 'trail', tier: 'rare' },
    trail_coins:   { type: 'trail', tier: 'epic' },
    trail_rainbow: { type: 'trail', tier: 'legendary' },

    death_comic:    { type: 'death', tier: 'common' },
    death_pixel:    { type: 'death', tier: 'rare' },
    death_dramatic: { type: 'death', tier: 'epic' },

    skin_street_runner: { type: 'skin', tier: 'common' },
    skin_1:             { type: 'skin', tier: 'rare' },
    skin_2:             { type: 'skin', tier: 'epic', craftFee: 300 },
    skin_default:       { type: 'skin', tier: 'rare' },
    skin_3:             { type: 'skin', tier: 'rare' },
    skin_4:             { type: 'skin', tier: 'epic', craftFee: 300 },
    skin_5:             { type: 'skin', tier: 'epic', craftFee: 300 },
    skin_6:             { type: 'skin', tier: 'rare' },
    skin_7:             { type: 'skin', tier: 'epic', craftFee: 300 },
    skin_founder:       { type: 'skin', tier: 'legendary' },
    skin_8:             { type: 'skin', tier: 'legendary' },
    skin_9:             { type: 'skin', tier: 'rare' },
    skin_10:            { type: 'skin', tier: 'rare' },
    skin_11:            { type: 'skin', tier: 'epic', craftFee: 300 },
    skin_base_king:     { type: 'skin', tier: 'legendary' },
  });

  const SAVE_KEY = 'shop_v1';
  const NFT_CLAIMED_KEY = 'nft_claimed';
  const GEAR_TEST_BACKUP_KEY = 'shop_v1_gear_test_backup';
  const ECONOMY_TEST_BACKUP_KEY = 'shop_v1_economy_test_backup';
  let shopTab = 'skins'; // 'skins' | 'boosters' | 'trails' | 'effects'
  let _shopCache = null; // in-memory cache — avoids localStorage + JSON.parse every frame

  function _removeRetiredSkins(d) {
    if (!d || typeof d !== 'object') return d;
    if (Array.isArray(d.owned)) {
      d.owned = d.owned.filter(id => !REMOVED_SKIN_IDS.has(id));
    }
    if (REMOVED_SKIN_IDS.has(d.equipped)) d.equipped = 'skin_cryptokid';
    if (REMOVED_SKIN_IDS.has(d.focusItemId)) d.focusItemId = null;
    for (const field of ['fragments', 'topUpFragments', 'poolAppliedFragments']) {
      if (d[field] && typeof d[field] === 'object' && !Array.isArray(d[field])) {
        for (const id of REMOVED_SKIN_IDS) delete d[field][id];
      }
    }
    return d;
  }

  function loadShopData() {
    if (_shopCache) return _shopCache;
    try { _shopCache = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { _shopCache = {}; }
    _removeRetiredSkins(_shopCache);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(_shopCache)); } catch {}
    return _shopCache;
  }
  function saveShopData(d) {
    _removeRetiredSkins(d);
    _shopCache = d; // update cache
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch {}
    _syncToServer(d);
  }
  function saveShopDataLocal(d) {
    _removeRetiredSkins(d);
    _shopCache = d;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch {}
  }

  function _isLocalGearTestAllowed() {
    return typeof location !== 'undefined'
      && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1');
  }

  function _clearGearTestParam() {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('gearTest');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch {}
  }

  function applyLocalGearTestFixture() {
    if (!_isLocalGearTestAllowed()) return false;
    const params = new URLSearchParams(location.search);
    const mode = params.get('gearTest');
    if (!mode) return false;

    if (mode === 'restore') {
      try {
        const rawBackup = localStorage.getItem(GEAR_TEST_BACKUP_KEY);
        if (rawBackup) {
          const backup = JSON.parse(rawBackup);
          if (backup.existed) localStorage.setItem(SAVE_KEY, backup.value);
          else localStorage.removeItem(SAVE_KEY);
          if (Object.prototype.hasOwnProperty.call(backup, 'nftClaimedExisted')) {
            if (backup.nftClaimedExisted) localStorage.setItem(NFT_CLAIMED_KEY, backup.nftClaimedValue);
            else localStorage.removeItem(NFT_CLAIMED_KEY);
          }
          localStorage.removeItem(GEAR_TEST_BACKUP_KEY);
          _shopCache = null;
        }
      } catch {}
      _clearGearTestParam();
      if (typeof refreshGearViews === 'function') refreshGearViews();
      return true;
    }

    if (mode !== '1') {
      _clearGearTestParam();
      return false;
    }

    try {
      const currentBackupRaw = localStorage.getItem(GEAR_TEST_BACKUP_KEY);
      if (!currentBackupRaw) {
        const currentRaw = localStorage.getItem(SAVE_KEY);
        localStorage.setItem(GEAR_TEST_BACKUP_KEY, JSON.stringify({
          existed: currentRaw !== null,
          value: currentRaw,
          nftClaimedExisted: localStorage.getItem(NFT_CLAIMED_KEY) !== null,
          nftClaimedValue: localStorage.getItem(NFT_CLAIMED_KEY),
        }));
      } else {
        const backup = JSON.parse(currentBackupRaw);
        if (!Object.prototype.hasOwnProperty.call(backup, 'nftClaimedExisted')) {
          backup.nftClaimedExisted = localStorage.getItem(NFT_CLAIMED_KEY) !== null;
          backup.nftClaimedValue = localStorage.getItem(NFT_CLAIMED_KEY);
          localStorage.setItem(GEAR_TEST_BACKUP_KEY, JSON.stringify(backup));
        }
      }
    } catch {}

    const d = _migrateCharges(loadShopData());
    d.owned = ['skin_cryptokid', 'skin_street_runner'];
    d.equipped = 'skin_cryptokid';
    d.boosterCharges = { boost_magnet: 3, boost_double: 3, boost_shield: 3 };
    d.trailPacks = ['trail_sparkle', 'trail_hearts'];
    d.equippedTrail = 'default';
    saveShopDataLocal(d);
    try {
      const claimed = JSON.parse(localStorage.getItem(NFT_CLAIMED_KEY) || '[]');
      for (const id of ['skin_street_runner']) {
        if (!claimed.includes(id)) claimed.push(id);
      }
      localStorage.setItem(NFT_CLAIMED_KEY, JSON.stringify(claimed));
    } catch {}
    _clearGearTestParam();
    if (typeof refreshGearViews === 'function') refreshGearViews();
    return true;
  }

  function applyLocalEconomyTestFixture() {
    const allowed = typeof location !== 'undefined'
      && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1');
    if (!allowed) return false;

    const params = new URLSearchParams(location.search);
    const mode = params.get('economyTest');
    if (!mode) return false;

    const clearParam = () => {
      try {
        const url = new URL(location.href);
        url.searchParams.delete('economyTest');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch {}
    };

    if (mode === 'restore') {
      try {
        const rawBackup = localStorage.getItem(ECONOMY_TEST_BACKUP_KEY);
        if (rawBackup) {
          const backup = JSON.parse(rawBackup);
          if (backup.existed) localStorage.setItem(SAVE_KEY, backup.value);
          else localStorage.removeItem(SAVE_KEY);
          localStorage.removeItem(ECONOMY_TEST_BACKUP_KEY);
          _shopCache = null;
        }
      } catch {}
      clearParam();
      if (typeof refreshGearViews === 'function') refreshGearViews();
      renderFocusStrip();
      return true;
    }

    if (mode !== '1') {
      clearParam();
      return false;
    }

    try {
      if (!localStorage.getItem(ECONOMY_TEST_BACKUP_KEY)) {
        const currentRaw = localStorage.getItem(SAVE_KEY);
        localStorage.setItem(ECONOMY_TEST_BACKUP_KEY, JSON.stringify({
          existed: currentRaw !== null,
          value: currentRaw,
        }));
      }
    } catch {}

    const d = _migrateEconomy(loadShopData());
    d.focusItemId = 'trail_fire';
    d.fragments = { ...(d.fragments || {}), trail_fire: 17, skin_8: 12 };
    d.topUpFragments = { ...(d.topUpFragments || {}) };
    d.boosterCharges = { ...(d.boosterCharges || {}), boost_magnet: 2, boost_double: 2, boost_shield: 1 };
    saveShopDataLocal(d);
    clearParam();
    if (typeof refreshGearViews === 'function') refreshGearViews();
    renderFocusStrip();
    return true;
  }

  function _syncToServer(d) {
    const syncFn = window.__BASE_SHOP_SYNC;
    if (typeof syncFn === 'function') syncFn({
      owned:          d.owned          || ['skin_cryptokid'],
      equipped:       d.equipped       || 'skin_cryptokid',
      boosterCharges: d.boosterCharges || {},
      trailPacks:     d.trailPacks     || [],
      equippedTrail:  d.equippedTrail  || 'default',
      equippedDeath:  d.equippedDeath  || 'default',
      deathPacks:     d.deathPacks     || [],
    });
  }

  function applyServerData(owned, equipped, boosterCharges, trailPacks, equippedTrail, equippedDeath, deathPacks) {
    const local = _migrateEconomy(loadShopData());

    // Merge owned skins (union)
    const mergedOwned = [...new Set([...(local.owned || ['skin_cryptokid']), ...(owned || [])])];

    // Merge booster charges (take max of local vs server)
    const localCharges  = local.boosterCharges || {};
    const serverCharges = (typeof boosterCharges === 'object' && !Array.isArray(boosterCharges)) ? boosterCharges : {};
    const mergedCharges = { ...localCharges };
    for (const id of Object.keys(serverCharges)) {
      mergedCharges[id] = Math.max(mergedCharges[id] || 0, serverCharges[id] || 0);
    }

    // Merge trail/death packs (union)
    const mergedTrails = [...new Set([...(local.trailPacks || []), ...(Array.isArray(trailPacks) ? trailPacks : [])])];
    const mergedDeaths = [...new Set([...(local.deathPacks || []), ...(Array.isArray(deathPacks)  ? deathPacks  : [])])];

    const d = {
      owned:          mergedOwned,
      equipped:       equipped      || local.equipped      || 'skin_cryptokid',
      boosterCharges: mergedCharges,
      trailPacks:     mergedTrails,
      equippedTrail:  equippedTrail || local.equippedTrail || 'default',
      equippedDeath:  equippedDeath || local.equippedDeath || 'default',
      deathPacks:     mergedDeaths,
      fragments:      local.fragments || {},
      focusItemId:    local.focusItemId || null,
      topUpFragments: local.topUpFragments || {},
      pooledFragments:      Math.max(0, Math.floor(Number(local.pooledFragments) || 0)),
      poolAppliedFragments: (local.poolAppliedFragments && typeof local.poolAppliedFragments === 'object' && !Array.isArray(local.poolAppliedFragments)) ? local.poolAppliedFragments : {},
    };
    _removeRetiredSkins(d);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch {}
    _shopCache = d;
    if (typeof Renderer !== 'undefined') Renderer.reloadPlayerSprite();
    if (typeof refreshGearViews === 'function') refreshGearViews();
  }

  function applyServerEconomyData(serverData) {
    if (!serverData || typeof serverData !== 'object') return;
    const local = _migrateEconomy(loadShopData());
    const d = _migrateEconomy({
      ...local,
      owned: Array.isArray(serverData.owned) ? serverData.owned : local.owned,
      equipped: typeof serverData.equipped === 'string' ? serverData.equipped : local.equipped,
      boosterCharges: serverData.boosterCharges && typeof serverData.boosterCharges === 'object'
        ? serverData.boosterCharges
        : local.boosterCharges,
      trailPacks: Array.isArray(serverData.trailPacks) ? serverData.trailPacks : local.trailPacks,
      equippedTrail: typeof serverData.equippedTrail === 'string' ? serverData.equippedTrail : local.equippedTrail,
      equippedDeath: typeof serverData.equippedDeath === 'string' ? serverData.equippedDeath : local.equippedDeath,
      deathPacks: Array.isArray(serverData.deathPacks) ? serverData.deathPacks : local.deathPacks,
      fragments: serverData.fragments && typeof serverData.fragments === 'object' ? serverData.fragments : local.fragments,
      focusItemId: typeof serverData.focusItemId === 'string' ? serverData.focusItemId : null,
      topUpFragments: serverData.topUpFragments && typeof serverData.topUpFragments === 'object'
        ? serverData.topUpFragments
        : local.topUpFragments,
      pooledFragments: typeof serverData.pooledFragments === 'number'
        ? Math.max(0, Math.floor(serverData.pooledFragments))
        : local.pooledFragments,
      poolAppliedFragments: serverData.poolAppliedFragments && typeof serverData.poolAppliedFragments === 'object' && !Array.isArray(serverData.poolAppliedFragments)
        ? serverData.poolAppliedFragments
        : local.poolAppliedFragments,
    });
    saveShopDataLocal(d);
    if (typeof Renderer !== 'undefined') Renderer.reloadPlayerSprite();
    if (typeof refreshGearViews === 'function') refreshGearViews();
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
  }

  // Deep snapshot of the local economy state in the shape applyServerEconomyData
  // consumes — lets a caller capture state before an optimistic mutation and
  // restore it (applyServerEconomyData REPLACES) if the server rejects.
  function exportEconomyData() {
    try { return JSON.parse(JSON.stringify(_migrateEconomy(loadShopData()))); }
    catch { return null; }
  }

  function _setCoinBalanceLocal(balance) {
    if (typeof balance !== 'number' || !Number.isFinite(balance)) return;
    const next = Math.max(0, Math.floor(balance));
    const d = Save.load();
    d.coins = next;
    Save.save(d);
    if (typeof UI !== 'undefined') UI.updateCoins(next);
  }

  function _reconcileEconomyResult(result) {
    if (result && result.shop) applyServerEconomyData(result.shop);
    if (result && typeof result.coins === 'number') _setCoinBalanceLocal(result.coins);
  }

  // Optimistic economy action: apply the change locally right away for instant
  // feedback, then reconcile with the server's authoritative state in the
  // background. The server stays the source of truth — its response (on success
  // OR on a rejection that carries state) overwrites the local guess via
  // applyServerEconomyData (REPLACE) + _setCoinBalanceLocal, so a rejected
  // action is reverted automatically. Network/offline keeps the local result,
  // matching the previous fallback behavior.
  function _runEconomyAction(action, itemId, applyLocal, afterReconcile) {
    const applied = applyLocal();
    if (!applied) return false;                 // couldn't apply (can't afford / owned) — nothing to sync
    const actionFn = window.__BASE_ECONOMY_ACTION;
    if (typeof actionFn === 'function') {
      actionFn({ action, itemId }).then((result) => {
        if (result && result.ok) {
          _reconcileEconomyResult(result);
        } else if (result && (result.error === 'no_address' || result.error === 'fetch_failed' || result.error === 'action_failed')) {
          // server unavailable — keep the optimistic local result (offline)
        } else if (result && (result.shop || typeof result.coins === 'number')) {
          // genuine rejection carrying authoritative state — reconcile reverts it
          _reconcileEconomyResult(result);
        }
        // else: rejection without state (busy/invalid) — keep local; next hydrate reconciles
        if (typeof afterReconcile === 'function') afterReconcile(result);
        render();
      }).catch(() => {
        // network error — keep optimistic result (offline behavior)
        if (typeof afterReconcile === 'function') afterReconcile(null);
      });
    }
    return true;
  }

  function _directBuyAvailable(itemId) {
    const meta = getCraftMeta(itemId);
    return !meta || meta.tier !== 'legendary';
  }

  function buyShopItemLocal(itemId, price) {
    if (!_directBuyAvailable(itemId)) return false;
    const item = _catalogItem(itemId);
    if (!item || _ownsItemOfType(itemId, item.type)) return false;
    const cost = Math.max(0, Math.floor(Number(price) || 0));
    if (Save.getCoins() < cost) return false;
    Save.addCoins(-cost);
    if (item.type === 'skin') {
      const d = _migrateEconomy(loadShopData());
      d.owned = Array.from(new Set([...(d.owned || ['skin_cryptokid']), itemId]));
      saveShopDataLocal(d);
    } else {
      _grantItemLocal(itemId, item.type);
    }
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    return true;
  }

  function buyShopItemServerFirst(itemId, price, afterBuy) {
    const item = _catalogItem(itemId);
    const ok = _runEconomyAction('buyItem', itemId,
      () => buyShopItemLocal(itemId, price),
      () => {
        // After reconcile: re-assert the post-buy action (e.g. equip) only if the
        // item survived — a rejected buy is reverted and must not stay equipped.
        if (typeof afterBuy === 'function' && item && _ownsItemOfType(itemId, item.type)) {
          afterBuy(true);
        }
      });
    // Optimistic: apply the post-buy action (equip) immediately for instant feedback.
    if (ok && typeof afterBuy === 'function') afterBuy(true);
    return ok;
  }

  function buyBoosterPackLocal(boosterId, price, packSize) {
    const cost = Math.max(0, Math.floor(Number(price) || 0));
    const size = Math.max(0, Math.floor(Number(packSize) || 0));
    if (!BOOSTERS.some(item => item.id === boosterId) || size <= 0) return false;
    if (Save.getCoins() < cost) return false;
    Save.addCoins(-cost);
    addBoosterCharges(boosterId, size);
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    return true;
  }

  function buyBoosterPackServerFirst(boosterId, price, packSize) {
    return _runEconomyAction('buyBoosterPack', boosterId, () => buyBoosterPackLocal(boosterId, price, packSize));
  }

  function getOwned() { return loadShopData().owned || ['skin_cryptokid']; }
  function getEquipped() { return loadShopData().equipped || 'skin_cryptokid'; }
  function getSkinMeta(id) {
    return ITEMS.find(item => item.id === id) || ITEMS[0];
  }
  function getSkinOptions() {
    const owned = getOwned();
    const options = ITEMS
      .filter(item => owned.includes(item.id) && _skinUnlocked(item.id))
      .map(item => item.id);
    return options.length ? options : ['skin_cryptokid'];
  }
  function equipSkinLocal(id) {
    if (!getSkinOptions().includes(id)) return false;
    const d = loadShopData();
    d.equipped = id;
    saveShopDataLocal(d);
    if (typeof Renderer !== 'undefined') Renderer.reloadPlayerSprite();
    if (typeof refreshGearViews === 'function') refreshGearViews();
    return true;
  }

  // ── Расходуемые бустеры ──
  function _migrateCharges(d) {
    // Миграция из старого формата boosters:[id] в boosterCharges:{id:N}
    if (d.boosters && !d.boosterCharges) {
      const charges = {};
      (d.boosters || []).forEach(id => { charges[id] = 1; });
      d.boosterCharges = charges;
      delete d.boosters;
    }
    return d;
  }

  function _migrateEconomy(d) {
    _removeRetiredSkins(d);
    _migrateCharges(d);
    if (!d.fragments || typeof d.fragments !== 'object' || Array.isArray(d.fragments)) d.fragments = {};
    if (!d.topUpFragments || typeof d.topUpFragments !== 'object' || Array.isArray(d.topUpFragments)) d.topUpFragments = {};
    if (typeof d.pooledFragments !== 'number' || !Number.isFinite(d.pooledFragments) || d.pooledFragments < 0) d.pooledFragments = 0;
    else d.pooledFragments = Math.floor(d.pooledFragments);
    if (!d.poolAppliedFragments || typeof d.poolAppliedFragments !== 'object' || Array.isArray(d.poolAppliedFragments)) d.poolAppliedFragments = {};
    if (typeof d.focusItemId !== 'string' || !getCraftMeta(d.focusItemId)) d.focusItemId = null;
    return d;
  }

  function _catalogItem(itemId) {
    const skin = ITEMS.find(item => item.id === itemId);
    if (skin) return { ...skin, type: 'skin' };
    const trail = TRAIL_PACKS.find(item => item.id === itemId);
    if (trail) return { ...trail, type: 'trail' };
    const death = DEATH_PACKS.find(item => item.id === itemId);
    if (death) return { ...death, type: 'death' };
    return null;
  }

  function getCraftMeta(itemId) {
    const cfg = CRAFT_CONFIG[itemId];
    const item = _catalogItem(itemId);
    if (!cfg || !item) return null;
    const tier = ECONOMY_TIERS[cfg.tier];
    if (!tier) return null;
    return {
      ...cfg,
      ...tier,
      craftFee: Number.isFinite(cfg.craftFee) ? cfg.craftFee : tier.craftFee,
      itemId,
      name: item.name,
      sprite: item.sprite || item.iconSrc || '',
      price: item.price || 0,
    };
  }

  function _ownsItemOfType(itemId, type) {
    if (type === 'skin') return getOwned().includes(itemId);
    if (type === 'trail') return getTrailPacks().includes(itemId);
    if (type === 'death') return getDeathPacks().includes(itemId);
    return false;
  }

  function _grantItemLocal(itemId, type) {
    const d = _migrateEconomy(loadShopData());
    if (type === 'skin') {
      const owned = d.owned || ['skin_cryptokid'];
      if (!owned.includes(itemId)) owned.push(itemId);
      d.owned = owned;
    } else if (type === 'trail') {
      const packs = d.trailPacks || [];
      if (!packs.includes(itemId)) packs.push(itemId);
      d.trailPacks = packs;
    } else if (type === 'death') {
      const packs = d.deathPacks || [];
      if (!packs.includes(itemId)) packs.push(itemId);
      d.deathPacks = packs;
    }
    if (d.focusItemId === itemId) d.focusItemId = null;
    saveShopDataLocal(d);
  }

  function getFocusItem() {
    const d = _migrateEconomy(loadShopData());
    const meta = getCraftMeta(d.focusItemId);
    if (!meta || _ownsItemOfType(d.focusItemId, meta.type)) {
      if (d.focusItemId) {
        d.focusItemId = null;
        saveShopDataLocal(d);
      }
      return null;
    }
    return d.focusItemId;
  }

  function getPooledFragments() {
    const d = _migrateEconomy(loadShopData());
    return Math.max(0, Math.floor(Number(d.pooledFragments) || 0));
  }

  function setFocusItemLocal(itemId) {
    const meta = getCraftMeta(itemId);
    if (!meta || _ownsItemOfType(itemId, meta.type)) return false;
    const d = _migrateEconomy(loadShopData());
    d.focusItemId = itemId;

    // Auto-drain the pool into the item, capped per tier (mirrors server setFocus).
    const current = Math.max(0, Math.floor(Number(d.fragments[itemId]) || 0));
    const capTotal = Math.floor(meta.fragments * (meta.poolCapPct != null ? meta.poolCapPct : 1));
    const alreadyPooled = Math.max(0, Math.floor(Number(d.poolAppliedFragments[itemId]) || 0));
    const allowedFromPool = Math.max(0, capTotal - alreadyPooled);
    const drain = Math.min(d.pooledFragments, meta.fragments - current, allowedFromPool);
    if (drain > 0) {
      d.fragments[itemId] = current + drain;
      d.pooledFragments -= drain;
      d.poolAppliedFragments[itemId] = alreadyPooled + drain;
    }

    saveShopDataLocal(d);
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return true;
  }

  function setFocusItemServerFirst(itemId) {
    return _runEconomyAction('setFocus', itemId, () => setFocusItemLocal(itemId));
  }

  function addFragmentsLocal(itemId, amount) {
    const meta = getCraftMeta(itemId);
    if (!meta) return { toFocus: 0, toPool: 0 };
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return { toFocus: 0, toPool: 0 };
    const d = _migrateEconomy(loadShopData());
    const current = Math.max(0, Math.floor(Number(d.fragments[itemId]) || 0));
    const next = Math.min(meta.fragments, current + add);
    const toFocus = next - current;
    const toPool = add - toFocus;
    d.fragments[itemId] = next;
    d.pooledFragments += toPool;
    saveShopDataLocal(d);
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return { toFocus, toPool };
  }

  function bankPooledFragments(amount) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return getPooledFragments();
    const d = _migrateEconomy(loadShopData());
    d.pooledFragments += add;
    saveShopDataLocal(d);
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return d.pooledFragments;
  }

  function getCraftStatus(itemId) {
    const meta = getCraftMeta(itemId);
    if (!meta) return { valid: false, itemId, fragments: 0, target: 0, pct: 0, owned: false, canCraft: false, canTopUp: false };
    const d = _migrateEconomy(loadShopData());
    const fragments = Math.max(0, Math.floor(Number(d.fragments[itemId]) || 0));
    const target = meta.fragments;
    const owned = _ownsItemOfType(itemId, meta.type);
    const missing = Math.max(0, target - fragments);
    const topUpUsed = Math.max(0, Math.floor(Number(d.topUpFragments[itemId]) || 0));
    const topUpCap = Math.max(0, Math.floor(target * meta.topUpCapPct));
    const topUpAmount = meta.tier === 'legendary' ? 0 : Math.min(missing, Math.max(0, topUpCap - topUpUsed));
    const topUpCostTotal = topUpAmount * meta.topUpCost;

    return {
      valid: true,
      ...meta,
      owned,
      fragments,
      target,
      missing,
      pct: Math.min(100, Math.round((fragments / target) * 100)),
      focus: d.focusItemId === itemId,
      canCraft: !owned && fragments >= target && Save.getCoins() >= meta.craftFee,
      hasFragments: fragments >= target,
      canTopUp: !owned && topUpAmount > 0 && Save.getCoins() >= topUpCostTotal,
      topUpAmount,
      topUpCostTotal,
    };
  }

  function craftItemLocal(itemId) {
    const status = getCraftStatus(itemId);
    if (!status.valid) return { ok: false, reason: 'invalid_item' };
    if (status.owned) return { ok: false, reason: 'already_owned' };
    if (!status.hasFragments) return { ok: false, reason: 'not_enough_fragments' };
    if (Save.getCoins() < status.craftFee) return { ok: false, reason: 'not_enough_coins' };

    const d = _migrateEconomy(loadShopData());
    d.fragments[itemId] = 0;
    d.topUpFragments[itemId] = 0;
    if (d.focusItemId === itemId) d.focusItemId = null;
    saveShopDataLocal(d);
    Save.addCoins(-status.craftFee);
    _grantItemLocal(itemId, status.type);
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    if (typeof refreshGearViews === 'function') refreshGearViews();
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return { ok: true };
  }

  function craftItemServerFirst(itemId) {
    return _runEconomyAction('craft', itemId, () => craftItemLocal(itemId).ok);
  }

  function topUpFragmentsLocal(itemId, amount) {
    const meta = getCraftMeta(itemId);
    if (!meta) return { ok: false, reason: 'invalid_item' };
    if (meta.tier === 'legendary') return { ok: false, reason: 'legendary_topup_disabled' };
    if (_ownsItemOfType(itemId, meta.type)) return { ok: false, reason: 'already_owned' };

    const d = _migrateEconomy(loadShopData());
    const current = Math.max(0, Math.floor(Number(d.fragments[itemId]) || 0));
    const target = meta.fragments;
    const missing = Math.max(0, target - current);
    if (missing <= 0) return { ok: false, reason: 'already_ready' };

    const topUpUsed = Math.max(0, Math.floor(Number(d.topUpFragments[itemId]) || 0));
    const topUpCap = Math.max(0, Math.floor(target * meta.topUpCapPct));
    const requested = amount === undefined ? missing : Math.max(0, Math.floor(Number(amount) || 0));
    const add = Math.min(requested, missing, Math.max(0, topUpCap - topUpUsed));
    if (add <= 0) return { ok: false, reason: 'topup_cap_reached' };

    const cost = add * meta.topUpCost;
    if (Save.getCoins() < cost) return { ok: false, reason: 'not_enough_coins', cost };

    d.fragments[itemId] = current + add;
    d.topUpFragments[itemId] = topUpUsed + add;
    saveShopDataLocal(d);
    Save.addCoins(-cost);
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return { ok: true, amount: add, cost };
  }

  function topUpFragmentsServerFirst(itemId) {
    return _runEconomyAction('topUp', itemId, () => topUpFragmentsLocal(itemId).ok);
  }

  function _currentUtcDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function _loadDailyFragmentChestLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DAILY_FRAGMENT_CHEST_LOCAL_KEY) || '{}');
      return {
        lastDate: typeof parsed.lastDate === 'string' ? parsed.lastDate : null,
        buysToday: Math.max(0, Math.floor(Number(parsed.buysToday) || 0)),
        total: Math.max(0, Math.floor(Number(parsed.total) || 0)),
      };
    } catch {
      return { lastDate: null, buysToday: 0, total: 0 };
    }
  }

  function _markDailyFragmentChestBoughtLocal() {
    const today = _currentUtcDateKey();
    const state = _loadDailyFragmentChestLocal();
    const alreadyBoughtToday = state.lastDate === today && state.buysToday > 0;
    const next = {
      lastDate: today,
      buysToday: Math.max(1, state.lastDate === today ? state.buysToday : 0),
      total: state.total + (alreadyBoughtToday ? 0 : 1),
    };
    try { localStorage.setItem(DAILY_FRAGMENT_CHEST_LOCAL_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  function getDailyFragmentChestStatus() {
    const focusId = getFocusItem();
    const status = focusId ? getCraftStatus(focusId) : null;
    const today = _currentUtcDateKey();
    const localState = _loadDailyFragmentChestLocal();
    const buysToday = localState.lastDate === today ? localState.buysToday : 0;
    const boughtToday = buysToday >= DAILY_FRAGMENT_CHEST_LIMIT;
    const balance = Save.getCoins();
    const award = status && status.valid
      ? Math.min(DAILY_FRAGMENT_CHEST_FRAGMENTS, Math.max(0, status.missing || 0))
      : 0;

    let reason = 'Choose Focus';
    if (status && status.valid) {
      if (status.owned) reason = 'Already owned';
      else if ((status.missing || 0) <= 0 || status.hasFragments) reason = 'Ready to craft';
      else if (boughtToday) reason = 'Available tomorrow';
      else if (balance < DAILY_FRAGMENT_CHEST_COST) reason = `Need ${DAILY_FRAGMENT_CHEST_COST - balance} coins`;
      else reason = `+${award} Focus fragments`;
    }

    return {
      itemId: focusId,
      award,
      cost: DAILY_FRAGMENT_CHEST_COST,
      boughtToday,
      buysToday,
      reason,
      canBuy: Boolean(status && status.valid && !status.owned && award > 0 && !boughtToday && balance >= DAILY_FRAGMENT_CHEST_COST),
    };
  }

  function buyDailyFragmentChestLocal() {
    const chest = getDailyFragmentChestStatus();
    if (!chest.canBuy || !chest.itemId) return false;

    const meta = getCraftMeta(chest.itemId);
    if (!meta) return false;
    const d = _migrateEconomy(loadShopData());
    const current = Math.max(0, Math.floor(Number(d.fragments[chest.itemId]) || 0));
    d.fragments[chest.itemId] = Math.min(meta.fragments, current + DAILY_FRAGMENT_CHEST_FRAGMENTS);
    saveShopDataLocal(d);
    Save.addCoins(-DAILY_FRAGMENT_CHEST_COST);
    _markDailyFragmentChestBoughtLocal();
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return true;
  }

  async function buyDailyFragmentChestServerFirst() {
    const ok = await _runEconomyAction('dailyFragmentChest', undefined, () => buyDailyFragmentChestLocal());
    if (ok) _markDailyFragmentChestBoughtLocal();
    return ok;
  }

  function getBoosterCharges() {
    const d = _migrateCharges(loadShopData());
    return d.boosterCharges || {};
  }
  function getBoosterCount(id) { return getBoosterCharges()[id] || 0; }
  function hasBoosted(id) { return getBoosterCount(id) > 0; }
  function addBoosterCharges(id, amount) {
    const d = _migrateCharges(loadShopData());
    const charges = d.boosterCharges || {};
    charges[id] = (charges[id] || 0) + amount;
    d.boosterCharges = charges;
    delete d.boosters;
    saveShopData(d);
  }
  function useBooster(id) {
    const d = _migrateCharges(loadShopData());
    const charges = d.boosterCharges || {};
    if ((charges[id] || 0) > 0) {
      charges[id]--;
      d.boosterCharges = charges;
      saveShopData(d);
      return true;
    }
    return false;
  }
  function spendBoosterLocal(id) {
    const d = _migrateCharges(loadShopData());
    const charges = d.boosterCharges || {};
    if ((charges[id] || 0) > 0) {
      charges[id]--;
      d.boosterCharges = charges;
      saveShopDataLocal(d);
      return true;
    }
    return false;
  }

  function own(id) {
    const d = loadShopData();
    const owned = d.owned || ['skin_cryptokid'];
    if (!owned.includes(id)) owned.push(id);
    d.owned = owned;
    saveShopData(d);
  }
  function equip(id) {
    const d = loadShopData();
    d.equipped = id;
    saveShopData(d);
    if (typeof Renderer !== 'undefined') Renderer.reloadPlayerSprite();
    if (typeof refreshGearViews === 'function') refreshGearViews();
  }
  function getDeathPacks() { return loadShopData().deathPacks || []; }
  function getEquippedDeath() { return loadShopData().equippedDeath || 'default'; }
  function ownDeathPack(id) {
    const d = loadShopData();
    const packs = d.deathPacks || [];
    if (!packs.includes(id)) packs.push(id);
    d.deathPacks = packs;
    saveShopData(d);
  }
  function equipDeath(id) {
    const d = loadShopData();
    d.equippedDeath = id;
    saveShopData(d);
  }

  // ── Trails (следы персонажа) ──
  function getTrailPacks() { return loadShopData().trailPacks || []; }
  function getEquippedTrail() {
    const id = loadShopData().equippedTrail || 'default';
    // Enforce the claim gate: an unclaimed trail falls back to default footprints.
    return _trailUnlocked(id) ? id : 'default';
  }
  function getTrailMeta(id) {
    if (id === 'default') return DEFAULT_TRAIL;
    return TRAIL_PACKS.find(item => item.id === id) || DEFAULT_TRAIL;
  }
  // Trails (except the free default) require an on-chain NFT claim before equipping.
  function _trailUnlocked(id) {
    if (id === 'default')       return true;   // free default — no claim needed
    if (!window.__NFT_DEPLOYED) return true;   // NFT not deployed — open access
    return _isNftClaimed(id);
  }
  function getTrailOptions() {
    const validTrails = new Set(TRAIL_PACKS.map(item => item.id));
    return [...new Set(['default', ...getTrailPacks().filter(id => validTrails.has(id) && _trailUnlocked(id))])];
  }
  function equipTrailLocal(id) {
    if (!getTrailOptions().includes(id)) return false;
    const d = loadShopData();
    d.equippedTrail = id;
    saveShopDataLocal(d);
    if (typeof refreshGearViews === 'function') refreshGearViews();
    return true;
  }
  function ownTrailPack(id) {
    const d = loadShopData();
    const packs = d.trailPacks || [];
    if (!packs.includes(id)) packs.push(id);
    d.trailPacks = packs;
    saveShopData(d);
  }
  function equipTrail(id) {
    const d = loadShopData();
    d.equippedTrail = id;
    saveShopData(d);
    if (typeof refreshGearViews === 'function') refreshGearViews();
  }

  // ── Вкладки ──
  function setTab(tab) {
    shopTab = tab;
    const btnS = document.getElementById('shop-tab-skins');
    const btnB = document.getElementById('shop-tab-boosters');
    const btnT = document.getElementById('shop-tab-trails');
    const btnE = document.getElementById('shop-tab-effects');
    if (btnS) btnS.className = 'shop-tab' + (tab === 'skins' ? ' shop-tab-active' : '');
    if (btnB) btnB.className = 'shop-tab' + (tab === 'boosters' ? ' shop-tab-active' : '');
    if (btnT) btnT.className = 'shop-tab' + (tab === 'trails' ? ' shop-tab-active' : '');
    if (btnE) btnE.className = 'shop-tab' + (tab === 'effects' ? ' shop-tab-active' : '');
    renderContent();
  }

  function renderContent() {
    if (shopTab === 'boosters')     renderBoosters();
    else if (shopTab === 'trails')  renderTrails();
    else if (shopTab === 'effects') renderEffects();
    else                            renderSkins();
  }

  // ── Рендер скинов ──
  // Skins (except the free starter) require an on-chain NFT claim before equipping.
  const _FREE_SKINS = ['skin_cryptokid']; // always equippable without claim

  function _skinUnlocked(id) {
    if (_FREE_SKINS.includes(id)) return true;   // starter skin — no claim needed
    if (!window.__NFT_DEPLOYED)   return true;   // NFT not deployed — open access
    return _isNftClaimed(id);
  }

  function _shopEconomyHtml(itemId, isOwned) {
    const status = getCraftStatus(itemId);
    if (!status.valid || isOwned || status.owned) return '';

    const activeClass = status.focus ? ' shop-focus-active' : '';
    const readyClass = status.hasFragments ? ' shop-focus-ready' : '';
    const focusAction = status.focus
      ? '<span class="shop-focus-pill">FOCUS</span>'
      : `<button class="shop-btn shop-btn-focus" data-id="${itemId}">Focus</button>`;

    const craftAction = status.hasFragments
      ? `<button class="shop-btn shop-btn-craft${status.canCraft ? '' : ' disabled'}" data-id="${itemId}"${status.canCraft ? '' : ' disabled'}>Craft · ${status.craftFee}</button>`
      : '';

    const topUpAction = status.focus && status.topUpAmount > 0
      ? `<button class="shop-btn shop-btn-topup${status.canTopUp ? '' : ' disabled'}" data-id="${itemId}" data-amount="${status.topUpAmount}"${status.canTopUp ? '' : ' disabled'}>+${status.topUpAmount} · ${status.topUpCostTotal}</button>`
      : '';

    const hint = status.hasFragments
      ? (status.canCraft ? 'Ready' : `Need ${status.craftFee} coins`)
      : `${status.missing} left`;
    const chestHtml = status.focus ? _dailyFragmentChestHtml(status) : '';

    return `
          <div class="shop-focus-row${activeClass}${readyClass}">
            <div class="shop-focus-head">
              <span>${status.tier} fragments</span>
              <span class="shop-focus-count">${status.fragments}/${status.target}</span>
            </div>
            <div class="shop-fragment-track"><span class="shop-fragment-fill" style="width:${status.pct}%"></span></div>
            <div class="shop-focus-actions">
              <span class="shop-focus-hint">${hint}</span>
              ${focusAction}
              ${topUpAction}
              ${craftAction}
            </div>
          </div>
          ${chestHtml}`;
  }

  function _dailyFragmentChestHtml(status) {
    const chest = getDailyFragmentChestStatus();
    if (!status.focus || chest.itemId !== status.itemId) return '';

    const disabledClass = chest.canBuy ? '' : ' disabled';
    const disabledAttr = chest.canBuy ? '' : ' disabled';
    const rewardLabel = chest.award > 0 ? `+${chest.award}` : `+${DAILY_FRAGMENT_CHEST_FRAGMENTS}`;

    return `
          <div class="daily-fragment-chest${chest.canBuy ? '' : ' daily-fragment-chest-locked'}">
            <div class="daily-fragment-chest-copy">
              <span class="daily-fragment-chest-kicker">Daily chest</span>
              <span class="daily-fragment-chest-text">${chest.reason}</span>
            </div>
            <button class="shop-btn shop-btn-daily-chest${disabledClass}"${disabledAttr}>
              <span>${rewardLabel}</span>
              ${_uiIconHtml('fragments', 'daily-fragment-chest-gem', 'fragments')}
              <span class="daily-fragment-chest-price"><img src="/game/coin.png" alt="coins"> ${chest.cost}</span>
            </button>
          </div>`;
  }

  function _bindEconomyBtns(container) {
    container.querySelectorAll('.shop-btn-focus').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const ok = await setFocusItemServerFirst(btn.dataset.id);
        if (ok) render();
        else btn.disabled = false;
      });
    });
    container.querySelectorAll('.shop-btn-topup').forEach(btn => {
      if (btn.disabled || btn.classList.contains('disabled')) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const ok = await topUpFragmentsServerFirst(btn.dataset.id);
        if (ok) render();
        else btn.disabled = false;
      });
    });
    container.querySelectorAll('.shop-btn-craft').forEach(btn => {
      if (btn.disabled || btn.classList.contains('disabled')) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const ok = await craftItemServerFirst(btn.dataset.id);
        if (ok) render();
        else btn.disabled = false;
      });
    });
    container.querySelectorAll('.shop-btn-daily-chest').forEach(btn => {
      if (btn.disabled || btn.classList.contains('disabled')) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const ok = await buyDailyFragmentChestServerFirst();
        if (ok) render();
        else btn.disabled = false;
      });
    });
  }

  function renderFocusStrip() {
    const strip = document.getElementById('menu-focus-strip');
    const title = document.getElementById('menu-focus-title');
    const progress = document.getElementById('menu-focus-progress');
    const fill = document.getElementById('menu-focus-fill');
    const poolEl = document.getElementById('menu-focus-pool');
    if (!strip || !title || !progress || !fill) return;

    const pooled = getPooledFragments();
    if (poolEl) poolEl.textContent = pooled > 0 ? `Pool: ${pooled}` : '';

    const focusId = getFocusItem();
    if (!focusId) {
      strip.classList.add('hidden');
      return;
    }

    const status = getCraftStatus(focusId);
    if (!status.valid || status.owned) {
      strip.classList.add('hidden');
      return;
    }

    strip.classList.remove('hidden');
    title.textContent = status.name;
    progress.textContent = `${status.fragments}/${status.target}`;
    fill.style.width = `${status.pct}%`;
  }

  function renderSkins() {
    const container = document.getElementById('shop-items');
    if (!container) return;
    const balance  = Save.getCoins();
    const owned    = getOwned();
    const equipped = getEquipped();

    container.innerHTML = '';
    for (const item of ITEMS) {
      const isOwned    = owned.includes(item.id);
      const isEquipped = equipped === item.id;
      const canDirectBuy = _directBuyAvailable(item.id);
      const canAfford  = canDirectBuy && balance >= item.price;
      const isUnlocked = _skinUnlocked(item.id); // claimed or free
      const needsClaim = isOwned && !isUnlocked;

      const iconHtml = item.sprite
        ? `<span class="shop-icon shop-icon-img"><img src="${item.sprite}" alt="${item.name}" style="width:48px;height:48px;object-fit:contain;display:block;image-rendering:pixelated;"></span>`
        : `<span class="shop-icon">${item.icon}</span>`;

      // Info row: show claimed badge for claimed skins; nothing for unclaimed/free
      const nftInfoHtml = (isOwned && window.__NFT_DEPLOYED && !_FREE_SKINS.includes(item.id))
        ? `<div class="shop-nft-row">${isUnlocked ? '<span class="shop-nft-claimed">✓ CLAIMED</span>' : ''}</div>`
        : '';

      // Action: equipped → ON | owned+unlocked → Equip | owned+locked → Claim to Equip | not owned → Buy
      let actionHtml;
      if (isEquipped) {
        actionHtml = '<span class="shop-badge-on">✓ ON</span>';
      } else if (isOwned && isUnlocked) {
        actionHtml = `<button class="shop-btn shop-btn-equip" data-id="${item.id}">Equip</button>`;
      } else if (needsClaim) {
        actionHtml = `<button class="shop-btn claim-action shop-btn-claim-equip" data-id="${item.id}">CLAIM</button>`;
      } else if (!canDirectBuy) {
        actionHtml = '<span class="shop-badge-owned">Craft only</span>';
      } else {
        actionHtml = `<button class="shop-btn shop-btn-buy${canAfford ? '' : ' disabled'}" data-id="${item.id}" data-price="${item.price}" style="display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;"><img src="/game/coin.png" style="width:14px;height:14px;object-fit:contain;display:block;flex-shrink:0;"> ${item.price}</button>`;
      }

      const el = document.createElement('div');
      el.className = 'shop-item' + (isEquipped ? ' shop-item-equipped' : '');
      el.dataset.shopItem = item.id;
      el.innerHTML = `
        ${iconHtml}
        <div class="shop-info">
          <span class="shop-name">${item.name}</span>
          <span class="shop-desc">${item.desc}${needsClaim ? '<br><span class="shop-nft-unlock-hint">Claim NFT to unlock</span>' : ''}</span>
          ${nftInfoHtml}
          ${_shopEconomyHtml(item.id, isOwned)}
        </div>
        <div class="shop-action">${actionHtml}</div>`;
      container.appendChild(el);
    }

    // Equip (only possible for unlocked skins — double-check guard)
    container.querySelectorAll('.shop-btn-equip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!_skinUnlocked(id)) return;
        equip(id);
        if (typeof Renderer !== 'undefined') Renderer.reloadPlayerSprite();
        render();
      });
    });

    // Claim to Equip
    container.querySelectorAll('.shop-btn-claim-equip').forEach(btn => {
      btn.addEventListener('click', () => {
        const mintFn = window.__NFT_MINT;
        if (!mintFn || window.__NFT_PENDING) return;
        btn.textContent = 'CLAIMING...';
        btn.disabled    = true;
        mintFn(btn.dataset.id);
      });
    });

    // Buy with coins (skin still needs claiming after purchase)
    container.querySelectorAll('.shop-btn-buy').forEach(btn => {
      if (btn.classList.contains('disabled')) return;
      btn.addEventListener('click', async () => {
        const price = parseInt(btn.dataset.price);
        btn.disabled = true;
        const ok = await buyShopItemServerFirst(btn.dataset.id, price);
        if (ok) render();
        else btn.disabled = false;
      });
    });
    _bindEconomyBtns(container);
  }

  // ── Рендер бустеров (расходуемые) ──
  function renderBoosters() {
    const container = document.getElementById('shop-items');
    if (!container) return;
    const balance = Save.getCoins();

    container.innerHTML = '';
    for (const item of BOOSTERS) {
      const charges   = getBoosterCount(item.id);
      const hasActive = charges > 0;
      const canAfford = balance >= item.packPrice;

      const el = document.createElement('div');
      el.className = 'shop-item shop-item-boost' + (hasActive ? ' shop-item-equipped' : '');
      const boosterIconHtml = item.sprite
        ? `<span class="shop-icon shop-icon-img"><img src="${item.sprite}" alt="${item.name}" style="width:48px;height:48px;object-fit:contain;display:block;image-rendering:pixelated;"></span>`
        : `<span class="shop-icon">${item.icon}</span>`;
      el.innerHTML = `
        ${boosterIconHtml}
        <div class="shop-info">
          <span class="shop-name">${item.name}</span>
          <span class="shop-desc">${item.desc}</span>
        </div>
        <div class="shop-action shop-action-boost">
          ${hasActive ? `<span class="shop-badge-owned" style="font-size:0.6rem;padding:2px 8px;">${charges} left</span>` : ''}
          <button class="shop-btn shop-btn-buy shop-btn-booster${canAfford ? '' : ' disabled'}" data-id="${item.id}" data-price="${item.packPrice}" data-pack="${item.packSize}" style="display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;white-space:nowrap;">+${item.packSize} · <img src="/game/coin.png" style="width:14px;height:14px;object-fit:contain;display:block;flex-shrink:0;vertical-align:middle;"> ${item.packPrice}</button>
        </div>`;
      container.appendChild(el);
    }

    container.querySelectorAll('.shop-btn-buy').forEach(btn => {
      if (btn.classList.contains('disabled')) return;
      btn.addEventListener('click', async () => {
        const price = parseInt(btn.dataset.price);
        const pack  = parseInt(btn.dataset.pack);
        btn.disabled = true;
        const ok = await buyBoosterPackServerFirst(btn.dataset.id, price, pack);
        if (ok) render();
        else btn.disabled = false;
      });
    });
  }

  // ── Рендер паков анимаций ──
  function renderEffects() {
    const container = document.getElementById('shop-items');
    if (!container) return;
    const balance  = Save.getCoins();
    const packs    = getDeathPacks();
    const equipped = getEquippedDeath();

    container.innerHTML = '';

    // Default (free)
    const defEl = document.createElement('div');
    defEl.className = 'shop-item' + (equipped === 'default' ? ' shop-item-equipped' : '');
    defEl.innerHTML = `
      <span class="shop-icon">${_uiIconHtml('celebration', 'shop-effect-icon', 'default effect')}</span>
      <div class="shop-info">
        <span class="shop-name">Default</span>
        <span class="shop-desc">Basic flash and particles</span>
      </div>
      <div class="shop-action">
        ${equipped === 'default'
          ? '<span class="shop-badge-on">✓ ON</span>'
          : '<button class="shop-btn shop-btn-equip-death" data-id="default">Equip</button>'}
      </div>`;
    container.appendChild(defEl);

    for (const item of DEATH_PACKS) {
      const isOwned    = packs.includes(item.id);
      const isEquipped = equipped === item.id;
      const canDirectBuy = _directBuyAvailable(item.id);
      const canAfford  = canDirectBuy && balance >= item.price;

      const el = document.createElement('div');
      el.className = 'shop-item' + (isEquipped ? ' shop-item-equipped' : '');
      el.dataset.shopItem = item.id;
      el.innerHTML = `
        <span class="shop-icon">${_imgHtml(item.iconSrc || '/game/ui-icons/celebration.png', 'shop-effect-icon ui-icon', item.name, ' aria-hidden="true"')}</span>
        <div class="shop-info">
          <span class="shop-name">${item.name}</span>
          <span class="shop-desc">${item.desc}</span>
          ${_shopEconomyHtml(item.id, isOwned)}
        </div>
        <div class="shop-action">
          ${isEquipped
            ? '<span class="shop-badge-on">✓ ON</span>'
            : isOwned
              ? `<button class="shop-btn shop-btn-equip-death" data-id="${item.id}">Equip</button>`
              : canDirectBuy
                ? `<button class="shop-btn shop-btn-buy${canAfford ? '' : ' disabled'}" data-id="${item.id}" data-price="${item.price}" style="display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;"><img src="/game/coin.png" style="width:14px;height:14px;object-fit:contain;display:block;flex-shrink:0;"> ${item.price}</button>`
                : '<span class="shop-badge-owned">Craft only</span>'
          }
        </div>`;
      container.appendChild(el);
    }

    container.querySelectorAll('.shop-btn-equip-death').forEach(btn => {
      btn.addEventListener('click', () => {
        equipDeath(btn.dataset.id);
        render();
      });
    });
    container.querySelectorAll('.shop-btn-buy').forEach(btn => {
      if (btn.classList.contains('disabled')) return;
      btn.addEventListener('click', async () => {
        const price = parseInt(btn.dataset.price);
        btn.disabled = true;
        const ok = await buyShopItemServerFirst(btn.dataset.id, price, () => equipDeath(btn.dataset.id));
        if (ok) render();
        else btn.disabled = false;
      });
    });
    _bindEconomyBtns(container);
  }

  // ── Рендер следов ──
  function renderTrails() {
    const container = document.getElementById('shop-items');
    if (!container) return;
    const balance  = Save.getCoins();
    const packs    = getTrailPacks();
    const equipped = getEquippedTrail();

    container.innerHTML = '';

    // Default (free)
    const defEl = document.createElement('div');
    defEl.className = 'shop-item' + (equipped === 'default' ? ' shop-item-equipped' : '');
    defEl.innerHTML = `
      <span class="shop-icon shop-icon-img"><img src="/nft/images/trail_default.png" alt="Default" style="width:48px;height:48px;object-fit:contain;display:block;image-rendering:pixelated;"></span>
      <div class="shop-info">
        <span class="shop-name">Default</span>
        <span class="shop-desc">Footprints, dust and ripples</span>
      </div>
      <div class="shop-action">
        ${equipped === 'default'
          ? '<span class="shop-badge-on">✓ ON</span>'
          : '<button class="shop-btn shop-btn-equip-trail" data-id="default">Equip</button>'}
      </div>`;
    container.appendChild(defEl);

    for (const item of TRAIL_PACKS) {
      const isOwned    = packs.includes(item.id);
      const isEquipped = equipped === item.id;
      const canDirectBuy = _directBuyAvailable(item.id);
      const canAfford  = canDirectBuy && balance >= item.price;
      const isUnlocked = _trailUnlocked(item.id); // claimed or open access
      const needsClaim = isOwned && !isUnlocked;

      const trailIconHtml = item.sprite
        ? `<span class="shop-icon shop-icon-img"><img src="${item.sprite}" alt="${item.name}" style="width:48px;height:48px;object-fit:contain;display:block;image-rendering:pixelated;"></span>`
        : `<span class="shop-icon">${item.icon}</span>`;

      // Info row: show claimed badge for claimed trails; nothing for unclaimed
      const nftInfoHtml = (isOwned && window.__NFT_DEPLOYED)
        ? `<div class="shop-nft-row">${isUnlocked ? '<span class="shop-nft-claimed">✓ CLAIMED</span>' : ''}</div>`
        : '';

      // Action: equipped → ON | owned+unlocked → Equip | owned+locked → Claim to Equip | not owned → Buy
      let actionHtml;
      if (isEquipped) {
        actionHtml = '<span class="shop-badge-on">✓ ON</span>';
      } else if (isOwned && isUnlocked) {
        actionHtml = `<button class="shop-btn shop-btn-equip-trail" data-id="${item.id}">Equip</button>`;
      } else if (needsClaim) {
        actionHtml = `<button class="shop-btn claim-action shop-btn-claim-equip-trail" data-id="${item.id}">CLAIM</button>`;
      } else if (canDirectBuy) {
        actionHtml = `<button class="shop-btn shop-btn-buy${canAfford ? '' : ' disabled'}" data-id="${item.id}" data-price="${item.price}" style="display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;"><img src="/game/coin.png" style="width:14px;height:14px;object-fit:contain;display:block;flex-shrink:0;"> ${item.price}</button>`;
      } else {
        actionHtml = '<span class="shop-badge-owned">Craft only</span>';
      }

      const el = document.createElement('div');
      el.className = 'shop-item' + (isEquipped ? ' shop-item-equipped' : '');
      el.dataset.shopItem = item.id;
      el.innerHTML = `
        ${trailIconHtml}
        <div class="shop-info">
          <span class="shop-name">${item.name}</span>
          <span class="shop-desc">${item.desc}${needsClaim ? '<br><span class="shop-nft-unlock-hint">Claim NFT to unlock</span>' : ''}</span>
          ${nftInfoHtml}
          ${_shopEconomyHtml(item.id, isOwned)}
        </div>
        <div class="shop-action">${actionHtml}</div>`;
      container.appendChild(el);
    }

    // Equip (only possible for unlocked trails — double-check guard)
    container.querySelectorAll('.shop-btn-equip-trail').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!_trailUnlocked(id)) return;
        equipTrail(id);
        render();
      });
    });

    // Claim to Equip
    container.querySelectorAll('.shop-btn-claim-equip-trail').forEach(btn => {
      btn.addEventListener('click', () => {
        const mintFn = window.__NFT_MINT;
        if (!mintFn || window.__NFT_PENDING) return;
        btn.textContent = 'CLAIMING...';
        btn.disabled    = true;
        mintFn(btn.dataset.id);
      });
    });

    // Buy with coins (trail still needs claiming after purchase)
    container.querySelectorAll('.shop-btn-buy').forEach(btn => {
      if (btn.classList.contains('disabled')) return;
      btn.addEventListener('click', async () => {
        const price = parseInt(btn.dataset.price);
        btn.disabled = true;
        const ok = await buyShopItemServerFirst(btn.dataset.id, price);
        if (ok) render();
        else btn.disabled = false;
      });
    });
    _bindEconomyBtns(container);
  }

  function render() {
    const coinEl = document.getElementById('shop-coin-count');
    if (coinEl) coinEl.textContent = Save.getCoins();
    renderRunnerStage();
    setTab(shopTab);
  }

  function renderRunnerStage() {
    const equipped = getEquipped();
    const meta = ITEMS.find(item => item.id === equipped) || ITEMS[0];
    const preview = document.getElementById('shop-stage-preview');
    const name = document.getElementById('shop-stage-name');
    const collection = document.getElementById('shop-stage-collection');
    if (preview) {
      preview.src = meta && meta.sprite ? meta.sprite : '/game/chars/cryptokid.png';
      preview.alt = meta ? meta.name : 'Equipped runner';
    }
    if (name) name.textContent = meta ? meta.name : 'Genesis Runner';
    if (collection) collection.textContent = `${getOwned().length} / ${ITEMS.length} skins owned`;
  }

  function getCollectionSummary() {
    return {
      skinsOwned: getOwned().length,
      skinsTotal: ITEMS.length,
      trailsOwned: getTrailPacks().length + 1,
      trailsTotal: TRAIL_PACKS.length + 1,
      boosters: BOOSTERS.reduce((total, booster) => total + getBoosterCount(booster.id), 0),
    };
  }

  // Full catalog with ownership/NFT flags, for the profile collection shelf.
  function getCollectionItems() {
    const owned = getOwned();
    const ownedTrails = getTrailPacks();
    return {
      skins: ITEMS.map(item => ({
        id: item.id, name: item.name, sprite: item.sprite,
        owned: owned.includes(item.id), nft: _isNftClaimed(item.id),
      })),
      trails: [DEFAULT_TRAIL, ...TRAIL_PACKS].map(item => ({
        id: item.id, name: item.name, sprite: item.sprite,
        owned: item.id === 'default' || ownedTrails.includes(item.id),
        nft: item.id !== 'default' && _isNftClaimed(item.id),
      })),
    };
  }

  function refreshVisible() {
    const screen = document.getElementById('screen-shop');
    if (screen && !screen.classList.contains('hidden')) render();
  }

  function getSprite(id) {
    const item = ITEMS.find(i => i.id === id);
    return (item && item.sprite) ? item.sprite : '/game/chars/cryptokid.png';
  }

  function show() {
    shopTab = 'skins';
    render();
    if (typeof UI !== 'undefined') UI.show('shop');
  }

  function showFocusItem() {
    const focusId = getFocusItem();
    const meta = getCraftMeta(focusId);
    if (!meta) {
      show();
      return;
    }
    shopTab = meta.type === 'trail' ? 'trails' : meta.type === 'death' ? 'effects' : 'skins';
    render();
    if (typeof UI !== 'undefined') UI.show('shop');
    setTimeout(() => {
      const el = document.querySelector(`[data-shop-item="${focusId}"]`);
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
    }, 50);
  }

  return {
    show,
    setTab,
    getEquipped,
    getOwned,
    getSprite,
    getSkinMeta,
    getSkinOptions,
    equipSkinLocal,
    applyServerData,
    applyServerEconomyData,
    exportEconomyData,
    hasBoosted,
    useBooster,
    spendBoosterLocal,
    getBoosterCount,
    getEquippedDeath,
    getEquippedTrail,
    getTrailMeta,
    getTrailOptions,
    equipTrailLocal,
    getTrailPacks,
    getCollectionSummary,
    getCollectionItems,
    own,
    ownTrailPack,
    addBoosterCharges,
    refreshVisible,
    renderFocusStrip,
    showFocusItem,
    getCraftMeta,
    getFocusItem,
    getCraftStatus,
    setFocusItemLocal,
    addFragmentsLocal,
    bankPooledFragments,
    getPooledFragments,
    craftItemLocal,
    topUpFragmentsLocal,
    buyDailyFragmentChestLocal,
    applyLocalGearTestFixture,
    applyLocalEconomyTestFixture,
    _markNftClaimedPublic: _markNftClaimed,
    _refreshNft: () => render(),
    _equipPublic: equip,
    _equipTrailPublic: equipTrail,
  };
})();


const RewardEconomy = (() => {
  const CONTAINER_NAMES = {
    gear_crate: 'Gear Crate',
    focus_chest: 'Focus Chest',
    rare_crate: 'Rare Crate',
    epic_crate: 'Epic Crate',
    legendary_crate: 'Legendary Crate',
    legendary_focus_bundle: 'Legendary Focus Bundle',
  };

  const BOOSTER_NAMES = {
    boost_magnet: 'Coin Magnet',
    boost_double: 'Double Coins',
    boost_shield: 'Second Chance',
  };

  function getCheckInReward(daySlot) {
    const idx = Math.max(0, Math.floor(Number(daySlot) || 0)) % CHECKIN_REWARD_CYCLE.length;
    return CHECKIN_REWARD_CYCLE[idx];
  }

  function _emptyTotals() {
    return { coins: 0, fragments: 0, boosters: 0, xp: 0 };
  }

  function collect(bundle, totals = _emptyTotals(), depth = 0) {
    if (!bundle || depth > 4) return totals;
    if (bundle.container) collect(REWARD_CONTAINERS_LOCAL[bundle.container], totals, depth + 1);
    totals.coins += Math.max(0, Math.floor(Number(bundle.coins) || 0));
    totals.fragments += Math.max(0, Math.floor(Number(bundle.fragments) || 0));
    totals.boosters += Math.max(0, Math.floor(Number(bundle.boosters) || 0));
    totals.xp += Math.max(0, Math.floor(Number(bundle.xp) || 0));
    return totals;
  }

  function label(bundle) {
    if (!bundle) return '';
    if (bundle.container) return CONTAINER_NAMES[bundle.container] || 'Reward Crate';
    const parts = [];
    if (bundle.coins) parts.push(`+${bundle.coins} coins`);
    if (bundle.fragments) parts.push(`+${bundle.fragments} Focus fragments`);
    if (bundle.boosters) parts.push(`+${bundle.boosters} booster${bundle.boosters === 1 ? '' : 's'}`);
    if (bundle.xp) parts.push(`+${bundle.xp} XP`);
    return parts.join(' + ') || 'Reward';
  }

  function shortLabel(bundle) {
    const totals = collect(bundle);
    const parts = [];
    if (totals.coins) parts.push(`+${totals.coins}`);
    if (totals.fragments) parts.push(`+${totals.fragments} fragments`);
    if (totals.boosters) parts.push(`+${totals.boosters} boost`);
    if (totals.xp) parts.push(`+${totals.xp} XP`);
    return parts.join(' + ') || label(bundle);
  }

  function currencyHtml(kind, amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!value) return '';
    const iconSrc = kind === 'fragments' ? '/game/ui-icons/fragments.png' : '/game/coin.png';
    const safeKind = kind === 'fragments' ? 'fragments' : 'coins';
    return `<span class="reward-inline reward-inline-${safeKind}">` +
      _imgHtml(iconSrc, `reward-inline-icon reward-inline-icon-${safeKind}`, '', ' aria-hidden="true"') +
      `<span class="reward-inline-plus">+</span><span class="reward-inline-value">${value}</span></span>`;
  }

  function xpHtml(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!value) return '';
    return `<span class="reward-inline reward-inline-xp">` +
      _uiIconHtml('xp', 'reward-inline-icon reward-inline-icon-xp', 'XP') +
      `<span class="reward-inline-plus">+</span><span class="reward-inline-value">${value}</span><span class="reward-inline-label">XP</span></span>`;
  }

  function _textRewardHtml(text) {
    return `<span class="reward-inline reward-inline-text">${_escapeHtml(text)}</span>`;
  }

  function _bundleHtml(bundle, options = {}) {
    if (!bundle) return '';
    if (bundle.container && !options.expandContainer) {
      return _escapeHtml(CONTAINER_NAMES[bundle.container] || 'Reward Crate');
    }

    const totals = options.expandContainer ? collect(bundle) : {
      coins: Math.max(0, Math.floor(Number(bundle.coins) || 0)),
      fragments: Math.max(0, Math.floor(Number(bundle.fragments) || 0)),
      boosters: Math.max(0, Math.floor(Number(bundle.boosters) || 0)),
      xp: Math.max(0, Math.floor(Number(bundle.xp) || 0)),
    };
    const parts = [];
    if (totals.coins) parts.push(currencyHtml('coins', totals.coins));
    if (totals.fragments) parts.push(currencyHtml('fragments', totals.fragments));
    if (totals.boosters) parts.push(_textRewardHtml(`+${totals.boosters} booster${totals.boosters === 1 ? '' : 's'}`));
    if (totals.xp) parts.push(xpHtml(totals.xp));
    return parts.join('<span class="reward-separator">&middot;</span>') || _escapeHtml(label(bundle));
  }

  function labelHtml(bundle) {
    return _bundleHtml(bundle, { compact: false, expandContainer: false });
  }

  function shortLabelHtml(bundle) {
    return _bundleHtml(bundle, { compact: true, expandContainer: true });
  }

  function setCoinsLocal(balance) {
    const d = Save.load();
    d.coins = Math.max(0, Math.floor(Number(balance) || 0));
    Save.save(d);
    if (typeof UI !== 'undefined') UI.updateCoins(d.coins);
    return d.coins;
  }

  function _syncCoins() {
    const syncFn = window.__BASE_SYNC_COINS;
    if (typeof syncFn === 'function') syncFn(Save.getCoins());
  }

  function _awardCoins(amount) {
    const coins = Math.max(0, Math.floor(Number(amount) || 0));
    if (!coins) return Save.getCoins();
    const next = Save.addCoins(coins);
    if (typeof UI !== 'undefined') UI.updateCoins(next);
    return next;
  }

  function _awardFragments(amount) {
    const fragments = Math.max(0, Math.floor(Number(amount) || 0));
    if (!fragments) return { awarded: 0, fragmentsPooled: 0 };
    if (typeof Shop === 'undefined' || !Shop.addFragmentsLocal) {
      return { awarded: 0, fragmentsPooled: fragments };
    }
    const focusId = Shop.getFocusItem ? Shop.getFocusItem() : null;
    if (!focusId) {
      if (Shop.bankPooledFragments) Shop.bankPooledFragments(fragments);
      return { awarded: 0, fragmentsPooled: fragments };
    }
    const split = Shop.addFragmentsLocal(focusId, fragments);
    return { awarded: split.toFocus || 0, fragmentsPooled: split.toPool || 0 };
  }

  function _awardBoosters(amount) {
    if (typeof Shop === 'undefined' || !Shop.addBoosterCharges) return;
    const count = Math.max(0, Math.floor(Number(amount) || 0));
    for (let i = 0; i < count; i++) {
      const id = BOOSTER_IDS[Math.floor(Math.random() * BOOSTER_IDS.length)];
      Shop.addBoosterCharges(id, 1);
    }
  }

  function applyBundleLocal(bundle, source = 'reward') {
    const totals = collect(bundle);
    let fragmentResult = { awarded: 0, fragmentsPooled: 0 };
    if (totals.coins) _awardCoins(totals.coins);
    if (totals.fragments) fragmentResult = _awardFragments(totals.fragments);
    if (totals.boosters) _awardBoosters(totals.boosters);
    if (totals.xp && typeof Xp !== 'undefined' && Xp.add) Xp.add(totals.xp);
    if (typeof Sound !== 'undefined' && (totals.coins || totals.fragments || totals.boosters || totals.xp)) Sound.coin();
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    if (source !== 'server-spin') _syncCoins();
    return {
      ...totals,
      coins: totals.coins,
      fragmentsAwarded: fragmentResult.awarded,
      fragmentsPooled: fragmentResult.fragmentsPooled,
      label: label(bundle),
      shortLabel: shortLabel(bundle),
    };
  }

  function resolveBoosterName(id) {
    return BOOSTER_NAMES[id] || id;
  }

  return {
    getCheckInReward,
    collect,
    label,
    shortLabel,
    labelHtml,
    shortLabelHtml,
    currencyHtml,
    applyBundleLocal,
    setCoinsLocal,
    resolveBoosterName,
  };
})();


/* ===== loadout.js ===== */
const Loadout = (() => {
  const BOOSTERS = [
    { id: 'boost_magnet', key: 'magnet', name: 'Coin Magnet', btn: 'loadout-boost-magnet', count: 'loadout-count-magnet' },
    { id: 'boost_double', key: 'double', name: 'Double Coins', btn: 'loadout-boost-double', count: 'loadout-count-double' },
    { id: 'boost_shield', key: 'shield', name: 'Second Chance', btn: 'loadout-boost-shield', count: 'loadout-count-shield' },
  ];

  let selected = new Set();
  let active = {};
  let mode = 'standalone';
  let starting = false;

  function isActive(id) { return !!active[id]; }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setImage(id, src, alt) {
    const el = document.getElementById(id);
    if (!el) return;
    el.src = src;
    el.alt = alt;
  }

  function setArrowState(prevId, nextId, enabled) {
    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);
    if (prev) prev.disabled = !enabled;
    if (next) next.disabled = !enabled;
  }

  function setInlineMessage(message = '') {
    const el = document.getElementById('loadout-inline-message');
    if (el) el.textContent = message;
  }

  function setMode(nextMode) {
    mode = nextMode;
    const screen = document.getElementById('screen-loadout');
    const title = document.getElementById('loadout-title');
    const result = document.getElementById('run-complete-result');
    const startBtn = document.getElementById('btn-loadout-start');
    const backBtn = document.getElementById('btn-loadout-back');
    const scroll = document.getElementById('loadout-scroll');
    const isRunComplete = mode === 'runcomplete';

    if (screen) screen.classList.toggle('loadout-run-complete', isRunComplete);
    if (title) title.textContent = isRunComplete ? 'RUN COMPLETE' : 'LOADOUT';
    if (result) result.classList.toggle('hidden', !isRunComplete);
    if (startBtn) startBtn.textContent = isRunComplete ? 'START NEXT RUN' : 'START RUN';
    if (backBtn) backBtn.textContent = isRunComplete ? 'MENU' : '← MENU';
    if (scroll) scroll.scrollTop = 0;
    setInlineMessage();
  }

  function renderGear() {
    if (typeof Shop === 'undefined') return;

    const skinOptions = Shop.getSkinOptions();
    const currentSkin = Shop.getEquipped();
    const skinId = skinOptions.includes(currentSkin) ? currentSkin : skinOptions[0];
    const skinMeta = Shop.getSkinMeta(skinId);
    const skinIndex = Math.max(0, skinOptions.indexOf(skinId));
    setImage('loadout-skin-preview', skinMeta.sprite, skinMeta.name);
    setText('loadout-skin-name', skinMeta.name);
    setText('loadout-skin-count', `${skinIndex + 1}/${skinOptions.length}`);
    setArrowState('btn-loadout-skin-prev', 'btn-loadout-skin-next', skinOptions.length > 1);

    const trailOptions = Shop.getTrailOptions();
    const currentTrail = Shop.getEquippedTrail();
    const trailId = trailOptions.includes(currentTrail) ? currentTrail : trailOptions[0];
    const trailMeta = Shop.getTrailMeta(trailId);
    const trailIndex = Math.max(0, trailOptions.indexOf(trailId));
    setImage('loadout-trail-preview', trailMeta.sprite, trailMeta.name);
    setText('loadout-trail-name', trailMeta.name);
    setText('loadout-trail-count', `${trailIndex + 1}/${trailOptions.length}`);
    setArrowState('btn-loadout-trail-prev', 'btn-loadout-trail-next', trailOptions.length > 1);
  }

  function renderBuildSummary() {
    const summary = document.getElementById('loadout-build-summary');
    const title = document.getElementById('loadout-build-title');
    const hint = document.getElementById('loadout-build-hint');
    if (!summary || !title || !hint) return;

    const chosen = BOOSTERS.filter(b => selected.has(b.id));
    summary.classList.toggle('loadout-build-empty', chosen.length === 0);

    if (chosen.length === 0) {
      title.textContent = 'No boosters selected';
      hint.textContent = 'Pick boosters to shape this run';
      return;
    }

    const hasMagnet = selected.has('boost_magnet');
    const hasDouble = selected.has('boost_double');
    const hasShield = selected.has('boost_shield');
    if (hasMagnet && hasDouble && hasShield) {
      title.textContent = 'Full kit run';
      hint.textContent = 'Pull coins, double value, and survive one hit';
    } else if (hasMagnet && hasDouble) {
      title.textContent = 'Coin rush build';
      hint.textContent = 'Magnet pickups land as doubled coins';
    } else if (hasShield && chosen.length === 1) {
      title.textContent = 'Safety run';
      hint.textContent = 'One crash turns into a second chance';
    } else {
      title.textContent = chosen.map(b => b.name).join(' + ');
      hint.textContent = chosen.length === 1 ? 'One focused boost for this run' : 'Selected boosts stay visible in the HUD';
    }
  }

  function render() {
    const coinEl = document.getElementById('loadout-coin-count');
    if (coinEl) coinEl.textContent = Save.getCoins();
    renderGear();

    for (const b of BOOSTERS) {
      const btn = document.getElementById(b.btn);
      const countEl = document.getElementById(b.count);
      const count = (typeof Shop !== 'undefined') ? Shop.getBoosterCount(b.id) : 0;
      if (countEl) countEl.textContent = `x${count}`;
      if (!btn) continue;
      btn.classList.toggle('loadout-card-selected', selected.has(b.id));
      btn.classList.toggle('loadout-card-empty', count <= 0);
      btn.disabled = count <= 0;
    }
    renderBuildSummary();
  }

  function show() {
    mode = 'standalone';
    selected = new Set();
    starting = false;
    setMode(mode);
    render();
    if (typeof UI !== 'undefined') UI.show('loadout');
  }

  function showRunComplete() {
    mode = 'runcomplete';
    selected = new Set();
    starting = false;
    setMode(mode);
    render();
    if (typeof UI !== 'undefined') UI.show('runcomplete');
  }

  function toggle(id) {
    if (typeof Shop === 'undefined' || Shop.getBoosterCount(id) <= 0) return;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    setInlineMessage();
    render();
  }

  function cycleGear(type, dir) {
    if (typeof Shop === 'undefined') return;
    const options = type === 'skin' ? Shop.getSkinOptions() : Shop.getTrailOptions();
    if (options.length <= 1) return;
    const current = type === 'skin' ? Shop.getEquipped() : Shop.getEquippedTrail();
    const currentIndex = Math.max(0, options.indexOf(current));
    const nextId = options[(currentIndex + dir + options.length) % options.length];
    if (type === 'skin') Shop.equipSkinLocal(nextId);
    else Shop.equipTrailLocal(nextId);
    render();
  }

  function startRun() {
    if (starting) return;
    starting = true;

    const flow = window.__BASE_RUN_COMPLETE_FLOW;
    if (!flow || typeof flow.beginRun !== 'function') {
      setInlineMessage('Game is still loading. Try again.');
      starting = false;
      return;
    }

    const unavailable = typeof Shop === 'undefined'
      ? [...selected]
      : [...selected].filter(id => Shop.getBoosterCount(id) <= 0);
    if (unavailable.length > 0) {
      for (const id of unavailable) selected.delete(id);
      render();
      setInlineMessage('A selected booster is no longer available. Review your loadout.');
      starting = false;
      return;
    }

    active = {};
    if (typeof Shop !== 'undefined') {
      for (const id of selected) {
        if (id === 'boost_shield') {
          // Second Chance is consumed in Player.kill() at the moment it saves the player
          if (Shop.getBoosterCount(id) > 0) active[id] = true;
        } else if (Shop.spendBoosterLocal(id)) {
          active[id] = true;
        }
      }
    }
    if (typeof UI !== 'undefined' && UI.setRunBoosters) UI.setRunBoosters(active);
    selected = new Set();
    render();
    initGame();
  }

  function back() {
    selected = new Set();
    starting = false;
    setInlineMessage();
    render();
    goToMenu();
  }

  function bind() {
    for (const b of BOOSTERS) _bind(b.btn, 'click', () => toggle(b.id));
    _bind('btn-loadout-skin-prev', 'click', () => cycleGear('skin', -1));
    _bind('btn-loadout-skin-next', 'click', () => cycleGear('skin', 1));
    _bind('btn-loadout-trail-prev', 'click', () => cycleGear('trail', -1));
    _bind('btn-loadout-trail-next', 'click', () => cycleGear('trail', 1));
    _bind('btn-loadout-start', 'click', startRun);
    _bind('btn-loadout-back', 'click', back);
  }

  return { show, showRunComplete, render, renderGear, bind, isActive };
})();


function refreshGearViews() {
  if (typeof Loadout !== 'undefined' && Loadout.renderGear) Loadout.renderGear();
  if (typeof renderProfileGear === 'function') renderProfileGear();
  if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
}


/* ===== quests.js ===== */
const Quests = (() => {
  const SAVE_KEY = 'quests_v1';
  const _pendingClaims = new Set();

  const DEFS = [
    { id: 'rows', name: 'Marathon Runner', iconSrc: '/game/ui-icons/quests/career-rows.png', desc: 'Run rows across all games', levels: [
      { target: 100, reward: { coins: 35 } }, { target: 300, reward: { boosters: 1 } },
      { target: 700, reward: { fragments: 3 } }, { target: 1400, reward: { coins: 55, boosters: 1 } },
      { target: 2400, reward: { coins: 70, fragments: 5 } }, { target: 4000, reward: { container: 'rare_crate' } },
      { target: 7000, reward: { fragments: 8, boosters: 1 } }, { target: 12000, reward: { container: 'epic_crate' } },
    ]},
    { id: 'coins', name: 'Coin Collector', iconSrc: '/game/ui-icons/quests/career-coins.png', desc: 'Collect coins across all games', levels: [
      { target: 40, reward: { coins: 30 } }, { target: 120, reward: { coins: 45 } },
      { target: 300, reward: { fragments: 3 } }, { target: 600, reward: { coins: 65, boosters: 1 } },
      { target: 1000, reward: { coins: 80, fragments: 5 } }, { target: 1800, reward: { container: 'rare_crate' } },
      { target: 3000, reward: { coins: 120, fragments: 8 } }, { target: 5000, reward: { container: 'epic_crate' } },
    ]},
    { id: 'games', name: 'Dedicated Player', iconSrc: '/game/ui-icons/quests/career-games.png', desc: 'Play games', levels: [
      { target: 5, reward: { boosters: 1 } }, { target: 15, reward: { coins: 35 } },
      { target: 35, reward: { fragments: 3 } }, { target: 70, reward: { boosters: 2 } },
      { target: 120, reward: { coins: 70, fragments: 5 } }, { target: 200, reward: { container: 'rare_crate' } },
      { target: 350, reward: { fragments: 8, boosters: 2 } }, { target: 600, reward: { container: 'epic_crate' } },
    ]},
    { id: 'record', name: 'High Scorer', iconSrc: '/game/ui-icons/quests/career-record.png', desc: 'Reach a high score record', levels: [
      { target: 20, reward: { coins: 45 } }, { target: 40, reward: { fragments: 3 } },
      { target: 80, reward: { coins: 65, boosters: 1 } }, { target: 150, reward: { fragments: 6 } },
      { target: 250, reward: { container: 'rare_crate' } }, { target: 400, reward: { coins: 130, fragments: 8 } },
      { target: 600, reward: { container: 'epic_crate' } }, { target: 900, reward: { container: 'legendary_crate' } },
    ]},
    { id: 'elite_runs', name: 'Elite Runner', iconSrc: '/game/ui-icons/quests/career-elite.png', desc: 'Finish Great or better runs', levels: [
      { target: 1, reward: { coins: 40 } }, { target: 3, reward: { boosters: 1 } },
      { target: 7, reward: { fragments: 3 } }, { target: 15, reward: { coins: 80, boosters: 1 } },
      { target: 30, reward: { fragments: 6 } }, { target: 50, reward: { container: 'rare_crate' } },
      { target: 80, reward: { fragments: 10, boosters: 2 } }, { target: 120, reward: { container: 'epic_crate' } },
    ]},
  ];

  const ROTATION_DEFS = [
    { id: 'daily_games', scope: 'daily', metric: 'games', name: 'Warm-up laps', desc: 'Finish 2 runs', iconSrc: '/game/ui-icons/quests/daily-games.png', target: 2, reward: { coins: 10 } },
    { id: 'daily_rows', scope: 'daily', metric: 'rows', name: 'Keep moving', desc: 'Run 120 rows', iconSrc: '/game/ui-icons/quests/daily-rows.png', target: 120, reward: { xp: 15 } },
    { id: 'daily_coins', scope: 'daily', metric: 'coins', name: 'Pocket change', desc: 'Collect 25 coins', iconSrc: '/game/ui-icons/quests/daily-coins.png', target: 25, reward: { coins: 10 } },
    { id: 'daily_quality', scope: 'daily', metric: 'great_runs', name: 'Strong finish', desc: 'Finish one Great+ run', iconSrc: '/game/ui-icons/quests/daily-quality.png', target: 1, reward: { xp: 20 } },
    { id: 'daily_score', scope: 'daily', metric: 'best', name: 'Push the pace', desc: 'Score 80 in one run', iconSrc: '/game/ui-icons/quests/daily-score.png', target: 80, reward: { boosters: 1 } },
    { id: 'weekly_games', scope: 'weekly', metric: 'games', name: 'Run regular', desc: 'Finish 12 runs', iconSrc: '/game/ui-icons/quests/weekly-games.png', target: 12, reward: { xp: 50 } },
    { id: 'weekly_rows', scope: 'weekly', metric: 'rows', name: 'Long haul', desc: 'Run 900 rows', iconSrc: '/game/ui-icons/quests/weekly-rows.png', target: 900, reward: { coins: 35 } },
    { id: 'weekly_coins', scope: 'weekly', metric: 'coins', name: 'Coin route', desc: 'Collect 220 coins', iconSrc: '/game/ui-icons/quests/weekly-coins.png', target: 220, reward: { boosters: 1 } },
    { id: 'weekly_quality', scope: 'weekly', metric: 'great_runs', name: 'Quality week', desc: 'Finish 4 Great+ runs', iconSrc: '/game/ui-icons/quests/weekly-quality.png', target: 4, reward: { xp: 60 } },
    { id: 'weekly_score', scope: 'weekly', metric: 'best', name: 'Weekly peak', desc: 'Score 220 in one run', iconSrc: '/game/ui-icons/quests/weekly-score.png', target: 220, reward: { coins: 40 } },
  ];

  function _periods(now = new Date()) {
    const thursday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = thursday.getUTCDay() || 7;
    thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
    const year = thursday.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
    return { daily: now.toISOString().slice(0, 10), weekly: `${year}-W${String(week).padStart(2, '0')}` };
  }

  function _hash(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  function _activeDefs(scope, period) {
    const pool = ROTATION_DEFS.filter(def => def.scope === scope);
    const count = scope === 'daily' ? 3 : 2;
    const start = _hash(`${scope}:${period}`) % pool.length;
    return Array.from({ length: count }, (_, index) => pool[(start + index * 2) % pool.length]);
  }

  function _rotationDefaults(scope, period) {
    return { period, entries: _activeDefs(scope, period).map(def => ({ id: def.id, progress: 0, claimed: false })) };
  }

  function _defaults() {
    const periods = _periods();
    const data = { daily: _rotationDefaults('daily', periods.daily), weekly: _rotationDefaults('weekly', periods.weekly) };
    for (const def of DEFS) data[def.id] = { progress: 0, claimed: Array(8).fill(false) };
    return data;
  }

  function _normalizeRotation(raw, scope, period) {
    const fallback = _rotationDefaults(scope, period);
    if (!raw || raw.period !== period || !Array.isArray(raw.entries)) return fallback;
    fallback.entries = fallback.entries.map(entry => {
      const saved = raw.entries.find(candidate => candidate && candidate.id === entry.id);
      return saved ? { ...entry, progress: Math.max(0, Math.floor(Number(saved.progress) || 0)), claimed: saved.claimed === true } : entry;
    });
    return fallback;
  }

  function _normalizeData(parsed) {
    const data = _defaults();
    if (!parsed || typeof parsed !== 'object') return data;
    for (const def of DEFS) {
      const saved = parsed[def.id];
      if (!saved || typeof saved !== 'object') continue;
      data[def.id] = {
        progress: Math.max(0, Math.floor(Number(saved.progress) || 0)),
        claimed: Array.from({ length: 8 }, (_, index) => Boolean(Array.isArray(saved.claimed) && saved.claimed[index])),
      };
    }
    const periods = _periods();
    data.daily = _normalizeRotation(parsed.daily, 'daily', periods.daily);
    data.weekly = _normalizeRotation(parsed.weekly, 'weekly', periods.weekly);
    return data;
  }

  function _loadData() {
    try { return _normalizeData(JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); }
    catch { return _defaults(); }
  }

  function _saveData(data) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
    const syncFn = window.__BASE_QUEST_SYNC;
    if (syncFn) syncFn(data);
  }

  function _getLevel(questData) {
    const idx = questData.claimed.indexOf(false);
    return idx === -1 ? 8 : idx;
  }

  function _rotationDef(id) { return ROTATION_DEFS.find(def => def.id === id); }

  function _advanceRotation(rotation, score, sessionCoins, greatRunDelta) {
    rotation.entries = rotation.entries.map(entry => {
      const def = _rotationDef(entry.id);
      if (!def) return entry;
      const delta = def.metric === 'games' ? 1 : def.metric === 'rows' ? score : def.metric === 'coins' ? sessionCoins : def.metric === 'great_runs' ? greatRunDelta : 0;
      return { ...entry, progress: def.metric === 'best' ? Math.max(entry.progress, score) : entry.progress + delta };
    });
  }

  function onGameOver(score, sessionCoins) {
    const data = _loadData();
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    const safeCoins = Math.max(0, Math.floor(Number(sessionCoins) || 0));
    const connected = Boolean(window.__BASE_WALLET);
    const rating = typeof _getLocalRunRating === 'function' ? _getLocalRunRating(safeScore).id : 'casual';
    const greatRunDelta = !connected && (rating === 'great' || rating === 'elite' || rating === 'master') ? 1 : 0;
    data.rows.progress += safeScore;
    data.coins.progress += safeCoins;
    data.games.progress += 1;
    data.record.progress = Math.max(data.record.progress, safeScore);
    data.elite_runs.progress += greatRunDelta;
    _advanceRotation(data.daily, safeScore, safeCoins, greatRunDelta);
    _advanceRotation(data.weekly, safeScore, safeCoins, greatRunDelta);
    _saveData(data);
  }

  function _claimContext(data, questId) {
    if (questId.includes(':')) {
      const [scope, id] = questId.split(':');
      if (scope !== 'daily' && scope !== 'weekly') return null;
      const def = _rotationDef(id);
      const entry = data[scope].entries.find(item => item.id === id);
      if (!def || !entry || def.scope !== scope) return null;
      return { questId, scope, period: data[scope].period, entry, level: 0, target: def.target, reward: def.reward };
    }
    const def = DEFS.find(item => item.id === questId);
    if (!def) return null;
    const entry = data[questId];
    const level = _getLevel(entry);
    if (level >= def.levels.length) return { questId, scope: 'career', entry, level, complete: true };
    return { questId, scope: 'career', entry, level, target: def.levels[level].target, reward: def.levels[level].reward };
  }

  function hasClaimable() {
    const data = _loadData();
    for (const def of DEFS) {
      const context = _claimContext(data, def.id);
      if (context && !context.complete && context.entry.progress >= context.target && !context.entry.claimed[context.level]) return true;
    }
    for (const scope of ['daily', 'weekly']) {
      for (const entry of data[scope].entries) {
        const def = _rotationDef(entry.id);
        if (def && entry.progress >= def.target && !entry.claimed) return true;
      }
    }
    return false;
  }

  async function applyQuestRewardServerClaim(context) {
    const claimFn = window.__BASE_ECONOMY_CLAIM;
    if (typeof claimFn !== 'function') return null;
    try {
      const claimed = await claimFn({ source: 'quest', questId: context.questId, level: context.level, period: context.period });
      if (!claimed || claimed.error === 'no_address') return null;
      if (!claimed.ok) return {
        serverRejected: true,
        error: claimed.error || 'claim_failed',
        levels: claimed.levels,
        quests: claimed.quests,
      };
      if (claimed.shop && typeof Shop !== 'undefined' && Shop.applyServerEconomyData) Shop.applyServerEconomyData(claimed.shop);
      if (typeof claimed.coins === 'number') RewardEconomy.setCoinsLocal(claimed.coins);
      if (claimed.quests) applyServerData(claimed.quests);
      if (claimed.levels && typeof Xp !== 'undefined' && Xp.applyServerState) Xp.applyServerState(claimed.levels);
      return claimed;
    } catch { return { serverRejected: true, error: 'claim_failed' }; }
  }

  function _setClaimed(context, claimed) {
    if (context.scope === 'career') context.entry.claimed[context.level] = claimed;
    else context.entry.claimed = claimed;
  }

  async function claim(questId) {
    const data = _loadData();
    const context = _claimContext(data, questId);
    if (!context || context.complete || context.entry.progress < context.target) return;
    const alreadyClaimed = context.scope === 'career' ? context.entry.claimed[context.level] : context.entry.claimed;
    if (alreadyClaimed) return;
    const claimKey = `${context.questId}:${context.level}:${context.period || 'career'}`;
    if (_pendingClaims.has(claimKey)) return;

    const coinsBefore = typeof Save !== 'undefined' ? Save.getCoins() : 0;
    const shopBefore = typeof Shop !== 'undefined' && Shop.exportEconomyData ? Shop.exportEconomyData() : null;
    _pendingClaims.add(claimKey);
    _setClaimed(context, true);
    _applyRewardSuppressingCoinSync(() => RewardEconomy.applyBundleLocal(context.reward, 'quest'));
    _saveData(data);
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    render();

    try {
      const claimed = await applyQuestRewardServerClaim(context);
      if (claimed && claimed.serverRejected) {
        if (shopBefore && typeof Shop !== 'undefined' && Shop.applyServerEconomyData) Shop.applyServerEconomyData(shopBefore);
        if (typeof RewardEconomy !== 'undefined' && RewardEconomy.setCoinsLocal) RewardEconomy.setCoinsLocal(coinsBefore);
        if (claimed.levels && typeof Xp !== 'undefined' && Xp.applyServerState) Xp.applyServerState(claimed.levels);
        if (claimed.quests) applyServerData(claimed.quests);
        const rollback = _loadData();
        const rollbackContext = _claimContext(rollback, questId);
        if (rollbackContext) { _setClaimed(rollbackContext, false); _saveData(rollback); }
        console.warn('quest reward claim rejected — reverted:', claimed.error || 'unknown');
      }
      if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    } finally {
      _pendingClaims.delete(claimKey);
      render();
    }
  }

  function applyServerData(serverData) {
    if (!serverData) return;
    const local = _loadData();
    const server = _normalizeData(serverData);
    for (const def of DEFS) {
      local[def.id].progress = Math.max(local[def.id].progress, server[def.id].progress);
      for (let i = 0; i < 8; i++) local[def.id].claimed[i] = local[def.id].claimed[i] || server[def.id].claimed[i];
    }
    for (const scope of ['daily', 'weekly']) {
      if (local[scope].period !== server[scope].period) { local[scope] = server[scope]; continue; }
      local[scope].entries = local[scope].entries.map(entry => {
        const remote = server[scope].entries.find(candidate => candidate.id === entry.id);
        return remote ? { ...entry, progress: Math.max(entry.progress, remote.progress), claimed: entry.claimed || remote.claimed } : entry;
      });
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(local)); } catch {}
    render();
  }

  function _questCard(def, context, variant) {
    const isRotation = context.scope !== 'career';
    const isMaxed = Boolean(context.complete);
    const target = context.target || def.levels[7].target;
    const progress = context.entry.progress;
    const claimed = isRotation ? context.entry.claimed : isMaxed || context.entry.claimed[context.level];
    const canClaim = !isMaxed && progress >= target && !claimed;
    const claimKey = `${context.questId}:${context.level}:${context.period || 'career'}`;
    const isPending = canClaim && _pendingClaims.has(claimKey);
    const pct = isMaxed ? 100 : Math.min(100, Math.floor((progress / target) * 100));
    const rewardLabel = context.reward ? RewardEconomy.labelHtml(context.reward) : '';
    const badge = isRotation ? (claimed ? 'DONE' : variant.toUpperCase()) : (isMaxed ? 'MAX' : `LV ${context.level + 1}`);
    const card = document.createElement('div');
    card.className = `quest-card quest-card-${variant}${canClaim ? ' quest-claimable' : ''}${claimed ? ' quest-card-complete' : ''}${isPending ? ' quest-pending' : ''}`;
    card.innerHTML = `
      <div class="quest-header">
        <span class="quest-name">${_imgHtml(def.iconSrc, 'quest-icon-img', def.name, ' aria-hidden="true"')} ${def.name}</span>
        <span class="quest-level">${badge}</span>
      </div>
      <div class="quest-desc">${def.desc}</div>
      ${isMaxed ? '' : `<div class="quest-reward-label">${rewardLabel}</div>`}
      <div class="quest-bar-bg"><div class="quest-bar-fill${canClaim ? ' complete' : ''}" style="width:${pct}%"></div></div>
      <div class="quest-progress">
        <span class="quest-progress-text">${Math.min(progress, target)} / ${target}</span>
        ${isMaxed || claimed
          ? '<span class="quest-done">✓ CLAIMED</span>'
          : canClaim
            ? `<button class="quest-claim-btn claim-action" data-id="${context.questId}"${isPending ? ' disabled' : ''}>${isPending ? 'CLAIMING...' : 'CLAIM'}</button>`
            : `<span class="quest-progress-text">${pct}%</span>`}
      </div>`;
    return card;
  }

  function _renderRotation(scope, data) {
    const container = document.getElementById(`quest-${scope}-list`);
    if (!container) return;
    container.innerHTML = '';
    for (const entry of data[scope].entries) {
      const def = _rotationDef(entry.id);
      const context = _claimContext(data, `${scope}:${entry.id}`);
      if (def && context) container.appendChild(_questCard(def, context, scope));
    }
  }

  function _updateResetLabels() {
    const now = new Date();
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const dailyHours = Math.max(1, Math.ceil((midnight - now.getTime()) / 3600000));
    const daysToMonday = (8 - (now.getUTCDay() || 7)) % 7 || 7;
    const daily = document.getElementById('quest-daily-reset');
    const weekly = document.getElementById('quest-weekly-reset');
    if (daily) daily.textContent = `Resets in ${dailyHours}h`;
    if (weekly) weekly.textContent = `Resets in ${daysToMonday}d`;
  }

  function render() {
    const data = _loadData();
    _renderRotation('daily', data);
    _renderRotation('weekly', data);
    const career = document.getElementById('quest-career-list');
    if (career) {
      career.innerHTML = '';
      for (const def of DEFS) career.appendChild(_questCard(def, _claimContext(data, def.id), 'career'));
    }
    _updateResetLabels();
    document.querySelectorAll('#screen-quests .quest-claim-btn').forEach(btn => {
      btn.addEventListener('click', () => claim(btn.dataset.id));
    });
  }

  // Progress toward the next unclaimed career level, for the profile career bars.
  function getCareerNext(questId) {
    const context = _claimContext(_loadData(), questId);
    if (!context || context.scope !== 'career') return null;
    if (context.complete) return { progress: context.entry.progress, complete: true };
    return { progress: context.entry.progress, target: context.target, level: context.level, complete: false };
  }

  // Claimed-level counts per career branch, for the profile medal row.
  function getCareerMedals() {
    const data = _loadData();
    return DEFS.map(def => ({ id: def.id, name: def.name, iconSrc: def.iconSrc, level: _getLevel(data[def.id]), max: def.levels.length }));
  }

  return { onGameOver, hasClaimable, claim, render, applyServerData, getCareerNext, getCareerMedals };
})();


/* ===== dailyspin.js ===== */
/**
 * DailySpin — колесо ежедневного спина.
 * Реальный приз определяется сервером (через useDailySpin → /api/spin).
 * Здесь: анимация колеса + применение приза локально.
 */
const DailySpin = (() => {

  // ── Display segments (wheel visuals; actual prize decided server-side) ──
  const DISPLAY_POOL = [
    { coin: true,        label: '15'   },
    { shirtImg: true,    label: 'Gear' },
    { fragmentImg: true, label: 'Frag' },
    { coin: true,        label: '35'   },
    { boosterBagImg: true, label: 'Boost' },
    { xpImg: true,       label: 'XP'   },
    { coin: true,        label: '75'   },
    { fireImg: true,     label: 'Miss' },
  ];
  const SEG_COUNT  = 8;
  const SEG_ANGLE  = (Math.PI * 2) / SEG_COUNT;
  const SEG_COLORS = ['#0A2456', '#1A1050'];

  // ── State ────────────────────────────────────────────────────────────────
  let _canvas = null, _ctx = null;
  let _coinImg   = null;   // preloaded /game/coin.png
  let _hubImg    = null;   // preloaded /icon.png (game logo for wheel hub)
  let _shirtImg   = null;   // preloaded /game/shirt.png (random skin segment)
  let _boosterImg    = null;   // preloaded /game/trails.png (random trail segment)
  let _boosterBagImg = null;   // preloaded booster reward icon
  let _fragmentImg   = null;   // preloaded fragment reward icon
  let _xpImg         = null;   // preloaded XP reward icon
  let _fireImg       = null;   // preloaded fire utility icon
  let _canvasLogicalSize = 0;
  let _segments  = [...DISPLAY_POOL];
  let _winIndex  = 0;
  let _prize     = null;

  let _animRaf   = 0;
  let _animPhase = 'idle'; // 'idle' | 'spinning' | 'landing' | 'done'
  let _rot       = 0;
  let _animStart = 0;
  let _lastTs    = 0;
  let _landStart = 0;
  let _landFrom  = 0;
  let _landVel   = 0;
  let _landDur   = 0;   // ms — computed per-spin so initial landing speed = SPIN_SPEED
  let _targetRot = 0;

  let _timerInterval  = null;
  let _safetyTimeout  = null;
  let _mintItemId     = null;   // item being offered for NFT claim

  // ── Canvas init / resize ─────────────────────────────────────────────────
  function _initCanvas() {
    // Preload coin image once
    if (!_coinImg) {
      _coinImg = new Image();
      _coinImg.src = '/game/coin.png';
      _coinImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    // Preload hub logo once
    if (!_hubImg) {
      _hubImg = new Image();
      _hubImg.src = '/icon.png';
      _hubImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    // Preload shirt icon once
    if (!_shirtImg) {
      _shirtImg = new Image();
      _shirtImg.src = '/game/shirt.png';
      _shirtImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    // Preload trail icon once
    if (!_boosterImg) {
      _boosterImg = new Image();
      _boosterImg.src = '/game/trails.png';
      _boosterImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    // Preload booster bag icon once
    if (!_boosterBagImg) {
      _boosterBagImg = new Image();
      _boosterBagImg.src = BOOSTER_ICON_SRCS.boost_magnet;
      _boosterBagImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    if (!_fragmentImg) {
      _fragmentImg = new Image();
      _fragmentImg.src = '/game/ui-icons/fragments.png';
      _fragmentImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    if (!_xpImg) {
      _xpImg = new Image();
      _xpImg.src = '/game/ui-icons/xp.png';
      _xpImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    if (!_fireImg) {
      _fireImg = new Image();
      _fireImg.src = '/game/ui-icons/fire.png';
      _fireImg.onload = () => { if (_animPhase === 'idle') _drawWheel(); };
    }
    _canvas = document.getElementById('spin-wheel-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    _sizeCanvas();
    _drawWheel();
  }

  function _sizeCanvas() {
    if (!_canvas) return;
    const container = document.getElementById('game-container');
    const refW = container ? container.getBoundingClientRect().width : window.innerWidth;
    const size = Math.min(Math.floor(Math.min(refW, 360) * 0.82), 300);
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2.5);
    _canvasLogicalSize = size;
    _canvas.style.width = `${size}px`;
    _canvas.style.height = `${size}px`;
    _canvas.width  = Math.round(size * dpr);
    _canvas.height = Math.round(size * dpr);
    if (_ctx) {
      _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      _ctx.imageSmoothingEnabled = true;
      _ctx.imageSmoothingQuality = 'high';
    }
  }

  // ── Wheel drawing ─────────────────────────────────────────────────────────
  function _drawWheel() {
    if (!_ctx || !_canvas) return;
    const W  = _canvasLogicalSize || _canvas.width;
    const H  = _canvasLogicalSize || _canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const r  = cx * 0.88;

    _ctx.clearRect(0, 0, W, H);

    // Shadows only when wheel is static — shadowBlur in RAF causes flicker & lag
    const _glow = (_animPhase === 'idle' || _animPhase === 'done');

    // Gold outer ring (with glow only when static)
    if (_glow) { _ctx.shadowColor = 'rgba(255,200,0,0.75)'; _ctx.shadowBlur = 18; }
    _ctx.beginPath();
    _ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    _ctx.fillStyle = '#FFD700';
    _ctx.fill();
    _ctx.shadowBlur  = 0;
    _ctx.shadowColor = 'transparent';

    // Segments
    // --- Pre-calculate shared layout constants (same for every segment) ---
    const tr      = r * 0.52;
    const iconSz  = Math.round(r * 0.26);
    const iconY   = -iconSz * 0.58;
    const labelY  =  iconSz * 0.58;

    // Uniform label font size: find the widest label among all segments,
    // then shrink ONE common font size so it fits with comfortable padding.
    const maxLabelSz  = Math.round(r * 0.10);
    const maxLabelW   = r * 0.26; // comfortable width (leaves ~18% padding each side)
    _ctx.font = `bold ${maxLabelSz}px sans-serif`;
    let widestW = 0;
    for (let i = 0; i < SEG_COUNT; i++) {
      const seg = _segments[i] || DISPLAY_POOL[i % DISPLAY_POOL.length];
      if (seg.label) widestW = Math.max(widestW, _ctx.measureText(seg.label).width);
    }
    const uniformLabelSz = widestW > maxLabelW
      ? Math.floor(maxLabelSz * maxLabelW / widestW)
      : maxLabelSz;

    for (let i = 0; i < SEG_COUNT; i++) {
      const seg   = _segments[i] || DISPLAY_POOL[i % DISPLAY_POOL.length];
      const start = _rot + i * SEG_ANGLE - Math.PI / 2;
      const end   = start + SEG_ANGLE;

      _ctx.save();

      // Draw + clip to segment shape so text can never escape
      _ctx.beginPath();
      _ctx.moveTo(cx, cy);
      _ctx.arc(cx, cy, r, start, end);
      _ctx.closePath();
      const grad = _ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
      if (i % 2 === 0) {
        grad.addColorStop(0, '#1E4F9A');
        grad.addColorStop(1, '#0A2456');
      } else {
        grad.addColorStop(0, '#2E1E88');
        grad.addColorStop(1, '#1A1050');
      }
      _ctx.fillStyle = grad;
      _ctx.fill();
      _ctx.strokeStyle = 'rgba(255,215,0,0.9)';
      _ctx.lineWidth   = 3;
      if (_glow) { _ctx.shadowColor = 'rgba(255,215,0,0.55)'; _ctx.shadowBlur = 8; }
      _ctx.stroke();
      _ctx.shadowBlur  = 0;
      _ctx.shadowColor = 'transparent';
      _ctx.clip();

      // Icon + label — centred at tr from centre, rotated to read outward
      const mid = start + SEG_ANGLE / 2;
      _ctx.translate(cx + Math.cos(mid) * tr, cy + Math.sin(mid) * tr);
      _ctx.rotate(mid + Math.PI / 2);
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';

      // All image icons at the same iconSz
      if (seg.coin && _coinImg && _coinImg.complete && _coinImg.naturalWidth) {
        _ctx.drawImage(_coinImg, -iconSz / 2, iconY - iconSz / 2, iconSz, iconSz);
      } else if (seg.shirtImg && _shirtImg && _shirtImg.complete && _shirtImg.naturalWidth) {
        const ss = iconSz * 1.08;
        _ctx.drawImage(_shirtImg, -ss / 2, iconY - ss / 2, ss, ss);
      } else if (seg.boosterImg && _boosterImg && _boosterImg.complete && _boosterImg.naturalWidth) {
        const ts = iconSz * 1.14;
        _ctx.drawImage(_boosterImg, -ts / 2, iconY - ts / 2, ts, ts);
      } else if (seg.boosterBagImg && _boosterBagImg && _boosterBagImg.complete && _boosterBagImg.naturalWidth) {
        const bs = iconSz * 1.12;
        _ctx.drawImage(_boosterBagImg, -bs / 2, iconY - bs / 2, bs, bs);
      } else if (seg.fragmentImg && _fragmentImg && _fragmentImg.complete && _fragmentImg.naturalWidth) {
        const fs = iconSz * 1.12;
        _ctx.drawImage(_fragmentImg, -fs / 2, iconY - fs / 2, fs, fs);
      } else if (seg.xpImg && _xpImg && _xpImg.complete && _xpImg.naturalWidth) {
        const xs = iconSz * 1.16;
        _ctx.drawImage(_xpImg, -xs / 2, iconY - xs / 2, xs, xs);
      } else if (seg.fireImg && _fireImg && _fireImg.complete && _fireImg.naturalWidth) {
        const fs = iconSz * 1.18;
        _ctx.drawImage(_fireImg, -fs / 2, iconY - fs / 2, fs, fs);
      } else if (seg.icon) {
        _ctx.shadowColor = 'rgba(0,0,0,0.75)';
        _ctx.shadowBlur  = 6;
        _ctx.font      = `${iconSz}px sans-serif`;
        _ctx.fillStyle = '#ffffff';
        _ctx.fillText(seg.icon, 0, iconY);
        _ctx.shadowBlur  = 0;
        _ctx.shadowColor = 'transparent';
      }

      // Uniform label — same font size across all segments
      _ctx.shadowColor  = 'rgba(0,0,0,0.85)';
      _ctx.shadowBlur   = 5;
      _ctx.shadowOffsetX = 0;
      _ctx.shadowOffsetY = 1;
      _ctx.font      = `bold ${uniformLabelSz}px sans-serif`;
      _ctx.fillStyle = '#ffffff';
      _ctx.fillText(seg.label, 0, labelY);
      _ctx.shadowBlur    = 0;
      _ctx.shadowOffsetY = 0;
      _ctx.shadowColor   = 'transparent';

      _ctx.restore();
    }

    // Hub — gold ring + game logo clipped to circle
    const hr = r * 0.155; // hub radius
    if (_glow) { _ctx.shadowColor = 'rgba(255,200,0,0.7)'; _ctx.shadowBlur = 12; }
    _ctx.beginPath();
    _ctx.arc(cx, cy, hr, 0, Math.PI * 2);
    _ctx.fillStyle = '#FFD700';
    _ctx.fill();
    _ctx.shadowBlur  = 0;
    _ctx.shadowColor = 'transparent';

    _ctx.save();
    _ctx.beginPath();
    _ctx.arc(cx, cy, hr - 2.5, 0, Math.PI * 2);
    _ctx.clip();
    if (_hubImg && _hubImg.complete && _hubImg.naturalWidth) {
      const d = (hr - 2.5) * 2;
      _ctx.drawImage(_hubImg, cx - (hr - 2.5), cy - (hr - 2.5), d, d);
    } else {
      _ctx.fillStyle = '#0052FF';
      _ctx.fill();
    }
    _ctx.restore();
  }

  // ── Map server prize to display segment ───────────────────────────────────
  function _prizeToDisplay(prize) {
    if (!prize) return DISPLAY_POOL[0];
    if (prize.type === 'coins') {
      return { coin: true, label: String(Number(prize.value)) };
    }
    if (prize.type === 'booster') {
      return { boosterBagImg: true, label: 'Boost' };
    }
    if (prize.type === 'fragments' || prize.type === 'fragment_burst') {
      return { fragmentImg: true, label: 'Frag' };
    }
    if (prize.type === 'xp') {
      return { xpImg: true, label: 'XP' };
    }
    if (prize.type === 'crate') {
      return { shirtImg: true, label: 'Crate' };
    }
    if (prize.type === 'trail') {
      return { shirtImg: true, label: 'Gear' };
    }
    if (prize.type === 'skin') {
      return { shirtImg: true, label: 'Gear' };
    }
    if (prize.type === 'nothing') {
      return { fireImg: true, label: 'Miss' };
    }
    return { boosterBagImg: true, label: prize.label || '?' };
  }

  function _buildSegments(prize) {
    // Keep DISPLAY_POOL visually unchanged during animation — no mid-spin glitch.
    // For coins: land on the slot whose label matches the actual prize value.
    // For other types: pick the matching type slot.
    _segments = [...DISPLAY_POOL];
    if (prize && prize.type === 'coins') {
      // Map value → DISPLAY_POOL index by label
      const valueStr = String(Number(prize.value));
      const matchIdx = _segments.findIndex(s => s.coin && s.label === valueStr);
      const coinSlots = [0, 3, 6];
      _winIndex = matchIdx >= 0 ? matchIdx : coinSlots[Math.floor(Math.random() * coinSlots.length)];
    } else {
      const slotsByType = {
        skin:    [1],
        trail:   [1],
        booster: [4],
        fragments: [2],
        fragment_burst: [2],
        xp: [5],
        crate: [1],
        nothing: [7],
      };
      const slots = (prize && slotsByType[prize.type]) || [0];
      _winIndex = slots[Math.floor(Math.random() * slots.length)];
    }
  }

  // ── Animation ─────────────────────────────────────────────────────────────
  const SPIN_SPEED  = 8;   // rad/s at full speed
  const ACCEL_MS    = 250; // ms to reach full speed
  const MIN_SPIN_MS = 300; // ms minimum free-spin before landing

  // easeOutSine — derivative at t=0 is π/2.
  // _landDur is set so that (π/2)*d/_landDur = SPIN_SPEED → zero velocity jolt.
  function _easeOut(t) { return Math.sin(t * Math.PI / 2); }

  function _animFrame(ts) {
    if (_animPhase === 'idle') return;

    const dt = Math.min((ts - (_lastTs || ts)) / 1000, 0.05);
    _lastTs  = ts;

    if (_animPhase === 'spinning') {
      const elapsed = ts - _animStart;
      const speed   = elapsed < ACCEL_MS ? SPIN_SPEED * (elapsed / ACCEL_MS) : SPIN_SPEED;
      _rot         += speed * dt;
      if (_prize && elapsed >= MIN_SPIN_MS) _startLanding(ts);
    } else if (_animPhase === 'landing') {
      const t = Math.min(1, (ts - _landStart) / _landDur);
      _rot    = _landFrom + (_targetRot - _landFrom) * _easeOut(t);
      if (t >= 1) {
        _rot       = _targetRot;
        _animPhase = 'done';
        _drawWheel();
        _onSpinComplete();
        return;
      }
    }

    _drawWheel();
    _animRaf = requestAnimationFrame(_animFrame);
  }

  function _startLanding(ts) {
    if (_animPhase !== 'spinning') return;
    _animPhase = 'landing';
    _landStart = ts;
    _landFrom  = _rot;
    // At least 0.75 extra turns before stopping
    const base   = -(_winIndex + 0.5) * SEG_ANGLE;
    const minRot = _rot + 2 * Math.PI * 0.75;
    const N      = Math.ceil((minRot - base) / (2 * Math.PI));
    _targetRot   = N * 2 * Math.PI + base;
    // Duration derived from distance so initial landing speed = SPIN_SPEED (no jolt):
    // easeOutSine'(0) = π/2  →  T = (π/2) × d / SPIN_SPEED
    _landDur = (Math.PI / 2) * (_targetRot - _landFrom) / SPIN_SPEED * 1000;
  }

  // ── Apply prize locally ───────────────────────────────────────────────────
  function _applyPrize(prize) {
    if (!prize) return;
    if (prize.serverApplied) {
      if (prize.serverShop && typeof Shop !== 'undefined' && Shop.applyServerEconomyData) {
        Shop.applyServerEconomyData(prize.serverShop);
      }
      if (typeof prize.serverCoins === 'number') {
        RewardEconomy.setCoinsLocal(prize.serverCoins);
      }
      if (prize.type === 'xp' && typeof Xp !== 'undefined') {
        // Server already persisted the XP to level state; apply the authoritative
        // result so it isn't erased by the next level-state sync. Fall back to a
        // local add only when the server didn't return level state.
        if (prize.serverLevels && Xp.applyServerState) {
          Xp.applyServerState(prize.serverLevels);
          _claimLevelRewards(_queueFromServerLevelUps(prize.levelUps));
        } else if (Xp.add) {
          Xp.add(Number(prize.value) || 0);
        }
      }
      if (_prize && prize.type === 'booster') {
        _prize._resolvedItemId = String(prize.value);
        _prize._resolvedBoosterName = RewardEconomy.resolveBoosterName(String(prize.value));
      }
      if (_prize && prize.type === 'skin') {
        const skinId = String(prize.value);
        _prize._resolvedSkinName = prize.label ? prize.label.replace(/\s+Skin$/i, '') : skinId;
        _prize._resolvedItemId = skinId;
        _prize._resolvedSkinSprite = (typeof Shop !== 'undefined' && Shop.getSprite) ? Shop.getSprite(skinId) : null;
      }
      if (_prize && prize.type === 'trail') {
        const trailId = String(prize.value);
        const TRAIL_NAMES = { trail_sparkle: 'Sparkle', trail_hearts: 'Hearts', trail_fire: 'Fire', trail_coins: 'Coins', trail_rainbow: 'Rainbow' };
        _prize._resolvedTrailName = TRAIL_NAMES[trailId] || (prize.label ? prize.label.replace(/\s+Trail$/i, '') : trailId);
        _prize._resolvedItemId = trailId;
      }
      return;
    }
    if (prize.type === 'nothing') return; // Fire — empty slot, no reward
    if (prize.type === 'coins') {
      // Server already credited Redis; mirror to localStorage
      const newBal = Save.addCoins(Number(prize.value));
      if (typeof UI   !== 'undefined') UI.updateCoins(newBal);
      if (typeof window.__BASE_SYNC_COINS === 'function') window.__BASE_SYNC_COINS(Save.getCoins());
    } else if (prize.type === 'booster') {
      if (typeof Shop !== 'undefined') {
        const ALL_BOOSTERS = ['boost_magnet', 'boost_double', 'boost_shield'];
        // Prefer the server-picked booster, but if it's already stocked pick random
        const boosterId = ALL_BOOSTERS.includes(prize.value)
          ? prize.value
          : ALL_BOOSTERS[Math.floor(Math.random() * ALL_BOOSTERS.length)];
        Shop.addBoosterCharges(boosterId, 1);
        const BOOSTER_NAMES = { boost_magnet: 'Coin Magnet', boost_double: 'Double Coins', boost_shield: 'Second Chance' };
        if (_prize) { _prize._resolvedBoosterName = BOOSTER_NAMES[boosterId] || boosterId; _prize._resolvedItemId = boosterId; }
      }
    } else if (prize.type === 'trail') {
      if (typeof Shop !== 'undefined') {
        const ALL_TRAILS = ['trail_sparkle', 'trail_hearts', 'trail_fire', 'trail_coins', 'trail_rainbow'];
        const ownedTrails = Shop.getTrailPacks ? Shop.getTrailPacks() : [];
        const unowned = ALL_TRAILS.filter(id => !ownedTrails.includes(id));
        const trailId = unowned.length > 0
          ? unowned[Math.floor(Math.random() * unowned.length)]
          : ALL_TRAILS[Math.floor(Math.random() * ALL_TRAILS.length)];
        Shop.ownTrailPack(trailId);
        const TRAIL_NAMES = { trail_sparkle: 'Sparkle', trail_hearts: 'Hearts', trail_fire: 'Fire', trail_coins: 'Coins', trail_rainbow: 'Rainbow' };
        if (_prize) { _prize._resolvedTrailName = TRAIL_NAMES[trailId] || trailId; _prize._resolvedItemId = trailId; }
      }
    } else if (prize.type === 'skin') {
      // Server picks a specific skin; if it's already owned, pick a random unowned one
      if (typeof Shop !== 'undefined') {
        const ALL_SKINS = ['skin_street_runner', 'skin_2', 'skin_default', 'skin_3', 'skin_4', 'skin_5', 'skin_6', 'skin_7', 'skin_founder', 'skin_8', 'skin_9', 'skin_10', 'skin_11', 'skin_base_king'];
        const owned     = Shop.getOwned ? Shop.getOwned() : [];
        let   skinId    = prize.value;
        if (!ALL_SKINS.includes(skinId) || owned.includes(skinId)) {
          const unowned = ALL_SKINS.filter(id => !owned.includes(id));
          skinId = unowned.length > 0
            ? unowned[Math.floor(Math.random() * unowned.length)]
            : ALL_SKINS[Math.floor(Math.random() * ALL_SKINS.length)];
        }
        Shop.own(skinId);
        // Update prize label shown in result box
        const SKIN_NAMES = {
          skin_cryptokid:     'Genesis Runner',
          skin_street_runner: 'City Runner',
          skin_2:             'Justin Sun',
          skin_default:       'Base Builder',
          skin_3:             'Night Operator',
          skin_4:             'Satoshi Nakamoto',
          skin_5:             'Anatoly Yakovenko',
          skin_6:             'Doctor',
          skin_7:             'Bitcoin Maxi',
          skin_founder:       'Vitalik Buterin',
          skin_8:             'Brian Armstrong',
          skin_9:             'Firefighter',
          skin_10:            'Police Officer',
          skin_11:            'Ape Holder',
          skin_base_king:     'Base King',
        };
        const SKIN_SPRITES = {
          skin_cryptokid:     '/game/chars/cryptokid.png',
          skin_street_runner: '/game/chars/street_runner.png',
          skin_2:             '/game/chars/skin2.png',
          skin_default:       '/game/player.png',
          skin_3:             '/game/chars/skin3.png',
          skin_4:             '/game/chars/skin4.png',
          skin_5:             '/game/chars/skin5.png',
          skin_6:             '/game/chars/skin6.png',
          skin_7:             '/game/chars/skin7.png',
          skin_founder:       '/game/chars/founder.png',
          skin_8:             '/game/chars/skin8.png',
          skin_9:             '/game/chars/skin9.png',
          skin_10:            '/game/chars/skin10.png',
          skin_11:            '/game/chars/skin11.png',
          skin_base_king:     '/game/chars/base_king.png',
        };
        if (_prize) {
          _prize._resolvedSkinName   = SKIN_NAMES[skinId]   || skinId;
          _prize._resolvedItemId     = skinId;
          _prize._resolvedSkinSprite = SKIN_SPRITES[skinId] || null;
        }
      }
    } else if (prize.type === 'fragments' || prize.type === 'fragment_burst') {
      const result = RewardEconomy.applyBundleLocal({ fragments: Number(prize.value) || 0 }, 'spin');
      prize.fragmentsAwarded = result.fragmentsAwarded || 0;
      prize.fragmentsPooled = result.fragmentsPooled || 0;
    } else if (prize.type === 'crate') {
      const result = RewardEconomy.applyBundleLocal({ container: String(prize.value) }, 'spin');
      prize.fragmentsAwarded = result.fragmentsAwarded || 0;
      prize.fragmentsPooled = result.fragmentsPooled || 0;
    } else if (prize.type === 'xp') {
      if (typeof Xp !== 'undefined' && Xp.add) Xp.add(Number(prize.value) || 0);
    }
  }

  // ── After animation completes ─────────────────────────────────────────────
  function _onSpinComplete() {
    if (_safetyTimeout) { clearTimeout(_safetyTimeout); _safetyTimeout = null; }
    try {
    _applyPrize(_prize);

    const cardEl  = document.getElementById('spin-prize-card');
    const iconEl  = document.getElementById('spin-prize-icon');
    const labelEl = document.getElementById('spin-prize-label');

    if (cardEl && iconEl && labelEl && _prize) {
      const IMG = (src, size) =>
        `<img src="${src}" style="width:${size};height:${size};object-fit:contain;">`;

      if (_prize.type === 'skin') {
        const src = _prize._resolvedSkinSprite || '/game/shirt.png';
        iconEl.innerHTML = IMG(src, '64px');
        labelEl.textContent = _prize._resolvedSkinName ? `${_prize._resolvedSkinName} skin!` : 'New skin!';
      } else if (_prize.type === 'trail') {
        const TRAIL_SP = { trail_sparkle: '/nft/images/trail_sparkle.png', trail_hearts: '/nft/images/trail_hearts.png', trail_fire: '/nft/images/trail_fire.png', trail_coins: '/nft/images/trail_coins.png', trail_rainbow: '/nft/images/trail_rainbow.png' };
        const src = _prize._resolvedItemId && TRAIL_SP[_prize._resolvedItemId] ? TRAIL_SP[_prize._resolvedItemId] : '/game/trails.png';
        iconEl.innerHTML = IMG(src, '64px');
        labelEl.textContent = _prize._resolvedTrailName ? `${_prize._resolvedTrailName} trail!` : 'New trail!';
      } else if (_prize.type === 'booster') {
        const src = _prize._resolvedItemId && BOOSTER_ICON_SRCS[_prize._resolvedItemId]
          ? BOOSTER_ICON_SRCS[_prize._resolvedItemId]
          : BOOSTER_ICON_SRCS.boost_magnet;
        iconEl.innerHTML = IMG(src, '56px');
        labelEl.textContent = _prize._resolvedBoosterName ? `${_prize._resolvedBoosterName}!` : 'New booster!';
      } else if (_prize.type === 'fragments' || _prize.type === 'fragment_burst') {
        iconEl.innerHTML = IMG('/game/ui-icons/fragments.png', '56px');
        const awarded = Number(_prize.fragmentsAwarded || 0);
        const pooled = Number(_prize.fragmentsPooled || 0);
        const total = awarded + pooled || Number(_prize.value || 0);
        labelEl.innerHTML = awarded <= 0 && pooled > 0
          ? `${RewardEconomy.currencyHtml('fragments', pooled)} <span class="reward-overflow">→ Pool</span>`
          : `${RewardEconomy.currencyHtml('fragments', total)}${pooled > 0 ? ` <span class="reward-overflow">${pooled} → Pool</span>` : ''}`;
      } else if (_prize.type === 'crate') {
        iconEl.innerHTML = IMG('/game/ui-icons/starter-pack.png', '56px');
        const pooled = Number(_prize.fragmentsPooled || 0);
        labelEl.innerHTML = pooled > 0
          ? `${_escapeHtml(_prize.label || 'Crate')} <span class="reward-overflow">${pooled} → Pool</span>`
          : _escapeHtml(_prize.label || 'Reward crate!');
      } else if (_prize.type === 'xp') {
        iconEl.innerHTML = IMG('/game/ui-icons/xp.png', '56px');
        labelEl.textContent = _prize.label || `+${_prize.value} XP`;
      } else if (_prize.type === 'coins') {
        iconEl.innerHTML = IMG('/game/coin.png', '56px');
        labelEl.innerHTML = RewardEconomy.currencyHtml('coins', _prize.value);
      } else if (_prize.type === 'nothing') {
        iconEl.innerHTML = IMG('/game/ui-icons/fire.png', '56px');
        labelEl.textContent = 'Better luck next time!';
      } else {
        iconEl.innerHTML = IMG('/game/ui-icons/starter-pack.png', '56px');
        labelEl.textContent = _prize.label || 'Prize!';
      }

      // ── Rarity badge ────────────────────────────────────────────────────
      const rarity = _prize.rarity || 'common';
      // Remove previous rarity classes
      cardEl.className = cardEl.className.replace(/\brarity-\w+/g, '').trim();
      cardEl.classList.add('rarity-' + rarity);
      // Rarity label element
      let badgeEl = cardEl.querySelector('.spin-rarity-badge');
      if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.className = 'spin-rarity-badge';
        // Insert after icon, before label
        cardEl.insertBefore(badgeEl, labelEl);
      }
      const RARITY_LABELS = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
      badgeEl.textContent = RARITY_LABELS[rarity] || rarity;
      badgeEl.className = 'spin-rarity-badge rarity-badge-' + rarity;

      cardEl.classList.remove('hidden');
    }

    // ── NFT claim section (inside the card) ──────────────────────────────────
    const nftSection = document.getElementById('spin-nft-section');
    const mintBtn    = document.getElementById('btn-spin-nft');
    _mintItemId = null;
    if (nftSection) {
      nftSection.classList.add('hidden');
      if (mintBtn) { mintBtn.textContent = 'CLAIM ONCHAIN'; mintBtn.disabled = false; }
      const laterBtn = document.getElementById('btn-spin-nft-later');
      if (laterBtn) laterBtn.style.display = '';

      if (window.__NFT_DEPLOYED && _prize && (_prize.type === 'skin' || _prize.type === 'trail')) {
        const itemId = _prize._resolvedItemId;
        if (itemId && !_isNftClaimed(itemId)) {
          _mintItemId = itemId;
          nftSection.classList.remove('hidden');
        }
      }
    }
    } catch (err) { console.error('_onSpinComplete error:', err); }

    // ALWAYS reset phase — even if display code above threw
    _animPhase = 'idle';
    _updateDoBtn();
    _startCountdown();
  }

  // ── Public: doSpin ────────────────────────────────────────────────────────
  function doSpin() {
    if (_animPhase !== 'idle') return;
    const spinFn = window.__SPIN_DO;
    if (!spinFn) return;

    // ── Guard paid spins locally; authoritative deduction happens server-side. ──
    const info    = window.__SPIN || {};
    const cost    = info.nextCost || 0;
    if (cost > 0) {
      const balance = typeof Save !== 'undefined' ? Save.getCoins() : 0;
      if (balance < cost) return; // guard: can't afford
    }

    _prize     = null;
    _segments  = [...DISPLAY_POOL];
    _lastTs    = 0;
    _animPhase = 'spinning';
    _animStart = performance.now();
    cancelAnimationFrame(_animRaf);
    _animRaf   = requestAnimationFrame(_animFrame);

    const doBtn = document.getElementById('btn-do-spin');
    if (doBtn) { doBtn.disabled = true; doBtn.textContent = 'Spinning...'; }
    const cardEl = document.getElementById('spin-prize-card');
    if (cardEl) {
      cardEl.classList.add('hidden');
      // Reset rarity styling from previous spin
      cardEl.className = cardEl.className.replace(/\brarity-\w+/g, '').trim();
      const oldBadge = cardEl.querySelector('.spin-rarity-badge');
      if (oldBadge) oldBadge.remove();
    }
    _mintItemId = null;

    spinFn();

    // Safety net: if no prize within 4 s, try Redis fallback; abort after 6 s regardless.
    // Guard on _prize: once the prize has arrived the spin succeeded — a second
    // POST would consume/get-rejected as a paid spin and must never fire.
    _safetyTimeout = setTimeout(() => {
      if (_prize || _animPhase !== 'spinning') return;
      const fetchFn = window.__SPIN_FETCH;
      if (fetchFn) fetchFn();
      // Hard abort 2 s later in case fetch also fails
      setTimeout(() => {
        if (_prize || (_animPhase !== 'spinning' && _animPhase !== 'landing')) return;
        cancelAnimationFrame(_animRaf);
        _animPhase = 'idle';
        _drawWheel();
        _updateDoBtn();
      }, 2000);
    }, 4000);
  }

  // ── Called when 'spin-prize' event fires from the React hook ─────────────
  function onPrize(prize) {
    if (_safetyTimeout) { clearTimeout(_safetyTimeout); _safetyTimeout = null; } // spin succeeded — no fallback POST
    _prize = prize;
    _buildSegments(prize); // fix segment layout so winner sits at _winIndex
    // _animFrame's spinning branch will call _startLanding() on its next check
  }

  // ── Button state ──────────────────────────────────────────────────────────
  function _updateDoBtn() {
    const doBtn = document.getElementById('btn-do-spin');
    if (!doBtn) return;
    const info      = window.__SPIN || {};
    const pending   = info.isPending || false;
    const busy      = _animPhase === 'spinning' || _animPhase === 'landing';
    const nextCost  = info.nextCost  || 0;
    const balance   = typeof Save !== 'undefined' ? Save.getCoins() : 0;
    const canAfford = nextCost === 0 || balance >= nextCost;

    if (busy || pending) {
      doBtn.disabled    = true;
      doBtn.textContent = 'Spinning...';
    } else if (!canAfford) {
      doBtn.disabled    = true;
      doBtn.innerHTML   = `Need ${nextCost - balance} more coins`;
    } else if (nextCost === 0) {
      doBtn.disabled    = false;
      doBtn.innerHTML   = '<img src="/game/ui-icons/daily-spin.png" class="btn-inline-icon ui-icon" alt="" aria-hidden="true"> FREE SPIN';
    } else {
      doBtn.disabled    = false;
      doBtn.innerHTML   = `<img src="/game/ui-icons/daily-spin.png" class="btn-inline-icon ui-icon" alt="" aria-hidden="true"> SPIN &nbsp;·&nbsp; <img src="/game/coin.png" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;display:inline-block;"> ${nextCost}`;
    }
  }

  // ── Menu banner visibility ────────────────────────────────────────────────
  function updateBanner() {
    const banner = document.getElementById('btn-spin');
    const sub    = document.getElementById('spin-banner-sub');
    if (!banner) return;
    const info     = window.__SPIN || {};
    const nextCost = info.nextCost || 0;
    const balance  = typeof Save !== 'undefined' ? Save.getCoins() : 0;

    banner.classList.remove('hidden');
    if (sub) {
      sub.textContent = nextCost === 0
        ? 'Free spin available!'
        : `Spin for ${nextCost} coins`;
    }
  }

  // Re-sync UI when the React hook publishes fresh __SPIN state (fired via the
  // 'spin-state' event). Refreshes the menu banner, and the spin button when the
  // spin screen is currently open.
  function refresh() {
    updateBanner();
    const spinScreen = document.getElementById('screen-spin');
    if (spinScreen && !spinScreen.classList.contains('hidden')) _updateDoBtn();
  }

  // ── Countdown timer on spin screen ───────────────────────────────────────
  function _startCountdown() {
    if (_timerInterval) clearInterval(_timerInterval);
    const timerEl = document.getElementById('spin-timer');
    if (!timerEl) return;
    const nextAt = (window.__SPIN || {}).nextAt || 0;
    if (!nextAt) { timerEl.classList.add('hidden'); return; }
    function tick() {
      const ms = nextAt - Date.now();
      if (ms <= 0) {
        clearInterval(_timerInterval);
        timerEl.classList.add('hidden');
        _updateDoBtn();
        updateBanner();
        return;
      }
      const s   = Math.floor(ms / 1000);
      const h   = Math.floor(s / 3600);
      const m   = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      timerEl.textContent = `Next spin in ${[h, m, sec].map(v => String(v).padStart(2, '0')).join(':')}`;
      timerEl.classList.remove('hidden');
    }
    tick();
    _timerInterval = setInterval(tick, 1000);
  }

  // ── Show spin screen ──────────────────────────────────────────────────────
  function show() {
    if (!_canvas) _initCanvas();
    else { _sizeCanvas(); _drawWheel(); }

    _updateDoBtn();

    const info     = window.__SPIN || {};
    const avail    = info.isAvailable !== false;
    const timerEl  = document.getElementById('spin-timer');
    const cardEl   = document.getElementById('spin-prize-card');

    // Always hide prize card when (re-)entering spin screen — user saw result already
    if (cardEl) cardEl.classList.add('hidden');

    if (!avail) {
      _startCountdown();
    } else if (timerEl) {
      timerEl.classList.add('hidden');
    }

    if (typeof UI !== 'undefined') UI.show('spin');
  }

  // ── Called when server returns 402 (not enough coins) ────────────────────
  function onInsufficient() {
    // A 402 while a prize is already in hand is the redundant safety-net POST
    // being rejected as a paid spin — the first spin succeeded; let the wheel
    // land and apply the prize instead of aborting the animation.
    if (_prize) return;
    cancelAnimationFrame(_animRaf);
    _animPhase = 'idle';
    _drawWheel();
    _updateDoBtn();
    // Flash "not enough coins" on the result area briefly
    const cardEl  = document.getElementById('spin-prize-card');
    const iconEl  = document.getElementById('spin-prize-icon');
    const labelEl = document.getElementById('spin-prize-label');
    if (cardEl && iconEl && labelEl) {
      iconEl.innerHTML = '<img src="/game/ui-icons/coin-pouch.png" class="spin-prize-icon-img ui-icon" alt="" aria-hidden="true">';
      labelEl.textContent = 'Not enough coins';
      // Strip rarity styling from previous spin
      cardEl.className = cardEl.className.replace(/\brarity-\w+/g, '').trim();
      const oldBadge = cardEl.querySelector('.spin-rarity-badge');
      if (oldBadge) oldBadge.remove();
      // Hide NFT section if visible
      const nftSection = document.getElementById('spin-nft-section');
      if (nftSection) nftSection.classList.add('hidden');
      cardEl.classList.remove('hidden');
      setTimeout(() => cardEl.classList.add('hidden'), 2500);
    }
  }

  // ── NFT button handlers (called from static _initUI bindings) ────────────
  function onNftClaim() {
    const mintFn = window.__NFT_MINT;
    if (!mintFn || window.__NFT_PENDING || !_mintItemId) return;
    const mintBtn  = document.getElementById('btn-spin-nft');
    const laterBtn = document.getElementById('btn-spin-nft-later');
    if (mintBtn)  { mintBtn.textContent = 'CLAIMING...'; mintBtn.disabled = true; }
    if (laterBtn) laterBtn.style.display = 'none';
    mintFn(_mintItemId);
  }

  function onNftLater() {
    const nftSection = document.getElementById('spin-nft-section');
    if (nftSection) nftSection.classList.add('hidden');
  }

  return { show, doSpin, onPrize, onInsufficient, updateBanner, refresh, onNftClaim, onNftLater };
})();


/* ===== xp.js ===== */
const Xp = (() => {
  const SAVE_KEY = 'xp_v1';

  // XP needed to advance FROM level N (i.e. N→N+1 costs 100*N)
  function xpNeeded(level) { return 100 * level; }

  // Named runner titles by level; thresholds loosely track LEVEL_REWARDS milestones.
  const RUNNER_TITLES = [
    { min: 1,  name: 'Rookie',           color: '#9AA7BD' },
    { min: 3,  name: 'Street Runner',    color: '#6FD66F' },
    { min: 6,  name: 'City Sprinter',    color: '#4D8FFF' },
    { min: 10, name: 'Highway Hero',     color: '#38BDF8' },
    { min: 15, name: 'Night Marathoner', color: '#A78BFA' },
    { min: 20, name: 'Base Legend',      color: '#FFD700' },
    { min: 28, name: 'Onchain Immortal', color: '#FF7A5C' },
  ];

  function getTitle(level) {
    let title = RUNNER_TITLES[0];
    for (const entry of RUNNER_TITLES) if (level >= entry.min) title = entry;
    return title;
  }

  const LEVEL_REWARDS = {
    2:  { type: 'bundle', value: { coins: 75, boosters: 1 }, iconSrc: '/game/ui-icons/starter-pack.png', label: '+75 coins + booster' },
    3:  { type: 'skin',  value: 'skin_street_runner', sprite: '/game/chars/street_runner.png', label: 'City Runner unlocked!' },
    5:  { type: 'bundle', value: { container: 'focus_chest' }, iconSrc: '/game/ui-icons/fragments.png', label: 'Focus Chest' },
    7:  { type: 'trail', value: 'trail_sparkle', sprite: '/nft/images/trail_sparkle.png', label: 'Sparkle Trail unlocked!' },
    10: { type: 'bundle', value: { container: 'rare_crate' }, iconSrc: '/game/ui-icons/starter-pack.png', label: 'Rare Crate' },
    12: { type: 'trail', value: 'trail_hearts',  sprite: '/nft/images/trail_hearts.png',  label: 'Hearts Trail unlocked!' },
    15: { type: 'bundle', value: { coins: 120, fragments: 8 }, iconSrc: '/game/ui-icons/fragments.png', label: '+120 coins + 8 fragments' },
    18: { type: 'trail', value: 'trail_fire',    sprite: '/nft/images/trail_fire.png',    label: 'Fire Trail unlocked!' },
    20: { type: 'bundle', value: { coins: 150, fragments: 20 }, iconSrc: '/game/ui-icons/fragments.png', label: '+150 coins + 20 fragments' },
    25: { type: 'bundle', value: { container: 'epic_crate' }, iconSrc: '/game/ui-icons/starter-pack.png', label: 'Epic Crate' },
    30: { type: 'bundle', value: { container: 'legendary_crate' }, iconSrc: '/game/ui-icons/crown.png', label: 'Legendary Crate' },
    35: { type: 'bundle', value: { container: 'legendary_focus_bundle' }, iconSrc: '/game/ui-icons/crown.png', label: 'Legendary Focus Bundle' },
  };

  function _load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { return {}; }
  }
  function _save(d) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch {}
  }

  function getLevel()   { return _load().level    || 1; }
  function getTotalXp() { return _load().totalXp  || 0; }

  function getProgress() {
    const d = _load();
    const level     = d.level     || 1;
    const xpInLevel = d.xpInLevel || 0;
    const needed    = xpNeeded(level);
    return { level, xpInLevel, needed, pct: Math.min(100, (xpInLevel / needed) * 100) };
  }

  // Add XP → handle level-ups → return [{level, reward}, …]
  function add(xp, options = {}) {
    if (!xp || xp <= 0) return [];
    const applyRewards = options.applyRewards !== false;
    const d = _load();
    const levelUps  = [];
    let level     = d.level     || 1;
    let xpInLevel = (d.xpInLevel || 0) + xp;
    let totalXp   = (d.totalXp  || 0) + xp;

    while (xpInLevel >= xpNeeded(level)) {
      xpInLevel -= xpNeeded(level);
      level++;
      const reward = LEVEL_REWARDS[level] || null;
      levelUps.push({ level, reward });
      if (reward && applyRewards) _applyReward(reward);
    }

    _save({ level, xpInLevel, totalXp });
    _updateBadge(level);
    return levelUps;
  }

  function getReward(level) {
    return LEVEL_REWARDS[Number(level)] || null;
  }

  function applyServerState(serverState) {
    if (!serverState || typeof serverState !== 'object') return;
    const level = Math.max(1, Math.floor(Number(serverState.level) || 1));
    const needed = xpNeeded(level);
    const xpInLevel = Math.min(
      Math.max(0, Math.floor(Number(serverState.xpInLevel) || 0)),
      Math.max(0, needed - 1),
    );
    const totalXp = Math.max(0, Math.floor(Number(serverState.totalXp) || 0));
    const claimed = Array.isArray(serverState.claimed)
      ? serverState.claimed.map(Number).filter(n => Number.isFinite(n) && n >= 2)
      : (_load().claimed || []);
    _save({ level, xpInLevel, totalXp, claimed });
    _updateBadge(level);
    renderProfile();
  }

  // Optimistic: grant the level reward locally right away, then reconcile with
  // the server. Server success overwrites via absolute setCoins/applyServer (no
  // double-grant); a genuine rejection reverts from the pre-claim snapshot;
  // an unavailable server keeps the local grant (offline behavior).
  async function claimReward(level, reward) {
    if (!reward) return { ok: true, noReward: true };

    // Snapshot for revert-on-reject
    const coinsBefore = (typeof Save !== 'undefined') ? Save.getCoins() : 0;
    const shopBefore  = (typeof Shop !== 'undefined' && Shop.exportEconomyData) ? Shop.exportEconomyData() : null;

    // Optimistic grant — instant feedback (suppress coin-sync so the server
    // claim, which is authoritative for coins, doesn't grant on top of it)
    _applyRewardSuppressingCoinSync(() => _applyReward(reward));
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());

    const claimFn = window.__BASE_ECONOMY_CLAIM;
    if (typeof claimFn !== 'function') return { ok: true, localFallback: true };

    try {
      const claimed = await claimFn({ source: 'level', level });
      if (!claimed || claimed.error === 'no_address') {
        return { ok: true, localFallback: true }; // unavailable — keep optimistic grant
      }
      if (!claimed.ok) {
        // Genuine rejection — roll back the optimistic grant
        if (shopBefore && typeof Shop !== 'undefined' && Shop.applyServerEconomyData) Shop.applyServerEconomyData(shopBefore);
        if (typeof RewardEconomy !== 'undefined' && RewardEconomy.setCoinsLocal) RewardEconomy.setCoinsLocal(coinsBefore);
        if (claimed.levels) applyServerState(claimed.levels);
        if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
        console.warn('level reward claim rejected — reverted:', claimed.error || 'unknown');
        return { ok: false, error: claimed.error || 'claim_failed' };
      }
      if (claimed.shop && typeof Shop !== 'undefined' && Shop.applyServerEconomyData) {
        Shop.applyServerEconomyData(claimed.shop);
      }
      if (typeof claimed.coins === 'number') {
        RewardEconomy.setCoinsLocal(claimed.coins);
      }
      if (claimed.levels) applyServerState(claimed.levels);
      if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
      return claimed;
    } catch {
      // network error — keep optimistic grant (offline behavior)
      return { ok: true, localFallback: true };
    }
  }

  function _applyReward(reward) {
    if (reward.type === 'coins') {
      Save.addCoins(reward.value);
      if (typeof window.__BASE_SYNC_COINS === 'function') window.__BASE_SYNC_COINS(Save.getCoins());
    } else if (reward.type === 'bundle') {
      RewardEconomy.applyBundleLocal(reward.value, 'level');
    } else if (reward.type === 'skin'  && typeof Shop !== 'undefined') {
      Shop.own(reward.value);
    } else if (reward.type === 'trail' && typeof Shop !== 'undefined') {
      Shop.ownTrailPack(reward.value);
    }
  }

  function _updateBadge(level) {
    const lv    = level || getLevel();
    const badge = document.getElementById('profile-level-badge');
    if (badge) badge.textContent = `Lv.${lv}`;
  }

  function renderProfile() {
    const { level, xpInLevel, needed, pct } = getProgress();
    const lvlEl  = document.getElementById('xp-level-display');
    const numEl  = document.getElementById('xp-nums');
    const fillEl = document.getElementById('xp-bar-fill');
    const passportLevelEl = document.getElementById('profile-passport-level');
    const nextUnlockEl = document.getElementById('profile-next-unlock-value');
    if (lvlEl)  lvlEl.textContent  = `Lv.${level}`;
    if (numEl)  numEl.textContent  = `${xpInLevel} / ${needed} XP`;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (passportLevelEl) passportLevelEl.textContent = `LV.${level}`;
    if (nextUnlockEl) {
      const nextLevel = Object.keys(LEVEL_REWARDS).map(Number).sort((a, b) => a - b).find((milestone) => milestone > level);
      nextUnlockEl.textContent = nextLevel
        ? `Lv.${nextLevel} · ${LEVEL_REWARDS[nextLevel].label}`
        : 'All milestone rewards unlocked';
    }
    const heroTitleEl = document.getElementById('profile-hero-title');
    if (heroTitleEl) {
      const title = getTitle(level);
      heroTitleEl.textContent = title.name.toUpperCase();
      heroTitleEl.style.color = title.color;
    }
    _updateBadge(level);
  }

  function showRewards() {
    const { level, xpInLevel, needed, pct } = getProgress();
    const list = document.getElementById('xp-rewards-list');
    if (!list) return;

    // Current level progress header
    let html = `
      <div class="xpr-progress">
        <div class="xpr-progress-label">
          <span class="xpr-cur-level">Lv.${level}</span>
          <span class="xpr-xp-nums">${xpInLevel} / ${needed} XP</span>
        </div>
        <div class="xpr-track"><div class="xpr-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="xpr-divider"></div>`;

    // All milestone levels
    const milestones = Object.keys(LEVEL_REWARDS).map(Number).sort((a, b) => a - b);
    for (const lvl of milestones) {
      const r       = LEVEL_REWARDS[lvl];
      const done    = level >= lvl;
      const current = level === lvl - 1;
      const cls     = done ? 'xpr-row done' : current ? 'xpr-row next' : 'xpr-row';
      const badge   = done
        ? '<span class="xpr-check">✓</span>'
        : current
          ? '<span class="xpr-lock next-lock">▶</span>'
          : _uiIconHtml('lock', 'xpr-lock-img', 'locked');
      const iconHtml = (r.type === 'skin' || r.type === 'trail') && r.sprite
        ? `<img src="${r.sprite}" class="xpr-skin-img" alt="${r.label}">`
        : r.type === 'coins'
          ? `<img src="/game/coin.png" class="xpr-coin-img" alt="coins">`
          : `<div class="xpr-icon">${r.iconSrc ? _imgHtml(r.iconSrc, 'xpr-icon-img ui-icon', r.label, ' aria-hidden="true"') : _uiIconHtml('celebration', 'xpr-icon-img', r.label)}</div>`;
      const labelHtml = r.type === 'bundle'
        ? RewardEconomy.labelHtml(r.value)
        : r.type === 'coins'
          ? RewardEconomy.currencyHtml('coins', r.value)
          : _escapeHtml(r.label);
      html += `
        <div class="${cls}">
          <div class="xpr-level-num">Lv.${lvl}</div>
          ${iconHtml}
          <div class="xpr-label">${labelHtml}</div>
          ${badge}
        </div>`;
    }

    list.innerHTML = html;
    const modal = document.getElementById('xp-rewards-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function hideRewards() {
    const modal = document.getElementById('xp-rewards-modal');
    if (modal) modal.classList.add('hidden');
  }

  return { add, getLevel, getTotalXp, getProgress, getReward, getTitle, applyServerState, claimReward, renderProfile, showRewards, hideRewards };
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
const Vibrate = (() => {
  let _on = localStorage.getItem('baserunner_vibrate') !== 'false'; // default true

  function _v(p) { if (_on && navigator.vibrate) navigator.vibrate(p); }

  function isEnabled()   { return _on; }
  function setEnabled(v) { _on = !!v; localStorage.setItem('baserunner_vibrate', _on); }

  return {
    tap:   () => _v(18),
    log:   () => _v(35),
    coin:  () => _v(25),
    death: () => _v([60, 40, 80]),
    water: () => _v([30, 20, 30, 20, 40]),
    isEnabled,
    setEnabled,
  };
})();

// ===== СОСТОЯНИЕ ИГРЫ =====
const GameState = {
  MENU:     'menu',
  PLAYING:  'playing',
  CONTINUE: 'continue',
  GAMEOVER: 'gameover',
};

let currentState    = GameState.MENU;
let lastTime        = 0;
let deathTriggered  = false;  // tracks if death anim was started this game
let _activeRunId    = null;
// Generation token: every loop start bumps it; a running loop stops as soon as
// it sees a newer generation. Prevents the menu loop and game loop from ever
// running at once (they share lastTime — two live loops corrupt dt and freeze
// the background). See initGame / initMenuBackground.
let _loopGen        = 0;

function _getRunCompleteFlow() {
  return window.__BASE_RUN_COMPLETE_FLOW || null;
}

function _leaveActiveRun() {
  const runId = _activeRunId;
  const flow = _getRunCompleteFlow();
  if (flow && Number.isSafeInteger(runId)) flow.leaveRun(runId);
  _activeRunId = null;
  hideContinueOverlay();
  _clearLevelUpState();
}

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
  const gen = ++_loopGen;
  requestAnimationFrame((ts) => menuLoop(ts, gen));
}

// Menu background loop — only updates world + renders, no player logic
function menuLoop(timestamp, gen) {
  if (gen !== _loopGen || currentState !== GameState.MENU) return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  // Slowly scroll camera forward
  const ps = Player.getState();
  ps.row     += dt * 0.6;   // drift forward at 0.6 rows/sec
  ps.visualY  = World.rowToY(ps.row) + World.CELL / 2;
  World.extendWorld(Math.floor(ps.row));
  World.update(dt);

  Renderer.updateCamera(dt);
  Renderer.draw(dt);

  requestAnimationFrame((ts) => menuLoop(ts, gen));
}

// Canonical "return to the home menu". Guarantees currentState is MENU and the
// menu background loop is live, from any screen. When coming from a non-MENU
// state (gameplay / game over) the stale gameLoop keeps drawing a frozen world;
// bumping into initMenuBackground supersedes it (via _loopGen) and restarts the
// menu loop. When already on the menu, the running loop and its scrolling scene
// are left untouched (no scene reset / no double loop).
function goToMenu() {
  const wasMenu = currentState === GameState.MENU;
  _leaveActiveRun();
  currentState = GameState.MENU;
  if (typeof UI !== 'undefined') UI.show('menu');
  if (!wasMenu) initMenuBackground();
}

// ===== ИНИЦИАЛИЗАЦИЯ ИГРЫ =====
let _sessionCoins     = 0;
let _recordBonusUsed  = false; // only first record break per game awards XP bonus

// Сводка забега — только для локальной телеметрии, не несёт экономических данных
let _runSummary = null;

function _resetRunSummary() {
  _runSummary = {
    highestStage: 'onboarding',
    deathCause: 'unknown',
    deathRowType: null,
    boostersUsed: [], // заполняется задачей pre-run loadout (Product Priority 3)
  };
}

// При continue финальная смерть перезаписывает предыдущую — это намеренно:
// сводка описывает терминальную смерть забега.
function _markDeathCause(row) {
  if (!_runSummary || !row) return;
  _runSummary.deathRowType = row.type || null;
  if (row.type === 'train') _runSummary.deathCause = 'train';
  else if (row.type === 'water') _runSummary.deathCause = 'water';
  else if (row.type === 'road') _runSummary.deathCause = 'road';
  else _runSummary.deathCause = 'unknown';
}

const CONTINUE_COST   = 100;
let _continueUsed     = false;
let _continueInterval = null;
let _continueRunId    = null;

function showContinueOverlay(runId) {
  if (_continueInterval) clearInterval(_continueInterval);
  currentState = GameState.CONTINUE;
  _continueRunId = runId;
  let _countdownSec = 5;
  const timerEl   = document.getElementById('continue-timer');
  const costEl    = document.getElementById('continue-cost');
  const balanceEl = document.getElementById('continue-balance');
  const el        = document.getElementById('screen-continue');
  if (costEl)    costEl.textContent    = CONTINUE_COST;
  if (balanceEl) balanceEl.textContent = Save.getCoins();
  if (timerEl)   timerEl.textContent   = _countdownSec;
  if (el) el.classList.remove('hidden');
  _continueInterval = setInterval(() => {
    _countdownSec--;
    if (timerEl) timerEl.textContent = Math.max(0, _countdownSec);
    if (_countdownSec <= 0) {
      if (_continueRunId !== runId || currentState !== GameState.CONTINUE) return;
      hideContinueOverlay();
      onGameOver(runId);
    }
  }, 1000);
}

function hideContinueOverlay() {
  if (_continueInterval) { clearInterval(_continueInterval); _continueInterval = null; }
  _continueRunId = null;
  const el = document.getElementById('screen-continue');
  if (el) el.classList.add('hidden');
}

function initGame() {
  const flow = _getRunCompleteFlow();
  if (!flow || typeof flow.beginRun !== 'function') return false;
  _clearLevelUpState();
  _activeRunId = flow.beginRun();
  _sessionCoins    = 0;
  _continueUsed    = false;
  _recordBonusUsed = false;
  _resetRunSummary();
  if (_continueInterval) { clearInterval(_continueInterval); _continueInterval = null; }
  hideContinueOverlay();
  Renderer.init();
  World.init();
  Player.init();
  Input.reset();
  deathTriggered = false;
  Renderer.stopDeath();
  if (typeof Sound !== 'undefined') Sound.init();
  if (typeof Music !== 'undefined') Music.init();

  _requestSessionToken(_activeRunId);
  currentState = GameState.PLAYING;
  UI.show('game');
  UI.updateBest(Save.getBest());
  UI.updateCoins(Save.getCoins(), 0); // HUD начинается с 0 — показываем монеты текущей сессии

  lastTime = performance.now();
  const gen = ++_loopGen;
  const runId = _activeRunId;
  requestAnimationFrame((ts) => gameLoop(ts, gen, runId));
  return true;
}

// ===== ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ =====
function gameLoop(timestamp, gen, runId) {
  if (gen !== _loopGen || runId !== _activeRunId) return;
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
    if (_runSummary) _runSummary.highestStage = World.getDifficultyStage(Player.getScore());

    if (!Player.isAlive()) {
      // Trigger animation exactly once
      if (!deathTriggered) {
        const flow = _getRunCompleteFlow();
        if (!flow || !flow.markEnding(runId)) return;
        deathTriggered = true;
        const ps = Player.getState();
        const row = World.getRow(ps.row);
        const type = row && row.type === 'water'
          ? 'water'
          : row && row.type === 'train'
            ? 'train'
            : 'car';
        const direction = row && Number.isFinite(row.dir) ? row.dir : 0;
        _markDeathCause(row);
        Renderer.triggerDeath(ps.visualX, ps.visualY, type, direction);
        // Вибрация при смерти
        if (type === 'water') Vibrate.water();
        else                  Vibrate.death();
        if (row && row.type === 'train') {
          navigator.vibrate && navigator.vibrate([80, 30, 120]);
        }
        // Death sounds
        if (typeof Sound !== 'undefined') {
          if (type === 'water') Sound.splash();
          else                  Sound.death();
        }
      }
      // Wait for animation to finish, then show continue or game over
      if (Renderer.deathDone()) {
        Renderer.stopDeath();
        if (!_continueUsed && Save.getCoins() >= CONTINUE_COST) {
          showContinueOverlay(runId);
          // Don't return — keep rendering frozen world behind the overlay
        } else {
          onGameOver(runId);
          return;
        }
      }
    }
  }

  Renderer.updateCamera(dt);
  Renderer.draw(dt);
  requestAnimationFrame((ts) => gameLoop(ts, gen, runId));
}

// ===== КОНЕЦ ИГРЫ =====
let _levelUpQueue = [];
let _levelUpRunId = null;
let _levelUpTimer = null;

function _isPresentedRun(runId) {
  const flow = _getRunCompleteFlow();
  return Boolean(flow && flow.isPresentedRun(runId));
}

function _hideLevelUpModal() {
  const modal  = document.getElementById('levelup-modal');
  const nftRow = document.getElementById('levelup-nft-row');
  if (modal) modal.classList.add('hidden');
  if (nftRow) {
    nftRow.innerHTML = '';
    nftRow.classList.add('hidden');
  }
}

function _clearLevelUpState() {
  if (_levelUpTimer) {
    clearTimeout(_levelUpTimer);
    _levelUpTimer = null;
  }
  _levelUpQueue = [];
  _levelUpRunId = null;
  _hideLevelUpModal();
}

function _scheduleNextLevelUp(runId, delay) {
  if (_levelUpTimer) clearTimeout(_levelUpTimer);
  if (_levelUpRunId !== runId || _levelUpQueue.length === 0 || !_isPresentedRun(runId)) return;
  _levelUpTimer = setTimeout(() => {
    _levelUpTimer = null;
    _showNextLevelUp(runId);
  }, delay);
}

function _showNextLevelUp(runId) {
  if (_levelUpRunId !== runId || _levelUpQueue.length === 0 || !_isPresentedRun(runId)) return;
  const modal  = document.getElementById('levelup-modal');
  if (!modal) return;
  const item   = _levelUpQueue.shift();
  const iconEl = document.getElementById('levelup-icon');
  const lvlEl  = document.getElementById('levelup-level');
  const rwdEl  = document.getElementById('levelup-reward');

  const r = item.reward;

  // Icon: for skins and trails show sprite image, otherwise project icons.
  if (iconEl) {
    if (r && r.sprite) {
      iconEl.innerHTML = `<img src="${r.sprite}" style="width:56px;height:56px;object-fit:contain;image-rendering:pixelated;">`;
    } else if (r && r.type === 'coins') {
      iconEl.innerHTML = '<img src="/game/coin.png" class="levelup-icon-img" alt="coins">';
    } else if (r && r.iconSrc) {
      iconEl.innerHTML = _imgHtml(r.iconSrc, 'levelup-icon-img ui-icon', r.label || '', ' aria-hidden="true"');
    } else {
      iconEl.innerHTML = _uiIconHtml('celebration', 'levelup-icon-img', 'level up');
    }
  }
  if (lvlEl)  lvlEl.textContent   = `Lv.${item.level}`;
  if (rwdEl) {
    rwdEl.innerHTML = r
      ? (r.type === 'bundle'
        ? RewardEconomy.labelHtml(r.value)
        : r.type === 'coins'
          ? RewardEconomy.currencyHtml('coins', r.value)
          : _escapeHtml(r.label))
      : '';
  }
  if (rwdEl)  rwdEl.style.display = r ? '' : 'none';

  // NFT mint button for skin/trail rewards
  const nftRow = document.getElementById('levelup-nft-row');
  if (nftRow) {
    nftRow.innerHTML = '';
    nftRow.classList.add('hidden');
    if (window.__NFT_DEPLOYED && r && (r.type === 'skin' || r.type === 'trail') && r.value && !_isNftClaimed(r.value)) {
      const btn = document.createElement('button');
      btn.className = 'levelup-nft-btn claim-action';
      btn.textContent = 'CLAIM ONCHAIN';
      btn.dataset.id = r.value;
      btn.addEventListener('click', () => {
        const mintFn = window.__NFT_MINT;
        if (!mintFn || window.__NFT_PENDING) return;
        btn.textContent = 'CLAIMING...';
        btn.disabled = true;
        mintFn(r.value);
      });
      nftRow.appendChild(btn);
      nftRow.classList.remove('hidden');
    }
  }

  modal.classList.remove('hidden');
}

function _closeLevelUp() {
  const runId = _levelUpRunId;
  _hideLevelUpModal();
  if (Number.isSafeInteger(runId) && _levelUpQueue.length > 0) {
    _scheduleNextLevelUp(runId, 300);
  }
}

// Локальный рейтинг забега из общего конфига (rating-config.js, грузится до game.js).
// Держит локальный XP в согласии с серверным getRunRating без дублирования порогов.
function _getLocalRunRating(score) {
  const config  = window.__BASE_RATING_CONFIG;
  const ratings = config && Array.isArray(config.ratings) ? config.ratings : [];
  let rating = ratings[0] || { id: 'casual', label: 'Casual', minScore: 0, xpMultiplier: 1, dailyQualityXp: 0 };
  for (const def of ratings) {
    if (score >= def.minScore) rating = def;
  }
  return rating;
}

function _calculateLocalRunXp(score, isNewRecord) {
  const baseXp        = score * 1 + _sessionCoins * 2;
  const rating        = _getLocalRunRating(score);
  const multi         = rating.xpMultiplier;
  const multiplied    = Math.round(baseXp * multi);
  const checkinStreak = (Save.getCheckin().streak || 0);
  const streakBonus   = Math.min(checkinStreak * 2, 20);
  const recordBonus   = (isNewRecord && !_recordBonusUsed)
    ? (_recordBonusUsed = true, Math.round(multiplied * 0.5))
    : 0;
  return {
    xpEarned: multiplied + streakBonus + recordBonus,
    xpBreakdown: { base: multiplied, multi, streakBonus, recordBonus, rating: rating.id },
  };
}

function _submitScoreToServer(runId, score, sessionCoins) {
  const submitFn = window.__BASE_SUBMIT_SCORE;
  if (typeof submitFn === 'function') {
    return Promise.resolve().then(() => submitFn(runId, score, sessionCoins)).catch((err) => {
      console.warn('score submit failed:', err);
      return { ok: false, error: 'submit_failed' };
    });
  }
  window.dispatchEvent(new CustomEvent('base-auto-submit-score', { detail: { runId, score, sessionCoins } }));
  return Promise.resolve(null);
}

function _queueFromServerLevelUps(levelUps) {
  if (!Array.isArray(levelUps) || typeof Xp === 'undefined') return [];
  return levelUps.map(item => {
    const level = Math.floor(Number(item && item.level) || 0);
    return { level, reward: Xp.getReward ? Xp.getReward(level) : null };
  }).filter(item => item.level >= 2);
}

// Apply a reward locally for optimistic feedback WITHOUT pushing coins to the
// server coin-store. The claim endpoint is authoritative for coins and reads
// that same store (/api/coins/sync → writeCoins), so letting the optimistic
// apply sync first would make the endpoint grant the reward on top of the
// already-credited balance (double-count). Coins reconcile via the claim
// response instead (setCoinsLocal). The apply fn must be synchronous.
function _applyRewardSuppressingCoinSync(applyFn) {
  const _sync = window.__BASE_SYNC_COINS;
  try {
    window.__BASE_SYNC_COINS = undefined;
    applyFn();
  } finally {
    window.__BASE_SYNC_COINS = _sync;
  }
}

function _claimLevelRewards(queue) {
  if (!Array.isArray(queue) || typeof Xp === 'undefined' || !Xp.claimReward) return;
  for (const item of queue) {
    if (!item.reward) continue;
    Xp.claimReward(item.level, item.reward);
  }
}

let _latestReconciledRunId = 0;

async function onGameOver(runId) {
  const flow = _getRunCompleteFlow();
  if (!flow || !Number.isSafeInteger(runId) || !flow.finalizeRun(runId)) return;

  currentState = GameState.GAMEOVER;
  const score   = Player.getScore();
  const prevBest = Save.getBest();
  const best    = Save.addScore(score);
  const isNewRecord = score > 0 && score === best && score > prevBest;

  // Connected runs wait for the authoritative score submission to update quest
  // progress. Otherwise a locally-complete quest could be claimed before the
  // server sees the run, and its reward would be rolled back.
  if (!window.__BASE_WALLET) Quests.onGameOver(score, _sessionCoins);
  // Sync coins
  const syncFn = window.__BASE_SYNC_COINS;
  if (syncFn) syncFn(Save.getCoins());
  window.dispatchEvent(new CustomEvent('base-game-run-summary', {
    detail: { runId, score, sessionCoins: _sessionCoins, summary: _runSummary },
  }));
  const scoreSubmitPromise = _submitScoreToServer(runId, score, _sessionCoins);
  const localXp = _calculateLocalRunXp(score, isNewRecord);
  const localRating = _getLocalRunRating(score);
  const localRatingObj = { id: localRating.id, label: localRating.label };

  const presentedSnapshot = flow.presentRun(runId, {
    score,
    previousBest: prevBest,
    best,
    isNewRecord,
    sessionCoins: _sessionCoins,
    xpEarned: localXp.xpEarned,
    xpBreakdown: localXp.xpBreakdown,
    rating: localRatingObj,
    hasClaimableQuest: Quests.hasClaimable(),
    canClaimOnchain: Boolean(window.__BASE_WALLET) && score > 0,
  });
  if (presentedSnapshot) UI.presentRunComplete(presentedSnapshot);

  const submitResult = await scoreSubmitPromise;
  const canApplyAuthoritative = Boolean(
    submitResult
    && submitResult.ok
    && runId >= _latestReconciledRunId,
  );
  if (canApplyAuthoritative) _latestReconciledRunId = runId;

  // Reconcile locally-bumped quest progress with the server's authoritative
  // state so claimable state can't drift from what the server will honor.
  if (canApplyAuthoritative && submitResult.quests && typeof Quests !== 'undefined' && Quests.applyServerData) {
    Quests.applyServerData(submitResult.quests);
  }

  let levelUps = [];
  if (canApplyAuthoritative && submitResult.levels && typeof Xp !== 'undefined') {
    Xp.applyServerState && Xp.applyServerState(submitResult.levels);
    levelUps = _queueFromServerLevelUps(submitResult.levelUps);
    _claimLevelRewards(levelUps);
  } else if (!submitResult || submitResult.error === 'no_address') {
    levelUps = typeof Xp !== 'undefined' ? Xp.add(localXp.xpEarned) : [];
  } else if (!submitResult.ok) {
    console.warn('server XP update rejected:', submitResult.error || 'unknown');
  }

  if (submitResult && submitResult.ok) {
    const patch = { hasClaimableQuest: Quests.hasClaimable() };
    if (submitResult.xp && typeof submitResult.xp.earned === 'number') {
      patch.xpEarned = submitResult.xp.earned;
    }
    if (submitResult.xp && submitResult.xp.breakdown && typeof submitResult.xp.breakdown === 'object') {
      patch.xpBreakdown = submitResult.xp.breakdown;
    }
    if (submitResult.rating && submitResult.rating.id) {
      patch.rating = submitResult.rating;
    }
    const patchedSnapshot = flow.patchRun(runId, patch);
    if (patchedSnapshot) UI.patchRunComplete(runId, patchedSnapshot);
  }

  if (levelUps.length > 0 && flow.isPresentedRun(runId)) {
    _levelUpQueue = levelUps;
    _levelUpRunId = runId;
    _scheduleNextLevelUp(runId, 900);
  }
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

    // Один свайп-жест = одно движение. Если уже сработал — ждём отрыва пальца,
    // иначе резкий свайп вбок пересекает порог несколько раз и даёт 2-3 прыжка.
    if (touchMoved) return;

    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    if (Math.abs(dx) > SWIPE_MIN || Math.abs(dy) > SWIPE_MIN) {
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

// ===== ПРОФИЛЬ =====
let _menuCiInterval = null;

function _msUntilNextMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return midnight.getTime() - now.getTime();
}

function _updateCiBanner() {
  const banner = document.getElementById('btn-ci-banner');
  const sub    = document.getElementById('ci-banner-sub');
  if (!banner || !sub) return;
  const state = typeof CheckIn !== 'undefined' ? CheckIn.getState() : null;
  if (!state) return;

  if (state.available) {
    banner.classList.add('ci-banner-available');
    const daySlot   = state.streak % 7;
    const reward    = RewardEconomy.getCheckInReward(daySlot);
    const isDay7    = daySlot === 6;
    sub.innerHTML = isDay7
      ? `Day 7 · ${RewardEconomy.labelHtml(reward)}`
      : `Day ${state.streak + 1} · ${RewardEconomy.shortLabelHtml(reward)}`;
  } else {
    banner.classList.remove('ci-banner-available');
    const ms = _msUntilNextMidnightUTC();
    const s  = Math.floor(ms / 1000);
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    sub.textContent = `Next in ${h}h ${String(m).padStart(2, '0')}m ${String(sc).padStart(2, '0')}s`;
  }
}

function _setProfileGearImage(id, src, alt) {
  const el = document.getElementById(id);
  if (!el) return;
  el.src = src;
  el.alt = alt;
}

function _setProfileGearText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function _setProfileGearArrows(prevId, nextId, enabled) {
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  if (prev) prev.disabled = !enabled;
  if (next) next.disabled = !enabled;
}

function renderProfileGear() {
  if (typeof Shop === 'undefined') return;

  const skinOptions = Shop.getSkinOptions();
  const currentSkin = Shop.getEquipped();
  const skinId = skinOptions.includes(currentSkin) ? currentSkin : skinOptions[0];
  const skinMeta = Shop.getSkinMeta(skinId);
  const skinIndex = Math.max(0, skinOptions.indexOf(skinId));

  _setProfileGearImage('profile-hero-sprite', skinMeta.sprite, skinMeta.name);
  _setProfileGearText('profile-hero-skin', `${skinMeta.name} · ${skinIndex + 1}/${skinOptions.length}`);
  _setProfileGearArrows('btn-hero-skin-prev', 'btn-hero-skin-next', skinOptions.length > 1);

  const trailOptions = Shop.getTrailOptions();
  const currentTrail = Shop.getEquippedTrail();
  const trailId = trailOptions.includes(currentTrail) ? currentTrail : trailOptions[0];
  const trailMeta = Shop.getTrailMeta(trailId);
  const trailIndex = Math.max(0, trailOptions.indexOf(trailId));
  const bubbleEl = document.getElementById('equipped-trail-bubble');
  const iconEl = document.getElementById('equipped-trail-icon');

  if (iconEl) {
    if (trailMeta.sprite) {
      iconEl.innerHTML = `<img src="${trailMeta.sprite}" alt="${trailMeta.name}" class="equipped-trail-icon-img">`;
    } else {
      iconEl.innerHTML = '<img src="/nft/images/trail_default.png" alt="Default trail" class="equipped-trail-icon-img">';
    }
  }
  _setProfileGearText('equipped-trail-name', trailMeta.name);
  _setProfileGearText('equipped-trail-count', `${trailIndex + 1}/${trailOptions.length}`);
  _setProfileGearArrows('btn-profile-trail-prev', 'btn-profile-trail-next', trailOptions.length > 1);

  if (bubbleEl) {
    const color = trailMeta.color || 'rgba(255,255,255,0.07)';
    const glow = trailMeta.glow || 'rgba(255,255,255,0.12)';
    bubbleEl.style.background = color;
    bubbleEl.style.borderColor = glow.replace('0.5)', '0.35)');
    bubbleEl.style.boxShadow = trailId === 'default' ? 'none' : `0 0 14px ${glow}`;
  }

  const heroGlowEl = document.getElementById('profile-hero-glow');
  if (heroGlowEl) {
    const heroGlow = (trailId !== 'default' && trailMeta.glow) ? trailMeta.glow : 'rgba(77,143,255,0.38)';
    heroGlowEl.style.background = `radial-gradient(circle, ${heroGlow} 0%, transparent 68%)`;
  }
}

function cycleProfileGear(type, dir) {
  if (typeof Shop === 'undefined') return;
  const options = type === 'skin' ? Shop.getSkinOptions() : Shop.getTrailOptions();
  if (options.length <= 1) return;
  const current = type === 'skin' ? Shop.getEquipped() : Shop.getEquippedTrail();
  const currentIndex = Math.max(0, options.indexOf(current));
  const nextId = options[(currentIndex + dir + options.length) % options.length];
  if (type === 'skin') Shop.equipSkinLocal(nextId);
  else Shop.equipTrailLocal(nextId);
}

const _MEDAL_TIER = (level) => level >= 7 ? 'gold' : level >= 4 ? 'silver' : level >= 1 ? 'bronze' : 'none';

function _renderCareerMedals() {
  const holder = document.getElementById('career-medals');
  if (!holder || typeof Quests === 'undefined' || typeof Quests.getCareerMedals !== 'function') return;
  holder.innerHTML = Quests.getCareerMedals().map(medal => `
    <div class="career-medal medal-${_MEDAL_TIER(medal.level)}" title="${_escapeHtml(medal.name)}">
      <span class="career-medal-ring">${_imgHtml(medal.iconSrc, 'career-medal-icon ui-icon', medal.name, ' aria-hidden="true"')}</span>
      <small>${medal.level}/${medal.max}</small>
    </div>`).join('');
}

function _renderCollectionShelf() {
  if (typeof Shop === 'undefined' || typeof Shop.getCollectionItems !== 'function') return;
  const skinsEl = document.getElementById('collection-shelf-skins');
  const trailsEl = document.getElementById('collection-shelf-trails');
  const metaEl = document.getElementById('profile-collection-meta');
  if (!skinsEl && !trailsEl) return;
  const { skins, trails } = Shop.getCollectionItems();
  if (metaEl) {
    const ownedSkins = skins.filter(item => item.owned).length;
    const ownedTrails = trails.filter(item => item.owned).length;
    metaEl.textContent = `${ownedSkins}/${skins.length} skins · ${ownedTrails}/${trails.length} trails`;
  }
  const cellHtml = (item) => `
    <div class="collection-cell${item.owned ? '' : ' locked'}" title="${_escapeHtml(item.name)}">
      ${_imgHtml(item.sprite, 'collection-cell-img', item.name, ' loading="lazy"')}
      ${item.nft ? '<span class="collection-nft">NFT</span>' : ''}
      ${item.owned ? '' : `<span class="collection-lock">${_uiIconHtml('lock', 'collection-lock-img', 'locked')}</span>`}
    </div>`;
  const shelves = [[skinsEl, skins, 'skins'], [trailsEl, trails, 'trails']];
  for (const [holder, items, shopTab] of shelves) {
    if (!holder) continue;
    holder.innerHTML = items.map(cellHtml).join('');
    holder.querySelectorAll('.collection-cell.locked').forEach(cellEl => {
      cellEl.addEventListener('click', () => {
        Shop.show();
        Shop.setTab(shopTab);
      });
    });
  }
}

function _renderProfile() {
  // Wallet address
  const addr = window.__BASE_WALLET || '';
  const nameEl = document.getElementById('profile-name');
  const addrEl = document.getElementById('profile-address');
  const avatarImg = document.getElementById('profile-avatar');
  const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');

  if (addr) {
    // Show shortened address
    if (addrEl) addrEl.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
    // Try to load basename and avatar
    _loadProfileData(addr);
  } else {
    if (nameEl) nameEl.textContent = 'Not connected';
    if (addrEl) addrEl.textContent = '';
    if (avatarImg) avatarImg.style.display = 'none';
    if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex';
  }

  // Stats from quest data + save data
  const questData = (() => {
    try { return JSON.parse(localStorage.getItem('quests_v1') || '{}'); } catch { return {}; }
  })();
  const checkin = Save.getCheckin();

  const el = (id) => document.getElementById(id);

  // Global rank from leaderboard entries
  const _updateRank = () => {
    const entries = window.__BASE_LEADERBOARD_ENTRIES || [];
    const addr    = (window.__BASE_WALLET || '').toLowerCase();
    let rankText  = '#-';
    if (addr && entries.length > 0) {
      const entry = entries.find(e => e.address.toLowerCase() === addr);
      if (entry) rankText = `#${entry.rank ?? (entries.indexOf(entry) + 1)}`;
    }
    if (el('stat-rank')) el('stat-rank').textContent = rankText;
  };
  _updateRank();

  if (el('stat-best'))     el('stat-best').textContent     = Save.getBest();
  if (el('stat-games'))    el('stat-games').textContent    = questData.games?.progress || 0;
  if (el('stat-rows'))     el('stat-rows').textContent     = questData.rows?.progress || 0;
  if (el('stat-coins'))    el('stat-coins').textContent    = questData.coins?.progress || 0;
  if (el('stat-streak'))   el('stat-streak').textContent   = checkin.streak || 0;
  if (el('stat-checkins')) el('stat-checkins').textContent = checkin.total || 0;

  // Career mini progress bars toward the next career quest level
  const _setCareerBar = (key, progress, target) => {
    const fill = el(`career-bar-${key}`);
    const next = el(`career-next-${key}`);
    const tile = el(`career-tile-${key}`);
    if (!fill || !next) return;
    if (!target) {
      fill.style.width = '100%';
      next.textContent = 'MAX';
      if (tile) tile.classList.add('career-max');
      return;
    }
    fill.style.width = `${Math.min(100, (progress / target) * 100)}%`;
    next.textContent = `next ${target}`;
    if (tile) tile.classList.remove('career-max');
  };
  if (typeof Quests !== 'undefined' && typeof Quests.getCareerNext === 'function') {
    for (const key of ['games', 'rows', 'coins']) {
      const info = Quests.getCareerNext(key);
      if (info) _setCareerBar(key, info.progress, info.complete ? 0 : info.target);
    }
  }
  const CHECKIN_MILESTONES = [7, 14, 30, 60, 100, 180, 365];
  const checkinTotal = checkin.total || 0;
  _setCareerBar('checkins', checkinTotal, CHECKIN_MILESTONES.find(m => m > checkinTotal) || 0);

  // XP bar
  if (typeof Xp !== 'undefined') Xp.renderProfile();

  // Career medals and collection shelf
  _renderCareerMedals();
  _renderCollectionShelf();

  // Booster charges
  if (typeof Shop !== 'undefined') {
    for (const key of ['magnet', 'double', 'shield']) {
      const count  = Shop.getBoosterCount(`boost_${key}`);
      const pillEl = el(`profile-boost-${key}`);
      const cntEl  = el(`profile-boost-${key}-count`);
      if (cntEl)  cntEl.textContent = `×${count}`;
      if (pillEl) pillEl.classList.toggle('empty', count === 0);
    }
  }

  renderProfileGear();
}

// Load basename + avatar from server
async function _loadProfileData(addr) {
  const nameEl = document.getElementById('profile-name');
  const avatarImg = document.getElementById('profile-avatar');
  const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');
  const menuIcon = document.getElementById('menu-profile-icon');

  try {
    const res = await fetch('/api/resolve-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: [addr] }),
    });
    const data = await res.json();
    const entry = (data.results || []).find(r => r.address.toLowerCase() === addr.toLowerCase());
    if (entry && entry.name) {
      if (nameEl) nameEl.textContent = entry.name;
    } else {
      if (nameEl) nameEl.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
    }
  } catch {
    if (nameEl) nameEl.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  // Avatar from Neynar
  try {
    const res = await fetch(`/api/score/leaderboard`);
    const data = await res.json();
    const entry = (data.entries || []).find(e => e.address.toLowerCase() === addr.toLowerCase());
    if (entry && entry.avatar) {
      if (avatarImg) {
        avatarImg.src = entry.avatar;
        avatarImg.style.display = 'block';
      }
      if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
      // Update menu icon too
      if (menuIcon) {
        menuIcon.innerHTML = `<img src="${entry.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      }
    }
  } catch {}
}

function _initSettingsScreen() {
  const musicSlider = document.getElementById('settings-music-vol');
  const musicLabel  = document.getElementById('settings-music-label');
  const sfxSlider   = document.getElementById('settings-sfx-vol');
  const sfxLabel    = document.getElementById('settings-sfx-label');
  const vibToggle   = document.getElementById('settings-vibrate-toggle');

  if (musicSlider) {
    const pct = Math.round(Music.getVolume() * 100);
    musicSlider.value = pct;
    if (musicLabel) musicLabel.textContent = pct + '%';
  }
  if (sfxSlider) {
    const pct = Math.round(Sound.getVolume() * 100);
    sfxSlider.value = pct;
    if (sfxLabel) sfxLabel.textContent = pct + '%';
  }
  if (vibToggle) vibToggle.checked = Vibrate.isEnabled();
}

function _requestSessionToken(runId) {
  if (typeof window.__BASE_SESSION_START === 'function') {
    window.__BASE_SESSION_START(runId); // async, non-blocking
  }
}

function _exposeGameBridges() {
  window.Save = Save;
  window.Shop = Shop;
  window.Music = Music;
  window.Sound = Sound;
  // Debug/verification handles (client is trust-light anyway; used by preview checks)
  window.__GAME_DBG = { Renderer, World, Player, Loadout };
  window.Quests = Quests;
  window.Xp = Xp;
  window.RewardEconomy = RewardEconomy;
}

function _initUI() {
  _exposeGameBridges();

  // Load audio preferences up front so the menu, settings sliders, and SFX
  // playback reflect saved state immediately. Sound.init otherwise only runs at
  // game start, leaving muted/volume at defaults on the menu.
  if (typeof Sound !== 'undefined') Sound.init();
  if (typeof Music !== 'undefined') Music.init();

  // Кнопки меню
  _bind('btn-start',   'click', () => Loadout.show());
  document.querySelectorAll('.hub-home-btn').forEach((button) => {
    button.addEventListener('click', () => goToMenu());
  });
  _bind('menu-focus-strip', 'click', () => { Shop.showFocusItem ? Shop.showFocusItem() : Shop.show(); });
  _bind('btn-lb',    'click', () => UI.showLeaderboard());
  // btn-ci removed from profile — check-in is now on the main menu
  _bind('btn-shop',  'click', () => Shop.show());
  _bind('btn-shop-back', 'click', () => goToMenu());
  _bind('shop-tab-skins',    'click', () => Shop.setTab('skins'));
  _bind('shop-tab-boosters', 'click', () => Shop.setTab('boosters'));
  _bind('shop-tab-trails',   'click', () => Shop.setTab('trails'));
  _bind('shop-tab-effects',  'click', () => Shop.setTab('effects'));

  // Profile — direct equipped item cycling
  _bind('btn-hero-skin-prev', 'click', () => cycleProfileGear('skin', -1));
  _bind('btn-hero-skin-next', 'click', () => cycleProfileGear('skin', 1));
  _bind('btn-profile-trail-prev', 'click', () => cycleProfileGear('trail', -1));
  _bind('btn-profile-trail-next', 'click', () => cycleProfileGear('trail', 1));

  // Level-up modal
  _bind('btn-levelup-ok', 'click', _closeLevelUp);

  // XP rewards sheet — open on tap of XP bar or level label
  _bind('profile-xp-clickable', 'click', () => { if (typeof Xp !== 'undefined') Xp.showRewards(); });
  _bind('profile-xp-clickable', 'keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && typeof Xp !== 'undefined') {
      event.preventDefault();
      Xp.showRewards();
    }
  });
  _bind('btn-xp-rewards-close', 'click', () => { if (typeof Xp !== 'undefined') Xp.hideRewards(); });
  // Close on backdrop tap
  const xprModal = document.getElementById('xp-rewards-modal');
  if (xprModal) xprModal.addEventListener('click', (e) => {
    if (e.target === xprModal && typeof Xp !== 'undefined') Xp.hideRewards();
  });

  // Init level badge
  if (typeof Xp !== 'undefined') {
    const badge = document.getElementById('profile-level-badge');
    if (badge) badge.textContent = `Lv.${Xp.getLevel()}`;
  }

  // Кнопка звука
  // btn-mute removed — replaced by btn-settings-game in HUD
  let _settingsReturnScreen = 'menu';

  _bind('btn-settings', 'click', () => {
    _settingsReturnScreen = 'menu';
    _initSettingsScreen();
    UI.show('settings');
  });
  _bind('btn-settings-game', 'click', () => {
    _settingsReturnScreen = 'game';
    _initSettingsScreen();
    UI.show('settings');
  });
  _bind('btn-settings-back', 'click', () => {
    if (_settingsReturnScreen === 'game') {
      // Return to game: show game screen + HUD without resetting swipe hint
      const settingsScreen = document.getElementById('screen-settings');
      const gameScreen     = document.getElementById('screen-game');
      const hud            = document.getElementById('hud');
      if (settingsScreen) settingsScreen.classList.add('hidden');
      if (gameScreen)     gameScreen.classList.remove('hidden');
      if (hud)            hud.classList.remove('hidden');
      if (typeof Music !== 'undefined') Music.pause(); // game screens have no music
    } else {
      goToMenu();
    }
  });

  // Music volume slider — bind once
  const musicSlider = document.getElementById('settings-music-vol');
  if (musicSlider) {
    musicSlider.addEventListener('input', () => {
      Music.setVolume(musicSlider.value / 100);
      const lbl = document.getElementById('settings-music-label');
      if (lbl) lbl.textContent = musicSlider.value + '%';
    });
  }

  // SFX volume slider — bind once
  const sfxSlider = document.getElementById('settings-sfx-vol');
  if (sfxSlider) {
    sfxSlider.addEventListener('input', () => {
      Sound.setVolume(sfxSlider.value / 100);
      const lbl = document.getElementById('settings-sfx-label');
      if (lbl) lbl.textContent = sfxSlider.value + '%';
    });
  }

  // Vibration toggle — bind once
  const vibToggle = document.getElementById('settings-vibrate-toggle');
  if (vibToggle) {
    vibToggle.addEventListener('change', () => {
      Vibrate.setEnabled(vibToggle.checked);
      if (vibToggle.checked) Vibrate.tap();
    });
  }

  // Browsers block audio autoplay until the first user gesture, so music queued
  // on the initial menu render can stay silent. Kick it off (once) on the first
  // interaction — unless we're mid-run, where music is intentionally paused.
  const _armMusicOnGesture = () => {
    if (typeof Music !== 'undefined' && Music.isEnabled() && currentState !== GameState.PLAYING) {
      Music.play();
    }
    window.removeEventListener('pointerdown', _armMusicOnGesture);
    window.removeEventListener('touchstart', _armMusicOnGesture);
    window.removeEventListener('keydown', _armMusicOnGesture);
  };
  window.addEventListener('pointerdown', _armMusicOnGesture);
  window.addEventListener('touchstart', _armMusicOnGesture);
  window.addEventListener('keydown', _armMusicOnGesture);

  // Onchain score claim — every transition is scoped to the exact run + score.
  _bind('btn-claim-score', 'click', () => {
    const btn = document.getElementById('btn-claim-score');
    if (!btn || btn.disabled) return;
    const runId = Number(btn.dataset.runId);
    const score = parseInt(btn.dataset.score || '0', 10);
    const flow = _getRunCompleteFlow();
    const claimScore = window.__BASE_CLAIM_SCORE;
    if (!Number.isSafeInteger(runId) || runId <= 0 || !score || !flow || typeof claimScore !== 'function') return;
    if (!flow.beginClaim(runId, score)) return;

    const claimingSnapshot = flow.getSnapshot();
    if (claimingSnapshot) UI.patchRunComplete(runId, claimingSnapshot);
    Promise.resolve().then(() => claimScore(runId, score)).catch(() => {
      const idleSnapshot = flow.applyClaimState(runId, score, 'idle');
      if (idleSnapshot) UI.patchRunComplete(runId, idleSnapshot);
    });
  });

  window.addEventListener('base-score-claimed', (event) => {
    const detail = event.detail || {};
    const runId = Number(detail.runId);
    const score = Number(detail.score);
    const flow = _getRunCompleteFlow();
    if (!flow) return;
    const claimedSnapshot = flow.applyClaimState(runId, score, 'claimed');
    if (claimedSnapshot) UI.patchRunComplete(runId, claimedSnapshot);
  });

  window.addEventListener('base-score-claim-state', (event) => {
    const detail = event.detail || {};
    const runId = Number(detail.runId);
    const score = Number(detail.score);
    const state = detail.state;
    if (state !== 'confirming' && state !== 'idle') return;
    const flow = _getRunCompleteFlow();
    if (!flow) return;
    const claimSnapshot = flow.applyClaimState(runId, score, state);
    if (claimSnapshot) UI.patchRunComplete(runId, claimSnapshot);
  });

  // Continue screen
  _bind('btn-do-continue', 'click', () => {
    if (currentState !== GameState.CONTINUE) return;
    const runId = _continueRunId;
    if (!Number.isSafeInteger(runId)) return;
    if (Save.getCoins() < CONTINUE_COST) {
      hideContinueOverlay();
      onGameOver(runId);
      return;
    }
    const flow = _getRunCompleteFlow();
    if (!flow || !flow.resumeRun(runId)) return;
    hideContinueOverlay();
    Save.addCoins(-CONTINUE_COST);
    UI.updateCoins(Save.getCoins(), _sessionCoins);
    _continueUsed  = true;
    deathTriggered = false;
    Renderer.stopDeath();
    Player.revive();
    currentState = GameState.PLAYING;
    lastTime     = performance.now();
  });
  _bind('btn-skip-continue', 'click', () => {
    if (currentState !== GameState.CONTINUE) return;
    const runId = _continueRunId;
    if (!Number.isSafeInteger(runId)) return;
    hideContinueOverlay();
    onGameOver(runId);
  });

  if (typeof Loadout !== 'undefined') Loadout.bind();

  // Refresh leaderboard when new data loads
  window.addEventListener('base-leaderboard-loaded', () => {
    const lbScreen = document.getElementById('screen-lb');
    if (lbScreen && !lbScreen.classList.contains('hidden')) {
      Leaderboard.render();
    }
    // Also refresh rank badge on profile if it's visible
    const profScreen = document.getElementById('screen-profile');
    if (profScreen && !profScreen.classList.contains('hidden')) {
      const entries = window.__BASE_LEADERBOARD_ENTRIES || [];
      const addr    = (window.__BASE_WALLET || '').toLowerCase();
      const rankEl  = document.getElementById('stat-rank');
      if (rankEl) {
        const entry = entries.find(e => e.address.toLowerCase() === addr);
        rankEl.textContent = entry ? `#${entry.rank ?? (entries.indexOf(entry) + 1)}` : '#-';
      }
    }
  });

  // Кнопки leaderboard
  _bind('btn-lb-personal', 'click', () => Leaderboard.setMode('personal'));
  _bind('btn-lb-global',   'click', () => Leaderboard.setMode('global'));
  _bind('btn-lb-coins',    'click', () => Leaderboard.setMode('coins'));
  // Period tabs removed — all-time leaderboard only

  // Кнопки check-in
  _bind('btn-do-ci', 'click', () => {
    const result = CheckIn.perform();
    if (result.success) {
      if (result.pending) {
        // On-chain: show confirming state, wait for event
        UI.showCheckIn();
      } else {
        // localStorage fallback — sync coins to Redis
        alert(`Check-in! ${result.message}\nStreak: ${result.streak} days`);
        UI.showCheckIn();
        const syncFn = window.__BASE_SYNC_COINS;
        if (syncFn) syncFn(Save.getCoins());
      }
    } else {
      alert(result.message);
    }
  });

  function applyCheckinRewardLocalFallback() {
    const ci        = Save.getCheckin();
    const newStreak = ci.streak + 1;
    const daySlot   = (newStreak - 1) % 7;
    const reward    = RewardEconomy.getCheckInReward(daySlot);
    const today     = new Date().toISOString().slice(0, 10);
    Save.saveCheckin({ lastDate: today, streak: newStreak, total: (ci.total || 0) + 1 });
    RewardEconomy.applyBundleLocal(reward, 'checkin');
    return { reward, checkin: Save.getCheckin() };
  }

  async function applyCheckinRewardServerClaim() {
    const claimFn = window.__BASE_ECONOMY_CLAIM;
    if (typeof claimFn !== 'function') return null;
    try {
      const claimed = await claimFn({ source: 'checkin' });
      if (!claimed) return { serverRejected: true };
      if (!claimed.ok) return { serverRejected: true, error: claimed.error || 'claim_failed' };
      if (claimed.shop && typeof Shop !== 'undefined' && Shop.applyServerEconomyData) {
        Shop.applyServerEconomyData(claimed.shop);
      }
      if (typeof claimed.coins === 'number') {
        RewardEconomy.setCoinsLocal(claimed.coins);
      }
      if (claimed.result && claimed.result.xpDelta && typeof Xp !== 'undefined' && Xp.add) {
        Xp.add(claimed.result.xpDelta);
      }
      if (claimed.checkin && typeof claimed.checkin === 'object') {
        Save.saveCheckin({
          lastDate: claimed.checkin.lastDate || new Date().toISOString().slice(0, 10),
          streak: Math.max(0, Math.floor(Number(claimed.checkin.streak) || 0)),
          total: Math.max(0, Math.floor(Number(claimed.checkin.total) || 0)),
        });
      }
      return claimed;
    } catch {
      return { serverRejected: true, error: 'claim_failed' };
    }
  }

  // The server verifies the check-in reward against on-chain getState and
  // returns `not_checked_in_onchain` (409) if its RPC node hasn't yet seen the
  // confirmed tx. That lag is transient — retry a few times so the reward lands
  // as soon as the chain propagates instead of being dropped until next visit.
  async function claimCheckinWithRetry(maxAttempts = 6, delayMs = 2500) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const claimed = await applyCheckinRewardServerClaim();
      if (!claimed) return null;                     // no server bridge → local fallback
      if (!claimed.serverRejected) return claimed;   // success / alreadyClaimed
      if (claimed.error !== 'not_checked_in_onchain') return claimed; // real rejection
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
    return { serverRejected: true, error: 'not_checked_in_onchain' };
  }

  // Listen for on-chain check-in confirmation from React
  window.addEventListener('base-checkin-confirmed', async () => {
    const claimed = await claimCheckinWithRetry();
    if (!claimed) applyCheckinRewardLocalFallback();
    else if (claimed.serverRejected) {
      console.warn('check-in reward claim rejected:', claimed.error || 'unknown');
      UI.showCheckIn();
      _updateCiBanner();
      return;
    }

    // Immediately update button — React state may not be updated yet
    const claimBtn = document.getElementById('btn-do-ci');
    if (claimBtn) {
      claimBtn.disabled      = true;
      claimBtn.style.opacity = '0.35';
      claimBtn.textContent   = '✓ CLAIMED';
    }

    // Wait for React to re-render window.__BASE_CHECKIN, then full re-render
    setTimeout(() => UI.showCheckIn(), 600);

    _updateCiBanner();
  });
  _bind('btn-ci-back', 'click', () => goToMenu());

  // Quests
  _bind('btn-quests', 'click', () => { Quests.render(); UI.show('quests'); });
  _bind('btn-quests-back', 'click', () => goToMenu());

  // Quest notify on game over — tap to go to quests
  _bind('go-quest-notify', 'click', () => {
    _leaveActiveRun();
    Quests.render();
    UI.show('quests');
  });

  // Profile
  _bind('btn-profile', 'click', () => { _renderProfile(); UI.show('profile'); });
  _bind('btn-profile-back', 'click', () => goToMenu());

  // Daily Spin
  _bind('btn-ci-banner', 'click', () => UI.showCheckIn());
  _bind('btn-spin',      'click', () => DailySpin.show());
  _bind('btn-do-spin',       'click', () => DailySpin.doSpin());
  _bind('btn-spin-back',     'click', () => goToMenu());
  _bind('btn-spin-nft',      'click', () => DailySpin.onNftClaim());
  _bind('btn-spin-nft-later','click', () => DailySpin.onNftLater());
  window.addEventListener('spin-prize',        e => DailySpin.onPrize(e.detail));
  window.addEventListener('spin-insufficient', () => {
    // Abort animation if running, show "not enough coins"
    DailySpin.onInsufficient();
  });
  // React hook published fresh spin state — refresh banner / button.
  window.addEventListener('spin-state', () => {
    if (typeof DailySpin !== 'undefined') DailySpin.refresh();
  });

  // NFT mint events
  window.addEventListener('nft-minted', (e) => {
    const itemId = e.detail && e.detail.itemId;
    if (!itemId) return;
    // Persist claimed state to localStorage
    _markNftClaimed(itemId);
    // If it's a skin, auto-equip now that it's unlocked
    if (itemId.startsWith('skin_') && typeof Shop !== 'undefined') {
      const owned = Shop.getOwned ? Shop.getOwned() : [];
      if (owned.includes(itemId)) {
        Shop.own && Shop.own(itemId); // ensure owned
        // Equip via internal method exposed on Shop
        if (Shop._equipPublic) Shop._equipPublic(itemId);
        if (typeof Renderer !== 'undefined') Renderer.reloadPlayerSprite();
      }
    }
    // If it's a trail, auto-equip now that it's unlocked
    if (itemId.startsWith('trail_') && typeof Shop !== 'undefined') {
      const trailPacks = Shop.getTrailPacks ? Shop.getTrailPacks() : [];
      if (trailPacks.includes(itemId) && Shop._equipTrailPublic) {
        Shop._equipTrailPublic(itemId);
      }
    }
    // Re-render current shop tab
    if (typeof Shop !== 'undefined' && Shop._refreshNft) Shop._refreshNft();

    // ── Reset spin NFT claim button on success ──────────────────────────
    const spinMintBtn  = document.getElementById('btn-spin-nft');
    const spinNftSec   = document.getElementById('spin-nft-section');
    if (spinMintBtn) { spinMintBtn.textContent = '✓ CLAIMED'; spinMintBtn.disabled = true; }
    const levelupMintBtn = document.querySelector('.levelup-nft-btn');
    if (levelupMintBtn?.dataset.id === itemId) {
      levelupMintBtn.textContent = '✓ CLAIMED';
      levelupMintBtn.disabled = true;
    }
    const spinLater = document.getElementById('btn-spin-nft-later');
    if (spinLater) spinLater.style.display = 'none';
    if (spinNftSec) setTimeout(() => spinNftSec.classList.add('hidden'), 1500);

    // ── Starter Pack bonus (coins + booster + hide overlay) ─────────────
    if (itemId === 'skin_cryptokid') {
      // Award 100 coins (local + Redis sync)
      const newCoins = Save.addCoins(100);
      UI.updateCoins(newCoins);
      if (typeof window.__BASE_SYNC_COINS === 'function') window.__BASE_SYNC_COINS(newCoins);
      // Award 1× Second Chance booster
      if (typeof Shop !== 'undefined' && Shop.addBoosterCharges) {
        Shop.addBoosterCharges('boost_shield', 1);
      }
      // Hide starter pack overlay and banner
      const overlay = document.getElementById('starter-pack-overlay');
      if (overlay) overlay.classList.add('hidden');
      const banner = document.getElementById('btn-starter-pack-banner');
      if (banner) banner.classList.add('hidden');
      // Mark starter pack as seen so we never show it again
      try { localStorage.setItem('starterPackClaimed', '1'); } catch (_) {}
    }
  });
  window.addEventListener('nft-mint-error', (e) => {
    // Reset starter pack claim button if it was the one minting
    const claimBtn = document.getElementById('btn-starter-claim');
    if (claimBtn && claimBtn.disabled) {
      claimBtn.textContent = 'CLAIM FREE';
      claimBtn.disabled    = false;
    }
    // Reset any stuck "Claiming…" shop buttons
    document.querySelectorAll('.shop-nft-btn').forEach(btn => {
      btn.textContent = 'CLAIM ONCHAIN';
      btn.disabled    = false;
    });
    // Reset spin NFT claim button on error
    const spinMintBtn = document.getElementById('btn-spin-nft');
    if (spinMintBtn && spinMintBtn.disabled) {
      spinMintBtn.textContent = 'CLAIM ONCHAIN';
      spinMintBtn.disabled    = false;
    }
    document.querySelectorAll('.levelup-nft-btn').forEach(btn => {
      if (btn.disabled) {
        btn.textContent = 'CLAIM ONCHAIN';
        btn.disabled = false;
      }
    });
  });

  // ── Starter Pack wiring ─────────────────────────────────────────────
  _bind('btn-starter-claim', 'click', () => {
    if (typeof window.__NFT_MINT !== 'function') return;
    const claimBtn = document.getElementById('btn-starter-claim');
    if (claimBtn) { claimBtn.textContent = 'CLAIMING...'; claimBtn.disabled = true; }
    window.__NFT_MINT('skin_cryptokid');
  });
  _bind('btn-starter-skip', 'click', () => {
    const overlay = document.getElementById('starter-pack-overlay');
    if (overlay) overlay.classList.add('hidden');
    // Show the persistent banner in the check-in screen
    const banner = document.getElementById('btn-starter-pack-banner');
    if (banner) banner.classList.remove('hidden');
    try { localStorage.setItem('starterPackSeen', '1'); } catch (_) {}
  });
  _bind('btn-starter-pack-banner', 'click', () => {
    const overlay = document.getElementById('starter-pack-overlay');
    if (overlay) overlay.classList.remove('hidden');
  });

  // ── Show starter pack on first launch (after a short delay) ──────────
  function _maybeShowStarterPack() {
    try {
      if (localStorage.getItem('starterPackClaimed') === '1') return;
    } catch (_) {}
    // Skip if NFT contract not deployed or skin_cryptokid already claimed on-chain
    if (!window.__NFT_DEPLOYED) return;
    if (typeof _isNftClaimed === 'function' && _isNftClaimed('skin_cryptokid')) return;

    // Returning player (played before NFTs were added) — don't interrupt them
    // with the popup; just silently show the banner so they can claim when ready
    const ownedSkins = (typeof Shop !== 'undefined' && Shop.getOwned) ? Shop.getOwned() : ['skin_cryptokid'];
    const isReturningPlayer = Save.getBest() > 0
      || Save.getCoins() > 0
      || ownedSkins.length > 1; // bought at least one extra skin

    try {
      if (localStorage.getItem('starterPackSeen') === '1' || isReturningPlayer) {
        if (isReturningPlayer) {
          // Mark as seen so we never show the full popup to them
          try { localStorage.setItem('starterPackSeen', '1'); } catch (_) {}
        }
        const banner = document.getElementById('btn-starter-pack-banner');
        if (banner) banner.classList.remove('hidden');
        return;
      }
    } catch (_) {}

    // Brand new player — show the full overlay
    const overlay = document.getElementById('starter-pack-overlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  // Старт
  if (typeof Shop !== 'undefined' && Shop.applyLocalGearTestFixture) Shop.applyLocalGearTestFixture();
  if (typeof Shop !== 'undefined' && Shop.applyLocalEconomyTestFixture) Shop.applyLocalEconomyTestFixture();
  UI.show('menu');
  initMenuBackground();
  setTimeout(_maybeShowStarterPack, 1500);
}

// ===== СТАРТ — ждём готовности DOM =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { _initUI(); UI.updateCoins(Save.getCoins()); });
} else {
  _initUI();
  UI.updateCoins(Save.getCoins());
}
