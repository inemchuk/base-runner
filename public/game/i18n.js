// ── Base Runner i18n ────────────────────────────────────────────────────────
// Loaded before game.js. Static markup carries data-i18n="key"; I18N.apply()
// translates every tagged node. Dynamic strings call window.t(key).
// Missing key or missing translation → English fallback → key itself.
// New UI strings must get a key here (see CLAUDE.md).
(function () {
  'use strict';

  const DICT = {
    en: {
      // Menu
      'menu.today': 'Today',
      'menu.best': 'Best',
      'menu.rank': 'Rank',
      'menu.daily_spin': 'Daily Spin',
      'menu.spin_free': 'Free spin available!',
      'menu.daily_checkin': 'Daily Check-in',
      'menu.checkin_claim': 'Claim your reward!',
      'menu.starter_pack': 'Starter Pack',
      'menu.starter_sub': 'Claim for free - skins, coins & booster!',
      'menu.invite_earn': 'Invite & Earn',
      'menu.invite_sub': '$0.25 per friend',
      // Hub nav
      'nav.shop': 'Shop',
      'nav.quests': 'Quests',
      'nav.leaders': 'Leaders',
      'nav.profile': 'Profile',
      // Common
      'common.home': '← HOME',
      'common.back': '← BACK',
      'common.claim': 'CLAIM',
      'common.play_now': 'PLAY NOW',
      'common.loading': 'Loading…',
      // Settings
      'settings.title': 'SETTINGS',
      'settings.music': 'Music',
      'settings.sfx': 'Sound Effects',
      'settings.vibration': 'Vibration',
      'settings.language': 'Language',
      // Feedback
      'feedback.kicker': 'Player feedback',
      'feedback.title': 'Help improve the run',
      'feedback.copy': 'Report a bug or share an idea directly with the team.',
      'feedback.bug': 'Bug',
      'feedback.idea': 'Idea',
      'feedback.message_label': 'Your feedback',
      'feedback.placeholder': 'What happened, or what would make the game better?',
      'feedback.send': 'SEND FEEDBACK',
      'feedback.sending': 'Sending…',
      'feedback.sent': 'Sent. Thank you.',
      'feedback.too_short': 'Add at least 10 characters.',
      'feedback.try_again': 'Could not send it. Try again.',
      'feedback.rate_limited': 'One message per minute.',
      // Check-in
      'ci.title': 'DAILY CHECK-IN',
      'ci.streak_lbl': 'day\nstreak',
      // Daily spin
      'spin.eyebrow': 'Daily drop',
      'spin.title': 'DAILY SPIN',
      'spin.subtitle': 'One free drop every day · UTC reset',
      'spin.free': 'FREE SPIN',
      'spin.preparing': 'PREPARING DROP…',
      'spin.spinning': 'SPINNING…',
      'spin.need_coins': 'Need {count} more coins',
      'spin.paid': 'SPIN',
      'spin.next': 'Next drop in',
      'spin.available': 'Free drop available!',
      'spin.paid_banner': 'Spin for {count} coins',
      'spin.no_drop': 'NO DROP',
      'spin.try_tomorrow': 'Try again tomorrow',
      'spin.unavailable': 'Not enough coins',
      'spin.nft_sub': 'Mint this reward on Base',
      'spin.nft_mint': 'MINT ON BASE',
      'spin.nft_minting': 'MINTING…',
      'spin.nft_claimed': '✓ MINTED',
      'spin.nft_later': 'Keep in collection',
      'spin.rarity.common': 'COMMON',
      'spin.rarity.uncommon': 'UNCOMMON',
      'spin.rarity.rare': 'RARE',
      'spin.rarity.epic': 'EPIC',
      'spin.rarity.legendary': 'LEGENDARY',
      // Referral
      'ref.eyebrow': 'Referral program',
      'ref.title': 'INVITE',
      'ref.balance': 'Balance',
      'ref.pitch_a': 'Invite friends to Base Runner. When a friend makes',
      'ref.game_transactions': 'game transactions on Base',
      'ref.pitch_b': 'transactions in the game, you earn',
      'ref.your_code': 'Your code',
      'ref.share': 'SHARE INVITE LINK',
      'ref.copied': 'Link copied!',
      'ref.invited': 'Invited friends',
      'ref.empty': 'No invites yet. Share your link to start earning.',
      'ref.paused': 'Referral program is paused.',
      'ref.terms': 'Paid in USDC on Base every week. Fraudulent referrals are voided.',
      'ref.earned': '✓ $0.25 earned',
      // Profile
      'profile.eyebrow': 'Runner dossier',
      'profile.title': 'PROFILE',
      'profile.referrals': 'Referrals',
      'profile.career': 'Career',
      'profile.all_time': 'All time',
      // Badges
      'badges.note': 'Unlock a tier, then claim it free on Base. Gas is covered.',
      'badges.connect': 'Connect wallet to claim badges',
      'badges.progress': 'Progress',
      'badges.unlocked': 'unlocked',
      'badges.claimed_word': 'claimed',
      'badges.claim': 'CLAIM',
      'badges.claiming': 'CLAIMING…',
      'badges.claimed': '✓ CLAIMED',
      'badges.ready': 'READY TO CLAIM',
      'badges.locked': 'LOCKED',
      'badges.career_label': 'Achievement badges',
      'badges.career_meta': 'Claim on Base',
      'badges.track': 'Badge track',
      'badges.view': 'VIEW MILESTONES',
      'badges.all_unlocked': 'All levels unlocked',
      'badges.connect_short': 'Connect wallet to load progress',
    },
    ru: {
      'menu.today': 'Сегодня',
      'menu.best': 'Рекорд',
      'menu.rank': 'Ранг',
      'menu.daily_spin': 'Колесо дня',
      'menu.spin_free': 'Бесплатный спин!',
      'menu.daily_checkin': 'Чек-ин дня',
      'menu.checkin_claim': 'Забери награду!',
      'menu.starter_pack': 'Стартовый набор',
      'menu.starter_sub': 'Бесплатно: скины, монеты и бустер!',
      'menu.invite_earn': 'Зови и зарабатывай',
      'menu.invite_sub': '$0.25 за друга',
      'nav.shop': 'Магазин',
      'nav.quests': 'Задания',
      'nav.leaders': 'Лидеры',
      'nav.profile': 'Профиль',
      'common.home': '← ДОМОЙ',
      'common.back': '← НАЗАД',
      'common.claim': 'ЗАБРАТЬ',
      'common.play_now': 'ИГРАТЬ',
      'common.loading': 'Загрузка…',
      'settings.title': 'НАСТРОЙКИ',
      'settings.music': 'Музыка',
      'settings.sfx': 'Звуки',
      'settings.vibration': 'Вибрация',
      'settings.language': 'Язык',
      'feedback.kicker': 'Обратная связь',
      'feedback.title': 'Помоги улучшить забег',
      'feedback.copy': 'Сообщи о баге или поделись идеей напрямую с командой.',
      'feedback.bug': 'Баг',
      'feedback.idea': 'Идея',
      'feedback.message_label': 'Твой отзыв',
      'feedback.placeholder': 'Что случилось или что сделало бы игру лучше?',
      'feedback.send': 'ОТПРАВИТЬ',
      'feedback.sending': 'Отправляем…',
      'feedback.sent': 'Отправлено. Спасибо.',
      'feedback.too_short': 'Нужно минимум 10 символов.',
      'feedback.try_again': 'Не удалось отправить. Попробуй ещё раз.',
      'feedback.rate_limited': 'Не чаще одного сообщения в минуту.',
      'ci.title': 'ЕЖЕДНЕВНЫЙ ЧЕК-ИН',
      'ci.streak_lbl': 'дней\nподряд',
      // Daily spin
      'spin.eyebrow': 'Награда дня',
      'spin.title': 'КОЛЕСО ДНЯ',
      'spin.subtitle': 'Одна бесплатная награда каждый день · UTC',
      'spin.free': 'БЕСПЛАТНЫЙ СПИН',
      'spin.preparing': 'ГОТОВИМ НАГРАДУ…',
      'spin.spinning': 'КРУТИМ…',
      'spin.need_coins': 'Нужно ещё {count} монет',
      'spin.paid': 'КРУТИТЬ',
      'spin.next': 'Следующая награда через',
      'spin.available': 'Бесплатная награда доступна!',
      'spin.paid_banner': 'Спин за {count} монет',
      'spin.no_drop': 'БЕЗ НАГРАДЫ',
      'spin.try_tomorrow': 'Попробуй завтра',
      'spin.unavailable': 'Недостаточно монет',
      'spin.nft_sub': 'Минтни эту награду в Base',
      'spin.nft_mint': 'МИНТ В BASE',
      'spin.nft_minting': 'МИНТИМ…',
      'spin.nft_claimed': '✓ ЕСТЬ',
      'spin.nft_later': 'Оставить в коллекции',
      'spin.rarity.common': 'ОБЫЧНАЯ',
      'spin.rarity.uncommon': 'НЕОБЫЧНАЯ',
      'spin.rarity.rare': 'РЕДКАЯ',
      'spin.rarity.epic': 'ЭПИЧЕСКАЯ',
      'spin.rarity.legendary': 'ЛЕГЕНДАРНАЯ',
      'ref.eyebrow': 'Реферальная программа',
      'ref.title': 'ПРИГЛАСИ',
      'ref.balance': 'Баланс',
      'ref.pitch_a': 'Зови друзей в Base Runner. Когда друг сделает',
      'ref.game_transactions': 'игровых транзакций в Base',
      'ref.pitch_b': 'транзакций в игре, ты получишь',
      'ref.your_code': 'Твой код',
      'ref.share': 'ПОДЕЛИТЬСЯ ССЫЛКОЙ',
      'ref.copied': 'Ссылка скопирована!',
      'ref.invited': 'Приглашённые друзья',
      'ref.empty': 'Пока никого. Поделись ссылкой и начни зарабатывать.',
      'ref.paused': 'Реферальная программа на паузе.',
      'ref.terms': 'Выплаты в USDC на Base проходят раз в неделю. Накрученные рефералы аннулируются.',
      'ref.earned': '✓ $0.25 получено',
      'profile.eyebrow': 'Досье бегуна',
      'profile.title': 'ПРОФИЛЬ',
      'profile.referrals': 'Рефералы',
      'profile.career': 'Карьера',
      'profile.all_time': 'За всё время',
      'badges.note': 'Открой уровень и забери бейдж бесплатно в Base. Газ оплачен.',
      'badges.connect': 'Подключи кошелёк, чтобы забрать бейджи',
      'badges.progress': 'Прогресс',
      'badges.unlocked': 'открыто',
      'badges.claimed_word': 'забрано',
      'badges.claim': 'ЗАБРАТЬ',
      'badges.claiming': 'ЗАБИРАЕМ…',
      'badges.claimed': '✓ ЗАБРАНО',
      'badges.ready': 'МОЖНО ЗАБРАТЬ',
      'badges.locked': 'ЗАКРЫТО',
      'badges.career_label': 'Бейджи достижений',
      'badges.career_meta': 'Забрать в Base',
      'badges.track': 'Трек бейджа',
      'badges.view': 'СМОТРЕТЬ УРОВНИ',
      'badges.all_unlocked': 'Все уровни открыты',
      'badges.connect_short': 'Подключи кошелёк для прогресса',
    },
  };

  const LANGS = ['en', 'ru'];

  function detect() {
    try {
      const saved = localStorage.getItem('lang');
      if (saved && LANGS.indexOf(saved) !== -1) return saved;
    } catch (_) {}
    const nav = (navigator.language || '').toLowerCase();
    return nav.indexOf('ru') === 0 ? 'ru' : 'en';
  }

  let lang = detect();

  function t(key) {
    return (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }

  function setLang(next) {
    if (LANGS.indexOf(next) === -1) return;
    lang = next;
    try { localStorage.setItem('lang', next); } catch (_) {}
    apply();
    window.dispatchEvent(new CustomEvent('lang-changed', { detail: { lang: next } }));
  }

  window.t = t;
  window.I18N = {
    get lang() { return lang; },
    langs: LANGS,
    t: t,
    apply: apply,
    setLang: setLang,
    cycle: function () {
      setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(); });
  } else {
    apply();
  }
})();
