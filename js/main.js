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

        // Inicializar los módulos
        this.mapManager = new MapManager(CONFIG.mapId);
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));
        
        this.init();
    }

    // Método para manejar los cambios de estado provenientes de la UI
    handleStateChange(newState) {
        this.updateState(newState);
    }

    // Método centralizado para actualizar el estado y volver a renderizar
    updateState(newState) {
        this.state = { ...this.state, ...newState };
        console.log("Nuevo estado:", this.state);

        // CORRECCIÓN DE LÓGICA: Manejar el zoom al seleccionar o deseleccionar un acuífero
        if (newState.selectedAquifer !== undefined) {
             if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 // Acuífero seleccionado: hacer zoom a sus límites
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             } else if (this.leafletLayers.vulnerability) {
                 // Acuífero deseleccionado (valor null o ""): zoom a la extensión completa
                 this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
             }
        }

        this.render();
    }

    async init() {
        this.uiManager.setLoading(true); // 1. Mostrar loader al iniciar
        await this.loadLayers();
        this.uiManager.setLoading(false); // 2. Ocultar loader tras la carga
        this.uiManager.updateView(this.state);
        
        // 3. Zoom inicial al extent completo tras la carga (Mejora UX)
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    async loadLayers() {
        // Cargar capas auxiliares
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
                (feature, layer) => this.onEachFeature(feature, layer)
            );
            this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
        } else {
            alert("No se pudo cargar la capa principal de datos. La aplicación puede no funcionar correctamente.");
        }
    }
    
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
                // Simplemente le pedimos a la capa principal que se vuelva a renderizar
                this.leafletLayers.vulnerability.resetStyle(e.target);
            }
        });
    }

    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;

        // Si hay un filtro y no coincide, aplicar estilo "muted"
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            return CONFIG.styles.muted;
        }

        // Estilo base según vulnerabilidad
        let style = {
            ...CONFIG.styles.base,
            fillColor: this.mapManager.getColor(VULNERABIL),
            fillOpacity: this.state.opacity
        };
        
        // Si el acuífero está seleccionado, aplicar estilo de selección
        if (this.state.selectedAquifer === NOM_ACUIF) {
            style = { ...style, ...CONFIG.styles.selection };
        }

        return style;
    }

    render() {
        // Actualizar estilos de la capa de vulnerabilidad
        if (this.leafletLayers.vulnerability) {
            this.leafletLayers.vulnerability.eachLayer(layer => {
                layer.setStyle(this.getFeatureStyle(layer.feature));
            });
        }
        
        // Alternar visibilidad de capas adicionales
        this.toggleLayer(this.leafletLayers.coastline, this.state.isCoastlineVisible);
        this.toggleLayer(this.leafletLayers.coastline1km, this.state.isCoastline1kmVisible);
        
        // Actualizar la vista de la UI
        this.uiManager.updateView(this.state);
    }
    
    toggleLayer(layer, isVisible) {
        if (!layer) return;
        
        if (isVisible && !this.mapManager.map.hasLayer(layer)) {
            layer.addTo(this.mapManager.map);
        } else if (!isVisible && this.mapManager.map.hasLayer(layer)) {
            // CORRECCIÓN: Usar removeLayer() en lugar de remove()
            this.mapManager.map.removeLayer(layer); 
        }
    }
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
