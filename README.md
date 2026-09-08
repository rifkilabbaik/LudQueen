# LUDQueen 👑

Game Ludo dengan bidak berwujud karakter (Knight · Elf · Witch · Dragon) —
HTML + CSS + Vanilla JavaScript murni. Tanpa React, tanpa Phaser, tanpa build
step. Cukup buka `index.html`.

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
3. **Peluang Dadu Chaos** *(khusus mode Chaos)* — atur sendiri peluang tiap sisi
   dadu spesial. Sisa dari 100% otomatis menjadi dadu normal 1–6.
4. **Player Setup** — 4 slot, masing-masing punya toggle
   `HUMAN → BOT → DISABLE`. Minimal 2 slot aktif untuk mulai.
5. **Game** — papan dengan kartu pemain di 4 sudut. Dadu muncul di dalam kartu
   pemain yang sedang mendapat giliran; ketuk untuk melempar. Layar sengaja
   dibuat bersih: satu-satunya teks berjalan adalah notifikasi.

---

## Faksi

| Warna | Faksi | Markas | Serangan saat menangkap | Proyektil Dadu Pistol |
|---|---|---|---|---|
| Merah | Knight | Base Kerajaan | Tebasan Pedang | **Canon** 💣 |
| Hijau | Elf | Base Hutan | Bidikan Panah | **Hujan Panah** 🏹 |
| Biru | Witch | Base Langit | Sihir Terkutuk | **Hujan Ramuan Sihir** 🧪 |
| Kuning | Dragon | Base Pegunungan | Napas Api | **Hujan Api** 🔥 |

Tiap bidak digambar sebagai karakter lewat SVG di `CHARACTER_SVG` (`script.js`).

---

## Ludo Classic

Aturan standar: keluar markas dengan angka **6**, dadu 6 memberi lemparan ulang,
mendarat di petak lawan (di luar petak aman 🛡) memulangkan bidak lawan,
tiga kali 6 beruntun membuat giliran hangus, dan menang bila **4 bidak** masuk
Home Finish (langkah harus pas, tidak boleh lebih).

---

## Ludo Chaos

Mewarisi seluruh aturan Classic, tetapi dadu biasa diganti **Dadu Chaos** yang
peluang tiap sisinya bisa diatur sendiri sebelum permainan dimulai.

| Sisi | Efek | Peluang bawaan |
|---|---|---|
| **Mundur (-1..-6)** | Bidak mundur 1–6 langkah (tidak boleh melewati petak start) | 7,5% |
| **Double (7..12)** | Maju 7–12 langkah, bidak menaiki awan dan meluncur melintasi petak | 12% |
| **Perisai** | Lindungi 1 bidak, kebal **1 kali pakai** | 3% |
| **Bom** | Bidak **terjauh di papan meledak — milik siapa pun, termasuk milikmu sendiri** | 1% |
| **Pistol** | Pilih bebas 1 bidak lawan untuk dipulangkan; proyektil ditembakkan dari markas penyerang | 1% |
| **Malaikat** | Seluruh bidak di markas keluar ke petak start + 1 giliran ekstra | 0,5% |
| **Normal 1–6** | Gerak biasa | sisa dari 100% |

**Aturan pembuka:** selama pemain **belum punya satu pun bidak di luar markas**,
dadunya dikunci ke angka normal 1–6 saja — sisi spesial tidak akan keluar.

**Perisai hilang otomatis jika:**
(a) terkena serangan (Pistol, Bom, atau ditangkap lawan),
(b) bidak tersebut menangkap bidak lawan, atau
(c) bidak tersebut mencapai petak Home Finish.

### Mengubah peluang dadu

Cara termudah lewat layar **Peluang Dadu Chaos** di dalam game — nilai bisa
diketik dengan koma maupun titik (`7,5` atau `7.5`), ringkasan "Normal 1–6" dan
"Total spesial" ikut berubah langsung, dan tombol Lanjutkan terkunci bila total
melebihi 100%.

Untuk mengubah nilai bawaannya, sunting `def` pada `CHAOS_FACES` di `script.js`:

```js
const CHAOS_FACES = [
  { key:'mundur',   name:'Mundur (-1..-6)', ..., def:7.5 },
  { key:'double',   name:'Double (7..12)',  ..., def:12  },
  { key:'perisai',  name:'Perisai',         ..., def:3   },
  { key:'bom',      name:'Bom',             ..., def:1   },
  { key:'pistol',   name:'Pistol',          ..., def:1   },
  { key:'malaikat', name:'Malaikat',        ..., def:0.5 },
];
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

## Mengganti karakter dengan sprite sendiri

Karakter tiap faksi didefinisikan sebagai SVG di `CHARACTER_SVG` (`script.js`).
Ada dua cara menggantinya.

**1. Ganti langsung SVG-nya** — sunting isi `CHARACTER_SVG.knight`, `.elf`,
`.witch`, `.dragon`.

**2. Pakai file gambar (mis. pixel art)** — timpa lewat CSS:

```css
.piece-knight .sprite { background-image: url('assets/knight.png'); }
.piece-elf    .sprite { background-image: url('assets/elf.png'); }
.piece-witch  .sprite { background-image: url('assets/witch.png'); }
.piece-dragon .sprite { background-image: url('assets/dragon.png'); }

.piece .sprite {
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center bottom;
  image-rendering: pixelated;   /* untuk pixel art */
}
.piece .sprite svg { display: none; }   /* sembunyikan SVG bawaan */
```

Petak papan (`.cell-path`, `.cell-home`, `.yard`, `.center-zone`) juga siap
ditimpa `background-image`.

---

## Kontrol

- **Ketuk dadu** di kartu pemain yang sedang giliran untuk melempar.
- **Ketuk bidak** yang berkedip untuk memilih langkah, target Pistol, atau penerima Perisai.
- **Spasi** — lempar dadu.
- **☰** — menu: suara on/off, ulang permainan, kembali ke menu utama.

---

## Catatan pengembang

`CONFIG.animationScale` di `script.js` mengalikan seluruh jeda animasi.
Set ke `0.01` dari console untuk mensimulasikan pertandingan penuh dengan cepat:

```js
LUDQUEEN.CONFIG.animationScale = 0.01;
```
