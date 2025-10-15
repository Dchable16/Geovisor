/**
 * @file mapManager.js
 * @description Gestiona la creación y manipulación del mapa Leaflet.
 * Versión 2.2: Cálculo de área preciso y motor de impresión estable.
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
        this.addPrintControl();
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
                polygon: { showArea: true, metric: true },
                polyline: { allowIntersection: false, metric: true },
                rectangle: { metric: true },
                circle: { metric: true },
                marker: true,
                circlemarker: false,
            }
        });

        const addedControl = this.map.addControl(drawControl);
        const controlContainer = addedControl.getContainer().parentNode;
        if (controlContainer) {
            L.DomUtil.removeClass(controlContainer, 'leaflet-left');
            L.DomUtil.addClass(controlContainer, 'leaflet-center');
        }

        const toolbar = document.querySelector('.leaflet-draw-toolbar');
        if (toolbar) {
            L.DomEvent.disableClickPropagation(toolbar);
            L.DomEvent.on(toolbar, 'mousedown', L.DomEvent.stopPropagation);
        }

        this.map.on(L.Draw.Event.CREATED, (e) => {
            const layer = e.layer;
            const type = e.layerType;
            this.drawnItems.addLayer(layer);

            let measurementText = 'Medición no disponible';

            if (layer instanceof L.Polyline) {
                let distance = 0;
                const latlngs = layer.getLatLngs();
                for (let i = 0; i < latlngs.length - 1; i++) {
                    distance += latlngs[i].distanceTo(latlngs[i + 1]);
                }
                measurementText = distance >= 1000 ? (distance / 1000).toFixed(2) + ' km' : Math.round(distance) + ' m';

            } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
                // SOLUCIÓN DEFINITIVA: Usar L.GeometryUtil para un cálculo geodésico preciso.
                // Esta utilidad viene incluida con leaflet.draw.js y funciona correctamente.
                const latlngs = layer.getLatLngs()[0];
                const areaSqM = L.GeometryUtil.geodesicArea(latlngs);

                if (areaSqM >= 1000000) {
                    measurementText = (areaSqM / 1000000).toFixed(3) + ' km²';
                } else if (areaSqM >= 10000) {
                    measurementText = (areaSqM / 10000).toFixed(2) + ' ha';
                } else {
                    measurementText = areaSqM.toFixed(2) + ' m²';
                }

            } else if (layer instanceof L.Circle) {
                const radius = layer.getRadius();
                const areaSqM = Math.PI * radius * radius;
                measurementText = areaSqM >= 1000000 ? (areaSqM / 1000000).toFixed(3) + ' km²' : areaSqM.toFixed(2) + ' m²';

            } else if (layer instanceof L.Marker) {
                measurementText = 'Ubicación agregada';
            }

            const defaultName = `Dibujo de ${type.charAt(0).toUpperCase() + type.slice(1)}`;
            const layerName = prompt(`Ingrese un nombre para su dibujo:\n(Medición: ${measurementText})`, defaultName);

            const finalName = layerName || defaultName;

            const popupContent = `
                <h4>${finalName}</h4>
                <p><strong>Medición:</strong> ${measurementText}</p>
                <p style="font-size: 0.8em; color: #888;">Utilice el botón de Edición (lápiz) para modificar.</p>
            `;

            layer.bindPopup(popupContent, { closeButton: true }).openPopup();
        });
    }

    addPrintControl() {
        // SOLUCIÓN DEFINITIVA: Volver a leaflet-easyprint que es estable.
        // La opción 'exportOnly: true' hace que la descarga de PNG sea directa y lo más rápida posible.
        L.easyPrint({
            title: 'Exportar Mapa como Imagen',
            position: 'bottomright',
            exportOnly: true, // Clave para la rapidez: descarga directa de PNG.
            filename: 'geovisor_exportacion',
            hideControlContainer: true, // Oculta otros botones en la imagen final.
            // El spinner en style.css dará feedback visual inmediato al usuario.
        }).addTo(this.map);
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
