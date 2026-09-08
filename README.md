# LUDQueen 👑

Game Ludo bertema **Medieval Pixel Art** — HTML + CSS + Vanilla JavaScript murni.
Tanpa React, tanpa Phaser, tanpa build step. Cukup buka `index.html`.

```
index.html   struktur UI, papan 15x15, layer bidak & efek
style.css    layout, keyframes animasi, desain UI pixel
script.js    engine game (OOP), path mapping, RNG dadu chaos, bot AI, Web Audio
```

---

## Cara menjalankan

Buka `index.html` langsung di browser, atau jalankan server statis apa pun:

```bash
python3 -m http.server 8080
# lalu buka http://localhost:8080
```

---

## Alur layar

1. **Title Screen** — judul "LUDQueen 👑" + teks `tap to play` berkedip.
2. **Main Menu** — dua mode: **Ludo Classic** dan **Ludo Chaos**.
3. **Player Setup** — 4 slot sudut, masing-masing punya toggle
   `HUMAN → BOT → DISABLE`. Minimal 2 slot aktif untuk mulai.
4. **Game** — papan, tray dadu, papan skor, dan catatan pertempuran.

---

## Faksi

| Warna | Faksi | Markas | Serangan saat menangkap | Proyektil Dadu Attack |
|---|---|---|---|---|
| Merah | Knight ⚔️ | Base Kerajaan | Tebasan Pedang | **Canon** 💣 |
| Hijau | Elf 🏹 | Base Hutan | Bidikan Panah | **Hujan Panah** 🏹 |
| Biru | Witch 🪄 | Base Langit | Sihir Terkutuk | **Hujan Ramuan Sihir** 🧪 |
| Kuning | Dragon 🔥 | Base Pegunungan | Napas Api | **Hujan Api** 🔥 |

---

## Ludo Classic

Aturan standar: keluar markas dengan angka **6**, dadu 6 memberi lemparan ulang,
mendarat di petak lawan (di luar petak aman 🛡) memulangkan bidak lawan,
tiga kali 6 beruntun membuat giliran hangus, dan menang bila **4 bidak** masuk
Home Finish (langkah harus pas, tidak boleh lebih).

---

## Ludo Chaos

Mewarisi seluruh aturan Classic, tetapi dadu biasa diganti **Dadu Gacha**:

| Sisi | Efek |
|---|---|
| 🎲 **Angka 1–6** | Gerak normal |
| ☁️ **Dadu x2** | Angka pergerakan dikali 2, bidak menaiki awan dan meluncur melintasi petak |
| 🎯 **Dadu Attack** | Pilih bebas 1 bidak lawan di papan untuk dipulangkan; proyektil ditembakkan dari markas penyerang |
| 🛡️ **Dadu Shield** | Perisai kebal **1 kali pakai** |
| 👼 **Dadu Angel** | Seluruh bidak di markas langsung keluar ke petak start + **1 giliran ekstra** |

**Perisai hilang otomatis jika:**
(a) terkena serangan, (b) bidak tersebut menangkap bidak lawan, atau
(c) bidak tersebut mencapai petak Home Finish.

### Mengubah probabilitas dadu

Semua di `script.js`, bagian `CHAOS_DICE_CONFIG`. Bobot bebas, engine
menormalkannya sendiri menjadi 100% dan panel legenda di layar ikut menyesuaikan.

```js
const CHAOS_DICE_CONFIG = {
  faceWeight: { number: 60, x2: 14, attack: 11, shield: 10, angel: 5 },
  numberWeight:   { 1:10, 2:10, 3:10, 4:10, 5:10, 6:14 },
  x2NumberWeight: { 1:10, 2:12, 3:14, 4:12, 5:8, 6:6 },
};
```

---

## Path mapping papan

Papan adalah grid **15×15** (CSS Grid), koordinat `[x, y]` = `[kolom, baris]`.

- `TRACK` — array **52** koordinat jalur utama. Index `0` = petak start merah,
  lalu searah jarum jam.
- `START_INDEX` — `{ red:0, green:13, yellow:26, blue:39 }`.
- `SAFE_INDEXES` — petak aman: setiap petak start + petak ke-8 sesudahnya.
- `HOME_PATH` — 5 petak home column tiap warna.
- `YARD_SLOTS` / `FINISH_SLOTS` — posisi bidak di markas dan di kotak pusat.

Progres satu bidak disimpan sebagai satu angka `p`:

```
p = -1        di markas
p = 0..50     jalur utama  -> TRACK[(START_INDEX[color] + p) % 52]
p = 51..55    home column  -> HOME_PATH[color][p - 51]
p = 56        HOME FINISH
```

---

## Mengganti placeholder dengan pixel art

Setiap bidak dirender sebagai `.piece-art.piece-<faksi>` berisi emoji
placeholder. Untuk memasang sprite sungguhan cukup timpa CSS-nya:

```css
.piece-knight { background-image: url('assets/knight.png'); }
.piece-elf    { background-image: url('assets/elf.png'); }
.piece-witch  { background-image: url('assets/witch.png'); }
.piece-dragon { background-image: url('assets/dragon.png'); }

/* sembunyikan emoji placeholder */
.piece-art.has-sprite { font-size: 0 !important; }
```

lalu tambahkan class `has-sprite` pada elemen `.piece-inner` (atau set
`.piece-emoji { display:none }`). Petak papan (`.cell-path`, `.cell-home`,
`.cell-start`, `.yard-inner`, `.center-zone`) juga siap ditimpa
`background-image` dengan `image-rendering: pixelated` yang sudah aktif.

---

## Kontrol

- **Klik / tap** bidak yang berkedip untuk memilih langkah, target serangan, atau penerima perisai.
- **Spasi** — lempar dadu.
- 🔊 — matikan/hidupkan efek suara (Web Audio API, tanpa file audio eksternal).

---

## Catatan pengembang

`CONFIG.animationScale` di `script.js` mengalikan seluruh jeda animasi.
Set ke `0.01` dari console untuk mensimulasikan pertandingan penuh dengan cepat:

```js
LUDQUEEN.CONFIG.animationScale = 0.01;
```
