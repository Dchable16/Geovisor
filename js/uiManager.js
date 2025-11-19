/**
 * @file uiManager.js
 * @description Módulo corregido para gestionar la interfaz, compatible con el HTML original.
 */

import { CONFIG } from './config.js';

export class UiManager {
    constructor(app) {
        this.app = app; // Referencia a la App principal
        this.nodes = {};
        this.searchNames = [];
        this.searchKeyToNameMap = {};

        this.nodes.loader = document.querySelector('#app-loader');
        
        this.initInfoPanel();
        this.initControlsPanel();
        this.initOpenButton();
    }

    setLoading(isLoading) {
        if (this.nodes.loader) {
            this.nodes.loader.style.display = isLoading ? 'flex' : 'none';
        }
    }

    initControlsPanel() {
        const UiControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-custom-controls collapsed');
                this.nodes.uiControlContainer = container;
                
                const template = document.querySelector('#panel-template');
                if (template) {
                    container.appendChild(template.content.cloneNode(true));
                }

                this.generateVulnerabilityRadios(container);
                
                // Evitar propagación de eventos
                L.DomEvent.disableScrollPropagation(container);
                L.DomEvent.disableClickPropagation(container);

                // Esperar a que el DOM se pinte para añadir listeners
                setTimeout(() => {
                    this.cacheNodes(container);
                    this.addListeners();
                }, 0);

                return container;
            }
        });
        this.app.mapManager.map.addControl(new UiControl());
    }

    generateVulnerabilityRadios(container) {
        const radioGroup = container.querySelector('#vulnerability-radio-group');
        if (!radioGroup) return;

        // Generar radios basados en config (excepto default)
        const grades = Object.keys(CONFIG.vulnerabilityMap)
                             .filter(k => k !== 'default')
                             .sort((a, b) => b - a);
        
        let html = '';
        grades.forEach(grade => {
            const id = `vul-${grade}`;
            html += `<input type="radio" id="${id}" name="vulnerability" value="${grade}">
                     <label for="${id}">${grade}</label>`;
        });
        radioGroup.insertAdjacentHTML('beforeend', html);
    }

    cacheNodes(container) {
        // Botones
        this.nodes.closeButton = container.querySelector('.panel-close-button');
        this.nodes.resetButton = container.querySelector('#reset-button');
        this.nodes.gotoCoordsButton = container.querySelector('#goto-coords-button');

        // Inputs del HTML original
        this.nodes.aquiferSelect = container.querySelector('#acuifero-select');
        this.nodes.searchInput = container.querySelector('#search-input');
        this.nodes.searchResults = container.querySelector('#search-results-container');
        this.nodes.opacitySlider = container.querySelector('#opacity-slider');
        this.nodes.opacityValue = container.querySelector('#opacity-value');

        // Radios
        this.nodes.filterRadios = Array.from(container.querySelectorAll('input[name="vulnerability"]'));

        // Toggles (IDs corregidos según tu HTML original)
        this.nodes.coastlineToggle = container.querySelector('#coastline-toggle');
        this.nodes.coastline1kmToggle = container.querySelector('#coastline-1km-toggle');
        this.nodes.graticuleToggle = container.querySelector('#graticule-toggle');

        // Coordenadas
        this.nodes.coordLat = container.querySelector('#coord-lat');
        this.nodes.coordLon = container.querySelector('#coord-lon');
        this.nodes.coordName = container.querySelector('#coord-name');
        this.nodes.coordError = container.querySelector('#coord-error-message');
    }

    addListeners() {
        // Cerrar Panel
        if(this.nodes.closeButton) {
            this.nodes.closeButton.addEventListener('click', (e) => {
                L.DomEvent.stop(e);
                this.togglePanel(false);
            });
        }

        // Radios Vulnerabilidad
        this.nodes.filterRadios.forEach(r => {
            r.addEventListener('change', e => this.app.handleLayerChange(e.target.value));
        });

        // Opacidad
        if(this.nodes.opacitySlider) {
            this.nodes.opacitySlider.addEventListener('input', e => {
                const val = parseFloat(e.target.value);
                if(this.nodes.opacityValue) this.nodes.opacityValue.textContent = Math.round(val * 100) + '%';
                this.app.handleOpacityChange(val);
            });
        }

        // Toggles
        if(this.nodes.coastlineToggle) 
            this.nodes.coastlineToggle.addEventListener('change', e => this.app.handleToggleChange('coastline', e.target.checked));
        
        if(this.nodes.coastline1kmToggle) 
            this.nodes.coastline1kmToggle.addEventListener('change', e => this.app.handleToggleChange('coastline1km', e.target.checked));
        
        if(this.nodes.graticuleToggle) 
            this.nodes.graticuleToggle.addEventListener('change', e => this.app.handleToggleChange('graticule', e.target.checked));

        // Select Acuífero
        if(this.nodes.aquiferSelect) {
            this.nodes.aquiferSelect.addEventListener('change', e => this.app.handleAcuiferoSelect(e.target.value));
        }

        // Buscador
        if(this.nodes.searchInput) {
            this.nodes.searchInput.addEventListener('input', e => this.handleSearch(e.target.value));
            // Cerrar resultados al hacer clic fuera
            document.addEventListener('click', (e) => {
                if (this.nodes.uiControlContainer && !this.nodes.uiControlContainer.contains(e.target)) {
                    if(this.nodes.searchResults) this.nodes.searchResults.style.display = 'none';
                }
            });
        }

        // Botón Reset
        if(this.nodes.resetButton) {
            this.nodes.resetButton.addEventListener('click', () => {
                // Limpiar inputs UI
                this.nodes.searchInput.value = '';
                this.nodes.searchResults.style.display = 'none';
                this.nodes.coordLat.value = '';
                this.nodes.coordLon.value = '';
                this.nodes.coordName.value = '';
                this.app.resetView();
            });
        }

        // Botón Ir a Coordenadas
        if(this.nodes.gotoCoordsButton) {
            this.nodes.gotoCoordsButton.addEventListener('click', () => {
                const lat = parseFloat(this.nodes.coordLat.value);
                const lon = parseFloat(this.nodes.coordLon.value);
                if (isNaN(lat) || isNaN(lon)) {
                    this.nodes.coordError.textContent = "Coordenadas inválidas";
                    this.nodes.coordError.style.display = "block";
                } else {
                    this.nodes.coordError.style.display = "none";
                    this.app.handleFlyToCoords(lat, lon, this.nodes.coordName.value);
                    // En móvil, cerrar panel
                    if(window.innerWidth <= 768) this.togglePanel(false);
                }
            });
        }
    }

    /* --- GESTIÓN DE BÚSQUEDA --- */
    setSearchData(names, keyToNameMap) {
        this.searchNames = names || [];
        this.searchKeyToNameMap = keyToNameMap || {};
    }

    populateAquiferSelect(names) {
        if(!this.nodes.aquiferSelect) return;
        const sorted = names.sort();
        this.nodes.aquiferSelect.innerHTML = '<option value="">-- Mostrar todos --</option>' + 
            sorted.map(n => `<option value="${n}">${n}</option>`).join('');
    }

    handleSearch(query) {
        if (!this.nodes.searchResults) return;
        if (query.length < 2) {
            this.nodes.searchResults.style.display = 'none';
            return;
        }

        const q = query.toLowerCase();
        const results = new Set();

        // Buscar por nombre
        this.searchNames.forEach(name => {
            if(name.toLowerCase().includes(q)) results.add(name);
        });
        // Buscar por clave
        for (const k in this.searchKeyToNameMap) {
            if(k.includes(q)) results.add(this.searchKeyToNameMap[k]);
        }

        this.renderSearchResults(Array.from(results).sort(), query);
    }

    renderSearchResults(results, query) {
        const container = this.nodes.searchResults;
        container.innerHTML = '';
        if(results.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        results.slice(0, 20).forEach(name => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            // Resaltar coincidencia
            const regex = new RegExp(`(${query})`, 'gi');
            div.innerHTML = name.replace(regex, '<strong>$1</strong>');
            
            div.addEventListener('click', () => {
                this.nodes.searchInput.value = '';
                container.style.display = 'none';
                this.app.handleAcuiferoSelect(name);
            });
            container.appendChild(div);
        });
        container.style.display = 'block';
    }

    /* --- GESTIÓN DE PANELES --- */
    initOpenButton() {
        const btn = L.DomUtil.create('div', 'leaflet-open-button is-visible');
        btn.innerHTML = '☰';
        btn.title = 'Mostrar controles';
        
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = (e) => {
            L.DomEvent.stop(e);
            this.togglePanel(true);
        };
        
        // Buscar contenedor de controles de Leaflet
        const container = document.querySelector('.leaflet-top.leaflet-left');
        if(container) container.appendChild(btn);
        this.nodes.openButton = btn;
    }

    togglePanel(show) {
        if(!this.nodes.uiControlContainer || !this.nodes.openButton) return;
        if(show) {
            this.nodes.uiControlContainer.classList.remove('collapsed');
            this.nodes.openButton.classList.remove('is-visible');
        } else {
            this.nodes.uiControlContainer.classList.add('collapsed');
            this.nodes.openButton.classList.add('is-visible');
        }
    }

    /* --- INFO PANEL --- */
    initInfoPanel() {
        const mapContainer = document.querySelector('.map-container');
        const panel = L.DomUtil.create('div', 'info-panel');
        this.nodes.infoPanel = panel;

        const tpl = document.querySelector('#info-panel-template');
        if(tpl) panel.appendChild(tpl.content.cloneNode(true));
        mapContainer.appendChild(panel);

        this.nodes.infoContent = panel.querySelector('#info-panel-content');
        this.nodes.infoTitle = panel.querySelector('#info-panel-title');
        const close = panel.querySelector('.info-panel-close');
        if(close) close.addEventListener('click', () => this.nodes.infoPanel.classList.remove('is-visible'));
    }

    showInfoPanel(props, vMap) {
        if(!this.nodes.infoPanel) return;
        this.nodes.infoTitle.textContent = props.NOM_ACUIF || "Detalle";
        
        let html = '';
        const attrs = [
            {k: 'NOM_ACUIF', l: 'Nombre'},
            {k: 'CLAVE_ACUI', l: 'Clave'},
            {k: 'VULNERABIL', l: 'Vulnerabilidad'}
        ];

        attrs.forEach(a => {
            let val = props[a.k];
            if(a.k === 'VULNERABIL' && vMap) {
                const entry = vMap[String(val)];
                if(entry) val = `${val} (${entry.label})`;
            }
            html += `<div class="info-panel-row"><strong>${a.l}:</strong> <span class="info-panel-value">${val||'--'}</span></div>`;
        });

        this.nodes.infoContent.innerHTML = html;
        this.nodes.infoPanel.classList.add('is-visible');
    }

    /* --- ACTUALIZACIÓN VISUAL --- */
    updateView(state) {
        // Actualizar sliders, toggles, selects desde el estado
        if(this.nodes.opacitySlider) this.nodes.opacitySlider.value = state.opacity;
        if(this.nodes.opacityValue) this.nodes.opacityValue.textContent = Math.round(state.opacity*100) + '%';
        
        if(this.nodes.coastlineToggle) this.nodes.coastlineToggle.checked = state.isCoastlineVisible;
        if(this.nodes.coastline1kmToggle) this.nodes.coastline1kmToggle.checked = state.isCoastline1kmVisible;
        if(this.nodes.graticuleToggle) this.nodes.graticuleToggle.checked = state.isGraticuleVisible;

        if(this.nodes.aquiferSelect && state.selectedAquifer !== this.nodes.aquiferSelect.value) {
            this.nodes.aquiferSelect.value = state.selectedAquifer || "";
        }

        const radio = this.nodes.filterRadios.find(r => r.value === String(state.filterValue));
        if(radio) radio.checked = true;
    }
}
