'use strict';
/* =========================================================================
   LUDQueen 👑 — script.js
   Vanilla JS · turn-based state machine · tanpa framework eksternal.

     1. KONFIGURASI + sisi Dadu Chaos (peluang bisa diatur pemain)
     2. PATH MAPPING (array koordinat papan 15x15)
     3. KARAKTER (sprite SVG per faksi)
     4. AudioFX (Web Audio API)
     5. Piece / Player (OOP)
     6. LudQueenGame (engine + renderer + animasi)
     7. UI / Screen flow
   ========================================================================= */


/* =========================================================================
   1. KONFIGURASI
   ========================================================================= */

const CONFIG = {
  boardSize:       15,
  piecesPerPlayer: 4,
  /* 0..50 jalur utama · 51..55 home column · 56 HOME FINISH */
  stepsToFinish:   56,
  hopDurationMs:   170,
  cloudStepMs:     95,
  diceSpinMs:      560,
  botThinkMs:      620,
  autoPlaySingleMoveMs: 300,
  extraTurnOnSix:  true,
  maxConsecutiveSixes: 3,
  /* pengali global semua jeda animasi — pakai 0.01 untuk simulasi cepat */
  animationScale:  1,
};

/* ---- SISI DADU CHAOS -----------------------------------------------------
   `def` = peluang bawaan dalam persen. Pemain bisa mengubahnya lewat layar
   "Peluang Dadu Chaos"; sisa dari 100% otomatis jadi dadu normal 1-6.      */
const CHAOS_FACES = [
  { key:'mundur',   name:'Mundur (-1..-6)', desc:'Bidak mundur 1-6 langkah',    icon:'−',  color:'#e05a3a', def:7.5 },
  { key:'double',   name:'Double (7..12)',  desc:'Maju 7-12 langkah',           icon:'x2', color:'#3b7de0', def:12  },
  { key:'perisai',  name:'Perisai',         desc:'Lindungi 1 bidak',            icon:'🛡', color:'#22a35a', def:3   },
  { key:'bom',      name:'Bom',             desc:'Bidak terjauh meledak',       icon:'💣', color:'#3a3f4d', def:1   },
  { key:'pistol',   name:'Pistol',          desc:'Pulangkan bidak lawan',       icon:'🔫', color:'#e08a2a', def:1   },
  { key:'malaikat', name:'Malaikat',        desc:'Keluarkan semua bidak base',  icon:'👼', color:'#d6459b', def:0.5 },
];
const FACE_BY_KEY = Object.fromEntries(CHAOS_FACES.map(f => [f.key, f]));

/* peluang aktif (persen) — diisi dari layar pengaturan */
const chaosProb = Object.fromEntries(CHAOS_FACES.map(f => [f.key, f.def]));

/* ---- FAKSI ------------------------------------------------------------- */
const FACTIONS = {
  red:    { key:'knight', name:'Knight', base:'Base Kerajaan',   warna:'Merah',  captureFx:'⚔️', projectile:'💣', projectileName:'Canon',              projectileCount:1, impact:'💥' },
  green:  { key:'elf',    name:'Elf',    base:'Base Hutan',      warna:'Hijau',  captureFx:'🏹', projectile:'🏹', projectileName:'Hujan Panah',        projectileCount:6, impact:'💢' },
  blue:   { key:'witch',  name:'Witch',  base:'Base Langit',     warna:'Biru',   captureFx:'✨', projectile:'🧪', projectileName:'Hujan Ramuan Sihir', projectileCount:6, impact:'🔮' },
  yellow: { key:'dragon', name:'Dragon', base:'Base Pegunungan', warna:'Kuning', captureFx:'🔥', projectile:'🔥', projectileName:'Hujan Api',          projectileCount:6, impact:'🌋' },
};

const PLAY_ORDER = ['red', 'green', 'yellow', 'blue']; // searah jarum jam


/* =========================================================================
   2. PATH MAPPING — papan 15x15, koordinat [x, y] = [kolom, baris]
   ========================================================================= */

/* Jalur utama 52 petak. Index 0 = petak start MERAH, lalu searah jarum jam. */
const TRACK = [
  [1,6],[2,6],[3,6],[4,6],[5,6],            //  0- 4
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],      //  5-10
  [7,0],                                    // 11
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],      // 12-17
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6], // 18-23
  [14,7],                                   // 24
  [14,8],[13,8],[12,8],[11,8],[10,8],[9,8], // 25-30
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14], // 31-36
  [7,14],                                   // 37
  [6,14],[6,13],[6,12],[6,11],[6,10],[6,9], // 38-43
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],      // 44-49
  [0,7],                                    // 50  <- pintu masuk home merah
  [0,6],                                    // 51
];

const START_INDEX  = { red:0, green:13, yellow:26, blue:39 };
const SAFE_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const HOME_PATH = {
  red:    [[1,7],[2,7],[3,7],[4,7],[5,7]],
  green:  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7]],
  blue:   [[7,13],[7,12],[7,11],[7,10],[7,9]],
};
const HOME_ARROW = { red:'→', green:'↓', yellow:'←', blue:'↑' };

const YARD_SLOTS = {
  red:    [[1.7,1.7],[3.8,1.7],[1.7,3.8],[3.8,3.8]],
  green:  [[10.7,1.7],[12.8,1.7],[10.7,3.8],[12.8,3.8]],
  blue:   [[1.7,10.7],[3.8,10.7],[1.7,12.8],[3.8,12.8]],
  yellow: [[10.7,10.7],[12.8,10.7],[10.7,12.8],[12.8,12.8]],
};
const YARD_CENTER  = { red:[2.75,2.75], green:[11.75,2.75], blue:[2.75,11.75], yellow:[11.75,11.75] };
/* Kotak pusat menutupi koordinat ~5.6..8.4, jadi seluruh slot finish
   ditahan di rentang 6.3..7.7 supaya bidak benar-benar berdiri di dalamnya. */
const FINISH_SLOTS = {
  red:    [[6.35,6.80],[6.35,7.20],[6.70,6.62],[6.70,7.38]],
  green:  [[7.20,6.35],[6.80,6.35],[7.38,6.70],[6.62,6.70]],
  yellow: [[7.65,7.20],[7.65,6.80],[7.30,7.38],[7.30,6.62]],
  blue:   [[6.80,7.65],[7.20,7.65],[6.62,7.30],[7.38,7.30]],
};

const TRACK_INDEX_BY_KEY = (() => {
  const m = new Map();
  TRACK.forEach(([x, y], i) => m.set(x + ',' + y, i));
  return m;
})();


/* =========================================================================
   3. KARAKTER — sprite SVG per faksi
   Ganti isi fungsi ini (atau timpa `.piece-<faksi> .sprite` lewat CSS)
   bila ingin memakai pixel art sungguhan.
   ========================================================================= */

const CHARACTER_SVG = {
  knight: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="24.6" y="5" width="3" height="15" rx="1" fill="#e6ecf5" stroke="#2b3242" stroke-width="1.2"/>
    <rect x="22.2" y="18.8" width="8" height="2.4" rx="1" fill="#f0c04a" stroke="#2b3242" stroke-width="1.2"/>
    <path d="M9 30v-7a7 7 0 0 1 14 0v7z" fill="#e8433f" stroke="#2b3242" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M3.6 14.6h7.2v6.2a3.6 3.6 0 0 1-7.2 0z" fill="#cfd8e6" stroke="#2b3242" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M10 16v-6a6 6 0 0 1 12 0v6z" fill="#dbe3ee" stroke="#2b3242" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="14.4" y="9.8" width="3.2" height="6.2" rx="1" fill="#2b3242"/>
    <path d="M16 4c2.2-2.8 5.2-1.7 4.7 1.5" stroke="#e8433f" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`,

  elf: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M25 6a12 12 0 0 1 0 20" stroke="#8a5a34" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M25 6v20" stroke="#cbb98d" stroke-width="1" fill="none"/>
    <path d="M9 30v-8a7 7 0 0 1 14 0v8z" fill="#22b04b" stroke="#1c3524" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="9" y="23.6" width="14" height="2.4" fill="#8a5a34" stroke="#1c3524" stroke-width=".9"/>
    <path d="M9.4 12.4c-3 1.4-3.8 6.4-1.8 10.2" stroke="#d9b45c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="16" cy="12" r="6" fill="#f2c9a0" stroke="#1c3524" stroke-width="1.3"/>
    <path d="M10.2 11.2a6 6 0 0 1 11.6 0c-2-2.2-3.8-3.2-5.8-3.2s-3.8 1-5.8 3.2z" fill="#d9b45c" stroke="#1c3524" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M10.4 12.2 7.6 10l.8 4.2z" fill="#f2c9a0" stroke="#1c3524" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="14" cy="13.2" r="1" fill="#1c3524"/><circle cx="18.3" cy="13.2" r="1" fill="#1c3524"/>
  </svg>`,

  witch: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 30l2-9a6 6 0 0 1 12 0l2 9z" fill="#2f6fd0" stroke="#16233d" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9.6 13.6c-1.2 5-.4 9 .6 12M22.4 13.6c1.2 5 .4 9-.6 12" stroke="#b9a6f0" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="16" cy="14" r="5.2" fill="#f6d4b4" stroke="#16233d" stroke-width="1.2"/>
    <circle cx="14.2" cy="14.6" r=".95" fill="#16233d"/><circle cx="17.9" cy="14.6" r=".95" fill="#16233d"/>
    <path d="M5 10.2h22l-3.2-2.6C21.8 4 19 1.6 16 1.6S10.2 4 8.2 7.6z" fill="#1f2a52" stroke="#16233d" stroke-width="1.3" stroke-linejoin="round"/>
    <rect x="10.4" y="6.6" width="11.2" height="2.6" fill="#4fd0ff" opacity=".9"/>
    <path d="m16 3.4.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="#ffd34d"/>
  </svg>`,

  dragon: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.6 14.4C6.4 11.4 5 20 10 23.4c2 1 3.6 0 3.6 0z" fill="#c98f1e" stroke="#4a3208" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M22.4 14.4c3.2-3 4.6 5.6-.4 9-2 1-3.6 0-3.6 0z" fill="#c98f1e" stroke="#4a3208" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M10 30v-8a6 6 0 0 1 12 0v8z" fill="#e8b21a" stroke="#4a3208" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M13 24.4h6V30h-6z" fill="#f7dd8a"/>
    <path d="M9.6 13.6a6.4 5.6 0 0 1 12.8 0 5 5 0 0 1-2 4.4h-8.8a5 5 0 0 1-2-4.4z" fill="#e8b21a" stroke="#4a3208" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M12.8 16.6h6.4v3.2h-6.4z" fill="#f7dd8a" stroke="#4a3208" stroke-width="1" stroke-linejoin="round"/>
    <path d="m11 8.8-1.8-4.2 4.2 2.6zm10 0 1.8-4.2-4.2 2.6z" fill="#f2efe4" stroke="#4a3208" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="13.4" cy="12.8" r="1.05" fill="#4a3208"/><circle cx="18.6" cy="12.8" r="1.05" fill="#4a3208"/>
    <path d="M16 20.4c1.3 1.1 1.7 2.6 0 3.6-1.7-1-1.3-2.5 0-3.6z" fill="#e8433f"/>
  </svg>`,
};

const characterOf = color => CHARACTER_SVG[FACTIONS[color].key];


/* =========================================================================
   4. AUDIO FX — Web Audio API (tanpa file audio eksternal)
   ========================================================================= */

class AudioFX {
  constructor(){ this.ctx = null; this.enabled = true; }
  _ensure(){
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return null; }
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone({ freq=440, dur=.12, type='square', vol=.15, slideTo=null, delay=0 }){
    const ctx = this._ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + .03);
  }
  noise({ dur=.25, vol=.2, delay=0, filterFreq=900 }){
    const ctx = this._ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + delay, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random()*2-1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = filterFreq;
    const gain = ctx.createGain(); gain.gain.value = vol;
    src.connect(flt).connect(gain).connect(ctx.destination); src.start(t0);
  }
  seq(n){ n.forEach(x => this.tone(x)); }
  click()  { this.tone({ freq:660, dur:.06, vol:.11 }); }
  rolling(){ for (let i=0;i<5;i++) this.tone({ freq:240+Math.random()*320, dur:.05, vol:.08, delay:i*.07, type:'triangle' }); }
  diceStop(){ this.seq([{freq:520,dur:.08},{freq:780,dur:.12,delay:.07}]); }
  hop()    { this.tone({ freq:520, dur:.07, vol:.09, type:'triangle', slideTo:760 }); }
  back()   { this.tone({ freq:520, dur:.1, vol:.1, type:'triangle', slideTo:240 }); }
  capture(){ this.noise({dur:.3,vol:.2,filterFreq:1600}); this.tone({freq:300,dur:.12,slideTo:110,type:'sawtooth',vol:.17}); }
  shield() { this.seq([{freq:520,dur:.1,type:'sine'},{freq:780,dur:.1,type:'sine',delay:.09},{freq:1040,dur:.2,type:'sine',delay:.18}]); }
  angel()  { [523,659,784,1046,1318].forEach((f,i)=>this.tone({freq:f,dur:.28,type:'sine',vol:.13,delay:i*.09})); }
  cloud()  { this.tone({freq:300,dur:.5,type:'sine',vol:.12,slideTo:900}); }
  attack() { this.tone({freq:180,dur:.22,type:'sawtooth',vol:.19,slideTo:60}); this.noise({dur:.35,vol:.19,filterFreq:700,delay:.05}); }
  boom()   { this.noise({dur:.55,vol:.26,filterFreq:420}); this.tone({freq:120,dur:.4,type:'sawtooth',vol:.2,slideTo:40}); }
  finish() { [659,784,988,1318].forEach((f,i)=>this.tone({freq:f,dur:.16,type:'square',vol:.14,delay:i*.1})); }
  win()    { [523,659,784,1046,784,1046,1318].forEach((f,i)=>this.tone({freq:f,dur:.22,type:'square',vol:.14,delay:i*.14})); }
  deny()   { this.seq([{freq:200,dur:.1,type:'square',vol:.13},{freq:140,dur:.16,type:'square',vol:.13,delay:.09}]); }
}


/* =========================================================================
   5. OOP — Piece & Player
   ========================================================================= */

class Piece {
  /** p: -1 markas · 0..50 jalur · 51..55 home column · 56 finish */
  constructor(player, slot){
    this.player = player; this.color = player.color; this.slot = slot;
    this.id = `${player.color}-${slot}`;
    this.p = -1; this.shield = false; this.el = null;
  }
  get inBase()    { return this.p < 0; }
  get finished()  { return this.p >= CONFIG.stepsToFinish; }
  get onTrack()   { return this.p >= 0 && this.p <= 50; }
  get inHomeRun() { return this.p >= 51 && this.p < CONFIG.stepsToFinish; }
  get onBoard()   { return this.onTrack || this.inHomeRun; }
  get trackIndex(){ return this.onTrack ? (START_INDEX[this.color] + this.p) % TRACK.length : -1; }

  coordAt(p){
    if (p < 0)   return YARD_SLOTS[this.color][this.slot];
    if (p <= 50) return TRACK[(START_INDEX[this.color] + p) % TRACK.length];
    if (p < CONFIG.stepsToFinish) return HOME_PATH[this.color][p - 51];
    return FINISH_SLOTS[this.color][this.slot];
  }
  get coord(){ return this.coordAt(this.p); }
}

class Player {
  constructor(color, kind){
    this.color = color; this.kind = kind; this.faction = FACTIONS[color];
    this.pieces = Array.from({ length: CONFIG.piecesPerPlayer }, (_, i) => new Piece(this, i));
  }
  get isBot()        { return this.kind === 'bot'; }
  get finishedCount(){ return this.pieces.filter(p => p.finished).length; }
  get hasWon()       { return this.finishedCount === CONFIG.piecesPerPlayer; }
  get piecesInBase() { return this.pieces.filter(p => p.inBase); }
  get piecesOnBoard(){ return this.pieces.filter(p => p.onBoard); }
  /** true bila belum satu pun bidak keluar dari markas */
  get stillAllInBase(){ return this.piecesOnBoard.length === 0 && this.finishedCount === 0; }
}


/* =========================================================================
   6. ENGINE
   ========================================================================= */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const d6 = () => 1 + Math.floor(Math.random() * 6);

class LudQueenGame {
  constructor(dom, audio){
    this.dom = dom; this.audio = audio;
    this.mode = 'classic';
    this.players = []; this.turnIdx = 0;
    this.state = 'idle';   // idle|rolling|animating|select-move|select-target|select-shield|over
    this.pendingMoves = []; this.sixStreak = 0; this.currentFace = null;
    this._boardBuilt = false;
  }

  /* ---------------- setup ---------------- */
  init(mode, slots){
    this.mode = mode;
    this.players = PLAY_ORDER.filter(c => slots[c] !== 'disable').map(c => new Player(c, slots[c]));
    this.turnIdx = 0; this.sixStreak = 0; this.state = 'idle'; this.currentFace = null;

    if (!this._boardBuilt) { this.buildBoard(); this._boardBuilt = true; }
    this.buildPieces();
    this.buildPlayerCards();
    this.dom.gameTitle.textContent = mode === 'chaos' ? 'LUDO CHAOS (CUSTOM)' : 'LUDO CLASSIC';
    this.dom.modalWin.hidden = true;
    this.renderAll();
    this.beginTurn();
  }

  buildBoard(){
    const grid = this.dom.boardGrid;
    grid.innerHTML = '';

    const homeOf = new Map();
    for (const c of PLAY_ORDER) HOME_PATH[c].forEach(([x, y]) => homeOf.set(x + ',' + y, c));
    const startOf = {}, arrowOf = {};
    for (const c of PLAY_ORDER) {
      const [sx, sy] = TRACK[START_INDEX[c]];
      startOf[sx + ',' + sy] = c;
      const [ax, ay] = TRACK[(START_INDEX[c] + 50) % TRACK.length];   // pintu masuk home
      arrowOf[ax + ',' + ay] = c;
    }

    for (let y = 0; y < CONFIG.boardSize; y++) {
      for (let x = 0; x < CONFIG.boardSize; x++) {
        const key = x + ',' + y;
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.xy = key;

        const onTrack = TRACK_INDEX_BY_KEY.get(key);
        const home = homeOf.get(key);

        if (onTrack !== undefined) {
          cell.classList.add('cell-path');
          const sc = startOf[key];
          if (sc) cell.classList.add('c-' + sc);
          else if (SAFE_INDEXES.has(onTrack)) cell.classList.add('cell-safe');
          const ac = arrowOf[key];
          if (ac) { cell.classList.add('cell-arrow', 'a-' + ac); cell.dataset.arrow = HOME_ARROW[ac]; }
        } else if (home) {
          cell.classList.add('cell-home', 'c-' + home);
        } else {
          cell.classList.add('cell-void');
        }
        grid.appendChild(cell);
      }
    }
  }

  buildPieces(){
    const layer = this.dom.pieceLayer;
    layer.innerHTML = '';
    for (const player of this.players) {
      for (const piece of player.pieces) {
        const el = document.createElement('div');
        el.className = 'piece piece-' + player.faction.key;
        el.dataset.color = piece.color;
        el.dataset.id = piece.id;
        el.innerHTML =
          `<div class="piece-body">` +
            `<span class="piece-base"></span>` +
            `<span class="sprite">${characterOf(piece.color)}</span>` +
          `</div><span class="cloud">☁️</span>`;
        el.addEventListener('click', () => this.onPieceClick(piece));
        piece.el = el;
        layer.appendChild(el);
      }
    }
  }

  buildPlayerCards(){
    const playing = new Set(this.players.map(p => p.color));
    for (const card of $$('.pcard')) {
      const color = card.dataset.color;
      const fac = FACTIONS[color];
      card.classList.toggle('is-off', !playing.has(color));
      card.innerHTML =
        `<div class="pcard-head">` +
          `<span class="pcard-score">0</span>` +
          `<span class="pcard-name">${fac.name}</span>` +
        `</div>` +
        `<div class="pcard-slot"></div>`;
      const slot = $('.pcard-slot', card);
      slot.addEventListener('click', () => {
        if (this.state === 'idle' && this.current.color === color && !this.current.isBot) {
          this.audio.click(); this.doRoll();
        }
      });
    }
  }

  /* ---------------- helper ---------------- */
  get current(){ return this.players[this.turnIdx]; }
  allPieces()  { return this.players.flatMap(p => p.pieces); }
  wait(ms)     { return sleep(Math.max(0, ms * CONFIG.animationScale)); }

  toast(text, ms = 1600){
    const t = this.dom.toast;
    t.textContent = text; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.hidden = true; }, ms * Math.max(CONFIG.animationScale, .25));
  }

  /* ---------------- render ---------------- */
  renderAll(){ this.renderPieces(); this.renderCards(); this.renderYards(); }

  renderPieces(){
    const groups = new Map();
    for (const piece of this.allPieces()) {
      const [x, y] = piece.coord;
      const k = `${x.toFixed(2)},${y.toFixed(2)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(piece);
    }
    for (const [, list] of groups) {
      list.forEach((piece, i) => {
        const n = list.length;
        const dx = n > 1 ? 0.40 * (i - (n - 1) / 2) : 0;
        const dy = n > 1 ? 0.13 * (i % 2 ? 1 : -1) : 0;
        piece.el.classList.toggle('is-stacked', n > 1);
        piece.el.style.zIndex = String(2 + i);
        const [x, y] = piece.coord;
        this.setPiecePos(piece, x + dx, y + dy);
      });
    }
    for (const piece of this.allPieces()) piece.el.classList.toggle('has-shield', piece.shield);
  }

  setPiecePos(piece, x, y){
    piece.el.style.left = ((x + 0.5) / CONFIG.boardSize * 100) + '%';
    piece.el.style.top  = ((y + 0.5) / CONFIG.boardSize * 100) + '%';
  }

  renderCards(){
    for (const card of $$('.pcard')) {
      const color = card.dataset.color;
      const player = this.players.find(p => p.color === color);
      const isTurn = player && player === this.current && this.state !== 'over';
      card.classList.toggle('is-turn', !!isTurn);
      const score = $('.pcard-score', card);
      if (score && player) score.textContent = String(player.finishedCount);
      const slot = $('.pcard-slot', card);
      if (!slot) continue;
      if (isTurn) this.renderDie(slot, this.currentFace, this.state === 'rolling');
      else slot.innerHTML = '';
    }
  }

  /** dadu digambar di dalam kartu pemain yang sedang giliran */
  renderDie(slot, face, rolling){
    const canRoll = this.state === 'idle' && !this.current.isBot;
    let cls = 'die';
    if (rolling) cls += ' is-rolling';
    if (canRoll) cls += ' is-clickable';

    let inner, style = '';
    if (!face) {
      inner = '🎲';
    } else if (face.type === 'number') {
      inner = this.pipsHtml(face.base);
    } else if (face.type === 'double') {
      cls += ' is-special'; style = `background:${FACE_BY_KEY.double.color}`;
      inner = `<span style="font-size:14px">${face.steps}</span>`;
    } else if (face.type === 'mundur') {
      cls += ' is-special'; style = `background:${FACE_BY_KEY.mundur.color}`;
      inner = `<span style="font-size:14px">${face.steps}</span>`;
    } else {
      const meta = FACE_BY_KEY[face.type];
      cls += ' is-special'; style = `background:${meta.color}`;
      inner = `<span style="font-size:16px">${meta.icon}</span>`;
    }
    slot.innerHTML = `<div class="${cls}" style="${style}">${inner}</div>`;
  }

  pipsHtml(n){
    /* pola titik dadu 3x3 */
    const P = {
      1:[0,0,0,0,1,0,0,0,0], 2:[1,0,0,0,0,0,0,0,1], 3:[1,0,0,0,1,0,0,0,1],
      4:[1,0,1,0,0,0,1,0,1], 5:[1,0,1,0,1,0,1,0,1], 6:[1,0,1,1,0,1,1,0,1],
    }[n] || [];
    return `<span class="die-pips">${P.map(v => `<i class="${v ? '' : 'off'}"></i>`).join('')}</span>`;
  }

  renderYards(){
    const playing = new Set(this.players.map(p => p.color));
    for (const y of $$('.yard', this.dom.board)) y.classList.toggle('is-off', !playing.has(y.dataset.color));
  }

  clearHighlights(){
    for (const piece of this.allPieces()) piece.el.classList.remove('is-selectable', 'is-target');
  }

  /* ---------------- dadu ---------------- */

  /** @returns {{type:string, base:number, steps:number}} */
  rollFace(){
    const player = this.current;
    if (this.mode === 'classic') { const n = d6(); return { type:'number', base:n, steps:n }; }

    /* ATURAN CHAOS: selama pemain belum punya bidak di luar markas,
       hanya dadu normal 1-6 yang boleh keluar. */
    if (player.stillAllInBase) { const n = d6(); return { type:'number', base:n, steps:n }; }

    let r = Math.random() * 100;
    for (const f of CHAOS_FACES) {
      r -= (chaosProb[f.key] || 0);
      if (r < 0) return this.makeSpecialFace(f.key);
    }
    const n = d6();
    return { type:'number', base:n, steps:n };
  }

  makeSpecialFace(key){
    if (key === 'double') { const s = 7 + Math.floor(Math.random() * 6); return { type:'double', base:s, steps:s }; }
    if (key === 'mundur') { const s = -d6(); return { type:'mundur', base:s, steps:s }; }
    return { type:key, base:0, steps:0 };
  }

  /* ---------------- alur giliran ---------------- */

  beginTurn(){
    if (this.state === 'over') return;
    this.clearHighlights();
    this.state = 'idle';
    this.currentFace = null;
    this.renderAll();

    if (this.current.isBot) setTimeout(() => this.doRoll(), CONFIG.botThinkMs * CONFIG.animationScale);
  }

  async doRoll(){
    if (this.state !== 'idle') return;
    this.state = 'rolling';
    this.clearHighlights();
    this.audio.rolling();

    const slot = $(`.pcard[data-color="${this.current.color}"] .pcard-slot`);
    const spin = setInterval(() => {
      if (slot) this.renderDie(slot, { type:'number', base:d6() }, true);
    }, Math.max(16, 70 * CONFIG.animationScale));

    await this.wait(CONFIG.diceSpinMs);
    clearInterval(spin);

    const face = this.rollFace();
    this.currentFace = face;
    if (slot) this.renderDie(slot, face, false);
    this.audio.diceStop();

    await this.wait(220);
    await this.resolveFace(face);
  }

  async resolveFace(face){
    const player = this.current;

    /* tiga kali 6 beruntun -> giliran hangus */
    if (face.type === 'number' && face.base === 6) {
      this.sixStreak++;
      if (this.sixStreak >= CONFIG.maxConsecutiveSixes) {
        this.toast('Tiga kali 6 beruntun — giliran hangus');
        this.audio.deny(); this.sixStreak = 0;
        await this.wait(750);
        return this.endTurn(false);
      }
    } else if (face.type !== 'double' && face.type !== 'mundur') {
      this.sixStreak = 0;
    }

    switch (face.type) {
      case 'number': case 'double': case 'mundur': return this.resolveMoveFace(face);
      case 'malaikat': return this.resolveMalaikat();
      case 'pistol':   return this.resolvePistol();
      case 'perisai':  return this.resolvePerisai();
      case 'bom':      return this.resolveBom();
    }
  }

  /* ---- sisi yang menggerakkan bidak: number / double / mundur ---- */
  async resolveMoveFace(face){
    const player = this.current;
    const moves = this.getLegalMoves(player, face);

    if (face.type === 'double') { this.toast(`Double — maju ${face.steps} langkah ☁️`); await this.wait(520); }
    if (face.type === 'mundur') { this.toast(`Mundur ${face.steps} langkah`);          await this.wait(520); }

    if (moves.length === 0) {
      this.audio.deny();
      this.toast('Tidak ada gerakan yang sah', 1100);
      await this.wait(800);
      return this.endTurn(face.type === 'number' && face.base === 6 && CONFIG.extraTurnOnSix);
    }

    if (player.isBot) {
      await this.wait(260);
      return this.executeMove(this.chooseBotMove(moves, face), face);
    }
    if (moves.length === 1) {
      await this.wait(CONFIG.autoPlaySingleMoveMs);
      return this.executeMove(moves[0], face);
    }
    this.state = 'select-move';
    this.pendingMoves = moves;
    moves.forEach(m => m.piece.el.classList.add('is-selectable'));
    this.renderCards();
  }

  /** @returns {{piece:Piece, from:number, to:number, releases:boolean}[]} */
  getLegalMoves(player, face){
    const steps = face.steps;
    const moves = [];
    let releaseOffered = false;
    const seen = new Set();

    for (const piece of player.pieces) {
      if (piece.finished) continue;

      if (piece.inBase) {
        /* keluar markas hanya dengan angka 6; semua bidak di markas identik
           jadi cukup ditawarkan satu pilihan */
        if (face.type === 'number' && steps === 6 && !releaseOffered) {
          moves.push({ piece, from: -1, to: 0, releases: true });
          releaseOffered = true;
        }
        continue;
      }

      if (seen.has(piece.p)) continue;   // bidak sewarna di petak sama = pilihan identik

      if (face.type === 'mundur') {
        /* hanya bidak di jalur utama yang bisa mundur, tidak boleh lewat start */
        if (!piece.onTrack) continue;
        const to = piece.p + steps;
        if (to < 0) continue;
        moves.push({ piece, from: piece.p, to, releases: false });
        seen.add(piece.p);
        continue;
      }

      const to = piece.p + steps;
      if (to <= CONFIG.stepsToFinish) {
        moves.push({ piece, from: piece.p, to, releases: false });
        seen.add(piece.p);
      }
    }
    return moves;
  }

  async executeMove(move, face){
    this.state = 'animating';
    this.clearHighlights();
    this.renderCards();
    const { piece } = move;

    if (move.releases) {
      this.audio.hop();
      piece.p = 0;
      this.spawnFx(piece.coord, '✨');
      this.renderPieces();
      await this.wait(320);
    } else {
      await this.animateTravel(piece, move.from, move.to, face.type);
    }

    const result = await this.resolveLanding(piece);
    if (this.checkWin(piece.player)) return;

    let extra = result.extraTurn;
    if (face.type === 'number' && face.base === 6 && CONFIG.extraTurnOnSix) extra = true;
    if (move.releases) extra = true;

    await this.wait(180);
    this.endTurn(extra);
  }

  async animateTravel(piece, from, to, faceType){
    const backward = to < from;
    const viaCloud = faceType === 'double';
    piece.el.classList.add('is-moving');
    if (viaCloud) { piece.el.classList.add('on-cloud'); this.audio.cloud(); }

    const dur = viaCloud ? CONFIG.cloudStepMs : CONFIG.hopDurationMs;
    piece.el.style.setProperty('--hop-dur', dur + 'ms');
    piece.el.style.transitionDuration = `${dur}ms, ${dur}ms`;

    const step = backward ? -1 : 1;
    for (let p = from + step; backward ? p >= to : p <= to; p += step) {
      piece.p = p;
      const [x, y] = piece.coordAt(p);
      this.setPiecePos(piece, x, y);
      if (!viaCloud) {
        piece.el.classList.remove('hop'); void piece.el.offsetWidth; piece.el.classList.add('hop');
        backward ? this.audio.back() : this.audio.hop();
      }
      await this.wait(dur);
    }
    piece.el.classList.remove('hop', 'on-cloud', 'is-moving');
    piece.el.style.transitionDuration = '';
    this.renderPieces();
  }

  async resolveLanding(piece){
    const out = { captured:false, extraTurn:false };

    if (piece.finished) {
      if (piece.shield) piece.shield = false;    // perisai hilang saat sampai Home Finish
      this.audio.finish();
      this.spawnFx(piece.coord, '🏆');
      this.toast(`${piece.player.faction.name} membawa 1 bidak pulang!`);
      out.extraTurn = true;
      this.renderPieces(); this.renderCards();
      await this.wait(600);
      return out;
    }

    if (!piece.onTrack) { this.renderPieces(); return out; }

    const idx = piece.trackIndex;
    if (SAFE_INDEXES.has(idx)) { this.renderPieces(); return out; }

    const victims = this.allPieces().filter(o => o.color !== piece.color && o.onTrack && o.trackIndex === idx);
    if (!victims.length) { this.renderPieces(); return out; }

    for (const victim of victims) {
      if (victim.shield) {
        victim.shield = false;
        this.audio.shield();
        this.spawnFx(victim.coord, '🛡️');
        this.toast(`Perisai ${victim.player.faction.name} menahan serangan!`);
      } else {
        this.audio.capture();
        this.spawnFx(victim.coord, piece.player.faction.captureFx);
        this.spawnFx(victim.coord, '', 'fx-shock', 700);
        this.shakeBoard();
        await this.wait(400);
        this.sendHome(victim);
        out.captured = true;
      }
    }
    if (out.captured) {
      if (piece.shield) piece.shield = false;    // perisai luntur setelah menangkap
      out.extraTurn = true;
      this.toast(`${piece.player.faction.name} menangkap bidak lawan!`);
    }
    this.renderPieces();
    await this.wait(300);
    return out;
  }

  sendHome(piece){ piece.p = -1; piece.shield = false; this.renderPieces(); }

  checkWin(player){
    if (!player.hasWon) return false;
    this.state = 'over';
    this.clearHighlights();
    this.audio.win();
    this.dom.winFigure.innerHTML = characterOf(player.color);
    this.dom.winTitle.textContent = `${player.faction.name} Menang!`;
    this.dom.modalWin.hidden = false;
    this.renderCards();
    return true;
  }

  endTurn(extraTurn){
    if (this.state === 'over') return;
    this.clearHighlights();
    if (!extraTurn) {
      this.sixStreak = 0;
      let guard = 0;
      do { this.turnIdx = (this.turnIdx + 1) % this.players.length; }
      while (this.current.hasWon && ++guard < this.players.length);
    }
    this.beginTurn();
  }

  /* ---- MALAIKAT 👼 ---- */
  async resolveMalaikat(){
    this.state = 'animating';
    this.renderCards();
    const player = this.current;
    const inBase = player.piecesInBase;
    this.audio.angel();
    this.toast('Malaikat — semua bidak keluar dari base!');
    await this.wait(450);

    for (const piece of inBase) {
      piece.p = 0;
      this.renderPieces();
      this.spawnFx(piece.coord, '✨');
      this.audio.hop();
      await this.wait(180);
    }
    const startIdx = START_INDEX[player.color];
    if (!SAFE_INDEXES.has(startIdx)) {
      for (const v of this.allPieces().filter(o => o.color !== player.color && o.onTrack && o.trackIndex === startIdx)) {
        if (v.shield) v.shield = false; else this.sendHome(v);
      }
    }
    this.renderPieces();
    await this.wait(420);
    this.endTurn(true);   // giliran ekstra
  }

  /* ---- PISTOL 🔫 ---- */
  async resolvePistol(){
    const player = this.current;
    const targets = this.allPieces().filter(o => o.color !== player.color && o.onBoard);
    if (!targets.length) {
      this.toast('Tidak ada bidak lawan di papan');
      this.audio.deny(); await this.wait(800);
      return this.endTurn(false);
    }
    if (player.isBot) {
      await this.wait(450);
      const sorted = [...targets].sort((a, b) => (a.shield === b.shield) ? b.p - a.p : (a.shield ? 1 : -1));
      return this.performPistol(sorted[0]);
    }
    this.state = 'select-target';
    this.toast('Pistol — pilih bidak lawan');
    targets.forEach(t => t.el.classList.add('is-target'));
    this.renderCards();
  }

  async performPistol(target){
    this.state = 'animating';
    this.clearHighlights(); this.renderCards();
    const fac = this.current.faction;
    this.toast(`${fac.name} melepaskan ${fac.projectileName}!`);
    await this.playProjectileFx(this.current.color, target.coord, fac);

    if (target.shield) {
      target.shield = false;
      this.audio.shield();
      this.spawnFx(target.coord, '🛡️');
      this.toast(`Perisai ${target.player.faction.name} hancur menahan serangan!`);
    } else {
      this.audio.capture();
      this.spawnFx(target.coord, fac.impact);
      this.sendHome(target);
    }
    this.shakeBoard();
    this.renderPieces();
    await this.wait(700);
    this.endTurn(false);
  }

  /* ---- PERISAI 🛡️ ---- */
  async resolvePerisai(){
    const player = this.current;
    const candidates = player.pieces.filter(p => p.onBoard && !p.shield);
    if (!candidates.length) {
      this.toast('Tidak ada bidak yang bisa diberi perisai');
      this.audio.deny(); await this.wait(800);
      return this.endTurn(false);
    }
    if (player.isBot) {
      await this.wait(420);
      return this.applyPerisai([...candidates].sort((a, b) => b.p - a.p)[0]);
    }
    this.state = 'select-shield';
    this.toast('Perisai — pilih bidakmu');
    candidates.forEach(p => p.el.classList.add('is-selectable'));
    this.renderCards();
  }

  async applyPerisai(piece){
    this.state = 'animating';
    this.clearHighlights(); this.renderCards();
    piece.shield = true;
    this.audio.shield();
    this.renderPieces();
    this.spawnFx(piece.coord, '🛡️');
    await this.wait(680);
    this.endTurn(false);
  }

  /* ---- BOM 💣 (bidak terjauh di papan meledak, milik siapa pun) ---- */
  async resolveBom(){
    this.state = 'animating';
    this.renderCards();
    const onBoard = this.allPieces().filter(p => p.onBoard);
    if (!onBoard.length) {
      this.toast('Tidak ada bidak di papan');
      this.audio.deny(); await this.wait(800);
      return this.endTurn(false);
    }
    const target = onBoard.reduce((a, b) => (b.p > a.p ? b : a));
    this.toast(`Bom! Bidak terjauh (${target.player.faction.name}) meledak`);
    await this.wait(520);

    this.audio.boom();
    this.spawnFx(target.coord, '💥');
    this.spawnFx(target.coord, '', 'fx-shock', 700);
    this.shakeBoard();
    await this.wait(420);

    if (target.shield) {
      target.shield = false;
      this.audio.shield();
      this.spawnFx(target.coord, '🛡️');
      this.toast(`Perisai ${target.player.faction.name} menahan ledakan!`);
    } else {
      this.sendHome(target);
    }
    this.renderPieces();
    await this.wait(600);
    this.endTurn(false);
  }

  /* ---------------- input pemain ---------------- */
  onPieceClick(piece){
    if (this.state === 'select-move') {
      const move = this.pendingMoves.find(m => m.piece === piece);
      if (!move) { this.audio.deny(); return; }
      this.audio.click(); this.pendingMoves = [];
      this.executeMove(move, this.currentFace);
    } else if (this.state === 'select-target') {
      if (!piece.el.classList.contains('is-target')) { this.audio.deny(); return; }
      this.audio.click(); this.performPistol(piece);
    } else if (this.state === 'select-shield') {
      if (!piece.el.classList.contains('is-selectable')) { this.audio.deny(); return; }
      this.audio.click(); this.applyPerisai(piece);
    }
  }

  /* ---------------- bot ---------------- */
  chooseBotMove(moves, face){
    let best = moves[0], bestScore = -Infinity;
    for (const m of moves) {
      const s = this.scoreMove(m, face);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  scoreMove(move, face){
    const { piece, to, releases } = move;
    let score = 0;
    if (releases) score += 70;
    if (to === CONFIG.stepsToFinish) score += 95;
    if (to > 50 && to < CONFIG.stepsToFinish) score += 45;

    if (to >= 0 && to <= 50) {
      const idx = (START_INDEX[piece.color] + to) % TRACK.length;
      const enemies = this.allPieces().filter(o => o.color !== piece.color && o.onTrack && o.trackIndex === idx);
      if (enemies.length && !SAFE_INDEXES.has(idx)) {
        score += 120 * enemies.filter(e => !e.shield).length;
        score += 20  * enemies.filter(e =>  e.shield).length;
      }
      if (SAFE_INDEXES.has(idx)) score += 25;

      let danger = 0;
      for (const o of this.allPieces()) {
        if (o.color === piece.color || !o.onTrack) continue;
        const diff = (idx - o.trackIndex + TRACK.length) % TRACK.length;
        if (diff >= 1 && diff <= 6) danger++;
      }
      if (!SAFE_INDEXES.has(idx) && !piece.shield) score -= danger * 14;
    }
    score += to * 0.6;
    if (face.type === 'mundur') score -= 12;   // mundur memang merugikan
    return score;
  }

  /* ---------------- efek ---------------- */
  fxPos([x, y]){
    return {
      left: ((x + 0.5) / CONFIG.boardSize * 100) + '%',
      top:  ((y + 0.5) / CONFIG.boardSize * 100) + '%',
    };
  }
  spawnFx(coord, content, cls = 'fx-burst', life = 900){
    const el = document.createElement('div');
    el.className = 'fx ' + cls;
    el.textContent = content;
    Object.assign(el.style, this.fxPos(coord));
    this.dom.fxLayer.appendChild(el);
    setTimeout(() => el.remove(), life);
  }
  shakeBoard(){
    this.dom.board.classList.add('is-shaking');
    setTimeout(() => this.dom.board.classList.remove('is-shaking'), 620);
  }
  playProjectileFx(attackerColor, targetCoord, fac){
    return new Promise(resolve => {
      const origin = YARD_CENTER[attackerColor];
      const count = fac.projectileCount, flight = 560 * Math.max(CONFIG.animationScale, .05);
      this.audio.attack();
      for (let i = 0; i < count; i++) {
        const sx = count > 1 ? (Math.random() - .5) * 2.4 : 0;
        const sy = count > 1 ? (Math.random() - .5) * 1.6 : 0;
        const el = document.createElement('div');
        el.className = 'fx fx-projectile';
        el.textContent = fac.projectile;
        Object.assign(el.style, this.fxPos([origin[0] + sx, origin[1] + sy]));
        el.style.transitionDuration = flight + 'ms';
        el.style.transitionDelay = (i * 55 * CONFIG.animationScale) + 'ms';
        this.dom.fxLayer.appendChild(el);
        void el.offsetWidth;
        const dest = this.fxPos([targetCoord[0] + sx * .25, targetCoord[1] + sy * .25]);
        el.style.left = dest.left; el.style.top = dest.top;
        el.style.transform = `translate(-50%,-50%) rotate(${Math.random()*60-30}deg) scale(1.15)`;
        setTimeout(() => el.remove(), flight + i * 60 + 150);
      }
      setTimeout(() => { this.spawnFx(targetCoord, '', 'fx-shock', 700); resolve(); },
        flight + count * 55 * CONFIG.animationScale);
    });
  }
}


/* =========================================================================
   7. UI / SCREEN FLOW
   ========================================================================= */

const audio = new AudioFX();

const dom = {
  screens: {
    title: $('#screen-title'), menu: $('#screen-menu'), chaos: $('#screen-chaos'),
    setup: $('#screen-setup'), game: $('#screen-game'),
  },
  board: $('#board'), boardGrid: $('#board-grid'),
  pieceLayer: $('#piece-layer'), fxLayer: $('#fx-layer'),
  gameTitle: $('#game-title'), toast: $('#toast'),
  modalWin: $('#modal-win'), winTitle: $('#win-title'), winFigure: $('#win-figure'),
  setupModeLabel: $('#setup-mode-label'),
};

const game = new LudQueenGame(dom, audio);

let selectedMode = 'classic';
const slotState  = { red:'human', green:'bot', blue:'bot', yellow:'disable' };
const SLOT_CYCLE = { human:'bot', bot:'disable', disable:'human' };
const SLOT_LABEL = { human:'HUMAN', bot:'BOT', disable:'DISABLE' };

function showScreen(name){
  Object.values(dom.screens).forEach(s => s.classList.remove('is-active'));
  dom.screens[name].classList.add('is-active');
}

/* ---- title ---- */
dom.screens.title.addEventListener('click', () => { audio.click(); showScreen('menu'); });

/* ---- menu ---- */
$$('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
  audio.click();
  selectedMode = btn.dataset.mode;
  dom.setupModeLabel.textContent = selectedMode === 'chaos' ? 'Ludo Chaos (Custom)' : 'Ludo Classic';
  showScreen(selectedMode === 'chaos' ? 'chaos' : 'setup');
}));

/* ---- pengaturan peluang dadu chaos ---- */
function buildProbUI(){
  $('#prob-list').innerHTML = CHAOS_FACES.map(f => `
    <div class="prob-row">
      <span class="face-badge" style="background:${f.color}">${f.icon}</span>
      <span class="prob-name">${f.name}</span>
      <input class="prob-input" type="text" inputmode="decimal"
             value="${fmtPct(chaosProb[f.key])}" data-key="${f.key}" aria-label="${f.name}">
      <span class="prob-unit">%</span>
    </div>`).join('');

  $$('#prob-list .prob-input').forEach(inp => {
    inp.addEventListener('input', () => {
      let v = parsePct(inp.value);
      if (v > 100) { v = 100; inp.value = '100'; }
      chaosProb[inp.dataset.key] = v;
      refreshProbSummary();
    });
    /* rapikan tampilan saat selesai mengetik */
    inp.addEventListener('blur', () => { inp.value = fmtPct(chaosProb[inp.dataset.key]); });
  });
  refreshProbSummary();
}

/* format angka gaya Indonesia: 7.5 -> "7,5" */
function fmtPct(n){ return (Math.round((n || 0) * 10) / 10).toString().replace('.', ','); }
/* terima koma maupun titik sebagai pemisah desimal */
function parsePct(text){
  const v = parseFloat(String(text).replace(',', '.').replace(/[^0-9.]/g, ''));
  return isFinite(v) && v > 0 ? v : 0;
}

function refreshProbSummary(){
  const total = CHAOS_FACES.reduce((s, f) => s + (chaosProb[f.key] || 0), 0);
  const normal = Math.max(0, 100 - total);
  const fmt = fmtPct;

  $('#prob-normal').textContent  = fmt(normal) + '%';
  $('#prob-special').textContent = fmt(total) + '%';
  $('#prob-warn').hidden = total <= 100;
  $('#chaos-next').disabled = total > 100;

  $('#prob-legend').innerHTML = CHAOS_FACES.map(f => `
    <div class="legend-row">
      <span class="face-badge" style="background:${f.color}">${f.icon}</span>
      <span class="lg-name">${f.name}: ${f.desc}</span>
      <span class="lg-pct" style="color:${f.color}">${fmt(chaosProb[f.key] || 0)}%</span>
    </div>`).join('');
}

$('#chaos-back').addEventListener('click', () => { audio.click(); showScreen('menu'); });
$('#chaos-next').addEventListener('click', () => { audio.click(); showScreen('setup'); });

/* ---- setup pemain ---- */
function buildSetupUI(){
  $('#slot-list').innerHTML = PLAY_ORDER.map(color => {
    const f = FACTIONS[color];
    return `
      <div class="slot-row" data-color="${color}">
        <span class="slot-figure">${characterOf(color)}</span>
        <span class="slot-info"><strong>${f.name}</strong><small>${f.warna} · ${f.base}</small></span>
        <button class="slot-toggle" data-color="${color}">HUMAN</button>
      </div>`;
  }).join('');

  $$('#slot-list .slot-toggle').forEach(btn => btn.addEventListener('click', () => {
    audio.click();
    const c = btn.dataset.color;
    slotState[c] = SLOT_CYCLE[slotState[c]];
    refreshSlots();
  }));
  refreshSlots();
}

function refreshSlots(){
  $$('#slot-list .slot-toggle').forEach(btn => {
    const c = btn.dataset.color, st = slotState[c];
    btn.dataset.state = st;
    btn.textContent = SLOT_LABEL[st];
    $(`#slot-list .slot-row[data-color="${c}"]`).classList.toggle('is-off', st === 'disable');
  });
  $('#setup-start').disabled = Object.values(slotState).filter(s => s !== 'disable').length < 2;
}

$('#setup-back').addEventListener('click', () => {
  audio.click();
  showScreen(selectedMode === 'chaos' ? 'chaos' : 'menu');
});
$('#setup-start').addEventListener('click', () => {
  audio.click();
  showScreen('game');
  game.init(selectedMode, { ...slotState });
});

/* ---- menu dalam permainan ---- */
const gameMenu = $('#game-menu');
$('#btn-menu').addEventListener('click', () => { audio.click(); gameMenu.hidden = false; });
$('#mi-close').addEventListener('click', () => { audio.click(); gameMenu.hidden = true; });
gameMenu.addEventListener('click', e => { if (e.target === gameMenu) gameMenu.hidden = true; });
$('#mi-sound').addEventListener('click', e => {
  audio.enabled = !audio.enabled;
  e.currentTarget.textContent = audio.enabled ? '🔊 Suara: Aktif' : '🔇 Suara: Mati';
  if (audio.enabled) audio.click();
});
$('#mi-restart').addEventListener('click', () => {
  audio.click(); gameMenu.hidden = true;
  game.init(selectedMode, { ...slotState });
});
$('#mi-home').addEventListener('click', () => {
  audio.click(); gameMenu.hidden = true;
  game.state = 'over'; dom.modalWin.hidden = true;
  showScreen('menu');
});

/* ---- modal kemenangan ---- */
$('#btn-rematch').addEventListener('click', () => {
  audio.click(); dom.modalWin.hidden = true;
  game.init(selectedMode, { ...slotState });
});
$('#btn-to-menu').addEventListener('click', () => {
  audio.click(); dom.modalWin.hidden = true;
  showScreen('menu');
});

/* ---- keyboard ---- */
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && dom.screens.game.classList.contains('is-active')) {
    e.preventDefault();
    if (game.state === 'idle' && !game.current.isBot) { audio.click(); game.doRoll(); }
  }
});

buildProbUI();
buildSetupUI();

/* hook debug */
window.LUDQUEEN = { game, CONFIG, CHAOS_FACES, chaosProb, TRACK, START_INDEX, HOME_PATH };
