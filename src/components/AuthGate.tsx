import { useState, useEffect } from 'react'

const TOKEN_KEY = 'card-studio-token'

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (getToken()) setAuthed(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setToken(data.token)
        setAuthed(true)
      } else {
        setError('访问码错误，请重试')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  if (authed) return <>{children}</>

  return (
    <div className="min-h-screen flex items-center justify-center page-enter">
      <form onSubmit={handleSubmit} className="w-80 text-center space-y-6">
        <h1 className="font-serif text-4xl font-bold text-ink-400 tracking-wide">纸上</h1>
        <p className="text-ink-100 text-sm">请输入访问码</p>
        <input
          type="password"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="访问码"
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-white/50 border border-ink-50/15 text-ink-300 text-center text-lg tracking-widest placeholder:text-ink-50/40 focus:outline-none focus:border-ink-200/30 focus:bg-white/80 transition-all"
        />
        {error && <p className="text-vermillion text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full py-3 rounded-xl font-serif font-semibold bg-ink-400 text-paper-50 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
        >
          {loading ? '验证中…' : '进入'}
        </button>
      </form>
    </div>
  )
}
