/**
 * @file config.js
 * @description Almacena la configuración estática del geovisor.
 */

export const CONFIG = {
    mapId: 'map',
    initialCoords: [23.6345, -102.5528],
    initialZoom: 5,
    dataUrl: 'data/Vulnerabilidad.geojson',
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
    styles: {
        base: { weight: 1.5, opacity: 1, color: 'white' },
        muted: { fillColor: '#A9A9A9', weight: 1, color: '#A9A9A9', fillOpacity: 0.2 },
        selection: { color: '#00FFFF', weight: 4, opacity: 1 },
        hover: { weight: 3, color: '#000', dashArray: '', fillOpacity: 0.95 },
        coastline: { color: "#007BFF", weight: 2, opacity: 0.8, fillColor: 'transparent'  }, 
        coastline1km: { color: "#FF0000", weight: 2.5, opacity: 0.85, fillColor: 'transparent' } 
    }
};
