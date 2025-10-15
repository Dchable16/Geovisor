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
        this.addPrintControl();
        const drawContainer = document.querySelector('.leaflet-draw');
    }

    addGeoJsonLayer(data, styleFunction, onEachFeatureFunction) {
        return L.geoJson(data, {
            style: styleFunction,
            onEachFeature: onEachFeatureFunction
        }).addTo(this.map);
    }
    
    _calculateProjectedPolygonArea(latlngs) {
        if (!latlngs || latlngs.length < 3) {
            return 0;
        }

        let area = 0;
        const projectedPoints = latlngs.map(latlng => L.CRS.EPSG3857.project(latlng));

        for (let i = 0, j = projectedPoints.length - 1; i < projectedPoints.length; j = i++) {
            const p1 = projectedPoints[i];
            const p2 = projectedPoints[j];
            area += p1.x * p2.y - p2.x * p1.y;
        }

        return Math.abs(area / 2);
    }

    addDrawControl() {
        const drawControl = new L.Control.Draw({
            position: 'topleft',
            edit: {
                featureGroup: this.drawnItems, 
                remove: true 
            },
            draw: {
                polyline: { allowIntersection: false, metric: true },
                polygon: { showArea: true, metric: true },
                circle: { metric: true },
                rectangle: { metric: true },
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
        
        this.map.addControl(drawControl);
        
        const toolbar = document.querySelector('.leaflet-draw-toolbar');
        if (toolbar) {
            L.DomEvent.disableClickPropagation(toolbar);
            L.DomEvent.on(toolbar, 'mousedown', L.DomEvent.stopPropagation);
            L.DomEvent.on(toolbar, 'mousedown', L.DomEvent.preventDefault);
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
                    distance += latlngs[i].distanceTo(latlngs[i+1]); 
                }
                
                if (distance >= 1000) {
                    measurementText = (distance / 1000).toFixed(2) + ' km';
                } else {
                    measurementText = Math.round(distance) + ' m';
                }

            } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
                // CORRECCIÓN: Usar el cálculo de área preciso
                const latlngs = layer.getLatLngs()[0]; // Usamos el anillo exterior
                const areaSqM = this._calculateProjectedPolygonArea(latlngs);

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
                measurementText = (areaSqM / 1000000).toFixed(3) + ' km² (Radio)';
                
            } else if (layer instanceof L.Marker) {
                measurementText = 'Ubicación agregada';
            }

            const defaultName = `Dibujo de ${type.charAt(0).toUpperCase() + type.slice(1)}`;
            const layerName = prompt(`Ingrese un nombre para su dibujo:\n(Medición: ${measurementText})`, defaultName);
            
            const finalName = layerName || defaultName;

            const popupContent = `
                <h4>${finalName}</h4>
                <p><strong>Medición:</strong> ${measurementText}</p>
                <p style="font-size: 0.8em; color: #888;">Utilice el botón de Edición (lápiz) para modificar la geometría.</p>
            `;

            layer.bindPopup(popupContent, { closeButton: true });
            layer.openPopup(); 
            
            layer.on('click', (ev) => {
                if (!layer.isPopupOpen()) {
                    layer.openPopup(ev.latlng);
                }
            });
        });
    }

    addPrintControl() {
        // MEJORA: Optimizado para ser más rápido y robusto
        L.easyPrint({
            title: 'Exportar Mapa como Imagen',
            position: 'bottomright',
            exportOnly: true, // Clave para la rapidez: descarga directa de PNG
            filename: 'geovisor_exportacion',
            hideControlContainer: true, // Oculta otros botones en la imagen final
            sizeModes: ['Current', 'A4Landscape', 'A4Portrait'], 
            defaultSize: 'Current'
        }).addTo(this.map);
    }

    addLegend() {
        const legend = L.control({ position: 'bottomleft' });
        const vulnerabilityMap = CONFIG.vulnerabilityMap; // Obtener el mapa centralizado
        
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = '<h4>Vulnerabilidad</h4>';

            // Obtener y ordenar los grados de mayor a menor (5 a 1) para la leyenda
            const sortedGrades = Object.keys(vulnerabilityMap)
                                       .filter(key => key !== 'default') 
                                       .sort((a, b) => b - a); 

            sortedGrades.forEach(grade => {
                const { color, label } = vulnerabilityMap[grade];

                div.innerHTML +=
                    `<i style="background:${color}"></i> ${label} (Nivel ${grade})<br>`;
            });

            // Añadir el valor por defecto/sin datos
            const defaultEntry = vulnerabilityMap['default'];
            div.innerHTML += `<i style="background:${defaultEntry.color}; border: 1px solid #666;"></i> ${defaultEntry.label}`;

            // Mejoras de UX: Evitar que los clics o el scroll afecten al mapa
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
