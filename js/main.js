/**
 * @file main.js
 * @version 1.2.0
 * @description Controlador principal con Filtrado Dinámico de Controles y Zoom Multicapa.
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
    activeTheme: 'vulnerability', 
    areWellsVisible: false,
    selectedWellId: null
};

class GeovisorApp {
    constructor() {
        this.state = { ...INITIAL_STATE };

        this.data = {
            // Índices para VULNERABILIDAD
            vulnLayers: {},      // Nombre -> Capa Leaflet
            vulnNames: [],       // Lista para el buscador
            vulnKeyMap: {},      // Clave -> Nombre

            // Índices para HIDRÁULICA
            hydroLayers: {},     // Nombre -> Capa Leaflet (para Zoom)
            hydroNames: [],      // Lista para el buscador (solo los que tienen datos)
            hydroKeyMap: {},     // Clave -> Nombre
            
            hydraulicProps: {}   // Base de datos completa
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
        // Detectar cambio de tema ANTES de mezclar el estado
        const themeChanged = newState.activeTheme && newState.activeTheme !== this.state.activeTheme;

        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE };
            this.mapManager.resetView();
            // Al resetear, volvemos a controles de vulnerabilidad
            this.uiManager.refreshControls(this.data.vulnNames, this.data.vulnKeyMap);
            this.render();
            return;
        }

        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords;
            this.mapManager.flyToCoords(lat, lon, name);
        }

        // Actualizar estado
        this.state = { ...this.state, ...newState };

        // --- 1. ACTUALIZACIÓN DE CONTROLES (INYECTAR LISTA CORRECTA) ---
        if (themeChanged) {
            if (this.state.activeTheme === 'hydraulics') {
                // Solo acuíferos con datos hidráulicos
                this.uiManager.refreshControls(this.data.hydroNames, this.data.hydroKeyMap);
            } else {
                // Todos los acuíferos (Vulnerabilidad)
                this.uiManager.refreshControls(this.data.vulnNames, this.data.vulnKeyMap);
            }
            this.state.selectedAquifer = null; // Limpiar selección para evitar conflictos
        }

        // --- 2. LÓGICA DE ZOOM UNIFICADA ---
        if (newState.selectedAquifer) {
            const name = newState.selectedAquifer;
            let targetLayer = null;

            if (this.state.activeTheme === 'vulnerability') {
                // Buscar en índice de vulnerabilidad (puede ser grupo de fragmentos)
                if (this.data.vulnLayers[name]) {
                    targetLayer = L.featureGroup(this.data.vulnLayers[name]);
                }
            } else {
                // Buscar en índice hidráulico (capa unitaria)
                targetLayer = this.data.hydroLayers[name];
            }

            if (targetLayer) {
                this.mapManager.fitBounds(targetLayer.getBounds());
            }
        }

        if (newState.areWellsVisible === false) {
            this.state.selectedWellId = null;
        }

        this.render();
    }

    async init() {
        this.uiManager.setLoading(true);
        
        // 1. Cargar Datos Hidráulicos
        let hydroData = null;
        const pathsToTry = [`data/boundaries/propiedades_hidraulicas.json?v=${this.cacheBuster}`, `data/propiedades_hidraulicas.json?v=${this.cacheBuster}`];
        
        for (const url of pathsToTry) {
            try {
                const res = await fetch(url);
                if (res.ok) { hydroData = await res.json(); break; }
            } catch (e) {}
        }

        if (hydroData) {
            this.data.hydraulicProps = hydroData;
            
            // PRE-PROCESAR: Generar índice de nombres hidráulicos para el filtro
            const hydroDict = hydroData.data || {};
            Object.entries(hydroDict).forEach(([key, val]) => {
                if (val && val.nombre) {
                    this.data.hydroNames.push(val.nombre);
                    this.data.hydroKeyMap[key] = val.nombre;
                }
            });
            this.data.hydroNames.sort();
        }

        await this.loadLayers();

        this.leafletLayers.graticule = new AutoGraticule({ color: '#333', weight: 0.8, opacity: 0.5, minDistance: 100 });

        this.uiManager.setLoading(false);
        
        // Inicializar controles con el tema por defecto
        this.uiManager.refreshControls(this.data.vulnNames, this.data.vulnKeyMap);
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

        // 1. VULNERABILIDAD
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
                        if (!this.data.vulnLayers[NOM_ACUIF]) this.data.vulnLayers[NOM_ACUIF] = [];
                        this.data.vulnLayers[NOM_ACUIF].push(layer);
                        if (!this.data.vulnNames.includes(NOM_ACUIF)) this.data.vulnNames.push(NOM_ACUIF);
                    }
                    if (CLAVE_ACUI) this.data.vulnKeyMap[CLAVE_ACUI] = NOM_ACUIF;
                });
                this.data.vulnNames.sort();
            }
        }

        // 2. HIDRÁULICA
        let bData = await fetchGeoJSON(`data/boundaries/limites_acuiferos_mx.geojson?v=${cb}`);
        if (!bData) bData = await fetchGeoJSON(`data/limites_acuiferos_mx.geojson?v=${cb}`);

        if (bData) {
            this.leafletLayers.aquiferBoundaries = L.geoJson(bData, {
                style: (f) => this.getHydraulicBoundaryStyle(f),
                onEachFeature: (f, l) => {
                    this.onHydraulicFeature(f, l);
                    
                    // INDEXAR HIDRÁULICA PARA ZOOM
                    const k = this._getNormalizedKey(f);
                    const data = this.data.hydraulicProps?.data?.[k];
                    // Prioridad nombre: JSON > GeoJSON
                    const nombre = (data ? data.nombre : null) || f.properties.NOM_ACUIF || f.properties.NOM_ACUI;
                    
                    if (nombre) {
                        this.data.hydroLayers[nombre] = l; // Guardamos referencia para zoom
                    }
                }
            });
        }

        // 3. POZOS
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
        const nombre = (data ? data.nombre : null) || f.properties.NOM_ACUIF;
        const isSelected = (this.state.selectedAquifer === nombre);

        return {
            weight: isSelected ? 3 : 1,
            color: isSelected ? '#FFD700' : '#666',
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

                this.uiManager.showInfoPanel({ 'Nombre del Acuífero': nombre, 'Clave': k, ...propsConUnidades });
                
                // Actualizar estado para selección y borde amarillo
                this.updateState({ selectedAquifer: nombre });
            }
        });
    }

    onWellFeature(f, l) {
        l.on('click', (e) => {
            L.DomEvent.stop(e);
            this.updateState({ selectedWellId: f.properties.NOMBRE_POZO });
            
            const p = f.properties;
            const data = {
                "Tipo": "Pozo de Monitoreo", "Nombre del Pozo": p.NOMBRE_POZO, "Acuífero": p.ACUIFERO,
                "Transmisividad": p.T_m2d ? `${p.T_m2d} m²/d` : null,
                "Conductividad": p.K_md ? `${p.K_md} m/d` : null,
                "Coef. Almacenamiento": p.S, "Caudal (Q)": p.Q_lps ? `${p.Q_lps} lps` : null,
                "Profundidad": p.PROFUNDIDAD ? `${p.PROFUNDIDAD} m` : null, "Año": p.AÑO || null
            };
            this.uiManager.showInfoPanel(data);
        });
    }

    // --- RENDER ---
    render() {
        const map = this.mapManager.map;
        const { activeTheme, areWellsVisible, selectedWellId } = this.state;
        const isVuln = activeTheme === 'vulnerability';
        const isHydro = activeTheme === 'hydraulics';

        // Capa Vulnerabilidad
        if (this.leafletLayers.vulnerability) {
            if (isVuln && !map.hasLayer(this.leafletLayers.vulnerability)) this.leafletLayers.vulnerability.addTo(map);
            else if (!isVuln && map.hasLayer(this.leafletLayers.vulnerability)) map.removeLayer(this.leafletLayers.vulnerability);
            if (isVuln) this.leafletLayers.vulnerability.eachLayer(l => l.setStyle(this.getVulnerabilityStyle(l.feature)));
        }

        // Capa Hidráulica
        if (this.leafletLayers.aquiferBoundaries) {
            if (isHydro && !map.hasLayer(this.leafletLayers.aquiferBoundaries)) this.leafletLayers.aquiferBoundaries.addTo(map);
            else if (!isHydro && map.hasLayer(this.leafletLayers.aquiferBoundaries)) map.removeLayer(this.leafletLayers.aquiferBoundaries);
            if (isHydro) this.leafletLayers.aquiferBoundaries.eachLayer(l => l.setStyle(this.getHydraulicBoundaryStyle(l.feature)));
        }

        // Pozos
        if (this.leafletLayers.wells) {
            if (areWellsVisible && !map.hasLayer(this.leafletLayers.wells)) this.leafletLayers.wells.addTo(map);
            else if (!areWellsVisible && map.hasLayer(this.leafletLayers.wells)) map.removeLayer(this.leafletLayers.wells);
            if (areWellsVisible) {
                this.leafletLayers.wells
