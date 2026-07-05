'use client';

import { useEffect, type CSSProperties } from 'react';
import Script from 'next/script';
import { useCheckIn } from '@/hooks/useCheckIn';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useCoinLeaderboard } from '@/hooks/useCoinLeaderboard';
import { useCoinClaim } from '@/hooks/useCoinClaim';
import { useShopSync } from '@/hooks/useShopSync';
import { useQuestSync } from '@/hooks/useQuestSync';
import { useDailySpin } from '@/hooks/useDailySpin';
import { useNftMint } from '@/hooks/useNftMint';
import { useEconomySync } from '@/hooks/useEconomySync';

type GameWindow = Window & {
  Renderer?: {
    resize?: () => void;
  };
  __BASE_CHECKIN_CLAIM?: () => void;
  __BASE_SUBMIT_SCORE?: (score: number, sessionCoins?: number) => Promise<unknown>;
};

export default function Game() {
  useCheckIn();
  useLeaderboard();
  useCoinLeaderboard();
  useCoinClaim();
  useShopSync();
  useQuestSync();
  useDailySpin();
  useNftMint();
  useEconomySync();

  useEffect(() => {
    const gameWindow = window as GameWindow;

    // Resize canvas on mount
    const handleResize = () => {
      const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
      if (canvas && gameWindow.Renderer?.resize) {
        gameWindow.Renderer.resize();
      }
    };
    window.addEventListener('resize', handleResize);

    // Listen for check-in claim requests from game.js
    const handleClaim = () => {
      const claimFn = gameWindow.__BASE_CHECKIN_CLAIM;
      if (claimFn) claimFn();
    };
    window.addEventListener('base-checkin-claim', handleClaim);

    // Auto-submit score after game over (offchain)
    const handleAutoSubmit = (e: Event) => {
      const detail = (e as CustomEvent<{ score?: number; sessionCoins?: number }>).detail;
      const score = detail?.score;
      const sessionCoins = detail?.sessionCoins;
      const submitFn = gameWindow.__BASE_SUBMIT_SCORE;
      if (submitFn && score) submitFn(score, sessionCoins);
    };
    window.addEventListener('base-auto-submit-score', handleAutoSubmit);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('base-checkin-claim', handleClaim);
      window.removeEventListener('base-auto-submit-score', handleAutoSubmit);
    };
  }, []);

  const loadoutGearCardStyle: CSSProperties = {
    minHeight: 146,
    gridTemplateRows: '82px auto',
    gap: 8,
    padding: '12px 8px 10px',
  };
  const loadoutGearArrowStyle: CSSProperties = {
    width: 28,
    height: 50,
    fontSize: '1.1rem',
  };
  const loadoutGearPreviewStyle: CSSProperties = {
    width: 82,
    height: 80,
    objectFit: 'contain',
    imageRendering: 'pixelated',
  };

  return (
    <div id="game-container" className="game-container">
      {/* Game Scripts */}
      <Script src="/game/generated/rating-config.js" strategy="beforeInteractive" />
      <Script src="/game/game.js" strategy="afterInteractive" />

      {/* Canvas */}
      <canvas id="gameCanvas" />

      {/* HUD */}
      <div id="hud" className="hidden">
        <div className="hud-rail">
          <div id="score-combined">
            <div id="score-box" className="score-item">
              <span className="score-label">STEPS</span>
              <span className="score-val-num" id="score-val">0</span>
            </div>
            <div className="score-divider"></div>
            <div id="best-box" className="score-item">
              <span className="score-label">RECORD</span>
              <span className="score-val-num" id="best-val">0</span>
              <span id="new-record-badge"><img className="record-badge-icon ui-icon" src="/game/ui-icons/leaderboard.png" alt="" aria-hidden="true" />NEW RECORD!</span>
            </div>
          </div>
          <div className="hud-economy">
            <div id="coin-hud">
              <span className="score-label coin-label">COINS</span>
              <div className="coin-hud-row">
                <img src="/game/coin.png" alt="coin" className="coin-icon-hud" />
                <span className="score-val-num" id="coin-count">0</span>
              </div>
              <div id="run-booster-hud" className="run-booster-hud hidden" aria-label="Active run boosters">
                <span className="run-boost-icon run-boost-magnet hidden" id="run-boost-magnet" aria-label="Coin Magnet active">
                  <img src="/game/boosters/coin_magnet.png" alt="" />
                </span>
                <span className="run-boost-icon run-boost-double hidden" id="run-boost-double" aria-label="Double Coins active">
                  <img src="/game/boosters/double_coins.png" alt="" />
                </span>
                <span className="run-boost-icon run-boost-shield hidden" id="run-boost-shield" aria-label="Second Chance active">
                  <img src="/game/boosters/second_chance.png" alt="" />
                </span>
              </div>
            </div>
            <button id="btn-settings-game" className="hud-settings-btn" aria-label="Settings"><img className="hud-settings-icon ui-icon" src="/game/ui-icons/settings.png" alt="" aria-hidden="true" /></button>
          </div>
        </div>
        <div id="run-boost-toast" className="run-boost-toast hidden"></div>
      </div>

      {/* Swipe hint */}
      <div id="swipe-hint" className="hidden">
        <div className="hint-arrows">
          <div className="hint-row">
            <span className="harrow">↑</span>
          </div>
          <div className="hint-row">
            <span className="harrow">←</span>
            <span className="harrow mid">·</span>
            <span className="harrow">→</span>
          </div>
        </div>
        <div className="hint-label">swipe to move</div>
      </div>

      {/* Menu Screen */}
      <div id="screen-menu" className="screen">
        <button id="btn-settings" className="settings-gear-btn" aria-label="Settings"><img className="settings-gear-icon ui-icon" src="/game/ui-icons/settings.png" alt="" aria-hidden="true" /></button>
        <div className="menu-shell">
          <div className="menu-hero">
            <span className="menu-kicker">Base arcade</span>
            <h1 className="game-title">BASE RUNNER</h1>
            <p className="subtitle">how far can you go?</p>
            <div id="menu-coin-balance"><img src="/game/coin.png" className="coin-icon" alt="coin" /> <span id="menu-coin-count">0</span></div>
            <button id="menu-focus-strip" className="menu-focus-strip hidden" type="button">
              <span className="menu-focus-kicker">Focus</span>
              <span className="menu-focus-title" id="menu-focus-title">Choose a focus</span>
              <span className="menu-focus-progress" id="menu-focus-progress">0/0</span>
              <span className="menu-focus-track">
                <span className="menu-focus-fill" id="menu-focus-fill" />
              </span>
            </button>
          </div>
          <div className="menu-missions">
            <span className="menu-section-label">Today</span>
            <div className="daily-banners">
              <button id="btn-spin" className="spin-banner hidden">
                <img className="spin-banner-icon ui-icon" src="/game/ui-icons/daily-spin.png" alt="" aria-hidden="true" />
                <div className="spin-banner-text">
                  <span className="spin-banner-title">Daily Spin</span>
                  <span className="spin-banner-sub" id="spin-banner-sub">Free spin available!</span>
                </div>
                <span className="spin-banner-arrow">›</span>
              </button>
              <button id="btn-ci-banner" className="spin-banner">
                <img className="spin-banner-icon ui-icon" src="/game/ui-icons/daily-checkin.png" alt="" aria-hidden="true" />
                <div className="spin-banner-text">
                  <span className="spin-banner-title">Daily Check-in</span>
                  <span className="spin-banner-sub" id="ci-banner-sub">Claim your reward!</span>
                </div>
                <span className="spin-banner-arrow">›</span>
              </button>
              <button id="btn-starter-pack-banner" className="spin-banner hidden">
                <img className="spin-banner-icon ui-icon" src="/game/ui-icons/starter-pack.png" alt="" aria-hidden="true" />
                <div className="spin-banner-text">
                  <span className="spin-banner-title">Starter Pack</span>
                  <span className="spin-banner-sub">Claim for free - skins, coins & booster!</span>
                </div>
                <span className="spin-banner-arrow">›</span>
              </button>
            </div>
          </div>
          <div className="menu-spacer" />
          <nav className="tab-bar" id="menu-tab-bar">
            <button className="tab-item" id="btn-shop"><img className="tab-icon tab-icon-img ui-icon" src="/game/ui-icons/shop.png" alt="" aria-hidden="true" /><span className="tab-label">Shop</span></button>
            <button className="tab-item" id="btn-quests"><img className="tab-icon tab-icon-img ui-icon" src="/game/ui-icons/quests.png" alt="" aria-hidden="true" /><span className="tab-label">Quests</span></button>
            <button className="tab-item tab-play" id="btn-start"><span className="tab-icon">▶</span><span className="tab-label">Play</span></button>
            <button className="tab-item" id="btn-lb"><img className="tab-icon tab-icon-img ui-icon" src="/game/ui-icons/leaderboard.png" alt="" aria-hidden="true" /><span className="tab-label">Leaders</span></button>
            <button className="tab-item" id="btn-profile" style={{position:'relative'}}><span className="tab-icon tab-icon-img" id="menu-profile-icon"><img className="ui-icon" src="/game/ui-icons/profile.png" alt="" aria-hidden="true" /></span><span className="tab-label">Profile</span><span className="level-badge" id="profile-level-badge">Lv.1</span></button>
          </nav>
        </div>
      </div>

      {/* Loadout Screen */}
      <div id="screen-loadout" className="screen hidden loadout-screen">
        <div className="loadout-panel">
          <div className="loadout-head">
            <h2 className="loadout-title">LOADOUT</h2>
            <div className="loadout-balance">
              <img src="/game/coin.png" alt="coin" />
              <span id="loadout-coin-count">0</span>
            </div>
          </div>
          <div className="loadout-gear" id="loadout-gear">
            <div className="loadout-gear-row" id="loadout-skin-card" style={loadoutGearCardStyle}>
              <button className="loadout-arrow" id="btn-loadout-skin-prev" aria-label="Previous skin" style={loadoutGearArrowStyle}>‹</button>
              <img id="loadout-skin-preview" className="loadout-gear-preview" src="/game/chars/cryptokid.png" alt="Selected skin" style={loadoutGearPreviewStyle} />
              <div className="loadout-gear-info">
                <span className="loadout-gear-label">Skin</span>
                <span className="loadout-gear-name" id="loadout-skin-name">Crypto Kid</span>
                <span className="loadout-gear-count" id="loadout-skin-count">1/1</span>
              </div>
              <button className="loadout-arrow" id="btn-loadout-skin-next" aria-label="Next skin" style={loadoutGearArrowStyle}>›</button>
            </div>
            <div className="loadout-gear-row" id="loadout-trail-card" style={loadoutGearCardStyle}>
              <button className="loadout-arrow" id="btn-loadout-trail-prev" aria-label="Previous trail" style={loadoutGearArrowStyle}>‹</button>
              <img id="loadout-trail-preview" className="loadout-gear-preview" src="/nft/images/trail_default.png" alt="Selected trail" style={loadoutGearPreviewStyle} />
              <div className="loadout-gear-info">
                <span className="loadout-gear-label">Trail</span>
                <span className="loadout-gear-name" id="loadout-trail-name">Default</span>
                <span className="loadout-gear-count" id="loadout-trail-count">1/1</span>
              </div>
              <button className="loadout-arrow" id="btn-loadout-trail-next" aria-label="Next trail" style={loadoutGearArrowStyle}>›</button>
            </div>
          </div>
          <div className="loadout-grid">
            <button id="loadout-boost-magnet" className="loadout-card" data-id="boost_magnet">
              <img src="/game/boosters/coin_magnet.png" alt="Coin Magnet" className="loadout-icon" />
              <span className="loadout-name">Coin Magnet</span>
              <span className="loadout-count" id="loadout-count-magnet">×0</span>
            </button>
            <button id="loadout-boost-double" className="loadout-card" data-id="boost_double">
              <img src="/game/boosters/double_coins.png" alt="Double Coins" className="loadout-icon" />
              <span className="loadout-name">Double Coins</span>
              <span className="loadout-count" id="loadout-count-double">×0</span>
            </button>
            <button id="loadout-boost-shield" className="loadout-card" data-id="boost_shield">
              <img src="/game/boosters/second_chance.png" alt="Second Chance" className="loadout-icon" />
              <span className="loadout-name">Second Chance</span>
              <span className="loadout-count" id="loadout-count-shield">×0</span>
            </button>
          </div>
          <div id="loadout-build-summary" className="loadout-build-summary loadout-build-empty">
            <span className="loadout-build-kicker">Run build</span>
            <span id="loadout-build-title" className="loadout-build-title">No boosters selected</span>
            <span id="loadout-build-hint" className="loadout-build-hint">Pick boosters to shape this run</span>
          </div>
          <div className="loadout-actions">
            <button className="btn btn-start" id="btn-loadout-start">START RUN</button>
            <button className="btn btn-back" id="btn-loadout-back">← MENU</button>
          </div>
        </div>
      </div>

      {/* Profile Screen */}
      <div id="screen-profile" className="screen hidden profile-screen">
        {/* Scrollable content */}
        <div className="profile-scroll">
          <div className="profile-header">
            <img id="profile-avatar" className="profile-avatar" alt="" style={{display:'none'}} />
            <div id="profile-avatar-placeholder" className="profile-avatar" style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem'}}><img className="profile-placeholder-icon ui-icon" src="/game/ui-icons/profile.png" alt="" aria-hidden="true" /></div>
            <div className="profile-info">
              <span className="profile-name" id="profile-name">Not connected</span>
              <span className="profile-address" id="profile-address"></span>
            </div>
          </div>

          {/* XP Progress Bar — tap opens rewards sheet */}
          <div className="profile-xp" id="profile-xp-clickable" style={{cursor:'pointer'}}>
            <div className="profile-xp-row">
              <span className="profile-xp-level" id="xp-level-display">Lv.1</span>
              <span className="profile-xp-hint">Tap to see rewards ›</span>
              <span className="profile-xp-nums" id="xp-nums">0 / 100 XP</span>
            </div>
            <div className="profile-xp-track">
              <div className="profile-xp-fill" id="xp-bar-fill" />
            </div>
          </div>

          <div className="profile-stats" id="profile-stats">
            <div className="profile-stat profile-stat-rank">
              <span className="profile-stat-value" id="stat-rank">#-</span>
              <span className="profile-stat-label">Global Rank</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value" id="stat-best">0</span>
              <span className="profile-stat-label">Best Score</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value" id="stat-games">0</span>
              <span className="profile-stat-label">Games Played</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value" id="stat-rows">0</span>
              <span className="profile-stat-label">Total Rows</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value" id="stat-coins">0</span>
              <span className="profile-stat-label">Coins Earned</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value" id="stat-streak">0</span>
              <span className="profile-stat-label">Check-in Streak</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value" id="stat-checkins">0</span>
              <span className="profile-stat-label">Total Check-ins</span>
            </div>
          </div>

          {/* Booster charges */}
          <div className="profile-boosters">
            <p className="profile-section-title">Boosters</p>
            <div className="profile-booster-row">
              <div className="booster-pill" id="profile-boost-magnet">
                <span className="booster-pill-icon"><img src="/game/boosters/coin_magnet.png" style={{width:'28px',height:'28px',objectFit:'contain',imageRendering:'pixelated'}} alt="Magnet" /></span>
                <span className="booster-pill-count" id="profile-boost-magnet-count">×0</span>
              </div>
              <div className="booster-pill" id="profile-boost-double">
                <span className="booster-pill-icon"><img src="/game/boosters/double_coins.png" style={{width:'28px',height:'28px',objectFit:'contain',imageRendering:'pixelated'}} alt="Double" /></span>
                <span className="booster-pill-count" id="profile-boost-double-count">×0</span>
              </div>
              <div className="booster-pill" id="profile-boost-shield">
                <span className="booster-pill-icon"><img src="/game/boosters/second_chance.png" style={{width:'28px',height:'28px',objectFit:'contain',imageRendering:'pixelated'}} alt="Shield" /></span>
                <span className="booster-pill-count" id="profile-boost-shield-count">×0</span>
              </div>
            </div>
          </div>

          {/* Equipped skin + trail */}
          <div className="profile-equipped">
            <p className="profile-section-title">Equipped</p>
            <div className="profile-equipped-row">
              <div className="equipped-card">
                <span className="equipped-type-label">Skin</span>
                <div className="equipped-picker">
                  <button className="equipped-arrow" id="btn-profile-skin-prev" aria-label="Previous skin">‹</button>
                  <img className="equipped-sprite" id="equipped-skin-sprite" src="/game/chars/cryptokid.png" alt="skin" />
                  <button className="equipped-arrow" id="btn-profile-skin-next" aria-label="Next skin">›</button>
                </div>
                <span className="equipped-name" id="equipped-skin-name">Crypto Kid</span>
                <span className="equipped-count" id="equipped-skin-count">1/1</span>
              </div>
              <div className="equipped-card">
                <span className="equipped-type-label">Trail</span>
                <div className="equipped-picker">
                  <button className="equipped-arrow" id="btn-profile-trail-prev" aria-label="Previous trail">‹</button>
                  <span className="equipped-trail-bubble" id="equipped-trail-bubble">
                    <span id="equipped-trail-icon"><img className="equipped-trail-icon-img" src="/nft/images/trail_default.png" alt="Default trail" /></span>
                  </span>
                  <button className="equipped-arrow" id="btn-profile-trail-next" aria-label="Next trail">›</button>
                </div>
                <span className="equipped-name" id="equipped-trail-name">None</span>
                <span className="equipped-count" id="equipped-trail-count">1/1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed back button — always visible */}
        <div className="profile-back-bar">
          <button className="btn btn-back" id="btn-profile-back">← BACK</button>
        </div>
      </div>

      {/* Game Over Screen */}
      <div id="screen-gameover" className="screen hidden" style={{justifyContent:'center'}}>
        <h2 style={{color:'#fff',fontSize:'clamp(1.5rem,7vw,2.5rem)',marginBottom:'8px',letterSpacing:'3px'}}>GAME OVER</h2>
        <p style={{color:'#4D8FFF',marginBottom:'6px',fontSize:'clamp(0.9rem,4vw,1.2rem)',letterSpacing:'2px'}}>
          SCORE: <span id="go-score">0</span>
        </p>
        <p style={{color:'rgba(255,255,255,0.5)',marginBottom:'8px',fontSize:'clamp(0.75rem,3vw,1rem)',letterSpacing:'2px'}}>
          BEST: <span id="go-best">0</span>
        </p>
        <div id="go-rating-row" className="go-rating-row" style={{display:'none'}}>
          <span id="go-rating-label" className="go-rating-label">Good Run</span>
        </div>
        <p id="go-coins-row" style={{color:'#FFD700',marginBottom:'8px',fontSize:'clamp(0.85rem,3.5vw,1.1rem)',letterSpacing:'2px',display:'none',alignItems:'center',justifyContent:'center',gap:'5px'}}>
          <img src="/game/coin.png" alt="coin" style={{width:'18px',height:'18px',objectFit:'contain'}} /> +<span id="go-coins-earned">0</span> COINS
        </p>
        <div id="go-xp-row" className="go-xp-row" style={{display:'none'}}>
          <span className="go-xp-main"><img className="go-xp-icon ui-icon" src="/game/ui-icons/celebration.png" alt="" aria-hidden="true" />+<span id="go-xp-earned">0</span> XP</span>
          <span id="go-xp-multi" className="go-xp-multi" style={{display:'none'}}></span>
          <span id="go-xp-bonus" className="go-xp-bonus" style={{display:'none'}}></span>
        </div>
        <p id="go-quest-notify" className="quest-notify" style={{display:'none'}}><img className="quest-notify-icon ui-icon" src="/game/ui-icons/quests.png" alt="" aria-hidden="true" />Quest complete! Tap to claim</p>
        <button className="btn btn-restart" id="btn-restart">↺ PLAY AGAIN</button>
        <button className="btn btn-back" id="btn-go-menu">← MENU</button>
      </div>

      {/* XP Rewards Sheet */}
      <div id="xp-rewards-modal" className="xp-rewards-modal hidden">
        <div className="xp-rewards-sheet">
          <div className="xp-rewards-header">
            <span className="xp-rewards-title">Level Rewards</span>
            <button className="xp-rewards-close" id="btn-xp-rewards-close">✕</button>
          </div>
          <div className="xp-rewards-list" id="xp-rewards-list" />
        </div>
      </div>

      {/* Level-up Modal */}
      <div id="levelup-modal" className="levelup-modal hidden">
        <div className="levelup-card">
          <div className="levelup-icon" id="levelup-icon"><img className="levelup-icon-img ui-icon" src="/game/ui-icons/celebration.png" alt="" aria-hidden="true" /></div>
          <div className="levelup-title">LEVEL UP!</div>
          <div className="levelup-level" id="levelup-level">Lv.2</div>
          <div className="levelup-reward" id="levelup-reward">+100 Coins</div>
          <div id="levelup-nft-row" className="levelup-nft-row hidden" />
          <button className="btn levelup-btn" id="btn-levelup-ok">Awesome!</button>
        </div>
      </div>

      {/* Continue Screen */}
      <div id="screen-continue" className="screen hidden" style={{justifyContent:'center',background:'rgba(0,0,0,0.82)'}}>
        <div style={{textAlign:'center',padding:'36px 28px',background:'rgba(5,8,30,0.97)',borderRadius:'22px',border:'1px solid rgba(77,143,255,0.35)',maxWidth:'280px',width:'85vw'}}>
          <h2 style={{color:'#fff',fontSize:'clamp(1.3rem,6vw,2rem)',marginBottom:'6px',letterSpacing:'3px'}}>CONTINUE?</h2>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:'clamp(0.8rem,3.5vw,0.95rem)',marginBottom:'16px'}}>Keep your progress going</p>
          {/* Player's current balance */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',marginBottom:'18px',color:'rgba(255,255,255,0.45)',fontSize:'clamp(0.75rem,3vw,0.9rem)'}}>
            Your balance:&nbsp;<img src="/game/coin.png" style={{width:'14px',height:'14px',objectFit:'contain'}} alt="coin" /><span id="continue-balance" style={{color:'rgba(255,255,255,0.7)'}}>0</span>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',marginBottom:'26px'}}>
            <img src="/game/coin.png" style={{width:'30px',height:'30px',objectFit:'contain'}} alt="coin" />
            <span style={{color:'#FFD700',fontSize:'clamp(1.6rem,7vw,2.4rem)',fontWeight:'bold'}} id="continue-cost">100</span>
          </div>
          <button className="btn" id="btn-do-continue" style={{background:'#0052FF',color:'#fff',marginBottom:'12px',width:'100%',fontSize:'clamp(0.9rem,4vw,1.1rem)'}}>
            ▶ CONTINUE
          </button>
          <button className="btn btn-back" id="btn-skip-continue" style={{width:'100%',fontSize:'clamp(0.85rem,3.5vw,1rem)'}}>
            ✕ GIVE UP (<span id="continue-timer">5</span>s)
          </button>
        </div>
      </div>

      {/* Daily Spin Screen */}
      <div id="screen-spin" className="screen hidden spin-screen">
        <div className="spin-scroll">
          <h2 className="icon-screen-title" style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,1.8rem)',marginBottom:'4px',letterSpacing:'3px'}}><img className="screen-title-icon ui-icon" src="/game/ui-icons/daily-spin.png" alt="" aria-hidden="true" />DAILY SPIN</h2>
          <p style={{color:'rgba(255,255,255,0.45)',fontSize:'clamp(0.75rem,3vw,0.9rem)',marginBottom:'16px',letterSpacing:'1px'}}>Free once a day · resets at 00:00 UTC</p>

          {/* Wheel canvas */}
          <div className="spin-wheel-wrap">
            <canvas id="spin-wheel-canvas" />
            {/* Fixed pointer at top */}
            <div className="spin-pointer" />
          </div>

          {/* Unified prize card — result + optional NFT claim */}
          <div id="spin-prize-card" className="spin-prize-card hidden">
            <div id="spin-prize-icon" className="spin-prize-icon"></div>
            <div id="spin-prize-label" className="spin-prize-label"></div>
            <div id="spin-nft-section" className="spin-nft-section hidden">
              <div className="spin-nft-divider" />
              <div className="spin-nft-sub">Claim as NFT on Base</div>
              <button className="spin-nft-btn" id="btn-spin-nft">Claim</button>
              <button className="spin-nft-later" id="btn-spin-nft-later">Later →</button>
            </div>
          </div>

          {/* Countdown when already spun */}
          <div id="spin-timer" className="spin-timer hidden" />

          <button className="btn" id="btn-do-spin" style={{color:'#fff',marginBottom:'10px',width:'min(280px,85vw)',fontSize:'clamp(1rem,4.5vw,1.2rem)',letterSpacing:'2px'}}>
            <img className="btn-inline-icon ui-icon" src="/game/ui-icons/daily-spin.png" alt="" aria-hidden="true" /> SPIN
          </button>
        </div>
        <div className="spin-back-bar">
          <button className="btn btn-back" id="btn-spin-back" style={{width:'min(280px,85vw)'}}>← BACK</button>
        </div>
      </div>

      {/* Leaderboard Screen */}
      <div id="screen-lb" className="screen hidden scroll-screen">
        <div className="scroll-screen-body">
          <h2 className="icon-screen-title" style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'16px',letterSpacing:'3px'}}><img className="screen-title-icon ui-icon" src="/game/ui-icons/leaderboard.png" alt="" aria-hidden="true" />LEADERBOARD</h2>
          <div className="lb-tabs">
            <button className="lb-tab lb-tab-active" id="btn-lb-personal">Personal</button>
            <button className="lb-tab" id="btn-lb-global">Global</button>
            <button className="lb-tab" id="btn-lb-coins">Coins</button>
          </div>
          {/* Period tabs removed — all-time only */}
          <div id="lb-list" style={{width:'min(320px,90vw)'}}></div>
        </div>
        <div className="scroll-back-bar">
          <button className="btn btn-back" id="btn-lb-back">← BACK</button>
        </div>
      </div>

      {/* Shop Screen */}
      <div id="screen-shop" className="screen hidden scroll-screen">
        <div className="scroll-screen-body">
          <h2 className="icon-screen-title" style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'8px',letterSpacing:'3px'}}><img className="screen-title-icon ui-icon" src="/game/ui-icons/shop.png" alt="" aria-hidden="true" />SHOP</h2>
          <div id="shop-balance" style={{color:'#FFD700',fontSize:'clamp(1rem,4.5vw,1.3rem)',marginBottom:'20px',fontWeight:'bold',display:'flex',alignItems:'center',gap:'6px',justifyContent:'center'}}>
            <img src="/game/coin.png" alt="coin" style={{width:'22px',height:'22px',objectFit:'contain'}} />
            <span id="shop-coin-count">0</span>
          </div>
          <div id="shop-tabs" style={{display:'flex',gap:'0',marginBottom:'16px',width:'min(320px,90vw)'}}>
            <button id="shop-tab-skins" className="shop-tab shop-tab-active">Skins</button>
            <button id="shop-tab-boosters" className="shop-tab">Boosters</button>
            <button id="shop-tab-trails" className="shop-tab">Trails</button>
          </div>
          <div id="shop-items" style={{width:'min(320px,90vw)'}}></div>
        </div>
        <div className="scroll-back-bar">
          <button className="btn btn-back" id="btn-shop-back">← BACK</button>
        </div>
      </div>

      {/* Quests Screen */}
      <div id="screen-quests" className="screen hidden scroll-screen">
        <div className="scroll-screen-body">
          <h2 className="icon-screen-title" style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'16px',letterSpacing:'3px'}}><img className="screen-title-icon ui-icon" src="/game/ui-icons/quests.png" alt="" aria-hidden="true" />QUESTS</h2>
          <div id="quest-list" style={{width:'min(340px,90vw)'}}></div>
        </div>
        <div className="scroll-back-bar">
          <button className="btn btn-back" id="btn-quests-back">← BACK</button>
        </div>
      </div>

      {/* Settings Screen */}
      <div id="screen-settings" className="screen hidden scroll-screen">
        <div className="scroll-screen-body settings-screen-body">
          <h2 className="icon-screen-title" style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'32px',letterSpacing:'3px'}}><img className="screen-title-icon ui-icon" src="/game/ui-icons/settings.png" alt="" aria-hidden="true" />SETTINGS</h2>
          <div className="settings-list">
            {/* Music Volume */}
            <div className="settings-row">
              <div className="settings-row-info">
                <img className="settings-row-icon settings-row-icon-img ui-icon" src="/game/ui-icons/music.png" alt="" aria-hidden="true" />
                <span className="settings-row-label">Music</span>
              </div>
              <div className="settings-slider-wrap">
                <input type="range" id="settings-music-vol" className="settings-slider"
                  min="0" max="100" step="5" defaultValue="50" />
                <span className="settings-slider-val" id="settings-music-label">50%</span>
              </div>
            </div>
            {/* SFX Volume */}
            <div className="settings-row">
              <div className="settings-row-info">
                <img className="settings-row-icon settings-row-icon-img ui-icon" src="/game/ui-icons/sound.png" alt="" aria-hidden="true" />
                <span className="settings-row-label">Sound Effects</span>
              </div>
              <div className="settings-slider-wrap">
                <input type="range" id="settings-sfx-vol" className="settings-slider"
                  min="0" max="100" step="5" defaultValue="80" />
                <span className="settings-slider-val" id="settings-sfx-label">80%</span>
              </div>
            </div>
            {/* Vibration */}
            <div className="settings-row">
              <div className="settings-row-info">
                <img className="settings-row-icon settings-row-icon-img ui-icon" src="/game/ui-icons/vibration.png" alt="" aria-hidden="true" />
                <span className="settings-row-label">Vibration</span>
              </div>
              <label className="settings-toggle">
                <input type="checkbox" id="settings-vibrate-toggle" defaultChecked />
                <span className="settings-toggle-track">
                  <span className="settings-toggle-thumb" />
                </span>
              </label>
            </div>
          </div>
        </div>
        <div className="scroll-back-bar">
          <button className="btn btn-back" id="btn-settings-back">← BACK</button>
        </div>
      </div>

      {/* Starter Pack Overlay */}
      <div id="starter-pack-overlay" className="starter-pack-overlay hidden">
        <div className="starter-pack-card">
          <div className="starter-pack-badge">FREE</div>
          <h2 className="starter-pack-title"><img className="screen-title-icon ui-icon" src="/game/ui-icons/starter-pack.png" alt="" aria-hidden="true" />STARTER PACK</h2>
          <p className="starter-pack-desc">Claim your starter pack and gear up for your first run! Get 100 bonus coins, an on-chain character with starter skin and trails, and a booster for extra lives - all free on Base!</p>
          <div className="starter-pack-items">
            <div className="starter-item">
              <img src="/game/chars/cryptokid.png" className="starter-item-img" alt="skin" />
              <span className="starter-item-name">Crypto Kid</span>
              <span className="starter-item-type">Skin</span>
            </div>
            <div className="starter-item">
              <img src="/nft/images/trail_default.png" className="starter-item-img" alt="trail" />
              <span className="starter-item-name">Default Trail</span>
              <span className="starter-item-type">Trail</span>
            </div>
            <div className="starter-item">
              <img src="/game/coin.png" className="starter-item-img" alt="coins" />
              <span className="starter-item-name">100 Coins</span>
              <span className="starter-item-type">Bonus</span>
            </div>
            <div className="starter-item">
              <img src="/game/boosters/second_chance.png" className="starter-item-img" alt="booster" />
              <span className="starter-item-name">Second Chance</span>
              <span className="starter-item-type">Booster</span>
            </div>
          </div>
          <button id="btn-starter-claim" className="starter-claim-btn">Claim for Free</button>
          <button id="btn-starter-skip" className="starter-skip-btn">Skip for now →</button>
        </div>
      </div>

      {/* Check-in Screen */}
      <div id="screen-ci" className="screen hidden">
        <div className="ci-header">
          <h2 className="screen-title"><img className="screen-title-icon ui-icon" src="/game/ui-icons/daily-checkin.png" alt="" aria-hidden="true" />DAILY CHECK-IN</h2>
        </div>
        <div className="ci-streak-row">
          <span id="ci-streak" className="ci-streak-num">0</span>
          <span className="ci-streak-lbl">day<br/>streak</span>
        </div>
        <div id="ci-days-grid" className="ci-days"></div>
        <div className="ci-status-box">
          <span id="ci-status-text" className="ci-status"></span>
        </div>
        <button className="btn btn-start" id="btn-do-ci">Claim</button>
        <button className="btn btn-back" id="btn-ci-back">← BACK</button>
      </div>
    </div>
  );
}
