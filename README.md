# TempMail Frontend (Next.js)

Frontend untuk inbox TempMail. Aplikasi ini menampilkan email realtime dari Supabase dan menyediakan endpoint verifikasi 2FA.

## Ruang Lingkup

- inbox UI di [src/app/page.tsx](src/app/page.tsx)
- endpoint verifikasi TOTP di [src/app/api/verify-2fa/route.ts](src/app/api/verify-2fa/route.ts)
- client Supabase di [src/lib/supabase.ts](src/lib/supabase.ts)

## Environment Variables

Salin template:

```bash
cp .env.local.example .env.local
```

PowerShell (Windows):

```powershell
Copy-Item .env.local.example .env.local
```

Isi nilai berikut:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
TOTP_SECRET=base32-secret-for-otpauth
```

## Domain Email

Daftar domain yang muncul di dropdown ada di [src/lib/email-domains.ts](src/lib/email-domains.ts).

Saat ini aktif di web:

- `fdlnstore.com`
- `fdlns.me`

Untuk menambahkan domain baru ke web:

1. Tambahkan domain ke array `TEMPMAIL_DOMAINS` di [src/lib/email-domains.ts](src/lib/email-domains.ts).
2. Pastikan domain itu sudah aktif di Cloudflare Email Routing dan routing-nya mengarah ke Worker `tempmail-worker`.
3. Deploy ulang frontend.

Worker tidak perlu diubah selama semua domain baru diarahkan ke Worker yang sama, karena Worker menyimpan alamat tujuan penuh dari `message.to`.

## Menjalankan Lokal

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3000`

## Build Produksi

```bash
npm run build
npm run start
```

## Lint

```bash
npm run lint
```

## Operasional dan Deploy

Panduan operasional lengkap tersedia di [../SETUP-GUIDE.md](../SETUP-GUIDE.md).
