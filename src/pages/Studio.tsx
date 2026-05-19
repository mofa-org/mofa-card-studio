import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchStyles, analyzeReference, generateCard } from '../api'
import type { CardStyle, GenerationPhase } from '../types'
import { getVisual, getVariantLabel } from '../styleVisuals'
import InkLoader from '../components/InkLoader'

export default function Studio() {
  const { styleId } = useParams<{ styleId: string }>()
  const navigate = useNavigate()

  const [style, setStyle] = useState<CardStyle | null>(null)
  const [variant, setVariant] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refPreview, setRefPreview] = useState<string | null>(null)
  const [refDesc, setRefDesc] = useState<string | null>(null)
  const [refAnalyzing, setRefAnalyzing] = useState(false)

  const [phase, setPhase] = useState<GenerationPhase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [resultFiles, setResultFiles] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchStyles().then(styles => {
      const found = styles.find(s => s.id === styleId)
      if (!found) { navigate('/'); return }
      setStyle(found)
      setVariant(found.defaultVariant)
    })
  }, [styleId, navigate])

  // elapsed timer
  useEffect(() => {
    if (phase === 'generating') {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  // reference upload handling
  const handleRefFile = useCallback(async (file: File) => {
    setRefFile(file)
    setRefPreview(URL.createObjectURL(file))
    setRefAnalyzing(true)
    try {
      const analysis = await analyzeReference(file)
      setRefDesc(analysis.description)
    } catch {
      setRefDesc(null)
    } finally {
      setRefAnalyzing(false)
    }
  }, [])

  const clearRef = () => {
    setRefFile(null)
    if (refPreview) URL.revokeObjectURL(refPreview)
    setRefPreview(null)
    setRefDesc(null)
  }

  // drag & drop
  const [dragOver, setDragOver] = useState(false)
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleRefFile(file)
  }

  // generate
  const handleGenerate = async () => {
    if (!style || !prompt.trim()) return
    setPhase('generating')
    setErrorMsg('')
    setResultFiles([])
    try {
      const result = await generateCard({
        style: style.id,
        variant,
        prompt: prompt.trim(),
        referenceDescription: refDesc || undefined,
      })
      if (result.success && result.files.length > 0) {
        setResultFiles(result.files)
        setPhase('done')
      } else {
        setErrorMsg(result.output || 'Generation failed')
        setPhase('error')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setPhase('error')
    }
  }

  const handleDownload = (url: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = `card-${style?.id}-${Date.now()}.png`
    a.click()
  }

  if (!style) return null

  const vis = getVisual(style.id)

  return (
    <div className="min-h-screen page-enter">
      {phase === 'generating' && <InkLoader elapsed={elapsed} />}

      {/* Header bar */}
      <header className="sticky top-0 z-10 bg-paper-50/80 backdrop-blur-md border-b border-ink-50/10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-ink-100 hover:text-ink-300 transition-colors text-sm flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            画廊
          </button>
          <div className="h-4 w-px bg-ink-50/20" />
          <h1 className="font-serif text-lg font-semibold text-ink-300">
            {style.displayName}
          </h1>
          <span className="text-sm text-ink-50">{style.description}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Done state — result view */}
        {phase === 'done' && resultFiles.length > 0 && (
          <section className="mb-10 animate-fade-in">
            <div className="flex flex-col items-center">
              {resultFiles.map((url, i) => (
                <div key={i} className="relative group">
                  <img
                    src={url}
                    alt="Generated card"
                    className="max-w-full max-h-[70vh] rounded-xl shadow-lg"
                  />
                  <div className="absolute inset-0 flex items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity pb-4">
                    <button
                      onClick={() => handleDownload(url)}
                      className="px-6 py-2.5 rounded-full bg-ink-400/90 text-paper-50 text-sm font-medium shadow-lg backdrop-blur-sm hover:bg-ink-400 transition-colors"
                    >
                      下载高清图
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setPhase('idle')}
                  className="px-5 py-2 rounded-full bg-paper-200 text-ink-200 text-sm hover:bg-paper-300 transition-colors"
                >
                  再来一张
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="px-5 py-2 rounded-full bg-paper-200 text-ink-200 text-sm hover:bg-paper-300 transition-colors"
                >
                  换个风格
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="mb-8 p-4 rounded-xl bg-vermillion/5 border border-vermillion/20 text-vermillion text-sm animate-fade-in">
            <p className="font-medium mb-1">生成失败</p>
            <p className="text-vermillion/70">{errorMsg}</p>
            <button
              onClick={() => setPhase('idle')}
              className="mt-3 text-sm underline hover:no-underline"
            >
              重试
            </button>
          </div>
        )}

        {/* Workspace — visible in idle/error states */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="grid lg:grid-cols-5 gap-8">
            {/* Left column — controls */}
            <div className="lg:col-span-3 space-y-8">
              {/* Variant picker */}
              <section>
                <h2 className="font-serif text-sm font-semibold text-ink-200 mb-3 uppercase tracking-wider">
                  选择变体
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {style.variants.map(v => {
                    const vl = getVariantLabel(v.name)
                    const isActive = variant === v.name
                    return (
                      <button
                        key={v.name}
                        onClick={() => setVariant(v.name)}
                        className={`text-left p-3.5 rounded-xl border-2 transition-all duration-200 ${
                          isActive
                            ? 'border-ink-300 bg-ink-400/5'
                            : 'border-transparent bg-white/40 hover:bg-white/60 hover:border-ink-50/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-2 h-2 rounded-full transition-colors"
                            style={{
                              backgroundColor: isActive ? vis.accent : '#D4C4A8',
                            }}
                          />
                          <span className="font-serif font-semibold text-ink-300 text-sm">
                            {vl.label}
                          </span>
                        </div>
                        {vl.desc && (
                          <p className="text-xs text-ink-50 leading-relaxed">
                            {vl.desc}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Prompt input */}
              <section>
                <h2 className="font-serif text-sm font-semibold text-ink-200 mb-3 uppercase tracking-wider">
                  描述你想要的卡片
                </h2>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="例如：妈妈生日快乐，她喜欢养花，最近开始学画国画了"
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl bg-white/50 border border-ink-50/15 text-ink-300 placeholder:text-ink-50/50 focus:outline-none focus:border-ink-200/40 focus:bg-white/70 transition-all resize-none text-[15px] leading-relaxed"
                />
                <p className="mt-1.5 text-xs text-ink-50/60">
                  用自然语言描述，风格模板会自动融合
                </p>
              </section>

              {/* Reference upload */}
              <section>
                <h2 className="font-serif text-sm font-semibold text-ink-200 mb-3 uppercase tracking-wider">
                  参考图片
                  <span className="ml-2 font-normal text-ink-50 normal-case tracking-normal">
                    可选
                  </span>
                </h2>

                {refFile ? (
                  <div className="flex gap-4 items-start p-4 rounded-xl bg-white/40 border border-ink-50/10">
                    <img
                      src={refPreview!}
                      alt="Reference"
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-200 font-medium truncate">
                        {refFile.name}
                      </p>
                      {refAnalyzing ? (
                        <p className="text-xs text-amber mt-1">分析中…</p>
                      ) : refDesc ? (
                        <p className="text-xs text-ink-100 mt-1 leading-relaxed line-clamp-3">
                          {refDesc}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-50 mt-1">
                          分析失败，将仅使用文字描述
                        </p>
                      )}
                    </div>
                    <button
                      onClick={clearRef}
                      className="text-ink-50 hover:text-vermillion transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    ref={dropRef}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`drop-zone ${dragOver ? 'active' : ''} p-8 text-center cursor-pointer`}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*'
                      input.onchange = () => {
                        if (input.files?.[0]) handleRefFile(input.files[0])
                      }
                      input.click()
                    }}
                  >
                    <div className="text-3xl mb-2 text-ink-50/30">🖼</div>
                    <p className="text-sm text-ink-50">
                      拖入图片或点击上传
                    </p>
                    <p className="text-xs text-ink-50/50 mt-1">
                      AI 会提取参考元素融入卡片设计
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* Right column — preview & action */}
            <div className="lg:col-span-2">
              <div className="sticky top-20 space-y-6">
                {/* Style preview */}
                <div
                  className="rounded-2xl overflow-hidden h-56 flex items-center justify-center"
                  style={{ background: vis.gradient }}
                >
                  <span
                    className="text-8xl font-serif opacity-15 select-none"
                    style={{ color: vis.accent }}
                  >
                    {vis.icon}
                  </span>
                </div>

                {/* Summary */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-ink-100">
                    <span>风格</span>
                    <span className="text-ink-300 font-medium">{style.displayName}</span>
                  </div>
                  <div className="flex justify-between text-ink-100">
                    <span>变体</span>
                    <span className="text-ink-300 font-medium">
                      {getVariantLabel(variant).label}
                    </span>
                  </div>
                  {refFile && (
                    <div className="flex justify-between text-ink-100">
                      <span>参考</span>
                      <span className="text-ink-300 font-medium truncate ml-4">
                        {refFile.name}
                      </span>
                    </div>
                  )}
                  <div className="h-px bg-ink-50/15" />
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="w-full py-3.5 rounded-xl font-serif font-semibold text-base transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: prompt.trim() ? vis.accent : undefined,
                    color: prompt.trim() ? '#FFF8F0' : undefined,
                  }}
                >
                  开始创作
                </button>

                <p className="text-xs text-ink-50/50 text-center">
                  通常需要 10-20 秒，请耐心等待
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
