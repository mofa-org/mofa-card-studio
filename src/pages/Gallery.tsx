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

  const allCats = useMemo(
    () => categories.map(([cat]) => cat),
    [categories]
  )

  const filtered = filter
    ? categories.filter(([cat]) => cat === filter)
    : categories

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 page-enter">
      {/* Header */}
      <header className="mb-12 text-center">
        <h1 className="font-serif text-4xl font-bold text-ink-400 tracking-wide">
          纸上
        </h1>
        <p className="mt-2 text-ink-100 text-lg">
          选一种风格，写几句话，生成属于你的卡片
        </p>
      </header>

      {/* Category filter */}
      <nav className="flex justify-center gap-2 mb-10 flex-wrap">
        <button
          onClick={() => setFilter(null)}
          className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
            !filter
              ? 'bg-ink-400 text-paper-50'
              : 'bg-paper-200/60 text-ink-100 hover:bg-paper-300/60'
          }`}
        >
          全部
        </button>
        {allCats.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat === filter ? null : cat)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              filter === cat
                ? 'bg-ink-400 text-paper-50'
                : 'bg-paper-200/60 text-ink-100 hover:bg-paper-300/60'
            }`}
          >
            {getCategoryLabel(cat)}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="text-center py-20 text-ink-50">
          <p className="font-serif text-xl">正在展开画卷…</p>
        </div>
      ) : (
        <div className="space-y-12">
          {filtered.map(([cat, items]) => (
            <section key={cat}>
              <h2 className="font-serif text-xl text-ink-200 mb-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-ink-50/20" />
                <span>{getCategoryLabel(cat)}</span>
                <span className="h-px flex-1 bg-ink-50/20" />
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {items.map(style => (
                  <StyleCard key={style.id} style={style} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-20 pb-8 text-center text-sm text-ink-50/60">
        纸上工坊 · Powered by MoFA
      </footer>
    </div>
  )
}
