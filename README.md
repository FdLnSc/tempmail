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
