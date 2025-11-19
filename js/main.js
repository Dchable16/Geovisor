/**
 * @file main.js
 * @description Archivo principal que inicializa el geovisor.
 */
'use strict';

import { CONFIG } from './config.js';
import { fetchGeoJSON, fetchAllGeoJSON } from './dataLoader.js';
import { MapManager } from './mapManager.js';
import { UiManager } from './uiManager.js'; // Nombre corregido (UiManager)
import AutoGraticule from 'https://esm.sh/leaflet-auto-graticule';

class GeovisorApp {
    constructor() {
        // Estado unificado
        this.state = {
            opacity: 0.5,
            filterValue: 'all',
            selectedAquifer: null,
            isCoastlineVisible: false,
            isCoastline1kmVisible: false,
            isGraticuleVisible: false
        };

        this.data = {
            aquifers: {},
            keyToNameMap: {}
        };

        this.leafletLayers = {};

        this.mapManager = new MapManager(CONFIG.mapId);
        
        // Pasamos 'this' (la app) al UiManager para que pueda llamar a nuestras funciones
        this.uiManager = new UiManager(this); 
        
        this.init();
    }

    async init() {
        this.uiManager.setLoading(true);
        await this.loadLayers();
        
        // Inicializar Graticule (sin añadirlo aún, depende del toggle)
        this.leafletLayers.graticule = new AutoGraticule({
            color: '#333', 
            weight: 0.8,
            opacity: 0.5,
            minDistance: 100
        });

        this.uiManager.setLoading(false);
        this.updateState(this.state); // Render inicial
        
        // Zoom inicial si hay datos
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    /* --- MÉTODOS PUENTE PARA EL UI MANAGER --- */
    
    // Llamado cuando se selecciona un radio button de vulnerabilidad
    handleLayerChange(value) {
        this.updateState({ filterValue: value });
    }

    // Llamado por el slider de opacidad
    handleOpacityChange(value) {
        this.updateState({ opacity: value });
    }

    // Llamado por los interruptores (toggles)
    handleToggleChange(toggleId, isChecked) {
        if (toggleId === 'coastline') {
            this.updateState({ isCoastlineVisible: isChecked });
        } else if (toggleId === 'coastline1km') {
            this.updateState({ isCoastline1kmVisible: isChecked });
        } else if (toggleId === 'graticule') {
            this.updateState({ isGraticuleVisible: isChecked });
        }
    }

    // Llamado por el buscador o el select
    handleAcuiferoSelect(value) {
        this.updateState({ selectedAquifer: value });
    }

    // Llamado por el botón de coordenadas
    handleFlyToCoords(lat, lon, name) {
        this.mapManager.flyToCoords(lat, lon, name);
    }

    // Llamado por el botón de restablecer
    resetView() {
        this.mapManager.resetView();
        this.updateState({ 
            reset: true,
            opacity: 0.5,
            filterValue: 'all',
            selectedAquifer: null,
            isCoastlineVisible: false,
            isCoastline1kmVisible: false,
            isGraticuleVisible: false
        });
    }

    /* --- LÓGICA PRINCIPAL --- */

    updateState(newState) {
        if (newState.reset) {
             // El reset ya se manejó arriba, solo aseguramos limpiar visuales si es necesario
        }
        
        this.state = { ...this.state, ...newState };
        
        // Lógica de Zoom al seleccionar acuífero
        if (newState.selectedAquifer !== undefined) {
             if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             } else if (this.leafletLayers.vulnerability && newState.selectedAquifer === null && !newState.reset) {
                 this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
             }
        }

        this.render();
        // Sincronizar la UI con el nuevo estado
        this.uiManager.updateView(this.state);
    }

    async loadLayers() {
        const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
        if (coastlineData) this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
        
        const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
        if (coastline1kmData) this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });

        const manifest = await fetchGeoJSON(CONFIG.dataManifestUrl);
        if (!manifest || !manifest.files) {
            alert("Error cargando manifest.json");
            return;
        }

        const dataUrls = manifest.files.map(file => manifest.basePath + file);
        const geojsonArray = await fetchAllGeoJSON(dataUrls);
        const allFeatures = geojsonArray.reduce((acc, fc) => acc.concat(fc ? fc.features : []), []);
        
        if (allFeatures.length > 0) {
            const mainData = { type: "FeatureCollection", features: allFeatures };
            
            this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                mainData,
                (f) => this.getFeatureStyle(f),
                (f, l) => this.onEachFeature(f, l)
            );

            this.leafletLayers.vulnerability.eachLayer(layer => {
                const { NOM_ACUIF, CLAVE_ACUI } = layer.feature.properties;
                if (NOM_ACUIF) {
                    if (!this.data.aquifers[NOM_ACUIF]) this.data.aquifers[NOM_ACUIF] = [];
                    this.data.aquifers[NOM_ACUIF].push(layer);
                }
                if (CLAVE_ACUI) this.data.keyToNameMap[CLAVE_ACUI] = NOM_ACUIF;
            });

            // Enviar datos al buscador
            this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
            this.uiManager.setSearchData(Object.keys(this.data.aquifers), this.data.keyToNameMap);
        }
    }

    onEachFeature(feature, layer) {
        const { NOM_ACUIF } = feature.properties;
        layer.on({
            mouseover: (e) => {
                if (NOM_ACUIF !== this.state.selectedAquifer) {
                    e.target.setStyle({ ...this.getFeatureStyle(feature), ...CONFIG.styles.hover });
                }
            },
            mouseout: (e) => {
                e.target.setStyle(this.getFeatureStyle(feature));
            },
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

    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        const fillColor = this.mapManager.getColor(VULNERABIL);
        let style = { ...CONFIG.styles.base, fillColor, fillOpacity: this.state.opacity };

        if (this.state.filterValue !== 'all' && String(VULNERABIL) !== String(this.state.filterValue)) {
            style = { ...style, ...CONFIG.styles.muted };
        }
        if (this.state.selectedAquifer === NOM_ACUIF) {
            style = { ...style, ...CONFIG.styles.selection };
        }
        return style;
    }

    render() {
        const map = this.mapManager.map;
        
        // 1. Estilos
        if (this.leafletLayers.vulnerability) {
            this.leafletLayers.vulnerability.eachLayer(l => l.setStyle(this.getFeatureStyle(l.feature)));
        }
        
        // 2. Selección al frente
        if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
            this.data.aquifers[this.state.selectedAquifer].forEach(l => { if(map.hasLayer(l)) l.bringToFront(); });
        }

        // 3. Capas auxiliares
        const toggleLayer = (layer, visible) => {
            if (!layer) return;
            if (visible && !map.hasLayer(layer)) layer.addTo(map);
            else if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
        };

        toggleLayer(this.leafletLayers.coastline, this.state.isCoastlineVisible);
        toggleLayer(this.leafletLayers.coastline1km, this.state.isCoastline1kmVisible);
        toggleLayer(this.leafletLayers.graticule, this.state.isGraticuleVisible);
    }
}

document.addEventListener('DOMContentLoaded', () => { new GeovisorApp(); });
