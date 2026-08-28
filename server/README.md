# WebClass Backend

Backend Node.js + Express + PostgreSQL untuk WebClass XI TKJ 1.

## Local

1. Install Node.js 20+.
2. Buat PostgreSQL database.
3. Copy `.env.example` menjadi `.env` dan isi `DATABASE_URL` + `JWT_SECRET`.
4. Jalankan:

```bash
npm install
npm start
```

API: `http://localhost:3000/api/health`

## Deploy

Deploy folder/repository ini ke Render/Railway/Fly.io atau VPS yang mendukung Node.js.
Set environment variables dari `.env.example`.

Database harus PostgreSQL. Tabel akan dibuat otomatis saat server pertama kali berjalan.
