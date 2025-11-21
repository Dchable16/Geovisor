/**
 * @file main.js
 * @version 1.1.0
 * @description Controlador principal de la aplicación Geovisor.
 * Gestiona el estado de la aplicación, la carga de datos geográficos y alfanuméricos,
 * la lógica de interacción con el mapa y la coordinación con la interfaz de usuario.
 */

'use strict';

import { CONFIG } from './config.js';
import { fetchGeoJSON, fetchAllGeoJSON } from './dataLoader.js';
import AutoGraticule from 'https://esm.sh/leaflet-auto-graticule';
import { MapManager } from './mapManager.js';
import { UIManager } from './uiManager.js';

/**
 * Estado inicial de la aplicación.
 * Define los valores por defecto para la visualización y filtros.
 * @constant {Object}
 */
const INITIAL_STATE = {
    opacity: 0.5,
    filterValue: 'all',
    selectedAquifer: null,
    isCoastlineVisible: false,
    isCoastline1kmVisible: false,
    isGraticuleVisible: false,
    activeTheme: 'vulnerability', // 'vulnerability' | 'hydraulics'
    areWellsVisible: false,
    selectedWellId: null
};

/**
 * Clase principal que orquesta la lógica del Geovisor.
 */
class GeovisorApp {
    /**
     * Inicializa la aplicación, configura el estado, los gestores y comienza la carga de datos.
     */
    constructor() {
        /**
         * Estado reactivo de la aplicación.
         * @type {Object}
         */
        this.state = { ...INITIAL_STATE };

        /**
         * Almacén de datos en memoria.
         * @type {Object}
         * @property {Object} aquifers - Referencias a las capas GeoJSON de vulnerabilidad indexadas por nombre.
         * @property {Object} keyToNameMap - Mapa de búsqueda inversa (Clave -> Nombre).
         * @property {Object} hydraulicProps - Datos alfanuméricos de propiedades hidráulicas.
         */
        this.data = {
            aquifers: {},
            keyToNameMap: {},
            hydraulicProps: {}
        };

        /**
         * Referencias a las instancias de capas de Leaflet.
         * @type {Object}
         */
        this.leafletLayers = {
            vulnerability: null,
            aquiferBoundaries: null,
            wells: null,
            coastline: null,
            coastline1km: null,
            graticule: null
        };

        // Inicialización de gestores
        this.mapManager = new MapManager(CONFIG.mapId);
        this.uiManager = new UIManager(this.mapManager.map, this.handleStateChange.bind(this));
        
        this.init();
    }

    /**
     * Manejador centralizado para cambios de estado solicitados por la UI.
     * @param {Object} newState - Objeto parcial con las propiedades a actualizar.
     */
    handleStateChange(newState) {
        this.updateState(newState);
    }

    /**
     * Actualiza el estado de la aplicación y ejecuta los efectos secundarios necesarios (renderizado, zoom, etc.).
     * @param {Object} newState - Nuevos valores de estado.
     */
    updateState(newState) {
        // Reinicio completo de la vista
        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE };
            this.mapManager.resetView();
            this.render();
            return;
        }

        // Navegación a coordenadas específicas
        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords;
            this.mapManager.flyToCoords(lat, lon, name);
        }

        // Actualización del estado
        this.state = { ...this.state, ...newState };
        
        // Efecto secundario: Zoom al seleccionar acuífero en modo vulnerabilidad
        if (newState.selectedAquifer !== undefined && this.state.activeTheme === 'vulnerability') {
             if (this.state.selectedAquifer && this.data.aquifers[this.state.selectedAquifer]) {
                 const group = L.featureGroup(this.data.aquifers[this.state.selectedAquifer]);
                 this.mapManager.fitBounds(group.getBounds());
             }
        }
        
        // Limpieza de selección de pozo si la capa se oculta
        if (newState.areWellsVisible === false) {
            this.state.selectedWellId = null;
        }

        this.render();
    }

    /**
     * Método asíncrono de inicialización.
     * Carga datos base, capas geográficas y configura elementos iniciales del mapa.
     */
    async init() {
        this.uiManager.setLoading(true);
        
        // 1. Carga de base de datos hidráulica con estrategia de fallback (redilencia)
        let hydroData = null;
        const pathsToTry = [
            'data/boundaries/propiedades_hidraulicas.json', 
            'data/propiedades_hidraulicas.json'
        ];

        for (const url of pathsToTry) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    hydroData = await response.json();
                    console.log(`[Info] Datos hidraulicos cargados desde: ${url}`);
                    break; 
                }
            } catch (e) { 
                // Ignorar error y probar siguiente ruta
            }
        }

        if (hydroData) {
            this.data.hydraulicProps = hydroData;
        } else {
            console.warn("[Warn] No se pudo cargar el archivo 'propiedades_hidraulicas.json'. Verifique la ruta.");
        }

        // 2. Carga de capas geográficas
        await this.loadLayers();

        // 3. Configuración de la retícula (Graticule)
        this.leafletLayers.graticule = new AutoGraticule({
            color: '#333', 
            weight: 0.8,
            opacity: 0.5,
            minDistance: 100
        });

        this.uiManager.setLoading(false);
        this.uiManager.updateView(this.state);
        
        // Zoom inicial a la capa principal si existe
        if (this.leafletLayers.vulnerability) {
            this.mapManager.fitBounds(this.leafletLayers.vulnerability.getBounds());
        }
    }

    /**
     * Carga y procesa todas las capas GeoJSON requeridas por el sistema.
     * Incluye lógica para manejo de archivos fragmentados (manifest) y rutas alternativas.
     */
    async loadLayers() {
        // Capas Auxiliares (Líneas de costa)
        const coastlineData = await fetchGeoJSON(CONFIG.coastlineUrl);
        if (coastlineData) this.leafletLayers.coastline = L.geoJson(coastlineData, { style: CONFIG.styles.coastline });
        
        const coastline1kmData = await fetchGeoJSON(CONFIG.coastline1kmUrl);
        if (coastline1kmData) this.leafletLayers.coastline1km = L.geoJson(coastline1kmData, { style: CONFIG.styles.coastline1km });

        // 1. Capa de Vulnerabilidad (Carga fragmentada vía manifest.json)
        const manifest = await fetchGeoJSON(CONFIG.dataManifestUrl);
        if (manifest && manifest.files) {
            const dataUrls = manifest.files.map(file => manifest.basePath + file);
            const geojsonArray = await fetchAllGeoJSON(dataUrls);
            
            // Fusión de features
            const allFeatures = geojsonArray.reduce((acc, fc) => acc.concat(fc ? fc.features : []), []);
            const mainData = { type: "FeatureCollection", features: allFeatures };

            if (mainData.features.length > 0) {
                this.leafletLayers.vulnerability = this.mapManager.addGeoJsonLayer(
                    mainData,
                    (feature) => this.getVulnerabilityStyle(feature),
                    (feature, layer) => this.onVulnerabilityFeature(feature, layer)
                );
                
                // Indexación de datos para búsqueda rápida
                this.leafletLayers.vulnerability.eachLayer(layer => {
                    const { NOM_ACUIF, CLAVE_ACUI } = layer.feature.properties;
                    if (NOM_ACUIF) {
                        if (!this.data.aquifers[NOM_ACUIF]) this.data.aquifers[NOM_ACUIF] = [];
                        this.data.aquifers[NOM_ACUIF].push(layer);
                    }
                    if (CLAVE_ACUI && !this.data.keyToNameMap[CLAVE_ACUI]) {
                        this.data.keyToNameMap[CLAVE_ACUI] = NOM_ACUIF;
                    }
                });
                
                // Actualización de componentes de UI con los datos cargados
                this.uiManager.setSearchData(Object.keys(this.data.aquifers), this.data.keyToNameMap);
                this.uiManager.populateAquiferSelect(Object.keys(this.data.aquifers));
            }
        }

        // 2. Capa de Límites de Acuíferos (Hidráulica)
        let boundariesData = await fetchGeoJSON('data/boundaries/limites_acuiferos_mx.geojson');
        if (!boundariesData) {
             // Intento de ruta alternativa
             boundariesData = await fetchGeoJSON('data/limites_acuiferos_mx.geojson');
        }

        if (boundariesData) {
            this.leafletLayers.aquiferBoundaries = L.geoJson(boundariesData, {
                style: (feature) => this.getHydraulicBoundaryStyle(feature),
                onEachFeature: (feature, layer) => this.onHydraulicFeature(feature, layer)
            });
        } else {
            console.error("[Error] No se encontró el archivo 'limites_acuiferos_mx.geojson' en las rutas esperadas.");
        }

        // 3. Capa de Pozos
        let wellsData = await fetchGeoJSON('data/boundaries/pozos.geojson');
        if (!wellsData) wellsData = await fetchGeoJSON('data/pozos.geojson');
        
        if (wellsData) {
            this.leafletLayers.wells = L.geoJson(wellsData, {
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, this.getWellStyle(feature)),
                onEachFeature: (feature, layer) => this.onWellFeature(feature, layer)
            });
        }
    }

    /**
     * Normaliza la clave del acuífero para asegurar coincidencia con la base de datos.
     * Convierte a string y rellena con ceros a la izquierda hasta 4 dígitos (ej: "201" -> "0201").
     * @param {Object} feature - Feature GeoJSON.
     * @returns {string|null} Clave normalizada o null si no existe.
     * @private
     */
    _getNormalizedKey(feature) {
        const p = feature.properties;
        // Búsqueda resiliente de la propiedad clave
        let rawKey = p.CLAVE_ACUI || p.CLV_ACUI || p.CVE_ACU || p.CLAVE;
        
        if (rawKey === undefined || rawKey === null) return null;
        
        return String(rawKey).trim().padStart(4, '0');
    }

    // ============================================================
    //      ESTILOS Y GESTIÓN DE EVENTOS
    // ============================================================

    /**
     * Genera el estilo para la capa de vulnerabilidad basado en el nivel de riesgo.
     * @param {Object} feature - Feature GeoJSON.
     * @returns {Object} Objeto de estilo Leaflet.
     */
    getVulnerabilityStyle(feature) {
        const { VULNERABIL, NOM_ACUIF } = feature.properties;
        const fillColor = this.mapManager.getColor(VULNERABIL);
        
        let style = { 
            ...CONFIG.styles.base, 
            fillColor: fillColor, 
            fillOpacity: this.state.opacity 
        };

        // Aplicar opacidad reducida si hay un filtro activo
        if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
            style = { ...style, ...CONFIG.styles.muted };
        }
        // Resaltar selección actual
        if (this.state.selectedAquifer === NOM_ACUIF) {
            style = { ...style, ...CONFIG.styles.selection };
        }
        return style;
    }

    /**
     * Asigna eventos a cada polígono de la capa de vulnerabilidad.
     */
    onVulnerabilityFeature(feature, layer) {
        layer.on({
            mouseover: (e) => {
                if (feature.properties.NOM_ACUIF !== this.state.selectedAquifer) {
                    e.target.setStyle({ ...this.getVulnerabilityStyle(feature), ...CONFIG.styles.hover });
                }
            },
            mouseout: (e) => e.target.setStyle(this.getVulnerabilityStyle(feature)),
            click: (e) => {
                L.DomEvent.stop(e);
                // Feedback visual inmediato
                e.target.setStyle(CONFIG.styles.clickHighlight);
                e.target.bringToFront();
                
                // Restaurar estilo tras breve retraso
                setTimeout(() => { 
                    if (this.mapManager.map.hasLayer(e.target)) {
                        e.target.setStyle(this.getVulnerabilityStyle(feature));
                    }
                }, 1500);
                
                this.uiManager.showInfoPanel(feature.properties, CONFIG.vulnerabilityMap);
            }
        });
    }

    /**
     * Genera el estilo para los límites de acuíferos (capa hidráulica).
     * Diferencia visualmente los acuíferos con datos disponibles de los que no.
     */
    getHydraulicBoundaryStyle(feature) {
        const clave = this._getNormalizedKey(feature);
        const data = this.data.hydraulicProps?.data?.[clave];
        
        return {
            weight: 1,
            color: '#666',
            fillColor: data ? '#AAD3DF' : '#E0E0E0', // Azul si hay datos, gris si no
            fillOpacity: 0.5
        };
    }

    /**
     * Asigna eventos a la capa hidráulica.
     * Realiza la vinculación de datos usando la clave normalizada.
     */
    onHydraulicFeature(feature, layer) {
        const clave = this._getNormalizedKey(feature);
        
        layer.on({
            mouseover: (e) => e.target.setStyle({ weight: 2, color: '#000', fillOpacity: 0.7 }),
            mouseout: (e) => e.target.setStyle(this.getHydraulicBoundaryStyle(feature)),
            click: (e) => {
                L.DomEvent.stop(e);
                
                // 1. Buscar datos en el objeto JSON cargado
                const dataPromedio = this.data.hydraulicProps?.data?.[clave];
                
                if(!dataPromedio) {
                    console.warn(`[Warn] Datos no encontrados para la clave normalizada: ${clave}`);
                }

                // 2. Determinar nombre con prioridad (JSON > GeoJSON)
                const nombre = (dataPromedio ? dataPromedio.nombre : null) || feature.properties.NOM_ACUIF || 'Acuífero';

                // 3. Preparar datos para el panel
                const displayProps = {
                    'Nombre del Acuífero': nombre,
                    'Clave': clave,
                    ...dataPromedio 
                };
                
                this.uiManager.showInfoPanel(displayProps);
            }
        });
    }

    /**
     * Genera estilo para los marcadores de pozos.
     */
    getWellStyle(feature) {
        const isSelected = (this.state.selectedWellId === feature.properties.NOMBRE_POZO);
        return {
            radius: isSelected ? 8 : 4,
            fillColor: isSelected ? '#FFD700' : '#007BFF',
            color: '#fff', 
            weight: 1, 
            opacity: 1, 
            fillOpacity: isSelected ? 1 : 0.8
        };
    }

    /**
     * Asigna eventos a los puntos de pozos.
     */
    onWellFeature(feature, layer) {
        layer.on('click', (e) => {
            L.DomEvent.stop(e);
            this.updateState({ selectedWellId: feature.properties.NOMBRE_POZO });
            const props = feature.properties;
            const displayData = {
                "Tipo": "Pozo de Monitoreo",
                "Nombre del Pozo": props.NOMBRE_POZO,
                "Acuífero": props.ACUIFERO,
                // Formatear con unidades si existen
                "Transmisividad": props.T_m2d ? `${props.T_m2d} m²/d` : null,
                "Conductividad": props.K_md ? `${props.K_md} m/d` : null,
                "Coef. Almacenamiento": props.S,
                "Caudal (Q)": props.Q_lps ? `${props.Q_lps} lps` : null,
                "Profundidad": props.PROFUNDIDAD ? `${props.PROFUNDIDAD} m` : null
                "Año": props.AÑO ? props.AÑO : null
            };

            this.uiManager.showInfoPanel(displayData);
        });
    }

    // ============================================================
    //      CICLO DE RENDERIZADO
    // ============================================================

    /**
     * Actualiza la visualización del mapa según el estado actual.
     * Gestiona la visibilidad de capas, estilos y orden de apilamiento (Z-Index).
     */
    render() {
        const map = this.mapManager.map;
        const { activeTheme, areWellsVisible, selectedWellId } = this.state;

        // 1. Gestión de Temas (Vulnerabilidad vs Hidráulica)
        if (activeTheme === 'vulnerability') {
            if (this.leafletLayers.vulnerability && !map.hasLayer(this.leafletLayers.vulnerability)) {
                this.leafletLayers.vulnerability.addTo(map);
            }
            if (this.leafletLayers.aquiferBoundaries && map.hasLayer(this.leafletLayers.aquiferBoundaries)) {
                map.removeLayer(this.leafletLayers.aquiferBoundaries);
            }
            
            // Actualizar estilos dinámicos
            if (this.leafletLayers.vulnerability) {
                this.leafletLayers.vulnerability.eachLayer(l => l.setStyle(this.getVulnerabilityStyle(l.feature)));
            }
        } else { // Theme: hydraulics
            if (this.leafletLayers.aquiferBoundaries && !map.hasLayer(this.leafletLayers.aquiferBoundaries)) {
                this.leafletLayers.aquiferBoundaries.addTo(map);
            }
            if (this.leafletLayers.vulnerability && map.hasLayer(this.leafletLayers.vulnerability)) {
                map.removeLayer(this.leafletLayers.vulnerability);
            }
            
            if (this.leafletLayers.aquiferBoundaries) {
                this.leafletLayers.aquiferBoundaries.eachLayer(l => l.setStyle(this.getHydraulicBoundaryStyle(l.feature)));
            }
        }

        // 2. Gestión de Pozos
        if (this.leafletLayers.wells) {
            if (areWellsVisible) {
                if (!map.hasLayer(this.leafletLayers.wells)) {
                    this.leafletLayers.wells.addTo(map);
                }
                this.leafletLayers.wells.eachLayer(l => {
                    l.setStyle(this.getWellStyle(l.feature));
                    // Traer pozo seleccionado al frente
                    if (l.feature.properties.NOMBRE_POZO === selectedWellId) {
                        l.bringToFront();
                    }
                });
            } else {
                if (map.hasLayer(this.leafletLayers.wells)) {
                    map.removeLayer(this.leafletLayers.wells);
                }
            }
        }

        // 3. Capas Auxiliares
        const auxLayers = [
            { layer: this.leafletLayers.coastline, visible: this.state.isCoastlineVisible },
            { layer: this.leafletLayers.coastline1km, visible: this.state.isCoastline1kmVisible },
            { layer: this.leafletLayers.graticule, visible: this.state.isGraticuleVisible }
        ];
        
        auxLayers.forEach(({ layer, visible }) => {
            if (!layer) return;
            if (visible && !map.hasLayer(layer)) layer.addTo(map);
            else if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
        });

        // 4. Actualizar Interfaz de Usuario
        this.uiManager.updateView(this.state);
    }
}

// Punto de entrada de la aplicación
document.addEventListener('DOMContentLoaded', () => { 
    new GeovisorApp(); 
});
