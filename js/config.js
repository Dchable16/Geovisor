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
        // El color del borde se definirá dinámicamente ahora
        base: { weight: 1.5, opacity: 1 }, 
        
        // Un gris más suave y con borde para el estilo silenciado
        muted: { fillColor: '#E9ECEF', weight: 1, color: '#ADB5BD', fillOpacity: 0.5 },
        
        // Haremos la selección más llamativa con un borde grueso y brillante
        selection: { color: '#00FFFF', weight: 5, opacity: 1 }, 
        
        // El hover será más sutil pero claro
        hover: { weight: 4, color: '#343A40', dashArray: '', fillOpacity: 0.95 },
        
        // ¡NUEVO! Estilos para las líneas de costa
        coastline: { color: "#007BFF", weight: 2, opacity: 0.8, dashArray: "5, 10" }, // Línea punteada
        coastline1km: { color: "#FF0000", weight: 2.5, opacity: 0.85 } // Línea sólida
    }
};
