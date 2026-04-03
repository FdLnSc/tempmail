import { NextRequest, NextResponse } from 'next/server'
import * as OTPAuth from 'otpauth'

// TOTP Secret - only accessible server-side
const TOTP_SECRET = process.env.TOTP_SECRET || ''

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: 'Kode harus 6 digit' },
        { status: 400 }
      )
    }

    if (!TOTP_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const totp = new OTPAuth.TOTP({
      issuer: 'TempMail',
      label: 'Admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: TOTP_SECRET
    })

    const delta = totp.validate({ token: code, window: 1 })
    
    if (delta !== null) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { success: false, error: 'Kode tidak valid atau expired' },
        { status: 401 }
      )
    }
  } catch {
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan' },
      { status: 500 }
    )
  }
}
