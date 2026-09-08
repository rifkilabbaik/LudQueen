'use strict';
/* =========================================================================
   LUDQueen 👑 — script.js
   Vanilla JS · turn-based state machine · tanpa framework eksternal.

   Struktur:
     1. KONFIGURASI (termasuk probabilitas Dadu Chaos)
     2. PATH MAPPING (array koordinat papan 15x15)
     3. AudioFX  (Web Audio API)
     4. Piece / Player (OOP)
     5. LudQueenGame (engine + renderer + animasi)
     6. UI / Screen flow
   ========================================================================= */


/* =========================================================================
   1. KONFIGURASI
   ========================================================================= */

const CONFIG = {
  boardSize:        15,
  piecesPerPlayer:  4,
  /* 0..50  = 51 petak jalur utama
     51..55 = 5 petak home column
     56     = HOME FINISH                     */
  stepsToFinish:    56,
  hopDurationMs:    170,   // durasi lompat antar petak
  cloudStepMs:      95,    // durasi per petak saat naik awan (dadu x2)
  botThinkMs:       650,
  autoPlaySingleMoveMs: 320,
  diceSpinMs:       620,
  /* pengali global semua jeda animasi — pakai 0 untuk simulasi/uji cepat */
  animationScale:   1,
  extraTurnOnSix:   true,
  maxConsecutiveSixes: 3,  // 3x enam beruntun -> giliran hangus
};

/* ---- PROBABILITAS DADU CHAOS (silakan diubah bebas) --------------------
   Nilai apa pun boleh; engine menormalkannya jadi 100%.               */
const CHAOS_DICE_CONFIG = {
  faceWeight: {
    number: 60,   // dadu angka biasa 1-6
    x2:     14,   // angka x2 + animasi naik awan
    attack: 11,   // tembak 1 bidak lawan mana saja
    shield: 10,   // perisai 1x pakai
    angel:   5,   // semua bidak keluar markas + giliran ekstra
  },
  /* bobot angka untuk face "number" */
  numberWeight:   { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 14 },
  /* bobot angka dasar untuk face "x2" (dikali 2 saat dipakai) */
  x2NumberWeight: { 1: 10, 2: 12, 3: 14, 4: 12, 5: 8, 6: 6 },
};

/* ---- FAKSI ------------------------------------------------------------- */
const FACTIONS = {
  red: {
    key:'knight', name:'Knight', base:'Base Kerajaan', spriteClass:'piece-knight',
    emoji:'⚔️', captureFx:'⚔️', captureName:'Tebasan Pedang',
    projectile:'💣', projectileName:'Canon', projectileCount:1, impact:'💥',
  },
  green: {
    key:'elf', name:'Elf', base:'Base Hutan', spriteClass:'piece-elf',
    emoji:'🏹', captureFx:'🏹', captureName:'Bidikan Panah',
    projectile:'🏹', projectileName:'Hujan Panah', projectileCount:6, impact:'💢',
  },
  blue: {
    key:'witch', name:'Witch', base:'Base Langit', spriteClass:'piece-witch',
    emoji:'🪄', captureFx:'✨', captureName:'Sihir Terkutuk',
    projectile:'🧪', projectileName:'Hujan Ramuan Sihir', projectileCount:6, impact:'🔮',
  },
  yellow: {
    key:'dragon', name:'Dragon', base:'Base Pegunungan', spriteClass:'piece-dragon',
    emoji:'🔥', captureFx:'🔥', captureName:'Napas Api',
    projectile:'🔥', projectileName:'Hujan Api', projectileCount:6, impact:'🌋',
  },
};

const CHAOS_FACE_META = {
  number: { icon:'🎲', label:'Angka 1-6',  desc:'Gerak normal' },
  x2:     { icon:'☁️', label:'Dadu x2',    desc:'Angka dikali 2 · naik awan' },
  attack: { icon:'🎯', label:'Dadu Attack',desc:'Pulangkan 1 bidak lawan' },
  shield: { icon:'🛡️', label:'Dadu Shield',desc:'Perisai kebal 1x pakai' },
  angel:  { icon:'👼', label:'Dadu Angel', desc:'Semua bidak keluar + giliran ekstra' },
};

const PLAY_ORDER = ['red', 'green', 'yellow', 'blue']; // searah jarum jam


/* =========================================================================
   2. PATH MAPPING — papan 15x15, koordinat [x, y] (kolom, baris)
   ========================================================================= */

/* Jalur utama 52 petak. Index 0 = petak start MERAH, lalu searah jarum jam. */
const TRACK = [
  [1,6],[2,6],[3,6],[4,6],[5,6],            //  0- 4  lengan kiri (baris atas)
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],      //  5-10  lengan atas (kolom kiri)
  [7,0],                                    // 11     puncak
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],      // 12-17  lengan atas (kolom kanan)
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6], // 18-23  lengan kanan (baris atas)
  [14,7],                                   // 24     ujung kanan
  [14,8],[13,8],[12,8],[11,8],[10,8],[9,8], // 25-30  lengan kanan (baris bawah)
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14], // 31-36  lengan bawah (kolom kanan)
  [7,14],                                   // 37     dasar
  [6,14],[6,13],[6,12],[6,11],[6,10],[6,9], // 38-43  lengan bawah (kolom kiri)
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],      // 44-49  lengan kiri (baris bawah)
  [0,7],                                    // 50     ujung kiri
  [0,6],                                    // 51     penutup lingkaran
];

/* offset petak start tiap warna pada TRACK */
const START_INDEX = { red:0, green:13, yellow:26, blue:39 };

/* petak aman (start + petak ke-8 sesudah start) */
const SAFE_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/* home column: 5 petak menuju pusat */
const HOME_PATH = {
  red:    [[1,7],[2,7],[3,7],[4,7],[5,7]],
  green:  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7]],
  blue:   [[7,13],[7,12],[7,11],[7,10],[7,9]],
};

const HOME_ARROW = { red:'❯', green:'❯', yellow:'❮', blue:'❮' };
const HOME_ARROW_CHAR = { red:'➜', green:'⬇', yellow:'⬅', blue:'⬆' };

/* 4 slot bidak di dalam markas */
const YARD_SLOTS = {
  red:    [[1.6,1.6],[3.9,1.6],[1.6,3.9],[3.9,3.9]],
  green:  [[10.6,1.6],[12.9,1.6],[10.6,3.9],[12.9,3.9]],
  blue:   [[1.6,10.6],[3.9,10.6],[1.6,12.9],[3.9,12.9]],
  yellow: [[10.6,10.6],[12.9,10.6],[10.6,12.9],[12.9,12.9]],
};

/* titik tengah markas — asal proyektil serangan */
const YARD_CENTER = { red:[2.75,2.75], green:[11.75,2.75], blue:[2.75,11.75], yellow:[11.75,11.75] };

/* posisi bidak yang sudah finish (di dalam kotak pusat) */
const FINISH_SLOTS = {
  red:    [[6.55,6.75],[6.55,7.25],[6.9,6.6],[6.9,7.4]],
  green:  [[7.25,6.55],[6.75,6.55],[7.4,6.9],[6.6,6.9]],
  yellow: [[8.45,7.25],[8.45,6.75],[8.1,7.4],[8.1,6.6]],
  blue:   [[6.75,8.45],[7.25,8.45],[6.6,8.1],[7.4,8.1]],
};

/* index TRACK -> warna pemilik home column (untuk pewarnaan petak start) */
const TRACK_INDEX_BY_KEY = (() => {
  const m = new Map();
  TRACK.forEach(([x,y], i) => m.set(x + ',' + y, i));
  return m;
})();


/* =========================================================================
   3. AUDIO FX — Web Audio API (tanpa file audio eksternal)
   ========================================================================= */

class AudioFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  _ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return null; }
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  /** nada tunggal sederhana */
  tone({ freq = 440, dur = 0.12, type = 'square', vol = 0.16, slideTo = null, delay = 0 }) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  noise({ dur = 0.25, vol = 0.2, delay = 0, filterFreq = 900 }) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = filterFreq;
    const gain = ctx.createGain(); gain.gain.value = vol;
    src.connect(flt).connect(gain).connect(ctx.destination);
    src.start(t0);
  }
  seq(notes) { notes.forEach(n => this.tone(n)); }

  click()   { this.tone({ freq: 660, dur: 0.06, vol: 0.12 }); }
  rolling() { for (let i = 0; i < 5; i++) this.tone({ freq: 240 + Math.random()*320, dur: 0.05, vol: 0.09, delay: i*0.075, type:'triangle' }); }
  diceStop(){ this.seq([{freq:520,dur:.08},{freq:780,dur:.12,delay:.07}]); }
  hop()     { this.tone({ freq: 520, dur: 0.07, vol: 0.10, type:'triangle', slideTo: 760 }); }
  capture() { this.noise({dur:.3,vol:.22,filterFreq:1600}); this.seq([{freq:300,dur:.12,slideTo:110,type:'sawtooth',vol:.18}]); }
  shield()  { this.seq([{freq:520,dur:.1,type:'sine'},{freq:780,dur:.1,type:'sine',delay:.09},{freq:1040,dur:.2,type:'sine',delay:.18}]); }
  angel()   { [523,659,784,1046,1318].forEach((f,i)=>this.tone({freq:f,dur:.28,type:'sine',vol:.14,delay:i*0.09})); }
  cloud()   { this.tone({freq:300,dur:.5,type:'sine',vol:.13,slideTo:900}); }
  attack()  { this.tone({freq:180,dur:.22,type:'sawtooth',vol:.2,slideTo:60}); this.noise({dur:.35,vol:.2,filterFreq:700,delay:.05}); }
  finish()  { [659,784,988,1318].forEach((f,i)=>this.tone({freq:f,dur:.16,type:'square',vol:.15,delay:i*0.1})); }
  win()     { [523,659,784,1046,784,1046,1318].forEach((f,i)=>this.tone({freq:f,dur:.22,type:'square',vol:.15,delay:i*0.14})); }
  deny()    { this.seq([{freq:200,dur:.1,type:'square',vol:.14},{freq:140,dur:.16,type:'square',vol:.14,delay:.09}]); }
}


/* =========================================================================
   4. OOP — Piece & Player
   ========================================================================= */

class Piece {
  /**
   * p (progress):  -1 = di markas
   *                 0..50  = jalur utama
   *                 51..55 = home column
   *                 56     = FINISH
   */
  constructor(player, slot) {
    this.player = player;
    this.color  = player.color;
    this.slot   = slot;
    this.id     = `${player.color}-${slot}`;
    this.p      = -1;
    this.shield = false;
    this.el     = null;
  }
  get inBase()    { return this.p < 0; }
  get finished()  { return this.p >= CONFIG.stepsToFinish; }
  get onTrack()   { return this.p >= 0 && this.p <= 50; }
  get inHomeRun() { return this.p >= 51 && this.p < CONFIG.stepsToFinish; }
  get trackIndex(){ return this.onTrack ? (START_INDEX[this.color] + this.p) % TRACK.length : -1; }
  get onSafeCell(){ return this.onTrack && SAFE_INDEXES.has(this.trackIndex); }

  /** koordinat papan [x,y] untuk nilai progress tertentu */
  coordAt(p) {
    if (p < 0)  return YARD_SLOTS[this.color][this.slot];
    if (p <= 50) { const [x, y] = TRACK[(START_INDEX[this.color] + p) % TRACK.length]; return [x, y]; }
    if (p < CONFIG.stepsToFinish) return HOME_PATH[this.color][p - 51];
    return FINISH_SLOTS[this.color][this.slot];
  }
  get coord() { return this.coordAt(this.p); }
}

class Player {
  constructor(color, kind) {
    this.color   = color;                 // red | green | yellow | blue
    this.kind    = kind;                  // 'human' | 'bot'
    this.faction = FACTIONS[color];
    this.pieces  = Array.from({ length: CONFIG.piecesPerPlayer }, (_, i) => new Piece(this, i));
  }
  get isBot()      { return this.kind === 'bot'; }
  get finishedCount(){ return this.pieces.filter(p => p.finished).length; }
  get hasWon()     { return this.finishedCount === CONFIG.piecesPerPlayer; }
  get piecesInBase(){ return this.pieces.filter(p => p.inBase); }
  get piecesOnBoard(){ return this.pieces.filter(p => p.onTrack || p.inHomeRun); }
}


/* =========================================================================
   5. ENGINE — LudQueenGame
   ========================================================================= */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function weightedPick(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries[entries.length - 1][0];
}

class LudQueenGame {
  constructor(dom, audio) {
    this.dom   = dom;
    this.audio = audio;
    this.mode  = 'classic';
    this.players = [];
    this.turnIdx = 0;
    this.state = 'idle';        // idle | rolling | animating | select-move | select-target | select-shield | over
    this.pendingMoves = [];
    this.sixStreak = 0;
    this.currentFace = null;
    this._boardBuilt = false;
  }

  /* ---------------- setup ---------------- */

  init(mode, slots) {
    this.mode = mode;
    this.players = PLAY_ORDER
      .filter(c => slots[c] !== 'disable')
      .map(c => new Player(c, slots[c]));
    this.turnIdx = 0;
    this.sixStreak = 0;
    this.state = 'idle';
    this.currentFace = null;

    if (!this._boardBuilt) { this.buildBoard(); this._boardBuilt = true; }
    this.buildPieces();
    this.buildScoreboard();
    this.renderChaosLegend();
    this.dom.logList.innerHTML = '';
    this.dom.modalWin.hidden = true;
    this.log(`Mode ${mode === 'chaos' ? 'Ludo Chaos 🌀' : 'Ludo Classic 🎲'} dimulai!`, true);
    this.renderAll();
    this.beginTurn();
  }

  /** menggambar 15x15 petak + penanda jalur */
  buildBoard() {
    const grid = this.dom.boardGrid;
    grid.innerHTML = '';
    const homeLookup = new Map();
    for (const color of PLAY_ORDER) {
      HOME_PATH[color].forEach(([x, y]) => homeLookup.set(x + ',' + y, color));
    }
    const startCellOf = {};
    for (const color of PLAY_ORDER) {
      const [x, y] = TRACK[START_INDEX[color]];
      startCellOf[x + ',' + y] = color;
    }

    for (let y = 0; y < CONFIG.boardSize; y++) {
      for (let x = 0; x < CONFIG.boardSize; x++) {
        const key = x + ',' + y;
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.xy = key;

        const trackIdx = TRACK_INDEX_BY_KEY.get(key);
        const homeColor = homeLookup.get(key);

        if (trackIdx !== undefined) {
          cell.classList.add('cell-path');
          if (SAFE_INDEXES.has(trackIdx)) cell.classList.add('cell-safe');
          const sc = startCellOf[key];
          if (sc) cell.classList.add('cell-start', 's-' + sc);
        } else if (homeColor) {
          cell.classList.add('cell-home', 'h-' + homeColor);
          cell.dataset.arrow = HOME_ARROW_CHAR[homeColor];
        } else {
          cell.classList.add('cell-void');
        }
        grid.appendChild(cell);
      }
    }
  }

  buildPieces() {
    const layer = this.dom.pieceLayer;
    layer.innerHTML = '';
    for (const player of this.players) {
      for (const piece of player.pieces) {
        const el = document.createElement('div');
        el.className = 'piece';
        el.dataset.color = piece.color;
        el.dataset.id = piece.id;
        el.innerHTML =
          `<div class="piece-inner piece-art ${player.faction.spriteClass}">` +
            `<span class="piece-emoji">${player.faction.emoji}</span>` +
            `<span class="shield-badge">🛡️</span>` +
          `</div>` +
          `<span class="cloud">☁️</span>`;
        el.addEventListener('click', () => this.onPieceClick(piece));
        piece.el = el;
        layer.appendChild(el);
      }
    }
  }

  buildScoreboard() {
    this.dom.scoreboard.innerHTML = this.players.map(p => `
      <div class="score-row" data-color="${p.color}">
        <span class="score-dot ${p.color}"></span>
        <span class="score-name">${p.faction.name}</span>
        <span class="score-tag">${p.isBot ? 'BOT' : 'YOU'}</span>
        <span class="score-pips">${'<i class="score-pip"></i>'.repeat(CONFIG.piecesPerPlayer)}</span>
      </div>`).join('');
  }

  renderChaosLegend() {
    const box = this.dom.chaosLegend;
    if (this.mode !== 'chaos') { box.hidden = true; return; }
    box.hidden = false;
    const w = CHAOS_DICE_CONFIG.faceWeight;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    this.dom.chaosLegendList.innerHTML = Object.keys(w).map(k => {
      const m = CHAOS_FACE_META[k];
      const pct = Math.round((w[k] / total) * 100);
      return `<li><span>${m.icon}</span><b>${m.label}</b><span class="lg-pct">${pct}%</span></li>`;
    }).join('');
  }

  /* ---------------- helpers ---------------- */

  get current()  { return this.players[this.turnIdx]; }
  allPieces()    { return this.players.flatMap(p => p.pieces); }
  isHumanTurn()  { return !this.current.isBot; }

  log(text, hot = false) {
    const li = document.createElement('li');
    if (hot) li.className = 'hot';
    li.textContent = text;
    this.dom.logList.appendChild(li);
    this.dom.logList.scrollTop = this.dom.logList.scrollHeight;
    while (this.dom.logList.children.length > 40) this.dom.logList.removeChild(this.dom.logList.firstChild);
  }

  toast(text, ms = 1500) {
    const t = this.dom.toast;
    t.textContent = text;
    t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  hint(text) { this.dom.actionHint.textContent = text; }

  /** jeda animasi yang menghormati CONFIG.animationScale */
  wait(ms) { return sleep(Math.max(0, ms * CONFIG.animationScale)); }

  /* ---------------- RENDER ---------------- */

  renderAll() {
    this.renderPieces();
    this.renderTurnBanner();
    this.renderScoreboard();
    this.renderYardGlow();
  }

  renderPieces() {
    /* hitung offset tumpukan agar bidak di petak sama tidak saling tutup */
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
        const spread = n > 1 ? 0.42 : 0;
        const dx = spread * (i - (n - 1) / 2);
        const dy = n > 1 ? 0.14 * (i % 2 ? 1 : -1) : 0;
        /* bidak bertumpuk dikecilkan agar tidak saling menutupi area kliknya */
        piece.el.classList.toggle('is-stacked', n > 1);
        piece.el.style.zIndex = String(2 + i);
        this.placePiece(piece, dx, dy);
      });
    }
    for (const piece of this.allPieces()) {
      piece.el.classList.toggle('has-shield', piece.shield);
      piece.el.classList.toggle('is-finished', piece.finished);
    }
  }

  placePiece(piece, dx = 0, dy = 0) {
    const [x, y] = piece.coord;
    this.setPiecePos(piece, x + dx, y + dy);
  }

  setPiecePos(piece, x, y) {
    piece.el.style.left = ((x + 0.5) / CONFIG.boardSize * 100) + '%';
    piece.el.style.top  = ((y + 0.5) / CONFIG.boardSize * 100) + '%';
  }

  renderTurnBanner() {
    const p = this.current;
    const b = this.dom.turnBanner;
    b.className = 'turn-banner t-' + p.color;
    this.dom.turnAvatar.textContent = p.faction.emoji;
    this.dom.turnAvatar.className = 'turn-avatar piece-art ' + p.faction.spriteClass;
    this.dom.turnName.textContent = `${p.faction.name}`;
    this.dom.turnRole.textContent = p.isBot ? `${p.faction.base} · BOT` : `${p.faction.base} · giliranmu`;
  }

  renderScoreboard() {
    $$('.score-row', this.dom.scoreboard).forEach(row => {
      const color = row.dataset.color;
      const player = this.players.find(p => p.color === color);
      row.classList.toggle('is-turn', player === this.current);
      $$('.score-pip', row).forEach((pip, i) => pip.classList.toggle('done', i < player.finishedCount));
    });
  }

  renderYardGlow() {
    const playing = new Set(this.players.map(p => p.color));
    $$('.yard', this.dom.board).forEach(y => {
      y.classList.toggle('is-active', y.dataset.color === this.current.color);
      y.classList.toggle('is-disabled', !playing.has(y.dataset.color));
    });
  }

  clearHighlights() {
    for (const piece of this.allPieces()) {
      piece.el.classList.remove('is-selectable', 'is-target');
    }
  }

  setRollEnabled(on) {
    this.dom.btnRoll.disabled = !on;
  }

  /* ---------------- DADU ---------------- */

  /** @returns {{type:string, steps:number, base:number}} */
  rollFace() {
    if (this.mode === 'classic') {
      const n = Number(weightedPick(CHAOS_DICE_CONFIG.numberWeight));
      // classic memakai dadu uniform murni
      const uniform = 1 + Math.floor(Math.random() * 6);
      return { type: 'number', base: uniform, steps: uniform, _unused: n };
    }
    const type = weightedPick(CHAOS_DICE_CONFIG.faceWeight);
    if (type === 'number') {
      const n = Number(weightedPick(CHAOS_DICE_CONFIG.numberWeight));
      return { type: 'number', base: n, steps: n };
    }
    if (type === 'x2') {
      const n = Number(weightedPick(CHAOS_DICE_CONFIG.x2NumberWeight));
      return { type: 'x2', base: n, steps: n * 2 };
    }
    return { type, base: 0, steps: 0 };
  }

  renderDiceFace(face) {
    const d = this.dom.dice, f = this.dom.diceFace;
    d.className = 'dice';
    f.className = 'dice-face';
    if (!face) { f.textContent = '🎲'; return; }
    if (face.type === 'number') {
      f.classList.add('is-number');
      f.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][face.base - 1];
    } else if (face.type === 'x2') {
      d.classList.add('face-x2');
      f.innerHTML = `☁️<br><span style="font-size:11px">${face.base}×2</span>`;
    } else {
      d.classList.add('face-' + face.type);
      f.textContent = CHAOS_FACE_META[face.type].icon;
    }
  }

  /* ---------------- ALUR GILIRAN ---------------- */

  beginTurn() {
    if (this.state === 'over') return;
    this.clearHighlights();
    this.renderAll();
    this.state = 'idle';
    this.currentFace = null;
    this.renderDiceFace(null);

    if (this.current.isBot) {
      this.setRollEnabled(false);
      this.hint(`${this.current.faction.name} (BOT) sedang berpikir...`);
      setTimeout(() => this.doRoll(), CONFIG.botThinkMs * CONFIG.animationScale);
    } else {
      this.setRollEnabled(true);
      this.hint('Lempar dadu untuk bergerak.');
    }
  }

  async doRoll() {
    if (this.state !== 'idle') return;
    this.state = 'rolling';
    this.setRollEnabled(false);
    this.clearHighlights();

    this.audio.rolling();
    this.dom.dice.classList.add('is-rolling');
    // preview acak biar terasa berputar
    const previewTimer = setInterval(() => {
      this.renderDiceFace({ type:'number', base: 1 + Math.floor(Math.random()*6) });
      this.dom.dice.classList.add('is-rolling');
    }, Math.max(16, 80 * CONFIG.animationScale));

    await this.wait(CONFIG.diceSpinMs);
    clearInterval(previewTimer);
    this.dom.dice.classList.remove('is-rolling');

    const face = this.rollFace();
    this.currentFace = face;
    this.renderDiceFace(face);
    this.audio.diceStop();

    await this.wait(180);
    await this.resolveFace(face);
  }

  async resolveFace(face) {
    const player = this.current;
    const fname = player.faction.name;

    /* --- aturan 3x enam beruntun --- */
    if (face.type === 'number' && face.base === 6) {
      this.sixStreak++;
      if (this.sixStreak >= CONFIG.maxConsecutiveSixes) {
        this.log(`${fname} melempar 6 sebanyak ${CONFIG.maxConsecutiveSixes}x — giliran hangus!`, true);
        this.toast('Tiga kali 6 beruntun! Giliran hangus 😵');
        this.audio.deny();
        this.sixStreak = 0;
        await this.wait(700);
        return this.endTurn(false);
      }
    } else if (face.type !== 'x2') {
      this.sixStreak = 0;
    }

    switch (face.type) {
      case 'number':
      case 'x2':
        return this.resolveNumberFace(face);
      case 'angel':
        return this.resolveAngel();
      case 'attack':
        return this.resolveAttack();
      case 'shield':
        return this.resolveShield();
    }
  }

  /* ---- face angka / x2 ---- */
  async resolveNumberFace(face) {
    const player = this.current;
    const moves = this.getLegalMoves(player, face);

    if (face.type === 'x2') {
      this.log(`${player.faction.name} dapat Dadu x2 → ${face.base} × 2 = ${face.steps} langkah ☁️`, true);
      this.toast(`DADU x2! ${face.base} × 2 = ${face.steps} langkah ☁️`);
      await this.wait(600);
    } else {
      this.log(`${player.faction.name} melempar ${face.base}.`);
    }

    if (moves.length === 0) {
      this.hint('Tidak ada langkah yang bisa dijalankan.');
      this.audio.deny();
      this.toast('Tidak ada gerakan yang sah 😔', 1100);
      await this.wait(850);
      const extra = face.type === 'number' && face.base === 6 && CONFIG.extraTurnOnSix;
      return this.endTurn(extra);
    }

    if (player.isBot) {
      const best = this.chooseBotMove(moves, face);
      await this.wait(280);
      return this.executeMove(best, face);
    }

    if (moves.length === 1) {
      this.hint('Satu langkah tersedia — otomatis dijalankan.');
      await this.wait(CONFIG.autoPlaySingleMoveMs);
      return this.executeMove(moves[0], face);
    }

    this.state = 'select-move';
    this.pendingMoves = moves;
    this.hint(`Pilih bidak untuk maju ${face.steps} langkah.`);
    moves.forEach(m => m.piece.el.classList.add('is-selectable'));
  }

  /**
   * Daftar langkah legal.
   * @returns {{piece:Piece, from:number, to:number, releases:boolean}[]}
   */
  getLegalMoves(player, face) {
    const steps = face.steps;
    const moves = [];
    let releaseOffered = false;
    const seenProgress = new Set();   // hindari opsi kembar di petak yang sama
    for (const piece of player.pieces) {
      if (piece.finished) continue;
      if (piece.inBase) {
        /* Keluar markas hanya jika total langkah tepat 6.
           Semua bidak di markas identik, jadi cukup tawarkan SATU pilihan
           agar pemain tidak disodori 4 opsi yang sama persis. */
        if (steps === 6 && !releaseOffered) {
          moves.push({ piece, from: -1, to: 0, releases: true });
          releaseOffered = true;
        }
        continue;
      }
      /* dua bidak sewarna di petak yang sama = pilihan yang identik hasilnya,
         cukup tawarkan satu supaya tidak saling menutupi saat diklik */
      if (seenProgress.has(piece.p)) continue;
      const to = piece.p + steps;
      if (to <= CONFIG.stepsToFinish) {
        moves.push({ piece, from: piece.p, to, releases: false });
        seenProgress.add(piece.p);
      }
    }
    return moves;
  }

  /* ---- eksekusi langkah ---- */
  async executeMove(move, face) {
    this.state = 'animating';
    this.clearHighlights();
    const { piece } = move;

    if (move.releases) {
      this.audio.hop();
      piece.p = 0;
      this.spawnFx(piece.coord, '✨', 'fx-burst');
      this.renderPieces();
      this.log(`${piece.player.faction.name} mengeluarkan bidak dari markas.`);
      await this.wait(320);
    } else {
      await this.animateTravel(piece, move.from, move.to, face.type === 'x2');
    }

    const result = await this.resolveLanding(piece);

    if (this.checkWin(piece.player)) return;

    let extra = result.extraTurn;
    if (face.type === 'number' && face.base === 6 && CONFIG.extraTurnOnSix) extra = true;
    if (move.releases) extra = true;   // keluar markas dengan 6 -> lempar lagi

    await this.wait(200);
    this.endTurn(extra);
  }

  /** animasi lompat/naik awan petak demi petak */
  async animateTravel(piece, from, to, viaCloud) {
    piece.el.classList.add('is-moving');
    if (viaCloud) { piece.el.classList.add('on-cloud'); this.audio.cloud(); }
    const dur = viaCloud ? CONFIG.cloudStepMs : CONFIG.hopDurationMs;
    piece.el.style.setProperty('--hop-dur', dur + 'ms');
    piece.el.style.transitionDuration = `${dur}ms, ${dur}ms`;

    for (let p = from + 1; p <= to; p++) {
      piece.p = p;
      const [x, y] = piece.coordAt(p);
      this.setPiecePos(piece, x, y);
      if (!viaCloud) {
        piece.el.classList.remove('hop'); void piece.el.offsetWidth; piece.el.classList.add('hop');
        this.audio.hop();
      }
      await this.wait(dur);
    }
    piece.el.classList.remove('hop', 'on-cloud', 'is-moving');
    piece.el.style.transitionDuration = '';
    this.renderPieces();
  }

  /** cek tangkapan / finish setelah mendarat */
  async resolveLanding(piece) {
    const out = { captured: false, extraTurn: false, shieldBlocked: false };

    /* --- sampai HOME FINISH --- */
    if (piece.finished) {
      if (piece.shield) {
        piece.shield = false;
        this.log(`Perisai ${piece.player.faction.name} lenyap saat menyentuh Home Finish.`);
      }
      this.audio.finish();
      this.spawnFx(piece.coord, '🏆', 'fx-burst');
      this.spawnLabel(piece.coord, 'HOME!');
      this.log(`${piece.player.faction.name} membawa 1 bidak pulang ke singgasana! 🏆`, true);
      this.toast('Bidak sampai di HOME! Giliran ekstra 🎉');
      out.extraTurn = true;
      this.renderPieces(); this.renderScoreboard();
      await this.wait(600);
      return out;
    }

    if (!piece.onTrack) { this.renderPieces(); return out; }

    const idx = piece.trackIndex;
    if (SAFE_INDEXES.has(idx)) { this.renderPieces(); return out; }

    const victims = this.allPieces().filter(o =>
      o.color !== piece.color && o.onTrack && o.trackIndex === idx);

    if (victims.length === 0) { this.renderPieces(); return out; }

    for (const victim of victims) {
      if (victim.shield) {
        victim.shield = false;
        out.shieldBlocked = true;
        this.audio.shield();
        this.spawnFx(victim.coord, '🛡️', 'fx-burst');
        this.spawnLabel(victim.coord, 'SHIELD BREAK!');
        this.log(`Perisai ${victim.player.faction.name} menahan ${piece.player.faction.captureName}!`, true);
      } else {
        await this.playCaptureFx(piece, victim);
        this.sendHome(victim);
        out.captured = true;
      }
    }

    if (out.captured) {
      if (piece.shield) {
        piece.shield = false;
        this.log(`Perisai ${piece.player.faction.name} luntur setelah menangkap lawan.`);
      }
      out.extraTurn = true;
      this.toast('Tangkapan! Giliran ekstra ⚔️');
    }
    this.renderPieces();
    await this.wait(320);
    return out;
  }

  sendHome(piece) {
    piece.p = -1;
    piece.shield = false;
    this.renderPieces();
  }

  checkWin(player) {
    if (!player.hasWon) return false;
    this.state = 'over';
    this.clearHighlights();
    this.setRollEnabled(false);
    this.audio.win();
    this.log(`👑 ${player.faction.name} MEMENANGKAN pertempuran!`, true);
    this.dom.winTitle.textContent = `${player.faction.name} Menang!`;
    this.dom.winSub.textContent = `${player.faction.base} merebut singgasana LUDQueen.`;
    this.dom.modalWin.hidden = false;
    return true;
  }

  endTurn(extraTurn) {
    if (this.state === 'over') return;
    this.clearHighlights();
    if (!extraTurn) {
      this.sixStreak = 0;
      let guard = 0;
      do {
        this.turnIdx = (this.turnIdx + 1) % this.players.length;
      } while (this.current.hasWon && ++guard < this.players.length);
    } else {
      this.hint('Giliran ekstra!');
    }
    this.beginTurn();
  }

  /* ---------------- FACE: ANGEL 👼 ---------------- */
  async resolveAngel() {
    this.state = 'animating';
    const player = this.current;
    const inBase = player.piecesInBase;
    this.audio.angel();
    this.toast('DADU ANGEL 👼 — seluruh pasukan dipanggil keluar!');
    this.log(`${player.faction.name} mendapat Dadu Angel 👼`, true);

    this.spawnLabel(YARD_CENTER[player.color], '👼 ANGEL CALL');
    await this.wait(500);

    if (inBase.length === 0) {
      this.log('Semua bidak sudah di luar markas — hanya dapat giliran ekstra.');
    } else {
      for (const piece of inBase) {
        piece.p = 0;
        this.renderPieces();
        this.spawnFx(piece.coord, '✨', 'fx-burst');
        this.audio.hop();
        await this.wait(190);
      }
      /* bidak lawan yang berdiri di petak start ikut tersapu */
      const startIdx = START_INDEX[player.color];
      if (!SAFE_INDEXES.has(startIdx)) {
        const victims = this.allPieces().filter(o => o.color !== player.color && o.onTrack && o.trackIndex === startIdx);
        for (const v of victims) { if (!v.shield) this.sendHome(v); else v.shield = false; }
      }
      this.log(`${inBase.length} bidak ${player.faction.name} terbang ke petak start.`);
    }

    this.renderPieces();
    await this.wait(450);
    this.endTurn(true);   // giliran ekstra
  }

  /* ---------------- FACE: ATTACK 🎯 ---------------- */
  async resolveAttack() {
    const player = this.current;
    const targets = this.getAttackTargets(player);
    this.log(`${player.faction.name} mendapat Dadu Attack 🎯`, true);

    if (targets.length === 0) {
      this.toast('Tidak ada bidak lawan di papan 🎯');
      this.audio.deny();
      await this.wait(800);
      return this.endTurn(false);
    }

    if (player.isBot) {
      await this.wait(500);
      /* bot memilih bidak lawan paling jauh progres-nya & tanpa perisai */
      const sorted = [...targets].sort((a, b) =>
        (a.shield === b.shield) ? b.p - a.p : (a.shield ? 1 : -1));
      return this.performAttack(sorted[0]);
    }

    this.state = 'select-target';
    this.hint('🎯 Pilih 1 bidak lawan untuk dipulangkan ke markas.');
    this.toast('DADU ATTACK! Pilih target lawan 🎯');
    targets.forEach(t => t.el.classList.add('is-target'));
  }

  getAttackTargets(player) {
    return this.allPieces().filter(o =>
      o.color !== player.color && (o.onTrack || o.inHomeRun) && !o.finished);
  }

  async performAttack(target) {
    this.state = 'animating';
    this.clearHighlights();
    const attacker = this.current;
    const fac = attacker.faction;

    this.toast(`${fac.name} melepaskan ${fac.projectileName}!`);
    this.log(`${fac.name} menembakkan ${fac.projectileName} ke ${target.player.faction.name}.`, true);

    await this.playProjectileFx(attacker.color, target.coord, fac);

    if (target.shield) {
      target.shield = false;
      this.audio.shield();
      this.spawnFx(target.coord, '🛡️', 'fx-burst');
      this.spawnLabel(target.coord, 'SHIELD BREAK!');
      this.log(`Perisai ${target.player.faction.name} hancur menahan serangan!`, true);
    } else {
      this.audio.capture();
      this.spawnFx(target.coord, fac.impact, 'fx-burst');
      this.spawnLabel(target.coord, 'KO!');
      this.sendHome(target);
      this.log(`Bidak ${target.player.faction.name} dipulangkan ke markas!`, true);
    }
    this.dom.board.classList.add('is-shaking');
    setTimeout(() => this.dom.board.classList.remove('is-shaking'), 700);

    this.renderPieces();
    await this.wait(700);
    this.endTurn(false);
  }

  /* ---------------- FACE: SHIELD 🛡️ ---------------- */
  async resolveShield() {
    const player = this.current;
    const candidates = player.pieces.filter(p => (p.onTrack || p.inHomeRun) && !p.shield);
    this.log(`${player.faction.name} mendapat Dadu Shield 🛡️`, true);

    if (candidates.length === 0) {
      this.toast('Tidak ada bidak yang bisa diberi perisai 🛡️');
      this.audio.deny();
      await this.wait(800);
      return this.endTurn(false);
    }

    if (player.isBot) {
      await this.wait(450);
      const best = [...candidates].sort((a, b) => b.p - a.p)[0];
      return this.applyShield(best);
    }

    this.state = 'select-shield';
    this.hint('🛡️ Pilih bidakmu yang akan mendapat perisai.');
    this.toast('DADU SHIELD! Pilih bidakmu 🛡️');
    candidates.forEach(p => p.el.classList.add('is-selectable'));
  }

  async applyShield(piece) {
    this.state = 'animating';
    this.clearHighlights();
    piece.shield = true;
    this.audio.shield();
    this.renderPieces();
    this.spawnFx(piece.coord, '🛡️', 'fx-burst');
    this.spawnLabel(piece.coord, 'SHIELD ON');
    this.log(`Bidak ${piece.player.faction.name} kini kebal 1x serangan.`);
    await this.wait(700);
    this.endTurn(false);
  }

  /* ---------------- INPUT PEMAIN ---------------- */

  onPieceClick(piece) {
    if (this.state === 'select-move') {
      const move = this.pendingMoves.find(m => m.piece === piece);
      if (!move) { this.audio.deny(); return; }
      this.audio.click();
      this.pendingMoves = [];
      this.executeMove(move, this.currentFace);
      return;
    }
    if (this.state === 'select-target') {
      if (piece.color === this.current.color) { this.audio.deny(); this.toast('Pilih bidak LAWAN.', 900); return; }
      if (!piece.el.classList.contains('is-target')) { this.audio.deny(); return; }
      this.audio.click();
      this.performAttack(piece);
      return;
    }
    if (this.state === 'select-shield') {
      if (!piece.el.classList.contains('is-selectable')) { this.audio.deny(); return; }
      this.audio.click();
      this.applyShield(piece);
      return;
    }
  }

  /* ---------------- BOT AI ---------------- */

  chooseBotMove(moves, face) {
    let best = moves[0], bestScore = -Infinity;
    for (const move of moves) {
      const s = this.scoreMove(move, face);
      if (s > bestScore) { bestScore = s; best = move; }
    }
    return best;
  }

  scoreMove(move, face) {
    const { piece, to, releases } = move;
    let score = 0;

    if (releases) score += 70;
    if (to === CONFIG.stepsToFinish) score += 95;
    if (to > 50 && to < CONFIG.stepsToFinish) score += 45;   // masuk home column

    if (to <= 50) {
      const idx = (START_INDEX[piece.color] + to) % TRACK.length;
      const enemies = this.allPieces().filter(o =>
        o.color !== piece.color && o.onTrack && o.trackIndex === idx);
      if (enemies.length && !SAFE_INDEXES.has(idx)) {
        score += 120 * enemies.filter(e => !e.shield).length;
        score += 20 * enemies.filter(e => e.shield).length;
      }
      if (SAFE_INDEXES.has(idx)) score += 25;

      /* hindari mendarat tepat di depan lawan (1-6 petak di belakang) */
      let danger = 0;
      for (const o of this.allPieces()) {
        if (o.color === piece.color || !o.onTrack) continue;
        const diff = (idx - o.trackIndex + TRACK.length) % TRACK.length;
        if (diff >= 1 && diff <= 6) danger++;
      }
      if (!SAFE_INDEXES.has(idx) && !piece.shield) score -= danger * 14;
    }

    score += to * 0.6;                          // dorong maju
    if (piece.shield) score += 6;
    if (face.type === 'x2') score += 4;
    return score;
  }

  /* ---------------- EFEK VISUAL ---------------- */

  fxPos(coord) {
    const [x, y] = coord;
    return {
      left: ((x + 0.5) / CONFIG.boardSize * 100) + '%',
      top:  ((y + 0.5) / CONFIG.boardSize * 100) + '%',
    };
  }

  spawnFx(coord, content, cls = 'fx-burst', life = 900) {
    const el = document.createElement('div');
    el.className = 'fx ' + cls;
    el.textContent = content;
    Object.assign(el.style, this.fxPos(coord));
    this.dom.fxLayer.appendChild(el);
    setTimeout(() => el.remove(), life);
    return el;
  }

  spawnLabel(coord, text) {
    const el = document.createElement('div');
    el.className = 'fx fx-label';
    el.textContent = text;
    Object.assign(el.style, this.fxPos(coord));
    this.dom.fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /** efek serangan saat menangkap lawan lewat gerakan biasa */
  async playCaptureFx(attacker, victim) {
    const fac = attacker.player.faction;
    this.audio.capture();
    this.spawnFx(victim.coord, fac.captureFx, 'fx-burst');
    this.spawnFx(victim.coord, '', 'fx-shockwave', 700);
    this.spawnLabel(victim.coord, fac.captureName.toUpperCase() + '!');
    this.log(`${fac.name} melancarkan ${fac.captureName} pada ${victim.player.faction.name}!`, true);
    this.dom.board.classList.add('is-shaking');
    setTimeout(() => this.dom.board.classList.remove('is-shaking'), 700);
    await this.wait(420);
  }

  /** proyektil dari markas penyerang menuju target (Dadu Attack) */
  playProjectileFx(attackerColor, targetCoord, fac) {
    return new Promise(resolve => {
      const origin = YARD_CENTER[attackerColor];
      const count = fac.projectileCount;
      const flight = 560;
      this.audio.attack();

      for (let i = 0; i < count; i++) {
        const spreadX = count > 1 ? (Math.random() - 0.5) * 2.4 : 0;
        const spreadY = count > 1 ? (Math.random() - 0.5) * 1.6 : 0;
        const el = document.createElement('div');
        el.className = 'fx fx-projectile';
        el.textContent = fac.projectile;
        Object.assign(el.style, this.fxPos([origin[0] + spreadX, origin[1] + spreadY]));
        el.style.transitionDelay = (i * 55) + 'ms';
        this.dom.fxLayer.appendChild(el);

        // paksa reflow lalu terbangkan
        void el.offsetWidth;
        const dest = this.fxPos([targetCoord[0] + spreadX * 0.25, targetCoord[1] + spreadY * 0.25]);
        el.style.left = dest.left;
        el.style.top  = dest.top;
        el.style.transform = 'translate(-50%,-50%) rotate(' + (Math.random() * 60 - 30) + 'deg) scale(1.15)';
        setTimeout(() => el.remove(), flight + i * 55 + 120);
      }

      setTimeout(() => {
        this.spawnFx(targetCoord, '', 'fx-shockwave', 700);
        resolve();
      }, flight + count * 55);
    });
  }
}


/* =========================================================================
   6. UI / SCREEN FLOW
   ========================================================================= */

const audio = new AudioFX();

const dom = {
  screens: {
    title: $('#screen-title'),
    menu:  $('#screen-menu'),
    setup: $('#screen-setup'),
    game:  $('#screen-game'),
  },
  board:        $('#board'),
  boardGrid:    $('#board-grid'),
  pieceLayer:   $('#piece-layer'),
  fxLayer:      $('#fx-layer'),
  dice:         $('#dice'),
  diceFace:     $('#dice-face'),
  btnRoll:      $('#btn-roll'),
  actionHint:   $('#action-hint'),
  turnBanner:   $('#turn-banner'),
  turnAvatar:   $('#turn-avatar'),
  turnName:     $('#turn-name'),
  turnRole:     $('#turn-role'),
  scoreboard:   $('#scoreboard'),
  chaosLegend:  $('#chaos-legend'),
  chaosLegendList: $('#chaos-legend-list'),
  logList:      $('#log-list'),
  toast:        $('#toast'),
  modalWin:     $('#modal-win'),
  winTitle:     $('#win-title'),
  winSub:       $('#win-sub'),
  setupModeLabel: $('#setup-mode-label'),
};

const game = new LudQueenGame(dom, audio);

let selectedMode = 'classic';
const slotState = { red:'human', green:'bot', blue:'bot', yellow:'disable' };
const SLOT_CYCLE = { human:'bot', bot:'disable', disable:'human' };

function showScreen(name) {
  Object.values(dom.screens).forEach(s => s.classList.remove('is-active'));
  dom.screens[name].classList.add('is-active');
}

/* --- title --- */
dom.screens.title.addEventListener('click', () => {
  audio.click();
  showScreen('menu');
});

/* --- menu --- */
$$('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
  audio.click();
  selectedMode = btn.dataset.mode;
  dom.setupModeLabel.textContent = selectedMode === 'chaos' ? 'Ludo Chaos 🌀' : 'Ludo Classic 🎲';
  showScreen('setup');
}));
$('#btn-menu-back').addEventListener('click', () => { audio.click(); showScreen('title'); });

/* --- setup --- */
function refreshSlots() {
  $$('.slot-toggle').forEach(btn => {
    const color = btn.dataset.color;
    const st = slotState[color];
    btn.dataset.state = st;
    btn.textContent = st.toUpperCase();
    $(`.slot-card[data-color="${color}"]`).classList.toggle('is-off', st === 'disable');
  });
  const active = Object.values(slotState).filter(s => s !== 'disable').length;
  $('#btn-start-game').disabled = active < 2;
}
$$('.slot-toggle').forEach(btn => btn.addEventListener('click', () => {
  audio.click();
  const color = btn.dataset.color;
  slotState[color] = SLOT_CYCLE[slotState[color]];
  refreshSlots();
}));
$('#btn-setup-back').addEventListener('click', () => { audio.click(); showScreen('menu'); });
$('#btn-start-game').addEventListener('click', () => {
  audio.click();
  showScreen('game');
  game.init(selectedMode, { ...slotState });
});
refreshSlots();

/* --- game --- */
dom.btnRoll.addEventListener('click', () => { audio.click(); game.doRoll(); });

$('#btn-quit').addEventListener('click', () => {
  audio.click();
  game.state = 'over';
  dom.modalWin.hidden = true;
  showScreen('menu');
});

$('#btn-sound').addEventListener('click', (e) => {
  audio.enabled = !audio.enabled;
  e.currentTarget.dataset.on = String(audio.enabled);
  e.currentTarget.textContent = audio.enabled ? '🔊' : '🔇';
  if (audio.enabled) audio.click();
});

$('#btn-rematch').addEventListener('click', () => {
  audio.click();
  dom.modalWin.hidden = true;
  game.init(selectedMode, { ...slotState });
});
$('#btn-to-menu').addEventListener('click', () => {
  audio.click();
  dom.modalWin.hidden = true;
  showScreen('menu');
});

/* keyboard: spasi untuk lempar dadu */
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && dom.screens.game.classList.contains('is-active')) {
    e.preventDefault();
    if (!dom.btnRoll.disabled) { audio.click(); game.doRoll(); }
  }
});

/* debug hook */
window.LUDQUEEN = { game, CONFIG, CHAOS_DICE_CONFIG, TRACK, START_INDEX, HOME_PATH };
