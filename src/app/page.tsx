'use client'

import Image from 'next/image'
import { useState, useEffect, useCallback } from 'react'
import { supabase, Email } from '@/lib/supabase'
import {
  DEFAULT_TEMPMAIL_DOMAIN,
  TEMPMAIL_DOMAINS,
  TempMailDomain,
  getDomainFromEmail,
} from '@/lib/email-domains'

// Verify TOTP via server-side API
async function verifyTOTP(code: string): Promise<boolean> {
  try {
    const res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
    const data = await res.json()
    return data.success === true
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

function normalizeEmailPrefix(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildEmailAddress(prefix: string, domain: TempMailDomain): string {
  return `${prefix}@${domain}`
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

type IconProps = { className?: string }

function IconBase({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function IconAlert({ className }: IconProps) {
  return <IconBase className={className}><circle cx="12" cy="12" r="10" /><path d="M12 8v5" /><path d="M12 17h.01" /></IconBase>
}

function IconAtSign({ className }: IconProps) {
  return <IconBase className={className}><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></IconBase>
}

function IconCheck({ className }: IconProps) {
  return <IconBase className={className}><path d="M20 6 9 17l-5-5" /></IconBase>
}

function IconCopy({ className }: IconProps) {
  return <IconBase className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><rect x="4" y="4" width="11" height="11" rx="2" /></IconBase>
}

function IconInbox({ className }: IconProps) {
  return <IconBase className={className}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></IconBase>
}

function IconKey({ className }: IconProps) {
  return <IconBase className={className}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8" /><path d="m15 8 3 3" /><path d="m17 6 3 3" /></IconBase>
}

function IconLoader({ className }: IconProps) {
  return <span className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-hidden="true" />
}

function IconLock({ className }: IconProps) {
  return <IconBase className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></IconBase>
}

function IconMail({ className }: IconProps) {
  return <IconBase className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></IconBase>
}

function IconPlus({ className }: IconProps) {
  return <IconBase className={className}><path d="M12 5v14" /><path d="M5 12h14" /></IconBase>
}

function IconRefresh({ className }: IconProps) {
  return <IconBase className={className}><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></IconBase>
}

function IconShuffle({ className }: IconProps) {
  return <IconBase className={className}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></IconBase>
}

function IconTrash({ className }: IconProps) {
  return <IconBase className={className}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" /></IconBase>
}

function IconUnlock({ className }: IconProps) {
  return <IconBase className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></IconBase>
}

const iconClass = 'h-4 w-4 shrink-0'
const surfaceClass = 'rounded-lg border border-purple-300/15 bg-purple-950/35 shadow-lg shadow-black/20 backdrop-blur'
const fieldClass = 'rounded-lg border border-purple-300/15 bg-slate-950/70 text-white outline-none transition focus-within:border-purple-300/70 focus-within:ring-2 focus-within:ring-purple-400/15'
const inputClass = 'w-full px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30'
const buttonBaseClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/45 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/35'
const primaryButtonClass = `${buttonBaseClass} border-purple-300/35 bg-purple-500/20 hover:bg-purple-500/30`
const secondaryButtonClass = `${buttonBaseClass} border-violet-300/35 bg-violet-500/18 hover:bg-violet-500/28`
const subtleButtonClass = `${buttonBaseClass} border-white/10 bg-white/5 hover:bg-white/10`
const accentButtonClass = `${buttonBaseClass} border-fuchsia-300/35 bg-fuchsia-500/18 hover:bg-fuchsia-500/28`
const dangerIconButtonClass = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/35 transition hover:bg-purple-500/10 hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/40'

// Generate random email address
function generateEmailAddress(domain: TempMailDomain): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return buildEmailAddress(result, domain)
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
  const [selectedDomain, setSelectedDomain] = useState<TempMailDomain>(DEFAULT_TEMPMAIL_DOMAIN)
  
  // Toast notification
  const [toast, setToast] = useState<string | null>(null)
  
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

  // Show toast notification
  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  // Generate new email on first load
  useEffect(() => {
    queueMicrotask(() => {
      const stored = localStorage.getItem('tempmail_address')
      if (stored) {
        setEmailAddress(stored)
        const storedDomain = getDomainFromEmail(stored)
        if (storedDomain) setSelectedDomain(storedDomain)
      }
      setEmailHistory(getEmailHistory())
    })
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
    if (!emailAddress) return

    queueMicrotask(() => {
      fetchEmails()
    })
    
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
  const handleVerify2FA = async () => {
    if (!totpCode || totpCode.length !== 6) {
      setModalError('Masukkan 6 digit kode')
      return
    }
    
    setModalLoading(true)
    const isValid = await verifyTOTP(totpCode)
    setModalLoading(false)
    
    if (!isValid) {
      setModalError('Kode tidak valid atau sudah expired')
      return
    }
    
    // 2FA valid - proceed with action
    if (pendingAction === 'random') {
      const newEmail = generateEmailAddress(selectedDomain)
      setModalEmail(newEmail)
      setModalType('create')
      setModalError('')
      setTotpCode('')
    } else if (pendingAction === 'custom') {
      const prefix = normalizeEmailPrefix(manualInput)
      if (prefix) {
        const fullEmail = buildEmailAddress(prefix, selectedDomain)
        setModalEmail(fullEmail)
        setModalType('create')
        setModalError('')
        setTotpCode('')
        setManualInput('')
      }
    }
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
    const prefix = normalizeEmailPrefix(manualInput)
    if (!prefix) return
    const fullEmail = buildEmailAddress(prefix, selectedDomain)
    
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
    const prefix = normalizeEmailPrefix(manualInput)
    if (!prefix) return
    const fullEmail = buildEmailAddress(prefix, selectedDomain)
    
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
      showToast('Email tidak ditemukan')
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#3b0764_0,#12081f_42%,#05030a_100%)] text-white">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[100] flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border border-fuchsia-300/20 bg-purple-950/95 px-4 py-3 shadow-xl shadow-black/30">
            <IconAlert className="h-4 w-4 shrink-0 text-fuchsia-200" />
            <span className="text-sm font-medium text-white">{toast}</span>
            <button 
              onClick={() => setToast(null)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-lg leading-none text-white/50 transition hover:bg-white/10 hover:text-white"
              aria-label="Tutup notifikasi"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-purple-200/10 bg-[#090311]/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Image src="/logo.png" alt="TempMail FdLnStore" width={40} height={40} className="h-9 w-9 object-contain sm:h-10 sm:w-10" priority />
            <h1 className="text-base font-semibold text-white sm:text-xl">TempMail FdLnStore</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:py-6">
        {/* Email Address Card */}
        <div className={cx(surfaceClass, 'relative z-20 mb-4 p-4 sm:mb-6 sm:p-5')}>
          <p className="mb-2 text-xs font-medium uppercase text-white/50">Alamat email</p>
          
          {/* Email Display with Dropdown */}
          <div className="relative mb-3 z-30">
            <div 
              onClick={() => {
                if (emailHistory.length > 0) setShowHistory(!showHistory)
              }}
              className={cx(fieldClass, 'flex cursor-pointer items-center justify-between px-3 py-3 font-mono text-sm text-purple-200 hover:border-purple-300/60 sm:px-4 sm:text-base')}
            >
              <span className="min-w-0 truncate">{emailAddress || 'Belum ada email'}</span>
              {emailHistory.length > 0 && (
                <span className={`ml-2 text-white/40 transition-transform ${showHistory ? 'rotate-180' : ''}`}>▼</span>
              )}
            </div>
            
            {/* History Dropdown */}
            {showHistory && emailHistory.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/95 shadow-xl shadow-black/30">
                {emailHistory.map((historyEmail, index) => (
                  <div
                    key={index}
                    className={`flex items-center border-b border-white/5 last:border-0 ${
                      historyEmail === emailAddress ? 'bg-purple-500/15' : ''
                    }`}
                  >
                    <button
                      onClick={(e) => deleteFromHistory(historyEmail, e)}
                      className={dangerIconButtonClass}
                      aria-label={`Hapus ${historyEmail} dari riwayat`}
                    >
                      <IconTrash className={iconClass} />
                    </button>
                    <button
                      onClick={() => handleOpenFromHistory(historyEmail)}
                      className="flex min-w-0 flex-1 items-center justify-between px-2 py-2 text-left transition hover:bg-white/5"
                    >
                      <span className={`truncate font-mono text-xs sm:text-sm ${historyEmail === emailAddress ? 'text-purple-200' : 'text-white/70'}`}>
                        {historyEmail}
                      </span>
                      {historyEmail === emailAddress && (
                        <span className="ml-2 rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-100 sm:text-xs">Aktif</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4">
            <button
              onClick={copyToClipboard}
              disabled={!emailAddress}
              className={subtleButtonClass}
            >
              {copied ? (
                <>
                  <IconCheck className={iconClass} />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <IconCopy className={iconClass} />
                  <span>Salin</span>
                </>
              )}
            </button>
            <button
              onClick={fetchEmails}
              disabled={!emailAddress || loading}
              className={subtleButtonClass}
            >
              {loading ? (
                <>
                  <IconLoader />
                  <span>Refresh</span>
                </>
              ) : (
                <>
                  <IconRefresh className={iconClass} />
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>

          {/* Create/Open Email Section */}
          <div className="border-t border-white/10 pt-3 sm:pt-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className={cx(fieldClass, 'flex flex-1 items-center overflow-hidden')}>
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(normalizeEmailPrefix(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && manualInput && handleOpenEmail()}
                    placeholder="nama email..."
                    className={cx(inputClass, 'min-w-0 flex-1 bg-transparent font-mono')}
                  />
                </div>
                <div className={cx(fieldClass, 'flex items-center overflow-hidden sm:w-52')}>
                  <IconAtSign className="ml-3 h-4 w-4 shrink-0 text-purple-200/40" />
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value as TempMailDomain)}
                    aria-label="Pilih domain email"
                    className="w-full cursor-pointer bg-transparent px-2 py-2.5 font-mono text-sm text-white outline-none [&>option]:bg-slate-900 [&>option]:text-white"
                  >
                    {TEMPMAIL_DOMAINS.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleOpenEmail}
                  disabled={!manualInput}
                  className={secondaryButtonClass}
                  title="Akses email"
                >
                  <IconUnlock className={iconClass} />
                  <span>Akses</span><span className="hidden sm:inline"> Email</span>
                </button>
                <button
                  onClick={handleCreateCustom}
                  disabled={!manualInput}
                  className={primaryButtonClass}
                  title="Buat email"
                >
                  <IconPlus className={iconClass} />
                  <span>Buat</span><span className="hidden sm:inline"> Email</span>
                </button>
                <button
                  onClick={handleGenerateRandom}
                  className={accentButtonClass}
                  title="Buat email acak"
                >
                  <IconShuffle className={iconClass} />
                  <span>Random</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2FA Verification Modal */}
        {modalType === 'verify2fa' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
            <div className={cx(surfaceClass, 'max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto p-5 sm:p-6')}>
              <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
                <IconLock className="h-5 w-5 text-purple-200" />
                <span>Verifikasi 2FA</span>
              </h3>
              <p className="mb-4 text-sm text-white/50">
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
                  className="w-full rounded-lg border border-purple-300/15 bg-slate-950/70 px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-white outline-none transition focus:border-purple-300/70 focus:ring-2 focus:ring-purple-400/15"
                  autoFocus
                />
                
                {modalError && (
                  <p className="flex items-center justify-center gap-2 text-sm text-fuchsia-200">
                    <IconAlert className={iconClass} />
                    <span>{modalError}</span>
                  </p>
                )}
                
                <div className="flex gap-2">
                  <button
                    onClick={resetModal}
                    disabled={modalLoading}
                    className={cx(subtleButtonClass, 'flex-1')}
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleVerify2FA}
                    disabled={totpCode.length !== 6 || modalLoading}
                    className={cx(accentButtonClass, 'flex-1')}
                  >
                    {modalLoading ? <IconLoader /> : 'Verifikasi'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Password Modal */}
        {(modalType === 'create' || modalType === 'login' || modalType === 'forgot') && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
            <div className={cx(surfaceClass, 'max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto p-5 sm:p-6')}>
              {/* Create Email Modal */}
              {modalType === 'create' && (
                <>
                  <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-white">
                    <IconLock className="h-5 w-5 text-purple-200" />
                    <span>Buat Email Baru</span>
                  </h3>
                  <p className="mb-4 text-xs text-white/50 sm:text-sm">
                    <span className="break-all font-mono text-purple-200">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-white/50">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className={cx(fieldClass, inputClass, 'mt-1')}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-white/50">Konfirmasi Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi password"
                        className={cx(fieldClass, inputClass, 'mt-1')}
                      />
                    </div>
                    
                    {modalError && (
                      <p className="flex items-center justify-center gap-2 text-xs text-fuchsia-200">
                        <IconAlert className={iconClass} />
                        <span>{modalError}</span>
                      </p>
                    )}
                    
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={resetModal}
                        className={cx(subtleButtonClass, 'flex-1')}
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleCreateEmail}
                        disabled={modalLoading}
                        className={cx(primaryButtonClass, 'flex-1')}
                      >
                        {modalLoading ? (
                          <IconLoader />
                        ) : (
                          <>
                            <IconCheck className={iconClass} />
                            <span>Buat</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Login Modal */}
              {modalType === 'login' && (
                <>
                  <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-white">
                    <IconUnlock className="h-5 w-5 text-purple-200" />
                    <span>Buka Email</span>
                  </h3>
                  <p className="mb-4 text-xs text-white/50 sm:text-sm">
                    <span className="break-all font-mono text-purple-200">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-white/50">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        placeholder="Masukkan password"
                        className={cx(fieldClass, inputClass, 'mt-1')}
                        autoFocus
                      />
                    </div>
                    
                    {modalError && (
                      <p className="flex items-center justify-center gap-2 text-xs text-fuchsia-200">
                        <IconAlert className={iconClass} />
                        <span>{modalError}</span>
                      </p>
                    )}
                    
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={resetModal}
                        className={cx(subtleButtonClass, 'flex-1')}
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleLogin}
                        disabled={modalLoading}
                        className={cx(secondaryButtonClass, 'flex-1')}
                      >
                        {modalLoading ? (
                          <IconLoader />
                        ) : (
                          <>
                            <IconUnlock className={iconClass} />
                            <span>Buka</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    <button
                      onClick={() => {
                        setModalType('forgot')
                        setPassword('')
                        setModalError('')
                      }}
                      className="w-full rounded-md py-1.5 text-center text-xs text-white/45 transition hover:bg-white/5 hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/40"
                    >
                      Lupa password?
                    </button>
                  </div>
                </>
              )}

              {/* Forgot Password Modal */}
              {modalType === 'forgot' && (
                <>
                  <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-white">
                    <IconKey className="h-5 w-5 text-purple-200" />
                    <span>Ganti Password</span>
                  </h3>
                  <p className="mb-4 text-xs text-white/50 sm:text-sm">
                    <span className="break-all font-mono text-purple-200">{modalEmail}</span>
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-white/50">Password Lama</label>
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="Masukkan password lama"
                        className={cx(fieldClass, inputClass, 'mt-1')}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-white/50">Password Baru</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className={cx(fieldClass, inputClass, 'mt-1')}
                      />
                    </div>
                    
                    {modalError && (
                      <p className="flex items-center justify-center gap-2 text-xs text-fuchsia-200">
                        <IconAlert className={iconClass} />
                        <span>{modalError}</span>
                      </p>
                    )}
                    
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          setModalType('login')
                          setOldPassword('')
                          setNewPassword('')
                          setModalError('')
                        }}
                        className={cx(subtleButtonClass, 'flex-1')}
                      >
                        Kembali
                      </button>
                      <button
                        onClick={handleForgotPassword}
                        disabled={modalLoading}
                        className={cx(accentButtonClass, 'flex-1')}
                      >
                        {modalLoading ? (
                          <IconLoader />
                        ) : (
                          <>
                            <IconKey className={iconClass} />
                            <span>Ganti</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Inbox List */}
          <div className={cx(surfaceClass, 'overflow-hidden')}>
            <div className="flex items-center justify-between border-b border-white/10 p-3 sm:p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white sm:text-base">
                <IconInbox className="h-4 w-4 text-purple-200" />
                <span>Inbox</span>
                <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-xs text-purple-100">
                  {emails.length}
                </span>
              </h2>
              <button
                onClick={fetchEmails}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-md text-sm text-white/45 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:text-white/25"
                aria-label="Refresh inbox"
              >
                {loading ? <IconLoader /> : <IconRefresh className={iconClass} />}
              </button>
            </div>
            
            <div className="max-h-72 overflow-y-auto lg:max-h-[520px]">
              {emails.length === 0 ? (
                <div className="p-8 text-center text-white/40">
                  <IconInbox className="mx-auto mb-3 h-9 w-9 text-purple-200/45" />
                  <p className="text-sm">Belum ada email</p>
                  <p className="mt-1 text-xs text-white/30">Email akan muncul otomatis</p>
                </div>
              ) : (
                emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`w-full border-b border-white/5 p-3 text-left transition hover:bg-white/5 ${
                      selectedEmail?.id === email.id ? 'bg-purple-500/15' : ''
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {email.from_address}
                    </p>
                    <p className="truncate text-xs text-white/60">
                      {email.subject || '(Tanpa subjek)'}
                    </p>
                    <p className="mt-1 text-[10px] text-white/30">
                      {formatDate(email.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Email Detail */}
          <div className={cx(surfaceClass, 'min-w-0 overflow-hidden')}>
            {selectedEmail ? (
              <>
                <div className="border-b border-white/10 p-3 sm:p-4">
                  <h3 className="break-words text-sm font-semibold text-white sm:text-base">
                    {selectedEmail.subject || '(Tanpa subjek)'}
                  </h3>
                  <div className="mt-2 space-y-0.5 break-words text-xs text-white/50">
                    <p><span className="text-white/30">Dari:</span> <span className="font-mono">{selectedEmail.from_address}</span></p>
                    <p><span className="text-white/30">Kepada:</span> <span className="font-mono">{selectedEmail.to_address}</span></p>
                    <p><span className="text-white/30">Waktu:</span> {formatDate(selectedEmail.created_at)}</p>
                  </div>
                </div>
                <div className="max-h-[560px] overflow-auto p-3 sm:p-4">
                  {selectedEmail.body_html ? (
                    <div
                      className="prose prose-sm max-w-none rounded-lg bg-white p-3 text-sm sm:p-4"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                      style={{ color: 'black' }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm text-white/70">
                      {selectedEmail.body_text || '(Email kosong)'}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-64 items-center justify-center p-8 text-center text-white/30 lg:min-h-[420px]">
                <div>
                  <IconMail className="mx-auto mb-3 h-10 w-10 text-purple-200/35" />
                  <p className="text-sm">Pilih email untuk membaca</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 border-t border-white/10 py-4 text-center text-xs text-white/30">
        <p>© FdLnStore</p>
      </footer>
    </div>
  )
}
