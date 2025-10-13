/**
 * @file app.js
 * @description Lógica principal para el Geovisor de Vulnerabilidad.
 * Este script sigue una arquitectura encapsulada en un objeto `GeovisorApp`
 * para gestionar el estado, las interacciones y la renderización del mapa.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    /**
     * @class GeovisorApp
     * Objeto principal que encapsula toda la funcionalidad del geovisor.
     */
    const GeovisorApp = {

        // --- 1. CONFIGURACIÓN Y ESTADO ---
        
        CONFIG: {
            mapId: 'map',
            initialCoords: [23.6345, -102.5528],
            initialZoom: 5,
            dataUrl: 'data/Vulnerabilidad.geojson',
            coastlineUrl: 'data/Linea_Costa_10km.geojson',
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
                coastline: { color: "#007BFF", weight: 2, opacity: 0.8, fillColor: 'transparent'  } 
                
            }
        },

state: {
            opacity: 0.8, filterValue: 'all', selectedAquiferName: null, isPanelCollapsed: true,
        },

        nodes: {}, leaflet: {}, data: { aquifers: {} },

        init() {
            this.initMap();
            this.loadData();
        },

        initMap() {
            this.leaflet.map = L.map(this.CONFIG.mapId, { center: this.CONFIG.initialCoords, zoom: this.CONFIG.initialZoom, layers: [this.CONFIG.tileLayers["Neutral (defecto)"]], zoomControl: false });
            L.control.zoom({ position: 'topleft' }).addTo(this.leaflet.map);
            L.control.layers(this.CONFIG.tileLayers, null, { collapsed: true, position: 'topright' }).addTo(this.leaflet.map);
            this.initOpenButtonControl();
            this.initUiControlsPanel();
            this.initLegend();
            this.initLogoControl();
        },

        initUiControlsPanel() {
            const UiControl = L.Control.extend({
                onAdd: (map) => {
                    const container = L.DomUtil.create('div', 'leaflet-custom-controls');
                    this.nodes.uiControlContainer = container;

                    container.innerHTML = `
                        <div class="panel-close-button" title="Ocultar controles">«</div>
                        <h1>Vulnerabilidad a la Intrusión Salina</h1>
                        <div class="control-section">
                            <label for="acuifero-select">Selecciona un acuífero:</label>
                            <select id="acuifero-select"><option value="">-- Mostrar todos --</option></select>
                        </div>
                        <div class="control-section">
                            <label for="opacity-slider">Opacidad general: <span id="opacity-value"></span></label>
                            <input id="opacity-slider" type="range" min="0" max="1" step="0.05">
                        </div>
                        <div class="control-section">
                            <label>Iluminar por vulnerabilidad:</label>
                            <div class="radio-group">
                                <input type="radio" id="vul-todos" name="vulnerability" value="all" checked><label for="vul-todos">Todos</label>
                                <input type="radio" id="vul-1" name="vulnerability" value="1"><label for="vul-1">1</label>
                                <input type="radio" id="vul-2" name="vulnerability" value="2"><label for="vul-2">2</label>
                                <input type="radio" id="vul-3" name="vulnerability" value="3"><label for="vul-3">3</label>
                                <input type="radio" id="vul-4" name="vulnerability" value="4"><label for="vul-4">4</label>
                                <input type="radio" id="vul-5" name="vulnerability" value="5"><label for="vul-5">5</label>
                            </div>
                        </div>
                        <div class="control-section">
                            <label>Capas Adicionales:</label>
                            <div class="layer-toggle">
                                <span>Línea de Costa (10km)</span>
                                <label class="switch">
                                    <input type="checkbox" id="coastline-toggle">
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>
                    `;
                    
                    if (this.state.isPanelCollapsed) container.classList.add('collapsed');
                    
                    setTimeout(() => {
                        if (this.nodes.openButton) {
                            const openButtonPos = this.nodes.openButton.offsetTop;
                            container.style.top = `${openButtonPos}px`;
                        }
                    }, 0);
                    
                    this.cacheAndSetupPanelListeners(container);
                    L.DomEvent.disableClickPropagation(container);
                    return container;
                }
            });
            new UiControl({ position: 'topleft' }).addTo(this.leaflet.map);
        },

        initOpenButtonControl() {
            const OpenButtonControl = L.Control.extend({
                onAdd: (map) => {
                    const button = L.DomUtil.create('div', 'leaflet-open-button');
                    button.innerHTML = '☰';
                    button.title = "Mostrar controles";
                    this.nodes.openButton = button;
                    
                    // Se usa la clase .is-visible en lugar de style.display
                    if (this.state.isPanelCollapsed) {
                        button.classList.add('is-visible');
                    }

                    L.DomEvent.on(button, 'click', () => this.setPanelCollapsed(false), this);
                    L.DomEvent.disableClickPropagation(button);
                    return button;
                }
            });
            new OpenButtonControl({ position: 'topleft' }).addTo(this.leaflet.map);
        },
        
        cacheAndSetupPanelListeners(container) {
            this.nodes.aquiferSelect = container.querySelector('#acuifero-select');
            this.nodes.opacitySlider = container.querySelector('#opacity-slider');
            this.nodes.opacityValueSpan = container.querySelector('#opacity-value');
            this.nodes.filterRadios = container.querySelectorAll('input[name="vulnerability"]');
            this.nodes.closeButton = container.querySelector('.panel-close-button');
            this.nodes.coastlineToggle = container.querySelector('#coastline-toggle');

            this.nodes.aquiferSelect.addEventListener('change', e => this.handleAquiferSelect(e.target.value));
            this.nodes.opacitySlider.addEventListener('input', e => this.handleOpacityChange(e.target.value));
            this.nodes.filterRadios.forEach(radio => radio.addEventListener('change', e => this.handleFilterChange(e.target.value)));
            this.nodes.closeButton.addEventListener('click', () => this.setPanelCollapsed(true));
            this.nodes.coastlineToggle.addEventListener('change', e => this.handleCoastlineToggle(e.target.checked));
        },

        async loadData() {
            this.loadAncillaryLayers(); // Carga en paralelo la capa de costa
            try {
                const response = await fetch(this.CONFIG.dataUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
                const geojsonData = await response.json();
                this.leaflet.geojsonLayer = L.geoJson(geojsonData, { style: feature => this.getFeatureStyle(feature), onEachFeature: (feature, layer) => this.processFeature(feature, layer) }).addTo(this.leaflet.map);
                this.populateAquiferSelect();
                this.updateView();
            } catch (error) {
                console.error("Error al cargar los datos geoespaciales:", error);
                alert("No se pudo cargar la capa de datos. Verifique la consola (F12).");
            }
        },

        async loadAncillaryLayers() {
            try {
                const response = await fetch(this.CONFIG.coastlineUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
                const coastlineData = await response.json();
                this.leaflet.coastlineLayer = L.geoJson(coastlineData, { style: this.CONFIG.styles.coastline });
            } catch (error) {
                console.warn("No se pudo cargar la capa de línea de costa:", error);
            }
        },

        setPanelCollapsed(isCollapsed) {
            this.state.isPanelCollapsed = isCollapsed;
            this.nodes.uiControlContainer.classList.toggle('collapsed', isCollapsed);
            this.nodes.openButton.classList.toggle('is-visible', isCollapsed);
        },

        handleAquiferSelect(aquiferName) {
            this.state.selectedAquiferName = aquiferName || null;
            if (this.state.selectedAquiferName) {
                this.leaflet.map.fitBounds(L.featureGroup(this.data.aquifers[this.state.selectedAquiferName]).getBounds().pad(0.1));
            }
            this.render();
        },
        
        handleOpacityChange(opacity) { this.state.opacity = parseFloat(opacity); this.render(); },
        handleFilterChange(filterValue) { this.state.filterValue = filterValue; this.render(); },
        handleCoastlineToggle(isVisible) {
            this.state.isCoastlineVisible = isVisible;
            this.render(); // Dispara un redibujado para mostrar/ocultar la capa
        },

        render() {
            if (!this.leaflet.geojsonLayer) return;
            this.leaflet.geojsonLayer.eachLayer(layer => layer.setStyle(this.getLayerStyle(layer)));
            if (this.leaflet.coastlineLayer) {
                const isonMap = this.leaflet.map.hasLayer(this.leaflet.coastlineLayer);
                if (this.state.isCoastlineVisible && !isonMap) {
                    this.leaflet.coastlineLayer.addTo(this.leaflet.map);
                } else if (!this.state.isCoastlineVisible && isonMap) {
                    this.leaflet.coastlineLayer.remove();
                }
            }
            
            this.updateView();
        },

        updateView() {
            this.nodes.opacityValueSpan.textContent = `${Math.round(this.state.opacity * 100)}%`;
            this.nodes.opacitySlider.value = this.state.opacity;
            this.nodes.coastlineToggle.checked = this.state.isCoastlineVisible;
        },

        getLayerStyle(layer) {
            const { VULNERABIL, NOM_ACUIF } = layer.feature.properties;
            if (this.state.filterValue !== 'all' && VULNERABIL != this.state.filterValue) {
                return this.CONFIG.styles.muted;
            }
            let finalStyle = this.getFeatureStyle(layer.feature);
            if (this.state.selectedAquiferName === NOM_ACUIF) {
                finalStyle = { ...finalStyle, ...this.CONFIG.styles.selection };
            }
            return finalStyle;
        },

        getFeatureStyle(feature) {
            return {
                ...this.CONFIG.styles.base,
                fillColor: this.getColor(feature.properties.VULNERABIL),
                fillOpacity: this.state.opacity
            };
        },
        
        getColor(v) {
            const value = parseInt(v, 10);
            switch (value) {
                case 5: return '#D90404'; case 4: return '#F25C05'; case 3: return '#F2B705';
                case 2: return '#99C140'; case 1: return '#2DC937'; default: return '#CCCCCC';
            }
        },

        processFeature(feature, layer) {
            const { NOM_ACUIF, CLAVE_ACUI, VULNERABIL } = feature.properties;
            layer.bindPopup(`<strong>Acuífero:</strong> ${NOM_ACUIF}<br><strong>Clave:</strong> ${CLAVE_ACUI}<br><strong>Vulnerabilidad:</strong> ${VULNERABIL}`);
            
            if (!this.data.aquifers[NOM_ACUIF]) this.data.aquifers[NOM_ACUIF] = [];
            this.data.aquifers[NOM_ACUIF].push(layer);

            layer.on({
                mouseover: e => { const h = e.target; h.setStyle(this.CONFIG.styles.hover); h.bringToFront(); },
                mouseout: e => this.render()
            });
        },
        
        populateAquiferSelect() {
            this.nodes.aquiferSelect.innerHTML += Object.keys(this.data.aquifers).sort().map(name => `<option value="${name}">${name}</option>`).join('');
        },
        
        initLegend() {
            const legend = L.control({ position: 'bottomleft' });
            legend.onAdd = () => {
                const div = L.DomUtil.create('div', 'info legend');
                const grades = [1, 2, 3, 4, 5], labels = ['Muy Baja', 'Baja', 'Media', 'Alta', 'Muy Alta'];
                let content = '<h4>Vulnerabilidad</h4>';
                grades.forEach((g, i) => { content += `<i style="background:${this.getColor(g)}"></i> ${labels[i]} (Nivel ${g})<br>`; });
                div.innerHTML = content;
                return div;
            };
            legend.addTo(this.leaflet.map);
        },
        
        initLogoControl() {
            const LogoControl = L.Control.extend({
                onAdd: map => {
                    const c = L.DomUtil.create('div', 'leaflet-logo-control');
                    c.innerHTML = `<img src="https://raw.githubusercontent.com/Dchable16/geovisor_vulnerabilidad/main/logos/Logo_SSIG.png" alt="Logo SSIG">`;
                    L.DomEvent.disableClickPropagation(c);
                    return c;
                }
            });
            new LogoControl({ position: 'bottomright' }).addTo(this.leaflet.map);
        }
    };
    
    GeovisorApp.init();
});
