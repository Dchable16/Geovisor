/**
 * @file mapManager.js
 * @description Gestiona la creación y manipulación del mapa Leaflet con Geoman.
 * Versión 7.2: Corrección del evento 'layeradd' para evitar errores con capas no editables.
 */

import { CONFIG } from './config.js';

export class MapManager {
    constructor(mapId) {
        this.map = L.map(mapId, {
            center: CONFIG.initialCoords,
            zoom: CONFIG.initialZoom,
            layers: [CONFIG.tileLayers["Neutral (defecto)"]],
            zoomControl: false,
            preferCanvas: true,
            pmIgnore: false // Importante para Geoman
        });

        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);
        
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

    setupDrawingEvents() {
        this.map.on('pm:create', (e) => {
            const layer = e.layer;
            const type = e.layerType;
            
            this.drawnItems.addLayer(layer);
            
            const measurement = this.calculateMeasurement(layer, type);
            this.promptForLayerName(layer, type, measurement);
            this.setupLayerEvents(layer);
        });
        
        // --- CÓDIGO CORREGIDO ---
        // Este evento ahora verifica de forma segura si una capa es editable
        // y si está en nuestro grupo de capas dibujadas antes de actuar.
        this.map.on('layeradd', (e) => {
            if (e.layer.pm && this.drawnItems.hasLayer(e.layer)) {
                // Habilita la edición solo si la capa tiene las herramientas de Geoman
                // y está en el grupo de elementos que hemos dibujado.
                e.layer.pm.enable({
                    allowSelfIntersection: false,
                });
            }
        });
    }
    
    calculateMeasurement(layer, type) {
        let measurement = '';
        try {
            const geojson = layer.toGeoJSON();
            const shapeType = type.toLowerCase();

            if (shapeType.includes('polygon') || shapeType.includes('rectangle')) {
                const area = turf.area(geojson);
                measurement = area >= 10000 ? 
                    `Área: ${(area / 10000).toFixed(2)} ha` : 
                    `Área: ${area.toFixed(2)} m²`;
            } 
            else if (shapeType.includes('line') || shapeType.includes('polyline')) {
                const distance = turf.length(geojson, {units: 'meters'});
                measurement = distance >= 1000 ? 
                    `Distancia: ${(distance / 1000).toFixed(2)} km` : 
                    `Distancia: ${Math.round(distance)} m`;
            } 
            else if (shapeType.includes('circle')) {
                const radius = layer.getRadius();
                const area = Math.PI * radius * radius;
                measurement = `Radio: ${radius.toFixed(2)} m | Área: ${area >= 10000 ? 
                    (area / 10000).toFixed(2) + ' ha' : area.toFixed(2) + ' m²'}`;
            }
            else if (shapeType.includes('marker')) {
                const latlng = layer.getLatLng();
                measurement = `Coordenadas: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
            }
        } catch (e) {
            console.error('Error calculando medida con Turf.js:', e);
            measurement = 'Medición no disponible';
        }
        return measurement;
    }
    
    promptForLayerName(layer, type, measurement) {
        const shapeName = type.charAt(0).toUpperCase() + type.slice(1);
        const defaultName = `${shapeName} ${new Date().toLocaleTimeString()}`;
        const name = prompt(`Ingrese un nombre para este ${shapeName.toLowerCase()}:\n${measurement}`, defaultName) || defaultName;
        
        layer.feature = layer.feature || {};
        layer.feature.properties = {
            name: name,
            type: shapeName,
            createdAt: new Date().toISOString(),
            measurement: measurement
        };
        
        this.updateLayerPopup(layer);
    }
    
    setupLayerEvents(layer) {
        layer.on('pm:edit', (e) => {
            const type = e.layer.pm.getShape();
            const measurement = this.calculateMeasurement(e.layer, type);
            if (e.layer.feature && e.layer.feature.properties) {
                e.layer.feature.properties.measurement = measurement;
            }
            this.updateLayerPopup(e.layer);
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
    
    addCustomPrintControl() {
        const PrintControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.style.backgroundColor = 'white';
                container.style.width = '30px';
                container.style.height = '30px';
                container.style.cursor = 'pointer';
                container.title = 'Exportar mapa como imagen de alta calidad';
                container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="padding: 4px;"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`;
                
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
            const sortedGrades = Object.keys(vulnerabilityMap)
                .filter(key => key !== 'default')
                .sort((a, b) => b - a);
            sortedGrades.forEach(grade => {
                const { color, label } = vulnerabilityMap[grade];
                div.innerHTML += `<i style="background:${color}"></i> ${label} (Nivel ${grade})<br>`;
            });
            const defaultEntry = vulnerabilityMap['default'];
            div.innerHTML += `<i style="background:${defaultEntry.color}; border: 1px solid #666;"></i> ${defaultEntry.label}`;
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
                c.innerHTML = `<img src="https://raw.githubusercontent.com/Dchable16/geovisor_vulnerabilidad/main/logos/Logo_SSIG.png" alt="Logo SSIG">`;
                L.DomEvent.disableClickPropagation(c);
                return c;
            }
        });
        new LogoControl({ position: 'bottomright' }).addTo(this.map);
    }

    getColor(v) {
        const value = String(v);
        const entry = CONFIG.vulnerabilityMap[value];
        return entry ? entry.color : CONFIG.vulnerabilityMap.default.color;
    }

    fitBounds(bounds) {
        if (bounds) {
            this.map.fitBounds(bounds.pad(0.1));
        }
    }
}
