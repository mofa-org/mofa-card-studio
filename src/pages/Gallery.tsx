import { useEffect, useState, useMemo } from 'react'
import { fetchStyles } from '../api'
import type { CardStyle } from '../types'
import { getCategoryLabel, getCategoryOrder } from '../styleVisuals'
import StyleCard from '../components/StyleCard'

export default function Gallery() {
  const [styles, setStyles] = useState<CardStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    fetchStyles()
      .then(setStyles)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const map = new Map<string, CardStyle[]>()
    for (const s of styles) {
      const cat = s.category.startsWith('tshirt') ? 'tshirt' : s.category
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(s)
    }
    return [...map.entries()].sort(
      ([a], [b]) => getCategoryOrder(a) - getCategoryOrder(b)
    )
  }, [styles])

  const allCats = useMemo(() => categories.map(([cat]) => cat), [categories])

  const filtered = filter
    ? categories.filter(([cat]) => cat === filter)
    : categories

  let globalIndex = 0

  return (
    <div className="min-h-screen page-enter">
      {/* Hero header */}
      <header className="pt-16 pb-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #3C3226 1px, transparent 1px), radial-gradient(circle at 80% 50%, #3C3226 1px, transparent 1px)', backgroundSize: '60px 60px' }}
        />
        <h1 className="font-serif text-5xl font-bold text-ink-400 tracking-wide relative">
          纸上
        </h1>
        <p className="mt-3 text-ink-100 text-lg relative">
          选一种风格，写几句话，生成属于你的卡片
        </p>
        <div className="mt-1 text-ink-50/40 text-sm relative">
          {styles.length} 种风格 · AI 驱动
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pb-16">
        {/* Category filter */}
        <nav className="flex justify-center gap-2 mb-10 flex-wrap sticky top-0 z-10 py-3 bg-paper-50/80 backdrop-blur-md">
          <button
            onClick={() => setFilter(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              !filter ? 'pill-active' : 'bg-paper-200/60 text-ink-100 hover:bg-paper-300/60 hover:text-ink-200'
            }`}
          >
            全部
          </button>
          {allCats.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat === filter ? null : cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                filter === cat ? 'pill-active' : 'bg-paper-200/60 text-ink-100 hover:bg-paper-300/60 hover:text-ink-200'
              }`}
            >
              {getCategoryLabel(cat)}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white/40">
                <div className="h-48 shimmer" />
                <div className="p-4 space-y-3">
                  <div className="h-5 w-24 shimmer rounded" />
                  <div className="h-4 w-full shimmer rounded" />
                  <div className="h-4 w-2/3 shimmer rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-14">
            {filtered.map(([cat, items]) => (
              <section key={cat}>
                <h2 className="font-serif text-xl text-ink-200 mb-6 flex items-center gap-4">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ink-50/20 to-transparent" />
                  <span className="px-2">{getCategoryLabel(cat)}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ink-50/20 to-transparent" />
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {items.map(style => {
                    const idx = globalIndex++
                    return <StyleCard key={style.id} style={style} index={idx} />
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="pb-10 text-center text-xs text-ink-50/40 tracking-wide">
        纸上工坊 · Powered by MoFA
      </footer>
    </div>
  )
}
