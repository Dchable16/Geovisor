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
            minZoom: 5,
            layers: [CONFIG.tileLayers["Neutral (defecto)"]],
            zoomControl: false,
            preferCanvas: true
        });
        this.tempMarker = null;
        this.addControls();
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
        L.control.scale({ position: 'bottomright', imperial: false }).addTo(this.map); // La escala se añade después (queda encima del logo)
        this.addCustomPrintControl();
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
                                 const exclusionClasses = [
                                    'leaflet-control-zoom',       // Botones de Zoom
                                    'leaflet-control-layers',     // Selector de capas
                                    'leaflet-pm-toolbar',         // (No se usa, pero por si acaso)
                                    'leaflet-control-custom',     // El mismo botón de imprimir
                                    'leaflet-custom-controls',    // <-- AÑADIDO: El panel deslizable
                                    'leaflet-open-button'         // <-- AÑADIDO: El botón (☰) para abrir el panel
                                ];
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
        const entry = CONFIG.vulnerabilityMap[String(v)];
        return entry ? entry.color : CONFIG.vulnerabilityMap.default.color;
    }

    fitBounds(bounds) {
        if (bounds) {
            this.map.fitBounds(bounds.pad(0.1));
        }
    }
    
    flyToCoords(lat, lon, name) {
        // 1. Limpiar marcador anterior si existe
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }

        // 2. Crear nuevas coordenadas
        const latLng = L.latLng(lat, lon);

        // 3. Crear el contenido del Popup
        let popupContent;
        if (name) {
            // Si el usuario escribió un nombre
            popupContent = `<b>${name}</b><br>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`;
        } else {
            // Si el campo de nombre estaba vacío
            popupContent = `<b>Coordenadas</b><br>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`;
        }

        // 4. Crear marcador, añadir popup y abrirlo
        this.tempMarker = L.marker(latLng)
            .addTo(this.map)
            .bindPopup(popupContent) // <-- Añade el popup
            .openPopup();            // <-- Abre el popup automáticamente

        // 5. Volar a la ubicación
        this.map.flyTo(latLng, 13);
    }
    
    resetView() {
        this.map.setView(CONFIG.initialCoords, CONFIG.initialZoom);
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }
    }
}
