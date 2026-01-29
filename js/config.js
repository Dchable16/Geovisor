/**
 * @file config.js
 * @description Almacena la configuración estática del geovisor.
 * Actualizado para evitar errores de referencia a 'L' durante la carga de módulos.
 */

export const CONFIG = {
    mapId: 'map',
    initialCoords: [23.6345, -102.5528],
    initialZoom: 15,
    dataManifestUrl: 'data/manifest.json',
    coastlineUrl: 'data/Linea_Costa_10km.geojson',
    coastline1kmUrl: 'data/Linea_Costa_1km.geojson',
    
    // Se definen solo las URLs y opciones. 
    // Los objetos L.tileLayer se crearán en mapManager.js para mayor seguridad.
    tileLayers: {
        "Neutral (defecto)": {
            url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            options: { attribution: '&copy; CARTO' }
        },
        "OpenStreetMap": {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            options: { attribution: '&copy; OpenStreetMap' }
        },
        "Estándar (ESRI)": {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
            options: { attribution: '&copy; Esri' }
        },
        "Satélite (ESRI)": {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            options: { attribution: '&copy; Esri' }
        },
        "Topográfico (ESRI)": {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
            options: { attribution: '&copy; Esri' }
        },
        "Terreno (ESRI)": {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
            options: { attribution: '&copy; Esri' }
        },
        "Océanos (ESRI)": {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
            options: { attribution: '&copy; Esri' }
        },
        "Gris Oscuro (ESRI)": {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            options: { attribution: '&copy; Esri' }
        }
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
        base: { weight: 1, opacity: 0.8, color: '#555555', fillOpacity: 0.65 },
        muted: { fillColor: '#cccccc', weight: 0.5, color: '#dddddd', fillOpacity: 0.1 },
        selection: { weight: 1.5, color: '#FFFFFF', opacity: 1, fillOpacity: 0.85, dashArray: '5, 5' },
        hover: { weight: 2.5, color: '#007BFF', fillOpacity: .75 },
        coastline: { color: "#007BFF", weight: 2, opacity: 0.8, fillColor: 'transparent'  },
        coastline1km: { color: "#FF0000", weight: 2.5, opacity: 0.85, fillColor: 'transparent' },
        clickHighlight: { color: "#FFFF00", weight: 4, opacity: 1, fillOpacity: 0.85, dashArray: '' }
    }
};
