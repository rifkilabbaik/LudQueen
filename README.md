# LUDQueen 👑

Game Ludo bertema **Medieval Pixel Art** dengan bidak berwujud karakter
(Knight · Elf · Witch · Dragon) — HTML + CSS + Vanilla JavaScript murni.
Tanpa React, tanpa Phaser, tanpa build step. Cukup buka `index.html`.

```
index.html   struktur UI, papan 15x15, layer bidak & efek
style.css    layout, keyframes animasi, desain UI pixel
script.js    engine game (OOP), sprite pixel art, path mapping,
             RNG dadu chaos, bot AI, Web Audio
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
3. **Pengaturan Dadu Chaos** *(khusus mode Chaos)* — pilih preset `DEFAULT`
   atau atur sendiri lewat `CUSTOM`.
4. **Player Setup** — 4 slot sudut, masing-masing punya toggle
   `HUMAN → BOT → DISABLE`. Minimal 2 slot aktif untuk mulai.
5. **Game** — papan dikelilingi **dadu di keempat sisi pemain**: 2 di atas
   (Knight, Elf) dan 2 di bawah (Witch, Dragon).

---

## Faksi

| Warna | Faksi | Markas | Serangan saat menangkap | Proyektil Dadu Attack |
|---|---|---|---|---|
| Merah | Knight | Base Kerajaan | Tebasan Pedang | **Canon** 💣 |
| Hijau | Elf | Base Hutan | Bidikan Panah | **Hujan Panah** 🏹 |
| Biru | Witch | Base Langit | Sihir Terkutuk | **Hujan Ramuan Sihir** 🧪 |
| Kuning | Dragon | Base Pegunungan | Napas Api | **Hujan Api** 🔥 |

---

## Ludo Classic

Aturan standar: keluar markas dengan angka **6**, dadu 6 memberi lemparan ulang,
mendarat di petak lawan (di luar petak aman 🛡) memulangkan bidak lawan,
tiga kali 6 beruntun membuat giliran hangus, dan menang bila **4 bidak** masuk
Home Finish (langkah harus pas, tidak boleh lebih).

Ludo Classic selalu memakai **dadu adil 1–6** dan tidak terpengaruh pengaturan
probabilitas.

---

## Ludo Chaos

Mewarisi seluruh aturan Classic, tetapi dadu biasa diganti **Dadu Gacha**:

| Sisi | Efek | Peluang bawaan |
|---|---|---|
| 🎲 **Angka 1–6** | Gerak normal | **79%** (sisa dari 100%) |
| ☁️ **Dadu x2** | Angka pergerakan dikali 2, bidak menaiki awan dan meluncur melintasi petak | **10%** |
| 🎯 **Dadu Attack** | Pilih bebas 1 bidak lawan di papan untuk dipulangkan; proyektil ditembakkan dari markas penyerang | **3%** |
| 🛡️ **Dadu Shield** | Perisai kebal **1 kali pakai** | **5%** |
| 👼 **Dadu Angel** | Seluruh bidak di markas keluar ke petak start + 1 giliran ekstra | **3%** |

**Aturan pembuka:** selama pemain **belum punya satu pun bidak di luar markas**,
sisi spesial dikunci — dadu hanya mengeluarkan angka normal 1–6. Efek Attack,
Shield, dan x2 tidak ada gunanya saat papan masih kosong, jadi tidak dibuang
percuma. Begitu satu bidak keluar, seluruh sisi terbuka.

**Perisai hilang otomatis jika:**
(a) terkena serangan, (b) bidak tersebut menangkap bidak lawan, atau
(c) bidak tersebut mencapai petak Home Finish.

### Pengaturan probabilitas

Memilih **Ludo Chaos** akan membuka layar **Pengaturan Dadu Chaos** sebelum
masuk ke penyusunan pemain.

- **DEFAULT** — Dadu x2 10%, Attack 3%, Angel 3%, Shield 5%, sisanya (79%)
  dadu normal.
- **CUSTOM** — geser sendiri peluang tiap sisi spesial, sekaligus mengatur
  **bobot tiap mata dadu 1–6**. Peluang dadu normal dihitung otomatis dari
  sisa, dan selalu disisakan minimal 10% supaya dadu angka tidak pernah habis.

Nilai awalnya ada di `script.js`:

```js
const DEFAULT_SPECIAL_PROB  = { x2: 10, attack: 3, angel: 3, shield: 5 };
const DEFAULT_NUMBER_WEIGHT = { 1:10, 2:10, 3:10, 4:10, 5:10, 6:10 };
const MAX_SPECIAL_TOTAL     = 90;   // sisakan minimal 10% untuk dadu normal
```

Bobot angka dipakai untuk sisi normal **maupun** angka dasar sisi x2.

---

## Dadu di keempat sisi pemain

Papan dikelilingi 4 pod dadu — 2 di atas, 2 di bawah — sejajar tepi kiri dan
kanan papan. Mata dadu 1–6 digambar sebagai **titik pixel pada grid 3×3**
(`PIP_MAP`), sedangkan sisi chaos memakai ikon dan label.

Dadu milik pemain yang sedang giliran menyala dan bisa diketuk untuk melempar;
dadu pemain lain diredupkan sambil tetap menampilkan hasil lemparan terakhirnya.

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

## Sprite karakter

Bidak digambar sebagai **pixel art 16×16** langsung di dalam kode. Setiap
sprite adalah matriks karakter di `script.js` (`SPRITES`), satu huruf = satu
piksel, dipetakan ke palet di `SPRITE_PALETTE`:

```js
const SPRITE_KNIGHT = [
  '................',
  '......DDDD......',
  '....DDSSSSDD....',
  '...DSSSSSSSSD...',
  ...
];
```

Matriks itu dirender menjadi SVG (satu `<rect>` per garis piksel sewarna) lalu
dipasang ke class `.piece-<faksi>` lewat `<style>` yang disuntikkan saat halaman
dimuat. Mengubah karakter cukup dengan menyunting matriksnya — tidak perlu file
gambar sama sekali.

Untuk memakai file PNG sungguhan, timpa class-nya di `style.css` dengan
`!important` (agar menang atas style yang disuntikkan):

```css
.piece-knight { background-image: url('assets/knight.png') !important; }
.piece-elf    { background-image: url('assets/elf.png')    !important; }
.piece-witch  { background-image: url('assets/witch.png')  !important; }
.piece-dragon { background-image: url('assets/dragon.png') !important; }
```

Sprite yang sama otomatis dipakai di layar judul, kartu setup, banner giliran,
dadu tiap pemain, papan skor, dan layar kemenangan. Petak papan (`.cell-path`,
`.cell-home`, `.cell-start`, `.yard-inner`, `.center-zone`) juga siap ditimpa
`background-image` dengan `image-rendering: pixelated` yang sudah aktif.

---

## Kontrol

- **Ketuk dadu milikmu** di sudut papan untuk melempar — atau pakai tombol
  `LEMPAR DADU`.
- **Ketuk bidak** yang berkedip untuk memilih langkah, target serangan, atau
  penerima perisai.
- **Spasi** — lempar dadu.
- 🔊 — matikan/hidupkan efek suara (Web Audio API, tanpa file audio eksternal).

---

## Catatan pengembang

`CONFIG.animationScale` di `script.js` mengalikan seluruh jeda animasi.
Set ke `0.01` dari console untuk mensimulasikan pertandingan penuh dengan cepat:

```js
LUDQUEEN.CONFIG.animationScale = 0.01;
```
