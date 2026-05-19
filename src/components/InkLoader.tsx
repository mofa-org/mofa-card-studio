const messages = [
  '研墨中…',
  '铺纸…',
  '落笔…',
  '晕染…',
  '题款…',
  '盖章…',
]

export default function InkLoader({ elapsed }: { elapsed: number }) {
  const idx = Math.min(Math.floor(elapsed / 4), messages.length - 1)
  const msg = messages[idx]

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper-50/95 backdrop-blur-sm">
      {/* Ink blots */}
      <div className="relative w-40 h-40 mb-8">
        <div
          className="ink-blot absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(44,44,44,0.15) 0%, transparent 70%)' }}
        />
        <div
          className="ink-blot ink-blot-delay-1 absolute inset-4 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(44,44,44,0.2) 0%, transparent 70%)' }}
        />
        <div
          className="ink-blot ink-blot-delay-2 absolute inset-8 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(44,44,44,0.25) 0%, transparent 70%)' }}
        />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-ink-400/60" />
        </div>
      </div>

      {/* Status text */}
      <p className="float-text font-serif text-xl text-ink-200 tracking-widest">
        {msg}
      </p>
      <p className="mt-3 text-sm text-ink-50">
        {elapsed}s
      </p>
    </div>
  )
}
