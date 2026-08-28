# WebClass — GitHub + PostgreSQL + Node.js

## 1. Database PostgreSQL

Buat database PostgreSQL di Supabase/Neon/Railway.
Ambil connection string dan simpan sebagai `DATABASE_URL`.

Server otomatis membuat tabel `users` dan `app_data` saat pertama hidup.

## 2. Backend

Deploy repository ke Render sebagai **Web Service**:

- Build: `npm install`
- Start: `npm start`
- Environment:
  - `DATABASE_URL` = connection string PostgreSQL
  - `JWT_SECRET` = string acak panjang
  - `FRONTEND_ORIGINS` = URL GitHub Pages, contoh `https://username.github.io`
  - `ADMIN_USERNAME` = username admin
  - `ADMIN_PASSWORD` = password admin baru

Tes:
`https://NAMA-BACKEND.onrender.com/api/health`

Harus mendapat JSON seperti `{"ok":true,"database":"connected"}`.

## 3. Frontend GitHub Pages

Edit `config.js`:

```js
window.WEBCLASS_API_URL = 'https://NAMA-BACKEND.onrender.com/api';
```

Commit dan push.
Aktifkan GitHub Pages dari branch utama dan folder root.

## 4. Akun awal

36 akun siswa dibuat otomatis ketika database pertama kali kosong.
Password awal tiap siswa adalah:

`NamaDepan123`

Contoh: akun Yudi memakai `Yudi123`.

Admin memakai username/password dari `ADMIN_USERNAME` dan `ADMIN_PASSWORD`.
**Segera ganti password admin setelah deploy.**

## 5. Data yang sudah diarahkan ke cloud

- Login siswa/admin dengan JWT
- Password di database disimpan sebagai bcrypt hash
- Profil siswa
- Foto profil
- Tugas
- Status pengumpulan tugas
- Materi
- Jadwal
- Piket
- Konfigurasi website/pengumuman/event/link/kas
- Catatan pribadi
- Catatan kelas + balasan
- File metadata yang memang sudah dipakai aplikasi

Theme browser tetap lokal karena itu hanya preferensi perangkat.

## 6. Jalankan di PC

```bash
npm install
```

Isi `.env`, lalu:

```bash
npm start
```

Buka `http://localhost:3000`.

## Catatan keamanan

Jangan commit `.env` atau password database ke GitHub.
Ganti `ADMIN_PASSWORD` dan `JWT_SECRET` pada production.
Untuk foto profil yang banyak, sebaiknya nanti dipindah dari PostgreSQL ke object storage agar database tidak membesar.
