/**
 * @file main.js
 * @description Lógica principal con Diagnóstico de Errores y Autocorrección de Rutas.
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
        this.data = {
            aquifers: {}, 
            keyToNameMap: {},
            hydraulicProps: {} 
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
        
        // Marca de tiempo para forzar al navegador a leer los archivos nuevos
        this.cacheBuster = Date.now(); 
        
        this.init();
    }

    handleStateChange(newState) {
        this.updateState(newState);
    }

    updateState(newState) {
        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE };
            this.mapManager.resetView();
            this.render();
            return;
        }
        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords;
            this.mapManager.flyToCoords(lat, lon, name);
        }

        this.state = { ...this.state, ...newState };
        
        // Zoom inteligente para vulnerabilidad
        if (newState.selectedAquifer !== undefined && this.state.activeTheme === 'vulnerability') {
             if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             }
        }
        
        if (newState.areWellsVisible === false) {
            this.state.selectedWellId = null;
        }
        this.render();
    }

    async init() {
        this.uiManager.setLoading(true);
        
        // 1. INTENTAR CARGAR BASE DE DATOS HIDRÁULICA (Prueba 2 rutas posibles)
        let hydroData = null;
        const pathsToTry = [
            `data/boundaries/propiedades_hidraulicas.json?v=${this.cacheBuster}`, // Ruta estandar
            `data/propiedades_hidraulicas.json?v=${this.cacheBuster}`            // Ruta alternativa
        ];

        for (const url of pathsToTry) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    hydroData = await response.json();
                    console.log(`✅ Datos hidráulicos cargados desde: ${url}`);
                    break; 
                }
            } catch (e) { /* Continuar al siguiente intento */ }
        }

        if (hydroData) {
            this.data.hydraulicProps = hydroData;
        } else {
            console.warn("⚠️ No se pudo cargar 'propiedades_hidraulicas.json'. Verifica que el archivo exista en la carpeta 'data/boundaries/' o 'data/'.");
            // Descomenta la siguiente línea si quieres ver una alerta en pantalla cuando falte el archivo
            // alert("Error: No se encuentra el archivo de datos hidráulicos (propiedades_hidraulicas.json).");
        }

        await this.loadLayers();

        this.leafletLayers.graticule = new AutoGraticule({
            color: '#333', weight: 0.8, opacity: 0.5, minDistance: 100
        });

        this.uiManager.setLoading(false);
        this.uiManager.updateView(this.state);
        
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    async loadLayers() {
        const cb = this.cacheBuster; 

        // Capas Auxiliares
        const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
        if (coastlineData) this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
        
        const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
        if (coastline1kmData) this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });

        // 1. CAPA DE VULNERABILIDAD
        const manifest = await fetchGeoJSON(`${CONFIG.dataManifestUrl}?v=${cb}`);
        if (manifest && manifest.files) {
            const dataUrls = manifest.files.map(file => manifest.basePath + file);
            const geojsonArray = await fetchAllGeoJSON(dataUrls);
            const allFeatures = geojsonArray.reduce((acc, fc) => acc.concat(fc ? fc.features : []), []);
            const mainData = { type: "FeatureCollection", features: allFeatures };

            if (mainData.features.length > 0) {
                this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                    mainData,
                    (feature) => this.getVulnerabilityStyle(feature),
                    (feature, layer) => this.onVulnerabilityFeature(feature, layer)
                );
                
                // Indexar para búsqueda
                this.leafletLayers.vulnerability.eachLayer(layer => {
                    const { NOM_ACUIF, CLAVE_ACUI } = layer.feature.properties;
                    if (NOM_ACUIF) {
                        if (!this.data.aquifers[NOM_ACUIF]) this.data.aquifers[NOM_ACUIF] = [];
                        this.data.aquifers[NOM_ACUIF].push(layer);
                    }
                    if (CLAVE_ACUI && !this.data.keyToNameMap[CLAVE_ACUI]) {
                        this.data.keyToNameMap[CLAVE_ACUI] = NOM_ACUIF;
                    }
                });
                this.uiManager.setSearchData(Object.keys(this.data.aquifers), this.data.keyToNameMap);
                this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
            }
        }

        // 2. CAPA DE LÍMITES ACUÍFEROS (HIDRÁULICA)
        // Intentamos cargar primero de boundaries, si falla, intentamos data/
        let boundariesData = await fetchGeoJSON(`data/boundaries/limites_acuiferos_mx.geojson?v=${cb}`);
        if (!boundariesData) {
             console.log("Intentando ruta alternativa para límites...");
             boundariesData = await fetchGeoJSON(`data/limites_acuiferos_mx.geojson?v=${cb}`);
        }

        if (boundariesData) {
            console.log("✅ Capa de Límites cargada correctamente.");
            this.leafletLayers.aquiferBoundaries = L.geoJson(boundariesData, {
                style: (feature) => this.getHydraulicBoundaryStyle(feature),
                onEachFeature: (feature, layer) => this.onHydraulicFeature(feature, layer)
            });
        } else {
            console.error("❌ ERROR CRÍTICO: No se encontró 'limites_acuiferos_mx.geojson'.");
        }

        // 3. CAPA DE POZOS
        let wellsData = await fetchGeoJSON(`data/boundaries/pozos.geojson?v=${cb}`);
        if (!wellsData) wellsData = await fetchGeoJSON(`data/pozos.geojson?v=${cb}`);
        
        if (wellsData) {
            this.leafletLayers.wells = L.geoJson(wellsData, {
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, this.getWellStyle(feature)),
                onEachFeature: (feature, layer) => this.onWellFeature(feature, layer)
            });
        }
    }

    // --- NORMALIZADOR DE CLAVES (EL SECRETO PARA QUE FUNCIONE) ---
    _getNormalizedKey(feature) {
        const p = feature.properties;
        // Buscamos cualquier variación del nombre de la columna
        let rawKey = p.CLAVE_ACUI || p.CLV_ACUI || p.CVE_ACU || p.CLAVE;
        
        if (rawKey === undefined || rawKey === null) return null;
        
        // Convierte a String, quita espacios y rellena con ceros a la izquierda (4 dígitos)
        // Ejemplo: convierte el número 101 en el texto "0101" para que coincida con el JSON
        return String(rawKey).trim().padStart(4, '0');
    }

    // --- ESTILOS Y EVENTOS ---

    getVulnerabilityStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        const fillColor = this.mapManager.getColor(VULNERABIL);
        let style = { ...CONFIG.styles.base, fillColor: fillColor, fillOpacity: this.state.opacity };
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) style = { ...style, ...CONFIG.styles.muted };
        if (this.state.selectedAquifer === NOM_ACUIF) style = { ...style, ...CONFIG.styles.selection };
        return style;
    }

    onVulnerabilityFeature(feature, layer) {
        layer.on({
            mouseover: (e) => {
                if (feature.properties.NOM_ACUIF !== this.state.selectedAquifer) e.target.setStyle({ ...this.getVulnerabilityStyle(feature), ...CONFIG.styles.hover });
            },
            mouseout: (e) => e.target.setStyle(this.getVulnerabilityStyle(feature)),
            click: (e) => {
                L.DomEvent.stop(e);
                e.target.setStyle(CONFIG.styles.clickHighlight);
                e.target.bringToFront();
                setTimeout(() => { if (this.mapManager.map.hasLayer(e.target)) e.target.setStyle(this.getVulnerabilityStyle(feature)); }, 1500);
                this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
            }
        });
    }

    getHydraulicBoundaryStyle(feature) {
        const clave = this._getNormalizedKey(feature);
        const data = this.data.hydraulicProps?.data?.[clave];
        
        // Si hay datos, pintamos azul (disponible), si no, gris (sin datos)
        return {
            weight: 1,
            color: '#666',
            fillColor: data ? '#AAD3DF' : '#E0E0E0', 
            fillOpacity: 0.5
        };
    }

    onHydraulicFeature(feature, layer) {
        const clave = this._getNormalizedKey(feature);
        
        layer.on({
            mouseover: (e) => e.target.setStyle({ weight: 2, color: '#000', fillOpacity: 0.7 }),
            mouseout: (e) => e.target.setStyle(this.getHydraulicBoundaryStyle(feature)),
            click: (e) => {
                L.DomEvent.stop(e);
                
                // 1. Buscar datos en el JSON
                const dataPromedio = this.data.hydraulicProps?.data?.[clave];
                
                // 2. Diagnóstico en Consola (F12)
                console.log(`Clic en Acuífero: ${clave}`);
                if(!dataPromedio) {
                    console.warn(`No se encontraron datos para la clave ${clave}. Verifica propiedades_hidraulicas.json`);
                }

                // 3. Obtener nombre (prioridad: JSON > GeoJSON Nuevo > GeoJSON Viejo)
                const nombre = (dataPromedio ? dataPromedio.nombre : null) || feature.properties.NOM_ACUIF || feature.properties.NOM_ACUI || 'Desconocido';

                // 4. Construir objeto para mostrar
                const displayProps = {
                    'Nombre del Acuífero': nombre,
                    'Clave': clave,
                    ...dataPromedio // Esparce transmisividad_media, etc.
                };
                
                this.uiManager.showInfoPanel(displayProps);
            }
        });
    }

    getWellStyle(feature) {
        const isSelected = (this.state.selectedWellId === feature.properties.NOMBRE_POZO);
        return {
            radius: isSelected ? 8 : 4,
            fillColor: isSelected ? '#FFD700' : '#007BFF',
            color: '#fff', weight: 1, opacity: 1, fillOpacity: isSelected ? 1 : 0.8
        };
    }

    onWellFeature(feature, layer) {
        layer.on('click', (e) => {
            L.DomEvent.stop(e);
            this.updateState({ selectedWellId: feature.properties.NOMBRE_POZO });
            this.uiManager.showInfoPanel({
                "Tipo": "Pozo de Monitoreo",
                ...feature.properties
            });
        });
    }

    render() {
        const map = this.mapManager.map;
        const { activeTheme, areWellsVisible, selectedWellId } = this.state;

        // GESTIÓN DE TEMAS
        if (activeTheme === 'vulnerability') {
            if (this.leafletLayers.vulnerability && !map.hasLayer(this.leafletLayers.vulnerability)) this.leafletLayers.vulnerability.addTo(map);
            if (this.leafletLayers.aquiferBoundaries && map.hasLayer(this.leafletLayers.aquiferBoundaries)) map.removeLayer(this.leafletLayers.aquiferBoundaries);
            if (this.leafletLayers.vulnerability) {
                this.leafletLayers.vulnerability.eachLayer(l => l.setStyle(this.getVulnerabilityStyle(l.feature)));
            }
        } else { // hydraulics
            if (this.leafletLayers.aquiferBoundaries && !map.hasLayer(this.leafletLayers.aquiferBoundaries)) this.leafletLayers.aquiferBoundaries.addTo(map);
            if (this.leafletLayers.vulnerability && map.hasLayer(this.leafletLayers.vulnerability)) map.removeLayer(this.leafletLayers.vulnerability);
            if (this.leafletLayers.aquiferBoundaries) {
                this.leafletLayers.aquiferBoundaries.eachLayer(l => l.setStyle(this.getHydraulicBoundaryStyle(l.feature)));
            }
        }

        // GESTIÓN DE POZOS
        if (this.leafletLayers.wells) {
            if (areWellsVisible) {
                if (!map.hasLayer(this.leafletLayers.wells)) this.leafletLayers.wells.addTo(map);
                this.leafletLayers.wells.eachLayer(l => {
                    l.setStyle(this.getWellStyle(l.feature));
                    if (l.feature.properties.NOMBRE_POZO === selectedWellId) l.bringToFront();
                });
            } else {
                if (map.hasLayer(this.leafletLayers.wells)) map.removeLayer(this.leafletLayers.wells);
            }
        }

        // CAPAS AUXILIARES
        const auxLayers = [
            { layer: this.leafletLayers.coastline, visible: this.state.isCoastlineVisible },
            { layer: this.leafletLayers.coastline1km, visible: this.state.isCoastline1kmVisible },
            { layer: this.leafletLayers.graticule, visible: this.state.isGraticuleVisible }
        ];
        auxLayers.forEach(({ layer, visible }) => {
            if (!layer) return;
            if (visible && !map.hasLayer(layer)) layer.addTo(map);
            else if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
        });

        this.uiManager.updateView(this.state);
    }
}

document.addEventListener('DOMContentLoaded', () => { new GeovisorApp(); });
