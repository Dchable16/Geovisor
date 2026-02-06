/**
 * @file main.js
 * @description Punto de entrada principal de la aplicación.
 * Orquesta la inicialización y comunicación entre componentes.
 */

import { CONFIG } from './config.js';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';
import { StateManager } from './StateManager.js';
import { LayerFactory } from './LayerFactory.js';
import { fetchAllGeoJSON, fetchGeoJSON } from './dataLoader.js';

class GeovisorApp {
    constructor() {
        // 1. Inicializar Estado ("El Cerebro")
        this.stateManager = new StateManager();

        // 2. Inicializar Mapa ("El Lienzo")
        this.mapManager = new MapManager(CONFIG.mapId);

        // 3. Inicializar UI ("El Control")
        // Le pasamos una función para que la UI pueda pedir cambios de estado
        this.uiManager = new UIManager(this.mapManager.map, (newState) => {
            this.stateManager.setState(newState);
        });

        // 4. Suscribirse a cambios de estado
        this.stateManager.subscribe((state) => this.render(state));

        // Variables para guardar datos en memoria
        this.aquiferData = null; // GeoJSON fusionado de acuíferos
        this.wellsData = null;   // GeoJSON de pozos
        this.layers = {
            aquifers: null,
            wells: null
        };

        // 5. Arrancar
        this.init();
    }

    async init() {
        this.uiManager.setLoading(true);
        try {
            console.log("Iniciando carga de datos...");
            
            // Cargar manifiesto y pozos en paralelo
            const [manifest, wells] = await Promise.all([
                fetchGeoJSON(CONFIG.endpoints.manifest),
                fetchGeoJSON(CONFIG.endpoints.wells)
            ]);

            this.wellsData = wells;

            if (manifest && manifest.files) {
                // Cargar geometría de acuíferos
                const aquiferFiles = await fetchAllGeoJSON(manifest.files.map(f => `data/${f}`));
                // Fusionar todos los GeoJSONs en uno solo (FeatureCollection)
                this.aquiferData = {
                    type: "FeatureCollection",
                    features: aquiferFiles.flatMap(f => f.features)
                };
                
                // Preparar datos para el buscador
                this.setupSearch();
            }

            // Renderizado inicial
            this.render(this.stateManager.getState());

        } catch (error) {
            console.error("Error fatal en inicialización:", error);
        } finally {
            this.uiManager.setLoading(false);
        }
    }

    setupSearch() {
        if (!this.aquiferData) return;
        
        const names = [];
        const keyMap = {};
        
        this.aquiferData.features.forEach(f => {
            const props = f.properties;
            // Ajustar claves según tus datos reales
            const name = props.NOM_ACUIF || props.nombre || props.Nombre;
            const key = props.CLAVE_ACUI || props.clave;
            
            if (name) names.push(name);
            if (key && name) keyMap[key] = name;
        });

        this.uiManager.refreshControls(names, keyMap);
    }

    /**
     * Función central de renderizado.
     * Se ejecuta cada vez que cambia el estado.
     */
    render(state) {
        // A. Manejo de Capa de Acuíferos
        if (this.aquiferData) {
            // Si hay un filtro activo, filtramos los datos
            let dataToShow = this.aquiferData;
            if (state.filterValue) {
                dataToShow = {
                    ...this.aquiferData,
                    features: this.aquiferData.features.filter(f => String(f.properties.VULNERABIL) === String(state.filterValue))
                };
            }

            // Recrear capa (Estrategia simple: borrar y crear. Fase 4 optimizará esto)
            if (this.layers.aquifers) {
                this.mapManager.map.removeLayer(this.layers.aquifers);
            }

            this.layers.aquifers = LayerFactory.createAquiferLayer(
                dataToShow,
                (feature) => this.handleFeatureClick(feature),
                state
            ).addTo(this.mapManager.map);
        }

        // B. Manejo de Capa de Pozos
        if (this.wellsData) {
            if (state.areWellsVisible) {
                if (!this.layers.wells) {
                    this.layers.wells = LayerFactory.createWellsLayer(
                        this.wellsData,
                        (feature) => this.handleFeatureClick(feature)
                    ).addTo(this.mapManager.map);
                }
            } else {
                if (this.layers.wells) {
                    this.mapManager.map.removeLayer(this.layers.wells);
                    this.layers.wells = null;
                }
            }
        }

        // C. Actualizar UI
        this.uiManager.updateView(state);

        // D. Acciones especiales (Efectos secundarios)
        if (state.flyToCoords) {
            this.mapManager.flyToCoords(...state.flyToCoords);
            // Consumir el evento para no volar dos veces
            this.stateManager.state.flyToCoords = null; 
        }

        if (state.reset) {
            this.mapManager.resetView();
            this.stateManager.state.reset = false;
        }
    }

    handleFeatureClick(feature) {
        // Mostrar información en el panel
        // Pasamos el mapa de vulnerabilidad para que la UI pueda traducir códigos a texto
        this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
    }
}

// Arrancar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeovisorApp();
});
