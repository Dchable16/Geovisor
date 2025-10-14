/**
 * @file main.js
 * @description Archivo principal que inicializa el geovisor.
 */
'use strict';

import { CONFIG } from './config.js';
import { fetchGeoJSON } from './dataLoader.js';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';

// Función auxiliar para oscurecer un color hexadecimal
function darkenColor(hex, percent) {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length == 3) {
        hex = hex.replace(/(.)/g, '$1$1');
    }
    const a = parseInt(hex, 16);
    const r = (a >> 16) & 255;
    const g = (a >> 8) & 255;
    const b = a & 255;
    const newR = Math.max(0, r - Math.floor(r * (percent / 100)));
    const newG = Math.max(0, g - Math.floor(g * (percent / 100)));
    const newB = Math.max(0, b - Math.floor(b * (percent / 100)));
    return `#${(1 << 24 | newR << 16 | newG << 8 | newB).toString(16).slice(1)}`;
}

class GeovisorApp {
    constructor() {
        this.state = {
            opacity: 0.8,
            filterValue: 'all',
            selectedAquifer: null,
            isCoastlineVisible: false,
            isCoastline1kmVisible: false,
        };
        this.data = { aquifers: {} };
        this.leafletLayers = {};
        this.init();
    }

    async init() {
        this.mapManager = new MapManager(CONFIG.mapId);
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));
        this.mapManager.initializeControls();
        await this.loadLayers();
        this.uiManager.updateView(this.state);
    }

    handleStateChange(newState) {
        this.updateState(newState);
    }

    updateState(newState) {
        this.state = { ...this.state, ...newState };
        if (newState.selectedAquifer && this.data.aquifers[newState.selectedAquifer]) {
            const group = L.featureGroup(this.data.aquifers[newState.selectedAquifer]);
            this.mapManager.fitBounds(group.getBounds());
        }
        this.render();
    }

    async loadLayers() {
        document.getElementById('loader').style.display = 'flex';
        try {
            const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
            if (coastlineData) {
                const coastlineLayer = L.geoJson(coastlineData, { style: CONFIG.styles.coastline, pane: 'costasPane' });
                coastlineLayer.addTo(this.mapManager.map);
                this.mapManager.map.removeLayer(coastlineLayer);
                this.leafletLayers.coastline = coastlineLayer;
            }

            const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
            if (coastline1kmData) {
                const coastline1kmLayer = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km, pane: 'costasPane' });
                coastline1kmLayer.addTo(this.mapManager.map);
                this.mapManager.map.removeLayer(coastline1kmLayer);
                this.leafletLayers.coastline1km = coastline1kmLayer;
            }

            const mainData = await fetchGeoJSON(CONFIG.dataUrl);
            if (mainData) {
                this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                    mainData,
                    (feature) => this.getFeatureStyle(feature),
                    (feature, layer) => this.onEachFeature(feature, layer),
                    'acuiferosPane'
                );
                this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
            } else {
                alert("No se pudo cargar la capa principal de datos.");
            }
        } catch (error) {
            console.error("Error durante la carga de capas:", error);
        } finally {
            document.getElementById('loader').style.display = 'none';
        }
    }

    onEachFeature(feature, layer) {
        const { NOM_ACUIF } = feature.properties;
        if (!this.data.aquifers[NOM_ACUIF]) {
            this.data.aquifers[NOM_ACUIF] = [];
        }
        this.data.aquifers[NOM_ACUIF].push(layer);

        layer.on({
            mouseover: (e) => {
                if (this.state.selectedAquifer !== NOM_ACUIF) {
                    e.target.setStyle(CONFIG.styles.hover);
                }
                e.target.bringToFront();
            },
            mouseout: (e) => {
                this.leafletLayers.vulnerability.resetStyle(e.target);
            },
            click: (e) => {
                this.updateState({ selectedAquifer: NOM_ACUIF });
                this.uiManager.updateInfoPanel(feature.properties);
            }
        });
    }

    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            return CONFIG.styles.muted;
        }
        const fillColor = this.mapManager.getColor(VULNERABIL);
        let style = {
            ...CONFIG.styles.base,
            fillColor: fillColor,
            color: darkenColor(fillColor, 20),
            fillOpacity: this.state.opacity
        };
        if (this.state.selectedAquifer === NOM_ACUIF) {
            style = { ...style, ...CONFIG.styles.selection };
        }
        return style;
    }

    render() {
        if (this.leafletLayers.vulnerability) {
            this.leafletLayers.vulnerability.eachLayer(layer => {
                layer.setStyle(this.getFeatureStyle(layer.feature));
            });
        }
        this.toggleLayer(this.leafletLayers.coastline, this.state.isCoastlineVisible);
        this.toggleLayer(this.leafletLayers.coastline1km, this.state.isCoastline1kmVisible);
        this.uiManager.updateView(this.state);
    }

    toggleLayer(layer, isVisible) {
        if (!layer) return;
        if (isVisible && !this.mapManager.map.hasLayer(layer)) {
            layer.addTo(this.mapManager.map);
        } else if (!isVisible && this.mapManager.map.hasLayer(layer)) {
            this.mapManager.map.removeLayer(layer);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
