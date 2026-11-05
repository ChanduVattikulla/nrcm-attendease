/**
 * NRCM Attendance AI Advisor — NOVA
 * ---------------------------------
 * Clean, compact, native dashboard styling.
 * Features:
 * - Pure 3D transparent floating avatar (no box/background)
 * - Clean header: "NOVA" + Zoom button + 3-dot (⋮) menu + Close
 * - 3-dot dropdown: Clear conversation, Hide NOVA
 * - High-density text formatting (tight padding, no wasted space)
 * - Native dark/light colors matching the dashboard (no purple gradients)
 * - Expand / Zoom mode (Normal vs Wide)
 * - Undo toast & restore pill if hidden
 */
(function () {
  'use strict';

  // ── CONFIG ──
  const API = window.API || (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
      ? 'http://127.0.0.1:8000'
      : 'https://nrcm-attendance-api.onrender.com'
  );
  const MAX_HISTORY = 16;
  const DISMISS_KEY = 'nova_dismissed_until';
  const STORAGE_KEY = 'nova_chat_history';

  // ── STORAGE HELPERS ──
  function loadStoredHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse nova history', e);
    }
    return [];
  }

  function saveHistory(history) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save nova history', e);
    }
  }

  // ── STATE ──
  let chatHistory = [];
  let isOpen = false;
  let isTyping = false;
  let isExpanded = false;
  let menuOpen = false;
  let pressTimer = null;
  let editingIndex = null;
  let adminHolidays = [];

  async function fetchHolidays() {
    try {
      const res = await fetch(`${API}/holidays`);
      if (res.ok) {
        adminHolidays = await res.json();
      }
    } catch (_) {}
  }
  fetchHolidays();

  // ── INJECT CSS ──
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');

    /* ── Floating Avatar (Zero-box, pure character) ── */
    .cb-fab {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 62px;
      height: 62px;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 8px 16px rgba(0,0,0,0.38));
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s, opacity 0.25s;
      animation: novaFloat 3.8s ease-in-out infinite;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    @keyframes novaFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    .cb-fab:hover {
      animation-play-state: paused;
      transform: scale(1.12) translateY(-3px);
      filter: drop-shadow(0 12px 22px rgba(0,0,0,0.5));
    }
    .cb-fab:active { transform: scale(0.95); }
    .cb-fab.open { transform: scale(0.9); animation: none; }
    .cb-fab.hidden { opacity: 0; pointer-events: none; transform: scale(0.5); }
    .cb-fab img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      pointer-events: none;
    }

    /* ── Undo Toast ── */
    .cb-undo-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--surface, #14141e);
      border: 1px solid var(--border, #2a2a3c);
      border-radius: 20px;
      padding: 8px 14px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.4);
      z-index: 10002;
      display: none;
      align-items: center;
      gap: 10px;
      font-size: 0.78rem;
      color: var(--text, #f0f0f5);
      animation: cbSlideUp 0.25s ease;
    }
    .cb-undo-toast.show { display: flex; }
    .cb-undo-btn {
      background: var(--accent, #6c63ff);
      color: #fff;
      border: none;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
    }

    /* ── Corner Restore Pill ── */
    .cb-restore-pill {
      position: fixed;
      bottom: 12px;
      right: 12px;
      background: var(--surface, #14141e);
      border: 1px solid var(--border, #2a2a3c);
      color: var(--subtext, #8888aa);
      border-radius: 16px;
      padding: 3px 9px;
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      z-index: 9999;
      display: none;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
    }
    .cb-restore-pill:hover {
      border-color: var(--accent, #6c63ff);
      color: var(--text, #f0f0f5);
    }
    .cb-restore-pill.show { display: flex; }

    /* ── Chat Modal Window ── */
    .cb-panel {
      position: fixed;
      bottom: 85px;
      right: 24px;
      width: 490px;
      height: 760px;
      max-height: calc(100vh - 105px);
      max-height: calc(100dvh - 105px);
      background: var(--surface, #12121a);
      border: 1px solid var(--border, #242434);
      border-radius: 18px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.55);
      z-index: 10001;
      display: none;
      flex-direction: column;
      overflow: hidden;
      animation: cbSlideUp 0.22s cubic-bezier(0.16,1,0.3,1);
      transition: width 0.25s ease, height 0.25s ease;
    }
    .cb-panel.show { display: flex; }
    
    /* Expanded Mode */
    .cb-panel.expanded {
      width: 820px;
      height: 88vh;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 65px);
      max-height: calc(100dvh - 65px);
    }

    /* Large & Tall Screens: increase chat window size vertically */
    @media (min-height: 860px) {
      .cb-panel {
        height: 820px;
      }
    }
    @media (min-height: 980px) {
      .cb-panel {
        height: 880px;
      }
    }

    @keyframes cbSlideUp {
      from { opacity: 0; transform: translateY(14px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Header ── */
    .cb-header {
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border, #242434);
      background: var(--surface-light, #171722);
      flex-shrink: 0;
      user-select: none;
      position: relative;
    }
    .cb-header-avatar {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .cb-header-avatar img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .cb-header-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      line-height: 1.15;
    }
    .cb-header-title {
      font-family: 'Fredoka', cursive, -apple-system, sans-serif;
      font-size: 1.02rem;
      font-weight: 600;
      color: var(--text, #ffffff);
      line-height: 1.2;
    }
    .cb-header-sub {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      font-size: 0.65rem;
      font-weight: 500;
      color: var(--subtext, #94a3b8);
      line-height: 1.2;
      letter-spacing: 0.01em;
    }
    .cb-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .cb-tool-btn {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--subtext, #8888aa);
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .cb-tool-btn:hover {
      background: var(--surface, #12121a);
      color: var(--text, #f0f0f5);
      border-color: var(--border, #242434);
    }

    
    /* ── BUG REPORT MODAL ── */
    .cb-report-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 999999;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
    }
    .cb-report-modal.show { display: flex; }
    .cb-report-dialog {
      background: var(--surface, #14141e);
      border: 1px solid var(--border, #2a2a3c);
      border-radius: 14px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: cbFadeIn 0.2s ease;
    }
    .cb-report-header {
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border, #242434);
    }
    .cb-report-close {
      background: none;
      border: none;
      color: var(--subtext, #94a3b8);
      font-size: 1.3rem;
      cursor: pointer;
      line-height: 1;
    }
    .cb-report-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 75vh;
      overflow-y: auto;
    }
    .cb-report-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--subtext, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cb-report-input {
      width: 100%;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--border, #242434);
      background: var(--surface-light, #1c1c28);
      color: var(--text, #f0f0f5);
      font-size: 0.85rem;
      box-sizing: border-box;
      outline: none;
      font-family: inherit;
    }
    .cb-report-input:focus { border-color: #6366f1; }
    .cb-report-dropzone {
      border: 1.5px dashed var(--border, #2a2a3c);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      cursor: pointer;
      background: rgba(255,255,255,0.02);
      transition: border-color 0.15s, background 0.15s;
    }
    .cb-report-dropzone:hover {
      border-color: #6366f1;
      background: rgba(99,102,241,0.05);
    }
    .cb-report-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border, #242434);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      background: var(--surface-light, #171722);
    }
    .cb-btn-cancel {
      background: transparent;
      border: 1px solid var(--border, #242434);
      color: var(--subtext, #94a3b8);
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .cb-btn-submit {
      background: #6366f1;
      border: none;
      color: #fff;
      padding: 7px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
    }

    /* ── 3-Dot Dropdown Menu ── */
    .cb-menu-dropdown {
      position: absolute;
      top: 44px;
      right: 10px;
      background: var(--surface, #14141e);
      border: 1px solid var(--border, #2a2a3c);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      padding: 4px;
      display: none;
      flex-direction: column;
      z-index: 10005;
      min-width: 150px;
    }
    .cb-menu-dropdown.show { display: flex; }
    .cb-menu-item {
      padding: 7px 10px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--text, #f0f0f5);
      font-size: 0.75rem;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.15s;
    }
    .cb-menu-item:hover {
      background: var(--surface-light, #1e1e2c);
    }

    /* ── Messages Container ── */
    .cb-messages {
      flex: 1 1 auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
    }
    .cb-messages::-webkit-scrollbar { width: 4px; }
    .cb-messages::-webkit-scrollbar-thumb {
      background: var(--border, #242434);
      border-radius: 4px;
    }

    /* ── High-Density Message Bubbles ── */
    .cb-msg {
      max-width: 92%;
      padding: 8px 11px;
      border-radius: 12px;
      font-size: 0.8rem;
      line-height: 1.45;
      color: var(--text, #f0f0f5);
      word-wrap: break-word;
    }
    .cb-msg.bot {
      align-self: flex-start;
      background: var(--surface-light, #161622);
      border: 1px solid var(--border, #242434);
      border-bottom-left-radius: 3px;
    }
    .cb-msg.user {
      align-self: flex-end;
      background: var(--accent, #6c63ff);
      color: #ffffff;
      border-bottom-right-radius: 3px;
      cursor: pointer;
      position: relative;
      transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
      user-select: text;
      -webkit-user-select: text;
    }
    .cb-msg.user:hover {
      filter: brightness(1.08);
    }
    .cb-msg.user.is-editing {
      box-shadow: 0 0 0 2px #ffffff;
      filter: brightness(1.15);
    }
    .cb-msg-edited {
      font-size: 0.62rem;
      opacity: 0.75;
      margin-left: 6px;
      font-style: italic;
    }
    .cb-edit-hint {
      position: absolute;
      top: -7px;
      left: -7px;
      width: 17px;
      height: 17px;
      border-radius: 50%;
      background: var(--surface, #14141e);
      border: 1px solid var(--border, #2a2a3c);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      opacity: 0;
      transition: opacity 0.15s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      cursor: pointer;
    }
    .cb-msg.user:hover .cb-edit-hint {
      opacity: 1;
    }

    /* ── Edit Message Bar ── */
    .cb-edit-bar {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--surface, #14141e);
      border-top: 1px solid var(--border, #242434);
      font-size: 0.72rem;
      color: var(--text, #f0f0f5);
      animation: cbSlideUp 0.15s ease;
      flex-shrink: 0;
    }
    .cb-edit-bar.show { display: flex; }
    .cb-edit-bar-info {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      flex: 1;
    }
    .cb-edit-icon { font-size: 0.78rem; }
    .cb-edit-title {
      font-weight: 600;
      color: var(--accent, #6c63ff);
    }
    .cb-edit-preview {
      color: var(--subtext, #8888aa);
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 170px;
    }
    .cb-edit-cancel {
      background: transparent;
      border: none;
      color: var(--subtext, #8888aa);
      font-size: 13px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .cb-edit-cancel:hover {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.12);
    }

    /* ── Mini Feedback Toast ── */
    .cb-mini-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--surface, #14141e);
      border: 1px solid var(--border, #2a2a3c);
      color: var(--text, #f0f0f5);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.74rem;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 10003;
      opacity: 0;
      pointer-events: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .cb-mini-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* ── Markdown Formatting inside Bubbles ── */
    .cb-msg.bot strong {
      color: var(--text, #ffffff);
      font-weight: 700;
    }
    .cb-msg.bot h4 {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text, #ffffff);
      margin: 6px 0 3px;
    }
    .cb-msg.bot ul {
      margin: 4px 0 4px 14px;
      padding: 0;
    }
    .cb-msg.bot li {
      margin-bottom: 2px;
    }
    .cb-msg.bot code {
      background: rgba(255,255,255,0.08);
      color: var(--text, #f0f0f5);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.74rem;
      font-family: monospace;
    }
    .cb-plan-card {
      background: var(--surface, #12121a);
      border-left: 3px solid var(--accent, #6c63ff);
      border-radius: 6px;
      padding: 6px 10px;
      margin: 6px 0;
      font-size: 0.77rem;
    }
    .cb-plan-card.safe { border-left-color: #22c55e; }
    .cb-plan-card.risk { border-left-color: #f8961e; }
    .cb-plan-card.danger { border-left-color: #ef4444; }

    /* ── Table Formatting ── */
    .cb-table-wrap {
      width: 100%;
      overflow-x: auto;
      margin: 6px 0;
      border-radius: 8px;
      border: 1px solid var(--border, #242434);
      background: var(--surface, #12121a);
    }
    .cb-msg table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.73rem;
      line-height: 1.35;
    }
    .cb-msg th {
      background: var(--surface-light, #171722);
      color: var(--text, #ffffff);
      font-weight: 600;
      text-align: left;
      padding: 5px 8px;
      border-bottom: 1px solid var(--border, #242434);
      white-space: nowrap;
    }
    .cb-msg td {
      padding: 5px 8px;
      border-bottom: 1px solid var(--border, #242434);
      color: var(--subtext, #c0c0d0);
      white-space: nowrap;
    }
    .cb-msg tr:last-child td {
      border-bottom: none;
    }
    .cb-msg tr:nth-child(even) td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* ── Single-Box Visual Period Chips (Green = Attend, Red = Skip) ── */
    .cb-period-strip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin: 2px 0;
      vertical-align: middle;
      flex-wrap: wrap;
    }
    .cb-period-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      height: 22px;
      padding: 0 6px;
      border-radius: 5px;
      font-family: 'JetBrains Mono', -apple-system, monospace;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin: 1px 2px;
      vertical-align: middle;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      user-select: none;
    }
    .cb-period-chip.present {
      background: #22c55e;
      color: #ffffff;
      border: 1px solid #16a34a;
    }
    .cb-period-chip.absent {
      background: #ef4444;
      color: #ffffff;
      border: 1px solid #dc2626;
    }
    .cb-p-pill {
      display: inline-block;
      min-width: 20px;
      padding: 1px 5px;
      border-radius: 4px;
      background: #22c55e;
      color: #ffffff;
      font-weight: 800;
      font-size: 0.7rem;
      text-align: center;
      box-shadow: 0 1px 4px rgba(34, 197, 94, 0.35);
    }
    .cb-a-pill {
      display: inline-block;
      min-width: 20px;
      padding: 1px 5px;
      border-radius: 4px;
      background: #ef4444;
      color: #ffffff;
      font-weight: 800;
      font-size: 0.7rem;
      text-align: center;
      box-shadow: 0 1px 4px rgba(239, 68, 68, 0.35);
    }
    .cb-off-pill {
      display: inline-block;
      min-width: 20px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(255,255,255,0.06);
      color: var(--subtext, #8888aa);
      font-weight: 600;
      font-size: 0.7rem;
      text-align: center;
    }

    /* ── Suggestion Chips ── */
    .cb-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      padding: 0 14px 8px;
      flex-shrink: 0;
    }
    .cb-chip {
      padding: 4px 9px;
      border-radius: 14px;
      border: 1px solid var(--border, #242434);
      background: var(--surface-light, #171722);
      color: var(--subtext, #8888aa);
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .cb-chip:hover {
      border-color: var(--accent, #6c63ff);
      color: var(--text, #f0f0f5);
      background: var(--surface, #12121a);
    }

    /* ── Typing Indicator ── */
    .cb-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 9px 12px;
      align-self: flex-start;
      background: var(--surface-light, #161622);
      border-radius: 12px;
      border: 1px solid var(--border, #242434);
      border-bottom-left-radius: 3px;
    }
    .cb-typing-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--subtext, #8888aa);
      animation: cbBounce 1.2s infinite ease-in-out;
    }
    .cb-typing-dot:nth-child(2) { animation-delay: 0.18s; }
    .cb-typing-dot:nth-child(3) { animation-delay: 0.36s; }
    @keyframes cbBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Input Bar ── */
    .cb-input-area {
      padding: 8px 12px;
      border-top: 1px solid var(--border, #242434);
      display: flex;
      gap: 6px;
      align-items: center;
      flex-shrink: 0;
      background: var(--surface-light, #171722);
    }
    .cb-input {
      flex: 1;
      padding: 7px 11px;
      border-radius: 10px;
      border: 1px solid var(--border, #242434);
      background: var(--surface, #12121a);
      color: var(--text, #f0f0f5);
      font-size: 16px; /* 16px prevents iOS Safari auto-zoom on input focus */
      outline: none;
      transition: border-color 0.15s;
    }
    .cb-input::placeholder { color: var(--subtext, #666688); }
    .cb-input:focus { border-color: var(--accent, #6c63ff); }
    .cb-send {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: var(--accent, #6c63ff);
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s;
      flex-shrink: 0;
    }
    .cb-send:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Mobile: Pure Fullscreen ── */
    @media (max-width: 600px) {
      .cb-panel {
        position: fixed !important;
        top: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100vw !important;
        width: 100% !important;
        height: 100vh !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        max-width: 100vw !important;
        border-radius: 0 !important;
        border: none !important;
        box-shadow: none !important;
        z-index: 10002 !important;
      }
      .cb-panel.show ~ .cb-fab,
      .cb-fab.open {
        display: none !important;
      }
      .cb-fab { bottom: 14px; right: 14px; width: 54px; height: 54px; }
      .cb-expand-btn { display: none !important; }
      .cb-header {
        padding: 12px 14px;
        border-radius: 0 !important;
      }
      .cb-tool-btn {
        width: 32px !important;
        height: 32px !important;
        font-size: 15px !important;
      }
      .cb-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
    }
  `;
  document.head.appendChild(style);

  // ── BUILD DOM ──
  function buildUI() {
    const isDismissed = localStorage.getItem(DISMISS_KEY) === 'true';

    // 1. Floating Avatar Button
    const fab = document.createElement('button');
    fab.className = `cb-fab ${isDismissed ? 'hidden' : ''}`;
    fab.id = 'cbFab';
    fab.title = 'Nova';
    fab.innerHTML = '<img src="nova.png" alt="Nova" onerror="this.parentElement.innerHTML=\'✦\'" />';

    fab.onclick = (e) => {
      e.stopPropagation();
      if (fab.dataset.longPressed === 'true') {
        fab.dataset.longPressed = 'false';
        return;
      }
      toggleChat();
    };

    // Right-click: hide option directly
    fab.oncontextmenu = (e) => {
      e.preventDefault();
      if (confirm('Hide Nova from screen?')) {
        window._cbHideNova();
      }
    };

    // Mobile long press
    fab.addEventListener('pointerdown', () => {
      fab.dataset.longPressed = 'false';
      pressTimer = setTimeout(() => {
        fab.dataset.longPressed = 'true';
        if (confirm('Hide Nova from screen?')) {
          window._cbHideNova();
        }
      }, 700);
    });
    fab.addEventListener('pointerup', () => clearTimeout(pressTimer));
    fab.addEventListener('pointerleave', () => clearTimeout(pressTimer));
    fab.addEventListener('pointercancel', () => clearTimeout(pressTimer));

    document.body.appendChild(fab);

    // 2. Undo Toast
    const undoToast = document.createElement('div');
    undoToast.className = 'cb-undo-toast';
    undoToast.id = 'cbUndoToast';
    undoToast.innerHTML = `
      <span>Nova hidden</span>
      <button class="cb-undo-btn" onclick="window._cbRestoreNova()">Undo</button>
    `;
    document.body.appendChild(undoToast);

    // 3. Restore Pill
    const restorePill = document.createElement('div');
    restorePill.className = `cb-restore-pill ${isDismissed ? 'show' : ''}`;
    restorePill.id = 'cbRestorePill';
    restorePill.innerHTML = '✦ Nova';
    restorePill.onclick = () => window._cbRestoreNova();
    document.body.appendChild(restorePill);

    // 4. Chat Modal Window
    const panel = document.createElement('div');
    panel.className = 'cb-panel';
    panel.id = 'cbPanel';
    panel.innerHTML = `
      <div class="cb-header">
        <div class="cb-header-avatar">
          <img src="nova.png" alt="Nova" onerror="this.parentElement.innerHTML=\'✦\'" />
        </div>
        <div class="cb-header-text">
          <div class="cb-header-title">Nova</div>
          <div class="cb-header-sub">Smart Attendance Strategist</div>
        </div>
        <div class="cb-header-actions">
          <button class="cb-tool-btn cb-expand-btn" id="cbZoomBtn" onclick="window._cbToggleZoom()" title="Expand window">⛶</button>
          <button class="cb-tool-btn" id="cbMenuBtn" onclick="window._cbToggleMenu(event)" title="Options">⋮</button>
          <button class="cb-tool-btn" onclick="window._cbToggle()" title="Close">✕</button>
        </div>
        <!-- 3-Dot Dropdown -->
        <div class="cb-menu-dropdown" id="cbMenuDropdown">
          <button class="cb-menu-item" onclick="window._cbClearHistory()">🗑️ Clear chat</button>
          <button class="cb-menu-item" onclick="window._cbOpenReportModal()">🐛 Report Bug / Feedback</button>
          <button class="cb-menu-item" onclick="window._cbHideNovaFromMenu()">👁️ Hide Nova</button>
        </div>
      </div>
      <div class="cb-messages" id="cbMessages"></div>
      <div class="cb-suggestions" id="cbSuggestions">
        <span class="cb-chip" onclick="window._cbSend('How many days can I skip this month?')">Days I can skip?</span>
        <span class="cb-chip" onclick="window._cbSend('Give me a smart plan to maintain 75%')">Maintain 75%</span>
        <span class="cb-chip" onclick="window._cbSend('What is my current attendance summary?')">My status</span>
        <span class="cb-chip" onclick="window._cbSend('Best days to take leave this month?')">Best leave days</span>
      </div>
      <!-- Edit Message Banner -->
      <div class="cb-edit-bar" id="cbEditBar">
        <div class="cb-edit-bar-info">
          <span class="cb-edit-icon">✏️</span>
          <span class="cb-edit-title">Editing:</span>
          <span class="cb-edit-preview" id="cbEditPreview"></span>
        </div>
        <button class="cb-edit-cancel" onclick="window._cbCancelEdit()" title="Cancel edit (Esc)">✕</button>
      </div>
      <div class="cb-input-area">
        <input class="cb-input" id="cbInput" placeholder="Ask Nova about your attendance..." autocomplete="off" />
        <button class="cb-send" id="cbSendBtn" onclick="window._cbSendInput()">➤</button>
      </div>
    `;
    // Stop clicks inside chat panel from bubbling up to document (prevents accidental closing)
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuOpen) {
        const menu = document.getElementById('cbMenuDropdown');
        const btn = document.getElementById('cbMenuBtn');
        if (menu && !menu.contains(e.target) && btn !== e.target && !btn.contains(e.target)) {
          window._cbToggleMenu();
        }
      }
    });

    document.body.appendChild(panel);

    // Bug Report & Feedback Modal
    const reportModal = document.createElement('div');
    reportModal.id = 'cbReportModal';
    reportModal.className = 'cb-report-modal';
    reportModal.innerHTML = `
      <div class="cb-report-dialog" onclick="event.stopPropagation()">
        <div class="cb-report-header">
          <div style="font-weight:700;font-size:0.95rem;color:var(--text, #f0f0f5);display:flex;align-items:center;gap:6px;">
            <span>🐛</span> Report Bug / Feedback
          </div>
          <button type="button" class="cb-report-close" onclick="window._cbCloseReportModal()">&times;</button>
        </div>
        <div class="cb-report-body">
          <label class="cb-report-label">Category</label>
          <select id="cbReportCategory" class="cb-report-input">
            <option value="Calculation / Schedule Bug">Calculation / Schedule Bug</option>
            <option value="Attendance Sync Issue">Attendance Sync Issue</option>
            <option value="Feature Request">Feature Request</option>
            <option value="Other">Other</option>
          </select>

          <label class="cb-report-label">Description / Details *</label>
          <textarea id="cbReportMsg" class="cb-report-input" rows="3" placeholder="Explain what happened or what looks incorrect..."></textarea>

          <label class="cb-report-label">Screenshot (File upload or paste Ctrl+V)</label>
          <div id="cbReportDropzone" class="cb-report-dropzone">
            <input type="file" id="cbReportFile" accept="image/*" style="display:none;" />
            <div id="cbReportDropText" style="font-size:0.75rem;color:var(--subtext, #94a3b8);">
              📷 Click or Drag Image here, or press <b>Ctrl+V</b> to paste
            </div>
            <div id="cbReportPreviewBox" style="display:none;margin-top:6px;position:relative;">
              <img id="cbReportPreview" style="max-width:100%;max-height:140px;border-radius:6px;border:1px solid var(--border, #242434);" />
              <button type="button" onclick="window._cbClearScreenshot()" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;">&times;</button>
            </div>
          </div>
          <div id="cbReportStatus" style="font-size:0.75rem;margin-top:8px;display:none;"></div>
        </div>
        <div class="cb-report-footer">
          <button type="button" class="cb-btn-cancel" onclick="window._cbCloseReportModal()">Cancel</button>
          <button type="button" id="cbReportSubmitBtn" class="cb-btn-submit" onclick="window._cbSubmitReport()">Send to Admin</button>
        </div>
      </div>
    `;
    document.body.appendChild(reportModal);


    // Populate conversation from sessionStorage or default welcome
    chatHistory = loadStoredHistory();
    renderMessages();
  }

  // ── MENU & DISMISS LOGIC ──
  window._cbToggleMenu = function (e) {
    if (e) e.stopPropagation();
    menuOpen = !menuOpen;
    const menu = document.getElementById('cbMenuDropdown');
    if (menu) menu.classList.toggle('show', menuOpen);
  };

  window._cbHideNovaFromMenu = function () {
    window._cbToggleMenu();
    window._cbHideNova();
  };

  window._cbHideNova = function () {
    const fab = document.getElementById('cbFab');
    const panel = document.getElementById('cbPanel');
    const undoToast = document.getElementById('cbUndoToast');
    const restorePill = document.getElementById('cbRestorePill');

    if (panel) panel.classList.remove('show');
    if (fab) fab.classList.add('hidden');
    isOpen = false;

    localStorage.setItem(DISMISS_KEY, 'true');

    if (undoToast) {
      undoToast.classList.add('show');
      setTimeout(() => {
        undoToast.classList.remove('show');
        if (restorePill) restorePill.classList.add('show');
      }, 6000);
    }
  };

  window._cbRestoreNova = function () {
    const fab = document.getElementById('cbFab');
    const undoToast = document.getElementById('cbUndoToast');
    const restorePill = document.getElementById('cbRestorePill');

    localStorage.removeItem(DISMISS_KEY);
    if (undoToast) undoToast.classList.remove('show');
    if (restorePill) restorePill.classList.remove('show');
    if (fab) {
      fab.classList.remove('hidden');
      fab.classList.remove('open');
    }
  };

  // ── TOGGLE & ZOOM ──
  function toggleChat() {
    isOpen = !isOpen;
    const panel = document.getElementById('cbPanel');
    const fab = document.getElementById('cbFab');
    if (panel) panel.classList.toggle('show', isOpen);
    if (fab) fab.classList.toggle('open', isOpen);
    if (isOpen) {
      const input = document.getElementById('cbInput');
      if (input) setTimeout(() => input.focus(), 200);
    }
  }
  window._cbToggle = toggleChat;

  window._cbToggleZoom = function () {
    isExpanded = !isExpanded;
    const panel = document.getElementById('cbPanel');
    const btn = document.getElementById('cbZoomBtn');
    if (panel) panel.classList.toggle('expanded', isExpanded);
    if (btn) btn.textContent = isExpanded ? '↙' : '⛶';
  };

  window._cbClearHistory = function () {
    if (menuOpen) window._cbToggleMenu();
    if (!confirm('Clear conversation?')) return;
    window._cbCancelEdit();
    chatHistory = [];
    sessionStorage.removeItem(STORAGE_KEY);
    renderMessages();
  };

  // ── EDIT & RESEND HELPERS ──
  window._cbStartEdit = function (historyIdx) {
    if (historyIdx == null || !chatHistory[historyIdx]) return;
    editingIndex = historyIdx;

    document.querySelectorAll('.cb-msg.user').forEach(el => {
      el.classList.toggle('is-editing', parseInt(el.dataset.historyIdx, 10) === historyIdx);
    });

    const editBar = document.getElementById('cbEditBar');
    const editPreview = document.getElementById('cbEditPreview');
    const input = document.getElementById('cbInput');

    if (editBar) editBar.classList.add('show');
    if (editPreview) {
      const orig = chatHistory[historyIdx].content || '';
      editPreview.textContent = orig.length > 28 ? orig.slice(0, 28) + '…' : orig;
    }

    if (input) {
      input.value = chatHistory[historyIdx].content || '';
      input.focus();
      input.select();
    }
  };

  window._cbCancelEdit = function () {
    editingIndex = null;
    document.querySelectorAll('.cb-msg.user').forEach(el => el.classList.remove('is-editing'));
    const editBar = document.getElementById('cbEditBar');
    if (editBar) editBar.classList.remove('show');
    const input = document.getElementById('cbInput');
    if (input && document.activeElement !== input) input.value = '';
  };

  let touchTimer = null;
  let touchMoved = false;

  function attachUserMsgEvents(el, historyIdx) {
    el.title = 'Right-click or long-press to edit & resend';

    // Desktop: Right-click
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window._cbStartEdit(historyIdx);
    };

    // Mobile: Long-press
    el.addEventListener('touchstart', () => {
      touchMoved = false;
      touchTimer = setTimeout(() => {
        if (!touchMoved) {
          if (navigator.vibrate) {
            try { navigator.vibrate(35); } catch (_) {}
          }
          window._cbStartEdit(historyIdx);
        }
      }, 420);
    }, { passive: true });

    el.addEventListener('touchmove', () => {
      touchMoved = true;
      clearTimeout(touchTimer);
    }, { passive: true });

    el.addEventListener('touchend', () => {
      clearTimeout(touchTimer);
    });
    el.addEventListener('touchcancel', () => {
      clearTimeout(touchTimer);
    });
  }

  function attachBotMsgEvents(el, rawText) {
    el.title = 'Right-click to copy text';
    el.oncontextmenu = (e) => {
      if (window.getSelection && window.getSelection().toString().trim()) {
        return;
      }
      e.preventDefault();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(rawText).then(() => {
          showMiniToast('Copied response 📋');
        }).catch(() => {});
      }
    };
  }

  function showMiniToast(text) {
    let toast = document.getElementById('cbMiniToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cbMiniToast';
      toast.className = 'cb-mini-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  function renderMessages() {
    const messages = document.getElementById('cbMessages');
    const suggestions = document.getElementById('cbSuggestions');
    if (!messages) return;
    messages.innerHTML = '';

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach((m, idx) => {
        appendMessage(m.role === 'assistant' ? 'bot' : 'user', m.content, false, idx, m.edited);
      });
      if (suggestions) suggestions.style.display = 'none';
      messages.scrollTop = messages.scrollHeight;
    } else {
      const welcome = document.createElement('div');
      welcome.className = 'cb-msg bot';
      welcome.innerHTML = `
        Hey! I'm <strong>Nova</strong>, your attendance strategist.<br>
        I have your live stats and schedule loaded. Ask me for safe skip dates, recovery plans, or semester advice!
      `;
      messages.appendChild(welcome);
      if (suggestions) suggestions.style.display = 'flex';
    }
  }

  // ── EXTRACT LIVE STATS ──
  function getLiveStats() {
    if (typeof window.getAttendanceSnapshot === 'function') {
      const s = window.getAttendanceSnapshot();
      return { present: s.baselinePresent || 0, total: s.baselineTotal || 0 };
    }
    if (typeof window.baselinePresent !== 'undefined') {
      return { present: window.baselinePresent || 0, total: window.baselineTotal || 0 };
    }
    const pEl = document.getElementById('animPresent') || document.getElementById('heroPresent');
    const tEl = document.getElementById('animTotal') || document.getElementById('heroTotal');
    if (pEl && tEl) {
      return { present: parseInt(pEl.textContent) || 0, total: parseInt(tEl.textContent) || 0 };
    }
    return { present: 0, total: 0 };
  }

  // ── CONTEXT BUILDER ──
  function buildContext() {
    let snap = {};
    try {
      if (typeof window.getAttendanceSnapshot === 'function') {
        snap = window.getAttendanceSnapshot() || {};
      }
    } catch (e) {
      console.warn('Error reading attendance snapshot:', e);
    }
    const stats = getLiveStats();
    const bP = snap.baselinePresent ?? stats.present;
    const bT = snap.baselineTotal ?? stats.total;
    const bPct = bT > 0 ? ((bP / bT) * 100).toFixed(2) : '0.00';
    const today = snap.todayISO || window.todayISO || new Date().toISOString().slice(0, 10);
    const roll = snap.roll || localStorage.getItem('roll') || document.getElementById('rollDisplay')?.textContent?.trim() || 'Student';

    // Mandatory holidays set fallback
    const defaultHolidays = new Set(['01-26','04-14','06-02','08-15','10-02','12-25']);
    const defaultHolidayNames = {
      '01-26': 'Republic Day',
      '04-14': 'Dr. B.R. Ambedkar Jayanti',
      '06-02': 'Telangana State Formation Day',
      '08-15': 'Independence Day',
      '10-02': 'Gandhi Jayanti',
      '12-25': 'Christmas'
    };
    const holidays = (snap && snap.holidays) || (typeof window.MANDATORY_HOLIDAYS !== 'undefined' ? window.MANDATORY_HOLIDAYS : null) || new Set(defaultHolidays);
    const holidayNames = (snap && snap.holidayNames) || (typeof window.HOLIDAY_NAMES !== 'undefined' ? window.HOLIDAY_NAMES : null) || Object.assign({}, defaultHolidayNames);

    // Merge live admin-updated holidays from database
    if (Array.isArray(adminHolidays)) {
      adminHolidays.forEach(h => {
        if (h && h.date) {
          const mmdd = h.date.slice(5);
          holidays.add(mmdd);
          holidays.add(h.date);
          holidayNames[mmdd] = h.reason;
          holidayNames[h.date] = h.reason;
        }
      });
    }

    let planP = 0, planT = 0;
    const pm = snap.planMap || window.planMap || JSON.parse(localStorage.getItem('nrcm_plan_map') || '{}');
    const pp = snap.periodPlan || window.periodPlan || {};
    const ppm = snap.portalPeriodMap || window.portalPeriodMap || {};
    const PERIODS = snap.periods || window.PERIODS || ['P1','P2','P3','P4','P5','P6'];

    Object.entries(pm).forEach(([iso, status]) => {
      if (status === 'present') { planP += 6; planT += 6; }
      else if (status === 'absent') { planT += 6; }
      else if (status === 'partial') {
        const states = pp[iso] || {};
        const portal = ppm[iso] || {};
        PERIODS.forEach(p => {
          const isPosted = portal[p] === 'P' || portal[p] === 'A';
          if (isPosted) return;
          const s = states[p];
          if (s === 'present') { planP++; planT++; }
          else if (s === 'absent') { planT++; }
        });
      }
    });

    const projP = bP + planP;
    const projT = bT + planT;
    const projPct = projT > 0 ? ((projP / projT) * 100).toFixed(2) : '0.00';

    // Evaluate Today's live status
    const tp = ppm[today] || {};
    const postedTodayCount = Object.values(tp).filter(v => v === 'P' || v === 'A').length;
    const todayAllPosted = postedTodayCount >= 6;
    const todayDow = new Date(today).getDay();
    const todayIsSun = todayDow === 0;
    const todayMmdd = today.slice(5);
    const todayIsHol = holidays.has ? (holidays.has(todayMmdd) || holidays.has(today)) : false;
    const todayHolReason = holidayNames[today] || holidayNames[todayMmdd] || 'Official Holiday';

    let todayStatusDescription = '';
    if (todayIsSun) {
      todayStatusDescription = "Today is Sunday (Weekly Off — no classes).";
    } else if (todayIsHol) {
      todayStatusDescription = `Today is an OFFICIAL HOLIDAY: ${todayHolReason} (no classes).`;
    } else if (todayAllPosted) {
      todayStatusDescription = `Today is a completed working day (all 6 periods posted on portal: ${PERIODS.map(p => `${p}:${tp[p]||'-'}`).join(' ')}). Today is already included in baseline numbers; attendance planning starts from tomorrow.`;
    } else if (postedTodayCount > 0) {
      const remainingToday = PERIODS.filter(p => tp[p] !== 'P' && tp[p] !== 'A');
      todayStatusDescription = `Today is IN PROGRESS: ${postedTodayCount}/6 periods posted so far (${PERIODS.map(p => `${p}:${tp[p]||'-'}`).join(' ')}). Remaining unposted periods for today: ${remainingToday.join(', ')}.`;
    } else {
      todayStatusDescription = "Today is a fresh WORKING DAY (0/6 periods posted yet — college hasn't started or attendance not uploaded yet). Today IS plannable for all 6 periods!";
    }

    // Upcoming schedule (Monday through Saturday = working days; Sunday = Off)
    // If today is NOT fully posted, NOT Sunday, and NOT a holiday, planning starts from TODAY!
    const upcoming = [];
    const d = new Date(today);
    if (todayAllPosted || todayIsSun || todayIsHol) {
      d.setDate(d.getDate() + 1);
    }
    const end = new Date(today);
    end.setDate(end.getDate() + 21); // 3 weeks of schedule is optimal and fast
    while (d <= end) {
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const mmdd = iso.slice(5);
      const dayOfWeek = d.getDay();
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek];
      const isSun = dayOfWeek === 0;
      const isHol = holidays.has ? (holidays.has(mmdd) || holidays.has(iso)) : false;
      const holReason = holidayNames[iso] || holidayNames[mmdd] || 'College Holiday';
      const planned = pm[iso] || null;

      const isTodayIso = (iso === today);
      const tagPrefix = isTodayIso ? '[TODAY] ' : '';

      if (isHol && isSun) {
        upcoming.push(`${iso} (${dayName}) — ${tagPrefix}OFFICIAL HOLIDAY & SUNDAY: ${holReason}`);
      } else if (isHol) {
        upcoming.push(`${iso} (${dayName}) — ${tagPrefix}OFFICIAL HOLIDAY: ${holReason}`);
      } else if (isSun) {
        upcoming.push(`${iso} (${dayName}) — ${tagPrefix}SUNDAY (Weekly Off)`);
      } else {
        // Working Day (Monday through Saturday)
        let note = '';
        if (isTodayIso && postedTodayCount > 0) {
          note = ` (Partial: ${postedTodayCount}/6 periods posted)`;
        }
        upcoming.push(`${iso} (${dayName}) — ${tagPrefix}WORKING DAY (6 periods)${note}${planned ? ' [Planned: ' + planned + ']' : ''}`);
      }
      d.setDate(d.getDate() + 1);
    }

    // Recent past days attendance (from datewise or portalPeriodMap)
    let pastDaysList = [];
    if (snap.recentDays && snap.recentDays.length > 0) {
      pastDaysList = snap.recentDays.slice(0, 8).map(r => {
        const pStr = PERIODS.map(p => `${p}:${(r.periods && r.periods[p]) || '-'}`).join(' ');
        return `• ${r.date}: ${pStr}`;
      });
    } else if (Object.keys(ppm).length > 0) {
      const sortedKeys = Object.keys(ppm).sort().reverse().slice(0, 8);
      pastDaysList = sortedKeys.map(iso => {
        const pObj = ppm[iso] || {};
        const pStr = PERIODS.map(p => `${p}:${pObj[p] || '-'}`).join(' ');
        return `• ${iso}: ${pStr}`;
      });
    }

    // Monthly summary list
    let monthlyList = [];
    if (snap.monthlySummary && snap.monthlySummary.length > 0) {
      monthlyList = snap.monthlySummary.map(m => `• ${m.month}: ${m.classes_attended}/${m.total_classes} (${m.percentage})`);
    }

    let safeAbsences = 0;
    let simP = projP, simT = projT;
    while (simT > 0 && (simP / (simT + 6)) * 100 >= 75) {
      simT += 6;
      safeAbsences++;
    }

    let daysToTarget = 0;
    if (projT > 0 && (projP / projT) * 100 < 75) {
      let tP = projP, tT = projT;
      while (tT > 0 && (tP / tT) * 100 < 75 && daysToTarget < 500) {
        tP += 6; tT += 6;
        daysToTarget++;
      }
    }

    // Dynamic attendance calculation formula for AI
    // No hardcoded examples — the formula is always correct for any student
    const fullDaysNeeded = Math.max(0, Math.ceil((0.75 * bT - bP) / (6 - 0.75 * 6)));
    const minPeriodsPerDayToNotDrop = Math.ceil(0.75 * 6); // = 5 (5/6 = 83.3% > 75%)
    // Min periods to stay SAFE per day if already at 75%:
    // We need: (P + k) / (T + 6) >= 0.75  =>  k >= 0.75*(T+6) - P
    // This changes every day as T and P grow. Nova must calculate this per-day from the formula.

    return `=== ATTENDANCE FORMULA (USE THIS TO CALCULATE, DO NOT HARDCODE EXAMPLES) ===
Formula: New % = (Current Present + k) / (Current Total + 6) * 100, where k = periods attended that day (0-6).
Minimum periods needed that day to NOT drop below 75%:
  min_k = ceiling(0.75 * (Current Total + 6) - Current Present)
  If min_k <= 0 → student can even skip the full day safely.
  If min_k >= 6 → student must attend all 6 periods.
IMPORTANT: Recalculate Current Present and Current Total AFTER every day before calculating the next.
Skipping morning half = attending 3/6 = adding +3 present +6 total. This DECREASES percentage any time current % < (3/6*100 = 50%). Only safe if student already has a large buffer above 75%.
Full-day attendance needed to reach 75%: ${fullDaysNeeded} consecutive full day${fullDaysNeeded === 1 ? '' : 's'} from baseline.

=== STUDENT PROFILE & LIVE DATA ===
Student Roll Number: ${roll}
Today's Date: ${today}
TODAY'S EXACT ATTENDANCE STATUS: ${todayStatusDescription} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(today).getDay()]})
Semester Attendance: ${bP} attended / ${bT} total classes = ${bPct}%
Planned adjustments: +${planP} present periods, +${planT - planP} absent periods
Projected Attendance: ${projP} attended / ${projT} total classes = ${projPct}%
Target Cutoff: 75%
Safe Full-Day Absences Remaining: ${safeAbsences} days
${daysToTarget > 0 ? `Consecutive Full-Day Attendance Needed to Reach 75%: ${daysToTarget} working days` : 'Student is currently at or above 75%'}

=== MONTHLY ATTENDANCE BREAKDOWN ===
${monthlyList.length > 0 ? monthlyList.join('\n') : 'No monthly breakdown available'}

=== RECENT PAST DAILY ATTENDANCE (PORTAL LOGS) ===
${pastDaysList.length > 0 ? pastDaysList.join('\n') : 'No recent period logs'}

=== CRITICAL COLLEGE SCHEDULE RULES (NRCM) ===
1. COLLEGE WORKING DAYS: Monday, Tuesday, Wednesday, Thursday, Friday, and SATURDAY!
2. SATURDAY IS A FULL WORKING DAY (6 periods). It is NEVER a weekend and NEVER a holiday.
3. WEEKLY OFF: Only SUNDAY is weekly off.
4. OFFICIAL HOLIDAYS: Only days explicitly marked with "OFFICIAL HOLIDAY" below are closed.

=== UPCOMING DAYS SCHEDULE ===
${upcoming.slice(0, 45).join('\n')}
${upcoming.length > 45 ? `... and ${upcoming.length - 45} more working days` : ''}`.trim();
  }

  // ── SEND MESSAGE ──
  window._cbSend = async function (text) {
    if (!text || isTyping) return;
    const input = document.getElementById('cbInput');
    if (input) input.value = '';

    const suggestions = document.getElementById('cbSuggestions');
    if (suggestions) suggestions.style.display = 'none';

    if (editingIndex !== null && chatHistory[editingIndex]) {
      const idx = editingIndex;
      window._cbCancelEdit();

      // Update message at this position and mark edited
      chatHistory[idx].content = text;
      chatHistory[idx].edited = true;
      // Truncate any later turns to rewind conversation to this point
      chatHistory = chatHistory.slice(0, idx + 1);
      saveHistory(chatHistory);
      renderMessages();

      await callBackend();
      return;
    }

    chatHistory.push({ role: 'user', content: text });
    if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
    saveHistory(chatHistory);
    appendMessage('user', text, true, chatHistory.length - 1);

    await callBackend();
  };

  window._cbSendInput = function () {
    const input = document.getElementById('cbInput');
    if (input && input.value.trim()) {
      window._cbSend(input.value.trim());
    }
  };

  function appendMessage(type, text, shouldScroll = true, historyIdx = null, isEdited = false) {
    const messages = document.getElementById('cbMessages');
    if (!messages) return;
    const div = document.createElement('div');
    if (type === 'error') {
      div.className = 'cb-msg bot';
      div.style.borderColor = '#ef4444';
      div.style.background = 'rgba(239,68,68,0.1)';
      div.innerHTML = `<span style="color:#ef4444">⚠️ ${escapeHTML(text)}</span>`;
    } else if (type === 'user') {
      const resolvedIdx = historyIdx !== null ? historyIdx : (chatHistory.length - 1);
      div.className = 'cb-msg user';
      div.dataset.historyIdx = resolvedIdx;
      div.textContent = text;
      if (isEdited) {
        const tag = document.createElement('span');
        tag.className = 'cb-msg-edited';
        tag.textContent = '(edited)';
        div.appendChild(tag);
      }
      const hint = document.createElement('span');
      hint.className = 'cb-edit-hint';
      hint.title = 'Edit & resend';
      hint.textContent = '✏️';
      hint.onclick = (e) => {
        e.stopPropagation();
        window._cbStartEdit(resolvedIdx);
      };
      div.appendChild(hint);

      attachUserMsgEvents(div, resolvedIdx);
    } else {
      div.className = 'cb-msg bot';
      div.innerHTML = formatBotText(text);
      attachBotMsgEvents(div, text);
    }
    messages.appendChild(div);
    if (shouldScroll) {
      messages.scrollTop = messages.scrollHeight;
    }
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTableCell(c) {
    const val = c.trim();
    if (val === 'P' || val === 'Present' || val === '✔') {
      return `<span class="cb-p-pill">P</span>`;
    }
    if (val === 'A' || val === 'Absent' || val === '✘') {
      return `<span class="cb-a-pill">A</span>`;
    }
    if (val === '-' || val === 'Off' || val === 'Hol') {
      return `<span class="cb-off-pill">${val}</span>`;
    }
    return val;
  }

  function renderMarkdownTable(tableBlock) {
    const lines = tableBlock.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return tableBlock;

    let html = '<div class="cb-table-wrap"><table>';
    let isHead = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\|?[-:\s|]+\|?$/.test(line)) continue; // Separator row like |---|---|

      let cleanLine = line;
      if (cleanLine.startsWith('|')) cleanLine = cleanLine.slice(1);
      if (cleanLine.endsWith('|')) cleanLine = cleanLine.slice(0, -1);
      const cells = cleanLine.split('|').map(c => c.trim());
      if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;

      if (isHead) {
        html += '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        isHead = false;
      } else {
        html += '<tr>' + cells.map(c => `<td>${formatTableCell(c)}</td>`).join('') + '</tr>';
      }
    }

    html += '</tbody></table></div>';
    return html;
  }

  function formatBotText(text) {
    let raw = escapeHTML(text);

    // Markdown Tables with Colored P/A pills
    raw = raw.replace(/((?:^|\n)\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/g, (match) => {
      return renderMarkdownTable(match);
    });

    // Visual Compact Period Chips (Single box: P1 in green / P1 in red)
    raw = raw.replace(/\[P([1-6]):\s*([PA✔✘])\]/gi, (match, num, status) => {
      const isP = status.toUpperCase() === 'P' || status === '✔';
      const cls = isP ? 'present' : 'absent';
      const action = isP ? 'Attend' : 'Skip';
      return `<span class="cb-period-chip ${cls}" title="P${num}: ${action}">P${num}</span>`;
    });

    // Also support unbracketed P1: P or P1: A
    raw = raw.replace(/\bP([1-6]):\s*([PA])\b/gi, (match, num, status) => {
      const isP = status.toUpperCase() === 'P';
      const cls = isP ? 'present' : 'absent';
      const action = isP ? 'Attend' : 'Skip';
      return `<span class="cb-period-chip ${cls}" title="P${num}: ${action}">P${num}</span>`;
    });

    // Headers
    raw = raw.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    raw = raw.replace(/^## (.*$)/gim, '<h4>$1</h4>');

    // Bold
    raw = raw.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Code
    raw = raw.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Strategy Cards
    raw = raw.replace(/(?:^|\n)(Safe Plan|Option 1|Strategy 1|Balanced Plan|Option 2|Strategy 2|Risky Plan|Option 3|Strategy 3):?/gi, (match) => {
      const cls = match.toLowerCase().includes('safe') ? 'safe' : match.toLowerCase().includes('risk') ? 'danger' : 'risk';
      return `<div class="cb-plan-card ${cls}"><strong>${match}</strong>`;
    });
    raw = raw.replace(/\n\n/g, '</div>\n\n');

    // Bullets
    raw = raw.replace(/^\s*[-•*]\s+(.*$)/gim, '<li>$1</li>');
    raw = raw.replace(/(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/gs, '<ul>$1</ul>');

    // Line breaks
    raw = raw.replace(/\n/g, '<br>');
    raw = raw.replace(/<\/div><br>/g, '</div>');
    raw = raw.replace(/<\/ul><br>/g, '</ul>');
    raw = raw.replace(/<\/table><\/div><br>/g, '</table></div>');

    return raw;
  }

  function showTyping() {
    isTyping = true;
    const messages = document.getElementById('cbMessages');
    if (!messages) return;
    const div = document.createElement('div');
    div.className = 'cb-typing';
    div.id = 'cbTypingIndicator';
    div.innerHTML = '<div class="cb-typing-dot"></div><div class="cb-typing-dot"></div><div class="cb-typing-dot"></div>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    const btn = document.getElementById('cbSendBtn');
    if (btn) btn.disabled = true;
  }

  function hideTyping() {
    isTyping = false;
    const el = document.getElementById('cbTypingIndicator');
    if (el) el.remove();
    const btn = document.getElementById('cbSendBtn');
    if (btn) btn.disabled = false;
  }

  // ── BACKEND CALL ──
  async function callBackend() {
    showTyping();

    try {
      const res = await fetch(`${API}/chatbot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          messages: chatHistory.slice(-6), // Keep prompt compact & prevent rate-limit 413/429
          context: buildContext()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      const reply = data.reply || 'Sorry, I could not generate a plan.';

      chatHistory.push({ role: 'assistant', content: reply });
      if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
      saveHistory(chatHistory);

      hideTyping();
      appendMessage('bot', reply);
    } catch (err) {
      hideTyping();
      console.error('Chatbot error:', err);
      appendMessage('error', err.message || 'Something went wrong. Please try again.');
    }
  }

  
  // ── REPORT BUG / FEEDBACK LOGIC ──
  let _cbScreenshotBase64 = null;

  window._cbOpenReportModal = function () {
    const menu = document.getElementById('cbMenuDropdown');
    if (menu) menu.classList.remove('show');
    const modal = document.getElementById('cbReportModal');
    if (modal) modal.classList.add('show');
  };

  window._cbCloseReportModal = function () {
    const modal = document.getElementById('cbReportModal');
    if (modal) modal.classList.remove('show');
    window._cbClearScreenshot();
  };

  window._cbClearScreenshot = function () {
    _cbScreenshotBase64 = null;
    const prevBox = document.getElementById('cbReportPreviewBox');
    const dropText = document.getElementById('cbReportDropText');
    const fileInp = document.getElementById('cbReportFile');
    if (prevBox) prevBox.style.display = 'none';
    if (dropText) dropText.style.display = 'block';
    if (fileInp) fileInp.value = '';
  };

  function _cbHandleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      _cbScreenshotBase64 = e.target.result;
      const prev = document.getElementById('cbReportPreview');
      const prevBox = document.getElementById('cbReportPreviewBox');
      const dropText = document.getElementById('cbReportDropText');
      if (prev) prev.src = _cbScreenshotBase64;
      if (prevBox) prevBox.style.display = 'block';
      if (dropText) dropText.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  // Setup click & paste handlers for screenshot
  setTimeout(() => {
    const dropzone = document.getElementById('cbReportDropzone');
    const fileInp = document.getElementById('cbReportFile');
    if (dropzone && fileInp) {
      dropzone.addEventListener('click', (e) => {
        if (!e.target.closest('button')) fileInp.click();
      });
      fileInp.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          _cbHandleImageFile(e.target.files[0]);
        }
      });
    }

    // Direct clipboard paste (Ctrl+V) anywhere when modal is active
    window.addEventListener('paste', (e) => {
      const modal = document.getElementById('cbReportModal');
      if (modal && modal.classList.contains('show')) {
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
              const blob = items[i].getAsFile();
              _cbHandleImageFile(blob);
              break;
            }
          }
        }
      }
    });
  }, 500);

  window._cbSubmitReport = async function () {
    const msgEl = document.getElementById('cbReportMsg');
    const catEl = document.getElementById('cbReportCategory');
    const statusEl = document.getElementById('cbReportStatus');
    const submitBtn = document.getElementById('cbReportSubmitBtn');

    const message = (msgEl?.value || '').trim();
    if (!message) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.color = '#ef4444';
        statusEl.textContent = 'Please enter a description.';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }

    let snap = {};
    try {
      if (typeof window.getAttendanceSnapshot === 'function') snap = window.getAttendanceSnapshot() || {};
    } catch (e) {}

    const roll = snap.roll || localStorage.getItem('roll') || 'Student';
    const metadata = `Roll: ${roll} | Page: ${window.location.pathname} | Baseline: ${snap.baselinePresent}/${snap.baselineTotal} (${snap.overallPercentage}) | UA: ${navigator.userAgent.slice(0, 80)}`;

    try {
      const res = await fetch(`${API}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_number: roll,
          category: catEl?.value || 'Bug',
          message: message,
          screenshot_base64: _cbScreenshotBase64,
          metadata: metadata
        })
      });

      const data = await res.json();
      if (res.ok) {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.color = '#22c55e';
          statusEl.textContent = '✅ Report sent to admin successfully!';
        }
        setTimeout(() => {
          window._cbCloseReportModal();
          if (msgEl) msgEl.value = '';
          if (statusEl) statusEl.style.display = 'none';
          appendMessage('bot', '✅ Thank you! Your bug report and screenshot have been delivered directly to the admin.');
        }, 1200);
      } else {
        throw new Error(data.detail || 'Failed to submit report');
      }
    } catch (err) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.color = '#ef4444';
        statusEl.textContent = `Error: ${err.message}`;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send to Admin';
      }
    }
  };

  // ── GLOBAL LISTENERS ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement?.id === 'cbInput') {
      e.preventDefault();
      window._cbSendInput();
    }
    if (e.key === 'Escape') {
      if (editingIndex !== null) {
        window._cbCancelEdit();
      } else if (isOpen) {
        toggleChat();
      }
    }
  });

  // Close dropdown menu OR chat panel when clicking anywhere outside
  document.addEventListener('click', () => {
    if (menuOpen) {
      window._cbToggleMenu();
    }
    if (isOpen) {
      toggleChat();
    }
  });

  // ── INIT ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
