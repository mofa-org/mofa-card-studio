const messages = [
  '研墨中…',
  '铺纸…',
  '落笔…',
  '晕染…',
  '题款…',
  '盖章…',
]

export default function InkLoader({ elapsed }: { elapsed: number }) {
  const idx = Math.min(Math.floor(elapsed / 5), messages.length - 1)
  const msg = messages[idx]
  const progress = Math.min(elapsed / 30, 1)

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper-50/95 backdrop-blur-md">
      {/* Ink blots */}
      <div className="relative w-32 h-32 mb-10">
        <div
          className="ink-blot absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(44,44,44,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="ink-blot ink-blot-delay-1 absolute inset-4 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(44,44,44,0.18) 0%, transparent 70%)' }}
        />
        <div
          className="ink-blot ink-blot-delay-2 absolute inset-8 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(44,44,44,0.24) 0%, transparent 70%)' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-ink-400/50" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-48 h-0.5 bg-ink-50/10 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-ink-300/30 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Status text */}
      <p className="float-text font-serif text-xl text-ink-200 tracking-[0.2em]">
        {msg}
      </p>
      <p className="mt-4 text-sm text-ink-50/50 tabular-nums">
        {elapsed}s
      </p>
    </div>
  )
}
