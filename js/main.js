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
            // Índices para VULNERABILIDAD
            vulnLayers: {},      // Nombre -> Capa (para zoom)
            vulnNames: [],       // Lista de nombres para el buscador
            vulnKeyMap: {},      // Clave -> Nombre

            // Índices para HIDRÁULICA
            hydroLayers: {},     // Nombre -> Capa (para zoom)
            hydroNames: [],      // Lista de nombres (solo los que tienen datos)
            hydroKeyMap: {},     // Clave -> Nombre
            
            hydraulicProps: {},   // Base de datos JSON
            wellsData: null
        };

        this.lastFilteredAquifer = 'NINGUNO';

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
        // 1. Reinicio completo
        if (newState.reset === true) {
            this.state = { ...INITIAL_STATE };
            this.mapManager.resetView();
            // Restaurar controles al resetear (Vulnerabilidad por defecto)
            this.uiManager.refreshControls(this.data.vulnNames, this.data.vulnKeyMap);
            this.render();
            return;
        }
        
        if (newState.selectedAquifer !== undefined && newState.selectedAquifer !== this.state.selectedAquifer) {
            // Si cambia el acuífero, forzamos la deselección del pozo
            newState.selectedWellId = null; 
        }

        // 2. Navegación
        if (newState.flyToCoords) {
            const [lat, lon, name] = newState.flyToCoords;
            this.mapManager.flyToCoords(lat, lon, name);
        }

        // 3. Detectar cambio de tema
        const themeChanged = newState.activeTheme && newState.activeTheme !== this.state.activeTheme;

        // 4. Actualizar estado
        this.state = { ...this.state, ...newState };

        // 5. Actualización de Controles
        if (themeChanged) {
            if (this.state.activeTheme === 'hydraulics') {
                this.uiManager.refreshControls(this.data.hydroNames, this.data.hydroKeyMap);
            } else {
                this.uiManager.refreshControls(this.data.vulnNames, this.data.vulnKeyMap);
            }
            this.state.selectedAquifer = null; 
        }

        // 6. Zoom Inteligente
        if (newState.selectedAquifer) {
            const name = newState.selectedAquifer;
            let targetLayer = null;

            if (this.state.activeTheme === 'vulnerability') {
                if (this.data.vulnLayers[name]) { 
                    targetLayer = L.featureGroup(this.data.vulnLayers[name]);
                }
            } else {
                targetLayer = this.data.hydroLayers[name];
            }

            if (targetLayer) {
                this.mapManager.fitBounds(targetLayer.getBounds());
            }
        }
        
        // 7. Limpieza de pozos
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
        
        const map = this.mapManager.map;
        map.createPane('wellsPane');
        map.getPane('wellsPane').style.zIndex = 600; // Piso superior
        
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
            
            // PRE-PROCESAR: Crear lista para el filtro hidráulico
            const hydroDict = hydroData.data || {};
            Object.keys(hydroDict).forEach(key => {
                const item = hydroDict[key];
                if (item && item.nombre) {
                    this.data.hydroNames.push(item.nombre);
                    this.data.hydroKeyMap[key] = item.nombre;
                }
            });
            this.data.hydroNames.sort();
            
            // Inicializar controles por defecto con la lista de vulnerabilidad (que se llenará en loadLayers)
            // OJO: Asegúrate de llenar vulnNames en loadLayers o usar una lista por defecto
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
        this.uiManager.refreshControls(this.data.vulnNames, this.data.vulnKeyMap);
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
                        // Antes: if (!this.data.aquifers[NOM_ACUIF]) ...
                        // Ahora: Usamos vulnLayers
                        if (!this.data.vulnLayers[NOM_ACUIF]) this.data.vulnLayers[NOM_ACUIF] = [];
                        this.data.vulnLayers[NOM_ACUIF].push(layer);
                        
                        // Llenar lista de nombres para el buscador
                        if (!this.data.vulnNames.includes(NOM_ACUIF)) {
                            this.data.vulnNames.push(NOM_ACUIF);
                        }
                    }
                    if (CLAVE_ACUI) {
                        this.data.vulnKeyMap[CLAVE_ACUI] = NOM_ACUIF;
                    }
                });
                
                // Ordenar nombres alfabéticamente
                this.data.vulnNames.sort();

                // Actualización de componentes de UI con las variables CORRECTAS
                this.uiManager.setSearchData(this.data.vulnNames, this.data.vulnKeyMap);
                this.uiManager.populateAquiferSelect(this.data.vulnNames);
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
                onEachFeature: (feature, layer) => {
                    // 1. Lógica estándar de eventos (clic, hover)
                    this.onHydraulicFeature(feature, layer);
                    
                    // 2. NUEVO: Indexar capa para permitir ZOOM y BÚSQUEDA
                    const clave = this._getNormalizedKey(feature);
                    const data = this.data.hydraulicProps?.data?.[clave];
                    // Nombre prioritario: El del JSON, o fallback al del Mapa
                    const nombre = (data ? data.nombre : null) || feature.properties.NOM_ACUIF || feature.properties.NOM_ACUI;
                    
                    if (nombre) {
                        this.data.hydroLayers[nombre] = layer; // Guardamos la capa
                    }
                }
            });
        } else {
            console.error("[Error] No se encontró el archivo 'limites_acuiferos_mx.geojson' en las rutas esperadas.");
        }

        // 3. Capa de Pozos
        let wellsData = await fetchGeoJSON('data/boundaries/pozos.geojson');
        if (!wellsData) wellsData = await fetchGeoJSON('data/pozos.geojson');
        
        if (wellsData) {
            console.log(`✅ Pozos cargados: ${wellsData.features.length} registros.`);
            
            // A. Guardamos los datos crudos en memoria
            this.data.wellsData = wellsData; 

            // B. Inicializamos la capa VACÍA (null) pero configurada
            this.leafletLayers.wells = L.geoJson(null, {
                pane: 'wellsPane',
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, this.getWellStyle(feature)),
                pane: 'wellsPane'
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
        
        // Determinar si este polígono es el seleccionado
        // Intentamos coincidir por nombre (que es lo que usamos en el estado)
        const nombreGeo = feature.properties.NOM_ACUI || feature.properties.NOM_ACUIF;
        const nombreData = data ? data.nombre : null;
        // Usamos el mismo criterio de nombre que en el evento click
        const nombre = nombreData || nombreGeo || 'Acuífero';
        
        const isSelected = (this.state.selectedAquifer === nombre);

        return {
            weight: isSelected ? 4 : 1,          // Borde más grueso si seleccionado
            color: isSelected ? '#FFD700' : '#666', // Amarillo (Gold) vs Gris
            fillColor: data ? '#AAD3DF' : '#E0E0E0', 
            fillOpacity: this.state.opacity
        };
    }

    /**
     * Asigna eventos a la capa hidráulica.
     * Realiza la vinculación de datos usando la clave normalizada.
     */
    onHydraulicFeature(feature, layer) {
        const clave = this._getNormalizedKey(feature);
        
        layer.on({
            mouseover: (e) => {
                // Resolvemos el nombre igual que en el click para comparar
                const data = this.data.hydraulicProps?.data?.[clave];
                const nombre = (data ? data.nombre : null) || feature.properties.NOM_ACUIF || feature.properties.NOM_ACUI || 'Acuífero';

                // Solo aplicar estilo hover (negro) si NO es el acuífero seleccionado actualmente
                if (this.state.selectedAquifer !== nombre) {
                    e.target.setStyle({ weight: 2, color: '#000', fillOpacity: 0.7 });
                }
            },
            mouseout: (e) => {
                // Restaurar el estilo calculado (que ya sabe si debe pintarse amarillo o gris)
                e.target.setStyle(this.getHydraulicBoundaryStyle(feature));
            },
            click: (e) => {
                L.DomEvent.stop(e);
                
                // 1. Buscar datos en el JSON
                const dataPromedio = this.data.hydraulicProps?.data?.[clave];
                
                if(!dataPromedio) {
                    console.warn(`[Warn] Datos no encontrados para la clave normalizada: ${clave}`);
                }

                // 2. Determinar nombre (Prioridad: JSON > GeoJSON)
                const nombre = (dataPromedio ? dataPromedio.nombre : null) || feature.properties.NOM_ACUIF || feature.properties.NOM_ACUI || 'Acuífero';

                // --- NUEVO: Actualizar estado para fijar el borde amarillo ---
                this.updateState({ selectedAquifer: nombre });

                // 3. PREPARAR DATOS CON UNIDADES
                let propsConUnidades = {};
                if (dataPromedio) {
                    propsConUnidades = {
                        "Transmisividad Media": dataPromedio.transmisividad_media ? `${dataPromedio.transmisividad_media} m²/d` : null,
                        "Conductividad Media": dataPromedio.conductividad_media ? `${dataPromedio.conductividad_media} m/d` : null,
                        "Coef. Almacenamiento": dataPromedio.coef_almacenamiento_medio,
                        "Profundidad Media": dataPromedio.profundidad_media ? `${dataPromedio.profundidad_media} m` : null,
                        "Pozos Registrados": dataPromedio.pozos_registrados
                    };
                }

                // 4. Objeto final para el panel
                const displayProps = {
                    'Nombre del Acuífero': nombre,
                    'Clave': clave,
                    ...propsConUnidades 
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
                "Profundidad": props.PROFUNDIDAD ? `${props.PROFUNDIDAD} m` : null,
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
            // 1. Mostrar la capa hidráulica
            if (this.leafletLayers.aquiferBoundaries && !map.hasLayer(this.leafletLayers.aquiferBoundaries)) {
                this.leafletLayers.aquiferBoundaries.addTo(map);
            }
            // 2. Ocultar la capa de vulnerabilidad
            if (this.leafletLayers.vulnerability && map.hasLayer(this.leafletLayers.vulnerability)) {
                map.removeLayer(this.leafletLayers.vulnerability);
            }
            
            // 3. Actualizar estilos y ORDEN DE APILAMIENTO (Z-INDEX)
            if (this.leafletLayers.aquiferBoundaries) {
                this.leafletLayers.aquiferBoundaries.eachLayer(l => {
                    // Aplicar el estilo (Amarillo o Gris)
                    l.setStyle(this.getHydraulicBoundaryStyle(l.feature));
                    
                    // --- CORRECCIÓN CLAVE ---
                    // Si este es el acuífero seleccionado, traerlo al frente para que no lo tapen
                    // Recalculamos el nombre para comparar con el estado
                    const clave = this._getNormalizedKey(l.feature);
                    const data = this.data.hydraulicProps?.data?.[clave];
                    const nombre = (data ? data.nombre : null) || l.feature.properties.NOM_ACUIF || l.feature.properties.NOM_ACUI;
                    
                    if (this.state.selectedAquifer === nombre) {
                        l.bringToFront(); 
                    }
                });
            }
        }

        // 2. Gestión de Pozos con FILTRADO
        // Verificamos que existan la capa Y los datos crudos
        if (this.leafletLayers.wells && this.data.wellsData) {
            
            if (areWellsVisible) {
                // A. DETECTAR CAMBIOS: Si cambió el acuífero seleccionado, filtramos
                // (selectedAquifer viene del estado, updatedState lo actualiza al hacer clic)
                if (this.lastFilteredAquifer !== this.state.selectedAquifer) {
                    
                    let featuresToShow = this.data.wellsData.features;
                    const nombreAcuifero = this.state.selectedAquifer;

                    // LÓGICA DE FILTRADO
                    if (nombreAcuifero) {
                        // Mostrar SOLO pozos que pertenezcan al acuífero seleccionado
                        featuresToShow = featuresToShow.filter(f => f.properties.ACUIFERO === nombreAcuifero);
                    } 
                    // Si nombreAcuifero es null, muestra todos (comportamiento default)

                    // Actualizar la capa visual
                    this.leafletLayers.wells.clearLayers(); // Borrar puntos viejos
                    this.leafletLayers.wells.addData(featuresToShow); // Poner puntos nuevos
                    
                    this.lastFilteredAquifer = nombreAcuifero; // Recordar para no repetir
                }

                // B. Mostrar en mapa y aplicar estilos
                if (!map.hasLayer(this.leafletLayers.wells)) {
                    this.leafletLayers.wells.addTo(map);
                }

                this.leafletLayers.wells.eachLayer(l => {
                    l.setStyle(this.getWellStyle(l.feature));
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
