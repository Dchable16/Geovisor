/**
 * @file main.js
 * @description Lógica principal del Geovisor.
 * Integra:
 * 1. Capa de Vulnerabilidad (Fragmentada)
 * 2. Capa Hidráulica (Límites Generales + Datos Promedio)
 * 3. Capa de Pozos (Puntos Individuales)
 */
'use strict';

import { CONFIG } from './config.js';
import { fetchGeoJSON, fetchAllGeoJSON } from './dataLoader.js';
import AutoGraticule from 'https://esm.sh/leaflet-auto-graticule';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';

// --- ESTADO INICIAL ---
const INITIAL_STATE = {
    opacity: 0.5,
    filterValue: 'all',
    selectedAquifer: null,      // Para selección de vulnerabilidad
    isCoastlineVisible: false,
    isCoastline1kmVisible: false,
    isGraticuleVisible: false,
    
    // NUEVOS ESTADOS
    activeTheme: 'vulnerability', // 'vulnerability' | 'hydraulics'
    areWellsVisible: false,       // Toggle de pozos
    selectedWellId: null          // ID del pozo seleccionado para el resaltado
};

class GeovisorApp {
    constructor() {
        this.state = { ...INITIAL_STATE };

        this.data = {
            aquifers: {},       // Referencias a capas de vulnerabilidad (GeoJSON fragmentado)
            keyToNameMap: {},   // Mapa Clave -> Nombre para búsqueda
            hydraulicProps: {}  // Base de datos de promedios hidráulicos (JSON)
        };

        this.leafletLayers = {
            vulnerability: null,     // Capa de zonas de vulnerabilidad
            aquiferBoundaries: null, // Capa de límites de acuíferos (Modo Hidráulica)
            wells: null,             // Capa de pozos (Puntos)
            coastline: null,
            coastline1km: null,
            graticule: null
        };

        this.mapManager = new MapManager(CONFIG.mapId);
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));
        
        this.init();
    }

    handleStateChange(newState) {
        this.updateState(newState);
    }

    updateState(newState) {
        // Manejo de Reset
        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE };
            this.mapManager.resetView();
            this.render();
            return;
        }

        // Manejo de Vuelo a Coordenadas
        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords;
            this.mapManager.flyToCoords(lat, lon, name);
        }

        // Actualizar estado
        this.state = { ...this.state, ...newState };
        console.log("Estado actualizado:", this.state);

        // Lógica de Zoom al seleccionar acuífero (Vulnerabilidad)
        if (newState.selectedAquifer !== undefined && this.state.activeTheme === 'vulnerability') {
             if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             }
        }

        // Si se desactivan los pozos, limpiamos la selección del pozo
        if (newState.areWellsVisible === false) {
            this.state.selectedWellId = null;
        }

        this.render();
    }

    async init() {
        this.uiManager.setLoading(true);
        
        // 1. Cargar Datos Alfanuméricos (Promedios Hidráulicos)
        try {
            const hydroResponse = await fetch('data/boundaries/propiedades_hidraulicas.json');
            if (hydroResponse.ok) {
                this.data.hydraulicProps = await hydroResponse.json();
                console.log("Datos hidráulicos cargados:", Object.keys(this.data.hydraulicProps.data || {}).length, "acuíferos.");
            } else {
                console.warn("No se encontró propiedades_hidraulicas.json en data/boundaries/");
            }
        } catch (e) {
            console.error("Error cargando datos hidráulicos:", e);
        }

        // 2. Cargar Capas Geográficas
        await this.loadLayers();

        // 3. Configurar Graticule
        this.leafletLayers.graticule = new AutoGraticule({
            color: '#333', 
            weight: 0.8,
            opacity: 0.5,
            minDistance: 100
        });

        this.uiManager.setLoading(false);
        this.uiManager.updateView(this.state);
        
        // Zoom inicial (si hay vulnerabilidad cargada)
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    async loadLayers() {
        // --- A. Capas Auxiliares ---
        const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
        if (coastlineData) this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
        
        const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
        if (coastline1kmData) this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });

        // --- B. Capa de Vulnerabilidad (Fragmentada) ---
        const manifest = await fetchGeoJSON(CONFIG.dataManifestUrl);
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

        // --- C. Capa de Límites de Acuíferos (Modo Hidráulica) ---
        const boundariesData = await fetchGeoJSON('data/boundaries/limites_acuiferos_mx.geojson');
        if (boundariesData) {
            this.leafletLayers.aquiferBoundaries = L.geoJson(boundariesData, {
                style: (feature) => this.getHydraulicBoundaryStyle(feature),
                onEachFeature: (feature, layer) => this.onHydraulicFeature(feature, layer)
            });
        }

        // --- D. Capa de Pozos (Puntos) ---
        const wellsData = await fetchGeoJSON('data/boundaries/pozos.geojson');
        if (wellsData) {
            this.leafletLayers.wells = L.geoJson(wellsData, {
                pointToLayer: (feature, latlng) => {
                    return L.circleMarker(latlng, this.getWellStyle(feature));
                },
                onEachFeature: (feature, layer) => this.onWellFeature(feature, layer)
            });
        }
    }

    // ============================================================
    //      ESTILOS Y EVENTOS: MODO VULNERABILIDAD
    // ============================================================
    getVulnerabilityStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        const fillColor = this.mapManager.getColor(VULNERABIL);
        
        let styleOptions = {
            ...CONFIG.styles.base,
            fillColor: fillColor,
            fillOpacity: this.state.opacity
        };

        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            styleOptions = { ...styleOptions, ...CONFIG.styles.muted };
        }

        if (this.state.selectedAquifer === NOM_ACUIF) {
            styleOptions = { ...styleOptions, ...CONFIG.styles.selection };
        }
        return styleOptions;
    }

    onVulnerabilityFeature(feature, layer) {
        layer.on({
            mouseover: (e) => {
                if (feature.properties.NOM_ACUIF !== this.state.selectedAquifer) {
                    e.target.setStyle({ ...this.getVulnerabilityStyle(feature), ...CONFIG.styles.hover });
                }
            },
            mouseout: (e) => { e.target.setStyle(this.getVulnerabilityStyle(feature)); },
            click: (e) => {
                L.DomEvent.stop(e);
                e.target.setStyle(CONFIG.styles.clickHighlight);
                e.target.bringToFront();
                
                // Restaurar estilo después de un momento
                setTimeout(() => {
                    if (this.mapManager.map.hasLayer(e.target)) {
                        e.target.setStyle(this.getVulnerabilityStyle(feature));
                    }
                }, 1500);
                
                this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
            }
        });
    }

    // ============================================================
    //      ESTILOS Y EVENTOS: MODO HIDRÁULICA (ACUÍFEROS)
    // ============================================================
    getHydraulicBoundaryStyle(feature) {
        // Estilo base para los límites de acuíferos
        // Podríamos colorear por alguna propiedad si quisiéramos (ej. disponibilidad)
        return {
            weight: 1,
            color: '#555',        // Borde gris oscuro
            fillColor: '#AAD3DF', // Azul claro base
            fillOpacity: 0.4
        };
    }

    onHydraulicFeature(feature, layer) {
        const clave = feature.properties.CLAVE_ACUI;
        
        layer.on({
            mouseover: (e) => {
                e.target.setStyle({ weight: 2, color: '#000', fillOpacity: 0.6 });
            },
            mouseout: (e) => {
                e.target.setStyle(this.getHydraulicBoundaryStyle(feature));
            },
            click: (e) => {
                L.DomEvent.stop(e); // No propagar click al mapa base

                // 1. Buscar datos promedio en el JSON cargado
                const dataPromedio = this.data.hydraulicProps?.data?.[clave];
                
                // 2. Combinar con nombre/clave
                const nombre = this.data.keyToNameMap[clave] || 'Acuífero';
                const displayProps = {
                    'Nombre': nombre,
                    'Clave': clave,
                    ...dataPromedio // Esparce transmisividad_media, etc.
                };

                // 3. Mostrar en panel
                this.uiManager.showInfoPanel(displayProps);
            }
        });
    }

    // ============================================================
    //      ESTILOS Y EVENTOS: POZOS (PUNTOS)
    // ============================================================
    getWellStyle(feature) {
        // ¿Es el pozo seleccionado?
        const isSelected = (this.state.selectedWellId === feature.properties.NOMBRE_POZO);
        
        return {
            radius: isSelected ? 8 : 4,         // Más grande si seleccionado
            fillColor: isSelected ? '#FFD700' : '#007BFF', // Amarillo (Select) vs Azul (Normal)
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: isSelected ? 1 : 0.8
        };
    }

    onWellFeature(feature, layer) {
        layer.on('click', (e) => {
            L.DomEvent.stop(e); // Importante: Que no seleccione el acuífero de abajo
            
            // 1. Actualizar estado para el resaltado
            this.updateState({ selectedWellId: feature.properties.NOMBRE_POZO });
            
            // 2. Preparar datos para el panel
            const props = feature.properties;
            const displayData = {
                "Tipo": "Pozo de Monitoreo",
                "Nombre del Pozo": props.NOMBRE_POZO,
                "Acuífero": props.ACUIFERO,
                // Formatear con unidades si existen
                "Transmisividad": props.T_m2d ? `${props.T_m2d} m²/d` : null,
                "Conductividad": props.K_md ? `${props.K_md} m/d` : null,
                "Coef. Almacenamiento": props.S,
                "Caudal (Q)": props.Q_lps ? `${props.Q_lps} lps` : null,
                "Profundidad": props.PROFUNDIDAD ? `${props.PROFUNDIDAD} m` : null
            };

            this.uiManager.showInfoPanel(displayData);
        });
    }


    // ============================================================
    //      RENDERIZADO PRINCIPAL (The Loop)
    // ============================================================
    render() {
        const map = this.mapManager.map;
        const { activeTheme, areWellsVisible, selectedWellId } = this.state;

        // --- 1. GESTIÓN DE TEMA (CAPAS BASE DE INFORMACIÓN) ---
        if (activeTheme === 'vulnerability') {
            // MOSTRAR Vulnerabilidad
            if (this.leafletLayers.vulnerability && !map.hasLayer(this.leafletLayers.vulnerability)) {
                this.leafletLayers.vulnerability.addTo(map);
            }
            // OCULTAR Hidráulica (Límites)
            if (this.leafletLayers.aquiferBoundaries && map.hasLayer(this.leafletLayers.aquiferBoundaries)) {
                map.removeLayer(this.leafletLayers.aquiferBoundaries);
            }

            // Actualizar estilos de vulnerabilidad (por opacidad o filtros)
            if (this.leafletLayers.vulnerability) {
                this.leafletLayers.vulnerability.eachLayer(layer => {
                    layer.setStyle(this.getVulnerabilityStyle(layer.feature));
                });
            }

        } else if (activeTheme === 'hydraulics') {
            // MOSTRAR Hidráulica (Límites)
            if (this.leafletLayers.aquiferBoundaries && !map.hasLayer(this.leafletLayers.aquiferBoundaries)) {
                this.leafletLayers.aquiferBoundaries.addTo(map);
            }
            // OCULTAR Vulnerabilidad
            if (this.leafletLayers.vulnerability && map.hasLayer(this.leafletLayers.vulnerability)) {
                map.removeLayer(this.leafletLayers.vulnerability);
            }
            
            // Actualizar estilos hidráulicos (si hubiera lógica dinámica)
            if (this.leafletLayers.aquiferBoundaries) {
                this.leafletLayers.aquiferBoundaries.eachLayer(layer => {
                    layer.setStyle(this.getHydraulicBoundaryStyle(layer.feature));
                });
            }
        }

        // --- 2. GESTIÓN DE CAPA DE POZOS (SUPERPUESTA) ---
        if (this.leafletLayers.wells) {
            if (areWellsVisible) {
                if (!map.hasLayer(this.leafletLayers.wells)) {
                    this.leafletLayers.wells.addTo(map);
                }
                // Actualizar estilo para reflejar selección (Highlight)
                this.leafletLayers.wells.eachLayer(layer => {
                    layer.setStyle(this.getWellStyle(layer.feature));
                    
                    // Traer el pozo seleccionado al frente para que no quede tapado
                    if (layer.feature.properties.NOMBRE_POZO === selectedWellId) {
                        layer.bringToFront();
                    }
                });
            } else {
                if (map.hasLayer(this.leafletLayers.wells)) {
                    map.removeLayer(this.leafletLayers.wells);
                }
            }
        }

        // --- 3. CAPAS AUXILIARES (COSTA, ETC.) ---
        [
            { layer: this.leafletLayers.coastline, isVisible: this.state.isCoastlineVisible },
            { layer: this.leafletLayers.coastline1km, isVisible: this.state.isCoastline1kmVisible },
            { layer: this.leafletLayers.graticule, isVisible: this.state.isGraticuleVisible }
        ].forEach(({ layer, isVisible }) => {
            if (!layer) return;
            if (isVisible && !map.hasLayer(layer)) layer.addTo(map);
            else if (!isVisible && map.hasLayer(layer)) map.removeLayer(layer);
        });

        // --- 4. UPDATE UI ---
        this.uiManager.updateView(this.state);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
