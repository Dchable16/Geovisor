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

        this.createPanes();
    }

    initializeControls() {
        L.control.zoom({ position: 'topleft' }).addTo(this.map);
        L.control.layers(CONFIG.tileLayers, null, { collapsed: true, position: 'topright' }).addTo(this.map);
        this.addLegend();
        this.addLogo();
    }

    createPanes() {
        this.map.createPane('acuiferosPane');
        this.map.getPane('acuiferosPane').style.zIndex = 450;
        this.map.createPane('costasPane');
        this.map.getPane('costasPane').style.zIndex = 460;
    }

    addGeoJsonLayer(data, styleFunction, onEachFeatureFunction, paneName) {
        return L.geoJson(data, {
            style: styleFunction,
            onEachFeature: onEachFeatureFunction,
            pane: paneName
        }).addTo(this.map);
    }
    
    addLegend() {
        const legend = L.control({ position: 'bottomleft' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            const grades = [1, 2, 3, 4, 5];
            const labels = ['Muy Baja', 'Baja', 'Media', 'Alta', 'Muy Alta'];
            let content = '<h4>Vulnerabilidad</h4>';
            grades.forEach((g, i) => {
                content += `<i style="background:${this.getColor(g)}"></i> ${labels[i]} (Nivel ${g})<br>`;
            });
            div.innerHTML = content;
            return div;
        };
        legend.addTo(this.map);
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

    getColor(v) {
        const value = parseInt(v, 10);
        switch (value) {
            case 5: return '#D90404';
            case 4: return '#F25C05';
            case 3: return '#F2B705';
            case 2: return '#99C140';
            case 1: return '#2DC937';
            default: return '#CCCCCC';
        }
    }

    fitBounds(bounds) {
        if (bounds) {
            this.map.fitBounds(bounds.pad(0.1));
        }
    }
}
