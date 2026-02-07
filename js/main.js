/**
 * @file main.js
 * @description Orquestador principal.
 * VERSIÓN CORREGIDA: Restaura el comportamiento original (Clic no fuerza zoom).
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
            // Si la UI pide un cambio (ej. Dropdown), asumimos que el usuario quiere Zoom
            // Agregamos la bandera 'zoomToSelection: true' explícitamente
            if (newState.selectedAquifer !== undefined) {
                newState.zoomToSelection = true;
            }
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

        // Memoria de estado previo
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
            
            if (name) {
                if (!names.includes(name)) names.push(name);
                if (key) keyMap[key] = name;
            }
        });

        this.uiManager.refreshControls(names, keyMap);
    }

    render(state, force = false) {
        if (!this.aquiferData) return;

        // 1. GESTIÓN DE CAPA DE ACUÍFEROS
        const filterChanged = state.filterValue !== this.prevState.filterValue;
        const themeChanged = state.activeTheme !== this.prevState.activeTheme;
        const opacityChanged = state.opacity !== this.prevState.opacity;

        if (force || filterChanged || themeChanged || !this.layers.aquifers) {
            if (this.layers.aquifers) this.mapManager.map.removeLayer(this.layers.aquifers);

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

        } else if (opacityChanged && this.layers.aquifers) {
            this.layers.aquifers.eachLayer(layer => {
                layer.setStyle({ 
                    fillOpacity: state.opacity,
                    opacity: (state.activeTheme === 'hydraulics') ? 1 : 0
                });
            });
        }

        // 2. CAPA DE POZOS
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

        // 4. LÓGICA DE SELECCIÓN (EL CAMBIO CLAVE)
        if (state.selectedAquifer !== this.prevState.selectedAquifer) {
            if (state.selectedAquifer) {
                // Solo hacemos Zoom si la bandera 'zoomToSelection' es verdadera (viene del menú)
                // Si viene de un clic en el mapa, esta bandera será falsa.
                const shouldZoom = state.zoomToSelection === true;
                this.handleAquiferSelectionByName(state.selectedAquifer, shouldZoom);
            } else {
                this.uiManager.hideInfoPanel();
            }
        }

        // 5. ACCIONES EFÍMERAS
        if (state.flyToCoords) {
            this.mapManager.flyToCoords(...state.flyToCoords);
            this.stateManager.state.flyToCoords = null; 
        }
        if (state.reset) {
            this.mapManager.resetView();
            this.stateManager.state.reset = false;
            this.stateManager.state.selectedAquifer = null;
        }

        this.uiManager.updateView(state);
        this.prevState = { ...state };
    }

    handleAquiferSelectionByName(aquiferName, doZoom) {
        const feature = this.aquiferData.features.find(f => {
            const p = f.properties;
            const name = p.NOM_ACUIF || p.nombre || p.Nombre;
            return name === aquiferName;
        });

        if (feature) {
            if (doZoom) {
                const bounds = L.geoJSON(feature).getBounds();
                this.mapManager.fitBounds(bounds);
            }
            // Siempre mostramos el panel
            this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
        }
    }

    handleFeatureClick(feature, layer) {
        const p = feature.properties;
        const name = p.NOM_ACUIF || p.nombre || p.Nombre;

        // IMPORTANTE: Al hacer clic en el mapa, actualizamos el nombre
        // PERO indicamos 'zoomToSelection: false' para que no salte la cámara.
        this.stateManager.setState({ 
            selectedAquifer: name,
            zoomToSelection: false 
        });
        
        // Forzamos mostrar el panel inmediatamente para respuesta rápida
        this.uiManager.showInfoPanel(p, CONFIG.vulnerabilityMap);
    }

    _toggleStaticLayer(key, data, visible, style) {
        if (visible && data && !this.layers[key]) {
            this.layers[key] = L.geoJSON(data, { style }).addTo(this.mapManager.map);
        } else if (!visible && this.layers[key]) {
            this.mapManager.map.removeLayer(this.layers[key]);
            this.layers[key] = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeovisorApp();
});
