import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CardStyle } from '../types'
import { getVisual } from '../styleVisuals'

export default function StyleCard({ style, index = 0 }: { style: CardStyle; index?: number }) {
  const navigate = useNavigate()
  const v = getVisual(style.id)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const previewUrl = `/api/preview/${style.id}`

  return (
    <button
      onClick={() => navigate(`/studio/${style.id}`)}
      className="card-hover card-entrance group text-left rounded-2xl overflow-hidden bg-white/70 backdrop-blur-sm border border-ink-50/5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Visual preview area */}
      <div className="relative h-48 overflow-hidden">
        {/* Shimmer skeleton */}
        {!imgLoaded && (
          <div
            className={`absolute inset-0 ${imgError ? '' : 'shimmer'}`}
            style={imgError ? { background: v.gradient } : undefined}
          >
            {imgError && (
              <div className="flex items-center justify-center h-full">
                <span className="text-7xl font-serif opacity-20 select-none" style={{ color: v.accent }}>
                  {v.icon}
                </span>
              </div>
            )}
          </div>
        )}

        {!imgError && (
          <img
            src={previewUrl}
            alt={style.displayName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`absolute inset-0 w-full h-full object-cover img-fade-in transition-transform duration-700 group-hover:scale-105 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Overlay gradient for readability */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        {/* Variant count pill */}
        <div className="absolute bottom-2.5 right-2.5 text-[11px] px-2.5 py-1 rounded-full bg-white/80 backdrop-blur-md text-ink-300 font-medium shadow-sm">
          {style.variants.length} 变体
        </div>
      </div>

      {/* Info area */}
      <div className="p-4 space-y-2">
        <h3 className="font-serif text-lg font-semibold text-ink-300 leading-tight group-hover:text-ink-400 transition-colors">
          {style.displayName}
        </h3>
        <p className="text-[13px] text-ink-100 leading-relaxed line-clamp-2">
          {style.description}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {style.tags.slice(0, 4).map(tag => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-paper-200/60 text-ink-50 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}
