/**
 * @file uiManager.js
 * @description Gestiona el panel de controles, interacción del usuario y visualización de datos.
 * Actualizado para soportar capas de Vulnerabilidad, Hidráulica y Pozos.
 */

import { CONFIG } from './config.js';

export class UIManager {
    constructor(map, onStateChange) {
        this.map = map;
        this.onStateChange = onStateChange;
        this.nodes = {}; 
        this.nodes.loader = document.querySelector('#app-loader');
        
        // Inicialización de componentes
        this.initInfoPanel();
        this.initControlsPanel();
        this.initOpenButton();
    }
    
    // --- GESTIÓN DEL PANEL DE INFORMACIÓN (POPUP LATERAL) ---
    initInfoPanel() {
        const mapContainer = document.querySelector('.map-container');
        const infoPanel = L.DomUtil.create('div', 'info-panel');
        this.nodes.infoPanelContainer = infoPanel;
        
        // Clonar plantilla
        const template = document.querySelector('#info-panel-template');
        if (template) {
            infoPanel.appendChild(template.content.cloneNode(true));
        }
        
        mapContainer.appendChild(infoPanel); 
        
        // Referencias a elementos internos del panel
        this.nodes.infoPanelContent = infoPanel.querySelector('#info-panel-content');
        this.nodes.infoPanelTitle = infoPanel.querySelector('#info-panel-title');
        this.nodes.infoPanelClose = infoPanel.querySelector('.info-panel-close');

        this.nodes.infoPanelClose.addEventListener('click', () => this.hideInfoPanel());
        
        // Evitar que los clics en el panel pasen al mapa
        L.DomEvent.disableClickPropagation(infoPanel);
    }

    /**
     * Muestra el panel con datos.
     * Detecta automáticamente si es un Acuífero (Vulnerabilidad/Hidráulica) o un Pozo.
     * @param {Object} properties - Objeto con los datos a mostrar.
     * @param {Object} [vulnerabilityMap] - Mapa de códigos de vulnerabilidad (opcional).
     */
    showInfoPanel(properties, vulnerabilityMap) {
        let htmlContent = '';
        
        // 1. DETECTAR TÍTULO
        // Intenta buscar campos comunes de nombre
        const title = properties.NOM_ACUIF || properties["Nombre del Pozo"] || properties.nombre || properties.Nombre || properties['Nombre del Acuífero'] || "Detalles";
        this.nodes.infoPanelTitle.textContent = title;

        // 2. DETECTAR TIPO DE CONTENIDO
        if (properties.VULNERABIL !== undefined) {
            // --- CASO A: MODO VULNERABILIDAD ---
            const attributes = [
                { key: 'NOM_ACUIF', label: 'Nombre' },
                { key: 'CLAVE_ACUI', label: 'Clave' },
                { key: 'VULNERABIL', label: 'Nivel de Vulnerabilidad' }
            ];

            attributes.forEach(attr => {
                let value = properties[attr.key];
                if (attr.key === 'VULNERABIL' && vulnerabilityMap) {
                    const levelData = vulnerabilityMap[String(value)];
                    value = value ? `${value} (${levelData ? levelData.label : ''})` : 'N/A';
                }
                htmlContent += this._buildInfoRow(attr.label, value);
            });

        } else {
            // --- CASO B: MODO HIDRÁULICA O POZOS ---
            // Renderizado genérico inteligente
            
            // Campos que NO queremos mostrar en la tabla
            const ignoreKeys = ['geometry', 'fid', 'cat', 'type', 'bbox', 'Id', 'id'];
            
            const priorityKeys = [
                'Clave', 
                'Tipo', 
                'Nombre del Acuífero',
                'Nombre del Pozo',
                'Acuífero', 
                'Transmisividad Media', 'Transmisividad', 
                'Conductividad Media', 'Conductividad', 
                'Coef. Almacenamiento', 
                'Caudal (Q)',
                'Profundidad Media', 'Profundidad',
                'Pozos Registrados',
                'Año'
            ];
            
            // 1. Renderizar campos prioritarios en orden
            priorityKeys.forEach(key => {
                // Buscamos si la propiedad existe (exacta o case-insensitive)
                const foundKey = Object.keys(properties).find(k => k === key || k.toLowerCase() === key.toLowerCase());
                
                if (foundKey && properties[foundKey] !== undefined) {
                    htmlContent += this._buildInfoRow(key, properties[foundKey]);
                }
            });

            // 2. Renderizar el resto de campos que no estén en prioridad ni ignorados
            Object.keys(properties).forEach(key => {
                const keyLower = key.toLowerCase();
                const isPriority = priorityKeys.some(pk => pk.toLowerCase() === keyLower);
                const isIgnored = ignoreKeys.includes(key);
                // Excluir también títulos redundantes
                const isTitle = ['Nombre', 'nombre', 'NOM_ACUIF', 'NOMBRE_POZO'].includes(key);

                if (!isPriority && !isIgnored && !isTitle) {
                    let val = properties[key];
                    htmlContent += this._buildInfoRow(this._formatLabel(key), val);
                }
            });
        }
        
        this.nodes.infoPanelContent.innerHTML = htmlContent;
        this.nodes.infoPanelContainer.classList.add('is-visible');
    }

    hideInfoPanel() {
        this.nodes.infoPanelContainer.classList.remove('is-visible');
    }

    // Helper HTML para filas
    _buildInfoRow(label, value) {
        // Si el valor es nulo o undefined, mostramos 'S/D' (Sin Dato)
        const displayValue = (value !== undefined && value !== null && value !== '') ? value : 'S/D';
        return `
            <div class="info-panel-row">
                <strong>${label}:</strong>
                <span class="info-panel-value">${displayValue}</span>
            </div>`;
    }

    // Helper para formatear etiquetas (ej: "tipo_acuifero" -> "Tipo Acuifero")
    _formatLabel(key) {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    setLoading(isLoading) {
        if (this.nodes.loader) {
            this.nodes.loader.style.display = isLoading ? 'flex' : 'none';
        }
    } 

    // --- GESTIÓN DEL PANEL DE CONTROLES PRINCIPAL ---
    initControlsPanel() {
        const UiControl = L.Control.extend({
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-custom-controls collapsed');
                this.nodes.uiControlContainer = container;
                
                const template = document.querySelector('#panel-template');
                if (template) {
                    container.appendChild(template.content.cloneNode(true));
                } else {
                    console.error("Error: Plantilla #panel-template no encontrada.");
                }

                this.generateVulnerabilityRadios(container); 
                
                // Ajuste de posición respecto al botón de abrir
                setTimeout(() => {
                    if (this.nodes.openButton) {
                        container.style.top = `${this.nodes.openButton.offsetTop}px`;
                    }
                }, 0);

                this.cacheNodes(container); 
                this.addListeners();
                L.DomEvent.disableClickPropagation(container);
                return container;
            }
        });
        new UiControl({ position: 'topleft' }).addTo(this.map);
    }

    generateVulnerabilityRadios(container) {
        const radioGroup = container.querySelector('#vulnerability-radio-group');
        if (!radioGroup) return;

        let radioHTML = '';
        const grades = Object.keys(CONFIG.vulnerabilityMap)
                             .filter(key => key !== 'default')
                             .sort((a, b) => a - b);

        grades.forEach(grade => {
            const id = `vul-${grade}`;
            radioHTML += `<input type="radio" id="${id}" name="vulnerability" value="${grade}"><label for="${id}">${grade}</label> `;
        });
        radioGroup.insertAdjacentHTML('beforeend', radioHTML);
    }

    initOpenButton() {
        const OpenButtonControl = L.Control.extend({
            onAdd: () => {
                const button = L.DomUtil.create('div', 'leaflet-open-button is-visible');
                button.innerHTML = '☰';
                button.title = "Mostrar controles";
                this.nodes.openButton = button;
                L.DomEvent.on(button, 'click', () => this.setPanelCollapsed(false));
                L.DomEvent.disableClickPropagation(button);
                return button;
            }
        });
        new OpenButtonControl({ position: 'topleft' }).addTo(this.map);
    }
    
    setSearchData(names, keyToNameMap) {
        this.searchNames = names.sort();
        this.searchKeyToNameMap = keyToNameMap;
    }
    
    // --- CACHÉ DE REFERENCIAS DOM ---
    cacheNodes(container) {
        // Botones de Tema (Vulnerabilidad vs Hidráulica)
        this.nodes.btnThemeVuln = container.querySelector('#btn-theme-vulnerability');
        this.nodes.btnThemeHydro = container.querySelector('#btn-theme-hydraulics');
        this.nodes.vulnerabilitySection = container.querySelector('#vulnerability-radio-group')?.closest('.control-section');

        // Toggles de Capas
        this.nodes.wellsToggle = container.querySelector('#wells-toggle'); // <--- NUEVO
        this.nodes.coastlineToggle = container.querySelector('#coastline-toggle');
        this.nodes.coastline1kmToggle = container.querySelector('#coastline-1km-toggle');
        this.nodes.graticuleToggle = container.querySelector('#graticule-toggle');

        // Controles generales
        this.nodes.aquiferSelect = container.querySelector('#acuifero-select');
        this.nodes.opacitySlider = container.querySelector('#opacity-slider');
        this.nodes.opacityValueSpan = container.querySelector('#opacity-value');
        this.nodes.filterRadios = Array.from(container.querySelectorAll('input[name="vulnerability"]'));
        this.nodes.closeButton = container.querySelector('.panel-close-button');
        
        // Búsqueda y Coordenadas
        this.nodes.searchInput = container.querySelector('#search-input');
        this.nodes.searchResults = container.querySelector('#search-results-container');
        this.nodes.resetButton = container.querySelector('#reset-button');
        this.nodes.coordLat = container.querySelector('#coord-lat');
        this.nodes.coordLon = container.querySelector('#coord-lon');
        this.nodes.coordName = container.querySelector('#coord-name');
        this.nodes.gotoCoordsButton = container.querySelector('#goto-coords-button');
        this.nodes.coordError = container.querySelector('#coord-error-message');
    }

    addListeners() {
        this.nodes.closeButton.addEventListener('click', () => this.setPanelCollapsed(true));
        
        // LISTENERS DE TEMA
        if (this.nodes.btnThemeVuln && this.nodes.btnThemeHydro) {
            this.nodes.btnThemeVuln.addEventListener('click', () => this.onStateChange({ activeTheme: 'vulnerability' }));
            this.nodes.btnThemeHydro.addEventListener('click', () => this.onStateChange({ activeTheme: 'hydraulics' }));
        }

        // LISTENER DE POZOS (NUEVO)
        if (this.nodes.wellsToggle) {
            this.nodes.wellsToggle.addEventListener('change', e => this.onStateChange({ areWellsVisible: e.target.checked }));
        }

        // Listeners de otras capas
        this.nodes.coastlineToggle.addEventListener('change', e => this.onStateChange({ isCoastlineVisible: e.target.checked }));
        this.nodes.coastline1kmToggle.addEventListener('change', e => this.onStateChange({ isCoastline1kmVisible: e.target.checked }));
        this.nodes.graticuleToggle.addEventListener('change', e => this.onStateChange({ isGraticuleVisible: e.target.checked }));
        
        // Controles comunes
        this.nodes.aquiferSelect.addEventListener('change', e => this.onStateChange({ selectedAquifer: e.target.value }));
        this.nodes.opacitySlider.addEventListener('input', e => this.onStateChange({ opacity: parseFloat(e.target.value) }));
        
        this.nodes.filterRadios.forEach(radio => {
            radio.addEventListener('change', e => this.onStateChange({ filterValue: e.target.value }));
        });
        
        // Búsqueda
        this.nodes.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        // Cerrar resultados al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (this.nodes.uiControlContainer && !this.nodes.uiControlContainer.contains(e.target)) {
                if(this.nodes.searchResults) this.nodes.searchResults.style.display = 'none';
            }
        });

        // Reset
        this.nodes.resetButton.addEventListener('click', () => {
            this.nodes.searchInput.value = '';
            this.nodes.coordLat.value = '';
            this.nodes.coordLon.value = '';
            this.nodes.coordName.value = '';
            this.nodes.searchResults.style.display = 'none';
            this.setCoordError('');
            this.onStateChange({ reset: true });
        });

        // Coordenadas
        this.nodes.gotoCoordsButton.addEventListener('click', () => this.handleGoToCoords());
        this.nodes.coordLat.addEventListener('input', () => this.setCoordError(''));
        this.nodes.coordLon.addEventListener('input', () => this.setCoordError(''));
    }

    // --- ACTUALIZACIÓN DE LA VISTA BASADA EN EL ESTADO ---
    updateView(state) {
        // 1. Sliders y Texto
        this.nodes.opacityValueSpan.textContent = `${Math.round(state.opacity * 100)}%`;
        this.nodes.opacitySlider.value = state.opacity;
        
        // 2. Toggles de Capas
        if(this.nodes.coastlineToggle) this.nodes.coastlineToggle.checked = state.isCoastlineVisible;
        if(this.nodes.coastline1kmToggle) this.nodes.coastline1kmToggle.checked = state.isCoastline1kmVisible;
        if(this.nodes.graticuleToggle) this.nodes.graticuleToggle.checked = state.isGraticuleVisible;
        
        // Toggle de Pozos (NUEVO)
        if (this.nodes.wellsToggle) {
            this.nodes.wellsToggle.checked = state.areWellsVisible;
        }

        // 3. Select de Acuíferos
        if (this.nodes.aquiferSelect && this.nodes.aquiferSelect.value !== state.selectedAquifer) {
            this.nodes.aquiferSelect.value = state.selectedAquifer;
        }

        // 4. Radio Buttons (Filtros Vulnerabilidad)
        const radioToCheck = this.nodes.filterRadios.find(radio => radio.value === String(state.filterValue));
        if (radioToCheck) radioToCheck.checked = true;

        // 5. ACTUALIZACIÓN DE TEMA (Vulnerabilidad vs Hidráulica)
        if (this.nodes.btnThemeVuln && this.nodes.btnThemeHydro) {
            if (state.activeTheme === 'vulnerability') {
                this.nodes.btnThemeVuln.classList.add('active');
                this.nodes.btnThemeHydro.classList.remove('active');
                // Mostrar controles exclusivos de vulnerabilidad
                if(this.nodes.vulnerabilitySection) this.nodes.vulnerabilitySection.style.display = 'block';
            } else {
                this.nodes.btnThemeHydro.classList.add('active');
                this.nodes.btnThemeVuln.classList.remove('active');
                // Ocultar controles exclusivos de vulnerabilidad
                if(this.nodes.vulnerabilitySection) this.nodes.vulnerabilitySection.style.display = 'none';
            }
        }
    }

    // --- FUNCIONES DE UTILERÍA (Búsqueda, Coordenadas, etc.) ---
    
    handleGoToCoords() {
        const lat = parseFloat(this.nodes.coordLat.value);
        const lon = parseFloat(this.nodes.coordLon.value);
        const name = this.nodes.coordName.value.trim();

        if (isNaN(lat) || isNaN(lon)) {
            this.setCoordError('Ambos campos son requeridos.');
            return;
        }
        if (lat < -90 || lat > 90) {
            this.setCoordError('Latitud inválida.');
            return;
        }
        if (lon < -180 || lon > 180) {
            this.setCoordError('Longitud inválida.');
            return;
        }
        this.setCoordError('');
        this.onStateChange({ flyToCoords: [lat, lon, name] });
        if (window.innerWidth <= 768) this.setPanelCollapsed(true);
    }

    setCoordError(message) {
        if (message) {
            this.nodes.coordError.textContent = message;
            this.nodes.coordError.style.display = 'block';
        } else {
            this.nodes.coordError.style.display = 'none';
        }
    }

    handleSearch(query) {
        if (query.length < 2) {
            this.nodes.searchResults.innerHTML = '';
            this.nodes.searchResults.style.display = 'none';
            return;
        }
        const queryLower = query.toLowerCase();
        const matchedNames = new Set(); 
        if (this.searchNames) {
            for (const name of this.searchNames) {
                if (name.toLowerCase().includes(queryLower)) matchedNames.add(name);
            }
        }
        if (this.searchKeyToNameMap) {
            for (const key in this.searchKeyToNameMap) {
                if (key.includes(queryLower)) matchedNames.add(this.searchKeyToNameMap[key]); 
            }
        }
        this.displaySearchResults(Array.from(matchedNames).sort(), queryLower);
    }

    displaySearchResults(results, query) {
        this.nodes.searchResults.innerHTML = '';
        if (results.length === 0) {
            this.nodes.searchResults.style.display = 'none';
            return;
        }
        const resultsToShow = results.slice(0, 20); 
        resultsToShow.forEach(name => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            const regex = new RegExp(`(${query})`, 'gi');
            item.innerHTML = name.replace(regex, '<strong>$1</strong>');
            item.addEventListener('click', () => this.selectSearchResult(name));
            this.nodes.searchResults.appendChild(item);
        });
        this.nodes.searchResults.style.display = 'block';
    }

    selectSearchResult(name) {
        this.nodes.searchInput.value = '';
        this.nodes.searchResults.innerHTML = '';
        this.nodes.searchResults.style.display = 'none';
        this.nodes.aquiferSelect.value = name;
        this.onStateChange({ selectedAquifer: name });
    }

    setPanelCollapsed(isCollapsed) {
        this.nodes.uiControlContainer.classList.toggle('collapsed', isCollapsed);
        this.nodes.openButton.classList.toggle('is-visible', isCollapsed);
    }
    
    populateAquiferSelect(aquiferNames) {
        if(!this.nodes.aquiferSelect) return;
        const currentOptions = new Set(Array.from(this.nodes.aquiferSelect.options).map(o => o.value));
        const newOptions = aquiferNames.sort().filter(name => !currentOptions.has(name));
        this.nodes.aquiferSelect.innerHTML += newOptions.map(name => `<option value="${name}">${name}</option>`).join('');
    }
}
