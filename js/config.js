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
        base: { weight: 1, opacity: 0.6, color: '#555555', fillOpacity: 0.5 },
        muted: { fillColor: '#cccccc', weight: 0.5, color: '#dddddd', fillOpacity: 0.1 },
        selection: { weight: 1.5, color: '#FFFFFF', opacity: 1, fillOpacity: 0.85, dashArray: '5, 5' },
        hover: { weight: 2.5, color: '#007BFF', fillOpacity: .7 },
        coastline: { color: "#007BFF", weight: 2, opacity: 0.8, fillColor: 'transparent'  }, 
        coastline1km: { color: "#FF0000", weight: 2.5, opacity: 0.85, fillColor: 'transparent' },
        clickHighlight: { color: "#FFFF00", weight: 4, opacity: 1, fillOpacity: 0.85, dashArray: '' }
    }
};
