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

// Get authenticated emails from sessionStorage
function getAuthenticatedEmails(): string[] {
  if (typeof window === 'undefined') return []
  const auth = sessionStorage.getItem('tempmail_authenticated')
  return auth ? JSON.parse(auth) : []
}

// Save email as authenticated in session
function saveAsAuthenticated(email: string) {
  const authenticated = getAuthenticatedEmails()
  if (!authenticated.includes(email)) {
    authenticated.push(email)
    sessionStorage.setItem('tempmail_authenticated', JSON.stringify(authenticated))
  }
}

// Check if email is already authenticated
function isAuthenticated(email: string): boolean {
  return getAuthenticatedEmails().includes(email)
}

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
      saveAsAuthenticated(modalEmail)
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
      saveAsAuthenticated(modalEmail)
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

  // Open email from history - skip password if already authenticated
  const handleOpenFromHistory = (email: string) => {
    if (isAuthenticated(email)) {
      // Already authenticated in this session, switch directly
      switchToEmail(email)
    } else {
      // Need to login
      openLoginModal(email)
      setShowHistory(false)
    }
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
        <div className="max-w-4xl mx-auto px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
            <h1 className="text-lg sm:text-2xl font-semibold text-white">TempMail FdLnStore</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-6">
        {/* Email Address Card */}
        <div className="bg-white/5 rounded-2xl p-4 sm:p-5 mb-4 sm:mb-6 border border-white/10 relative z-20">
          <p className="text-white/60 text-xs sm:text-sm mb-2">Alamat email:</p>
          
          {/* Email Display with Dropdown */}
          <div className="relative mb-3 z-30">
            <div 
              onClick={() => {
                if (emailHistory.length > 0) setShowHistory(!showHistory)
              }}
              className="bg-black/30 rounded-xl px-3 py-3 sm:px-4 font-mono text-sm sm:text-base text-purple-400 border border-white/10 cursor-pointer hover:border-purple-500/50 transition-colors flex items-center justify-between"
            >
              <span className="truncate">{emailAddress || 'Belum ada email'}</span>
              {emailHistory.length > 0 && (
                <span className={`ml-2 text-white/40 transition-transform ${showHistory ? 'rotate-180' : ''}`}>▼</span>
              )}
            </div>
            
            {/* History Dropdown */}
            {showHistory && emailHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-black/95 rounded-xl border border-white/10 overflow-hidden z-50 shadow-xl max-h-48 overflow-y-auto">
                {emailHistory.map((historyEmail, index) => (
                  <div
                    key={index}
                    className={`flex items-center border-b border-white/5 last:border-0 ${
                      historyEmail === emailAddress ? 'bg-purple-500/20' : ''
                    }`}
                  >
                    <button
                      onClick={(e) => deleteFromHistory(historyEmail, e)}
                      className="px-2 sm:px-3 py-2 text-white/30 hover:text-red-400 text-sm"
                    >
                      🗑️
                    </button>
                    <button
                      onClick={() => handleOpenFromHistory(historyEmail)}
                      className="flex-1 px-2 py-2 text-left flex items-center justify-between"
                    >
                      <span className={`font-mono text-xs sm:text-sm truncate ${historyEmail === emailAddress ? 'text-purple-400' : 'text-white/70'}`}>
                        {historyEmail}
                      </span>
                      {historyEmail === emailAddress && (
                        <span className="text-[10px] sm:text-xs bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full ml-1">Aktif</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mb-3 sm:mb-4">
            <button
              onClick={copyToClipboard}
              disabled={!emailAddress}
              className="flex-1 px-3 sm:px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 disabled:bg-white/5 disabled:border-white/10 disabled:cursor-not-allowed text-white rounded-xl text-sm sm:text-base"
            >
              {copied ? '✓ Tersalin!' : '📋 Salin'}
            </button>
            <button
              onClick={fetchEmails}
              disabled={!emailAddress || loading}
              className="flex-1 px-3 sm:px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 disabled:cursor-not-allowed text-white rounded-xl text-sm sm:text-base"
            >
              {loading ? '⏳' : '🔄 Refresh'}
            </button>
          </div>

          {/* Create/Open Email Section */}
          <div className="border-t border-white/10 pt-3 sm:pt-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center bg-black/30 rounded-xl border border-white/10 overflow-hidden">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && manualInput && handleOpenEmail()}
                  placeholder="ketik nama..."
                  className="flex-1 bg-transparent px-3 py-2.5 text-white outline-none font-mono text-sm placeholder:text-white/30"
                />
                <span className="text-white/30 pr-2 text-xs sm:text-sm">@fdlnstore.com</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleOpenEmail}
                  disabled={!manualInput}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 disabled:bg-white/5 disabled:border-white/10 disabled:cursor-not-allowed text-white rounded-xl"
                  title="Buka"
                >
                  🔓
                </button>
                <button
                  onClick={handleCreateCustom}
                  disabled={!manualInput}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 disabled:bg-white/5 disabled:border-white/10 disabled:cursor-not-allowed text-white rounded-xl"
                  title="Buat"
                >
                  ➕
                </button>
                <button
                  onClick={handleGenerateRandom}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-white rounded-xl"
                  title="Random"
                >
                  🎲
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2FA Verification Modal */}
        {modalType === 'verify2fa' && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3">
            <div className="bg-gray-900/95 rounded-2xl p-5 sm:p-6 w-full max-w-sm border border-white/10 shadow-xl">
              <h3 className="text-lg font-semibold text-white mb-2">🔐 Verifikasi 2FA</h3>
              <p className="text-white/50 text-sm mb-4">
                Masukkan 6 digit kode dari Google Authenticator
              </p>
              
              <div className="space-y-4">
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && totpCode.length === 6 && handleVerify2FA()}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.4em] outline-none focus:border-purple-500/50"
                  autoFocus
                />
                
                {modalError && (
                  <p className="text-red-400 text-sm text-center">❌ {modalError}</p>
                )}
                
                <div className="flex gap-2">
                  <button
                    onClick={resetModal}
                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleVerify2FA}
                    disabled={totpCode.length !== 6}
                    className="flex-1 px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-xl"
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
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3">
            <div className="bg-gray-900/95 rounded-2xl p-5 sm:p-6 w-full max-w-sm border border-white/10 shadow-xl">
              {/* Create Email Modal */}
              {modalType === 'create' && (
                <>
                  <h3 className="text-lg font-semibold text-white mb-1">🔐 Buat Email Baru</h3>
                  <p className="text-white/50 text-xs sm:text-sm mb-4">
                    <span className="text-purple-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-white/50 text-xs">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className="w-full mt-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs">Konfirmasi Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi password"
                        className="w-full mt-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50"
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-xs text-center">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={resetModal}
                        className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleCreateEmail}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-2.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-xl text-sm"
                      >
                        {modalLoading ? '⏳' : '✓ Buat'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Login Modal */}
              {modalType === 'login' && (
                <>
                  <h3 className="text-lg font-semibold text-white mb-1">🔓 Buka Email</h3>
                  <p className="text-white/50 text-xs sm:text-sm mb-4">
                    <span className="text-purple-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-white/50 text-xs">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        placeholder="Masukkan password"
                        className="w-full mt-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50"
                        autoFocus
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-xs text-center">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={resetModal}
                        className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleLogin}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-xl text-sm"
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
                      className="w-full text-center text-xs text-white/40 hover:text-white/70"
                    >
                      Lupa password?
                    </button>
                  </div>
                </>
              )}

              {/* Forgot Password Modal */}
              {modalType === 'forgot' && (
                <>
                  <h3 className="text-lg font-semibold text-white mb-1">🔑 Ganti Password</h3>
                  <p className="text-white/50 text-xs sm:text-sm mb-4">
                    <span className="text-purple-400 font-mono">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-white/50 text-xs">Password Lama</label>
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="Masukkan password lama"
                        className="w-full mt-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs">Password Baru</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className="w-full mt-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50"
                      />
                    </div>
                    
                    {modalError && (
                      <p className="text-red-400 text-xs text-center">❌ {modalError}</p>
                    )}
                    
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          setModalType('login')
                          setOldPassword('')
                          setNewPassword('')
                          setModalError('')
                        }}
                        className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm"
                      >
                        Kembali
                      </button>
                      <button
                        onClick={handleForgotPassword}
                        disabled={modalLoading}
                        className="flex-1 px-4 py-2.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 disabled:bg-white/5 disabled:border-white/10 text-white rounded-xl text-sm"
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* Inbox List */}
          <div className="md:col-span-1 bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-medium text-white text-sm sm:text-base flex items-center gap-2">
                📥 Inbox
                <span className="bg-purple-500/30 text-purple-300 text-xs px-2 py-0.5 rounded-full">
                  {emails.length}
                </span>
              </h2>
              <button
                onClick={fetchEmails}
                disabled={loading}
                className="text-white/40 hover:text-white text-sm"
              >
                {loading ? '⏳' : '🔄'}
              </button>
            </div>
            
            <div className="max-h-64 sm:max-h-80 overflow-y-auto">
              {emails.length === 0 ? (
                <div className="p-6 sm:p-8 text-center text-white/40">
                  <p className="text-4xl mb-2">📭</p>
                  <p className="text-sm">Belum ada email</p>
                  <p className="text-xs mt-1 text-white/30">Email akan muncul otomatis</p>
                </div>
              ) : (
                emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`w-full p-3 text-left border-b border-white/5 hover:bg-white/5 ${
                      selectedEmail?.id === email.id ? 'bg-purple-500/20' : ''
                    }`}
                  >
                    <p className="font-medium text-white text-sm truncate">
                      {email.from_address}
                    </p>
                    <p className="text-xs text-white/60 truncate">
                      {email.subject || '(Tanpa subjek)'}
                    </p>
                    <p className="text-[10px] text-white/30 mt-1">
                      {formatDate(email.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Email Detail */}
          <div className="md:col-span-2 bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            {selectedEmail ? (
              <>
                <div className="p-3 sm:p-4 border-b border-white/10">
                  <h3 className="font-medium text-white text-sm sm:text-base">
                    {selectedEmail.subject || '(Tanpa subjek)'}
                  </h3>
                  <div className="mt-2 text-xs text-white/50 space-y-0.5">
                    <p><span className="text-white/30">Dari:</span> {selectedEmail.from_address}</p>
                    <p><span className="text-white/30">Kepada:</span> {selectedEmail.to_address}</p>
                    <p><span className="text-white/30">Waktu:</span> {formatDate(selectedEmail.created_at)}</p>
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  {selectedEmail.body_html ? (
                    <div
                      className="prose prose-sm max-w-none bg-white rounded-xl p-3 sm:p-4 text-sm"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                      style={{ color: 'black' }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-white/70 font-sans text-sm">
                      {selectedEmail.body_text || '(Email kosong)'}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center p-8 text-center text-white/30 min-h-48">
                <div>
                  <p className="text-4xl mb-2">✉️</p>
                  <p className="text-sm">Pilih email untuk membaca</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-8 py-4 text-center text-white/30 text-xs">
        <p>© FdLnStore</p>
      </footer>
    </div>
  )
}
