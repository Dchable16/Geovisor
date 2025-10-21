/**
 * @file config.js
 * @description Almacena la configuración estática del geovisor.
 */

export const CONFIG = {
    mapId: 'map',
    initialCoords: [23.6345, -102.5528],
    initialZoom: 5,
    dataManifestUrl: 'data/manifest.json',
    coastlineUrl: 'data/Linea_Costa_10km.geojson',
    coastline1kmUrl: 'data/Linea_Costa_1km.geojson',
    tileLayers: {
        "Neutral (defecto)": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }),
        "OpenStreetMap": L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }),
        "Estándar (ESRI)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri' }),
        "Satélite (ESRI)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri' }),
        "Topográfico (ESRI)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri' }),
        "Terreno (ESRI)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', { attribution:'&copy; Esri' }),
        "Océanos (ESRI)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { attribution:'&copy; Esri' }),
        "Gris Oscuro (ESRI)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution:'&copy; Esri' })
    },
    vulnerabilityMap: {
        '5': { color: '#D90404', label: 'Muy Alta' }, // Rojo (Máximo)
        '4': { color: '#F25C05', label: 'Alta' },
        '3': { color: '#F2B705', label: 'Media' },
        '2': { color: '#99C140', label: 'Baja' },
        '1': { color: '#2DC937', label: 'Muy Baja' }, // Verde (Mínimo)
        'default': { color: '#CCCCCC', label: 'Sin Datos' }
    },
    
    styles: {
        // Estilo base: Limpio, borde sutil, opacidad moderada
        base: {
            weight: 1,          // Borde fino para definición
            opacity: 0.8,       // Borde ligeramente suave
            color: '#555555',   // Borde gris oscuro (funciona en mapas claros/oscuros)
            fillOpacity: 0.65   // Opacidad base moderada para ver mapa debajo
        },

        // Estilo atenuado: Muy desvanecido (sin cambios, ya era efectivo)
        muted: {
            fillColor: '#cccccc',
            weight: 0.5,
            color: '#dddddd',
            fillOpacity: 0.1
        },

        // Estilo Hover: Cambio sutil en borde, SIN cambio de opacidad
        hover: {
            // fillOpacity: NO SE CAMBIA (para evitar confusión con selección)
            weight: 2.5,          // Borde más notable
            color: '#007BFF',   // Usar el color de acento de tu UI (azul)
            opacity: 1          // Borde completamente opaco al pasar el ratón
        },

        // Estilo de Selección: Claro, profesional, bueno para impresión
        selection: {
            weight: 3,          // Borde notable pero no exagerado
            color: '#FFFFFF',   // Borde BLANCO (alto contraste sobre colores)
            opacity: 1,
            fillOpacity: 0.85,   // MÁS opaco que el base, pero NO totalmente opaco
                                // Permite ver detalles del mapa base debajo si es necesario.
            dashArray: '5, 5'  // <-- LÍNEA DISCONTINUA para diferenciar CLARAMENTE
                                // la selección del hover y del estado base.
        },

        // Estilos de líneas de costa (sin cambios)
        coastline: { color: "#007BFF", weight: 2, opacity: 0.8, fillColor: 'transparent'  },
        coastline1km: { color: "#FF0000", weight: 2.5, opacity: 0.85, fillColor: 'transparent' }
    }
};
