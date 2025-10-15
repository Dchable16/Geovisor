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
                featureGroup: this.drawnItems, // Permite editar los elementos dibujados
                remove: true // Permite eliminar los elementos dibujados
            },
            draw: {
                polyline: {
                    allowIntersection: false,
                    shapeOptions: { color: '#f357a1' },
                    metric: true // Muestra la distancia en kilómetros/metros
                },
                polygon: {
                    allowIntersection: false,
                    showArea: true, // Muestra el área al terminar de dibujar
                    shapeOptions: { color: '#f357a1' },
                    metric: true
                },
                circle: {
                    shapeOptions: { color: '#f357a1' },
                    metric: true
                },
                rectangle: {
                    shapeOptions: { color: '#f357a1' },
                    metric: true
                },
                marker: true,
                circlemarker: false,
            }
        });
        this.map.addControl(drawControl);

        this.map.on(L.Draw.Event.CREATED, (e) => {
            const layer = e.layer;
            this.drawnItems.addLayer(layer);
            
            let measurement = '';
            
            // 1. Determinar y formatear la medición final
            if (layer instanceof L.Polyline) {
                measurement = 'Línea dibujada.'; 

            } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
                // Cálculo de área para Polygon/Rectangle
                const area = L.GeometryUtil.geodesicArea(layer.getLatLngs());
                const formattedArea = L.GeometryUtil.formattedNumber(area / 10000, 2) + ' ha';
                measurement = `Área: ${formattedArea}`;

            } else if (layer instanceof L.Circle) {
                // Cálculo de área para Circle
                const radius = layer.getRadius() / 1000;
                const area = Math.PI * radius * radius;
                const formattedArea = L.GeometryUtil.formattedNumber(area, 2) + ' km²';
                measurement = `Área (aprox): ${formattedArea}`;
                
            } else if (layer instanceof L.Marker) {
                measurement = 'Punto de Interés';
            }
            
            // 2. Crear el contenido del Popup con opción de nombrar
            const defaultName = layer.options.title || measurement;
            const popupContent = `
                <div class="draw-popup">
                    <strong>Tipo:</strong> ${e.layerType}<br>
                    <strong>Medición:</strong> ${measurement}<br><br>
                    <label for="layer-name">Nombre:</label>
                    <input type="text" id="layer-name" value="${defaultName}" style="width: 90%; margin-bottom: 5px;"><br>
                    <button class="save-name-btn" style="background-color: var(--accent-color); color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px;">Guardar Nombre</button>
                </div>
            `;
            
            // 3. Bindear el popup y mostrarlo
            layer.bindPopup(popupContent);
            layer.openPopup();
            
            // 4. Implementar la lógica para guardar el nombre (listener dentro del popup)
            layer.on('popupopen', () => {
                const popupDiv = layer.getPopup().getElement();
                const saveButton = popupDiv.querySelector('.save-name-btn');
                const nameInput = popupDiv.querySelector('#layer-name');
                
                if (saveButton && nameInput) {
                    // Prevenir la propagación del clic dentro del popup para evitar errores
                    L.DomEvent.disableClickPropagation(popupDiv); 
                    
                    saveButton.onclick = () => {
                        const newName = nameInput.value || measurement;
                        
                        // Guardar el nuevo nombre como una opción de la capa
                        layer.options.title = newName; 
                        
                        // Opcional: Actualizar el tooltip (etiqueta persistente)
                        if (layer.getTooltip()) {
                            layer.setTooltipContent(newName);
                        } else {
                            layer.bindTooltip(newName, { permanent: true, direction: 'right', opacity: 0.9 }).openTooltip();
                        }
                        
                        layer.closePopup();
                    };
                }
            });
            
            // 5. Mostrar la etiqueta persistente por defecto
            layer.bindTooltip(defaultName, { permanent: true, direction: 'right', opacity: 0.9 }).openTooltip();
        });
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
