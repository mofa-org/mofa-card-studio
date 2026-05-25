import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHistory, deleteHistoryItem, cleanupOldHistory, type HistoryItem } from '../lib/history'

export default function HistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      cleanupOldHistory().then(() => getHistory()).then(setItems)
    }
  }, [open])

  const handleDelete = async (jobId: string) => {
    await deleteHistoryItem(jobId)
    setItems(prev => prev.filter(i => i.jobId !== jobId))
  }

  const handleClick = (item: HistoryItem) => {
    onClose()
    navigate(`/studio/${item.style}`, { state: { restorePrompt: item.prompt, restoreVariant: item.variant, restoreFlexibility: item.flexibility } })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-ink-400/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-sm bg-paper-50 shadow-2xl h-full overflow-y-auto page-enter">
        <div className="sticky top-0 bg-paper-50/90 backdrop-blur-md p-4 border-b border-ink-50/10 flex justify-between items-center">
          <h2 className="font-serif text-lg font-semibold text-ink-300">创作历史</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-50/10 text-ink-100 transition-colors">
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-ink-50">
            <p className="text-sm">还没有创作记录</p>
            <p className="text-xs mt-1 text-ink-50/50">生成的卡片会自动保存在这里</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {items.map(item => (
              <div key={item.jobId}
                className="group flex gap-3 p-2.5 rounded-xl hover:bg-white/60 transition-colors cursor-pointer"
                onClick={() => handleClick(item)}>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-paper-200 flex-shrink-0 flex items-center justify-center text-ink-50/30 text-xs">
                    无图
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-300 truncate">{item.styleName}</p>
                  <p className="text-xs text-ink-100 line-clamp-2 mt-0.5">{item.prompt}</p>
                  <p className="text-[10px] text-ink-50/50 mt-1">
                    {new Date(item.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(item.jobId); }}
                  className="opacity-0 group-hover:opacity-100 text-ink-50 hover:text-vermillion transition-all w-6 h-6 flex items-center justify-center rounded-full text-xs self-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
