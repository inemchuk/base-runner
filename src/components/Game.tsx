'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { useCheckIn } from '@/hooks/useCheckIn';
import { useLeaderboard } from '@/hooks/useLeaderboard';

export default function Game() {
  useCheckIn();
  useLeaderboard();

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

    // Listen for submit score requests from game.js
    const handleSubmitScore = (e: Event) => {
      const score = (e as CustomEvent).detail?.score;
      const submitFn = (window as any).__BASE_SUBMIT_SCORE;
      if (submitFn && score) submitFn(score);
    };
    window.addEventListener('base-submit-score', handleSubmitScore);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('base-checkin-claim', handleClaim);
      window.removeEventListener('base-submit-score', handleSubmitScore);
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
        <button className="btn btn-start" id="btn-start">▶ PLAY</button>
        <button className="btn btn-lb" id="btn-lb">🏆 Leaderboard</button>
        <button className="btn btn-ci" id="btn-ci">📅 Daily Check-in</button>
      </div>

      {/* Game Over Screen */}
      <div id="screen-gameover" className="screen hidden">
        <h2 style={{color:'#fff',fontSize:'clamp(1.5rem,7vw,2.5rem)',marginBottom:'8px',letterSpacing:'3px'}}>GAME OVER</h2>
        <p style={{color:'#4D8FFF',marginBottom:'6px',fontSize:'clamp(0.9rem,4vw,1.2rem)',letterSpacing:'2px'}}>
          SCORE: <span id="go-score">0</span>
        </p>
        <p style={{color:'rgba(255,255,255,0.5)',marginBottom:'32px',fontSize:'clamp(0.75rem,3vw,1rem)',letterSpacing:'2px'}}>
          BEST: <span id="go-best">0</span>
        </p>
        <button className="btn btn-submit-score" id="btn-submit-score">⛓ Submit Score</button>
        <button className="btn btn-restart" id="btn-restart">↺ PLAY AGAIN</button>
        <button className="btn btn-back" id="btn-go-menu">← MENU</button>
      </div>

      {/* Leaderboard Screen */}
      <div id="screen-lb" className="screen hidden">
        <h2 style={{color:'#fff',fontSize:'clamp(1.2rem,6vw,2rem)',marginBottom:'16px',letterSpacing:'3px'}}>🏆 LEADERBOARD</h2>
        <div className="lb-tabs">
          <button className="lb-tab lb-tab-active" id="btn-lb-personal">Personal</button>
          <button className="lb-tab" id="btn-lb-global">Global</button>
        </div>
        <div id="lb-list" style={{width:'min(320px,90vw)',marginBottom:'24px'}}></div>
        <button className="btn btn-back" id="btn-lb-back">← BACK</button>
      </div>

      {/* Check-in Screen */}
      <div id="screen-ci" className="screen hidden">
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
