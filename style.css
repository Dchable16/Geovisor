/**
 * @file mapManager.js
 * @description Gestiona la creación y manipulación del mapa Leaflet con Geoman.
 * @version 9.0: Solución definitiva al bloqueo de dibujo. Se elimina el prompt() bloqueante
 * y se asignan nombres por defecto a las nuevas capas para un rendimiento y UX fluidos.
 */

import { CONFIG } from './config.js';

export class MapManager {
    constructor(mapId) {
        this.map = L.map(mapId, {
            center: CONFIG.initialCoords,
            zoom: CONFIG.initialZoom,
            layers: [CONFIG.tileLayers["Neutral (defecto)"]],
            zoomControl: false,
            preferCanvas: true
        });

        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);
        this.drawCounter = 0; // Contador para nombres de dibujos únicos

        this.map.pm.addControls({
            position: 'topright',
            drawMarker: true,
            drawCircleMarker: false,
            drawPolyline: true,
            drawRectangle: true,
            drawPolygon: true,
            drawCircle: true,
            editMode: true,
            dragMode: true,
            cutPolygon: false,
            removalMode: true,
        });

        this.map.pm.setGlobalOptions({
            snapDistance: 15,
            allowSelfIntersection: false,
            templineStyle: { color: 'red', dashArray: [5, 5] },
            hintlineStyle: { color: 'red', dashArray: [5, 5] },
            pathOptions: {
                color: '#3388ff',
                fillColor: '#3388ff',
                fillOpacity: 0.2,
                weight: 3
            }
        });

        this.addControls();
        this.setupDrawingEvents();
    }

    addControls() {
        L.control.zoom({ position: 'topleft' }).addTo(this.map);
        L.control.layers(CONFIG.tileLayers, null, { 
            collapsed: true, 
            position: 'topright',
            sortLayers: true
        }).addTo(this.map);
        
        this.addLegend();
        this.addLogo();
        this.addCustomPrintControl();
    }

    addGeoJsonLayer(data, styleFunction, onEachFeatureFunction) {
        return L.geoJson(data, {
            style: styleFunction,
            onEachFeature: onEachFeatureFunction
        }).addTo(this.map);
    }

    // --- LÓGICA DE DIBUJO OPTIMIZADA ---
    setupDrawingEvents() {
        // Se ejecuta una vez al finalizar un dibujo. Ahora es un proceso no bloqueante.
        this.map.on('pm:create', (e) => {
            const layer = e.layer;
            const type = e.layerType;
            
            this.drawCounter++; // Incrementa el contador para un nombre único
            
            // Asigna propiedades a la capa de forma inmediata
            this.setLayerProperties(layer, type);

            // Añade la capa al grupo y habilita su edición
            this.drawnItems.addLayer(layer);
            layer.pm.enable({ allowSelfIntersection: false });

            // Asigna los eventos para edición y popups
            this.setupLayerEvents(layer);
        });
    }

    // NUEVA FUNCIÓN: Asigna propiedades por defecto a una capa recién creada.
    setLayerProperties(layer, type) {
        const shapeName = type.charAt(0).toUpperCase() + type.slice(1);
        const measurement = this.calculateMeasurement(layer, type);

        layer.feature = layer.feature || {};
        layer.feature.properties = {
            name: Dibujo ${this.drawCounter}, // Nombre por defecto
            type: shapeName,
            createdAt: new Date().toISOString(),
            measurement: measurement
        };
        
        // Crea o actualiza el popup con esta nueva información.
        this.updateLayerPopup(layer);
    }
    
    calculateMeasurement(layer, type) {
        let measurement = '';
        try {
            const geojson = layer.toGeoJSON();
            const shapeType = type.toLowerCase();

            if (shapeType.includes('polygon') || shapeType.includes('rectangle')) {
                const area = turf.area(geojson);
                measurement = area >= 10000 ? 
                    Área: ${(area / 10000).toFixed(2)} ha : 
                    Área: ${area.toFixed(2)} m²;
            } 
            else if (shapeType.includes('line') || shapeType.includes('polyline')) {
                const distance = turf.length(geojson, {units: 'meters'});
                measurement = distance >= 1000 ? 
                    Distancia: ${(distance / 1000).toFixed(2)} km : 
                    Distancia: ${Math.round(distance)} m;
            } 
            else if (shapeType.includes('circle')) {
                const radius = layer.getRadius();
                const area = Math.PI * radius * radius;
                measurement = `Radio: ${radius.toFixed(2)} m | Área: ${area >= 10000 ? 
                    (area / 10000).toFixed(2) + ' ha' : area.toFixed(2) + ' m²'}`;
            }
            else if (shapeType.includes('marker')) {
                const latlng = layer.getLatLng();
                measurement = Coordenadas: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)};
            }
        } catch (e) {
            console.error('Error calculando medida con Turf.js:', e);
            measurement = 'Medición no disponible';
        }
        return measurement;
    }
    
    setupLayerEvents(layer) {
        // Actualiza las medidas en el popup al editar la forma.
        layer.on('pm:edit', (e) => {
            const editedLayer = e.layer;
            const shapeType = editedLayer.pm.getShape();
            const measurement = this.calculateMeasurement(editedLayer, shapeType);
            
            if (editedLayer.feature && editedLayer.feature.properties) {
                editedLayer.feature.properties.measurement = measurement;
                this.updateLayerPopup(editedLayer); // Actualiza el popup con las nuevas medidas
            }
        });
        
        layer.on('click', (e) => {
            L.DomEvent.stop(e);
            if (!e.target.isPopupOpen()) {
                e.target.openPopup();
            }
        });
    }
    
    updateLayerPopup(layer) {
        if (!layer.feature || !layer.feature.properties) return;
        const props = layer.feature.properties;
        const popupContent = `
            <div class="feature-popup" style="max-width: 200px;">
                <h4 style="margin: 0 0 5px 0;">${props.name || 'Sin nombre'}</h4>
                <p style="margin: 0;"><strong>Tipo:</strong> ${props.type || 'No especificado'}</p>
                <p style="margin: 5px 0;"><strong>${props.measurement || ''}</strong></p>
                <small>Creado: ${new Date(props.createdAt).toLocaleString()}</small>
            </div>
        `;
        
        if (layer.getPopup()) {
            layer.setPopupContent(popupContent);
        } else {
            layer.bindPopup(popupContent, { offset: L.point(0, -10) });
        }
    }
    
    // --- El resto de las funciones se mantienen igual ---

    addCustomPrintControl() {
        const PrintControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.title = 'Exportar mapa como imagen de alta calidad';
                container.innerHTML = <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="padding: 4px;"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>;
                
                L.DomEvent.on(container, 'click', async () => {
                    const mapNode = document.getElementById(CONFIG.mapId);
                    const loader = document.getElementById('app-loader');
                    
                    if(loader) loader.style.display = 'flex';
                    try {
                        const dataUrl = await htmlToImage.toPng(mapNode, {
                            quality: 1.0,
                            pixelRatio: 2,
                            filter: (node) => {
                                 const exclusionClasses = ['leaflet-control-zoom', 'leaflet-control-layers', 'leaflet-pm-toolbar', 'leaflet-control-custom'];
                                 return !exclusionClasses.some((classname) => node.classList?.contains(classname));
                            }
                        });
                        const link = document.createElement('a');
                        link.download = 'mapa-exportado.png';
                        link.href = dataUrl;
                        link.click();
                    } catch (error) {
                        console.error('Error al exportar el mapa:', error);
                        alert('No se pudo exportar el mapa. Inténtelo de nuevo.');
                    } finally {
                        if(loader) loader.style.display = 'none';
                    }
                });
                return container;
            }
        });
        this.map.addControl(new PrintControl());
    }

    addLegend() {
        const legend = L.control({ position: 'bottomleft' });
        const vulnerabilityMap = CONFIG.vulnerabilityMap;
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = '<h4>Vulnerabilidad</h4>';
            Object.keys(vulnerabilityMap)
                .filter(key => key !== 'default')
                .sort((a, b) => b - a)
                .forEach(grade => {
                    const { color, label } = vulnerabilityMap[grade];
                    div.innerHTML += <i style="background:${color}"></i> ${label} (Nivel ${grade})<br>;
                });
            const defaultEntry = vulnerabilityMap['default'];
            div.innerHTML += <i style="background:${defaultEntry.color}; border: 1px solid #666;"></i> ${defaultEntry.label};
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);
            return div;
        };
        legend.addTo(this.map);
    }
    
    addLogo() {
        const LogoControl = L.Control.extend({
            onAdd: () => {
                const c = L.DomUtil.create('div', 'leaflet-logo-control');
                c.innerHTML = <img src="https://raw.githubusercontent.com/Dchable16/geovisor_vulnerabilidad/main/logos/Logo_SSIG.png" alt="Logo SSIG">;
                L.DomEvent.disableClickPropagation(c);
                return c;
            }
        });
        new LogoControl({ position: 'bottomright' }).addTo(this.map);
    }

    getColor(v) {
        const entry = CONFIG.vulnerabilityMap[String(v)];
        return entry ? entry.color : CONFIG.vulnerabilityMap.default.color;
    }

    fitBounds(bounds) {
        if (bounds) {
            this.map.fitBounds(bounds.pad(0.1));
        }
    }
}

_____

/**
 * @file style.css
 * @description Hoja de estilos mejorada para el Geovisor.
 * Versión 4.0: Solución definitiva para la barra de herramientas de dibujo (alineación y texto).
*/

/* --- 1. IMPORTACIONES Y VARIABLES GLOBALES --- */
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');

:root {
    --header-height: 70px;
    --header-bg: #FFFFFF;
    --panel-width: 340px;
    --panel-bg: rgba(255, 255, 255, 0.9);
    --shadow-color: rgba(0, 0, 0, 0.15);
    --panel-shadow: 0 4px 12px var(--shadow-color);
    --border-radius: 8px;
    --accent-color: #007BFF;
    --accent-hover: #0056b3;
    --font-sans: 'Roboto', sans-serif;
    --text-color: #333;
    --text-light: #666;
    --border-color: #DDE2E6;
    --animation-speed: 0.3s;
    --animation-easing: ease-in-out;
}

/* --- 2. RESET Y ESTILOS BASE --- */
html, body {
    height: 100%;
    margin: 0;
    padding: 0;
    font-family: var(--font-sans);
    overflow: hidden;
    background-color: #F8F9FA;
    color: var(--text-color);
}

* {
    box-sizing: border-box;
}

/* --- 3. LAYOUT PRINCIPAL --- */
body {
    display: flex;
    flex-direction: column;
    position: relative;
}

.main-header {
    flex-shrink: 0;
    height: var(--header-height);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 2.5%;
    background-color: var(--header-bg);
    border-bottom: 1px solid var(--border-color);
    position: relative;
    z-index: 2000; /* Aseguramos que el encabezado esté por encima de todo */
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.logo-container img {
    height: 50px;
    width: auto;
    object-fit: contain;
}

.map-container {
    flex-grow: 1;
    position: relative;
}

#map {
    width: 100%;
    height: 100%;
}

/* --- 4. PANEL DE CONTROLES --- */
.leaflet-custom-controls {
    background: var(--panel-bg);
    backdrop-filter: blur(8px);
    padding: 20px;
    border-radius: 0 var(--border-radius) var(--border-radius) 0;
    box-shadow: var(--panel-shadow);
    width: var(--panel-width);
    transition: transform var(--animation-speed) var(--animation-easing);
    position: absolute;
    left: 0;
    top: 80px; /* Ajuste para que no se solape con el encabezado */
    z-index: 1000; /* Aseguramos que esté por encima de los controles de Leaflet */
    transform: translateX(0);
    max-height: calc(100vh - 100px);
    overflow-y: auto;
}

.leaflet-custom-controls.collapsed {
    transform: translateX(calc(-100% - 15px));
}

.leaflet-open-button {
    background-color: white;
    width: 40px;
    height: 40px;
    font-size: 18px;
    border-radius: 50%;
    box-shadow: var(--panel-shadow);
    transition: all var(--animation-speed) var(--animation-easing);
    opacity: 0;
    pointer-events: none;
    transform: scale(0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
}

.leaflet-open-button.is-visible {
    opacity: 1;
    pointer-events: auto;
    transform: scale(1);
    transition-delay: 0.1s;
}

.leaflet-open-button:hover {
    background-color: var(--accent-color);
    color: white;
}

.panel-close-button {
    position: absolute;
    top: 15px;
    right: 15px;
    width: 30px;
    height: 30px;
    background: transparent;
    color: var(--text-light);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 22px;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: all 0.2s ease;
}
.panel-close-button:hover {
    background-color: #E9ECEF;
    color: var(--text-color);
}

.info-panel {
    background: var(--panel-bg);
    backdrop-filter: blur(8px);
    border-radius: var(--border-radius);
    box-shadow: var(--panel-shadow);
    width: 300px;
    position: absolute;
    top: 90px;
    right: 20px;
    z-index: 1000;
    transform: translateX(calc(100% + 20px));
    opacity: 0;
    transition: transform var(--animation-speed) var(--animation-easing), opacity var(--animation-speed) var(--animation-easing);
}

.info-panel.is-visible {
    transform: translateX(0);
    opacity: 1;
}

.info-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 15px 10px 20px;
    border-bottom: 1px solid var(--border-color);
}

.info-panel h2 {
    margin: 0;
    font-size: 1.2em;
    color: var(--accent-color);
}

.info-panel-close {
    background: transparent;
    border: none;
    color: var(--text-light);
    font-size: 18px;
    cursor: pointer;
    padding: 5px;
    transition: color 0.2s;
}
.info-panel-close:hover {
    color: var(--text-color);
}

#info-panel-content {
    padding: 15px 20px;
    line-height: 1.6;
    max-height: 50vh;
    overflow-y: auto;
}
.info-panel-row {
    margin-bottom: 8px;
}
.info-panel-row strong {
    color: var(--text-color);
    display: block;
    font-size: 0.9em;
}
.info-panel-value {
    color: var(--text-light);
    font-size: 1em;
}

/* --- 5. ELEMENTOS DE UI DENTRO DEL PANEL --- */
.control-section { margin-bottom: 24px; }
.control-section:last-child { margin-bottom: 0; }
.control-section > label {
    display: block;
    font-weight: bold;
    margin-bottom: 10px;
    font-size: 14px;
    color: #495057;
}
.control-section h1 {
    text-align: center;
    color: var(--text-color);
    margin: 0 0 24px 0;
    padding-right: 30px;
    font-size: 1.4em;
    line-height: 1.2;
}
#acuifero-select, #opacity-slider { width: 100%; }
#acuifero-select {
    padding: 10px;
    border-radius: var(--border-radius);
    border: 1px solid var(--border-color);
    font-size: 14px;
    background-color: white;
}
#acuifero-select:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.radio-group { display: flex; flex-wrap: wrap; gap: 8px; }
.radio-group label {
    background-color: #F1F3F5;
    padding: 7px 14px;
    font-size: 13px;
    border: 1px solid transparent;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.radio-group input[type="radio"] { display: none; }
.radio-group input[type="radio"]:checked + label {
    background-color: var(--accent-color);
    color: white;
    font-weight: bold;
}
.radio-group label:hover { border-color: var(--accent-color); }

.layer-toggle { display: flex; justify-content: space-between; align-items: center; }
.switch { position: relative; display: inline-block; width: 44px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #ccc; transition: .4s; border-radius: 24px;
}
.slider:before {
    position: absolute; content: ""; height: 16px; width: 16px; left: 4px; bottom: 4px;
    background-color: white; transition: .4s; border-radius: 50%;
}
input:checked + .slider { background-color: var(--accent-color); }
input:checked + .slider:before { transform: translateX(20px); }

/* --- 6. INDICADOR DE CARGA (SPINNER) --- */
.loader-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    gap: 15px;
    z-index: 9999;
    transition: opacity 0.3s ease;
}
.loader-text {
    font-size: 1.2em;
    font-weight: bold;
    color: var(--accent-color);
    margin: 0;
}
.spinner {
    border: 5px solid #f3f3f3;
    border-top: 5px solid var(--accent-color);
    border-radius: 50%;
    width: 50px;
    height: 50px;
    animation: spin 1s linear infinite;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* --- 7. OTROS CONTROLES DE LEAFLET --- */
/* Ajustes para la leyenda y controles de capas */
.info.legend {
    background: var(--panel-bg);
    backdrop-filter: blur(8px);
    padding: 10px 15px;
    border-radius: var(--border-radius);
    box-shadow: var(--panel-shadow);
    line-height: 1.8;
    color: #333;
    z-index: 800; /* Aseguramos que esté por debajo de los paneles */
}

.info.legend h4 { 
    margin: 0 0 10px; 
    font-size: 16px; 
    text-align: center; 
}

.info.legend i { 
    width: 18px; 
    height: 18px; 
    float: left; 
    margin-right: 8px; 
    opacity: 1; 
    border: 1px solid #999; 
}

/* Controles de capas */
.leaflet-control-layers {
    z-index: 800 !important; /* Aseguramos que esté por debajo de los paneles */
}

/* Logo del mapa */
.leaflet-logo-control {
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    margin: 0 10px 10px 0 !important;
    z-index: 800; /* Aseguramos que esté por debajo de los paneles */
}

.leaflet-logo-control img {
    height: 35px;
    width: auto;
}

/* Ajuste de z-index para los controles superiores */
.leaflet-top.leaflet-right { 
    z-index: 800 !important; 
    margin-top: 60px; /* Ajuste para que no se solape con el encabezado */
}

/* Ajuste para la barra de herramientas de dibujo */
.leaflet-draw {
    z-index: 801 !important; /* Un nivel por encima de los controles pero debajo de los paneles */
}

/* Ajuste para el panel de controles personalizados */
.leaflet-custom-controls {
    z-index: 1000; /* Aseguramos que esté por encima de los controles de Leaflet */
}

/* Ajuste para el panel de información */
.info-panel {
    z-index: 1001; /* Un nivel por encima del panel de controles */
}

/* --- 8. RESPONSIVIDAD --- */
@media (max-width: 768px) {
    :root {
        --header-height: 60px;
        --panel-width: calc(100vw - 40px);
    }
    .logo-container img { height: 40px; }
    .control-section h1 { font-size: 1.2em; }

    .info-panel {
        width: 100%;
        max-height: 45vh;
        top: auto;
        bottom: 0;
        right: 0;
        left: 0;
        border-radius: var(--border-radius) var(--border-radius) 0 0;
        transform: translateY(100%);
    }
    .info-panel.is-visible {
        transform: translateY(0);
    }
    #info-panel-content {
         max-height: 35vh;
    }

    .leaflet-bottom.leaflet-left {
        top: 10px;
        bottom: auto;
        left: auto;
        right: 10px;
        width: auto;
    }
     .info.legend {
        font-size: 12px;
        line-height: 1.6;
        padding: 8px 12px;
    }
    .info.legend h4 { font-size: 14px; }
    .info.legend i { width: 14px; height: 14px; }
}

/* --- 9. Estilos para Popups de Geoman --- */

/* Contenedor principal del popup de las figuras dibujadas */
.feature-popup {
    max-width: 220px;
    font-size: 13px;
    line-height: 1.5;
}

/* Título del popup (ej. "Dibujo 1") */
.feature-popup h4 {
    margin: 0 0 8px 0;
    font-size: 15px;
    color: #333;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
}

/* Párrafos de información (Tipo, Medidas) */
.feature-popup p {
    margin: 4px 0;
}

/* Texto de la fecha de creación */
.feature-popup small {
    color: #777;
    font-style: italic;
}

/* Estilo para el botón de cierre por defecto de Leaflet */
.leaflet-popup-close-button {
    padding: 8px 8px 0 0 !important;
    color: #777 !important;
}
