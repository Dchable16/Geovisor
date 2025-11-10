/**
 * @file main.js
 * @description Archivo principal que inicializa el geovisor.
 */
'use strict';

import { CONFIG } from './config.js';
// Importamos ambas funciones de dataLoader
import { fetchGeoJSON, fetchAllGeoJSON } from './dataLoader.js';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';

// --- ESTADO INICIAL ---
const INITIAL_STATE = {
    opacity: 0.5,
    filterValue: 'all',
    selectedAquifer: null,
    isCoastlineVisible: false,
    isCoastline1kmVisible: false,
    isGraticuleVisible: false,
};
// --- FIN ---


class GeovisorApp {
    constructor() {
        // Usamos el estado inicial
        this.state = { ...INITIAL_STATE };

        this.data = {
            aquifers: {}, // Almacenará las capas por nombre de acuífero
            keyToNameMap: {} // Mapa para buscar por Clave
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

        // 1. Comprobar si es una acción de reinicio
        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE };
            this.mapManager.resetView(); // Llama al método en mapManager
            this.render(); // Vuelve a dibujar todo con el estado limpio
            return; // Salir de la función
        }

        // 2. Comprobar si es una acción de "Volar a"
        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords;
            this.mapManager.flyToCoords(lat, lon, name);
        }

        // 3. Si no es reinicio, continuar con la lógica normal de estado
        this.state = { ...this.state, ...newState };
        console.log("Nuevo estado:", this.state);

        // Lógica de zoom al seleccionar/deseleccionar acuífero
        if (newState.selectedAquifer !== undefined) {
             if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 // Acuífero seleccionado: hacer zoom a sus límites
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             } else if (this.leafletLayers.vulnerability && newState.selectedAquifer === null) { 
                 // Solo hacer zoom out si se deselecciona activamente
                 this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
             }
        }

        this.render();
    }

    async init() {
        this.uiManager.setLoading(true); // 1. Mostrar loader al iniciar
        await this.loadLayers();
        this.leafletLayers.graticule = L.simpleGraticule({ showLabel: true, style: { color: '#333', weight: 0.8, opacity: 0.6 },
        this.uiManager.setLoading(false); // 2. Ocultar loader tras la carga
        this.uiManager.updateView(this.state);
        
        // 3. Zoom inicial al extent completo tras la carga
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

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
        // Esta lógica es la original, ahora se aplica a 'mainData'
        if (mainData.features.length > 0) {
            // 1. Crear la capa Leaflet con estilos y eventos
            this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                mainData,
                (feature) => this.getFeatureStyle(feature),
                (feature, layer) => this.onEachFeature(feature, layer)
            );

            // 2. PROCESAMIENTO DE DATOS: Agrupar referencias
            this.leafletLayers.vulnerability.eachLayer(layer => {
                const { NOM_ACUIF, CLAVE_ACUI } = layer.feature.properties;
                
                // Lógica para el dropdown
                if (NOM_ACUIF && !this.data.aquifers[NOM_ACUIF]) {
                    this.data.aquifers[NOM_ACUIF] = [];
                }
                if (NOM_ACUIF) {
                    this.data.aquifers[NOM_ACUIF].push(layer);
                }

                // Lógica para el mapa de búsqueda (Clave -> Nombre)
                if (CLAVE_ACUI && !this.data.keyToNameMap[CLAVE_ACUI]) {
                    this.data.keyToNameMap[CLAVE_ACUI] = NOM_ACUIF;
                }
            });

            // 3. Poblar el dropdown
            if (Object.keys(this.data.aquifers).length > 0) {
                 this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
            }
        
            // 4. Enviar datos al buscador
            this.uiManager.setSearchData(
                Object.keys(this.data.aquifers), // Solo la lista de nombres
                this.data.keyToNameMap           // El mapa de Clave->Nombre
            );
    
        } else {
            alert("No se cargaron features de vulnerabilidad. La aplicación puede no funcionar correctamente.");
        }
    }
    
    onEachFeature(feature, layer) {
        const { NOM_ACUIF } = feature.properties;

        layer.on({
            mouseover: (e) => {
                const targetLayer = e.target;
                // Solo aplica estilo hover si NO es la capa seleccionada
                if (NOM_ACUIF !== this.state.selectedAquifer) {
                    const currentStyle = this.getFeatureStyle(feature);
                    // Aplica solo las propiedades definidas en hover, manteniendo el resto
                    const hoverStyle = { ...currentStyle, ...CONFIG.styles.hover };
                    targetLayer.setStyle(hoverStyle);
                }
            },

            mouseout: (e) => {
                // Restaura el estilo correcto (base, muted o selection)
                // Esta función se encarga de aplicar el estilo correcto según el estado
                e.target.setStyle(this.getFeatureStyle(feature));
            },

            click: (e) => { // <-- Necesitamos el evento 'e'
                const targetLayer = e.target; // La capa específica clickeada
                let isHighlightActive = true;
                targetLayer.setStyle(CONFIG.styles.clickHighlight); // Aplica estilo de clic temporal
                targetLayer.bringToFront(); // Trae al frente el polígono clickeado
                setTimeout(() => {
                    isHighlightActive = false; // El resaltado termina
                    // Comprobación: Solo revertir si la capa aún existe
                    if (this.mapManager.map.hasLayer(targetLayer)) {
                        targetLayer.setStyle(this.getFeatureStyle(feature));
                        if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                            this.data.aquifers[this.state.selectedAquifer].forEach(l => {
                                if (this.mapManager.map.hasLayer(l)) l.bringToFront();
                            });
                        }
                    }
                }, 1500); // 1.5 segundos de resaltado (ajusta si lo necesitas)
                this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
                L.DomEvent.stop(e);
            }
        });
    }

    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        const fillColor = this.mapManager.getColor(VULNERABIL);

        // 1. Empezar con las propiedades del estilo base
        let styleOptions = {
            ...CONFIG.styles.base,
            fillColor: fillColor
        };

        // 2. APLICAR LA OPACIDAD GLOBAL DEL SLIDER *SOLO* AL ESTADO BASE
        //    Las opacidades de 'muted' y 'selection' se mantendrán fijas.
        styleOptions.fillOpacity = this.state.opacity;

        // 3. Aplicar Filtro de Vulnerabilidad (si aplica)
        //    Esto sobrescribirá la opacidad con el valor fijo de 'muted' (ej. 0.1)
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            styleOptions = { ...styleOptions, ...CONFIG.styles.muted };
        }

        // 4. Aplicar Estilo de Selección (si aplica)
        //    Esto sobrescribirá la opacidad con el valor fijo de 'selection' (ej. 0.85)
        if (this.state.selectedAquifer === NOM_ACUIF) {
            styleOptions = { ...styleOptions, ...CONFIG.styles.selection };
        }

        // 5. Devolver el objeto de estilo final
        return styleOptions;
    }

    render() {
        const map = this.mapManager.map;

        // 1. Actualizar estilos de la capa de vulnerabilidad
        if (this.leafletLayers.vulnerability) {
            this.leafletLayers.vulnerability.eachLayer(layer => {
                layer.setStyle(this.getFeatureStyle(layer.feature));
            });
        }

        // 2. Después de aplicar estilos, traer al frente las capas seleccionadas
        if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
            this.data.aquifers[this.state.selectedAquifer].forEach(layer => {
                if (map.hasLayer(layer)) {
                    layer.bringToFront();
                }
            });
        }

        // 3. Alternar visibilidad de capas adicionales
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

        // 4. Actualizar la vista de la UI (SOLO UNA VEZ, AL FINAL)
        this.uiManager.updateView(this.state);

    } // <-- Cierre del método render

} // <-- Cierre de la CLASE GeovisorApp

// Iniciar la aplicación cuando el DOM esté listo (FUERA de la clase)
document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
