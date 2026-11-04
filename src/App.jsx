import { useState, useEffect, useMemo } from 'react'
import { db } from './firebase'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore'
import './App.css'

const COLLECTION = 'bienes'

export default function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('ubicaciones') // 'ubicaciones' | 'repetidos' | 'desplazados' | 'agregar'
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'pending' | 'verified' | 'repeated' | 'missing'
  const [repFilterCode, setRepFilterCode] = useState('all')

  // Modals
  const [modal, setModal] = useState(null) // { type: 'displace' | 'editCode', item }
  const [displaceLocation, setDisplaceLocation] = useState('')
  const [editCodeValue, setEditCodeValue] = useState('')

  // New item form
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newLocation, setNewLocation] = useState('')

  // Listen to Firestore in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, COLLECTION), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setItems(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Map of repeated codes in current items
  const repeatedCodeGroups = useMemo(() => {
    const groups = {}
    items.forEach(item => {
      const c = (item.code || '').trim()
      if (!c || c === 'SIN CÓDIGO' || c === 'S/C' || c === 'PENDIENTE') return
      if (!groups[c]) groups[c] = []
      groups[c].push(item)
    })

    const result = {}
    Object.entries(groups).forEach(([c, list]) => {
      if (list.length > 1 || list.some(i => i.isRepeated)) {
        result[c] = list
      }
    })
    return result
  }, [items])

  const repeatedCodesSet = useMemo(() => {
    return new Set(Object.keys(repeatedCodeGroups))
  }, [repeatedCodeGroups])

  const repeatedItemsList = useMemo(() => {
    const list = []
    Object.values(repeatedCodeGroups).forEach(group => {
      group.forEach(item => list.push(item))
    })
    return list.sort((a, b) => a.code.localeCompare(b.code) || a.location.localeCompare(b.location))
  }, [repeatedCodeGroups])

  // Locations summary
  const locations = useMemo(() => {
    const map = {}
    items.forEach(item => {
      const loc = item.location || 'Sin ubicación'
      if (!map[loc]) {
        map[loc] = {
          total: 0,
          verified: 0,
          missing: 0,
          displaced: 0,
          pending: 0,
          repeatedCount: 0
        }
      }
      map[loc].total++
      map[loc][item.status || 'pending']++

      const c = (item.code || '').trim()
      if (c && repeatedCodesSet.has(c)) {
        map[loc].repeatedCount++
      }
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items, repeatedCodesSet])

  const allLocations = useMemo(() => {
    return [...new Set(items.map(i => i.location))].filter(Boolean).sort()
  }, [items])

  // Filtered items inside a location
  const filteredItems = useMemo(() => {
    let list = items
    if (selectedLocation) {
      list = list.filter(i => i.location === selectedLocation)
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'repeated') {
        list = list.filter(i => repeatedCodesSet.has(i.code))
      } else {
        list = list.filter(i => (i.status || 'pending') === statusFilter)
      }
    }
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(i =>
        (i.code && i.code.toLowerCase().includes(s)) ||
        (i.name && i.name.toLowerCase().includes(s))
      )
    }
    return list
  }, [items, selectedLocation, statusFilter, search, repeatedCodesSet])

  const displacedItems = useMemo(() => {
    return items.filter(i => i.status === 'displaced')
  }, [items])

  const stats = useMemo(() => {
    const s = {
      total: items.length,
      verified: 0,
      missing: 0,
      displaced: 0,
      pending: 0,
      repeated: repeatedItemsList.length
    }
    items.forEach(i => { s[i.status || 'pending']++ })
    return s
  }, [items, repeatedItemsList])

  // Actions
  async function toggleVerify(item) {
    const newStatus = item.status === 'verified' ? 'pending' : 'verified'
    await updateDoc(doc(db, COLLECTION, item.id), {
      status: newStatus,
      foundLocation: newStatus === 'verified' ? null : item.foundLocation
    })
  }

  async function markMissing(item) {
    const newStatus = item.status === 'missing' ? 'pending' : 'missing'
    await updateDoc(doc(db, COLLECTION, item.id), { status: newStatus })
  }

  function openDisplaceModal(item) {
    setModal({ type: 'displace', item })
    setDisplaceLocation('')
  }

  async function confirmDisplace() {
    if (!displaceLocation || !modal?.item) return
    await updateDoc(doc(db, COLLECTION, modal.item.id), {
      status: 'displaced',
      foundLocation: displaceLocation
    })
    setModal(null)
  }

  function openEditCodeModal(item) {
    setModal({ type: 'editCode', item })
    setEditCodeValue(item.code === 'SIN CÓDIGO' ? '' : item.code)
  }

  async function confirmEditCode() {
    if (!modal?.item) return
    const cleaned = editCodeValue.trim()
    if (!cleaned) return

    await updateDoc(doc(db, COLLECTION, modal.item.id), {
      code: cleaned,
      codeCorrected: true,
      correctedAt: new Date().toISOString()
    })
    setModal(null)
  }

  async function addItem() {
    if (!newCode.trim() || !newName.trim() || !newLocation.trim()) return
    const id = 'item_' + Date.now()
    await setDoc(doc(db, COLLECTION, id), {
      code: newCode.trim(),
      originalCode: newCode.trim(),
      name: newName.trim().toUpperCase(),
      location: newLocation.trim(),
      status: 'pending',
      foundLocation: null,
      isRepeated: false,
      source: 'manual'
    })
    setNewCode('')
    setNewName('')
    setNewLocation('')
  }

  async function resetItem(item) {
    await updateDoc(doc(db, COLLECTION, item.id), {
      status: 'pending',
      foundLocation: null
    })
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <img src="/logo-eic.png" alt="Logo EIC" className="loading-logo" />
          <div className="spinner"></div>
          <p>Cargando inventario EIC...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Header Compacto y Mobile-Friendly */}
      <header className="header">
        <img src="/logo-eic.png" alt="Escuela de Investigación Criminal" className="header-logo" />
        <div className="header-text">
          <h1>Inventario EIC</h1>
          <p>Ordenamiento y Verificación Física</p>
        </div>
      </header>

      {/* Stats Bar Responsive */}
      <div className="stats-bar">
        <div className="stat" onClick={() => { setTab('ubicaciones'); setSelectedLocation(null); setStatusFilter('all'); }}>
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat" onClick={() => { setTab('ubicaciones'); setStatusFilter('verified'); }}>
          <div className="stat-number verified">{stats.verified}</div>
          <div className="stat-label">Verificados</div>
        </div>
        <div className="stat" onClick={() => setTab('repetidos')}>
          <div className="stat-number repeated">{stats.repeated}</div>
          <div className="stat-label">Repetidos</div>
        </div>
        <div className="stat" onClick={() => setTab('desplazados')}>
          <div className="stat-number displaced">{stats.displaced}</div>
          <div className="stat-label">Desplazados</div>
        </div>
        <div className="stat" onClick={() => { setTab('ubicaciones'); setStatusFilter('missing'); }}>
          <div className="stat-number missing">{stats.missing}</div>
          <div className="stat-label">No están</div>
        </div>
        <div className="stat" onClick={() => { setTab('ubicaciones'); setStatusFilter('pending'); }}>
          <div className="stat-number pending">{stats.pending}</div>
          <div className="stat-label">Pendientes</div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="tabs">
        <button
          className={`tab ${tab === 'ubicaciones' ? 'active' : ''}`}
          onClick={() => { setTab('ubicaciones'); setSelectedLocation(null); setStatusFilter('all'); }}
        >
          📍 Ubicaciones
        </button>
        <button
          className={`tab tab-rep ${tab === 'repetidos' ? 'active' : ''}`}
          onClick={() => setTab('repetidos')}
        >
          🔁 Repetidos {stats.repeated > 0 && <span className="tab-pill">{stats.repeated}</span>}
        </button>
        <button
          className={`tab ${tab === 'desplazados' ? 'active' : ''}`}
          onClick={() => setTab('desplazados')}
        >
          ⚠️ Desplazados {displacedItems.length > 0 && <span className="tab-pill">{displacedItems.length}</span>}
        </button>
        <button
          className={`tab ${tab === 'agregar' ? 'active' : ''}`}
          onClick={() => setTab('agregar')}
        >
          ➕ Nuevo
        </button>
      </nav>

      {/* TAB: Ubicaciones (Grid de áreas) */}
      {tab === 'ubicaciones' && !selectedLocation && (
        <div>
          <div className="locations-summary-header">
            <span>Selecciona un área para auditar ({locations.length} ubicaciones):</span>
          </div>
          <div className="locations-grid">
            {locations.map(([loc, counts]) => (
              <div key={loc} className="location-card" onClick={() => { setSelectedLocation(loc); setStatusFilter('all'); setSearch(''); }}>
                <div className="location-card-top">
                  <h3 className="location-name">{loc}</h3>
                  {counts.repeatedCount > 0 && (
                    <span className="badge-rep-pill" title={`${counts.repeatedCount} bien(es) con código repetido aquí`}>
                      🔁 {counts.repeatedCount} rep.
                    </span>
                  )}
                </div>

                <div className="location-stats">
                  <span className="stat-tag ok">✓ {counts.verified}</span>
                  {counts.missing > 0 && <span className="stat-tag no">✗ {counts.missing}</span>}
                  {counts.displaced > 0 && <span className="stat-tag warn">⚠ {counts.displaced}</span>}
                  <span className="stat-tag count">{counts.total} bienes</span>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${counts.total ? ((counts.verified / counts.total) * 100) : 0}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Items de una Ubicación */}
      {tab === 'ubicaciones' && selectedLocation && (
        <div className="location-detail-view">
          <div className="location-top-bar">
            <button className="back-btn" onClick={() => setSelectedLocation(null)}>
              ← Volver
            </button>
            <h2 className="location-title">{selectedLocation}</h2>
          </div>

          {/* Alerta de repetidos en esta ubicación */}
          {(() => {
            const repHere = items.filter(i => i.location === selectedLocation && repeatedCodesSet.has(i.code)).length
            if (repHere > 0) {
              return (
                <div className="loc-rep-alert" onClick={() => setStatusFilter(statusFilter === 'repeated' ? 'all' : 'repeated')}>
                  <span>🔁 Hay <strong>{repHere} bienes</strong> con códigos repetidos en esta área.</span>
                  <button className="alert-btn">
                    {statusFilter === 'repeated' ? 'Ver todos' : 'Filtrar repetidos'}
                  </button>
                </div>
              )
            }
            return null
          })()}

          {/* Barra de Filtros y Búsqueda */}
          <div className="filter-search-bar">
            <input
              type="search"
              className="search-box"
              placeholder="🔍 Buscar código o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="quick-filters">
              <button
                className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                Todos
              </button>
              <button
                className={`filter-chip ${statusFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setStatusFilter('pending')}
              >
                Pendientes
              </button>
              <button
                className={`filter-chip ${statusFilter === 'verified' ? 'active' : ''}`}
                onClick={() => setStatusFilter('verified')}
              >
                Verificados
              </button>
              <button
                className={`filter-chip ${statusFilter === 'repeated' ? 'active' : ''}`}
                onClick={() => setStatusFilter('repeated')}
              >
                Repetidos
              </button>
            </div>
          </div>

          {/* Lista de bienes con diseño tarjeta optimizado para celular */}
          <div className="items-list">
            {filteredItems.length === 0 && (
              <div className="empty-state">
                No hay bienes con los filtros seleccionados ({search || statusFilter}).
              </div>
            )}
            {filteredItems.map(item => {
              const isRep = repeatedCodesSet.has(item.code)
              const countInAll = repeatedCodeGroups[item.code]?.length || 0

              return (
                <div
                  key={item.id}
                  className={`item-card ${item.status || 'pending'} ${isRep ? 'is-repeated-border' : ''}`}
                >
                  {/* Fila superior: Checkbox + Código + Badges */}
                  <div className="item-card-header">
                    <label className="checkbox-touch-area" title="Marcar como verificado">
                      <input
                        type="checkbox"
                        className="item-check"
                        checked={item.status === 'verified'}
                        onChange={() => toggleVerify(item)}
                      />
                      <span className="item-code-text">{item.code}</span>
                    </label>

                    <div className="item-badges">
                      {isRep && (
                        <span className="badge-repeated" title={`Este código se repite ${countInAll} veces`}>
                          🔁 Rep. ({countInAll}x)
                        </span>
                      )}
                      {item.codeCorrected && (
                        <span className="badge-corrected">✓ Corregido</span>
                      )}
                      <span className={`status-badge ${item.status || 'pending'}`}>
                        {item.status === 'verified' && '✓ En sitio'}
                        {item.status === 'missing' && '✗ No está'}
                        {item.status === 'displaced' && `⚠ En: ${item.foundLocation}`}
                        {(!item.status || item.status === 'pending') && 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  {/* Nombre / Descripción */}
                  <div className="item-card-body">
                    <p className="item-name-text">{item.name}</p>
                  </div>

                  {/* Botonera de acciones rápida para touch */}
                  <div className="item-card-actions">
                    <button
                      className="touch-btn code"
                      onClick={() => openEditCodeModal(item)}
                      title="Cambiar código por error tipográfico"
                    >
                      ✏️ Código
                    </button>

                    {item.status !== 'displaced' && (
                      <button
                        className="touch-btn warn"
                        onClick={() => openDisplaceModal(item)}
                        title="Está en otra área"
                      >
                        🚚 Está en otro lado
                      </button>
                    )}

                    {item.status !== 'missing' && item.status !== 'verified' && (
                      <button
                        className="touch-btn danger"
                        onClick={() => markMissing(item)}
                        title="No encontrado"
                      >
                        ✗ No está
                      </button>
                    )}

                    {(item.status === 'missing' || item.status === 'displaced') && (
                      <button
                        className="touch-btn reset"
                        onClick={() => resetItem(item)}
                        title="Reiniciar a pendiente"
                      >
                        ↺ Reset
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB: Códigos Repetidos */}
      {tab === 'repetidos' && (
        <div className="repeated-panel">
          <div className="repeated-panel-header">
            <h2>🔁 Códigos Repetidos</h2>
            <p className="subtitle">
              Bienes con el mismo código. Si al revisarlo físicamente ves que fue un error de dedo o tiene otra placa, pulsa <strong>"Cambiar Código"</strong> para corregirlo.
            </p>

            <div className="rep-selector-box">
              <label>Grupo de código:</label>
              <select value={repFilterCode} onChange={e => setRepFilterCode(e.target.value)}>
                <option value="all">Ver todos los grupos ({Object.keys(repeatedCodeGroups).length})</option>
                {Object.keys(repeatedCodeGroups).sort().map(c => (
                  <option key={c} value={c}>
                    Código {c} ({repeatedCodeGroups[c].length} bienes)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {Object.keys(repeatedCodeGroups).length === 0 ? (
            <div className="empty-state">
              🎉 ¡Excelente! No hay códigos repetidos pendientes de resolver.
            </div>
          ) : (
            <div className="rep-groups-container">
              {Object.entries(repeatedCodeGroups)
                .filter(([code]) => repFilterCode === 'all' || repFilterCode === code)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([code, groupItems]) => (
                  <div key={code} className="rep-group-card">
                    <div className="rep-group-header">
                      <div className="rep-code-title">
                        <span>Código: <strong>{code}</strong></span>
                        <span className="rep-count-tag">{groupItems.length} bienes</span>
                      </div>
                      <div className="rep-locations-pills">
                        {[...new Set(groupItems.map(i => i.location))].map(l => (
                          <span key={l} className="loc-pill">📍 {l}</span>
                        ))}
                      </div>
                    </div>

                    <div className="rep-items-list">
                      {groupItems.map(item => (
                        <div key={item.id} className={`rep-item-card ${item.status || 'pending'}`}>
                          <div className="rep-card-top">
                            <label className="checkbox-touch-area">
                              <input
                                type="checkbox"
                                className="item-check"
                                checked={item.status === 'verified'}
                                onChange={() => toggleVerify(item)}
                              />
                              <span className="rep-loc-name">📍 {item.location}</span>
                            </label>
                            <span className={`status-badge ${item.status || 'pending'}`}>
                              {item.status === 'verified' && '✓ Verificado'}
                              {item.status === 'missing' && '✗ No está'}
                              {item.status === 'displaced' && `⚠ En: ${item.foundLocation}`}
                              {(!item.status || item.status === 'pending') && 'Pendiente'}
                            </span>
                          </div>

                          <p className="rep-name-text">{item.name}</p>

                          <div className="rep-actions-bar">
                            <button
                              className="touch-btn code"
                              onClick={() => openEditCodeModal(item)}
                            >
                              ✏️ Cambiar Código Real
                            </button>
                            {item.status !== 'displaced' && (
                              <button
                                className="touch-btn warn"
                                onClick={() => openDisplaceModal(item)}
                              >
                                🚚 Mover
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Desplazados */}
      {tab === 'desplazados' && (
        <div className="displaced-panel">
          <h2>⚠️ Bienes Desplazados ({displacedItems.length})</h2>
          <p className="subtitle">Bienes que pertenecen a otra área pero fueron hallados físicamente en un lugar distinto.</p>
          {displacedItems.length === 0 && (
            <div className="empty-state">No hay bienes desplazados registrados por el momento.</div>
          )}
          <div className="displaced-list">
            {displacedItems.map(item => (
              <div key={item.id} className="displaced-card">
                <div className="displaced-header">
                  <span className="item-code-text">{item.code}</span>
                  <span className="badge-warn">Fuera de lugar</span>
                </div>
                <p className="item-name-text">{item.name}</p>
                <div className="displaced-movement">
                  <span className="loc-from">De: <strong>{item.location}</strong></span>
                  <span className="arrow">➔</span>
                  <span className="loc-to">Hallado en: <strong>{item.foundLocation}</strong></span>
                </div>
                <div className="displaced-actions">
                  <button className="touch-btn reset" onClick={() => resetItem(item)}>
                    ↺ Devolver a su estado original
                  </button>
                  <button className="touch-btn code" onClick={() => openEditCodeModal(item)}>
                    ✏️ Corregir Código
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Agregar Bien */}
      {tab === 'agregar' && (
        <div className="add-item-panel">
          <h2>Registrar Nuevo Bien</h2>
          <p className="subtitle">Solo ingresa código, nombre y ubicación:</p>

          <div className="mobile-form">
            <div className="form-group">
              <label>Código Interno</label>
              <input
                inputMode="numeric"
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                placeholder="Ej: 4951515"
              />
            </div>
            <div className="form-group">
              <label>Nombre / Descripción</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ej: SILLA GIRATORIA NEGRA"
              />
            </div>
            <div className="form-group">
              <label>Ubicación (seleccionar existente)</label>
              <select value={newLocation} onChange={e => setNewLocation(e.target.value)}>
                <option value="">Seleccionar ubicación...</option>
                {allLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>O escribir una nueva ubicación:</label>
              <input
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                placeholder="Ej: P1 · Comedor"
              />
            </div>
            <button className="btn btn-primary submit-btn" onClick={addItem}>
              ➕ Registrar Bien
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Desplazar Ubicación */}
      {modal?.type === 'displace' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🚚 ¿Dónde se encontró este bien?</h3>
            <div className="modal-info-box">
              <div className="modal-code">{modal.item.code}</div>
              <div className="modal-name">{modal.item.name}</div>
              <div className="modal-loc">Registrado en: <strong>{modal.item.location}</strong></div>
            </div>

            <label className="modal-label">Selecciona dónde lo encontraste físicamente:</label>
            <select
              className="modal-select"
              value={displaceLocation}
              onChange={e => setDisplaceLocation(e.target.value)}
            >
              <option value="">Seleccionar área...</option>
              {allLocations.filter(l => l !== modal.item.location).map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={confirmDisplace}
                disabled={!displaceLocation}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cambiar/Corregir Código */}
      {modal?.type === 'editCode' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>✏️ Corregir Código Real</h3>
            <div className="modal-info-box">
              <div className="modal-name">{modal.item.name}</div>
              <div className="modal-loc">Ubicación: <strong>{modal.item.location}</strong></div>
              <div className="modal-prev-code">Código actual registrado: <span>{modal.item.code}</span></div>
            </div>

            <label className="modal-label">Ingresa el código que tiene grabado físicamente:</label>
            <input
              type="text"
              autoFocus
              className="modal-input"
              value={editCodeValue}
              onChange={e => setEditCodeValue(e.target.value)}
              placeholder="Ej: 4951011"
              onKeyDown={e => { if (e.key === 'Enter') confirmEditCode() }}
            />

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={confirmEditCode}
                disabled={!editCodeValue.trim() || editCodeValue.trim() === modal.item.code}
              >
                Guardar Código
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
