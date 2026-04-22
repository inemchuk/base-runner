'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { useCheckIn } from '@/hooks/useCheckIn';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useCoinLeaderboard } from '@/hooks/useCoinLeaderboard';
import { useCoinClaim } from '@/hooks/useCoinClaim';
import { useShopSync } from '@/hooks/useShopSync';
import { useQuestSync } from '@/hooks/useQuestSync';

export default function Game() {
  useCheckIn();
  useLeaderboard();
  useCoinLeaderboard();
  useCoinClaim();
  useShopSync();
  useQuestSync();

  useEffect(() => {
    // Resize canvas on mount
    const handleResize = () => {
      const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
      if (canvas && (window as any).Renderer) {
        (window as any).Renderer.resize();
      }
    };
    window.addEventListener('resize', handleResize);

    // Listen for check-in claim requests from game.js
    const handleClaim = () => {
      const claimFn = (window as any).__BASE_CHECKIN_CLAIM;
      if (claimFn) claimFn();
    };
    window.addEventListener('base-checkin-claim', handleClaim);

    // Auto-submit score after game over (offchain)
    const handleAutoSubmit = (e: Event) => {
      const score = (e as CustomEvent).detail?.score;
      const submitFn = (window as any).__BASE_SUBMIT_SCORE;
      if (submitFn && score) submitFn(score);
    };
    window.addEventListener('base-auto-submit-score', handleAutoSubmit);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('base-checkin-claim', handleClaim);
      window.removeEventListener('base-auto-submit-score', handleAutoSubmit);
    };
  }, []);

  return (
    <>
      {/* Game Scripts */}
      <Script src="/game/game.js" strategy="afterInteractive" />

      {/* Canvas */}
      <canvas id="gameCanvas" />

      {/* HUD */}
      <div id="hud" className="hidden">
        <div id="score-combined">
          <div id="score-box" className="score-item">
            <span className="score-label">STEPS</span>
            <span className="score-val-num" id="score-val">0</span>
          </div>
          <div className="score-divider"></div>
          <div id="best-box" className="score-item">
            <span className="score-label">RECORD</span>
            <span className="score-val-num" id="best-val">0</span>
            <span id="new-record-badge">🏆 NEW RECORD!</span>
          </div>
        </div>
        <div id="coin-hud">
          <span className="score-label">COINS</span>
          <div style={{display:'flex',flexDirection:'row',alignItems:'center',gap:'5px'}}>
            <img src="/game/coin.png" alt="coin" style={{width:'18px',height:'18px',objectFit:'contain',flexShrink:0}} />
            <span className="score-val-num" id="coin-count">0</span>
          </div>
        </div>
        <button id="btn-mute">🔊</button>
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
        <h1 className="game-title">BASE RUNNER</h1>
        <p className="subtitle">how far can you go?</p>
        <div id="menu-coin-balance"><img src="/game/coin.png" className="coin-icon" alt="coin" /> <span id="menu-coin-count">0</span></div>
        <div style={{flex:1}} />
        <nav className="tab-bar" id="menu-tab-bar">
          <button className="tab-item" id="btn-shop"><span className="tab-icon">🛒</span><span className="tab-label">Shop</span></button>
          <button className="tab-item" id="btn-quests"><span className="tab-icon">🎯</span><span className="tab-label">Quests</span></button>
          <button className="tab-item tab-play" id="btn-start"><span className="tab-icon">▶</span><span className="tab-label">Play</span></button>
          <button className="tab-item" id="btn-lb"><span className="tab-icon">🏆</span><span className="tab-label">Leaders</span></button>
          <button className="tab-item" id="btn-profile"><span className="tab-icon" id="menu-profile-icon">👤</span><span className="tab-label">Profile</span></button>
        </nav>
      </div>

      {/* Profile Screen */}
      <div id="screen-profile" className="screen hidden" style={{justifyContent:'flex-start',paddingTop:'6vh'}}>
        <div className="profile-header">
          <img id="profile-avatar" className="profile-avatar" src="" alt="" style={{display:'none'}} />
          <div id="profile-avatar-placeholder" className="profile-avatar" style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem'}}>👤</div>
          <div className="profile-info">
            <span className="profile-name" id="profile-name">Not connected</span>
            <span className="profile-address" id="profile-address"></span>
          </div>
        </div>
        <div className="profile-stats" id="profile-stats">
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
        <button className="btn btn-ci" id="btn-ci" style={{marginBottom:'12px'}}>📅 Daily Check-in</button>
        <button className="btn btn-back" id="btn-profile-back">← BACK</button>
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
        <p id="go-coins-row" style={{color:'#FFD700',marginBottom:'32px',fontSize:'clamp(0.85rem,3.5vw,1.1rem)',letterSpacing:'2px',display:'none',alignItems:'center',justifyContent:'center',gap:'5px'}}>
          <img src="/game/coin.png" alt="coin" style={{width:'18px',height:'18px',objectFit:'contain'}} /> +<span id="go-coins-earned">0</span> COINS
        </p>
        <p id="go-quest-notify" className="quest-notify" style={{display:'none'}}>🎯 Quest complete! Tap to claim</p>
        <button className="btn btn-restart" id="btn-restart">↺ PLAY AGAIN</button>
        <button className="btn btn-back" id="btn-go-menu">← MENU</button>
      </div>

      {/* Continue Screen */}
      <div id="screen-continue" className="screen hidden" style={{justifyContent:'center',background:'rgba(0,0,0,0.82)'}}>
        <div style={{textAlign:'center',padding:'36px 28px',background:'rgba(5,8,30,0.97)',borderRadius:'22px',border:'1px solid rgba(77,143,255,0.35)',maxWidth:'280px',width:'85vw'}}>
          <h2 style={{color:'#fff',fontSize:'clamp(1.3rem,6vw,2rem)',marginBottom:'6px',letterSpacing:'3px'}}>CONTINUE?</h2>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:'clamp(0.8rem,3.5vw,0.95rem)',marginBottom:'22px'}}>Keep your progress going</p>
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

      {/* Leaderboard Screen */}
      <div id="screen-lb" className="screen hidden" style={{justifyContent:'flex-start',paddingTop:'8vh'}}>
        <h2 style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'16px',letterSpacing:'3px'}}>🏆 LEADERBOARD</h2>
        <div className="lb-tabs">
          <button className="lb-tab lb-tab-active" id="btn-lb-personal">Personal</button>
          <button className="lb-tab" id="btn-lb-global">Global</button>
          <button className="lb-tab" id="btn-lb-coins">Coins</button>
        </div>
        <div id="lb-list" style={{width:'min(320px,90vw)',marginBottom:'24px'}}></div>
        <button className="btn btn-back" id="btn-lb-back">← BACK</button>
      </div>

      {/* Shop Screen */}
      <div id="screen-shop" className="screen hidden" style={{justifyContent:'flex-start',paddingTop:'8vh'}}>
        <h2 style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'8px',letterSpacing:'3px'}}>🛒 SHOP</h2>
        <div id="shop-balance" style={{color:'#FFD700',fontSize:'clamp(1rem,4.5vw,1.3rem)',marginBottom:'20px',fontWeight:'bold',display:'flex',alignItems:'center',gap:'6px',justifyContent:'center'}}>
          <img src="/game/coin.png" alt="coin" style={{width:'22px',height:'22px',objectFit:'contain'}} />
          <span id="shop-coin-count">0</span>
        </div>
        <div id="shop-tabs" style={{display:'flex',gap:'0',marginBottom:'16px',width:'min(320px,90vw)'}}>
          <button id="shop-tab-skins" className="shop-tab shop-tab-active">Skins</button>
          <button id="shop-tab-boosters" className="shop-tab">Boosters</button>
          {/* <button id="shop-tab-effects" className="shop-tab">Effects</button> */}
        </div>
        <div id="shop-items" style={{width:'min(320px,90vw)',marginBottom:'24px'}}></div>
        <button className="btn btn-back" id="btn-shop-back">← BACK</button>
      </div>

      {/* Quests Screen */}
      <div id="screen-quests" className="screen hidden" style={{justifyContent:'flex-start',paddingTop:'8vh'}}>
        <h2 style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'16px',letterSpacing:'3px'}}>🎯 QUESTS</h2>
        <div id="quest-list" style={{width:'min(340px,90vw)',marginBottom:'16px'}}></div>
        <button className="btn btn-back" id="btn-quests-back">← BACK</button>
      </div>

      {/* Check-in Screen */}
      <div id="screen-ci" className="screen hidden" style={{justifyContent:'flex-start',paddingTop:'8vh'}}>
        <div className="ci-header">
          <h2 className="screen-title">📅 DAILY CHECK-IN</h2>
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
    </>
  );
}
