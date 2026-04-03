'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, Email } from '@/lib/supabase'

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
  // Remove if already exists, then add to front
  const filtered = history.filter(e => e !== email)
  const newHistory = [email, ...filtered].slice(0, 20) // Keep max 20 emails
  localStorage.setItem('tempmail_history', JSON.stringify(newHistory))
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

  // Generate new email on first load
  useEffect(() => {
    const stored = localStorage.getItem('tempmail_address')
    if (stored) {
      setEmailAddress(stored)
      saveToHistory(stored)
    } else {
      generateNewEmail()
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

  const generateNewEmail = () => {
    const newEmail = generateEmailAddress()
    setEmailAddress(newEmail)
    localStorage.setItem('tempmail_address', newEmail)
    saveToHistory(newEmail)
    setEmailHistory(getEmailHistory())
    setEmails([])
    setSelectedEmail(null)
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

  const createCustomEmail = () => {
    if (!manualInput.trim()) return
    const prefix = manualInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!prefix) return
    const fullEmail = `${prefix}@fdlnstore.com`
    setEmailAddress(fullEmail)
    localStorage.setItem('tempmail_address', fullEmail)
    saveToHistory(fullEmail)
    setEmailHistory(getEmailHistory())
    setEmails([])
    setSelectedEmail(null)
    setManualInput('')
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
                  <button
                    key={index}
                    onClick={() => switchToEmail(historyEmail)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center justify-between border-b border-gray-800 last:border-0 ${
                      historyEmail === emailAddress ? 'bg-purple-900/30' : ''
                    }`}
                  >
                    <span className={`font-mono text-sm ${historyEmail === emailAddress ? 'text-green-400' : 'text-gray-300'}`}>
                      {historyEmail}
                    </span>
                    {historyEmail === emailAddress && (
                      <span className="text-xs bg-green-600 px-2 py-0.5 rounded">Aktif</span>
                    )}
                  </button>
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

          {/* Create New Email Section */}
          <div className="border-t border-gray-700 pt-4">
            <p className="text-gray-400 text-sm mb-3">Buat email baru:</p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-gray-900 rounded-xl border border-gray-600 overflow-hidden">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && manualInput && createCustomEmail()}
                  placeholder="ketik nama email..."
                  className="flex-1 bg-transparent px-4 py-2.5 text-white outline-none font-mono"
                />
                <span className="text-gray-500 pr-3 text-sm">@fdlnstore.com</span>
              </div>
              <button
                onClick={createCustomEmail}
                disabled={!manualInput}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
                title="Buat dengan nama custom"
              >
                ➕
              </button>
              <button
                onClick={generateNewEmail}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors"
                title="Generate random"
              >
                🎲
              </button>
            </div>
          </div>
        </div>

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
