'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, Email } from '@/lib/supabase'
import * as OTPAuth from 'otpauth'

// TOTP Secret for admin verification
const TOTP_SECRET = '3XRVZR74ZPVUHSGYLLP7Z5ABJFXVZCJ5'

// Verify TOTP code
function verifyTOTP(code: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'TempMail',
      label: 'Admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: TOTP_SECRET
    })
    const delta = totp.validate({ token: code, window: 1 })
    return delta !== null
  } catch {
    return false
  }
}

// Simple hash function for password (client-side)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate random email address
function generateEmailAddress(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${result}@fdlnstore.com`
}

// Get email history from localStorage
function getEmailHistory(): string[] {
  if (typeof window === 'undefined') return []
  const history = localStorage.getItem('tempmail_history')
  return history ? JSON.parse(history) : []
}

// Save email to history
function saveToHistory(email: string) {
  const history = getEmailHistory()
  const filtered = history.filter(e => e !== email)
  const newHistory = [email, ...filtered].slice(0, 20)
  localStorage.setItem('tempmail_history', JSON.stringify(newHistory))
}

// Remove email from history
function removeFromHistory(email: string) {
  const history = getEmailHistory()
  const newHistory = history.filter(e => e !== email)
  localStorage.setItem('tempmail_history', JSON.stringify(newHistory))
}

// Modal types
type ModalType = 'none' | 'create' | 'login' | 'forgot' | 'verify2fa'

export default function Home() {
  const [emailAddress, setEmailAddress] = useState<string>('')
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [emailHistory, setEmailHistory] = useState<string[]>([])
  const [manualInput, setManualInput] = useState('')
  
  // Modal states
  const [modalType, setModalType] = useState<ModalType>('none')
  const [modalEmail, setModalEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [pendingAction, setPendingAction] = useState<'random' | 'custom' | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalLoading, setModalLoading] = useState(false)

  // Generate new email on first load
  useEffect(() => {
    const stored = localStorage.getItem('tempmail_address')
    if (stored) {
      setEmailAddress(stored)
    }
    setEmailHistory(getEmailHistory())
  }, [])

  // Fetch emails when address changes
  const fetchEmails = useCallback(async () => {
    if (!emailAddress) return
    
    setLoading(true)
    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .eq('to_address', emailAddress)
      .order('created_at', { ascending: false })
    
    if (!error && data) {
      setEmails(data)
    }
    setLoading(false)
  }, [emailAddress])

  useEffect(() => {
    fetchEmails()
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('emails')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'emails',
          filter: `to_address=eq.${emailAddress}`
        },
        (payload) => {
          setEmails(prev => [payload.new as Email, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [emailAddress, fetchEmails])

  // Reset modal state
  const resetModal = () => {
    setModalType('none')
    setModalEmail('')
    setPassword('')
    setConfirmPassword('')
    setOldPassword('')
    setNewPassword('')
    setModalError('')
    setModalLoading(false)
    setTotpCode('')
    setPendingAction(null)
  }

  // Open 2FA verification modal
  const open2FAModal = (action: 'random' | 'custom') => {
    setPendingAction(action)
    setTotpCode('')
    setModalError('')
    setModalType('verify2fa')
  }

  // Verify 2FA and proceed
  const handleVerify2FA = () => {
    if (!totpCode || totpCode.length !== 6) {
      setModalError('Masukkan 6 digit kode')
      return
    }
    
    if (!verifyTOTP(totpCode)) {
      setModalError('Kode tidak valid atau sudah expired')
      return
    }
    
    // 2FA valid - proceed with action
    if (pendingAction === 'random') {
      const newEmail = generateEmailAddress()
      setModalEmail(newEmail)
      setModalType('create')
      setModalError('')
      setTotpCode('')
    } else if (pendingAction === 'custom') {
      const prefix = manualInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      if (prefix) {
        const fullEmail = `${prefix}@fdlnstore.com`
        setModalEmail(fullEmail)
        setModalType('create')
        setModalError('')
        setTotpCode('')
        setManualInput('')
      }
    }
  }

  // Open create email modal (for new email with password)
  const openCreateModal = (email: string) => {
    setModalEmail(email)
    setModalType('create')
    setModalError('')
  }

  // Open login modal (for existing email)
  const openLoginModal = (email: string) => {
    setModalEmail(email)
    setModalType('login')
    setModalError('')
  }

  // Handle create new email with password
  const handleCreateEmail = async () => {
    if (!password || password.length < 4) {
      setModalError('Password minimal 4 karakter')
      return
    }
    if (password !== confirmPassword) {
      setModalError('Password tidak cocok')
      return
    }

    setModalLoading(true)
    try {
      const hash = await hashPassword(password)
      
      // Check if email already exists
      const { data: existing } = await supabase
        .from('email_accounts')
        .select('email_address')
        .eq('email_address', modalEmail)
        .single()

      if (existing) {
        setModalError('Email sudah digunakan, silakan buka dengan password')
        setModalLoading(false)
        return
      }

      // Create new account
      const { error } = await supabase
        .from('email_accounts')
        .insert({ email_address: modalEmail, password_hash: hash })

      if (error) {
        setModalError('Gagal membuat email: ' + error.message)
        setModalLoading(false)
        return
      }

      // Success - set as active email
      setEmailAddress(modalEmail)
      localStorage.setItem('tempmail_address', modalEmail)
      saveToHistory(modalEmail)
      setEmailHistory(getEmailHistory())
      setEmails([])
      setSelectedEmail(null)
      resetModal()
    } catch {
      setModalError('Terjadi kesalahan')
      setModalLoading(false)
    }
  }

  // Handle login to existing email
  const handleLogin = async () => {
    if (!password) {
      setModalError('Masukkan password')
      return
    }

    setModalLoading(true)
    try {
      const hash = await hashPassword(password)
      
      const { data, error } = await supabase
        .from('email_accounts')
        .select('password_hash')
        .eq('email_address', modalEmail)
        .single()

      if (error || !data) {
        setModalError('Email tidak ditemukan')
        setModalLoading(false)
        return
      }

      if (data.password_hash !== hash) {
        setModalError('Password salah')
        setModalLoading(false)
        return
      }

      // Success - set as active email
      setEmailAddress(modalEmail)
      localStorage.setItem('tempmail_address', modalEmail)
      saveToHistory(modalEmail)
      setEmailHistory(getEmailHistory())
      setEmails([])
      setSelectedEmail(null)
      resetModal()
    } catch {
      setModalError('Terjadi kesalahan')
      setModalLoading(false)
    }
  }

  // Handle forgot password
  const handleForgotPassword = async () => {
    if (!oldPassword) {
      setModalError('Masukkan password lama')
      return
    }
    if (!newPassword || newPassword.length < 4) {
      setModalError('Password baru minimal 4 karakter')
      return
    }

    setModalLoading(true)
    try {
      const oldHash = await hashPassword(oldPassword)
      const newHash = await hashPassword(newPassword)
      
      // Verify old password
      const { data, error } = await supabase
        .from('email_accounts')
        .select('password_hash')
        .eq('email_address', modalEmail)
        .single()

      if (error || !data) {
        setModalError('Email tidak ditemukan')
        setModalLoading(false)
        return
      }

      if (data.password_hash !== oldHash) {
        setModalError('Password lama salah')
        setModalLoading(false)
        return
      }

      // Update password
      const { error: updateError } = await supabase
        .from('email_accounts')
        .update({ password_hash: newHash })
        .eq('email_address', modalEmail)

      if (updateError) {
        setModalError('Gagal mengubah password')
        setModalLoading(false)
        return
      }

      // Success - go back to login
      setModalType('login')
      setPassword('')
      setOldPassword('')
      setNewPassword('')
      setModalError('')
      setModalLoading(false)
    } catch {
      setModalError('Terjadi kesalahan')
      setModalLoading(false)
    }
  }

  // Generate random - needs 2FA
  const handleGenerateRandom = () => {
    open2FAModal('random')
  }

  // Create custom email - check if exists first
  const handleCreateCustom = async () => {
    if (!manualInput.trim()) return
    const prefix = manualInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!prefix) return
    const fullEmail = `${prefix}@fdlnstore.com`
    
    // Check if exists
    const { data: existing } = await supabase
      .from('email_accounts')
      .select('email_address')
      .eq('email_address', fullEmail)
      .single()

    if (existing) {
      // Email exists, open login
      openLoginModal(fullEmail)
      setManualInput('')
    } else {
      // New email - needs 2FA first
      open2FAModal('custom')
    }
  }

  // Open email (buka existing email)
  const handleOpenEmail = async () => {
    if (!manualInput.trim()) return
    const prefix = manualInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!prefix) return
    const fullEmail = `${prefix}@fdlnstore.com`
    
    // Check if exists
    const { data: existing } = await supabase
      .from('email_accounts')
      .select('email_address')
      .eq('email_address', fullEmail)
      .single()

    if (existing) {
      openLoginModal(fullEmail)
      setManualInput('')
    } else {
      // Email doesn't exist
      setModalEmail(fullEmail)
      setModalError('Email tidak ditemukan')
      setModalType('login')
      setManualInput('')
    }
  }

  // Open email from history
  const handleOpenFromHistory = (email: string) => {
    openLoginModal(email)
    setShowHistory(false)
  }

  const switchToEmail = (email: string) => {
    setEmailAddress(email)
    localStorage.setItem('tempmail_address', email)
    saveToHistory(email)
    setEmailHistory(getEmailHistory())
    setEmails([])
    setSelectedEmail(null)
    setShowHistory(false)
  }

  const deleteFromHistory = (email: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent switching to email
    removeFromHistory(email)
    setEmailHistory(getEmailHistory())
    // If deleting current email, clear it
    if (email === emailAddress) {
      const remaining = getEmailHistory()
      if (remaining.length > 0) {
        // Don't auto-switch, just clear current
        setEmailAddress('')
        localStorage.removeItem('tempmail_address')
        setEmails([])
        setSelectedEmail(null)
      } else {
        setEmailAddress('')
        localStorage.removeItem('tempmail_address')
        setEmails([])
        setSelectedEmail(null)
      }
    }
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(emailAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Extract prefix from email for display
  const emailPrefix = emailAddress.replace('@fdlnstore.com', '')

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">📧</span> TempMail
          </h1>
          <p className="text-gray-400 text-sm">Email sementara gratis - fdlnstore.com</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Email Address Card */}
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 mb-8 border border-gray-700 relative z-20">
          <p className="text-gray-400 text-sm mb-2">Alamat email sementara Anda:</p>
          
          {/* Email Display with Dropdown */}
          <div className="relative mb-4 z-30">
            <div className="flex items-center">
              <div 
                onClick={() => {
                  if (emailHistory.length > 0) setShowHistory(!showHistory)
                }}
                className="flex-1 bg-gray-900 rounded-xl px-4 py-3 font-mono text-lg text-green-400 border border-gray-600 cursor-pointer hover:border-gray-500 transition-colors flex items-center justify-between"
              >
                <span>{emailAddress || 'Belum ada email'}</span>
                {emailHistory.length > 0 && (
                  <span className={`ml-2 transition-transform ${showHistory ? 'rotate-180' : ''}`}>▼</span>
                )}
              </div>
            </div>
            
            {/* History Dropdown */}
            {showHistory && emailHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 rounded-xl border border-gray-600 overflow-hidden z-50 shadow-2xl max-h-64 overflow-y-auto">
                {emailHistory.map((historyEmail, index) => (
                  <div
                    key={index}
                    className={`flex items-center border-b border-gray-800 last:border-0 ${
                      historyEmail === emailAddress ? 'bg-purple-900/30' : ''
                    }`}
                  >
                    <button
                      onClick={(e) => deleteFromHistory(historyEmail, e)}
                      className="px-3 py-3 text-gray-500 hover:text-red-500 hover:bg-red-900/20 transition-colors"
                      title="Hapus dari riwayat"
                    >
                      🗑️
                    </button>
                    <button
                      onClick={() => handleOpenFromHistory(historyEmail)}
                      className="flex-1 px-2 py-3 text-left hover:bg-gray-700 transition-colors flex items-center justify-between"
                    >
                      <span className={`font-mono text-sm ${historyEmail === emailAddress ? 'text-green-400' : 'text-gray-300'}`}>
                        {historyEmail}
                      </span>
                      {historyEmail === emailAddress && (
                        <span className="text-xs bg-green-600 px-2 py-0.5 rounded mr-2">Aktif</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={copyToClipboard}
              disabled={!emailAddress}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {copied ? '✓ Tersalin!' : '📋 Salin'}
            </button>
            <button
              onClick={fetchEmails}
              disabled={!emailAddress || loading}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gray-600 hover:bg-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? '⏳' : '🔄 Refresh'}
            </button>
          </div>

          {/* Create/Open Email Section */}
          <div className="border-t border-gray-700 pt-4">
            <p className="text-gray-400 text-sm mb-3">Buka atau buat email:</p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-gray-900 rounded-xl border border-gray-600 overflow-hidden">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && manualInput && handleOpenEmail()}
                  placeholder="ketik nama email..."
                  className="flex-1 bg-transparent px-4 py-2.5 text-white outline-none font-mono"
                />
                <span className="text-gray-500 pr-3 text-sm">@fdlnstore.com</span>
              </div>
              <button
                onClick={handleOpenEmail}
                disabled={!manualInput}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
                title="Buka email yang sudah ada"
              >
                🔓
              </button>
              <button
                onClick={handleCreateCustom}
                disabled={!manualInput}
                className="px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
                title="Buat email baru (butuh kode 2FA)"
              >
                ➕
              </button>
              <button
                onClick={handleGenerateRandom}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors"
                title="Generate random baru (butuh kode 2FA)"
              >
                🎲
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-2">🔓 Buka = masuk ke email yang sudah ada | ➕ Buat / 🎲 Random = perlu kode 2FA</p>
          </div>
        </div>

        {/* 2FA Verification Modal */}
        {modalType === 'verify2fa' && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-600 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-2">🔐 Verifikasi 2FA</h3>
              <p className="text-gray-400 text-sm mb-4">
                Masukkan 6 digit kode dari Google Authenticator untuk membuat email baru
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm">Kode 2FA</label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && totpCode.length === 6 && handleVerify2FA()}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full mt-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-center text-2xl font-mono tracking-widest outline-none focus:border-purple-500"
                    autoFocus
                  />
                </div>
                
                {modalError && (
                  <p className="text-red-400 text-sm">❌ {modalError}</p>
                )}
                
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={resetModal}
                    className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-medium transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleVerify2FA}
                    disabled={totpCode.length !== 6}
                    className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                  >
                    Verifikasi
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Password Modal */}
        {(modalType === 'create' || modalType === 'login' || modalType === 'forgot') && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-600 shadow-2xl">
              {/* Create Email Modal */}
              {modalType === 'create' && (
                <>
                  <h3 className="text-xl font-bold text-white mb-2">🔐 Buat Email Baru</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Email: <span className="text-green-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-gray-400 text-sm">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm">Konfirmasi Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi password"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-sm">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={resetModal}
                        className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-medium transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleCreateEmail}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                      >
                        {modalLoading ? '⏳' : '✓ Buat Email'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Login Modal */}
              {modalType === 'login' && (
                <>
                  <h3 className="text-xl font-bold text-white mb-2">🔓 Buka Email</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Email: <span className="text-green-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-gray-400 text-sm">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        placeholder="Masukkan password"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500"
                        autoFocus
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-sm">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={resetModal}
                        className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-medium transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleLogin}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                      >
                        {modalLoading ? '⏳' : '🔓 Buka'}
                      </button>
                    </div>
                    
                    <button
                      onClick={() => {
                        setModalType('forgot')
                        setPassword('')
                        setModalError('')
                      }}
                      className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      Lupa password?
                    </button>
                  </div>
                </>
              )}

              {/* Forgot Password Modal */}
              {modalType === 'forgot' && (
                <>
                  <h3 className="text-xl font-bold text-white mb-2">🔑 Ganti Password</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Email: <span className="text-green-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-gray-400 text-sm">Password Lama</label>
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="Masukkan password lama"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm">Password Baru</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-sm">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          setModalType('login')
                          setOldPassword('')
                          setNewPassword('')
                          setModalError('')
                        }}
                        className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-medium transition-colors"
                      >
                        Kembali
                      </button>
                      <button
                        onClick={handleForgotPassword}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                      >
                        {modalLoading ? '⏳' : '🔑 Ganti'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Inbox List */}
          <div className="md:col-span-1 bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-white flex items-center gap-2">
                📥 Inbox
                <span className="bg-purple-600 text-xs px-2 py-0.5 rounded-full">
                  {emails.length}
                </span>
              </h2>
              <button
                onClick={fetchEmails}
                disabled={loading}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {loading ? '⏳' : '🔄'}
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {emails.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p className="text-4xl mb-2">📭</p>
                  <p>Belum ada email</p>
                  <p className="text-sm mt-1">Email akan muncul otomatis</p>
                </div>
              ) : (
                emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`w-full p-4 text-left border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${
                      selectedEmail?.id === email.id ? 'bg-purple-900/30' : ''
                    }`}
                  >
                    <p className="font-medium text-white truncate">
                      {email.from_address}
                    </p>
                    <p className="text-sm text-gray-300 truncate">
                      {email.subject || '(Tanpa subjek)'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(email.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Email Detail */}
          <div className="md:col-span-2 bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700 overflow-hidden">
            {selectedEmail ? (
              <>
                <div className="p-4 border-b border-gray-700">
                  <h3 className="font-semibold text-white text-lg">
                    {selectedEmail.subject || '(Tanpa subjek)'}
                  </h3>
                  <div className="mt-2 text-sm text-gray-400">
                    <p><span className="text-gray-500">Dari:</span> {selectedEmail.from_address}</p>
                    <p><span className="text-gray-500">Kepada:</span> {selectedEmail.to_address}</p>
                    <p><span className="text-gray-500">Waktu:</span> {formatDate(selectedEmail.created_at)}</p>
                  </div>
                </div>
                <div className="p-4">
                  {selectedEmail.body_html ? (
                    <div
                      className="prose prose-invert max-w-none bg-white rounded-lg p-4"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                      style={{ color: 'black' }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-gray-300 font-sans">
                      {selectedEmail.body_text || '(Email kosong)'}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-gray-500 min-h-64">
                <div>
                  <p className="text-5xl mb-4">✉️</p>
                  <p>Pilih email untuk membaca</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-gray-800/30 rounded-2xl p-6 border border-gray-700">
          <h2 className="font-semibold text-white mb-4">ℹ️ Cara Pakai</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Salin alamat email di atas</li>
            <li>Gunakan untuk daftar di website/aplikasi</li>
            <li>Email masuk akan muncul otomatis di inbox</li>
            <li>Klik tombol &quot;Baru&quot; untuk generate alamat baru</li>
          </ol>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700 mt-8 py-6 text-center text-gray-500 text-sm">
        <p>© 2024 TempMail - fdlnstore.com</p>
      </footer>
    </div>
  )
}
