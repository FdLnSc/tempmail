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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
            <h1 className="text-2xl font-semibold text-white tracking-tight">TempMail FdLnStore</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Email Address Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 mb-8 border border-white/10 relative z-20 shadow-2xl transition-all duration-500 hover:bg-white/[0.07]">
          <p className="text-white/60 text-sm mb-3 font-medium">Alamat email sementara Anda:</p>
          
          {/* Email Display with Dropdown */}
          <div className="relative mb-4 z-30">
            <div className="flex items-center">
              <div 
                onClick={() => {
                  if (emailHistory.length > 0) setShowHistory(!showHistory)
                }}
                className="flex-1 bg-black/30 backdrop-blur-sm rounded-2xl px-5 py-4 font-mono text-lg text-purple-400 border border-white/10 cursor-pointer hover:border-purple-500/50 transition-all duration-300 flex items-center justify-between group"
              >
                <span className="group-hover:text-purple-300 transition-colors">{emailAddress || 'Belum ada email'}</span>
                {emailHistory.length > 0 && (
                  <span className={`ml-2 transition-all duration-300 text-white/40 ${showHistory ? 'rotate-180' : ''}`}>▼</span>
                )}
              </div>
            </div>
            
            {/* History Dropdown */}
            {showHistory && emailHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden z-50 shadow-2xl max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                {emailHistory.map((historyEmail, index) => (
                  <div
                    key={index}
                    className={`flex items-center border-b border-white/5 last:border-0 transition-colors duration-200 ${
                      historyEmail === emailAddress ? 'bg-purple-500/20' : 'hover:bg-white/5'
                    }`}
                  >
                    <button
                      onClick={(e) => deleteFromHistory(historyEmail, e)}
                      className="px-4 py-3 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                      title="Hapus dari riwayat"
                    >
                      🗑️
                    </button>
                    <button
                      onClick={() => handleOpenFromHistory(historyEmail)}
                      className="flex-1 px-3 py-3 text-left hover:bg-white/5 transition-all duration-200 flex items-center justify-between"
                    >
                      <span className={`font-mono text-sm ${historyEmail === emailAddress ? 'text-purple-400' : 'text-white/70'}`}>
                        {historyEmail}
                      </span>
                      {historyEmail === emailAddress && (
                        <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full mr-2">Aktif</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mb-5">
            <button
              onClick={copyToClipboard}
              disabled={!emailAddress}
              className="flex-1 sm:flex-none px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 disabled:bg-white/5 disabled:border-white/10 disabled:cursor-not-allowed text-white rounded-2xl font-medium transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              {copied ? '✓ Tersalin!' : '📋 Salin'}
            </button>
            <button
              onClick={fetchEmails}
              disabled={!emailAddress || loading}
              className="flex-1 sm:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 disabled:cursor-not-allowed text-white rounded-2xl font-medium transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? '⏳' : '🔄 Refresh'}
            </button>
          </div>

          {/* Create/Open Email Section */}
          <div className="border-t border-white/10 pt-5">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-black/30 rounded-2xl border border-white/10 overflow-hidden transition-all duration-300 focus-within:border-purple-500/50 focus-within:bg-black/40">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && manualInput && handleOpenEmail()}
                  placeholder="ketik nama email..."
                  className="flex-1 bg-transparent px-5 py-3 text-white outline-none font-mono placeholder:text-white/30"
                />
                <span className="text-white/30 pr-4 text-sm">@fdlnstore.com</span>
              </div>
              <button
                onClick={handleOpenEmail}
                disabled={!manualInput}
                className="px-5 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 disabled:bg-white/5 disabled:border-white/10 disabled:cursor-not-allowed text-white rounded-2xl font-medium transition-all duration-300 hover:scale-105 active:scale-95"
                title="Buka email yang sudah ada"
              >
                🔓
              </button>
              <button
                onClick={handleCreateCustom}
                disabled={!manualInput}
                className="px-5 py-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 disabled:bg-white/5 disabled:border-white/10 disabled:cursor-not-allowed text-white rounded-2xl font-medium transition-all duration-300 hover:scale-105 active:scale-95"
                title="Buat email baru (butuh kode 2FA)"
              >
                ➕
              </button>
              <button
                onClick={handleGenerateRandom}
                className="px-5 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-white rounded-2xl font-medium transition-all duration-300 hover:scale-105 active:scale-95"
                title="Generate random baru (butuh kode 2FA)"
              >
                🎲
              </button>
            </div>
          </div>
        </div>

        {/* 2FA Verification Modal */}
        {modalType === 'verify2fa' && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900/90 backdrop-blur-xl rounded-3xl p-8 w-full max-w-md border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
              <h3 className="text-xl font-semibold text-white mb-2">🔐 Verifikasi 2FA</h3>
              <p className="text-white/50 text-sm mb-6">
                Masukkan 6 digit kode dari Google Authenticator
              </p>
              
              <div className="space-y-5">
                <div>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && totpCode.length === 6 && handleVerify2FA()}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-4 text-white text-center text-3xl font-mono tracking-[0.5em] outline-none focus:border-purple-500/50 transition-all duration-300"
                    autoFocus
                  />
                </div>
                
                {modalError && (
                  <p className="text-red-400 text-sm text-center">❌ {modalError}</p>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={resetModal}
                    className="flex-1 px-4 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleVerify2FA}
                    disabled={totpCode.length !== 6}
                    className="flex-1 px-4 py-3.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900/90 backdrop-blur-xl rounded-3xl p-8 w-full max-w-md border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
              {/* Create Email Modal */}
              {modalType === 'create' && (
                <>
                  <h3 className="text-xl font-semibold text-white mb-2">🔐 Buat Email Baru</h3>
                  <p className="text-white/50 text-sm mb-6">
                    Email: <span className="text-purple-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="text-white/50 text-sm">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className="w-full mt-2 bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-purple-500/50 transition-all duration-300"
                      />
                    </div>
                    <div>
                      <label className="text-white/50 text-sm">Konfirmasi Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi password"
                        className="w-full mt-2 bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-purple-500/50 transition-all duration-300"
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-sm text-center">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={resetModal}
                        className="flex-1 px-4 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleCreateEmail}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-3.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
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
                  <h3 className="text-xl font-semibold text-white mb-2">🔓 Buka Email</h3>
                  <p className="text-white/50 text-sm mb-6">
                    Email: <span className="text-purple-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="text-white/50 text-sm">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        placeholder="Masukkan password"
                        className="w-full mt-2 bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-purple-500/50 transition-all duration-300"
                        autoFocus
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-sm text-center">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={resetModal}
                        className="flex-1 px-4 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleLogin}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-3.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
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
                      className="w-full text-center text-sm text-white/40 hover:text-white/70 transition-colors duration-200"
                    >
                      Lupa password?
                    </button>
                  </div>
                </>
              )}

              {/* Forgot Password Modal */}
              {modalType === 'forgot' && (
                <>
                  <h3 className="text-xl font-semibold text-white mb-2">🔑 Ganti Password</h3>
                  <p className="text-white/50 text-sm mb-6">
                    Email: <span className="text-purple-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="text-white/50 text-sm">Password Lama</label>
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="Masukkan password lama"
                        className="w-full mt-2 bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-purple-500/50 transition-all duration-300"
                      />
                    </div>
                    <div>
                      <label className="text-white/50 text-sm">Password Baru</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className="w-full mt-2 bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-purple-500/50 transition-all duration-300"
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-sm text-center">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => {
                          setModalType('login')
                          setOldPassword('')
                          setNewPassword('')
                          setModalError('')
                        }}
                        className="flex-1 px-4 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
                      >
                        Kembali
                      </button>
                      <button
                        onClick={handleForgotPassword}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-3.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-2xl font-medium transition-all duration-300"
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
          <div className="md:col-span-1 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden transition-all duration-500 hover:bg-white/[0.07]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-semibold text-white flex items-center gap-2">
                📥 Inbox
                <span className="bg-purple-500/30 text-purple-300 text-xs px-2.5 py-1 rounded-full">
                  {emails.length}
                </span>
              </h2>
              <button
                onClick={fetchEmails}
                disabled={loading}
                className="text-white/40 hover:text-white transition-all duration-200 hover:scale-110"
              >
                {loading ? '⏳' : '🔄'}
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {emails.length === 0 ? (
                <div className="p-10 text-center text-white/40">
                  <p className="text-5xl mb-3">📭</p>
                  <p className="font-medium">Belum ada email</p>
                  <p className="text-sm mt-1 text-white/30">Email akan muncul otomatis</p>
                </div>
              ) : (
                emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`w-full p-4 text-left border-b border-white/5 hover:bg-white/5 transition-all duration-200 ${
                      selectedEmail?.id === email.id ? 'bg-purple-500/20' : ''
                    }`}
                  >
                    <p className="font-medium text-white truncate">
                      {email.from_address}
                    </p>
                    <p className="text-sm text-white/60 truncate">
                      {email.subject || '(Tanpa subjek)'}
                    </p>
                    <p className="text-xs text-white/30 mt-1">
                      {formatDate(email.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Email Detail */}
          <div className="md:col-span-2 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden transition-all duration-500 hover:bg-white/[0.07]">
            {selectedEmail ? (
              <>
                <div className="p-5 border-b border-white/10">
                  <h3 className="font-semibold text-white text-lg">
                    {selectedEmail.subject || '(Tanpa subjek)'}
                  </h3>
                  <div className="mt-3 text-sm text-white/50 space-y-1">
                    <p><span className="text-white/30">Dari:</span> {selectedEmail.from_address}</p>
                    <p><span className="text-white/30">Kepada:</span> {selectedEmail.to_address}</p>
                    <p><span className="text-white/30">Waktu:</span> {formatDate(selectedEmail.created_at)}</p>
                  </div>
                </div>
                <div className="p-5">
                  {selectedEmail.body_html ? (
                    <div
                      className="prose prose-invert max-w-none bg-white rounded-2xl p-5"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                      style={{ color: 'black' }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-white/70 font-sans">
                      {selectedEmail.body_text || '(Email kosong)'}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center p-10 text-center text-white/30 min-h-64">
                <div>
                  <p className="text-6xl mb-4">✉️</p>
                  <p className="font-medium">Pilih email untuk membaca</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-8 py-6 text-center text-white/30 text-sm">
        <p>© 2024 TempMail FdLnStore</p>
      </footer>
    </div>
  )
}
