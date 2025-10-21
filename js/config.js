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
        // Estilo base: Limpio y definido
        base: {
            weight: 1,          // Borde fino
            opacity: 1,         // Borde visible
            color: '#ffffff',   // Borde blanco (contrasta bien con colores y mapas base oscuros/claros)
            fillOpacity: 0.75   // Relleno semi-transparente por defecto
        },

        // Estilo atenuado: Muy desvanecido
        muted: {
            fillColor: '#cccccc', // Gris neutro
            weight: 0.5,        // Borde casi invisible
            color: '#dddddd',
            fillOpacity: 0.1    // Muy transparente
        },

        // Estilo al pasar el ratón (Hover): Sutil pero claro
        hover: {
            fillOpacity: 0.9,   // Un poco más opaco
            weight: 2.5,          // Borde más grueso
            color: '#333333'    // Borde oscuro para indicar interacción
            // dashArray: '',   // Eliminado para evitar confusión con selección
        },

        // Estilo de Selección: Impactante y claro
        selection: {
            weight: 5,          // Borde exterior muy grueso
            color: '#000000',   // Borde exterior negro (máximo contraste)
            opacity: 1,
            fillOpacity: 0.95,  // Casi opaco para destacar el color de vulnerabilidad
            // Simulación de borde interior brillante: Leaflet no lo soporta directamente,
            // pero el borde negro grueso sobre el relleno casi opaco da un efecto similar.
            // Considerar añadir un dashArray aquí si se quiere diferenciar más.
            // dashArray: '5, 5' // Ejemplo: línea discontinua
        },

        // Estilos de líneas de costa (sin cambios, parecen adecuados)
        coastline: { color: "#007BFF", weight: 2, opacity: 0.8, fillColor: 'transparent'  },
        coastline1km: { color: "#FF0000", weight: 2.5, opacity: 0.85, fillColor: 'transparent' }
    }
};
