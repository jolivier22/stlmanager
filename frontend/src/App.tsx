import { useEffect, useMemo, useState, type ReactNode, type ChangeEvent } from 'react'
import { Home, Tags, Settings, BarChart3, RefreshCw, Search, X, Pencil, Trash2, ArrowUp } from 'lucide-react'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8091'

type Folder = {
  name: string
  path: string
  rel: string
  counts?: {
    images: number
    gifs: number
    videos: number
    archives: number
    stls: number
  }
  tags?: string[]
  rating?: number | null
  thumbnail_path?: string | null
  created_at?: string | null
  modified_at?: string | null
  printed?: boolean
  to_print?: boolean
}

export default function App() {
  const [health, setHealth] = useState<string>('loading...')
  const [view, setView] = useState<'home' | 'settings' | 'detail' | 'duplicates' | 'tags'>(() => (localStorage.getItem('stlm.view') as any) || 'home')
  const [previousView, setPreviousView] = useState<'home' | 'settings' | 'detail' | 'duplicates' | 'tags'>('home')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(() => {
    const v = Number(localStorage.getItem('stlm.limit') || '24')
    return [12,24,48,96].includes(v) ? v : 24
  })
  const [usage, setUsage] = useState<{ used_bytes: number, total_bytes: number } | null>(null)
  const [sort, setSort] = useState<'name' | 'date' | 'rating' | 'created' | 'modified'>(() => {
    const v = localStorage.getItem('stlm.sort') as 'name' | 'date' | 'rating' | 'created' | 'modified' | null
    return (v === 'name' || v === 'date' || v === 'rating' || v === 'created' || v === 'modified') ? v : 'name'
  })
  const [order, setOrder] = useState<'asc' | 'desc'>(() => {
    const v = localStorage.getItem('stlm.order') as 'asc' | 'desc' | null
    return (v === 'asc' || v === 'desc') ? v : 'asc'
  })
  const [printedFilter, setPrintedFilter] = useState<'all' | 'yes' | 'no' | 'to_print'>(() => {
    const v = localStorage.getItem('stlm.printed') as 'all' | 'yes' | 'no' | 'to_print' | null
    return (v === 'yes' || v === 'no' || v === 'to_print') ? v : 'all'
  })
  const [ratingFilter, setRatingFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>(() => {
    const v = localStorage.getItem('stlm.ratingFilter') as 'all' | '1' | '2' | '3' | '4' | '5' | null
    return (v === '1' || v === '2' || v === '3' || v === '4' || v === '5') ? v : 'all'
  })
  // Tag filters (cumulative)
  const [filterTags, setFilterTags] = useState<string[]>(() => {
    try { const raw = localStorage.getItem('stlm.filterTags'); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()) : [] } catch { return [] }
  })
  const [filterInput, setFilterInput] = useState<string>('')
  const [filterSugs, setFilterSugs] = useState<string[]>([])
  const [filterSugsLoading, setFilterSugsLoading] = useState<boolean>(false)
  const [autoInc, setAutoInc] = useState<boolean>(() => localStorage.getItem('stlm.autoInc') === '1')
  const [autoIncSec, setAutoIncSec] = useState<number>(() => Number(localStorage.getItem('stlm.autoIncSec') || '30'))
  const [lastIncStatus, setLastIncStatus] = useState<string>('')
  const [autoRefreshAfterReindex, setAutoRefreshAfterReindex] = useState<boolean>(() => localStorage.getItem('stlm.autoRefreshAfterReindex') === '1')
  // Tags catalog states
  const [tagsQ, setTagsQ] = useState<string>('')
  const [tagsLoading, setTagsLoading] = useState<boolean>(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagsTotal, setTagsTotal] = useState<number>(0)
  // Tags page (list with counts)
  const [tagsCounts, setTagsCounts] = useState<Array<{ name: string, count: number }>>([])
  const [tagsCountsLoading, setTagsCountsLoading] = useState<boolean>(false)
  const [tagsCountsQ, setTagsCountsQ] = useState<string>('')
  const [datesBusy, setDatesBusy] = useState<boolean>(false)
  const [datesStatus, setDatesStatus] = useState<string>('')
  const [autoTagsInc, setAutoTagsInc] = useState<boolean>(() => localStorage.getItem('stlm.autoTagsInc') === '1')
  const [autoTagsSec, setAutoTagsSec] = useState<number>(() => Number(localStorage.getItem('stlm.autoTagsSec') || '60'))
  const [lastTagsStatus, setLastTagsStatus] = useState<string>('')
  const [fixAllBusy, setFixAllBusy] = useState<boolean>(false)
  const [fixAllStatus, setFixAllStatus] = useState<string>('')
  const [uploadBusy, setUploadBusy] = useState<boolean>(false)
  const [uploadPct, setUploadPct] = useState<number>(0)
  // Detail view state
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  // Scroll preservation for Home list and Duplicates
  const [homeScrollY, setHomeScrollY] = useState<number>(0)
  const [duplicatesScrollY, setDuplicatesScrollY] = useState<number>(0)
  const [newTag, setNewTag] = useState<string>('')
  const [tagSugs, setTagSugs] = useState<string[]>([])
  const [tagSugsLoading, setTagSugsLoading] = useState<boolean>(false)
  const [fixBusy, setFixBusy] = useState<boolean>(false)
  // Duplicates view state
  const [dups, setDups] = useState<any[]>([])
  const [dupsTotal, setDupsTotal] = useState<number>(0)
  const [dupsLoading, setDupsLoading] = useState<boolean>(false)
  const [dupProgress, setDupProgress] = useState<number>(0)
  const [dupPhase, setDupPhase] = useState<string>('')
  const [dupDebug, setDupDebug] = useState<string[]>([])
  const [minShared, setMinShared] = useState<number>(3)
  const [dupLimit, setDupLimit] = useState<number>(200)
  const [excludedTags, setExcludedTags] = useState<string[]>(() => {
    try { const raw = localStorage.getItem('stlm.excludedTags'); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()) : [] } catch { return [] }
  })
  const [excludeInput, setExcludeInput] = useState<string>('')
  const [excludeSugs, setExcludeSugs] = useState<string[]>([])
  const [excludeSugsLoading, setExcludeSugsLoading] = useState<boolean>(false)
  // Rename state
  const [renameEditing, setRenameEditing] = useState<boolean>(false)
  const [renameInput, setRenameInput] = useState<string>('')
  const [renaming, setRenaming] = useState<boolean>(false)
  // Toasts (bottom-right)
  type Toast = { id: number, type: 'info' | 'success' | 'error', text: string }
  const [toasts, setToasts] = useState<Toast[]>([])
  const pushToast = (text: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random()*1000)
    setToasts((prev) => [...prev, { id, type, text }])
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id))
    }, 3000)
  }
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)
  const [confirmAct, setConfirmAct] = useState<(() => void) | null>(null)
  const openConfirm = (msg: string, act: () => void) => { setConfirmMsg(msg); setConfirmAct(() => act) }
  const closeConfirm = () => { setConfirmMsg(null); setConfirmAct(null) }
  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const fileUrl = (p?: string | null) => p ? `${API_BASE}/files?path=${encodeURIComponent(p)}` : ''
  const formatBytes = (n?: number) => {
    if (!n || n <= 0) return ''
    const units = ['B','KB','MB','GB','TB']
    let i = 0
    let val = n
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
    return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`
  }

  const isNew = (iso?: string | null) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    if (!isFinite(t)) return false
    return Date.now() - t < 48 * 3600 * 1000
  }

  const setPrinted = async (value: boolean) => {
    if (!detail?.path) return
    // optimistic update
    setDetail((prev: any) => prev ? { ...prev, printed: value } : prev)
    setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, printed: value } : f) : prev))
    try {
      const url = new URL(`${API_BASE}/folders/set-printed`)
      url.search = `path=${encodeURIComponent(detail.path)}&printed=${value ? 'true' : 'false'}`
      const r = await fetch(url.toString(), { method: 'POST' })
      if (!r.ok) {
        // revert on failure
        setDetail((prev: any) => prev ? { ...prev, printed: !value } : prev)
        setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, printed: !value } : f) : prev))
      }
    } catch (e) {
      setDetail((prev: any) => prev ? { ...prev, printed: !value } : prev)
      setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, printed: !value } : f) : prev))
    }
  }

  const setToPrint = async (value: boolean) => {
    if (!detail?.path) return
    // optimistic update
    setDetail((prev: any) => prev ? { ...prev, to_print: value } : prev)
    setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, to_print: value } : f) : prev))
    try {
      const url = new URL(`${API_BASE}/folders/set-to-print`)
      url.search = `path=${encodeURIComponent(detail.path)}&to_print=${value ? 'true' : 'false'}`
      const r = await fetch(url.toString(), { method: 'POST' })
      if (!r.ok) {
        // revert on failure
        setDetail((prev: any) => prev ? { ...prev, to_print: !value } : prev)
        setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, to_print: !value } : f) : prev))
      }
    } catch (e) {
      setDetail((prev: any) => prev ? { ...prev, to_print: !value } : prev)
      setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, to_print: !value } : f) : prev))
    }
  }

  // Load disk usage when entering Home view
  useEffect(() => {
    if (view === 'home') {
      loadUsage()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Persist excludedTags to localStorage
  useEffect(() => {
    localStorage.setItem('stlm.excludedTags', JSON.stringify(excludedTags))
  }, [excludedTags])

  // Debounced tag suggestions for excluded tags
  useEffect(() => {
    let stop = false
    const run = async () => {
      const q = (excludeInput || '').trim()
      if (!q) { setExcludeSugs([]); return }
      if (view !== 'settings') { setExcludeSugs([]); return }
      try {
        setExcludeSugsLoading(true)
        const url = new URL(`${API_BASE}/folders/tags`)
        url.searchParams.set('q', q)
        url.searchParams.set('limit', '15')
        const r = await fetch(url.toString())
        const d = await r.json()
        let sugs: string[] = Array.isArray(d?.tags) ? d.tags : []
        if (excludedTags.length) {
          const excludedSet = new Set(excludedTags.map(t => t.toLowerCase()))
          sugs = sugs.filter((t) => !excludedSet.has(t.toLowerCase()))
        }
        if (!stop) setExcludeSugs(sugs)
      } catch {
        if (!stop) setExcludeSugs([])
      } finally {
        if (!stop) setExcludeSugsLoading(false)
      }
    }
    const id = setTimeout(run, 150)
    return () => { stop = true; clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeInput, view, excludedTags])

  // Load tags counts when entering Tags view or filter changes
  useEffect(() => {
    if (view === 'tags') {
      loadTagsCounts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tagsCountsQ])

  // Reload folders when filters/sort/pagination change
  useEffect(() => {
    if (view === 'home') {
      loadFolders()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sort, order, page, limit, query.trim(), filterTags, printedFilter, ratingFilter])

  const loadFolders = async () => {
    setLoading(true)
    try {
      const url = new URL(`${API_BASE}/folders/`)
      url.searchParams.set('sort', sort)
      url.searchParams.set('order', order)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', String(limit))
      if (query) url.searchParams.set('q', query)
      if (Array.isArray(filterTags) && filterTags.length) {
        for (const t of filterTags) { url.searchParams.append('tags', t) }
      }
      if (printedFilter === 'yes') url.searchParams.set('printed', 'true')
      if (printedFilter === 'no') url.searchParams.set('printed', 'false')
      if (printedFilter === 'to_print') url.searchParams.set('to_print', 'true')
      if (ratingFilter !== 'all') url.searchParams.set('rating', ratingFilter)
      const r = await fetch(url.toString())
      const d = await r.json()
      const items: Folder[] = d.items ?? []
      setFolders(items)
      const newTotal = Number(d.total ?? items.length)
      setTotal(newTotal)
      // Clamp current page to last page if total shrank
      const newTotalPages = Math.max(1, Math.ceil(newTotal / Math.max(1, limit)))
      if (page > newTotalPages) {
        setPage(newTotalPages)
      }
    } catch (e) {
      setFolders([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  // Duplicates (REST fallback)
  const loadDuplicates = async () => {
    setDupsLoading(true)
    try {
      const url = new URL(`${API_BASE}/folders/duplicates`)
      url.searchParams.set('min_shared', String(minShared))
      url.searchParams.set('limit', String(dupLimit))
      if (excludedTags.length > 0) {
        url.searchParams.set('excluded_tags', excludedTags.join(','))
      }
      const r = await fetch(url.toString())
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setDups([]); setDupsTotal(0)
        try { setDupPhase(r.status === 404 ? 'unavailable' : 'error') } catch {}
        return
      }
      const pairs = Array.isArray(d?.pairs) ? d.pairs : []
      setDups(pairs)
      setDupsTotal(Number(d?.total ?? pairs.length))
    } catch {
      setDups([]); setDupsTotal(0); try { setDupPhase('error') } catch {}
    } finally {
      setDupsLoading(false)
    }
  }

  // Duplicates (SSE stream)
  const startDuplicatesSSE = () => {
    try {
      setDupsLoading(true)
      setDupProgress(0)
      setDupPhase('')
      setDupDebug([])
      setDups([])
      setDupsTotal(0)
      try { (window as any).__dupES__?.close?.() } catch {}
      const url = new URL(`${API_BASE}/folders/duplicates/stream`)
      url.searchParams.set('min_shared', String(minShared))
      url.searchParams.set('limit', String(dupLimit))
      if (excludedTags.length > 0) {
        url.searchParams.set('excluded_tags', excludedTags.join(','))
      }
      const es = new EventSource(url.toString())
      ;(window as any).__dupES__ = es
      es.addEventListener('progress', (ev: MessageEvent) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data || '{}')
          if (typeof data?.progress_pct === 'number') setDupProgress(Math.max(0, Math.min(100, Math.floor(data.progress_pct))))
          if (typeof data?.phase === 'string') setDupPhase(data.phase)
        } catch {}
      })
      es.addEventListener('debug', (ev: MessageEvent) => {
        try { const data = JSON.parse((ev as MessageEvent).data || '{}'); setDupDebug(prev => [...prev, JSON.stringify(data)]) } catch {}
      })
      es.addEventListener('done', (ev: MessageEvent) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data || '{}')
          const pairs = Array.isArray(data?.pairs) ? data.pairs : []
          setDups(pairs)
          setDupsTotal(Number(data?.total ?? pairs.length))
          setDupPhase('done')
          setDupProgress(100)
          if (!pairs || pairs.length === 0) {
            try { loadDuplicates() } catch {}
          }
        } catch {}
        setDupsLoading(false)
        try { es.close() } catch {}
      })
      es.addEventListener('error', () => {
        try { setDupPhase('fallback'); setDupDebug(prev => [...prev, 'sse-error']); es.close() } catch {}
        loadDuplicates()
      })
    } catch {
      loadDuplicates()
    }
  }

  const loadUsage = async () => {
    try {
      const r = await fetch(`${API_BASE}/folders/usage`)
      const d = await r.json().catch(() => ({}))
      if (r.ok && typeof d?.used_bytes === 'number' && typeof d?.total_bytes === 'number') {
        setUsage({ used_bytes: d.used_bytes, total_bytes: d.total_bytes })
      } else {
        setUsage(null)
      }
    } catch {
      setUsage(null)
    }
  }

  // Start duplicates stream when entering duplicates view or parameters change
  useEffect(() => {
    if (view === 'duplicates' && dups.length === 0) {
      startDuplicatesSSE()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Reload duplicates when parameters change
  useEffect(() => {
    if (view === 'duplicates') {
      startDuplicatesSSE()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minShared, dupLimit])

  // ... rest of the code remains the same ...
  useEffect(() => { localStorage.setItem('stlm.sort', sort) }, [sort])
  useEffect(() => { localStorage.setItem('stlm.order', order) }, [order])
  useEffect(() => { localStorage.setItem('stlm.limit', String(limit)) }, [limit])
  useEffect(() => { try { localStorage.setItem('stlm.filterTags', JSON.stringify(filterTags)) } catch {} }, [filterTags])
  useEffect(() => { localStorage.setItem('stlm.autoRefreshAfterReindex', autoRefreshAfterReindex ? '1' : '0') }, [autoRefreshAfterReindex])
  useEffect(() => { localStorage.setItem('stlm.autoTagsInc', autoTagsInc ? '1' : '0') }, [autoTagsInc])
  useEffect(() => { localStorage.setItem('stlm.autoTagsSec', String(autoTagsSec)) }, [autoTagsSec])

  // Auto incremental reindex timer
  useEffect(() => {
    if (!autoInc) return
    const sec = Math.max(5, Number(autoIncSec) || 30)
    const id = setInterval(() => {
      doIncrementalReindex()
    }, sec * 1000)
    return () => clearInterval(id)
  }, [autoInc, autoIncSec])

  // Auto tags incremental timer
  useEffect(() => {
    if (!autoTagsInc) return
    const sec = Math.max(10, Number(autoTagsSec) || 60)
    const id = setInterval(() => {
      doTagsReindexIncremental()
    }, sec * 1000)
    return () => clearInterval(id)
  }, [autoTagsInc, autoTagsSec])

  // Load tags when entering settings or query changes
  useEffect(() => {
    if (view === 'settings') loadTagsCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tagsQ])

  // Dynamic suggestions for filter tags input
  useEffect(() => {
    let stop = false
    const run = async () => {
      const q = (filterInput || '').trim()
      if (!q) { setFilterSugs([]); return }
      try {
        setFilterSugsLoading(true)
        const url = new URL(`${API_BASE}/folders/tags`)
        url.searchParams.set('q', q)
        url.searchParams.set('limit', '15')
        const r = await fetch(url.toString())
        const d = await r.json()
        let sugs: string[] = Array.isArray(d?.tags) ? d.tags : []
        if (Array.isArray(filterTags) && filterTags.length) {
          const setSel = new Set(filterTags.map(t => t.toLowerCase()))
          sugs = sugs.filter((t) => !setSel.has(String(t).toLowerCase()))
        }
        if (!stop) setFilterSugs(sugs)
      } catch {
        if (!stop) setFilterSugs([])
      } finally {
        if (!stop) setFilterSugsLoading(false)
      }
    }
    const id = setTimeout(run, 150)
    return () => { stop = true; clearTimeout(id) }
  }, [filterInput, filterTags])

  // Load detail when entering detail view
  useEffect(() => {
    if (view === 'detail' && selectedPath) {
      loadDetail(selectedPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedPath])

  // Dynamic tag suggestions for add-tag input
  useEffect(() => {
    let stop = false
    const run = async () => {
      const q = (newTag || '').trim()
      if (!q) { setTagSugs([]); return }
      if (view !== 'detail') { setTagSugs([]); return }
      try {
        setTagSugsLoading(true)
        const url = new URL(`${API_BASE}/folders/tags`)
        url.searchParams.set('q', q)
        url.searchParams.set('limit', '15')
        const r = await fetch(url.toString())
        const d = await r.json()
        let sugs: string[] = Array.isArray(d?.tags) ? d.tags : []
        if (Array.isArray(detail?.tags) && detail.tags.length) {
          const setSel = new Set(detail.tags)
          sugs = sugs.filter((t) => !setSel.has(t))
        }
        if (!stop) setTagSugs(sugs)
      } catch {
        if (!stop) setTagSugs([])
      } finally {
        if (!stop) setTagSugsLoading(false)
      }
    }
    const id = setTimeout(run, 150)
    return () => { stop = true; clearTimeout(id) }
  }, [newTag, view, detail?.tags])

  // Restore scroll when returning to home or duplicates
  useEffect(() => {
    if (view === 'home') {
      setTimeout(() => {
        try { window.scrollTo(0, homeScrollY) } catch {}
      }, 100)
    } else if (view === 'duplicates') {
      setTimeout(() => {
        try { window.scrollTo(0, duplicatesScrollY) } catch {}
      }, 100)
    }
  }, [view, homeScrollY, duplicatesScrollY])

  // Restore scroll for duplicates when content is loaded
  useEffect(() => {
    if (view === 'duplicates' && dups.length > 0 && !dupsLoading && duplicatesScrollY > 0) {
      setTimeout(() => {
        try { window.scrollTo(0, duplicatesScrollY) } catch {}
      }, 200)
    }
  }, [view, dups.length, dupsLoading, duplicatesScrollY])

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLightboxOpen(false); return }
      if (!detail?.media?.images?.length) return
      if (e.key === 'ArrowRight') setLightboxIndex(i => (i + 1) % detail.media.images.length)
      if (e.key === 'ArrowLeft') setLightboxIndex(i => (i - 1 + detail.media.images.length) % detail.media.images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, detail])

  const openLightbox = (index: number) => {
    console.log('[lightbox] open', { index })
    setLightboxIndex(index)
    setLightboxOpen(true)
  }
  const closeLightbox = () => setLightboxOpen(false)
  const nextLightbox = () => detail?.media?.images?.length ? setLightboxIndex(i => (i + 1) % detail.media.images.length) : null
  const prevLightbox = () => detail?.media?.images?.length ? setLightboxIndex(i => (i - 1 + detail.media.images.length) % detail.media.images.length) : null

  const setFolderPreview = async (filename: string) => {
    if (!detail?.path) return
    try {
      console.log('[preview] set', { path: detail.path, filename })
      const url = new URL(`${API_BASE}/folders/set-preview`)
      // Force strict encoding so '+' becomes %2B
      url.search = `path=${encodeURIComponent(detail.path)}&filename=${encodeURIComponent(filename)}`
      const r = await fetch(url.toString(), { method: 'POST' })
      const text = await r.text()
      let d: any = undefined
      try { d = text ? JSON.parse(text) : undefined } catch { /* non-json */ }
      if (!r.ok) {
        console.error('[preview] error', r.status, text)
        return
      }
      console.log('[preview] ok', d)
      if (d?.thumbnail_path) {
        setDetail((prev: any) => prev ? { ...prev, thumbnail_path: d.thumbnail_path, hero: d.thumbnail_path } : prev)
        setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, thumbnail_path: d.thumbnail_path } : f) : prev))
      }
    } catch (err) {
      console.error('[preview] exception', err)
    }
  }

  const addTag = async (tagParam?: string) => {
    if (!detail?.path) return
    const source = (typeof tagParam === 'string' ? tagParam : newTag)
    const tag = (source || '').trim()
    if (!tag) return
    try {
      const url = new URL(`${API_BASE}/folders/tags/add`)
      url.search = `path=${encodeURIComponent(detail.path)}&tag=${encodeURIComponent(tag)}`
      const r = await fetch(url.toString(), { method: 'POST' })
      const d = await r.json()
      if (r.ok && Array.isArray(d?.tags)) {
        setDetail((prev: any) => prev ? { ...prev, tags: d.tags } : prev)
        setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, tags: d.tags } : f) : prev))
        setNewTag('')
      }
    } catch {}
  }

  const removeTag = async (tag: string) => {
    if (!detail?.path) return
    try {
      const url = new URL(`${API_BASE}/folders/tags/remove`)
      url.search = `path=${encodeURIComponent(detail.path)}&tag=${encodeURIComponent(tag)}`
      const r = await fetch(url.toString(), { method: 'POST' })
      const d = await r.json()
      if (r.ok && Array.isArray(d?.tags)) {
        setDetail((prev: any) => prev ? { ...prev, tags: d.tags } : prev)
        setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, tags: d.tags } : f) : prev))
      }
    } catch {}
  }

  const fixTagsForCurrent = async () => {
    if (!detail?.path) return
    setFixBusy(true)
    try {
      const url = new URL(`${API_BASE}/folders/fix-tags`)
      url.search = `path=${encodeURIComponent(detail.path)}`
      const r = await fetch(url.toString(), { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { pushToast('Erreur correction tags', 'error'); return }
      if (Array.isArray(d?.tags)) {
        setDetail((prev: any) => prev ? { ...prev, tags: d.tags } : prev)
        setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, tags: d.tags } : f) : prev))
      }
      pushToast(d?.changed ? 'Tags corrigés' : 'Tags déjà propres', 'success')
    } catch {
      pushToast('Erreur correction tags', 'error')
    } finally {
      setFixBusy(false)
    }
  }

  const setRating = async (value: number) => {
    if (!detail?.path) return
    const rating = Math.max(0, Math.min(5, Math.floor(value)))
    // optimistic update
    setDetail((prev: any) => prev ? { ...prev, rating } : prev)
    setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === detail.path ? { ...f, rating } : f) : prev))
    try {
      const url = new URL(`${API_BASE}/folders/set-rating`)
      url.search = `path=${encodeURIComponent(detail.path)}&rating=${encodeURIComponent(String(rating))}`
      const r = await fetch(url.toString(), { method: 'POST' })
      if (!r.ok) {
        // revert on failure
        const d = await r.text()
        console.error('[rating] error', r.status, d)
      }
    } catch (e) {
      console.error('[rating] exception', e)
    }
  }

  const doRename = async () => {
    if (!detail?.path) return
    const new_name = (renameInput || '').trim()
    if (!new_name || new_name === detail.name) { setRenameEditing(false); return }
    setRenaming(true)
    const oldPath = detail.path
    try {
      const url = new URL(`${API_BASE}/folders/rename`)
      url.search = `path=${encodeURIComponent(detail.path)}&new_name=${encodeURIComponent(new_name)}`
      const r = await fetch(url.toString(), { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (r.status === 409) {
          pushToast('Ce nom existe déjà', 'error')
        } else {
          pushToast('Erreur lors du renommage', 'error')
        }
        return
      }
      const newPath = d?.path || `${oldPath.substring(0, oldPath.lastIndexOf('/'))}/${new_name}`
      const newRel = d?.rel || undefined
      const fixPath = (p?: string | null) => (p && p.startsWith(oldPath)) ? (newPath + p.slice(oldPath.length)) : p
      setDetail((prev: any) => prev ? {
        ...prev,
        name: new_name,
        path: newPath,
        rel: newRel ?? prev.rel,
        thumbnail_path: fixPath(prev.thumbnail_path),
        hero: fixPath(prev.hero)
      } : prev)
      setFolders((prev) => (Array.isArray(prev) ? prev.map((f:any) => f.path === oldPath ? {
        ...f,
        name: new_name,
        path: newPath,
        rel: newRel ?? f.rel,
        thumbnail_path: fixPath(f.thumbnail_path)
      } : f) : prev))
      setSelectedPath(newPath)
      setRenameEditing(false)
      pushToast('Nom mis à jour', 'success')
    } catch (e) {
      console.error('[rename] exception', e)
      pushToast('Erreur lors du renommage', 'error')
    } finally {
      setRenaming(false)
    }
  }

  const deleteImage = async (filename: string) => {
    if (!detail?.path) return
    const abs = `${detail.path}/${filename}`
    try {
      // Optimistic UI: remove from grid immediately
      setDetail((prev: any) => prev ? {
        ...prev,
        media: { ...prev.media, images: (prev.media?.images || []).filter((x: string) => x !== filename) }
      } : prev)

      const url = new URL(`${API_BASE}/folders/delete-file`)
      url.search = `file=${encodeURIComponent(abs)}`
      const r = await fetch(url.toString(), { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        pushToast('Erreur lors de la suppression', 'error')
        await openDetail(detail.path)
        return
      }
      // Sync counts/thumbnail/hero from server response
      setDetail((prev: any) => prev ? {
        ...prev,
        counts: d?.counts ? { ...prev.counts, ...d.counts } : prev.counts,
        thumbnail_path: d?.thumbnail_path ?? prev.thumbnail_path,
        hero: d?.hero ?? prev.hero,
      } : prev)
      setFolders((prev: any[]) => Array.isArray(prev) ? prev.map((f: any) => f.path === detail.path ? {
        ...f,
        counts: d?.counts ? { ...f.counts, ...d.counts } : f.counts,
        thumbnail_path: d?.thumbnail_path ?? f.thumbnail_path,
      } : f) : prev)
      pushToast('Image supprimée', 'success')
    } catch (e) {
      console.error('[delete-file] exception', e)
      pushToast('Erreur lors de la suppression', 'error')
      await openDetail(detail.path)
    }
  }

  const deleteProject = async () => {
    if (!detail?.path) return
    try {
      const url = new URL(`${API_BASE}/folders/delete-project`)
      url.search = `path=${encodeURIComponent(detail.path)}`
      const r = await fetch(url.toString(), { method: 'POST' })
      if (!r.ok) {
        pushToast('Erreur suppression du projet', 'error')
        return
      }
      pushToast('Projet supprimé', 'success')
      setFolders((prev: any[]) => Array.isArray(prev) ? prev.filter((f: any) => f.path !== detail.path) : prev)
      setDetail(null)
      setView('home')
      await loadFolders()
    } catch (e) {
      pushToast('Erreur suppression du projet', 'error')
    }
  }

  // Helpers manquants (implémentations minimales pour éviter les erreurs runtime)
  const doUploadProject = async () => {
    pushToast('Fonction "Projet +" indisponible dans cette build', 'info')
  }
  const doScan = async () => {
    try { 
      setScanning(true); 
      await fetch(`${API_BASE}/folders/reindex-incremental`, { method: 'POST' })
      // Reload folders after scan to show new projects
      if (view === 'home') {
        await loadFolders()
      }
      pushToast('Scan terminé', 'success')
    } catch { 
      pushToast('Erreur scan', 'error') 
    } finally { 
      setScanning(false) 
    }
  }
  const doFullReindex = async () => {
    try { await fetch(`${API_BASE}/folders/reindex`, { method: 'POST' }); pushToast('Index complet demandé', 'success') } catch { pushToast('Erreur index complet', 'error') }
  }
  const doIncrementalReindex = async () => {
    try { await fetch(`${API_BASE}/folders/reindex-incremental`, { method: 'POST' }); pushToast('Réindexation incrémentale demandée', 'success') } catch {}
  }
  const doResetCollection = async () => {
    try { await fetch(`${API_BASE}/folders/reset-collection`, { method: 'POST' }); pushToast('Réinitialisation demandée', 'success') } catch { pushToast('Erreur réinitialisation', 'error') }
  }
  const doTagsReindexFull = async () => {
    try { await fetch(`${API_BASE}/folders/tags/reindex-full`, { method: 'POST' }); pushToast('Réindexation tags (complet) demandée', 'success') } catch {}
  }
  const doTagsReindexIncremental = async () => {
    try { await fetch(`${API_BASE}/folders/tags/reindex-incremental`, { method: 'POST' }); pushToast('Réindexation tags (incrémental) demandée', 'success') } catch {}
  }
  const doFixTagsAll = async () => {
    try { await fetch(`${API_BASE}/folders/fix-tags-all`, { method: 'POST' }); pushToast('Correction globale des tags demandée', 'success') } catch { pushToast('Erreur correction tags', 'error') }
  }
  const loadTagsCatalog = async () => {
    setTagsLoading(true)
    try {
      const url = new URL(`${API_BASE}/folders/tags`)
      if ((tagsQ || '').trim()) url.searchParams.set('q', (tagsQ || '').trim())
      url.searchParams.set('limit', '200')
      const r = await fetch(url.toString())
      const d = await r.json().catch(() => ({}))
      const list: string[] = Array.isArray(d?.tags) ? d.tags : []
      setTags(list)
      setTagsTotal(Number(d?.total ?? list.length))
    } catch {
      setTags([]); setTagsTotal(0)
    } finally {
      setTagsLoading(false)
    }
  }
  const openDetail = async (path: string, fromView?: 'home' | 'settings' | 'detail' | 'duplicates' | 'tags') => { 
    // Save current scroll position
    const currentView = fromView || view;
    const currentScrollY = window.scrollY;
    if (currentView === 'home') {
      setHomeScrollY(currentScrollY);
    } else if (currentView === 'duplicates') {
      setDuplicatesScrollY(currentScrollY);
    }
    
    setPreviousView(currentView); 
    setSelectedPath(path); 
    setView('detail') 
  }
  const loadDetail = async (path: string) => {
    try {
      const url = new URL(`${API_BASE}/folders/detail`)
      url.searchParams.set('path', path)
      const r = await fetch(url.toString())
      const d = await r.json().catch(() => ({}))
      if (r.ok) setDetail(d)
    } catch {}
  }

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)))

  const pagesToShow = useMemo((): (number | string)[] => {
    const pages: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
      return pages
    }
    const addRange = (a: number, b: number) => { for (let i = a; i <= b; i++) pages.push(i) }
    const left = Math.max(2, page - 1)
    const right = Math.min(totalPages - 1, page + 1)
    pages.push(1)
    if (left > 2) pages.push('…')
    addRange(left, right)
    if (right < totalPages - 1) pages.push('…')
    pages.push(totalPages)
    return pages
  }, [page, totalPages])

  const doBackfillDatesAll = async () => {
    setDatesBusy(true)
    setDatesStatus('')
    try {
      const r = await fetch(`${API_BASE}/folders/backfill-dates-all`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setDatesStatus('Erreur ajout des dates'); pushToast('Erreur ajout des dates', 'error'); return }
      const msg = `Mises à jour: ${d.updated ?? 0} / Vérifiés: ${d.checked ?? 0}`
      setDatesStatus(msg)
      pushToast('Dates ajoutées/mises à jour', 'success')
      if (view === 'home') { await loadFolders() }
    } catch {
      setDatesStatus('Erreur ajout des dates')
      pushToast('Erreur ajout des dates', 'error')
    } finally {
      setDatesBusy(false)
    }
  }

  const loadTagsCounts = async () => {
    setTagsCountsLoading(true)
    try {
      const url = new URL(`${API_BASE}/folders/tags-counts`)
      if ((tagsCountsQ || '').trim()) url.searchParams.set('q', (tagsCountsQ || '').trim())
      url.searchParams.set('limit', '5000')
      const r = await fetch(url.toString())
      const d = await r.json().catch(() => ({}))
      const list: Array<{ name: string, count: number }> = Array.isArray(d?.tags) ? d.tags : []
      setTagsCounts(list)
    } catch {
      setTagsCounts([])
    } finally {
      setTagsCountsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-4 hidden md:flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-100 text-lg font-semibold mb-4">
          <img src="/android-chrome-192x192.png" alt="STLManager" className="w-6 h-6 rounded" />
          STLManager
        </div>
        <NavItem icon={<Home size={18} />} label="Accueil" active={view==='home'} onClick={() => { setView('home') }} />
        <NavItem icon={<Tags size={18} />} label="Tags" active={view==='tags'} onClick={() => setView('tags')} />
        <NavItem icon={<BarChart3 size={18} />} label="Doublons" active={view==='duplicates'} onClick={() => setView('duplicates')} />
        <NavItem icon={<Settings size={18} />} label="Configuration" active={view==='settings'} onClick={() => setView('settings')} />
        <div className="mt-auto" />
      </aside>

      {/* Main */}
      <main className="flex-1">
        {/* Topbar */}
        <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
          <div className="max-w-7xl mx-auto px-4 py-3">
            {view !== 'duplicates' && view !== 'settings' && view !== 'tags' && (
              <>
                {/* Search row (full width, above controls) */}
                <div className="relative flex-1 mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    value={query}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    placeholder="Recherche projets (nom, chemin)"
                    className="w-full pl-9 pr-8 py-3 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                  />
                  {loading && (
                    <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin" size={16} />
                  )}
                  {!loading && query.trim() && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                      aria-label="Effacer la recherche"
                      title="Effacer la recherche"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </>
            )}
            {view === 'duplicates' && (
              <div className="mb-2 flex items-center gap-3 flex-wrap text-sm">
                <div className="text-zinc-300">Paires détectées: <span className="font-semibold text-zinc-100">{dupsTotal}</span></div>
                <label className="inline-flex items-center gap-2 text-zinc-300">
                  <span>Tags communs min.</span>
                  <select value={String(minShared)} onChange={(e) => setMinShared(Math.max(1, Number(e.target.value) || 1))} className="px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-zinc-300">
                  <span>Limite</span>
                  <select value={String(dupLimit)} onChange={(e) => setDupLimit(Math.max(20, Number(e.target.value) || 200))} className="px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100">
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500</option>
                  </select>
                </label>
                <button type="button" onClick={startDuplicatesSSE} className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 inline-flex items-center gap-2">
                  <RefreshCw size={16} className={dupsLoading ? 'animate-spin' : ''} />
                  Actualiser
                </button>
                {dupsLoading && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <div className="w-40 h-2 rounded bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-zinc-600" style={{ width: `${Math.max(0, Math.min(100, dupProgress))}%` }} />
                    </div>
                    <span>{dupPhase || 'scan…'} {dupProgress}%</span>
                  </div>
                )}
              </div>
            )}
            {view !== 'duplicates' && view !== 'settings' && view !== 'tags' && (
              <>
                {/* Controls row: filters, sorts, actions */}
                <div className="flex items-center gap-2">
                {/* Tag filters */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-wrap max-w-[40vw]">
                    {filterTags.map((t: string, i: number) => (
                  <span key={`${t}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700">
                    {t}
                    <button
                      type="button"
                      onClick={() => { setFilterTags(prev => prev.filter(x => x !== t)); setPage(1) }}
                      className="hover:text-zinc-100"
                      aria-label={`Retirer ${t}`}
                      title={`Retirer ${t}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <input
                    value={filterInput}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = (filterInput || '').trim()
                        if (v) {
                          const exists = filterTags.some(t => t.toLowerCase() === v.toLowerCase())
                          if (!exists) { setFilterTags(prev => [...prev, v]); setPage(1) }
                          setFilterInput('')
                          setFilterSugs([])
                        }
                      }
                    }}
                    placeholder="Tag + Entrée"
                    className="w-36 px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 text-sm"
                  />
                  {(filterSugsLoading || (filterSugs && filterSugs.length > 0)) && (
                    <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 shadow-lg z-20">
                      {filterSugsLoading && (
                        <div className="px-3 py-2 text-sm text-zinc-400">Recherche…</div>
                      )}
                      {!filterSugsLoading && filterSugs.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setFilterTags(prev => [...prev, t]); setPage(1); setFilterInput(''); setFilterSugs([]) }}
                          className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                        >
                          {t}
                        </button>
                      ))}
                      {!filterSugsLoading && filterSugs.length === 0 && (
                        <div className="px-3 py-2 text-sm text-zinc-400">Aucun tag</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {filterTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setFilterTags([]); setPage(1) }}
                  className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 text-sm"
                  title="Effacer tous les tags"
                >
                  Effacer
                </button>
              )}
            </div>
            {/* Sort controls */}
            <select
              value={sort}
              onChange={(e) => { setPage(1); setSort(e.target.value as 'name' | 'date' | 'rating' | 'created' | 'modified') }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm"
              title="Trier par"
            >
              <option value="name">Nom</option>
              <option value="date">Date</option>
              <option value="created">Date de création</option>
              <option value="modified">Dernière modification</option>
              <option value="rating">Note</option>
            </select>
            <select
              value={printedFilter}
              onChange={(e) => { const v = e.target.value as 'all'|'yes'|'no'|'to_print'; setPrintedFilter(v); localStorage.setItem('stlm.printed', v); setPage(1) }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm"
              title="Filtrer Printed"
            >
              <option value="all">Tous</option>
              <option value="yes">Printed</option>
              <option value="no">Non imprimé</option>
              <option value="to_print">A imprimer</option>
            </select>
            <select
              value={ratingFilter}
              onChange={(e) => { const v = e.target.value as 'all'|'1'|'2'|'3'|'4'|'5'; setRatingFilter(v); localStorage.setItem('stlm.ratingFilter', v); setPage(1) }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm"
              title="Filtrer par note"
            >
              <option value="all">Toutes notes</option>
              <option value="5">★★★★★ (5 étoiles)</option>
              <option value="4">★★★★☆ (4 étoiles)</option>
              <option value="3">★★★☆☆ (3 étoiles)</option>
              <option value="2">★★☆☆☆ (2 étoiles)</option>
              <option value="1">★☆☆☆☆ (1 étoile)</option>
            </select>
            <select
              value={order}
              onChange={(e) => { setPage(1); setOrder(e.target.value as 'asc' | 'desc') }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm"
              title="Ordre"
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
            <select
              value={String(limit)}
              onChange={(e) => { setPage(1); setLimit(Number(e.target.value)); }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm"
              title="Éléments par page"
            >
              <option value="12">12</option>
              <option value="24">24</option>
              <option value="48">48</option>
              <option value="96">96</option>
            </select>
            <button onClick={doUploadProject} disabled={uploadBusy} className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
              {uploadBusy ? `Envoi… ${uploadPct}%` : 'Projet +'}
            </button>
            <button onClick={doScan} disabled={scanning} className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2">
              <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scan…' : 'Scanner'}
            </button>
          </div>
              </>
            )}
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          {view === 'home' ? (
            <>
              {(health !== 'ok' && health !== 'loading...') && (
                <div className="mb-3 text-sm text-red-400">Backend indisponible (status: {String(health)}). Vérifiez l’API: {API_BASE}</div>
              )}
              <div className="text-zinc-200 mb-4">
                Total dossiers: {total}
                {usage && (
                  <span> ({formatBytes(usage.used_bytes)}/{formatBytes(usage.total_bytes)})</span>
                )}
              </div>

          <div className="mb-4 flex items-center justify-between text-sm text-zinc-300">
            <div>
              Page {page} / {totalPages}
              <span className="ml-2 text-zinc-500">({Math.min((page-1)*limit+1, total)}–{Math.min(page*limit, total)} sur {total})</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >Précédent</button>
              {pagesToShow.map((p, i) => (
                typeof p === 'number' ? (
                  <button
                    key={i}
                    className={`px-3 py-1.5 rounded-md border ${p===page ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}
                    onClick={() => setPage(p)}
                    disabled={p === page}
                  >{p}</button>
                ) : (
                  <span key={i} className="px-2">{p}</span>
                )
              ))}
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >Suivant</button>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((f: Folder) => (
              <button key={f.path} onClick={() => openDetail(f.path)} className="text-left border border-zinc-800 rounded-lg p-3 bg-zinc-900 hover:border-zinc-700">
                {/* Titre */}
                <div className="font-semibold text-zinc-100 mb-2 truncate" title={f.name}>{f.name}</div>
                {/* Miniature (hauteur 250px, ratio 3:4 portrait) */}
                <div
                  className="relative h-[250px] rounded border border-zinc-700 overflow-hidden mx-auto"
                  style={{ aspectRatio: '3 / 4' }}
                >
                  {f.thumbnail_path ? (
                    <img src={fileUrl(f.thumbnail_path)} loading="lazy" alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800" />
                  )}
                  {isNew((f as any).created_at) && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-600 text-white border border-emerald-700 shadow">New</span>
                  )}
                  {f.printed && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-600 text-white border border-sky-700 shadow">Printed</span>
                  )}
                </div>
                {/* Tags + Note */}
                <div className="mt-3 flex items-center justify-between">
                  {f.tags && f.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.tags.map((t: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700">{t}</span>
                      ))}
                    </div>
                  )}
                  {typeof f.rating === 'number' && (
                    <div className="text-amber-400 text-sm" aria-label={`note ${f.rating}/5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i}>{i < (f.rating ?? 0) ? '★' : '☆'}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          {/* Pagination (bottom) */}
          <div className="mt-6 flex items-center justify-between text-sm text-zinc-300">
            <div>
              Page {page} / {totalPages}
              <span className="ml-2 text-zinc-500">({Math.min((page-1)*limit+1, total)}–{Math.min(page*limit, total)} sur {total})</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >Précédent</button>
              {pagesToShow.map((p, i) => (
                typeof p === 'number' ? (
                  <button
                    key={i}
                    className={`px-3 py-1.5 rounded-md border ${p===page ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}
                    onClick={() => setPage(p)}
                    disabled={p === page}
                  >{p}</button>
                ) : (
                  <span key={i} className="px-2">{p}</span>
                )
              ))}
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >Suivant</button>
            </div>
          </div>
        </>
          ) : view === 'tags' ? (
            <div>
              <div className="mb-3 flex items-center gap-3">
                <input
                  value={tagsCountsQ}
                  onChange={(e) => setTagsCountsQ(e.target.value)}
                  placeholder="Rechercher un tag"
                  className="w-72 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                />
                <div className="text-sm text-zinc-400">{tagsCountsLoading ? 'Chargement…' : `${tagsCounts.length} tags`}</div>
              </div>
              <div className="divide-y divide-zinc-800 rounded border border-zinc-800">
                {tagsCounts.map((t, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="text-zinc-100">{t.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700">{t.count}</span>
                  </div>
                ))}
                {(!tagsCountsLoading && tagsCounts.length === 0) && (
                  <div className="px-3 py-2 text-zinc-400">Aucun tag</div>
                )}
              </div>
            </div>
          ) : view === 'duplicates' ? (
            <div>
              {dupsLoading && (
                <div className="mb-3 text-sm text-zinc-400">Analyse des doublons… {dupPhase && `(${dupPhase})`} {dupProgress ? `${dupProgress}%` : ''}</div>
              )}
              {!dupsLoading && dupPhase === 'unavailable' && (
                <div className="text-zinc-400">
                  La détection de doublons n'est pas disponible sur cette API ({API_BASE}).
                </div>
              )}
              {!dupsLoading && dups.length === 0 && (
                <div className="text-zinc-400">Aucune paire détectée avec les critères actuels.</div>
              )}
              {dups.length > 0 && (
                <div className="flex flex-wrap gap-4 justify-center">
                  {dups.map((p: any, idx: number) => (
                    <div key={idx} className="w-[480px] p-4 rounded border border-zinc-800 bg-zinc-900 flex-shrink-0">
                      <div className="flex items-start justify-between gap-4">
                        {/* A */}
                        <div className="flex flex-col items-center w-[150px] flex-shrink-0">
                          <div className="mb-2 w-full px-1 text-zinc-100 overflow-hidden h-[2.4rem]">
                            <button onClick={() => { if (p.a_path) { openDetail(p.a_path, 'duplicates') } }} className="w-full">
                              <span className="block w-full text-center font-semibold text-sm leading-tight h-[2.4rem] overflow-hidden break-words hover:underline">{p.a_name || p.a?.name || ''}</span>
                            </button>
                          </div>
                          <button onClick={() => { if (p.a_path) { openDetail(p.a_path, 'duplicates') } }} className="w-[150px] h-[200px] border border-zinc-700 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
                            {p.a_thumb || p.a?.thumb || p.a?.thumbnail_path ? (
                              <img src={fileUrl(p.a_thumb || p.a?.thumb || p.a?.thumbnail_path)} loading="lazy" alt={p.a_name || p.a?.name || ''} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-zinc-800" />
                            )}
                          </button>
                        </div>
                        {/* Middle */}
                        <div className="flex-shrink-0 text-center text-sm text-zinc-300 py-4 w-[110px]">
                          {typeof p.score !== 'undefined' && (
                            <div className="font-semibold text-zinc-100 mb-2 text-base">Score: {p.score}</div>
                          )}
                          {Array.isArray(p.shared) && p.shared.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {p.shared.slice(0, 6).map((t: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 truncate w-full block">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* B */}
                        <div className="flex flex-col items-center w-[150px] flex-shrink-0">
                          <div className="mb-2 w-full px-1 text-zinc-100 overflow-hidden h-[2.4rem]">
                            <button onClick={() => { if (p.b_path) { openDetail(p.b_path, 'duplicates') } }} className="w-full">
                              <span className="block w-full text-center font-semibold text-sm leading-tight h-[2.4rem] overflow-hidden break-words hover:underline">{p.b_name || p.b?.name || ''}</span>
                            </button>
                          </div>
                          <button onClick={() => { if (p.b_path) { openDetail(p.b_path, 'duplicates') } }} className="w-[150px] h-[200px] border border-zinc-700 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
                            {p.b_thumb || p.b?.thumb || p.b?.thumbnail_path ? (
                              <img src={fileUrl(p.b_thumb || p.b?.thumb || p.b?.thumbnail_path)} loading="lazy" alt={p.b_name || p.b?.name || ''} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-zinc-800" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : view === 'detail' ? (
            /* Detail view */
            <div>
              <button onClick={() => setView(previousView)} className="mb-4 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100">← Retour</button>
              {detail ? (
                <div>
                  {/* Hero section */}
                  <div className="relative mb-6">
                    {detail.hero && (
                      <img src={fileUrl(detail.hero)} alt="hero" className="w-full h-56 sm:h-72 md:h-80 object-cover opacity-30" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex gap-4 items-end">
                      <div className="relative w-32 sm:w-40 md:w-48 aspect-[3/4] overflow-hidden rounded border border-zinc-700 bg-zinc-900">
                        {detail.thumbnail_path ? (
                          <img src={fileUrl(detail.thumbnail_path)} alt={detail.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-800" />
                        )}
                        {isNew(detail.created_at) && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-600 text-white border border-emerald-700 shadow">New</span>
                        )}
                        {detail.printed && (
                          <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-600 text-white border border-sky-700 shadow">Printed</span>
                        )}
                      </div>
                      <div className="pb-1">
                        {renameEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              onMouseDown={(e) => e.stopPropagation()}
                              autoFocus
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') doRename()
                                if (e.key === 'Escape') { setRenameEditing(false); setRenameInput('') }
                              }}
                              className="px-2 py-1 rounded text-sm bg-zinc-900 text-zinc-100 border border-zinc-700"
                              placeholder="Nouveau nom du projet"
                            />
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={doRename}
                              disabled={renaming}
                              className="px-2 py-1 rounded text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 disabled:opacity-50"
                            >OK</button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => { setRenameEditing(false); setRenameInput('') }}
                              className="px-2 py-1 rounded text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700"
                            >Annuler</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="text-2xl font-semibold text-zinc-100">{detail.name}</div>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => { setRenameEditing(true); setRenameInput(detail.name || '') }}
                              className="px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 inline-flex items-center gap-1"
                              title="Renommer le projet"
                            >
                              <Pencil size={14} />
                              Renommer
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openConfirm(`Supprimer le projet "${detail.name}" ?\nCette action est définitive.`, () => deleteProject()) }}
                              className="px-2 py-1 rounded text-xs bg-red-600 hover:bg-red-500 text-white border border-red-700 inline-flex items-center gap-1"
                              title="Supprimer le projet"
                            >
                              <Trash2 size={14} />
                              Supprimer
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => {
                                if (uploadBusy) return
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.multiple = true
                                input.onchange = async () => {
                                  const files = Array.from(input.files || [])
                                  if (!files.length || !detail?.path) return
                                  setUploadBusy(true)
                                  setUploadPct(0)
                                  try {
                                    const fd = new FormData()
                                    for (const f of files) fd.append('files', f, f.name)
                                    const xhr = new XMLHttpRequest()
                                    xhr.open('POST', `${API_BASE}/folders/upload-to?path=${encodeURIComponent(detail.path)}`)
                                    xhr.upload.onprogress = (e) => {
                                      if (e.lengthComputable) setUploadPct(Math.max(0, Math.min(100, Math.round((e.loaded/e.total)*100))))
                                    }
                                    const done = new Promise<Response>((resolve) => {
                                      xhr.onreadystatechange = () => { if (xhr.readyState === 4) resolve(new Response(xhr.response, { status: xhr.status, statusText: xhr.statusText })) }
                                    })
                                    xhr.send(fd)
                                    const r = await done
                                    const txt = await r.text(); let d: any = {}; try { d = txt ? JSON.parse(txt) : {} } catch {}
                                    if (!r.ok) {
                                      pushToast(`Upload échoué (${r.status})`, 'error')
                                    } else {
                                      pushToast(`Ajout terminé: ${Number(d?.written ?? files.length)} fichiers (renommage si conflit)`, 'success')
                                      await loadDetail(detail.path)
                                    }
                                  } catch {
                                    pushToast('Erreur upload', 'error')
                                  } finally {
                                    setUploadBusy(false)
                                    setUploadPct(0)
                                  }
                                }
                                input.click()
                              }}
                              className="px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white border border-blue-700 inline-flex items-center gap-1 disabled:opacity-50"
                              title="Ajouter des fichiers (renommage si conflit)"
                            >
                              {uploadBusy ? `Ajout… ${uploadPct}%` : 'Ajouter des fichiers'}
                            </button>
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1 items-center">
                          {Array.isArray(detail.tags) && detail.tags.map((t: string, i: number) => (
                            <button
                              key={i}
                              className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700"
                              onClick={() => removeTag(t)}
                              title="Supprimer ce tag"
                            >
                              {t} ×
                            </button>
                          ))}
                          <div className="flex items-center gap-1 mt-1 relative">
                            <input
                              value={newTag}
                              onChange={(e) => setNewTag(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag((e.target as HTMLInputElement).value) } }}
                              placeholder="Ajouter un tag"
                              className="px-2 py-1 rounded text-xs bg-zinc-900 text-zinc-100 border border-zinc-700"
                            />
                            <button onClick={() => addTag()} className="px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">Ajouter</button>
                            {newTag && (tagSugsLoading || tagSugs.length > 0) && (
                              <div className="absolute top-8 left-0 z-20 min-w-[180px] max-h-40 overflow-auto rounded border border-zinc-700 bg-zinc-900 text-xs shadow-lg">
                                {tagSugsLoading ? (
                                  <div className="px-2 py-1 text-zinc-400">Chargement…</div>
                                ) : (
                                  tagSugs.map((t, i) => (
                                    <button
                                      key={i}
                                      className="w-full text-left px-2 py-1 hover:bg-zinc-800 text-zinc-100"
                                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addTag(t) }}
                                    >
                                      {t}
                                    </button>
                                  ))
                                )}
                                {!tagSugsLoading && tagSugs.length === 0 && (
                                  <div className="px-2 py-1 text-zinc-500">Aucune suggestion</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-amber-400 flex items-center gap-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <button
                              key={i}
                              className="leading-none"
                              onClick={() => setRating(i + 1)}
                              aria-label={`Noter ${i + 1}/5`}
                              title={`Noter ${i + 1}/5`}
                            >
                              {i < (Number(detail.rating) || 0) ? '★' : '☆'}
                            </button>
                          ))}
                          <button
                            className="ml-2 px-1 py-0.5 rounded border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800"
                            onClick={() => setRating(0)}
                            aria-label="Effacer la note"
                            title="Effacer la note"
                          >
                            Effacer
                          </button>
                          <label className="ml-3 inline-flex items-center gap-2 text-xs text-zinc-300">
                            <input type="checkbox" checked={!!detail?.printed} onChange={(e) => setPrinted(e.target.checked)} />
                            Printed
                          </label>
                          <label className="ml-3 inline-flex items-center gap-2 text-xs text-zinc-300">
                            <input type="checkbox" checked={!!detail?.to_print} onChange={(e) => setToPrint(e.target.checked)} />
                            A imprimer
                          </label>
                        </div>
                        <div className="mt-2 text-sm text-zinc-400">
                          Images: {detail.counts?.images} · GIFs: {detail.counts?.gifs} · Vidéos: {detail.counts?.videos} · Archives: {detail.counts?.archives} · STLs: {detail.counts?.stls}
                        </div>
                        {detail.created_at && (
                          <div className="mt-1 text-sm text-zinc-400">
                            Date d'ajout : {new Date(detail.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Gallery */}
                  {detail.media?.images?.length ? (
                    <div className="mb-6">
                      <div className="mb-2 text-zinc-200 font-medium">Images</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {detail.media.images.map((fn: string, i: number) => (
                          <div
                            key={i}
                            role="button"
                            tabIndex={0}
                            aria-label={`Ouvrir l'image ${i+1}`}
                            onClick={() => openLightbox(i)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openLightbox(i) }}
                            className="relative group w-full aspect-[3/4] overflow-hidden rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
                          >
                            <img src={fileUrl(`${detail.path}/${fn}`)} loading="lazy" className="w-full h-full object-cover cursor-pointer" onClick={() => openLightbox(i)} />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
                            <button
                              className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs rounded bg-zinc-900/80 text-zinc-100 border border-zinc-700"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFolderPreview(fn) }}
                              aria-label="Définir comme miniature"
                              title="Définir comme miniature"
                            >
                              Définir
                            </button>
                            <button
                              className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-zinc-900/80 text-red-200 border border-red-700"
                              onMouseDown={(e) => { e.stopPropagation() }}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openConfirm(`Supprimer l'image "${fn}" ?`, () => deleteImage(fn)) }}
                              aria-label="Supprimer l'image"
                              title="Supprimer l'image"
                              type="button"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Lightbox Modal */}
                  {lightboxOpen && detail?.media?.images?.length ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onMouseDown={closeLightbox}>
                      <div className="relative max-w-6xl max-h-[85vh] mx-4" onMouseDown={(e) => e.stopPropagation()}>
                        <img
                          src={fileUrl(`${detail.path}/${detail.media.images[lightboxIndex]}`)}
                          className="max-w-full max-h-[85vh] object-contain rounded shadow-lg border border-zinc-800"
                          alt="preview"
                        />
                        <button onClick={closeLightbox} className="absolute top-2 right-2 px-3 py-1.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">Fermer</button>
                        {detail.media.images.length > 1 && (
                          <>
                            <button onClick={prevLightbox} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-zinc-900/70 hover:bg-zinc-800 text-zinc-100 border border-zinc-700">‹</button>
                            <button onClick={nextLightbox} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-zinc-900/70 hover:bg-zinc-800 text-zinc-100 border border-zinc-700">›</button>
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-zinc-300 bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-700">
                              {lightboxIndex + 1} / {detail.media.images.length}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* GIFs */}
                  {detail.media?.gifs?.length ? (
                    <div className="mb-6">
                      <div className="mb-2 text-zinc-200 font-medium">GIFs</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {detail.media.gifs.map((fn: string, i: number) => (
                          <a
                            key={i}
                            href={fileUrl(`${detail.path}/${fn}`)}
                            target="_blank"
                            className="relative group w-full h-32 overflow-hidden rounded border border-zinc-700 bg-zinc-900"
                            title={fn}
                          >
                            <img src={fileUrl(`${detail.path}/${fn}`)} loading="lazy" className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Videos */}
                  {detail.media?.videos?.length ? (
                    <div className="mb-6">
                      <div className="mb-2 text-zinc-200 font-medium">Vidéos</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {detail.media.videos.map((fn: string, i: number) => (
                          <a
                            key={i}
                            href={fileUrl(`${detail.path}/${fn}`)}
                            target="_blank"
                            className="h-32 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 text-sm overflow-hidden"
                            title={fn}
                          >
                            <div className="relative w-full h-full">
                              <video
                                src={fileUrl(`${detail.path}/${fn}`)}
                                muted
                                loop
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover"
                                onMouseOver={(e) => { try { (e.currentTarget as HTMLVideoElement).play() } catch {} }}
                                onMouseOut={(e) => { try { (e.currentTarget as HTMLVideoElement).pause() } catch {} }}
                                autoPlay
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[10px] sm:text-xs text-zinc-200 truncate">
                                {fn}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Archives */}
                  {detail.media?.archives?.length ? (
                    <div className="mb-6">
                      <div className="mb-2 text-zinc-200 font-medium">Archives</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {detail.media.archives.map((fn: string, i: number) => (
                          <a
                            key={i}
                            href={fileUrl(`${detail.path}/${fn}`)}
                            download={fn}
                            className="h-32 rounded border border-zinc-700 bg-zinc-900 flex flex-col items-center justify-center gap-1 p-2 text-zinc-300 text-sm"
                            title={fn}
                          >
                            <span className="text-2xl" aria-hidden>📦</span>
                            <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-center">{fn}</span>
                            <span className="text-[10px] text-zinc-400">{formatBytes(detail.media_sizes?.archives?.[fn])}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* STL list (names only) */}
                  {detail.media?.stls?.length ? (
                    <div className="mb-6">
                      <div className="mb-2 text-zinc-200 font-medium">Fichiers STL</div>
                      <ul className="list-disc list-inside text-sm text-zinc-300">
                        {detail.media.stls.map((fn: string, i: number) => (
                          <li key={i}>{fn}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Others */}
                  {detail.media?.others?.length ? (
                    <div className="mb-6">
                      <div className="mb-2 text-zinc-200 font-medium">Autres fichiers</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {detail.media.others.map((fn: string, i: number) => (
                          <a
                            key={i}
                            href={fileUrl(`${detail.path}/${fn}`)}
                            target="_blank"
                            className="h-32 rounded border border-zinc-700 bg-zinc-900 flex flex-col items-center justify-center gap-2 p-2 text-zinc-300 text-sm"
                            title={fn}
                          >
                            <span className="text-2xl" aria-hidden>📄</span>
                            <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-center">{fn}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-zinc-400">Chargement…</div>
              )}
            </div>
          ) : view === 'settings' ? (
            /* Settings view */
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold mb-3">Configuration</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <button onClick={doFullReindex} disabled={loading} className="px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">
                    {loading ? 'Scan…' : 'Scanner (index complet)'}
                  </button>
                  <button onClick={doIncrementalReindex} className="px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">
                    Mise à jour incrémentale
                  </button>
                  <button onClick={doResetCollection} disabled={loading} className="px-3 py-2 rounded-md bg-red-800 hover:bg-red-700 text-white border border-red-800">
                    Réinitialiser l'index (changement de collection)
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" checked={autoInc} onChange={(e) => setAutoInc(e.target.checked)} />
                    Réindexation incrémentale automatique
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={autoIncSec}
                    onChange={(e) => setAutoIncSec(Math.max(5, Number(e.target.value) || 30))}
                    className="w-24 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100"
                  />
                  <span className="text-sm text-zinc-400">secondes</span>
                </div>
                {lastIncStatus && (
                  <div className="text-sm text-zinc-400">{lastIncStatus}</div>
                )}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" checked={autoRefreshAfterReindex} onChange={(e) => setAutoRefreshAfterReindex(e.target.checked)} />
                    Rafraîchir la liste après réindexation
                  </label>
                  <span className="text-xs text-zinc-500">(évite les retours intempestifs de page)</span>
                </div>

                <hr className="border-zinc-800" />
                <h3 className="text-md font-semibold">Catalogue de tags</h3>
                <div className="flex items-center gap-2">
                  <button onClick={doTagsReindexFull} className="px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">Réindexer tags (complet)</button>
                  <button onClick={doTagsReindexIncremental} className="px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">Réindexer tags (incrémental)</button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={doFixTagsAll} disabled={fixAllBusy} className="px-3 py-2 rounded-md bg-amber-700 hover:bg-amber-600 text-white border border-amber-800 disabled:opacity-50">
                    {fixAllBusy ? 'Correction tags…' : 'Corriger tous les tags (globale)'}
                  </button>
                  {fixAllStatus && (
                    <span className="text-sm text-zinc-400">{fixAllStatus}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={doBackfillDatesAll} disabled={datesBusy} className="px-3 py-2 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white border border-indigo-800 disabled:opacity-50">
                    {datesBusy ? 'Ajout des dates…' : 'Ajouter les dates à tous les projets'}
                  </button>
                  {datesStatus && (
                    <span className="text-sm text-zinc-400">{datesStatus}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" checked={autoTagsInc} onChange={(e) => setAutoTagsInc(e.target.checked)} />
                    Auto incrémental tags
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={autoTagsSec}
                    onChange={(e) => setAutoTagsSec(Math.max(10, Number(e.target.value) || 60))}
                    className="w-24 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100"
                  />
                  <span className="text-sm text-zinc-400">secondes</span>
                </div>
                {lastTagsStatus && (
                  <div className="text-sm text-zinc-400">{lastTagsStatus}</div>
                )}
                <div className="mt-2">
                  <input
                    value={tagsQ}
                    onChange={(e) => setTagsQ(e.target.value)}
                    placeholder="Rechercher un tag"
                    className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                  />
                  <div className="mt-2 text-sm text-zinc-400">{tagsLoading ? 'Chargement…' : `Résultats: ${tags.length} / ${tagsTotal}`}</div>
                  <div className="mt-2 flex flex-wrap gap-2 max-h-56 overflow-auto">
                    {tags.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700">{t}</span>
                    ))}
                  </div>
                </div>

                <hr className="border-zinc-800" />
                <h3 className="text-md font-semibold">Tags à exclure des doublons</h3>
                <p className="text-sm text-zinc-400 mb-2">Les tags exclus ne seront pas pris en compte lors de la détection des doublons.</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {excludedTags.map((t: string, i: number) => (
                    <span key={`${t}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700">
                      {t}
                      <button
                        type="button"
                        onClick={() => setExcludedTags(prev => prev.filter(x => x !== t))}
                        className="hover:text-zinc-100"
                        aria-label={`Retirer ${t}`}
                        title={`Retirer ${t}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="relative">
                  <input
                    value={excludeInput}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setExcludeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = (excludeInput || '').trim()
                        if (v) {
                          const exists = excludedTags.some(t => t.toLowerCase() === v.toLowerCase())
                          if (!exists) { setExcludedTags(prev => [...prev, v]) }
                          setExcludeInput('')
                          setExcludeSugs([])
                        }
                      }
                    }}
                    placeholder="Tag à exclure + Entrée"
                    className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                  />
                  {(excludeSugsLoading || (excludeSugs && excludeSugs.length > 0)) && (
                    <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 shadow-lg z-20">
                      {excludeSugsLoading && (
                        <div className="px-3 py-2 text-sm text-zinc-400">Recherche…</div>
                      )}
                      {!excludeSugsLoading && excludeSugs.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setExcludedTags(prev => [...prev, t]); setExcludeInput(''); setExcludeSugs([]) }}
                          className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                        >
                          {t}
                        </button>
                      ))}
                      {!excludeSugsLoading && excludeSugs.length === 0 && (
                        <div className="px-3 py-2 text-sm text-zinc-400">Aucun tag</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
    {/* Toasts container */}
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            `px-3 py-2 rounded-md shadow border text-sm transition-all duration-300 ` +
            (t.type==='success' ? 'bg-emerald-900/80 border-emerald-700 text-emerald-100' :
             t.type==='error' ? 'bg-red-900/80 border-red-700 text-red-100' :
             'bg-zinc-900/80 border-zinc-700 text-zinc-100')
          }
        >
          {t.text}
        </div>
      ))}
    </div>
    {/* Back to top button (home view) */}
    {view === 'home' && (
      <button
        type="button"
        className="fixed bottom-20 right-4 z-40 px-3 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 shadow inline-flex items-center gap-2"
        aria-label="Haut de page"
        title="Haut de page"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp size={16} />
        Haut
      </button>
    )}
    {/* Confirm panel */}
    {confirmMsg && (
      <div className="fixed bottom-20 right-4 z-50 w-[300px] rounded-md border border-zinc-700 bg-zinc-900/95 text-zinc-100 shadow-lg p-3 animate-in fade-in zoom-in">
        <div className="text-sm mb-3">{confirmMsg}</div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
            onClick={closeConfirm}
          >Annuler</button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white"
            onClick={() => { const fn = confirmAct; closeConfirm(); fn && fn() }}
          >Supprimer</button>
        </div>
      </div>
    )}
  </div>
)}

function NavItem({ icon, label, active = false, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      <span className="text-zinc-300">{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  )
}
