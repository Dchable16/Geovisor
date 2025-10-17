/**
 * @file mapManager.js
 * @description Gestiona la creación y manipulación del mapa Leaflet con Geoman.
 * @version 15.0: Corrección final y validada del error de sintaxis en la función addLegend.
 * El código ha sido limpiado para garantizar una ejecución sin errores.
 */

import { CONFIG } from './config.js';

export class MapManager {
    constructor(mapId) {
        // Crea las instancias de las capas de teselas a partir de la configuración
        this.tileLayers = {};
        for (const key in CONFIG.tileLayers) {
            const { url, options } = CONFIG.tileLayers[key];
            this.tileLayers[key] = L.tileLayer(url, options);
        }

        this.map = L.map(mapId, {
            center: CONFIG.initialCoords,
            zoom: CONFIG.initialZoom,
            zoomControl: false,
            preferCanvas: true,
            layers: [this.tileLayers["Neutral (defecto)"]]
        });

        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);
        this.drawCounter = 0;

        this.initializeGeoman();
        this.addMapControls();
        this.setupDrawingEvents();
    }

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

    addMapControls() {
        L.control.zoom({ position: 'topleft' }).addTo(this.map);
        L.control.layers(this.tileLayers, null, {
            collapsed: true,
            position: 'topright'
        }).addTo(this.map);
        
        this.addLegend();
        this.addLogo();
        this.addCustomPrintControl();
    }

    setupDrawingEvents() {
        this.map.on('pm:create', (e) => {
            const { layer, shape } = e;
            this.drawCounter++;
            
            this.drawnItems.addLayer(layer);
            this.setLayerInfo(layer, shape);

            layer.pm.enable({ allowSelfIntersection: false });
            this.addLayerEvents(layer);
        });
    }

    addLayerEvents(layer) {
        layer.on('pm:edit', (e) => this.setLayerInfo(e.layer, e.shape));
        layer.on('click', (e) => {
            L.DomEvent.stop(e);
            if (e.target.getPopup() && !e.target.isPopupOpen()) {
                e.target.openPopup();
            }
        });
    }

    setLayerInfo(layer, shape) {
        const measurement = this.calculateMeasurement(layer, shape);
        
        layer.feature = layer.feature || {};
        layer.feature.properties = layer.feature.properties || {};

        if (!layer.feature.properties.name) {
             layer.feature.properties.name = `Dibujo ${this.drawCounter}`;
        }
        
        layer.feature.properties.type = shape;
        layer.feature.properties.createdAt = layer.feature.properties.createdAt || new Date().toISOString();
        layer.feature.properties.measurement = measurement;
        
        const popupContent = `
            <div class="feature-popup">
                <h4>${layer.feature.properties.name}</h4>
                <p><strong>Tipo:</strong> ${shape}</p>
                <p><strong>${measurement}</strong></p>
                <small>Creado: ${new Date(layer.feature.properties.createdAt).toLocaleString()}</small>
            </div>`;
            
        layer.bindPopup(popupContent).openPopup();
    }

    calculateMeasurement(layer, shape) {
        let measurement = 'Medida no disponible';
        try {
            const geojson = layer.toGeoJSON();
            switch (shape) {
                case 'Polygon':
                case 'Rectangle':
                case 'Circle':
                    const area = turf.area(geojson);
                    measurement = area >= 10000 ? `Área: ${(area / 10000).toFixed(2)} ha` : `Área: ${area.toFixed(2)} m²`;
                    break;
                case 'Line':
                case 'Polyline':
                    const distance = turf.length(geojson, { units: 'meters' });
                    measurement = distance >= 1000 ? `Distancia: ${(distance / 1000).toFixed(2)} km` : `Distancia: ${Math.round(distance)} m`;
                    break;
                case 'Marker':
                    const latlng = layer.getLatLng();
                    measurement = `Coords: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
                    break;
            }
        } catch (e) {
            console.error('Error calculando medida:', e);
        }
        return measurement;
    }

    addGeoJsonLayer(data, styleFunction, onEachFeatureFunction) {
        return L.geoJson(data, {
            style: styleFunction,
            onEachFeature: onEachFeatureFunction
        }).addTo(this.map);
    }
    
    addCustomPrintControl() {
        const PrintControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.title = 'Exportar mapa como imagen de alta calidad';
                container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`;
                L.DomEvent.on(container, 'click', async () => {
                    document.getElementById('app-loader')?.style.display = 'flex';
                    try {
                        const dataUrl = await htmlToImage.toPng(document.getElementById(CONFIG.mapId), {
                            quality: 1.0, pixelRatio: 2,
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
                        document.getElementById('app-loader')?.style.display = 'none';
                    }
                });
                return container;
            }
        });
        this.map.addControl(new PrintControl());
    }

    // --- FUNCIÓN CORREGIDA ---
    addLegend() {
        const legend = L.control({ position: 'bottomleft' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            let content = '<h4>Vulnerabilidad</h4>'; // Inicia el contenido con el título
            
            // Construye el HTML de la leyenda de forma segura
            Object.keys(CONFIG.vulnerabilityMap)
                .filter(key => key !== 'default')
                .sort((a, b) => b - a)
                .forEach(grade => {
                    const { color, label } = CONFIG.vulnerabilityMap[grade];
                    // Se usan tildes invertidas (template literals) para construir la cadena de texto
                    content += `<div><i style="background:${color}"></i> ${label} (Nivel ${grade})</div>`;
                });

            const { color, label } = CONFIG.vulnerabilityMap['default'];
            content += `<div><i style="background:${color}; border: 1px solid #666;"></i> ${label}</div>`;
            
            // Asigna el contenido completo de una sola vez
            div.innerHTML = content;
            
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
        return CONFIG.vulnerabilityMap[String(v)]?.color || CONFIG.vulnerabilityMap.default.color;
    }

    fitBounds(bounds) {
        if (bounds) this.map.fitBounds(bounds.pad(0.1));
    }
}
