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

export default function Home() {
  const [emailAddress, setEmailAddress] = useState<string>('')
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  // Generate new email on first load
  useEffect(() => {
    const stored = localStorage.getItem('tempmail_address')
    if (stored) {
      setEmailAddress(stored)
    } else {
      generateNewEmail()
    }
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
    setEmails([])
    setSelectedEmail(null)
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
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 mb-8 border border-gray-700">
          <p className="text-gray-400 text-sm mb-2">Alamat email sementara Anda:</p>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            <div className="flex-1 bg-gray-900 rounded-xl px-4 py-3 font-mono text-lg text-green-400 border border-gray-600">
              {emailAddress || 'Generating...'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                className="flex-1 sm:flex-none px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {copied ? '✓ Tersalin!' : '📋 Salin'}
              </button>
              <button
                onClick={generateNewEmail}
                className="flex-1 sm:flex-none px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                🔄 Baru
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
