/**
 * @file mapManager.js
 * @description Gestiona la creación y manipulación del mapa Leaflet con Geoman.
 * @version 10.0: Corregida la lentitud y el error al finalizar dibujos (doble clic).
 * La lógica de eventos se ha optimizado para un rendimiento fluido y predecible.
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
        this.drawCounter = 0;

        this.initializeGeoman();
        this.addControls();
        this.setupDrawingEvents();
    }

    // Encapsula toda la configuración de Geoman
    initializeGeoman() {
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

    // --- LÓGICA DE DIBUJO CORREGIDA Y OPTIMIZADA ---
    setupDrawingEvents() {
        // Se dispara cuando se inicia el modo de dibujo
        this.map.on('pm:drawstart', (e) => {
            // Deshabilitamos temporalmente los popups del mapa para evitar interferencias
            this.map.eachLayer(layer => {
                if (layer.getPopup()) {
                    layer.unbindPopup();
                }
            });
        });
        
        // Se dispara una vez que el dibujo se ha completado correctamente
        this.map.on('pm:create', (e) => {
            const layer = e.layer;
            const type = e.layerType;

            this.drawCounter++;
            
            this.setLayerProperties(layer, type);
            this.drawnItems.addLayer(layer);
            
            // Habilitar edición y asignar eventos a la nueva capa
            layer.pm.enable({ allowSelfIntersection: false });
            this.setupLayerEvents(layer);

            // Reactivamos los popups en todas las capas
            this.rebindAllPopups();
        });

        // Se dispara si se cancela el dibujo
        this.map.on('pm:drawend', (e) => {
            this.rebindAllPopups();
        });
    }

    rebindAllPopups() {
        this.drawnItems.eachLayer(layer => this.updateLayerPopup(layer));
        // Si tienes otras capas con popups, también deberías reactivarlas aquí
    }

    setLayerProperties(layer, type) {
        const shapeName = type.charAt(0).toUpperCase() + type.slice(1);
        const measurement = this.calculateMeasurement(layer, type);

        layer.feature = layer.feature || {};
        layer.feature.properties = {
            name: `Dibujo ${this.drawCounter}`,
            type: shapeName,
            createdAt: new Date().toISOString(),
            measurement: measurement
        };
        
        this.updateLayerPopup(layer);
    }
    
    calculateMeasurement(layer, type) {
        let measurement = '';
        try {
            const geojson = layer.toGeoJSON();
            const shapeType = type.toLowerCase();

            if (shapeType.includes('polygon') || shapeType.includes('rectangle')) {
                const area = turf.area(geojson);
                measurement = area >= 10000 ? `Área: ${(area / 10000).toFixed(2)} ha` : `Área: ${area.toFixed(2)} m²`;
            } 
            else if (shapeType.includes('line') || shapeType.includes('polyline')) {
                const distance = turf.length(geojson, {units: 'meters'});
                measurement = distance >= 1000 ? `Distancia: ${(distance / 1000).toFixed(2)} km` : `Distancia: ${Math.round(distance)} m`;
            } 
            else if (shapeType.includes('circle')) {
                const radius = layer.getRadius();
                const area = Math.PI * Math.pow(radius, 2);
                measurement = `Radio: ${radius.toFixed(2)} m | Área: ${(area >= 10000 ? (area / 10000).toFixed(2) + ' ha' : area.toFixed(2) + ' m²')}`;
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
    
    setupLayerEvents(layer) {
        layer.on('pm:edit', (e) => {
            const editedLayer = e.layer;
            const shapeType = editedLayer.pm.getShape();
            const measurement = this.calculateMeasurement(editedLayer, shapeType);
            
            if (editedLayer.feature && editedLayer.feature.properties) {
                editedLayer.feature.properties.measurement = measurement;
                this.updateLayerPopup(editedLayer);
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
            <div class="feature-popup">
                <h4>${props.name || 'Sin nombre'}</h4>
                <p><strong>Tipo:</strong> ${props.type || 'No especificado'}</p>
                <p><strong>${props.measurement || ''}</strong></p>
                <small>Creado: ${new Date(props.createdAt).toLocaleString()}</small>
            </div>
        `;
        
        // Unbind para evitar popups duplicados y luego bind de nuevo
        layer.unbindPopup().bindPopup(popupContent, { offset: L.point(0, -10), closeButton: false });
    }
    
    addCustomPrintControl() {
        const PrintControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.title = 'Exportar mapa como imagen de alta calidad';
                container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`;
                
                L.DomEvent.on(container, 'click', async () => {
                    const mapNode = document.getElementById(CONFIG.mapId);
                    const loader = document.getElementById('app-loader');
                    
                    if(loader) loader.style.display = 'flex';
                    try {
                        const dataUrl = await htmlToImage.toPng(mapNode, {
                            quality: 1.0,
                            pixelRatio: 2,
                            filter: (node) => !['leaflet-control-zoom', 'leaflet-control-layers', 'leaflet-pm-toolbar', 'leaflet-control-custom'].some(c => node.classList?.contains(c))
                        });
                        const link = document.createElement('a');
                        link.download = 'mapa-exportado.png';
                        link.href = dataUrl;
                        link.click();
                    } catch (error) {
                        console.error('Error al exportar el mapa:', error);
                        alert('No se pudo exportar el mapa.');
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
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            const vulnerabilityMap = CONFIG.vulnerabilityMap;
            div.innerHTML = '<h4>Vulnerabilidad</h4>';
            Object.keys(vulnerabilityMap).filter(k => k !== 'default').sort((a, b) => b - a).forEach(grade => {
                const { color, label } = vulnerabilityMap[grade];
                div.innerHTML += `<span><i style="background:${color}"></i> ${label} (Nivel ${grade})</span>`;
            });
            const { color, label } = vulnerabilityMap['default'];
            div.innerHTML += `<span><i style="background:${color}; border: 1px solid #666;"></i> ${label}</span>`;
            L.DomEvent.disableClickPropagation(div);
            return div;
        };
        legend.addTo(this.map);
    }
    
    addLogo() {
        const LogoControl = L.Control.extend({
            onAdd: () => {
                const c = L.DomUtil.create('div', 'leaflet-logo-control');
                c.innerHTML = `<img src="https://raw.githubusercontent.com/Dchable16/geovisor_vulnerabilidad/main/logos/Logo_SSIG.png" alt="Logo SSIG">`;
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
        if (bounds) this.map.fitBounds(bounds.pad(0.1));
    }
}
