/**
 * @file main.js
 * @description Archivo principal actualizado con arquitectura de Doble Capa (Vulnerabilidad/Hidráulica).
 */
'use strict';

import { CONFIG } from './config.js';
import { fetchGeoJSON, fetchAllGeoJSON } from './dataLoader.js';
import AutoGraticule from 'https://esm.sh/leaflet-auto-graticule';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';

// --- ESTADO INICIAL ACTUALIZADO ---
const INITIAL_STATE = {
    opacity: 0.5,
    filterValue: 'all',
    selectedAquifer: null,
    isCoastlineVisible: false,
    isCoastline1kmVisible: false,
    isGraticuleVisible: false,
    activeTheme: 'vulnerability' // NUEVO: 'vulnerability' | 'hydraulics'
};

class GeovisorApp {
    constructor() {
        this.state = { ...INITIAL_STATE };

        this.data = {
            aquifers: {},       // Referencias a capas de vulnerabilidad (GeoJSON fragmentado)
            keyToNameMap: {},   // Mapa Clave -> Nombre
            hydraulicProps: {}  // NUEVO: "Base de datos" alfanumérica (JSON)
        };

        this.leafletLayers = {
            vulnerability: null,    // Capa compleja (mosaico)
            aquiferBoundaries: null, // NUEVO: Capa simple (polígonos únicos)
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
        console.log("Estado actualizado:", this.state);

        // Lógica de Zoom Inteligente
        if (newState.selectedAquifer !== undefined) {
             // Si estamos en modo vulnerabilidad, usamos los fragmentos
             if (this.state.activeTheme === 'vulnerability' && this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             }
             // TODO: Agregar lógica de zoom para modo hidráulico si se selecciona desde la lista
        }

        this.render();
    }

    async init() {
        this.uiManager.setLoading(true);
        
        // 1. Cargar Datos Alfanuméricos (La "Base de Datos" Hidráulica)
        // Se asume que existe data/propiedades_hidraulicas.json
        try {
            const hydroResponse = await fetch('data/boundaries/propiedades_hidraulicas.json');
            if (hydroResponse.ok) {
                this.data.hydraulicProps = await hydroResponse.json();
                console.log("Datos hidráulicos cargados:", Object.keys(this.data.hydraulicProps.data).length, "registros.");
            } else {
                console.warn("No se encontró propiedades_hidraulicas.json, el modo hidráulico estará vacío.");
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
        
        // Zoom inicial
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    async loadLayers() {
        // --- Carga de Capas Auxiliares ---
        const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
        if (coastlineData) this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
        
        const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
        if (coastline1kmData) this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });

        // --- Carga CAPA 1: Vulnerabilidad (Fragmentada) ---
        const manifest = await fetchGeoJSON(CONFIG.dataManifestUrl);
        if (manifest && manifest.files) {
            const dataUrls = manifest.files.map(file => manifest.basePath + file);
            const geojsonArray = await fetchAllGeoJSON(dataUrls);
            
            const allFeatures = geojsonArray.reduce((acc, fc) => acc.concat(fc ? fc.features : []), []);
            const mainData = { type: "FeatureCollection", features: allFeatures };

            if (mainData.features.length > 0) {
                this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                    mainData,
                    (feature) => this.getFeatureStyle(feature),
                    (feature, layer) => this.onEachFeature(feature, layer)
                );

                // Procesamiento para el buscador (basado en vulnerabilidad)
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

        // --- Carga CAPA 2: Límites de Acuíferos (Unitaria/Simplificada) ---
        // Se asume que existe data/limites_acuiferos_mx.geojson
        const boundariesData = await fetchGeoJSON('data/boundaries/limites_acuiferos_mx.geojson');
        
        if (boundariesData) {
            console.log("Capa de límites cargada.");
            this.leafletLayers.aquiferBoundaries = L.geoJson(boundariesData, {
                style: (feature) => this.getHydraulicStyle(feature), // Estilo dinámico basado en datos
                onEachFeature: (feature, layer) => this.onHydraulicFeature(feature, layer)
            });
            // Nota: No añadimos .addTo(map) aquí, el método render() decide cuándo mostrarla.
        }
    }

    // --- ESTILOS Y EVENTOS: MODO VULNERABILIDAD ---
    getFeatureStyle(feature) {
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

    onEachFeature(feature, layer) {
        // Eventos originales de vulnerabilidad
        layer.on({
            mouseover: (e) => {
                if (feature.properties.NOM_ACUIF !== this.state.selectedAquifer) {
                    e.target.setStyle({ ...this.getFeatureStyle(feature), ...CONFIG.styles.hover });
                }
            },
            mouseout: (e) => { e.target.setStyle(this.getFeatureStyle(feature)); },
            click: (e) => {
                L.DomEvent.stop(e);
                e.target.setStyle(CONFIG.styles.clickHighlight);
                e.target.bringToFront();
                setTimeout(() => {
                    if (this.mapManager.map.hasLayer(e.target)) e.target.setStyle(this.getFeatureStyle(feature));
                }, 1500);
                
                this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
            }
        });
    }

    // --- ESTILOS Y EVENTOS: MODO HIDRÁULICA (NUEVO) ---
    getHydraulicStyle(feature) {
        const clave = feature.properties.CLAVE_ACUI;
        // JOIN: Buscamos en el JSON usando la clave del GeoJSON
        const data = this.data.hydraulicProps?.data?.[clave];

        // Lógica de color temporal (puedes moverla a config.js o mapManager después)
        // Ejemplo: Colorear por Disponibilidad (Negativo = Rojo, Positivo = Azul)
        let color = '#cccccc'; // Sin datos
        if (data && data.disponibilidad !== undefined) {
            color = data.disponibilidad < 0 ? '#D90404' : '#007BFF';
        }

        return {
            weight: 1,
            color: '#555',
            fillColor: color,
            fillOpacity: 0.7
        };
    }

    onHydraulicFeature(feature, layer) {
        const clave = feature.properties.CLAVE_ACUI;
        
        layer.on({
            mouseover: (e) => {
                e.target.setStyle({ weight: 3, color: '#FFF', fillOpacity: 0.9 });
            },
            mouseout: (e) => {
                e.target.setStyle(this.getHydraulicStyle(feature));
            },
            click: (e) => {
                L.DomEvent.stop(e);
                // JOIN: Recuperar datos completos para el panel
                const data = this.data.hydraulicProps?.data?.[clave];
                
                // Preparamos un objeto combinado para enviarlo a la UI
                // Si uiManager no tiene método específico para hidráulica, 
                // le enviamos datos formateados para que 'showInfoPanel' intente mostrarlos
                const displayProps = {
                    'Clave': clave,
                    'Nombre': this.data.keyToNameMap[clave] || 'Desconocido',
                    ...data // Esparce todas las propiedades (Transmisividad, etc.)
                };

                // Aquí podrías llamar a un método nuevo: this.uiManager.showHydraulicPanel(displayProps)
                // Por ahora reusamos el existente pasando un mapa de configuración 'dummy' o nulo
                console.log("Click en Acuífero (Hidráulica):", displayProps);
                alert(`Datos Hidráulicos:\n${JSON.stringify(displayProps, null, 2)}`); // Temporal hasta actualizar UI
            }
        });
    }

    // --- RENDERIZADO PRINCIPAL ---
    render() {
        const map = this.mapManager.map;
        const { activeTheme } = this.state;

        // 1. GESTIÓN DE CAPAS PRINCIPALES (SWITCH DE TEMA)
        if (activeTheme === 'vulnerability') {
            // Activar Vulnerabilidad
            if (this.leafletLayers.vulnerability && !map.hasLayer(this.leafletLayers.vulnerability)) {
                this.leafletLayers.vulnerability.addTo(map);
            }
            // Desactivar Hidráulica
            if (this.leafletLayers.aquiferBoundaries && map.hasLayer(this.leafletLayers.aquiferBoundaries)) {
                map.removeLayer(this.leafletLayers.aquiferBoundaries);
            }

            // Actualizar estilos de vulnerabilidad
            if (this.leafletLayers.vulnerability) {
                this.leafletLayers.vulnerability.eachLayer(layer => {
                    layer.setStyle(this.getFeatureStyle(layer.feature));
                });
            }

        } else if (activeTheme === 'hydraulics') {
            // Activar Hidráulica
            if (this.leafletLayers.aquiferBoundaries && !map.hasLayer(this.leafletLayers.aquiferBoundaries)) {
                this.leafletLayers.aquiferBoundaries.addTo(map);
            }
            // Desactivar Vulnerabilidad
            if (this.leafletLayers.vulnerability && map.hasLayer(this.leafletLayers.vulnerability)) {
                map.removeLayer(this.leafletLayers.vulnerability);
            }
            
            // Actualizar estilos hidráulicos
            if (this.leafletLayers.aquiferBoundaries) {
                this.leafletLayers.aquiferBoundaries.eachLayer(layer => {
                    layer.setStyle(this.getHydraulicStyle(layer.feature));
                });
            }
        }

        // 2. Traer al frente selección (solo si aplica al tema activo)
        if (activeTheme === 'vulnerability' && this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
            this.data.aquifers[this.state.selectedAquifer].forEach(layer => {
                if (map.hasLayer(layer)) layer.bringToFront();
            });
        }

        // 3. Capas Auxiliares (Independientes del tema)
        [
            { layer: this.leafletLayers.coastline, isVisible: this.state.isCoastlineVisible },
            { layer: this.leafletLayers.coastline1km, isVisible: this.state.isCoastline1kmVisible },
            { layer: this.leafletLayers.graticule, isVisible: this.state.isGraticuleVisible }
        ].forEach(({ layer, isVisible }) => {
            if (!layer) return;
            if (isVisible && !map.hasLayer(layer)) layer.addTo(map);
            else if (!isVisible && map.hasLayer(layer)) map.removeLayer(layer);
        });

        // 4. UI Update
        this.uiManager.updateView(this.state);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
