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
            minZoom: 4, // Límite de zoom para evitar repetición del mapa
            layers: [CONFIG.tileLayers["Neutral (defecto)"]],
            zoomControl: false,
            preferCanvas: true
        });

        // Marcadores temporales
        this.tempMarker = null;  // Para "Ir a Coordenadas"
        this.clickMarker = null; // Para el clic en polígono (si se implementa)
        
        // Capa de mallado (graticule)
        this.graticuleLayer = null;

        this.addControls();
    }

    addControls() {
        // Controles estándar de Leaflet
        L.control.zoom({ position: 'topleft' }).addTo(this.map);
        L.control.layers(CONFIG.tileLayers, null, {
            collapsed: true,
            position: 'topright',
            sortLayers: true
        }).addTo(this.map);

        // Controles personalizados
        this.addLegend(); // Leyenda (bottomleft)
        this.addLogo();   // Logo SSIG (bottomright, se añade primero)
        
        // Escala (bottomright, encima del logo)
        L.control.scale({ position: 'bottomright', imperial: false }).addTo(this.map);
        
        // Botón de Impresión (bottomright, encima de la escala)
        this.addCustomPrintControl();

        // Mallado (Graticule)
        this.graticuleLayer = L.simpleGraticule({
            interval: 2,
            showOriginLabel: true,
            redraw: 'moveend',
            zoomIntervals: [
                {start: 0, end: 4, interval: 10},
                {start: 5, end: 7, interval: 5},
                {start: 8, end: 10, interval: 2},
                {start: 11, end: 20, interval: 1}
            ],
            lineStyle: {
                color: '#666',
                weight: 0.5,
                opacity: 0.7
            }
        }).addTo(this.map);
    }

    /**
     * Añade una capa GeoJSON al mapa.
     */
    addGeoJsonLayer(data, styleFunction, onEachFeatureFunction) {
        return L.geoJson(data, {
            style: styleFunction,
            onEachFeature: onEachFeatureFunction
        }).addTo(this.map);
    }

    /**
     * Añade el control personalizado de impresión (exportar a PNG).
     */
    addCustomPrintControl() {
        const PrintControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.title = 'Exportar mapa como imagen de alta calidad';
                // Icono SVG y tamaño ajustado en style.css
                container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="padding: 4px;"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`;

                L.DomEvent.on(container, 'click', async () => {
                    const mapNode = document.getElementById(CONFIG.mapId);
                    const loader = document.getElementById('app-loader');

                    if(loader) loader.style.display = 'flex';
                    try {
                        const dataUrl = await htmlToImage.toPng(mapNode, {
                            quality: 1.0,     // Máxima calidad PNG
                            pixelRatio: 3,  // Alta resolución (configurable)
                            filter: (node) => {
                                 // Lista de exclusión para ocultar la UI en la captura
                                 const exclusionClasses = [
                                    'leaflet-control-zoom',       // Botones de Zoom
                                    'leaflet-control-layers',     // Selector de capas
                                    'leaflet-pm-toolbar',
                                    'leaflet-control-custom',     // El mismo botón de imprimir
                                    'leaflet-custom-controls',    // El panel deslizable
                                    'leaflet-open-button'         // El botón (☰) para abrir el panel
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

    /**
     * Añade la leyenda de vulnerabilidad al mapa.
     */
    addLegend() {
        const legend = L.control({ position: 'bottomleft' });
        const vulnerabilityMap = CONFIG.vulnerabilityMap;
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = '<h4>Vulnerabilidad</h4>';
            Object.keys(vulnerabilityMap)
                .filter(key => key !== 'default')
                .sort((a, b) => b - a) // Ordenado de 5 a 1
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

    /**
     * Añade el logo de SSIG al mapa.
     */
    addLogo() {
        const LogoControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: () => {
                const c = L.DomUtil.create('div', 'leaflet-logo-control');
                c.innerHTML = `<img src="https://raw.githubusercontent.com/Dchable16/geovisor_vulnerabilidad/main/logos/Logo_SSIG.png" alt="Logo SSIG">`;
                L.DomEvent.disableClickPropagation(c);
                return c;
            }
        });
        this.map.addControl(new LogoControl());
    }

    /**
     * Obtiene el color correspondiente a un nivel de vulnerabilidad.
     * @param {string|number} v - Nivel de vulnerabilidad.
     * @returns {string} - Código de color hexadecimal.
     */
    getColor(v) {
        const entry = CONFIG.vulnerabilityMap[String(v)];
        return entry ? entry.color : CONFIG.vulnerabilityMap.default.color;
    }

    /**
     * Hace zoom a una extensión geográfica (bounds).
     */
    fitBounds(bounds) {
        if (bounds) {
            this.map.fitBounds(bounds.pad(0.1));
        }
    }

    /**
     * Vuela a coordenadas específicas y coloca un marcador temporal con popup.
     * @param {number} lat - Latitud.
     * @param {number} lon - Longitud.
     * @param {string} name - Nombre opcional para el popup.
     */
    flyToCoords(lat, lon, name) {
        // 1. Limpiar marcador anterior (de "Ir a Coordenadas")
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }
        // También limpiar el marcador de clic, si existiera
        this.clearClickMarker();

        // 2. Crear nuevas coordenadas y contenido de popup
        const latLng = L.latLng(lat, lon);
        let popupContent;
        if (name) {
            popupContent = `<b>${name}</b><br>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`;
        } else {
            popupContent = `<b>Coordenadas</b><br>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`;
        }

        // 3. Crear marcador, añadir popup y abrirlo
        this.tempMarker = L.marker(latLng)
            .addTo(this.map)
            .bindPopup(popupContent)
            .openPopup();

        // 4. Volar a la ubicación
        this.map.flyTo(latLng, 13);
    }

    /**
     * Limpia el marcador temporal de "clic en polígono".
     */
    clearClickMarker() {
        if (this.clickMarker) {
            this.map.removeLayer(this.clickMarker);
            this.clickMarker = null;
        }
    }

    /**
     * Restablece la vista del mapa a la inicial y limpia marcadores.
     */
    resetView() {
        this.map.setView(CONFIG.initialCoords, CONFIG.initialZoom);
        
        // Limpiar marcador de "Ir a Coordenadas"
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }
        // Limpiar marcador de "Clic en Polígono"
        this.clearClickMarker();
    }
}
