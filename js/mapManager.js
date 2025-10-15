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
                polyline: {
                    allowIntersection: false,
                    shapeOptions: { color: '#f357a1' },
                    metric: true 
                },
                polygon: {
                    allowIntersection: false,
                    showArea: true, 
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

        // MANEJADOR PRINCIPAL: Evento para manejar el dibujo y persistencia
        this.map.on(L.Draw.Event.CREATED, (e) => {
            const layer = e.layer;
            const type = e.layerType;
            this.drawnItems.addLayer(layer);
            
            // 1. Inicializar propiedades y calcular medición
            let measurementHtml = '';
            let measurementValue = '';
            let defaultName = `Dibujo ${type.charAt(0).toUpperCase() + type.slice(1)}`;

            if (layer instanceof L.Polyline) {
                // CORRECCIÓN: Usar L.GeometryUtil.geodesicLength
                const distance = L.GeometryUtil.geodesicLength(layer.getLatLngs());
                const formattedDistance = L.GeometryUtil.readableDistance(distance, null, true); 
                measurementValue = formattedDistance;
                measurementHtml = `<strong>Distancia:</strong> ${formattedDistance}<br>`;

            } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle || layer instanceof L.Circle) {
                // Cálculo de área
                const area = L.GeometryUtil.geodesicArea(layer.getLatLngs ? layer.getLatLngs() : L.GeometryUtil.polygonToLatLngs(layer));
                const formattedArea = L.GeometryUtil.readableArea(area, true, true);
                measurementValue = formattedArea;
                measurementHtml = `<strong>Área:</strong> ${formattedArea}<br>`;
            } else if (layer instanceof L.Marker) {
                measurementValue = 'Punto de Interés';
                measurementHtml = `<strong>Tipo:</strong> ${measurementValue}<br>`;
            }
            
            // Guardar datos persistentemente en la capa
            layer.properties = {
                name: defaultName, 
                measurement: measurementValue,
                type: type
            };
            
            // 2. Definir el contenido del Popup de EDICIÓN (Aparece inmediatamente después de dibujar)
            const popupEditContent = `
                <div class="draw-popup">
                    <h4>Guardar Medición</h4>
                    ${measurementHtml}
                    <label for="layer-name-${layer._leaflet_id}"><strong>Nombre:</strong></label>
                    <input type="text" id="layer-name-${layer._leaflet_id}" value="${layer.properties.name}" style="width: 90%; margin-bottom: 5px;"><br>
                    <button class="save-name-btn" style="background-color: var(--accent-color); color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px;">Guardar</button>
                </div>
            `;
            
            // 3. Definir el contenido del Popup PERSISTENTE (Aparecerá al hacer clic)
            const getPersistentContent = (name, measurement) => `
                <div class="info-popup">
                    <h4>${name}</h4>
                    ${measurementHtml}
                    <hr style="border-top: 1px solid #ddd; margin: 5px 0;">
                    <span style="font-size: 0.8em; color: #888;">Clic en Editar (✏️) para modificar o borrar.</span>
                </div>
            `;
            
            // 4. Bindear y abrir el popup de EDICIÓN (Inicial)
            layer.bindPopup(popupEditContent, { 
                closeButton: true,
                autoClose: false, 
                closeOnClick: false 
            });
            layer.openPopup();
            
            // 5. Asignar el listener para guardar el nombre y reconfigurar el popup
            layer.on('popupopen', () => {
                const popupDiv = layer.getPopup().getElement();
                const saveButton = popupDiv.querySelector('.save-name-btn');
                const nameInput = popupDiv.querySelector(`#layer-name-${layer._leaflet_id}`);
                
                if (saveButton && nameInput) {
                    L.DomEvent.disableClickPropagation(popupDiv);
                    L.DomEvent.on(saveButton, 'click', () => {
                        // CRÍTICO: Guardar el nuevo nombre en las propiedades persistentes
                        layer.properties.name = nameInput.value || layer.properties.name;
                        
                        // Reconfigurar el popup con el contenido PERSISTENTE
                        const finalContent = getPersistentContent(layer.properties.name, layer.properties.measurement);
                        layer.bindPopup(finalContent, { closeButton: true, autoClose: true, closeOnClick: true });
                        
                        layer.closePopup(); 
                    });
                }
            });
            
            // 6. Asignar el evento CLICK que abrirá el Popup PERSISTENTE (UX Requerida)
            // Ya que el popup se rebindea en el evento 'popupopen' de edición,
            // al cerrar el popup de edición, el siguiente clic abrirá el popup persistente.
            layer.on('click', () => {
                // Si el popup de edición está abierto, no hacer nada (se maneja en el paso 5)
                if (!layer.isPopupOpen()) {
                    layer.openPopup();
                }
            });

            // 7. Abrir el popup de edición automáticamente al terminar de dibujar (Paso 4)
            layer.openPopup(); 
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
