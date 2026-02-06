/**
 * @file main.js
 * @description Punto de entrada principal de la aplicación.
 * Orquesta la inicialización y comunicación entre componentes.
 * VERSIÓN FINAL: Soporte completo para Dropdowns, Búsqueda y Capas Adicionales.
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
        this.uiManager = new UIManager(this.mapManager.map, (newState) => {
            this.stateManager.setState(newState);
        });

        // 4. Suscribirse a cambios de estado
        this.stateManager.subscribe((state) => this.render(state));

        // Almacenamiento de Datos
        this.aquiferData = null;      // GeoJSON fusionado de acuíferos
        this.wellsData = null;        // GeoJSON de pozos
        this.coastlineData = null;    // GeoJSON Línea Costa 10km
        this.coastline1kmData = null; // GeoJSON Línea Costa 1km

        // Referencias a las capas activas en el mapa
        this.layers = {
            aquifers: null,
            wells: null,
            coastline: null,
            coastline1km: null,
            graticule: null
        };

        // Memoria para evitar re-renderizados innecesarios
        this.lastSelectedAquifer = null;

        // 5. Arrancar
        this.init();
    }

    async init() {
        this.uiManager.setLoading(true);
        try {
            console.log("Iniciando carga de datos completa...");
            
            // Cargar datos críticos en paralelo
            // Nota: Agregamos las líneas de costa aquí
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
                // Cargar geometría de acuíferos
                const aquiferFiles = await fetchAllGeoJSON(manifest.files.map(f => `data/${f}`));
                
                // Fusionar todos los GeoJSONs en uno solo
                this.aquiferData = {
                    type: "FeatureCollection",
                    features: aquiferFiles.flatMap(f => f.features)
                };
                
                // Configurar el buscador y el dropdown con los nombres cargados
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
            // Normalizar nombres (algunos archivos usan mayúsculas, otros no)
            const name = props.NOM_ACUIF || props.nombre || props.Nombre;
            const key = props.CLAVE_ACUI || props.clave;
            
            if (name) {
                // Evitar duplicados
                if (!names.includes(name)) names.push(name);
                if (key) keyMap[key] = name;
            }
        });

        // Enviar datos limpios a la UI
        this.uiManager.refreshControls(names, keyMap);
    }

    /**
     * Función central de renderizado.
     * Se ejecuta cada vez que cambia el estado (clicks, filtros, menús).
     */
    render(state) {
        // --- 1. CAPA DE ACUÍFEROS (PRINCIPAL) ---
        if (this.aquiferData) {
            // Filtrar datos si hay un nivel de vulnerabilidad seleccionado
            let dataToShow = this.aquiferData;
            if (state.filterValue && state.filterValue !== 'all') {
                dataToShow = {
                    ...this.aquiferData,
                    features: this.aquiferData.features.filter(f => String(f.properties.VULNERABIL) === String(state.filterValue))
                };
            }

            // Actualizar capa en el mapa
            if (this.layers.aquifers) {
                this.mapManager.map.removeLayer(this.layers.aquifers);
            }
            this.layers.aquifers = LayerFactory.createAquiferLayer(
                dataToShow,
                (feature, layer) => this.handleFeatureClick(feature, layer), // Click en mapa
                state
            ).addTo(this.mapManager.map);
        }

        // --- 2. MANEJO DE SELECCIÓN (DROPDOWN / BUSCADOR) ---
        // Si el usuario seleccionó un acuífero desde el menú, lo buscamos y hacemos zoom
        if (state.selectedAquifer && state.selectedAquifer !== this.lastSelectedAquifer) {
            this.handleAquiferSelectionByName(state.selectedAquifer);
            this.lastSelectedAquifer = state.selectedAquifer; // Actualizar memoria
        } else if (!state.selectedAquifer && this.lastSelectedAquifer) {
            // Si se limpió la selección
            this.uiManager.hideInfoPanel();
            this.mapManager.resetView(); // Opcional: volver a vista inicial
            this.lastSelectedAquifer = null;
        }

        // --- 3. CAPA DE POZOS ---
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

        // --- 4. CAPAS ADICIONALES (Líneas de Costa) ---
        this._toggleStaticLayer('coastline', this.coastlineData, state.isCoastlineVisible, { color: '#007BFF', weight: 2 });
        this._toggleStaticLayer('coastline1km', this.coastline1kmData, state.isCoastline1kmVisible, { color: '#FF0000', weight: 2 });

        // --- 5. MALLADO (GRATICULE) ---
        // Usamos un plugin o librería simple para esto, si no hay, podemos simularlo o requerir un plugin de Leaflet
        // Por ahora, asumimos que existe un plugin 'L.latlngGraticule' o similar si lo tenías antes.
        // Si no tienes plugin de graticule instalado, esta parte podría requerir ajuste.
        // Aquí mostramos una implementación básica si tienes el script cargado, si no, se omite.
        if (state.isGraticuleVisible) {
            if (!this.layers.graticule && L.simpleGraticule) { // Verifica si el plugin existe
                this.layers.graticule = L.simpleGraticule({ interval: 1 }).addTo(this.mapManager.map);
            }
        } else {
            if (this.layers.graticule) {
                this.mapManager.map.removeLayer(this.layers.graticule);
                this.layers.graticule = null;
            }
        }

        // --- 6. UI Y EFECTOS ---
        this.uiManager.updateView(state);

        if (state.flyToCoords) {
            this.mapManager.flyToCoords(...state.flyToCoords);
            this.stateManager.state.flyToCoords = null; 
        }

        if (state.reset) {
            this.mapManager.resetView();
            this.stateManager.state.reset = false;
            // Limpiar selección también en estado
            this.stateManager.state.selectedAquifer = null;
            this.lastSelectedAquifer = null;
        }
    }

    /**
     * Maneja la selección lógica desde el Dropdown o Buscador.
     * Busca la geometría y hace zoom.
     */
    handleAquiferSelectionByName(aquiferName) {
        if (!this.aquiferData) return;

        const feature = this.aquiferData.features.find(f => {
            const p = f.properties;
            const name = p.NOM_ACUIF || p.nombre || p.Nombre;
            return name === aquiferName;
        });

        if (feature) {
            // Calcular límites para hacer zoom
            const bounds = L.geoJSON(feature).getBounds();
            this.mapManager.fitBounds(bounds);
            
            // Mostrar panel de info
            this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
        }
    }

    handleFeatureClick(feature, layer) {
        // Extraer nombre para actualizar el estado global (y que el dropdown se sincronice)
        const p = feature.properties;
        const name = p.NOM_ACUIF || p.nombre || p.Nombre;
        
        // Actualizamos el estado -> Esto disparará render() de nuevo
        // pero gracias a lastSelectedAquifer no entraremos en bucle infinito
        this.stateManager.setState({ selectedAquifer: name });
        
        // Mostrar info inmediatamente
        this.uiManager.showInfoPanel(p, CONFIG.vulnerabilityMap);
    }

    // Helper para capas estáticas simples
    _toggleStaticLayer(layerKey, data, isVisible, style) {
        if (isVisible && data) {
            if (!this.layers[layerKey]) {
                this.layers[layerKey] = L.geoJSON(data, { style: style }).addTo(this.mapManager.map);
            }
        } else {
            if (this.layers[layerKey]) {
                this.mapManager.map.removeLayer(this.layers[layerKey]);
                this.layers[layerKey] = null;
            }
        }
    }
}

// Arrancar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeovisorApp();
});
