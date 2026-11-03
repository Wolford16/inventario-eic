import { useState, useEffect, useMemo } from 'react'
import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
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

  // Map of repeated codes in current active items
  const repeatedCodeGroups = useMemo(() => {
    const groups = {}
    items.forEach(item => {
      const c = (item.code || '').trim()
      if (!c || c === 'SIN CÓDIGO' || c === 'S/C' || c === 'PENDIENTE') return
      if (!groups[c]) groups[c] = []
      groups[c].push(item)
    })

    // Filter only those with more than 1 item or flagged as isRepeated
    const result = {}
    Object.entries(groups).forEach(([c, list]) => {
      if (list.length > 1 || list.some(i => i.isRepeated)) {
        result[c] = list
      }
    })
    return result
  }, [items])

  // Set of codes currently repeated
  const repeatedCodesSet = useMemo(() => {
    return new Set(Object.keys(repeatedCodeGroups))
  }, [repeatedCodeGroups])

  // Total count of items that are in repeated code groups
  const repeatedItemsList = useMemo(() => {
    const list = []
    Object.values(repeatedCodeGroups).forEach(group => {
      group.forEach(item => list.push(item))
    })
    // Sort by code, then by location
    return list.sort((a, b) => a.code.localeCompare(b.code) || a.location.localeCompare(b.location))
  }, [repeatedCodeGroups])

  // Derived locations
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

  const filteredItems = useMemo(() => {
    let list = items
    if (selectedLocation) {
      list = list.filter(i => i.location === selectedLocation)
    }
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(i =>
        (i.code && i.code.toLowerCase().includes(s)) ||
        (i.name && i.name.toLowerCase().includes(s))
      )
    }
    return list
  }, [items, selectedLocation, search])

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
          <p>Cargando inventario...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <img src="/logo-eic.png" alt="Escuela de Investigación Criminal" className="header-logo" />
        <div className="header-text">
          <h1>Escuela de Investigación Criminal · EIC</h1>
          <p>Sistema de Verificación y Ordenamiento de Bienes</p>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat">
          <div className="stat-number verified">{stats.verified}</div>
          <div className="stat-label">Verificados</div>
        </div>
        <div className="stat">
          <div className="stat-number missing">{stats.missing}</div>
          <div className="stat-label">No encontrados</div>
        </div>
        <div className="stat">
          <div className="stat-number displaced">{stats.displaced}</div>
          <div className="stat-label">Desplazados</div>
        </div>
        <div className="stat">
          <div className="stat-number repeated">{stats.repeated}</div>
          <div className="stat-label">Repetidos</div>
        </div>
        <div className="stat">
          <div className="stat-number pending">{stats.pending}</div>
          <div className="stat-label">Pendientes</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs">
        <button
          className={`tab ${tab === 'ubicaciones' ? 'active' : ''}`}
          onClick={() => { setTab('ubicaciones'); setSelectedLocation(null) }}
        >
          📍 Ubicaciones
        </button>
        <button
          className={`tab tab-repeated ${tab === 'repetidos' ? 'active' : ''}`}
          onClick={() => setTab('repetidos')}
        >
          🔁 Códigos Repetidos ({stats.repeated})
        </button>
        <button
          className={`tab ${tab === 'desplazados' ? 'active' : ''}`}
          onClick={() => setTab('desplazados')}
        >
          ⚠️ Desplazados ({displacedItems.length})
        </button>
        <button
          className={`tab ${tab === 'agregar' ? 'active' : ''}`}
          onClick={() => setTab('agregar')}
        >
          ➕ Agregar Bien
        </button>
      </div>

      {/* TAB: Ubicaciones (Grid) */}
      {tab === 'ubicaciones' && !selectedLocation && (
        <div className="locations-grid">
          {locations.map(([loc, counts]) => (
            <div key={loc} className="location-card" onClick={() => setSelectedLocation(loc)}>
              <div className="location-card-top">
                <h3>{loc}</h3>
                {counts.repeatedCount > 0 && (
                  <span className="badge-rep-pill" title={`${counts.repeatedCount} bien(es) con código repetido aquí`}>
                    🔁 {counts.repeatedCount} repetido{counts.repeatedCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="location-stats">
                <span><span className="dot green"></span> {counts.verified}</span>
                <span><span className="dot red"></span> {counts.missing}</span>
                <span><span className="dot yellow"></span> {counts.displaced}</span>
                <span><span className="dot gray"></span> {counts.pending}</span>
                <span style={{ marginLeft: 'auto' }}>{counts.total} bienes</span>
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
      )}

      {/* TAB: Ubicaciones (Items list for a location) */}
      {tab === 'ubicaciones' && selectedLocation && (
        <div>
          <button className="back-btn" onClick={() => setSelectedLocation(null)}>
            ← Volver a ubicaciones
          </button>
          <div className="items-header">
            <div>
              <h2>{selectedLocation}</h2>
              {(() => {
                const repInThisLoc = filteredItems.filter(i => repeatedCodesSet.has(i.code)).length
                if (repInThisLoc > 0) {
                  return (
                    <div className="loc-rep-alert">
                      ℹ️ Hay <strong>{repInThisLoc} bienes</strong> con supuestos códigos repetidos en esta área.
                    </div>
                  )
                }
                return null
              })()}
            </div>
            <input
              className="search-box"
              placeholder="Buscar por código o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="items-list">
            {filteredItems.length === 0 && (
              <div className="empty-state">No se encontraron bienes</div>
            )}
            {filteredItems.map(item => {
              const isRep = repeatedCodesSet.has(item.code)
              const countInAll = repeatedCodeGroups[item.code]?.length || 0

              return (
                <div
                  key={item.id}
                  className={`item-row ${item.status || 'pending'} ${isRep ? 'has-repeated-code' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="item-check"
                    checked={item.status === 'verified'}
                    onChange={() => toggleVerify(item)}
                    title="Marcar como verificado físicamente"
                  />
                  <div className="item-code-col">
                    <span className="item-code">{item.code}</span>
                    {isRep && (
                      <span
                        className="badge-repeated"
                        title={`Este código aparece ${countInAll} veces en el inventario. Puede ser error tipográfico.`}
                      >
                        🔁 Repetido ({countInAll}x)
                      </span>
                    )}
                    {item.codeCorrected && (
                      <span className="badge-corrected" title="Código corregido">
                        ✓ Corregido
                      </span>
                    )}
                  </div>
                  <span className="item-name">{item.name}</span>
                  <span className={`status-badge ${item.status || 'pending'}`}>
                    {item.status === 'verified' && '✓ Verificado'}
                    {item.status === 'missing' && '✗ No está'}
                    {item.status === 'displaced' && `⚠ En: ${item.foundLocation}`}
                    {(!item.status || item.status === 'pending') && 'Pendiente'}
                  </span>
                  <div className="item-actions">
                    <button
                      className="btn-sm btn-edit-code"
                      onClick={() => openEditCodeModal(item)}
                      title="Cambiar o corregir código"
                    >
                      ✏️ Código
                    </button>
                    {item.status !== 'displaced' && (
                      <button
                        className="btn-sm warning"
                        onClick={() => openDisplaceModal(item)}
                        title="Está en otra ubicación"
                      >
                        Desplazado
                      </button>
                    )}
                    {item.status !== 'missing' && item.status !== 'verified' && (
                      <button
                        className="btn-sm danger"
                        onClick={() => markMissing(item)}
                        title="No se encontró"
                      >
                        No está
                      </button>
                    )}
                    {(item.status === 'missing' || item.status === 'displaced') && (
                      <button
                        className="btn-sm"
                        onClick={() => resetItem(item)}
                        title="Resetear estado"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB: Códigos Repetidos (Dedicated Section) */}
      {tab === 'repetidos' && (
        <div className="repeated-panel">
          <div className="repeated-panel-header">
            <div>
              <h2>🔁 Apartado de Códigos Supuestamente Repetidos</h2>
              <p className="subtitle">
                Aquí ves todos los bienes cuyo código figura más de una vez. Al verificar físicamente, si descubres
                que tenía otro código o era un error de dedo, puedes cambiarlo directamente con <strong>"Cambiar Código"</strong>.
              </p>
            </div>
            <div className="repeated-filter-group">
              <label>Filtrar por código:</label>
              <select value={repFilterCode} onChange={e => setRepFilterCode(e.target.value)}>
                <option value="all">Todos los grupos ({Object.keys(repeatedCodeGroups).length})</option>
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
                      <div className="rep-group-title">
                        <span className="rep-code-title">Código: {code}</span>
                        <span className="rep-count-tag">{groupItems.length} bienes con este código</span>
                      </div>
                      <div className="rep-locations-list">
                        Ubicaciones: {[...new Set(groupItems.map(i => i.location))].join(' • ')}
                      </div>
                    </div>

                    <div className="rep-items-table">
                      {groupItems.map((item, idx) => (
                        <div key={item.id} className={`rep-item-row ${item.status || 'pending'}`}>
                          <div className="rep-col-check">
                            <input
                              type="checkbox"
                              className="item-check"
                              checked={item.status === 'verified'}
                              onChange={() => toggleVerify(item)}
                              title="Marcar como verificado físicamente"
                            />
                          </div>
                          <div className="rep-col-info">
                            <div className="rep-item-loc">📍 <strong>{item.location}</strong></div>
                            <div className="rep-item-name">{item.name}</div>
                            {item.originalCode && item.code !== item.originalCode && (
                              <div className="rep-prev-code">
                                Código anterior: <s>{item.originalCode}</s>
                              </div>
                            )}
                          </div>
                          <div className="rep-col-status">
                            <span className={`status-badge ${item.status || 'pending'}`}>
                              {item.status === 'verified' && '✓ Verificado'}
                              {item.status === 'missing' && '✗ No está'}
                              {item.status === 'displaced' && `⚠ En: ${item.foundLocation}`}
                              {(!item.status || item.status === 'pending') && 'Pendiente'}
                            </span>
                          </div>
                          <div className="rep-col-actions">
                            <button
                              className="btn-sm btn-primary-outline"
                              onClick={() => openEditCodeModal(item)}
                              title="Cambiar al código físico real"
                            >
                              ✏️ Cambiar Código
                            </button>
                            {item.status !== 'displaced' && (
                              <button
                                className="btn-sm warning"
                                onClick={() => openDisplaceModal(item)}
                                title="Indicar que está en otra área"
                              >
                                Desplazado
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
          <h2>⚠️ Bienes Desplazados</h2>
          <p className="subtitle">Bienes que están registrados en una ubicación pero se encontraron físicamente en otra</p>
          {displacedItems.length === 0 && (
            <div className="empty-state">No hay bienes desplazados registrados</div>
          )}
          {displacedItems.map(item => (
            <div key={item.id} className="displaced-item">
              <div className="displaced-code">{item.code}</div>
              <div className="displaced-name">{item.name}</div>
              <div className="displaced-locations">
                Registrado en: <strong>{item.location}</strong> → Encontrado en: <span>{item.foundLocation}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-sm" onClick={() => resetItem(item)}>
                  Resetear
                </button>
                <button className="btn-sm btn-edit-code" onClick={() => openEditCodeModal(item)}>
                  ✏️ Corregir Código
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Agregar Bien */}
      {tab === 'agregar' && (
        <div className="add-item-panel">
          <h2>Registrar Nuevo Bien</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Código (Control Interno)</label>
              <input
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
                placeholder="Ej: Armario de metal 2 puertas"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Ubicación</label>
              <select value={newLocation} onChange={e => setNewLocation(e.target.value)}>
                <option value="">Seleccionar ubicación...</option>
                {allLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addItem}>
                ➕ Agregar Bien
              </button>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>O escribir nueva ubicación si no existe</label>
              <input
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                placeholder="Ej: P1 · Laboratorio de Balística"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Desplazar Ubicación */}
      {modal?.type === 'displace' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>📍 ¿Dónde se encontró este bien?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              <strong>{modal.item.code}</strong> — {modal.item.name}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Registrado originalmente en: <strong>{modal.item.location}</strong>
            </p>
            <label>Ubicación donde se encontró físicamente</label>
            <select value={displaceLocation} onChange={e => setDisplaceLocation(e.target.value)}>
              <option value="">Seleccionar ubicación...</option>
              {allLocations.filter(l => l !== modal.item.location).map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmDisplace} disabled={!displaceLocation}>
                Confirmar Desplazamiento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cambiar/Corregir Código */}
      {modal?.type === 'editCode' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>✏️ Cambiar / Corregir Código</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              {modal.item.name}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Ubicación: <strong>{modal.item.location}</strong>
            </p>
            <label>Código actual</label>
            <div style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600, marginBottom: 8 }}>
              {modal.item.code}
            </div>
            <label>Nuevo código real (revisado físicamente)</label>
            <input
              type="text"
              autoFocus
              value={editCodeValue}
              onChange={e => setEditCodeValue(e.target.value)}
              placeholder="Ingresa el código correcto..."
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
