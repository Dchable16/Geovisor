/**
 * @file main.js
 * @description Archivo principal que inicializa el geovisor.
 */
'use strict';

import { CONFIG } from './config.js';
// CAMBIO: Importamos ambas funciones de dataLoader
import { fetchGeoJSON, fetchAllGeoJSON } from './dataLoader.js';
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
            keyToNameMap: {}
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

        // Lógica de zoom al seleccionar/deseleccionar acuífero
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
        
        // 3. Zoom inicial al extent completo tras la carga
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    // --- SECCIÓN ACTUALIZADA ---
    async loadLayers() {
        // Cargar capas auxiliares (Líneas de costa)
        const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
        if (coastlineData) {
            this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
        }
        
        const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
        if (coastline1kmData) {
            this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });
        }

        // --- INICIO DE LA LÓGICA DE CARGA MÚLTIPLE ---
        
        // 1. Cargar el archivo manifiesto
        console.log("Cargando manifiesto desde:", CONFIG.dataManifestUrl);
        const manifest = await fetchGeoJSON(CONFIG.dataManifestUrl);
        
        if (!manifest || !manifest.files || !manifest.basePath) {
            this.uiManager.setLoading(false);
            alert("Error: No se pudo cargar el manifiesto de datos (manifest.json). La capa principal no se mostrará.");
            return;
        }

        // 2. Construir las URLs completas a partir del manifiesto
        const dataUrls = manifest.files.map(file => manifest.basePath + file);
        console.log(`Cargando ${dataUrls.length} archivos de datos...`);

        // 3. Cargar todos los archivos GeoJSON en paralelo
        const geojsonArray = await fetchAllGeoJSON(dataUrls);

        if (geojsonArray.length === 0) {
            this.uiManager.setLoading(false);
            alert("No se pudieron cargar los datos de vulnerabilidad. La aplicación puede no funcionar correctamente.");
            return;
        }

        // 4. Unir todos los "features" de todos los archivos en un solo array
        const allFeatures = geojsonArray.reduce((acc, featureCollection) => {
            if (featureCollection && featureCollection.features) {
                return acc.concat(featureCollection.features);
            }
            return acc;
        }, []);
        
        // 5. Creamos una única FeatureCollection para Leaflet
        const mainData = {
            type: "FeatureCollection",
            features: allFeatures
        };
        
        console.log(`Carga completa. Total de ${allFeatures.length} features procesados.`);
        
        // --- FIN DE LA LÓGICA DE CARGA MÚLTIPLE ---

        // Esta lógica es la original, ahora se aplica a 'mainData'
        if (mainData.features.length > 0) {
            // 1. Crear la capa Leaflet con estilos y eventos
            this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                mainData,
                (feature) => this.getFeatureStyle(feature),
                (feature, layer) => this.onEachFeature(feature, layer)
            );

            // 2. PROCESAMIENTO DE DATOS: Agrupar referencias para el dropdown
            this.leafletLayers.vulnerability.eachLayer(layer => {
                const { NOM_ACUIF } = layer.feature.properties;
                if (!this.data.aquifers[NOM_ACUIF]) {
                    this.data.aquifers[NOM_ACUIF] = [];
                }
                this.data.aquifers[NOM_ACUIF].push(layer);
            });
            
            if (CLAVE_ACUI && !this.data.keyToNameMap[CLAVE_ACUI]) {
                    this.data.keyToNameMap[CLAVE_ACUI] = NOM_ACUIF;
                }
            });

            if (Object.keys(this.data.aquifers).length > 0) {
                 this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
            }
        
            this.uiManager.setSearchData(
                    Object.keys(this.data.aquifers), // Solo la lista de nombres
                    this.data.keyToNameMap           // El mapa de Clave->Nombre
                );
    
            } else {
                alert("No se cargaron features de vulnerabilidad...");
            }
        }
        
        } else {
            alert("No se cargaron features de vulnerabilidad. La aplicación puede no funcionar correctamente.");
        }
    }
    // --- FIN DE LA SECCIÓN ACTUALIZADA ---
    
    onEachFeature(feature, layer) {
        const { NOM_ACUIF, CLAVE_ACUI, VULNERABIL } = feature.properties;
        layer.on({
            mouseover: (e) => {
                const targetLayer = e.target;
                targetLayer.setStyle(CONFIG.styles.hover);
                targetLayer.bringToFront();
            },
            mouseout: (e) => {
                // Recalcular el estilo basado en el estado actual
                e.target.setStyle(this.getFeatureStyle(e.target.feature));
            },
                
            click: () => {
                // Mostrar panel de información al hacer clic
                this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
            }
        });
    }

    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        
        // 1. Determinar el color base y la opacidad global
        let style = {
            ...CONFIG.styles.base,
            fillColor: this.mapManager.getColor(VULNERABIL),
            fillOpacity: this.state.opacity // Opacidad global aplicada
        };
    
        // 2. Aplicar Filtro de Vulnerabilidad (Muting)
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            style = { ...style, ...CONFIG.styles.muted };
        }
    
        // 3. Aplicar Estilo de Selección (Override)
        if (this.state.selectedAquifer === NOM_ACUIF) {
            style = { 
                ...style, 
                ...CONFIG.styles.selection,
                fillOpacity: 1.0 // Asegura visibilidad de la selección
            }; 
        }
    
        return style;
    }

    render() {
        const map = this.mapManager.map;
        
        // Actualizar estilos de la capa de vulnerabilidad
        if (this.leafletLayers.vulnerability) {
            this.leafletLayers.vulnerability.eachLayer(layer => {
                layer.setStyle(this.getFeatureStyle(layer.feature));
            });
        }
        
        // Alternar visibilidad de capas adicionales
        [
            { layer: this.leafletLayers.coastline, isVisible: this.state.isCoastlineVisible },
            { layer: this.leafletLayers.coastline1km, isVisible: this.state.isCoastline1kmVisible }
        ].forEach(({ layer, isVisible }) => {
            if (!layer) return;
            
            const isCurrentlyVisible = map.hasLayer(layer);
            
            if (isVisible && !isCurrentlyVisible) {
                layer.addTo(map);
            } else if (!isVisible && isCurrentlyVisible) {
                map.removeLayer(layer); 
            }
        });
    
        // Actualizar la vista de la UI (slider, etc.)
        this.uiManager.updateView(this.state);
    }
}
// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
