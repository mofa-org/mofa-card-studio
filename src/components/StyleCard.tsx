import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CardStyle } from '../types'
import { getVisual } from '../styleVisuals'

export default function StyleCard({ style }: { style: CardStyle }) {
  const navigate = useNavigate()
  const v = getVisual(style.id)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const previewUrl = `/api/preview/${style.id}`

  return (
    <button
      onClick={() => navigate(`/studio/${style.id}`)}
      className="card-hover group text-left rounded-2xl overflow-hidden bg-white/60 backdrop-blur-sm"
    >
      {/* Visual preview area */}
      <div
        className="relative h-48 flex items-center justify-center overflow-hidden"
        style={imgLoaded ? undefined : { background: v.gradient }}
      >
        {!imgError && (
          <img
            src={previewUrl}
            alt={style.displayName}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {/* Fallback: decorative character when no preview */}
        {(!imgLoaded || imgError) && (
          <span
            className="text-7xl font-serif opacity-20 select-none transition-transform duration-500 group-hover:scale-110"
            style={{ color: v.accent }}
          >
            {v.icon}
          </span>
        )}
        {/* Variant count pill */}
        <div className="absolute bottom-3 right-3 text-xs px-2 py-0.5 rounded-full bg-black/20 backdrop-blur-sm text-white/90">
          {style.variants.length} 变体
        </div>
      </div>

      {/* Info area */}
      <div className="p-4 space-y-2">
        <h3 className="font-serif text-lg font-semibold text-ink-300 leading-tight">
          {style.displayName}
        </h3>
        <p className="text-sm text-ink-100 leading-relaxed line-clamp-2">
          {style.description}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {style.tags.slice(0, 4).map(tag => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-paper-200/60 text-ink-100"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}
