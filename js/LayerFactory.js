/**
 * @file LayerFactory.js
 * @description Fábrica para crear capas Leaflet con estilos y eventos preconfigurados.
 * "El Artista": Decide cómo se ve cada cosa en el mapa.
 */

import { CONFIG } from './config.js';

export class LayerFactory {
    
    /**
     * Crea una capa de acuíferos con estilo dinámico según el tema.
     * @param {Object} geojsonData - Datos GeoJSON.
     * @param {Function} onClickHandler - Función a ejecutar al hacer clic.
     * @param {Object} state - Estado actual (para opacidad y tema).
     */
    static createAquiferLayer(geojsonData, onClickHandler, state) {
        return L.geoJSON(geojsonData, {
            style: (feature) => this._getStyle(feature, state),
            onEachFeature: (feature, layer) => {
                // Configurar eventos
                layer.on({
                    click: (e) => {
                        L.DomEvent.stopPropagation(e); // Evitar clics fantasma
                        onClickHandler(feature, layer);
                    },
                    mouseover: (e) => {
                        const layer = e.target;
                        layer.setStyle({ weight: 3, color: '#666' });
                        layer.bringToFront();
                    },
                    mouseout: (e) => {
                        // Restaurar estilo original
                        const currentLayer = e.target;
                        // Usamos geoJSON resetStyle si está disponible, o re-calculamos
                        // Aquí simplificamos re-aplicando el estilo base
                        currentLayer.setStyle(LayerFactory._getStyle(feature, state));
                    }
                });
            }
        });
    }

    /**
     * Lógica interna de estilos (Privada).
     */
    static _getStyle(feature, state) {
        const baseStyle = {
            weight: 1,
            color: 'white',
            fillOpacity: state.opacity
        };

        if (state.activeTheme === 'vulnerability') {
            const vul = feature.properties.VULNERABIL; // Asegúrate que esta propiedad exista en tu GeoJSON
            const configEntry = CONFIG.vulnerabilityMap[String(vul)];
            return {
                ...baseStyle,
                fillColor: configEntry ? configEntry.color : '#ccc'
            };
        } else {
            // Tema Hidráulica (Por defecto azul suave)
            return {
                ...baseStyle,
                fillColor: '#3498db',
                color: '#2980b9'
            };
        }
    }

    /**
     * Crea la capa de pozos (Puntos).
     */
    static createWellsLayer(geojsonData, onClickHandler) {
        return L.geoJSON(geojsonData, {
            pointToLayer: (feature, latlng) => {
                // Marcador circular simple para mejor rendimiento
                return L.circleMarker(latlng, {
                    radius: 4,
                    fillColor: "#e74c3c",
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    onClickHandler(feature);
                });
            }
        });
    }
}
