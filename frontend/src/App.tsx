import { useEffect, useMemo, useState, type ReactNode, type ChangeEvent } from 'react'
import { Home, Tags, Star, Settings, BarChart3, RefreshCw, Search, Pencil, Trash2 } from 'lucide-react'

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
}

export default function App() {
  const [health, setHealth] = useState<string>('loading...')
  const [view, setView] = useState<'home' | 'settings' | 'detail'>(() => (localStorage.getItem('stlm.view') as any) || 'home')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(() => {
    const v = Number(localStorage.getItem('stlm.limit') || '24')
    return [12,24,48,96].includes(v) ? v : 24
  })
  const [sort, setSort] = useState<'name' | 'date' | 'rating'>(() => {
    const v = localStorage.getItem('stlm.sort') as 'name' | 'date' | 'rating' | null
    return (v === 'name' || v === 'date' || v === 'rating') ? v : 'name'
  })
  const [order, setOrder] = useState<'asc' | 'desc'>(() => {
    const v = localStorage.getItem('stlm.order') as 'asc' | 'desc' | null
    return (v === 'asc' || v === 'desc') ? v : 'asc'
  })
  const [autoInc, setAutoInc] = useState<boolean>(() => localStorage.getItem('stlm.autoInc') === '1')
  const [autoIncSec, setAutoIncSec] = useState<number>(() => Number(localStorage.getItem('stlm.autoIncSec') || '30'))
  const [lastIncStatus, setLastIncStatus] = useState<string>('')
  const [autoRefreshAfterReindex, setAutoRefreshAfterReindex] = useState<boolean>(() => localStorage.getItem('stlm.autoRefreshAfterReindex') === '1')
  // Tags catalog states
  const [tagsQ, setTagsQ] = useState<string>('')
  const [tagsLoading, setTagsLoading] = useState<boolean>(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagsTotal, setTagsTotal] = useState<number>(0)
  const [autoTagsInc, setAutoTagsInc] = useState<boolean>(() => localStorage.getItem('stlm.autoTagsInc') === '1')
  const [autoTagsSec, setAutoTagsSec] = useState<number>(() => Number(localStorage.getItem('stlm.autoTagsSec') || '60'))
  const [lastTagsStatus, setLastTagsStatus] = useState<string>('')
  // Detail view state
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  // Scroll preservation for Home list
  const [homeScrollY, setHomeScrollY] = useState<number>(0)
  const [newTag, setNewTag] = useState<string>('')
  const [tagSugs, setTagSugs] = useState<string[]>([])
  const [tagSugsLoading, setTagSugsLoading] = useState<boolean>(false)
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

  const query = useMemo(() => q.trim(), [q])

  const fileUrl = (p?: string | null) => p ? `${API_BASE}/files?path=${encodeURIComponent(p)}` : ''

  const loadFolders = async () => {
    setLoading(true)
    try {
      const url = new URL(`${API_BASE}/folders/`)
      url.searchParams.set('sort', sort)
      url.searchParams.set('order', order)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', String(limit))
      if (query) url.searchParams.set('q', query)
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

  const doScan = async () => {
    setScanning(true)
    try {
      await fetch(`${API_BASE}/scan`, { method: 'POST' })
      await loadFolders()
    } finally {
      setScanning(false)
    }
  }

  const doFullReindex = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/folders/reindex`, { method: 'POST' })
      const d = await r.json()
      setLastIncStatus(`Index complet: ${d.indexed} dossiers`)
      await loadFolders()
    } catch {
      setLastIncStatus('Erreur reindex complet')
    } finally {
      setLoading(false)
    }
  }

  const doIncrementalReindex = async () => {
    try {
      const r = await fetch(`${API_BASE}/folders/reindex-incremental`, { method: 'POST' })
      const d = await r.json()
      setLastIncStatus(`Incrémental: +${d.added} / ~${d.updated} mis à jour / -${d.removed} supprimés / ${d.skipped} inchangés`)
      if (autoRefreshAfterReindex && view === 'home') {
        await loadFolders()
      }
    } catch {
      setLastIncStatus('Erreur reindex incrémental')
    }
  }

  const loadTagsCatalog = async () => {
    setTagsLoading(true)
    try {
      const url = new URL(`${API_BASE}/folders/tags`)
      if (tagsQ.trim()) url.searchParams.set('q', tagsQ.trim())
      url.searchParams.set('limit', '200')
      const r = await fetch(url.toString())
      const d = await r.json()
      setTags(d.tags ?? [])
      setTagsTotal(Number(d.total ?? 0))
    } catch {
      setTags([]); setTagsTotal(0)
    } finally {
      setTagsLoading(false)
    }
  }

  const doTagsReindexFull = async () => {
    try {
      const r = await fetch(`${API_BASE}/folders/tags/reindex`, { method: 'POST' })
      const d = await r.json()
      setLastTagsStatus(`Tags index complet: ${d.indexed} tags`)
      await loadTagsCatalog()
    } catch {
      setLastTagsStatus('Erreur reindex tags complet')
    }
  }

  const doTagsReindexIncremental = async () => {
    try {
      const r = await fetch(`${API_BASE}/folders/tags/reindex-incremental`, { method: 'POST' })
      const d = await r.json()
      setLastTagsStatus(`Tags incrémental: +${d.added} (total ${d.total})`)
      await loadTagsCatalog()
    } catch {
      setLastTagsStatus('Erreur reindex tags incrémental')
    }
  }

  const openDetail = async (path: string) => {
    try { setHomeScrollY(window.scrollY || window.pageYOffset || 0) } catch {}
    setSelectedPath(path)
    setView('detail')
  }

  const loadDetail = async (path: string) => {
    try {
      const url = new URL(`${API_BASE}/folders/detail`)
      url.searchParams.set('path', path)
      const r = await fetch(url.toString())
      const d = await r.json()
      setDetail(d)
    } catch {
      setDetail(null)
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.json())
      .then(d => setHealth(d.status ?? JSON.stringify(d)))
      .catch(() => setHealth('error'))
  }, [])

  useEffect(() => {
    loadFolders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort, order, page, limit])

  // Persist simple settings
  useEffect(() => { localStorage.setItem('stlm.view', view) }, [view])
  useEffect(() => { localStorage.setItem('stlm.autoInc', autoInc ? '1' : '0') }, [autoInc])
  useEffect(() => { localStorage.setItem('stlm.autoIncSec', String(autoIncSec)) }, [autoIncSec])
  useEffect(() => { localStorage.setItem('stlm.sort', sort) }, [sort])
  useEffect(() => { localStorage.setItem('stlm.order', order) }, [order])
  useEffect(() => { localStorage.setItem('stlm.limit', String(limit)) }, [limit])
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

  // Restore scroll when returning to home
  useEffect(() => {
    if (view === 'home') {
      try { window.scrollTo(0, homeScrollY) } catch {}
    }
  }, [view, homeScrollY])

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

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)))

  return (
    <div className="min-h-screen flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-4 hidden md:flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-100 text-lg font-semibold mb-4">
          <div className="w-6 h-6 rounded bg-zinc-700" />
          STLManager
        </div>
        <NavItem icon={<Home size={18} />} label="Accueil" active={view==='home'} onClick={() => { setView('home') }} />
        <NavItem icon={<Tags size={18} />} label="Tags" />
        <NavItem icon={<Star size={18} />} label="Favoris" />
        <div className="mt-auto" />
        <NavItem icon={<BarChart3 size={18} />} label="Statistiques" />
        <NavItem icon={<Settings size={18} />} label="Configuration" active={view==='settings'} onClick={() => setView('settings')} />
      </aside>

      {/* Main */}
      <main className="flex-1">
        {/* Topbar */}
        <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                value={q}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                placeholder="Recherche projets (nom, chemin)"
                className="w-full pl-9 pr-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
              />
            </div>
            {/* Sort controls */}
            <select
              value={sort}
              onChange={(e) => { setPage(1); setSort(e.target.value as 'name' | 'date' | 'rating') }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100"
              title="Trier par"
            >
              <option value="name">Nom</option>
              <option value="date">Date</option>
              <option value="rating">Note</option>
            </select>
            <select
              value={order}
              onChange={(e) => { setPage(1); setOrder(e.target.value as 'asc' | 'desc') }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100"
              title="Ordre"
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
            <select
              value={String(limit)}
              onChange={(e) => { setPage(1); setLimit(Number(e.target.value)); }}
              className="px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100"
              title="Éléments par page"
            >
              <option value="12">12</option>
              <option value="24">24</option>
              <option value="48">48</option>
              <option value="96">96</option>
            </select>
            <button onClick={loadFolders} disabled={loading} className="px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">
              {loading ? 'Recherche…' : 'Rechercher'}
            </button>
            <button onClick={doScan} disabled={scanning} className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2">
              <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scan…' : 'Scanner'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-sm text-zinc-400 mb-3">Backend: {health} · API: {API_BASE}</div>
          {view === 'home' ? (
            <>
              <div className="text-zinc-200 mb-4">Total dossiers: {total}</div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((f: Folder) => (
              <button key={f.path} onClick={() => openDetail(f.path)} className="text-left border border-zinc-800 rounded-lg p-3 bg-zinc-900 hover:border-zinc-700">
                {/* Titre */}
                <div className="font-semibold text-zinc-100 mb-2 truncate" title={f.name}>{f.name}</div>
                {/* Miniature (hauteur 250px, ratio 3:4 portrait) */}
                <div
                  className="h-[250px] rounded border border-zinc-700 overflow-hidden mx-auto"
                  style={{ aspectRatio: '3 / 4' }}
                >
                  {f.thumbnail_path ? (
                    <img src={fileUrl(f.thumbnail_path)} loading="lazy" alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800" />
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
          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between text-sm text-zinc-300">
            <div>
              Page {page} / {totalPages}
              <span className="ml-2 text-zinc-500">({Math.min((page-1)*limit+1, total)}–{Math.min(page*limit, total)} sur {total})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >Précédent</button>
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >Suivant</button>
            </div>
          </div>
        </>
          ) : view === 'detail' ? (
            /* Detail view */
            <div>
              <button onClick={() => setView('home')} className="mb-4 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100">← Retour</button>
              {detail ? (
                <div>
                  {/* Hero section */}
                  <div className="relative mb-6">
                    {detail.hero && (
                      <img src={fileUrl(detail.hero)} alt="hero" className="w-full h-56 sm:h-72 md:h-80 object-cover opacity-30" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex gap-4 items-end">
                      <div className="w-32 sm:w-40 md:w-48 aspect-[3/4] overflow-hidden rounded border border-zinc-700 bg-zinc-900">
                        {detail.thumbnail_path ? (
                          <img src={fileUrl(detail.thumbnail_path)} alt={detail.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-800" />
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
                        <div className="mt-2 text-amber-400 flex items-center gap-1">
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
                        </div>
                        <div className="mt-2 text-sm text-zinc-400">
                          Images: {detail.counts?.images} · GIFs: {detail.counts?.gifs} · Vidéos: {detail.counts?.videos} · Archives: {detail.counts?.archives} · STLs: {detail.counts?.stls}
                        </div>
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
                            className="relative group w-full h-32 overflow-hidden rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
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
                            className="h-32 rounded border border-zinc-700 bg-zinc-900 flex flex-col items-center justify-center gap-2 p-2 text-zinc-300 text-sm"
                            title={fn}
                          >
                            <span className="text-2xl" aria-hidden>📦</span>
                            <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-center">{fn}</span>
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
              </div>
            </div>
          ) : null}
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
  )
}

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
