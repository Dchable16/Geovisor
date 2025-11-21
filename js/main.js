/**
 * @file main.js
 * @version 1.2.0
 * @description Controlador principal con Filtrado Dinámico de Controles, Zoom Universal y Doble Índice.
 */
'use strict';

import { CONFIG } from './config.js';
import { fetchGeoJSON, fetchAllGeoJSON } from './dataLoader.js';
import AutoGraticule from 'https://esm.sh/leaflet-auto-graticule';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';

const INITIAL_STATE = {
    opacity: 0.5,
    filterValue: 'all',
    selectedAquifer: null,
    isCoastlineVisible: false,
    isCoastline1kmVisible: false,
    isGraticuleVisible: false,
    activeTheme: 'vulnerability', // 'vulnerability' | 'hydraulics'
    areWellsVisible: false,
    selectedWellId: null
};

class GeovisorApp {
    constructor() {
        this.state = { ...INITIAL_STATE };

        // --- ESTRUCTURA DE DATOS ACTUALIZADA (DOBLE ÍNDICE) ---
        this.data = {
            // Índice VULNERABILIDAD
            vulnLayers: {},      // Nombre -> Array de capas (fragmentadas)
            vulnNames: [],       // Lista de nombres para el buscador
            vulnKeyMap: {},      // Clave -> Nombre

            // Índice HIDRÁULICA
            hydroLayers: {},     // Nombre -> Capa Leaflet (única) para hacer zoom
            hydroNames: [],      // Lista de nombres (solo los que tienen geometría)
            hydroKeyMap: {},     // Clave -> Nombre
            
            hydraulicProps: {}   // Base de datos JSON (Promedios)
        };

        this.leafletLayers = {
            vulnerability: null,
            aquiferBoundaries: null,
            wells: null,
            coastline: null,
            coastline1km: null,
            graticule: null
        };

        this.mapManager = new MapManager(CONFIG.mapId);
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));
        this.cacheBuster = Date.now(); 
        
        this.init();
    }

    handleStateChange(newState) {
        this.updateState(newState);
    }

    updateState(newState) {
        // Detectar cambio de tema antes de mezclar el estado
        const themeChanged = newState.activeTheme && newState.activeTheme !== this.state.activeTheme;

        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE };
            this.mapManager.resetView();
            // Al resetear, volvemos a la lista por defecto (Vulnerabilidad)
            this.refreshUIControls('vulnerability');
            this.render();
            return;
        }

        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords;
            this.mapManager.flyToCoords(lat, lon, name);
        }

        this.state = { ...this.state, ...newState };
        console.log("Estado:", this.state);

        // 1. ACTUALIZAR CONTROLES SI CAMBIÓ EL TEMA
        if (themeChanged) {
            this.refreshUIControls(this.state.activeTheme);
            // Limpiamos la selección anterior para evitar confusiones
            this.state.selectedAquifer = null;
        }

        // 2. LÓGICA DE ZOOM UNIVERSAL (Vulnerabilidad e Hidráulica)
        if (newState.selectedAquifer) {
            const name = newState.selectedAquifer;
            let targetBounds = null;

            if (this.state.activeTheme === 'vulnerability') {
                // Zoom en Vulnerabilidad (FeatureGroup de fragmentos)
                if (this.data.vulnLayers[name]) {
                    const group = L.featureGroup(this.data.vulnLayers[name]);
                    targetBounds = group.getBounds();
                }
            } else {
                // Zoom en Hidráulica (Layer único)
                if (this.data.hydroLayers[name]) {
                    targetBounds = this.data.hydroLayers[name].getBounds();
                }
            }

            if (targetBounds) {
                this.mapManager.fitBounds(targetBounds);
            }
        }

        if (newState.areWellsVisible === false) {
            this.state.selectedWellId = null;
        }

        this.render();
    }

    /**
     * Método auxiliar para inyectar la lista correcta en la UI
     */
    refreshUIControls(theme) {
        let names, keyMap;
        
        if (theme === 'hydraulics') {
            names = this.data.hydroNames;
            keyMap = this.data.hydroKeyMap;
        } else {
            names = this.data.vulnNames;
            keyMap = this.data.vulnKeyMap;
        }

        // Actualizar datos del buscador
        this.uiManager.setSearchData(names, keyMap);

        // Actualizar el Select (Dropdown)
        // Accedemos directamente al nodo para limpiarlo, ya que uiManager.populate solo agrega
        if (this.uiManager.nodes.aquiferSelect) {
            this.uiManager.nodes.aquiferSelect.innerHTML = '<option value="">-- Selecciona un acuífero --</option>';
            this.uiManager.populateAquiferSelect(names);
        }
        
        // Limpiar input de búsqueda
        if (this.uiManager.nodes.searchInput) {
            this.uiManager.nodes.searchInput.value = '';
            if(this.uiManager.nodes.searchResults) this.uiManager.nodes.searchResults.style.display = 'none';
        }
    }

    async init() {
        this.uiManager.setLoading(true);
        
        // Cargar JSON de datos
        let hydroData = null;
        const paths = [`data/boundaries/propiedades_hidraulicas.json?v=${this.cacheBuster}`, `data/propiedades_hidraulicas.json?v=${this.cacheBuster}`];
        for (const url of paths) {
            try {
                const res = await fetch(url);
                if (res.ok) { hydroData = await res.json(); break; }
            } catch (e) {}
        }

        if (hydroData) {
            this.data.hydraulicProps = hydroData;
        }

        await this.loadLayers();

        this.leafletLayers.graticule = new AutoGraticule({ color: '#333', weight: 0.8, opacity: 0.5, minDistance: 100 });

        this.uiManager.setLoading(false);
        
        // Inicializar UI con datos de vulnerabilidad por defecto
        this.refreshUIControls('vulnerability');
        this.uiManager.updateView(this.state);
        
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    async loadLayers() {
        const cb = this.cacheBuster;
        
        // Auxiliares
        const c1 = await fetchGeoJSON(CONFIG.coastlineUrl);
        if (c1) this.leafletLayers.coastline = L.geoJson(c1, { style: CONFIG.styles.coastline });
        const c2 = await fetchGeoJSON(CONFIG.coastline1kmUrl);
        if (c2) this.leafletLayers.coastline1km = L.geoJson(c2, { style: CONFIG.styles.coastline1km });

        // 1. CAPA VULNERABILIDAD (Generar índice 'vuln')
        const manifest = await fetchGeoJSON(`${CONFIG.dataManifestUrl}?v=${cb}`);
        if (manifest && manifest.files) {
            const urls = manifest.files.map(f => manifest.basePath + f);
            const jsons = await fetchAllGeoJSON(urls);
            const features = jsons.reduce((acc, fc) => acc.concat(fc ? fc.features : []), []);
            
            if (features.length > 0) {
                this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                    { type: "FeatureCollection", features },
                    (f) => this.getVulnerabilityStyle(f),
                    (f, l) => this.onVulnerabilityFeature(f, l)
                );

                // INDEXAR VULNERABILIDAD
                this.leafletLayers.vulnerability.eachLayer(layer => {
                    const { NOM_ACUIF, CLAVE_ACUI } = layer.feature.properties;
                    if (NOM_ACUIF) {
                        if (!this.data.vulnLayers[NOM_ACUIF]) {
                            this.data.vulnLayers[NOM_ACUIF] = [];
                            this.data.vulnNames.push(NOM_ACUIF); // Guardar nombre único
                        }
                        this.data.vulnLayers[NOM_ACUIF].push(layer);
                    }
                    if (CLAVE_ACUI) this.data.vulnKeyMap[CLAVE_ACUI] = NOM_ACUIF;
                });
                this.data.vulnNames.sort();
            }
        }

        // 2. CAPA HIDRÁULICA (Generar índice 'hydro')
        let bData = await fetchGeoJSON(`data/boundaries/limites_acuiferos_mx.geojson?v=${cb}`);
        if (!bData) bData = await fetchGeoJSON(`data/limites_acuiferos_mx.geojson?v=${cb}`);

        if (bData) {
            this.leafletLayers.aquiferBoundaries = L.geoJson(bData, {
                style: (f) => this.getHydraulicBoundaryStyle(f),
                onEachFeature: (f, l) => {
                    this.onHydraulicFeature(f, l);
                    
                    // INDEXAR HIDRÁULICA
                    // Usamos el nombre del JSON (si existe) o del GeoJSON
                    const clave = this._getNormalizedKey(f);
                    const data = this.data.hydraulicProps?.data?.[clave];
                    const nombre = (data ? data.nombre : null) || f.properties.NOM_ACUIF || f.properties.NOM_ACUI;

                    if (nombre) {
                        this.data.hydroLayers[nombre] = l; // Guardamos la referencia al layer para el zoom
                        if (!this.data.hydroNames.includes(nombre)) {
                            this.data.hydroNames.push(nombre);
                        }
                        if (clave) this.data.hydroKeyMap[clave] = nombre;
                    }
                }
            });
            this.data.hydroNames.sort();
        }

        // 3. CAPA POZOS
        let wData = await fetchGeoJSON(`data/boundaries/pozos.geojson?v=${cb}`);
        if (!wData) wData = await fetchGeoJSON(`data/pozos.geojson?v=${cb}`);
        if (wData) {
            this.leafletLayers.wells = L.geoJson(wData, {
                pointToLayer: (f, ll) => L.circleMarker(ll, this.getWellStyle(f)),
                onEachFeature: (f, l) => this.onWellFeature(f, l)
            });
        }
    }

    _getNormalizedKey(feature) {
        const p = feature.properties;
        let rawKey = p.CLAVE_ACUI || p.CLV_ACUI || p.CVE_ACU || p.CLAVE;
        if (rawKey == null) return null;
        return String(rawKey).trim().padStart(4, '0');
    }

    // --- ESTILOS ---
    getVulnerabilityStyle(f) {
        const { VULNERABIL, NOM_ACUIF } = f.properties;
        const color = this.mapManager.getColor(VULNERABIL);
        let style = { ...CONFIG.styles.base, fillColor: color, fillOpacity: this.state.opacity };
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) style = { ...style, ...CONFIG.styles.muted };
        if (this.state.selectedAquifer === NOM_ACUIF) style = { ...style, ...CONFIG.styles.selection };
        return style;
    }

    getHydraulicBoundaryStyle(f) {
        const k = this._getNormalizedKey(f);
        const data = this.data.hydraulicProps?.data?.[k];
        
        // Lógica de resaltado al seleccionar en el buscador
        const nombreGeo = f.properties.NOM_ACUIF || f.properties.NOM_ACUI;
        const nombreData = data ? data.nombre : null;
        const isSelected = (this.state.selectedAquifer === nombreData) || (this.state.selectedAquifer === nombreGeo);

        return {
            weight: isSelected ? 3 : 1,
            color: isSelected ? '#FFD700' : '#666', // Borde amarillo si seleccionado
            fillColor: data ? '#AAD3DF' : '#E0E0E0', 
            fillOpacity: this.state.opacity
        };
    }

    getWellStyle(f) {
        const isSel = (this.state.selectedWellId === f.properties.NOMBRE_POZO);
        return { radius: isSel ? 8 : 4, fillColor: isSel ? '#FFD700' : '#007BFF', color: '#fff', weight: 1, opacity: 1, fillOpacity: isSel ? 1 : 0.8 };
    }

    // --- EVENTOS ---
    onVulnerabilityFeature(f, l) {
        l.on({
            mouseover: (e) => { if (f.properties.NOM_ACUIF !== this.state.selectedAquifer) e.target.setStyle({ ...this.getVulnerabilityStyle(f), ...CONFIG.styles.hover }); },
            mouseout: (e) => e.target.setStyle(this.getVulnerabilityStyle(f)),
            click: (e) => {
                L.DomEvent.stop(e);
                e.target.setStyle(CONFIG.styles.clickHighlight);
                e.target.bringToFront();
                setTimeout(() => { if (this.mapManager.map.hasLayer(e.target)) e.target.setStyle(this.getVulnerabilityStyle(f)); }, 1500);
                this.uiManager.showInfoPanel(f.properties, CONFIG.vulnerabilityMap);
            }
        });
    }

    onHydraulicFeature(f, l) {
        const k = this._getNormalizedKey(f);
        l.on({
            mouseover: (e) => e.target.setStyle({ weight: 2, color: '#000', fillOpacity: 0.7 }),
            mouseout: (e) => e.target.setStyle(this.getHydraulicBoundaryStyle(f)),
            click: (e) => {
                L.DomEvent.stop(e);
                const data = this.data.hydraulicProps?.data?.[k];
                const nombre = (data ? data.nombre : null) || f.properties.NOM_ACUIF || 'Acuífero';
                
                // Inyectamos unidades para el panel
                let propsConUnidades = {};
                if (data) {
                    propsConUnidades = {
                        "Transmisividad Media": data.transmisividad_media ? `${data.transmisividad_media} m²/d` : null,
                        "Conductividad Media": data.conductividad_media ? `${data.conductividad_media} m/d` : null,
                        "Coef. Almacenamiento": data.coef_almacenamiento_medio,
                        "Profundidad Media": data.profundidad_media ? `${data.profundidad_media} m` : null,
                        "Pozos Registrados": data.pozos_registrados
                    };
                }

                const props = { 'Nombre del Acuífero': nombre, 'Clave': k, ...propsConUnidades };
                this.uiManager.showInfoPanel(props);
                
                // Actualizar selección para zoom y estilo
                this.updateState({ selectedAquifer: nombre });
            }
        });
    }

    onWellFeature(f, l) {
        l.on('click', (e) => {
            L.DomEvent.stop(e);
            this.updateState({ selectedWellId: f.properties.NOMBRE_POZO });
            this.uiManager.showInfoPanel({ "Tipo": "Pozo de Monitoreo", ...f.properties });
        });
    }

    // --- RENDER ---
    render() {
        const map = this.mapManager.map;
        const { activeTheme, areWellsVisible, selectedWellId } = this.state;

        // Capas Base
        const showVuln = activeTheme === 'vulnerability';
        const showHydro = activeTheme === 'hydraulics';

        if (this.leafletLayers.vulnerability) {
            if (showVuln && !map.hasLayer(this.leafletLayers.vulnerability)) this.leafletLayers.vulnerability.addTo(map);
            else if (!showVuln && map.hasLayer(this.leafletLayers.vulnerability)) map.removeLayer(this.leafletLayers.vulnerability);
            
            if (showVuln) this.leafletLayers.vulnerability.eachLayer(l => l.setStyle(this.getVulnerabilityStyle(l.feature)));
        }

        if (this.leafletLayers.aquiferBoundaries) {
            if (showHydro && !map.hasLayer(this.leafletLayers.aquiferBoundaries)) this.leafletLayers.aquiferBoundaries.addTo(map);
            else if (!showHydro && map.hasLayer(this.leafletLayers.aquiferBoundaries)) map.removeLayer(this.leafletLayers.aquiferBoundaries);
            
            if (showHydro) this.leafletLayers.aquiferBoundaries.eachLayer(l => l.setStyle(this.getHydraulicBoundaryStyle(l.feature)));
        }

        // Pozos
        if (this.leafletLayers.wells) {
            if (areWellsVisible && !map.hasLayer(this.leafletLayers.wells)) this.leafletLayers.wells.addTo(map);
            else if (!areWellsVisible && map.hasLayer(this.leafletLayers.wells)) map.removeLayer(this.leafletLayers.wells);
            
            if (areWellsVisible) {
                this.leafletLayers.wells.eachLayer(l => {
                    l.setStyle(this.getWellStyle(l.feature));
                    if (l.feature.properties.NOMBRE_POZO === selectedWellId) l.bringToFront();
                });
            }
        }

        // Auxiliares
        [{l:this.leafletLayers.coastline, v:this.state.isCoastlineVisible}, 
         {l:this.leafletLayers.coastline1km, v:this.state.isCoastline1kmVisible}, 
         {l:this.leafletLayers.graticule, v:this.state.isGraticuleVisible}
        ].forEach(x => {
            if (!x.l) return;
            if (x.v && !map.hasLayer(x.l)) x.l.addTo(map);
            else if (!x.v && map.hasLayer(x.l)) map.removeLayer(x.l);
        });

        this.uiManager.updateView(this.state);
    }
}

document.addEventListener('DOMContentLoaded', () => { new GeovisorApp(); });
