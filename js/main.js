/**
 * @file main.js
 * @description Archivo principal que inicializa el geovisor.
 */
'use strict';

import { CONFIG } from './config.js';
import { fetchGeoJSON } from './dataLoader.js';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';

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
        
        // La inicialización ahora se maneja de forma asíncrona
        this.init();
    }

    /**
     * Orquesta la inicialización de la aplicación en el orden correcto.
     */
    async init() {
        // 1. Crear el mapa y los panes PRIMERO
        this.mapManager = new MapManager(CONFIG.mapId);

        // 2. Crear la UI y pasarle la referencia al mapa
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));
        
        // 3. AHORA que la UI existe, añadir los controles restantes del mapa
        this.mapManager.initializeControls();

        // 4. Cargar todos los datos GeoJSON
        await this.loadLayers();

        // 5. Finalmente, actualizar la UI con el estado inicial
        this.uiManager.updateView(this.state);
    }

    /**
     * Maneja los cambios de estado que vienen desde la UI.
     */
    handleStateChange(newState) {
        this.updateState(newState);
    }

    /**
     * Actualiza el estado centralizado y vuelve a dibujar el mapa.
     */
    updateState(newState) {
        this.state = { ...this.state, ...newState };

        // Si se seleccionó un acuífero, hacer zoom a él
        if (newState.selectedAquifer && this.data.aquifers[newState.selectedAquifer]) {
            const group = L.featureGroup(this.data.aquifers[newState.selectedAquifer]);
            this.mapManager.fitBounds(group.getBounds());
        }
        
        this.render();
    }

    /**
     * Carga y procesa todas las capas geográficas.
     */
    async loadLayers() {
        document.getElementById('loader').style.display = 'flex';
        try {
            // Cargar capas auxiliares (líneas de costa)
            const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
            if (coastlineData) {
                this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
            }
            const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
            if (coastline1kmData) {
                this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });
            }

            // Cargar capa principal de vulnerabilidad
            const mainData = await fetchGeoJSON(CONFIG.dataUrl);
            if (mainData) {
                this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                    mainData,
                    (feature) => this.getFeatureStyle(feature),
                    (feature, layer) => this.onEachFeature(feature, layer),
                    'acuiferosPane' // Dibuja esta capa en su panel designado
                );
                this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
            } else {
                alert("No se pudo cargar la capa principal de datos.");
            }
        } catch (error) {
            console.error("Error crítico durante la carga de capas:", error);
        } finally {
            document.getElementById('loader').style.display = 'none';
        }
    }
    
    /**
     * Define las interacciones para cada polígono de acuífero.
     */
    onEachFeature(feature, layer) {
        const { NOM_ACUIF } = feature.properties;
        
        // Agrupa las capas por nombre de acuífero para el zoom
        if (!this.data.aquifers[NOM_ACUIF]) {
            this.data.aquifers[NOM_ACUIF] = [];
        }
        this.data.aquifers[NOM_ACUIF].push(layer);

        layer.on({
            mouseover: (e) => {
                // Solo aplica el efecto hover si no está seleccionado
                if (this.state.selectedAquifer !== NOM_ACUIF) {
                    e.target.setStyle(CONFIG.styles.hover);
                }
                e.target.bringToFront();
            },
            mouseout: (e) => {
                // Restaura el estilo original de la capa
                this.leafletLayers.vulnerability.resetStyle(e.target);
            },
            click: (e) => {
                // Al hacer clic, actualiza el acuífero seleccionado
                this.updateState({ selectedAquifer: NOM_ACUIF });
                // Muestra la información en el panel de la UI (reemplazando el popup)
                this.uiManager.updateInfoPanel(feature.properties);
            }
        });
    }

    /**
     * Define el estilo visual de cada polígono.
     */
    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;

        // Si hay un filtro y no coincide, atenúa el polígono
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            return CONFIG.styles.muted;
        }
        
        let style = {
            ...CONFIG.styles.base,
            fillColor: this.mapManager.getColor(VULNERABIL),
            fillOpacity: this.state.opacity
        };
        
        // Si el acuífero está seleccionado, resáltalo
        if (this.state.selectedAquifer === NOM_ACUIF) {
            style = { ...style, ...CONFIG.styles.selection };
        }
        return style;
    }

    /**
     * Aplica los cambios de estado al mapa.
     */
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
    
    /**
     * Muestra u oculta una capa en el mapa.
     */
    toggleLayer(layer, isVisible) {
        if (!layer) return;
        if (isVisible && !this.mapManager.map.hasLayer(layer)) {
            layer.addTo(this.mapManager.map);
        } else if (!isVisible && this.mapManager.map.hasLayer(layer)) {
            this.mapManager.map.removeLayer(layer);
        }
    }
}

// Iniciar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
