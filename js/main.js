/**
 * @file main.js
 * @description Orquestador principal.
 * VERSIÓN ESTABILIZADA: Implementa "Smart Rendering" para evitar recargas innecesarias de capas.
 */

import { CONFIG } from './config.js';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';
import { StateManager } from './StateManager.js';
import { LayerFactory } from './LayerFactory.js';
import { fetchAllGeoJSON, fetchGeoJSON } from './dataLoader.js';

class GeovisorApp {
    constructor() {
        this.stateManager = new StateManager();
        this.mapManager = new MapManager(CONFIG.mapId);
        
        // UI Manager con callback para cambios de estado
        this.uiManager = new UIManager(this.mapManager.map, (newState) => {
            this.stateManager.setState(newState);
        });

        this.stateManager.subscribe((state) => this.render(state));

        // Datos en memoria
        this.aquiferData = null;
        this.wellsData = null;
        this.coastlineData = null;
        this.coastline1kmData = null;

        // Referencias a capas
        this.layers = {
            aquifers: null,
            wells: null,
            coastline: null,
            coastline1km: null,
            graticule: null
        };

        // Memoria de estado previo para comparación (Diffing)
        this.prevState = {
            filterValue: null,
            activeTheme: null,
            opacity: null,
            areWellsVisible: false,
            selectedAquifer: null
        };

        this.init();
    }

    async init() {
        this.uiManager.setLoading(true);
        try {
            console.log("Cargando datos...");
            
            const [manifest, wells, coastline, coastline1km] = await Promise.all([
                fetchGeoJSON(CONFIG.endpoints.manifest),
                fetchGeoJSON(CONFIG.endpoints.wells),
                fetchGeoJSON(CONFIG.endpoints.coastline),
                fetchGeoJSON(CONFIG.endpoints.coastline1km)
            ]);

            this.wellsData = wells;
            this.coastlineData = coastline;
            this.coastline1kmData = coastline1km;

            if (manifest && manifest.files) {
                const aquiferFiles = await fetchAllGeoJSON(manifest.files.map(f => `data/${f}`));
                this.aquiferData = {
                    type: "FeatureCollection",
                    features: aquiferFiles.flatMap(f => f.features)
                };
                this.setupSearch();
            }

            // Primer renderizado forzado
            this.render(this.stateManager.getState(), true);

        } catch (error) {
            console.error("Error inicialización:", error);
        } finally {
            this.uiManager.setLoading(false);
        }
    }

    setupSearch() {
        if (!this.aquiferData) return;
        const names = [];
        const keyMap = {};
        
        this.aquiferData.features.forEach(f => {
            const p = f.properties;
            const name = p.NOM_ACUIF || p.nombre || p.Nombre;
            const key = p.CLAVE_ACUI || p.clave;
            if (name && !names.includes(name)) names.push(name);
            if (key && name) keyMap[key] = name;
        });

        this.uiManager.refreshControls(names, keyMap);
    }

    /**
     * Motor de Renderizado Inteligente.
     * Compara el estado anterior con el nuevo para hacer solo lo mínimo necesario.
     */
    render(state, force = false) {
        if (!this.aquiferData) return;

        // 1. GESTIÓN DE CAPA DE ACUÍFEROS (La más pesada)
        const filterChanged = state.filterValue !== this.prevState.filterValue;
        const themeChanged = state.activeTheme !== this.prevState.activeTheme;
        const opacityChanged = state.opacity !== this.prevState.opacity;

        // A) Solo si cambia el filtro o el tema, reconstruimos la capa geométrica
        if (force || filterChanged || themeChanged || !this.layers.aquifers) {
            
            if (this.layers.aquifers) {
                this.mapManager.map.removeLayer(this.layers.aquifers);
            }

            // Filtrado de datos
            let dataToShow = this.aquiferData;
            if (state.filterValue && state.filterValue !== 'all') {
                dataToShow = {
                    ...this.aquiferData,
                    features: this.aquiferData.features.filter(f => 
                        String(f.properties.VULNERABIL) === String(state.filterValue)
                    )
                };
            }

            this.layers.aquifers = LayerFactory.createAquiferLayer(
                dataToShow,
                (feature, layer) => this.handleFeatureClick(feature, layer),
                state
            ).addTo(this.mapManager.map);

        } else if (opacityChanged) {
            // B) Si solo cambia opacidad, NO reconstruimos, solo actualizamos estilo
            this.layers.aquifers.eachLayer(layer => {
                const currentStyle = layer.options.style || {}; // Obtener estilo actual si es posible
                // Mantenemos el color actual, solo cambiamos opacidad
                layer.setStyle({ 
                    fillOpacity: state.opacity,
                    opacity: (state.activeTheme === 'hydraulics') ? 1 : 0 // Borde
                });
            });
        }

        // 2. GESTIÓN DE CAPA DE POZOS
        if (this.wellsData) {
            if (state.areWellsVisible && !this.layers.wells) {
                this.layers.wells = LayerFactory.createWellsLayer(
                    this.wellsData,
                    (feature) => this.handleFeatureClick(feature)
                ).addTo(this.mapManager.map);
            } else if (!state.areWellsVisible && this.layers.wells) {
                this.mapManager.map.removeLayer(this.layers.wells);
                this.layers.wells = null;
            }
        }

        // 3. CAPAS ESTÁTICAS
        this._toggleStaticLayer('coastline', this.coastlineData, state.isCoastlineVisible, { color: '#007BFF', weight: 2 });
        this._toggleStaticLayer('coastline1km', this.coastline1kmData, state.isCoastline1kmVisible, { color: '#FF0000', weight: 2 });
        this._handleGraticule(state.isGraticuleVisible);

        // 4. LÓGICA DE SELECCIÓN (Zoom y Popup)
        // Solo actuamos si el acuífero seleccionado ha cambiado respecto a la última vez
        if (state.selectedAquifer !== this.prevState.selectedAquifer) {
            if (state.selectedAquifer) {
                this.handleAquiferSelectionByName(state.selectedAquifer);
            } else {
                this.uiManager.hideInfoPanel();
                // Opcional: Reset view
            }
        }

        // 5. ACCIONES DE UN SOLO USO
        if (state.flyToCoords) {
            this.mapManager.flyToCoords(...state.flyToCoords);
            this.stateManager.state.flyToCoords = null; 
        }
        if (state.reset) {
            this.mapManager.resetView();
            this.stateManager.state.reset = false;
            this.stateManager.state.selectedAquifer = null;
        }

        // Actualizar UI y guardar estado previo
        this.uiManager.updateView(state);
        this.prevState = { ...state };
    }

    handleAquiferSelectionByName(aquiferName) {
        // Buscar en la data cargada
        const feature = this.aquiferData.features.find(f => {
            const p = f.properties;
            const name = p.NOM_ACUIF || p.nombre || p.Nombre;
            return name === aquiferName;
        });

        if (feature) {
            // Hacemos Zoom
            const bounds = L.geoJSON(feature).getBounds();
            this.mapManager.fitBounds(bounds);
            
            // Mostramos Info
            this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
        }
    }

    handleFeatureClick(feature, layer) {
        // Al hacer clic, solo actualizamos el estado.
        // El 'render' se encargará de mostrar el panel, pero NO de hacer zoom 
        // (ya que el usuario ya está ahí).
        
        const p = feature.properties;
        const name = p.NOM_ACUIF || p.nombre || p.Nombre;

        // Evitamos bucle: Si ya está seleccionado, no hacemos nada o solo actualizamos panel
        if (this.stateManager.getState().selectedAquifer !== name) {
             this.stateManager.setState({ selectedAquifer: name });
        } else {
             // Si es el mismo, forzamos mostrar panel por si se cerró
             this.uiManager.showInfoPanel(p, CONFIG.vulnerabilityMap);
        }
    }

    _toggleStaticLayer(key, data, visible, style) {
        if (visible && data && !this.layers[key]) {
            this.layers[key] = L.geoJSON(data, { style }).addTo(this.mapManager.map);
        } else if (!visible && this.layers[key]) {
            this.mapManager.map.removeLayer(this.layers[key]);
            this.layers[key] = null;
        }
    }

    _handleGraticule(visible) {
        // Intenta usar una librería simple de graticule si existe, o dibuja líneas manuales
        // Para simplificar, asumimos que no hay plugin externo y saltamos esto por ahora
        // O implementamos una lógica básica si es crítico.
        /* if (visible && !this.layers.graticule && L.simpleGraticule) {
             this.layers.graticule = L.simpleGraticule({ interval: 1 }).addTo(this.mapManager.map);
        } else if (!visible && this.layers.graticule) {
             this.mapManager.map.removeLayer(this.layers.graticule);
             this.layers.graticule = null;
        }
        */
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeovisorApp();
});
