import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchStyles, fetchStylePrompt, analyzeReference, generateCard, transformImage } from '../api'
import type { CardStyle, GenerationPhase, FlexMode } from '../types'
import { getVisual, getVariantLabel } from '../styleVisuals'
import InkLoader from '../components/InkLoader'

const FLEX_MODES: { id: FlexMode; label: string; desc: string }[] = [
  { id: 'strict', label: '忠于风格', desc: '严格遵循模板风格' },
  { id: 'balanced', label: '平衡', desc: '风格与内容并重' },
  { id: 'creative', label: '自由创作', desc: '以你的描述为主' },
]

export default function Studio() {
  const { styleId } = useParams<{ styleId: string }>()
  const navigate = useNavigate()

  const [style, setStyle] = useState<CardStyle | null>(null)
  const [variant, setVariant] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [flexMode, setFlexMode] = useState<FlexMode>('balanced')

  // System prompt
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [customPrompt, setCustomPrompt] = useState<string | null>(null)
  const [showPromptEditor, setShowPromptEditor] = useState(false)

  // Reference
  type RefMode = 'inspire' | 'transform';
  const [refMode, setRefMode] = useState<RefMode>('inspire')
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refPreview, setRefPreview] = useState<string | null>(null)
  const [refDesc, setRefDesc] = useState<string | null>(null)
  const [refAnalyzing, setRefAnalyzing] = useState(false)

  // Generation
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

  // Load style prompt when style/variant changes
  useEffect(() => {
    if (!style || !variant) return
    fetchStylePrompt(style.id, variant).then(p => {
      setOriginalPrompt(p)
      setCustomPrompt(null)
    })
  }, [style, variant])

  useEffect(() => {
    if (phase === 'generating') {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  const handleRefFile = useCallback(async (file: File) => {
    setRefFile(file)
    setRefPreview(URL.createObjectURL(file))
    if (refMode === 'inspire') {
      setRefAnalyzing(true)
      try {
        const analysis = await analyzeReference(file)
        setRefDesc(analysis.description)
      } catch {
        setRefDesc(null)
      } finally {
        setRefAnalyzing(false)
      }
    }
  }, [refMode])

  const clearRef = () => {
    setRefFile(null)
    if (refPreview) URL.revokeObjectURL(refPreview)
    setRefPreview(null)
    setRefDesc(null)
  }

  const [dragOver, setDragOver] = useState(false)
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleRefFile(file)
  }

  const handleGenerate = async () => {
    if (!style || !prompt.trim()) return
    setPhase('generating')
    setErrorMsg('')
    setResultFiles([])
    try {
      let result;
      if (refFile && refMode === 'transform') {
        result = await transformImage(refFile, prompt.trim(), style.id, variant, flexMode)
      } else {
        result = await generateCard({
          style: style.id,
          variant,
          prompt: prompt.trim(),
          referenceDescription: refDesc || undefined,
          flexibility: flexMode,
          customSystemPrompt: customPrompt || undefined,
        })
      }
      if (result.success && result.files.length > 0) {
        setResultFiles(result.files)
        setPhase('done')
      } else {
        setErrorMsg(result.output || '生成失败，请重试')
        setPhase('error')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '未知错误')
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
  const canGenerate = prompt.trim().length > 0
  const activeSystemPrompt = customPrompt ?? originalPrompt
  const isCustomPrompt = customPrompt !== null

  return (
    <div className="min-h-screen page-enter">
      {phase === 'generating' && <InkLoader elapsed={elapsed} />}

      {/* Header bar */}
      <header className="sticky top-0 z-10 bg-paper-50/80 backdrop-blur-md border-b border-ink-50/8">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-ink-100 hover:text-ink-300 transition-colors text-sm flex items-center gap-1.5 group"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="transition-transform group-hover:-translate-x-0.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            画廊
          </button>
          <div className="h-4 w-px bg-ink-50/15" />
          <h1 className="font-serif text-lg font-semibold text-ink-300">
            {style.displayName}
          </h1>
          <span className="text-sm text-ink-50 hidden sm:inline">{style.description}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Done state */}
        {phase === 'done' && resultFiles.length > 0 && (
          <section className="mb-10">
            <div className="flex flex-col items-center">
              {resultFiles.map((url, i) => (
                <div key={i} className="relative group result-reveal cursor-pointer" onClick={() => handleDownload(url)}>
                  <img src={url} alt="Generated card"
                    className="max-w-full max-h-[70vh] rounded-2xl shadow-xl ring-1 ring-ink-50/10" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 bg-ink-400/10 backdrop-blur-[1px]">
                    <div className="px-6 py-3 rounded-full bg-white/90 text-ink-300 text-sm font-medium shadow-lg flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                      </svg>
                      下载高清图
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 mt-8">
                <button onClick={() => setPhase('idle')}
                  className="px-6 py-2.5 rounded-full bg-white/80 border border-ink-50/15 text-ink-200 text-sm font-medium hover:bg-white hover:border-ink-50/30 transition-all">
                  再来一张
                </button>
                <button onClick={() => navigate('/')}
                  className="px-6 py-2.5 rounded-full bg-white/80 border border-ink-50/15 text-ink-200 text-sm font-medium hover:bg-white hover:border-ink-50/30 transition-all">
                  换个风格
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="mb-8 p-5 rounded-2xl bg-vermillion/5 border border-vermillion/15 animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-vermillion/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-vermillion text-sm">!</span>
              </div>
              <div>
                <p className="font-medium text-vermillion text-sm">生成失败</p>
                <p className="text-vermillion/60 text-sm mt-1">{errorMsg}</p>
                <button onClick={() => setPhase('idle')}
                  className="mt-3 text-sm text-vermillion/80 hover:text-vermillion underline decoration-vermillion/30 transition-colors">
                  返回重试
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workspace */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="grid lg:grid-cols-5 gap-10">
            {/* Left column */}
            <div className="lg:col-span-3 space-y-7">
              {/* Variant picker */}
              <section>
                <h2 className="text-xs font-semibold text-ink-50 mb-3 uppercase tracking-[0.15em]">
                  选择变体
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {style.variants.map(v => {
                    const vl = getVariantLabel(v.name)
                    const isActive = variant === v.name
                    return (
                      <button key={v.name} onClick={() => setVariant(v.name)}
                        className={`text-left p-3.5 rounded-xl border-2 transition-all duration-200 ${
                          isActive ? 'border-ink-300 bg-ink-400/5 variant-selected' : 'border-transparent bg-white/40 hover:bg-white/70 hover:border-ink-50/20'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full transition-all duration-300"
                            style={{ backgroundColor: isActive ? vis.accent : '#D4C4A8', transform: isActive ? 'scale(1.3)' : 'scale(1)' }} />
                          <span className="font-serif font-semibold text-ink-300 text-sm">{vl.label}</span>
                        </div>
                        {vl.desc && <p className="text-xs text-ink-50 leading-relaxed pl-4">{vl.desc}</p>}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Prompt input */}
              <section>
                <h2 className="text-xs font-semibold text-ink-50 mb-3 uppercase tracking-[0.15em]">
                  描述你想要的卡片
                </h2>
                <textarea
                  value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder="写上你想要的内容，越具体越好——场景、人物、情感、文字都可以"
                  rows={4}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/50 border border-ink-50/12 text-ink-300 placeholder:text-ink-50/40 focus:outline-none focus:border-ink-200/30 focus:bg-white/80 transition-all resize-none text-[15px] leading-relaxed"
                />
                <div className="flex justify-between mt-2">
                  <p className="text-xs text-ink-50/50">越具体模型越听话，简单几个字容易被模板主导</p>
                  {prompt.length > 0 && <p className="text-xs text-ink-50/40">{prompt.length} 字</p>}
                </div>
              </section>

              {/* Flexibility mode */}
              <section>
                <h2 className="text-xs font-semibold text-ink-50 mb-3 uppercase tracking-[0.15em]">
                  创作模式
                </h2>
                <div className="flex gap-2">
                  {FLEX_MODES.map(m => {
                    const active = flexMode === m.id
                    return (
                      <button key={m.id}
                        onClick={() => { setFlexMode(m.id); setCustomPrompt(null) }}
                        className={`flex-1 py-3 px-3 rounded-xl text-center transition-all duration-200 border-2 ${
                          active
                            ? 'border-ink-300 bg-ink-400/5'
                            : 'border-transparent bg-white/40 hover:bg-white/60'
                        }`}>
                        <div className={`text-sm font-medium transition-colors ${active ? 'text-ink-300' : 'text-ink-100'}`}>
                          {m.label}
                        </div>
                        <div className="text-[11px] text-ink-50 mt-0.5">{m.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* System prompt editor (collapsible) */}
              <section>
                <button
                  onClick={() => setShowPromptEditor(!showPromptEditor)}
                  className="flex items-center gap-2 text-xs text-ink-50 hover:text-ink-200 transition-colors group"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform duration-200 ${showPromptEditor ? 'rotate-90' : ''}`}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                  <span className="uppercase tracking-[0.15em] font-semibold">
                    高级：系统提示词
                  </span>
                  {isCustomPrompt && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/10 text-amber font-medium normal-case tracking-normal">
                      已自定义
                    </span>
                  )}
                </button>

                {showPromptEditor && (
                  <div className="mt-3 space-y-2 animate-fade-in">
                    <textarea
                      value={activeSystemPrompt}
                      onChange={e => setCustomPrompt(e.target.value)}
                      rows={8}
                      className="w-full px-4 py-3 rounded-xl bg-white/30 border border-ink-50/10 text-ink-200 text-[13px] leading-relaxed focus:outline-none focus:border-ink-200/20 focus:bg-white/50 transition-all resize-y font-mono"
                    />
                    <div className="flex justify-between items-center">
                      <p className="text-[11px] text-ink-50/50">
                        编辑后将使用自定义提示词，切换创作模式可恢复
                      </p>
                      {isCustomPrompt && (
                        <button
                          onClick={() => setCustomPrompt(null)}
                          className="text-[11px] text-ink-50 hover:text-ink-200 transition-colors underline"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Reference upload */}
              <section>
                <h2 className="text-xs font-semibold text-ink-50 mb-3 uppercase tracking-[0.15em]">
                  参考图片
                  <span className="ml-2 font-normal text-ink-50/60 normal-case tracking-normal">可选</span>
                </h2>

                {/* Ref mode toggle */}
                <div className="flex gap-2 mb-3">
                  {([
                    { id: 'inspire' as const, label: '作为灵感', desc: 'AI 提取元素融入设计' },
                    { id: 'transform' as const, label: '风格转换', desc: '直接转换这张图片' },
                  ]).map(m => (
                    <button key={m.id}
                      onClick={() => { setRefMode(m.id); setRefDesc(null) }}
                      className={`flex-1 py-2 px-3 rounded-lg text-center transition-all duration-200 border ${
                        refMode === m.id
                          ? 'border-ink-300 bg-ink-400/5'
                          : 'border-transparent bg-white/30 hover:bg-white/50'
                      }`}>
                      <div className={`text-xs font-medium ${refMode === m.id ? 'text-ink-300' : 'text-ink-100'}`}>{m.label}</div>
                      <div className="text-[10px] text-ink-50 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>

                {refFile ? (
                  <div className="flex gap-4 items-start p-4 rounded-xl bg-white/50 border border-ink-50/10 transition-all">
                    <img src={refPreview!} alt="Reference" className="w-20 h-20 object-cover rounded-lg ring-1 ring-ink-50/10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-200 font-medium truncate">{refFile.name}</p>
                      {refMode === 'transform' ? (
                        <p className="text-xs text-ink-100 mt-1.5">
                          将直接转换此图片 · 在上方描述你想要的风格
                        </p>
                      ) : refAnalyzing ? (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="w-3 h-3 rounded-full border-2 border-amber/50 border-t-amber animate-spin" />
                          <p className="text-xs text-amber">AI 分析中…</p>
                        </div>
                      ) : refDesc ? (
                        <p className="text-xs text-ink-100 mt-1.5 leading-relaxed line-clamp-3">{refDesc}</p>
                      ) : (
                        <p className="text-xs text-ink-50 mt-1.5">分析失败，将仅使用文字描述</p>
                      )}
                    </div>
                    <button onClick={clearRef}
                      className="text-ink-50 hover:text-vermillion transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-vermillion/5">
                      ×
                    </button>
                  </div>
                ) : (
                  <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                    className={`drop-zone ${dragOver ? 'active' : ''} p-8 text-center cursor-pointer`}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'; input.accept = 'image/*'
                      input.onchange = () => { if (input.files?.[0]) handleRefFile(input.files[0]) }
                      input.click()
                    }}>
                    <div className="w-12 h-12 rounded-full bg-paper-200/60 flex items-center justify-center mx-auto mb-3">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-50">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                      </svg>
                    </div>
                    <p className="text-sm text-ink-100">拖入图片或点击上传</p>
                    <p className="text-xs text-ink-50/50 mt-1">AI 会提取参考元素融入卡片设计</p>
                  </div>
                )}
              </section>
            </div>

            {/* Right column */}
            <div className="lg:col-span-2">
              <div className="sticky top-16 space-y-6">
                {/* Style preview */}
                <div className="rounded-2xl overflow-hidden h-44 relative">
                  <img src={`/api/preview/${style.id}`} alt={style.displayName}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>

                {/* Summary */}
                <div className="space-y-3 text-sm px-1">
                  <div className="flex justify-between text-ink-100">
                    <span>风格</span>
                    <span className="text-ink-300 font-medium">{style.displayName}</span>
                  </div>
                  <div className="flex justify-between text-ink-100">
                    <span>变体</span>
                    <span className="text-ink-300 font-medium">{getVariantLabel(variant).label}</span>
                  </div>
                  <div className="flex justify-between text-ink-100">
                    <span>模式</span>
                    <span className="text-ink-300 font-medium">
                      {FLEX_MODES.find(m => m.id === flexMode)?.label}
                      {isCustomPrompt && ' (自定义)'}
                    </span>
                  </div>
                  {refFile && (
                    <div className="flex justify-between text-ink-100">
                      <span>参考</span>
                      <span className="text-ink-300 font-medium truncate ml-4">{refFile.name}</span>
                    </div>
                  )}
                  <div className="h-px bg-gradient-to-r from-transparent via-ink-50/15 to-transparent" />
                </div>

                {/* Generate button */}
                <button onClick={handleGenerate} disabled={!canGenerate}
                  className={`w-full py-4 rounded-xl font-serif font-semibold text-base transition-all duration-300 relative overflow-hidden ${
                    canGenerate ? 'btn-breathe hover:brightness-110 active:scale-[0.98]' : ''
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                  style={{ backgroundColor: canGenerate ? vis.accent : '#D4C4A8', color: '#FFF8F0' }}>
                  <span className="relative z-10">
                    {canGenerate ? '开始创作' : '请先输入描述'}
                  </span>
                </button>

                <p className="text-xs text-ink-50/40 text-center">通常需要 15-30 秒</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
