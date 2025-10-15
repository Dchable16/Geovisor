/**
 * @file mapManager.js
 * @description Gestiona la creación y manipulación del mapa Leaflet.
 */
import { CONFIG } from './config.js';

export class MapManager {
    constructor(mapId) {
        this.map = L.map(mapId, {
            center: CONFIG.initialCoords,
            zoom: CONFIG.initialZoom,
            layers: [CONFIG.tileLayers["Neutral (defecto)"]],
            zoomControl: false
        });
        this.drawnItems = new L.FeatureGroup(); 
        this.map.addLayer(this.drawnItems);
        this.addControls();
    }

    addControls() {
        L.control.zoom({ position: 'topleft' }).addTo(this.map);
        L.control.layers(CONFIG.tileLayers, null, { collapsed: true, position: 'topright' }).addTo(this.map);
        this.addLegend();
        this.addLogo();
        this.addDrawControl();
    }

    addGeoJsonLayer(data, styleFunction, onEachFeatureFunction) {
        return L.geoJson(data, {
            style: styleFunction,
            onEachFeature: onEachFeatureFunction
        }).addTo(this.map);
    }

    addDrawControl() {
        const drawControl = new L.Control.Draw({
            position: 'topleft',
            edit: {
                featureGroup: this.drawnItems, 
                remove: true 
            },
            draw: {
                // Configuración mínima para que muestre mediciones simples
                polyline: { allowIntersection: false, metric: true },
                polygon: { showArea: true, metric: true },
                circle: { metric: true },
                rectangle: { metric: true },
                marker: true,
                circlemarker: false,
            }
        });
        this.map.addControl(drawControl);
        const toolbar = document.querySelector('.leaflet-draw-toolbar');
        if (toolbar) {
            L.DomEvent.disableClickPropagation(toolbar);
            L.DomEvent.on(toolbar, 'mousedown', L.DomEvent.stopPropagation);
            L.DomEvent.on(toolbar, 'mousedown', L.DomEvent.preventDefault);
        }
        this.map.on(L.Draw.Event.CREATED, (e) => {
            this.drawnItems.addLayer(e.layer);
        });
    }
    
    addLogo() {
        const LogoControl = L.Control.extend({
            onAdd: map => {
                const c = L.DomUtil.create('div', 'leaflet-logo-control');
                c.innerHTML = `<img src="https://raw.githubusercontent.com/Dchable16/geovisor_vulnerabilidad/main/logos/Logo_SSIG.png" alt="Logo SSIG">`;
                L.DomEvent.disableClickPropagation(c);
                return c;
            }
        });
        new LogoControl({ position: 'bottomright' }).addTo(this.map);
    }

    /**
     * Obtiene el color de simbología usando el mapa centralizado de CONFIG.
     * @param {string|number} v - El valor de vulnerabilidad (1-5).
     * @returns {string} El código de color HTML.
     */
    getColor(v) {
        const value = String(v); // Asegurar que es string para la clave del mapa
        const entry = CONFIG.vulnerabilityMap[value];
        
        if (entry) {
            return entry.color;
        }
        
        return CONFIG.vulnerabilityMap.default.color;
    }

    fitBounds(bounds) {
        if (bounds) {
            this.map.fitBounds(bounds.pad(0.1));
        }
    }
}
