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
    opacity: 0.8, // Opacidad inicial
    filterValue: 'all', // Sin filtro inicial
    selectedAquifer: null, // Ningún acuífero seleccionado
    isCoastlineVisible: false, // Capas auxiliares ocultas
    isCoastline1kmVisible: false,
};
// --- FIN ---


class GeovisorApp {
    constructor() {
        // Usamos el estado inicial
        this.state = { ...INITIAL_STATE };

        this.data = {
            aquifers: {}, // Almacenará { NOM_ACUIF: [layer1, layer2, ...] }
            keyToNameMap: {} // Almacenará { CLAVE_ACUI: NOM_ACUIF }
        };

        this.leafletLayers = {}; // Almacenará { vulnerability: L.GeoJSON, coastline: L.GeoJSON, ... }

        // Inicializar los módulos
        this.mapManager = new MapManager(CONFIG.mapId);
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));

        this.init(); // Iniciar la carga de datos
    }

    /**
     * Callback que recibe las actualizaciones de estado desde UIManager.
     * @param {object} newState - Objeto parcial con las propiedades de estado que cambiaron.
     */
    handleStateChange(newState) {
        this.updateState(newState);
    }

    /**
     * Método central para actualizar el estado, manejar acciones especiales y disparar el renderizado.
     * @param {object} newState - Objeto parcial con cambios o acciones.
     */
    updateState(newState) {

        // 1. Acción: Restablecer
        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE }; // Volver al estado inicial
            this.mapManager.resetView();     // Restablecer vista del mapa y limpiar marcador
            this.render();                   // Renderizar con el estado limpio
            return;                          // Salir
        }

        // 2. Acción: Volar a Coordenadas
        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords; // Extraer datos
            this.mapManager.flyToCoords(lat, lon, name); // Ejecutar acción en mapManager
            // Esta acción no modifica el 'state' principal, solo interactúa con el mapa.
        }

        // 3. Actualización Normal del Estado
        //    (Ignora las claves 'reset' y 'flyToCoords' si vinieran aquí)
        const { reset, flyToCoords, ...stateUpdates } = newState;
        this.state = { ...this.state, ...stateUpdates }; // Fusionar cambios
        console.log("Nuevo estado:", this.state);

        // 4. Lógica de Zoom específica para selección de acuífero (CORREGIDA)
        if (stateUpdates.selectedAquifer !== undefined) {
             if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 // Si se seleccionó un acuífero válido, hacer zoom
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             } else if (
                 this.leafletLayers.vulnerability &&
                 // Comprobar si es null O una cadena vacía
                 (stateUpdates.selectedAquifer === null || stateUpdates.selectedAquifer === "")
                ) {
                 // Si se deseleccionó (reset o "-- Mostrar todos --"), volver a la vista completa
                 this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
             }
        }

        // 5. Disparar el renderizado para reflejar los cambios
        this.render();
    }

    /**
     * Inicializa la aplicación: muestra el loader, carga los datos y luego oculta el loader.
     */
    async init() {
        this.uiManager.setLoading(true);
        try {
            await this.loadLayers();
        } catch (error) {
            console.error("Error crítico durante la inicialización:", error);
            alert("Ocurrió un error al cargar los datos iniciales. La aplicación puede no funcionar correctamente.");
        } finally {
            this.uiManager.setLoading(false);
            this.uiManager.updateView(this.state); // Actualizar UI inicial
            // Zoom inicial a la extensión completa
            if (this.leafletLayers.vulnerability) {
                this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
            }
        }
    }

    /**
     * Carga todas las capas GeoJSON (manifiesto, líneas de costa) y las procesa.
     */
    async loadLayers() {
        // Cargar capas auxiliares
        const [coastlineData, coastline1kmData] = await Promise.all([
            fetchGeoJSON(CONFIG.coastlineUrl),
            fetchGeoJSON(CONFIG.coastline1kmUrl)
        ]);

        if (coastlineData) {
            this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
        }
        if (coastline1kmData) {
            this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });
        }

        // Cargar capa principal desde el manifiesto
        console.log("Cargando manifiesto desde:", CONFIG.dataManifestUrl);
        const manifest = await fetchGeoJSON(CONFIG.dataManifestUrl);

        if (!manifest || !manifest.files || !manifest.basePath) {
            throw new Error("El archivo manifiesto (manifest.json) es inválido o no se encontró.");
        }

        const dataUrls = manifest.files.map(file => manifest.basePath + file);
        console.log(`Cargando ${dataUrls.length} archivos de datos...`);
        const geojsonArray = await fetchAllGeoJSON(dataUrls);

        if (geojsonArray.length === 0) {
             console.warn("No se cargaron datos de vulnerabilidad.");
        }

        const allFeatures = geojsonArray.reduce((acc, fc) => acc.concat(fc?.features || []), []);
        const mainData = { type: "FeatureCollection", features: allFeatures };
        console.log(`Carga completa. Total de ${allFeatures.length} features procesados.`);

        if (mainData.features.length > 0) {
            // Crear capa Leaflet principal
            this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                mainData,
                (feature) => this.getFeatureStyle(feature),
                (feature, layer) => this.onEachFeature(feature, layer)
            );

            // Procesar datos para búsqueda y selección
            this.leafletLayers.vulnerability.eachLayer(layer => {
                const { NOM_ACUIF, CLAVE_ACUI } = layer.feature.properties;
                if (NOM_ACUIF) {
                    if (!this.data.aquifers[NOM_ACUIF]) {
                        this.data.aquifers[NOM_ACUIF] = [];
                    }
                    this.data.aquifers[NOM_ACUIF].push(layer);
                }
                if (CLAVE_ACUI && !this.data.keyToNameMap[CLAVE_ACUI]) {
                    this.data.keyToNameMap[CLAVE_ACUI] = NOM_ACUIF;
                }
            });

            // Poblar UI
            const aquiferNames = Object.keys(this.data.aquifers);
            if (aquiferNames.length > 0) {
                 this.uiManager.populateAquiferSelect(aquiferNames);
                 this.uiManager.setSearchData(aquiferNames, this.data.keyToNameMap);
            }
        } else {
             console.warn("La capa principal de vulnerabilidad no contiene features.");
        }
    }

    /**
     * Define los listeners de eventos para cada feature (polígono) de la capa principal.
     * @param {object} feature - El feature GeoJSON.
     * @param {L.Layer} layer - La capa Leaflet correspondiente.
     */
    // --- MÉTODO onEachFeature CORREGIDO (Hover/Selección) ---
    onEachFeature(feature, layer) {
        const { NOM_ACUIF } = feature.properties; // Solo necesitamos NOM_ACUIF aquí
        layer.on({
            mouseover: (e) => {
                const targetLayer = e.target;
                // Solo aplica estilo hover si NO es la capa seleccionada
                if (NOM_ACUIF !== this.state.selectedAquifer) {
                    const currentStyle = this.getFeatureStyle(feature);
                    // Aplica solo las propiedades definidas en hover, manteniendo el resto
                    const hoverStyle = { ...currentStyle, ...CONFIG.styles.hover };
                    targetLayer.setStyle(hoverStyle);
                    // No llamamos a bringToFront aquí
                }
            },
            mouseout: (e) => {
                // Restaura el estilo correcto (base, muted o selection)
                // Esta función se encarga de aplicar el estilo correcto según el estado
                e.target.setStyle(this.getFeatureStyle(feature));
            },
            click: (e) => {
                // Prevenir que el click se propague al mapa si ya está seleccionado
                if (NOM_ACUIF === this.state.selectedAquifer) {
                     L.DomEvent.stop(e); // Detiene el evento si ya está seleccionado
                } else {
                     // Si no está seleccionado, actualiza el estado
                    this.updateState({ selectedAquifer: NOM_ACUIF });
                }
                 // Siempre muestra el panel de info al hacer click
                this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
            }
        });
    }
    // --- FIN DE CORRECCIÓN ---

    /**
     * Calcula el estilo de un feature basado en el estado actual de la aplicación.
     * @param {object} feature - El feature GeoJSON.
     * @returns {object} - Objeto de estilo compatible con Leaflet Path options.
     */
    // --- MÉTODO getFeatureStyle CORREGIDO (Opacidad) ---
    getFeatureStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        const fillColor = this.mapManager.getColor(VULNERABIL);

        // 1. Empezar con las propiedades del estilo base
        let styleOptions = {
            ...CONFIG.styles.base,
            fillColor: fillColor
        };

        // 2. APLICAR LA OPACIDAD GLOBAL DEL SLIDER *SOLO* AL ESTADO BASE
        styleOptions.fillOpacity = this.state.opacity;

        // 3. Sobrescribir si está atenuado por el filtro
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            styleOptions = { ...styleOptions, ...CONFIG.styles.muted };
        }

        // 4. Sobrescribir si está seleccionado
        if (this.state.selectedAquifer === NOM_ACUIF) {
            styleOptions = { ...styleOptions, ...CONFIG.styles.selection };
        }

        return styleOptions;
    }
    // --- FIN DE CORRECCIÓN ---

    /**
     * Aplica los estilos a todas las capas, gestiona visibilidad y actualiza la UI.
     */
    render() {
        const map = this.mapManager.map;

        // 1. Aplicar estilos a capa principal
        if (this.leafletLayers.vulnerability) {
            this.leafletLayers.vulnerability.eachLayer(layer => {
                layer.setStyle(this.getFeatureStyle(layer.feature));
            });
        }

        // 2. Traer al frente la(s) capa(s) seleccionada(s)
        if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
            this.data.aquifers[this.state.selectedAquifer].forEach(layer => {
                if (map.hasLayer(layer)) {
                    layer.bringToFront();
                }
            });
        }

        // 3. Gestionar visibilidad de capas auxiliares
        [
            { layer: this.leafletLayers.coastline, isVisible: this.state.isCoastlineVisible },
            { layer: this.leafletLayers.coastline1km, isVisible: this.state.isCoastline1kmVisible }
        ].forEach(({ layer, isVisible }) => {
            if (!layer) return;
            const isCurrentlyVisible = map.hasLayer(layer);
            if (isVisible && !isCurrentlyVisible) layer.addTo(map);
            else if (!isVisible && isCurrentlyVisible) map.removeLayer(layer);
        });

        // 4. Actualizar la UI
        this.uiManager.updateView(this.state);
    }

} // Fin de la clase GeovisorApp

// Iniciar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    new GeovisorApp();
});
