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
        // Estado centralizado de la aplicación
        this.state = {
            opacity: 0.8,
            filterValue: 'all',
            selectedAquifer: null,
            isCoastlineVisible: false,
            isCoastline1kmVisible: false,
        };

        this.data = {
            aquifers: {}, // Almacenará las capas por nombre de acuífero
        };

        this.leafletLayers = {}; // Almacenará las capas de Leaflet

        // Inicializar la aplicación
        this.init();
    }

    /**
     * Orquesta la inicialización de la aplicación en el orden correcto
     * para evitar errores de tiempo.
     */
    async init() {
        // 1. Crear el mapa y los panes PRIMERO
        this.mapManager = new MapManager(CONFIG.mapId);

        // 2. Crear la UI y pasarle el mapa
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));

        // 3. AHORA que la UI está en su lugar, añadir los controles restantes del mapa (leyenda, logo, etc.)
        this.mapManager.initializeControls();

        // 4. Cargar los datos GeoJSON
        await this.loadLayers();

        // 5. Actualizar la vista de la UI con el estado inicial
        this.uiManager.updateView(this.state);
    }

    /**
     * Maneja los cambios de estado provenientes de la UI.
     * @param {object} newState - El objeto con las propiedades del estado que cambiaron.
     */
    handleStateChange(newState) {
        this.updateState(newState);
    }

    /**
     * Método centralizado para actualizar el estado y volver a renderizar.
     * @param {object} newState - El nuevo estado a fusionar con el actual.
     */
    updateState(newState) {
        this.state = { ...this.state, ...newState };
        console.log("Nuevo estado:", this.state); // Para depuración

        if (newState.selectedAquifer) {
             const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
             this.mapManager.fitBounds(group.getBounds());
        }

        this.render();
    }

    /**
     * Carga todas las capas GeoJSON de forma asíncrona.
     */
    async loadLayers() {
        document.getElementById('loader').style.display = 'flex';
        try {
            // Cargar capa de línea de costa (10km)
            const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
            if (coastlineData) {
                const coastlineLayer = L.geoJson(coastlineData, {
                    style: CONFIG.styles.coastline,
                    pane: 'costasPane'
                });
                coastlineLayer.addTo(this.mapManager.map);
                this.mapManager.map.removeLayer(coastlineLayer);
                this.leafletLayers.coastline = coastlineLayer;
            }
            
            // Cargar capa de línea de costa (1km)
            const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
            if (coastline1kmData) {
                const coastline1kmLayer = L.geoJson(coastline1kmData, {
                    style: CONFIG.styles.coastline1km,
                    pane: 'costasPane'
                });
                coastline1kmLayer.addTo(this.mapManager.map);
                this.mapManager.map.removeLayer(coastline1kmLayer);
                this.leafletLayers.coastline1km = coastline1kmLayer;
            }

            // Cargar capa principal de vulnerabilidad
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
                alert("No se pudo cargar la capa principal de datos. La aplicación puede no funcionar correctamente.");
            }
        } catch (error) {
            console.error("Error durante la carga de capas:", error);
        } finally {
            document.getElementById('loader').style.display = 'none';
        }
    }
    
    /**
     * Función que se ejecuta para cada feature de la capa de vulnerabilidad.
     * @param {object} feature - El feature GeoJSON.
     * @param {L.Layer} layer - La capa de Leaflet correspondiente.
     */
    onEachFeature(feature, layer) {
        const { NOM_ACUIF, CLAVE_ACUI, VULNERABIL } = feature.properties;
        layer.bindPopup(`<strong>Acuífero:</strong> ${NOM_ACUIF}<br><strong>Clave:</strong> ${CLAVE_ACUI}<br><strong>Vulnerabilidad:</strong> ${VULNERABIL}`);

        if (!this.data.aquifers[NOM_ACUIF]) {
            this.data.aquifers[NOM_ACUIF] = [];
        }
        this.data.aquifers[NOM_ACUIF].push(layer);

        layer.on({
            mouseover: (e) => {
                const targetLayer = e.target;
                targetLayer.setStyle(CONFIG.styles.hover);
                targetLayer.bringToFront();
            },
            mouseout: (e) => {
                this.leafletLayers.vulnerability.resetStyle(e.target);
            }
        });
    }

    /**
     * Determina el estilo de un feature basado en el estado actual de la aplicación.
     * @param {object} feature - El feature GeoJSON.
     * @returns {object} - El objeto de estilo de Leaflet.
     */
    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;

        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            return CONFIG.styles.muted;
        }

        let style = {
            ...CONFIG.styles.base,
            fillColor: this.mapManager.getColor(VULNERABIL),
            fillOpacity: this.state.opacity
        };
        
        if (this.state.selectedAquifer === NOM_ACUIF) {
            style = { ...style, ...CONFIG.styles.selection };
        }

        return style;
    }

    /**
     * Vuelve a dibujar las capas y actualiza la UI basado en el estado actual.
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
     * @param {L.Layer} layer - La capa a mostrar/ocultar.
     * @param {boolean} isVisible - True para mostrar, false para ocultar.
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

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
