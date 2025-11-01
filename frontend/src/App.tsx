import { useEffect, useMemo, useState } from 'react'
import { Home, Tags, Star, Settings, BarChart3, RefreshCw, Search } from 'lucide-react'

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
  const [view, setView] = useState<'home' | 'settings'>(() => (localStorage.getItem('stlm.view') as any) || 'home')
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
  // Tags catalog states
  const [tagsQ, setTagsQ] = useState<string>('')
  const [tagsLoading, setTagsLoading] = useState<boolean>(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagsTotal, setTagsTotal] = useState<number>(0)
  const [autoTagsInc, setAutoTagsInc] = useState<boolean>(() => localStorage.getItem('stlm.autoTagsInc') === '1')
  const [autoTagsSec, setAutoTagsSec] = useState<number>(() => Number(localStorage.getItem('stlm.autoTagsSec') || '60'))
  const [lastTagsStatus, setLastTagsStatus] = useState<string>('')

  const query = useMemo(() => q.trim(), [q])

  const loadFolders = async () => {
    setLoading(true)
    try {
      const url = new URL(`${API_BASE}/folders`)
      url.searchParams.set('sort', sort)
      url.searchParams.set('order', order)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', String(limit))
      if (query) url.searchParams.set('q', query)
      const r = await fetch(url.toString())
      const d = await r.json()
      const items: Folder[] = d.items ?? []
      setFolders(items)
      setTotal(Number(d.total ?? items.length))
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
      await loadFolders()
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

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)))

  return (
    <div className="min-h-screen flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-4 hidden md:flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-100 text-lg font-semibold mb-4">
          <div className="w-6 h-6 rounded bg-zinc-700" />
          STLManager
        </div>
        <NavItem icon={<Home size={18} />} label="Accueil" active={view==='home'} onClick={() => { setView('home'); setPage(1) }} />
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
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
            {folders.map(f => (
              <div key={f.path} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
                {/* Titre */}
                <div className="font-semibold text-zinc-100 mb-2 truncate" title={f.name}>{f.name}</div>
                {/* Miniature (hauteur 250px, ratio 3:4 portrait) */}
                <div
                  className="h-[250px] rounded border border-zinc-700 overflow-hidden mx-auto"
                  style={{ aspectRatio: '3 / 4' }}
                >
                  {f.thumbnail_path ? (
                    <img
                      src={`${API_BASE}/files?path=${encodeURIComponent(f.thumbnail_path)}`}
                      alt={f.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-800" />
                  )}
                </div>
                {/* Rating */}
                {typeof f.rating === 'number' && (
                  <div className="mt-2 text-amber-400 text-sm" aria-label={`note ${f.rating}/5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>{i < (f.rating ?? 0) ? '★' : '☆'}</span>
                    ))}
                  </div>
                )}
                {/* Tags */}
                {f.tags && f.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.tags.map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700">{t}</span>
                    ))}
                  </div>
                )}
                {f.counts && (
                  <div className="mt-2 text-xs text-zinc-300 flex flex-wrap gap-2">
                    <span>img: {f.counts.images}</span>
                    <span>gif: {f.counts.gifs}</span>
                    <span>vid: {f.counts.videos}</span>
                    <span>zip: {f.counts.archives}</span>
                    <span>stl: {f.counts.stls}</span>
                  </div>
                )}
              </div>
            ))}
            {!loading && folders.length === 0 && (
              <div className="text-zinc-400">Aucun dossier trouvé.</div>
            )}
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
          ) : (
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
          )}
          </div>
      </main>
    </div>
  )
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
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
