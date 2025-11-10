/**
 * @file uiManager.js
 * @description Gestiona el panel de controles y la interacción del usuario.
 */

import { CONFIG } from './config.js';

export class UIManager {
    constructor(map, onStateChange) {
        this.map = map;
        this.onStateChange = onStateChange; // Callback para notificar cambios de estado
        this.nodes = {}; // Almacenará referencias a los elementos del DOM
        this.nodes.loader = document.querySelector('#app-loader');
        this.initInfoPanel();
        this.initControlsPanel();
        this.initOpenButton();
    }
    
    initInfoPanel() {
            const mapContainer = document.querySelector('.map-container');
            const infoPanel = L.DomUtil.create('div', 'info-panel');
            this.nodes.infoPanelContainer = infoPanel;
            
            const template = document.querySelector('#info-panel-template');
            if (template) {
                infoPanel.appendChild(template.content.cloneNode(true));
            }
            
            // Insertar el panel directamente en el contenedor del mapa
            mapContainer.appendChild(infoPanel); 
            
            // Cache y listeners específicos del panel
            this.nodes.infoPanelContent = infoPanel.querySelector('#info-panel-content');
            this.nodes.infoPanelTitle = infoPanel.querySelector('#info-panel-title');
            this.nodes.infoPanelClose = infoPanel.querySelector('.info-panel-close');
    
            this.nodes.infoPanelClose.addEventListener('click', () => this.hideInfoPanel());
            L.DomEvent.disableClickPropagation(infoPanel);
        }

    showInfoPanel(properties, vulnerabilityMap) {
        // Formatear el contenido
        let htmlContent = '';
        
        // 1. Mostrar título (Acuífero)
        this.nodes.infoPanelTitle.textContent = properties.NOM_ACUIF || "Detalles del Acuífero";

        // 2. Mapear y mostrar propiedades relevantes
        const attributesToShow = [
            { key: 'NOM_ACUIF', label: 'Nombre del Acuífero' },
            { key: 'CLAVE_ACUI', label: 'Clave' },
            { key: 'VULNERABIL', label: 'Nivel de Vulnerabilidad' },
        ];

        attributesToShow.forEach(attr => {
            let value = properties[attr.key];
            if (attr.key === 'VULNERABIL' && vulnerabilityMap) {
                // Si es vulnerabilidad, añadir la etiqueta descriptiva
                const levelData = vulnerabilityMap[String(value)];
                value = value ? `${value} (${levelData.label})` : 'N/A';
            }
            
            htmlContent += `
                <div class="info-panel-row">
                    <strong>${attr.label}:</strong>
                    <span class="info-panel-value">${value}</span>
                </div>
            `;
        });
        
        this.nodes.infoPanelContent.innerHTML = htmlContent;
        this.nodes.infoPanelContainer.classList.add('is-visible');
    }

     hideInfoPanel() {
        this.nodes.infoPanelContainer.classList.remove('is-visible');
    }
    
    /**
    * Muestra u oculta el overlay de carga.
     * @param {boolean} isLoading - true para mostrar el loader, false para ocultarlo.
     */
    setLoading(isLoading) {
        if (this.nodes.loader) {
            // El 'display: none;' inicial se sobrescribe a 'flex' para mostrarlo
            this.nodes.loader.style.display = isLoading ? 'flex' : 'none';
        }
    } 

    initControlsPanel() {
        const UiControl = L.Control.extend({
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-custom-controls collapsed');
                this.nodes.uiControlContainer = container;
                
                // CÓDIGO MODIFICADO: Carga el contenido desde la plantilla oculta
                const template = document.querySelector('#panel-template');
                if (template) {
                     // Clonar el contenido de la plantilla e insertarlo en el control Leaflet
                    container.appendChild(template.content.cloneNode(true));
                } else {
                    console.error("No se encontró la plantilla del panel de control.");
                }

                this.generateVulnerabilityRadios(container); 
                
                // Retraso para asegurar que el botón de abrir exista y podamos alinear el panel
                setTimeout(() => {
                    if (this.nodes.openButton) {
                        container.style.top = `${this.nodes.openButton.offsetTop}px`;
                    }
                }, 0);

                // La búsqueda de nodos ahora ocurre en el 'container' después de la inserción.
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
        // Obtenemos las claves (1, 2, 3, 4, 5) y las ordenamos
        const grades = Object.keys(CONFIG.vulnerabilityMap)
                             .filter(key => key !== 'default')
                             .sort((a, b) => a - b); // Ordenar de 5 a 1 (Máximo a Mínimo)

        grades.forEach(grade => {
            // Se comenta o elimina la línea que obtiene la etiqueta, ya no es necesaria
            // const label = CONFIG.vulnerabilityMap[grade].label; 
            const id = `vul-${grade}`;
            radioHTML += `
                <input type="radio" id="${id}" name="vulnerability" value="${grade}">
                <label for="${id}">${grade}</label> `;
        });
        
        // Insertar después del radio "Todos"
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
        this.searchNames = names.sort(); // Nombres de acuíferos
        this.searchKeyToNameMap = keyToNameMap; // Mapa de Clave -> Nombre
    }
    
    cacheNodes(container) {
        this.nodes.aquiferSelect = container.querySelector('#acuifero-select');
        this.nodes.opacitySlider = container.querySelector('#opacity-slider');
        this.nodes.opacityValueSpan = container.querySelector('#opacity-value');
        this.nodes.filterRadios = Array.from(container.querySelectorAll('input[name="vulnerability"]'));
        this.nodes.closeButton = container.querySelector('.panel-close-button');
        this.nodes.coastlineToggle = container.querySelector('#coastline-toggle');
        this.nodes.coastline1kmToggle = container.querySelector('#coastline-1km-toggle');
        this.nodes.graticuleToggle = container.querySelector('#graticule-toggle');
        this.nodes.searchInput = container.querySelector('#search-input');
        this.nodes.searchResults = container.querySelector('#search-results-container');
        this.nodes.resetButton = container.querySelector('#reset-button');
        this.nodes.coordLat = container.querySelector('#coord-lat');
        this.nodes.coordLon = container.querySelector('#coord-lon');
        this.nodes.gotoCoordsButton = container.querySelector('#goto-coords-button');
        this.nodes.coordError = container.querySelector('#coord-error-message');
        this.nodes.coordName = container.querySelector('#coord-name');
    }

    addListeners() {
        this.nodes.closeButton.addEventListener('click', () => this.setPanelCollapsed(true));
        this.nodes.aquiferSelect.addEventListener('change', e => this.onStateChange({ selectedAquifer: e.target.value }));
        this.nodes.opacitySlider.addEventListener('input', e => this.onStateChange({ opacity: parseFloat(e.target.value) }));
        this.nodes.filterRadios.forEach(radio => {
            radio.addEventListener('change', e => this.onStateChange({ filterValue: e.target.value }));
        });
        this.nodes.coastlineToggle.addEventListener('change', e => this.onStateChange({ isCoastlineVisible: e.target.checked }));
        this.nodes.coastline1kmToggle.addEventListener('change', e => this.onStateChange({ isCoastline1kmVisible: e.target.checked }));
        this.nodes.graticuleToggle.addEventListener('change', e => this.onStateChange({ isGraticuleVisible: e.target.checked }));
        this.nodes.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.addEventListener('click', (e) => {
            if (!this.nodes.uiControlContainer.contains(e.target)) {
                this.nodes.searchResults.style.display = 'none';
            }
        });
        this.nodes.resetButton.addEventListener('click', () => {
            // Limpiar la búsqueda y luego notificar el reinicio
            this.nodes.searchInput.value = '';
            this.nodes.searchResults.style.display = 'none';
            this.onStateChange({ reset: true });
        });
        this.nodes.gotoCoordsButton.addEventListener('click', () => this.handleGoToCoords());
        
        // Opcional: limpiar error al escribir
        this.nodes.coordLat.addEventListener('input', () => this.setCoordError(''));
        this.nodes.coordLon.addEventListener('input', () => this.setCoordError(''));
        
        this.nodes.resetButton.addEventListener('click', () => {
            // ... (limpiar búsqueda)
            this.onStateChange({ reset: true });
            
            // --- AÑADIDO: Limpiar campos de coords al reiniciar ---
            this.nodes.coordLat.value = '';
            this.nodes.coordLon.value = '';
            this.nodes.coordName.value = '';
            this.setCoordError('');
        });
    }

    handleGoToCoords() {
        const lat = parseFloat(this.nodes.coordLat.value);
        const lon = parseFloat(this.nodes.coordLon.value);
        const name = this.nodes.coordName.value.trim(); // .trim() elimina espacios en blanco

        // Validación
        if (isNaN(lat) || isNaN(lon)) {
            this.setCoordError('Ambos campos son requeridos.');
            return;
        }
        if (lat < -90 || lat > 90) {
            this.setCoordError('Latitud inválida (debe estar entre -90 y 90).');
            return;
        }
        if (lon < -180 || lon > 180) {
            this.setCoordError('Longitud inválida (debe estar entre -180 y 180).');
            return;
        }

        // Si todo está bien, limpiar error y enviar acción a main.js
        this.setCoordError('');
        this.onStateChange({ flyToCoords: [lat, lon, name] });

        // Opcional: colapsar el panel en pantallas pequeñas después de buscar
        if (window.innerWidth <= 768) {
            this.setPanelCollapsed(true);
        }
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
        if (query.length < 2) { // No buscar si es muy corto
            this.nodes.searchResults.innerHTML = '';
            this.nodes.searchResults.style.display = 'none';
            return;
        }

        const queryLower = query.toLowerCase();
        // Usamos un Set para evitar nombres duplicados
        const matchedNames = new Set(); 

        // 1. Buscar por Nombre
        for (const name of this.searchNames) {
            if (name.toLowerCase().includes(queryLower)) {
                matchedNames.add(name);
            }
        }

        // 2. Buscar por Clave
        for (const key in this.searchKeyToNameMap) {
            if (key.includes(queryLower)) {
                // Añadir el nombre correspondiente a la clave
                matchedNames.add(this.searchKeyToNameMap[key]); 
            }
        }

        this.displaySearchResults(Array.from(matchedNames).sort(), queryLower);
    }

    displaySearchResults(results, query) {
        this.nodes.searchResults.innerHTML = ''; // Limpiar resultados anteriores
        
        if (results.length === 0) {
            this.nodes.searchResults.style.display = 'none';
            return;
        }

        // Limitar a los primeros 20 resultados por rendimiento
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
        // 1. Limpiar la búsqueda
        this.nodes.searchInput.value = '';
        this.nodes.searchResults.innerHTML = '';
        this.nodes.searchResults.style.display = 'none';

        // 2. Actualizar el <select> (para que la UI sea consistente)
        this.nodes.aquiferSelect.value = name;

        // 3. Informar a main.js del cambio de estado (esto disparará el zoom)
        this.onStateChange({ selectedAquifer: name });
    }

    setPanelCollapsed(isCollapsed) {
        this.nodes.uiControlContainer.classList.toggle('collapsed', isCollapsed);
        this.nodes.openButton.classList.toggle('is-visible', isCollapsed);
    }
    
    populateAquiferSelect(aquiferNames) {
        this.nodes.aquiferSelect.innerHTML += aquiferNames.sort().map(name => `<option value="${name}">${name}</option>`).join('');
    }

    updateView(state) {
        this.nodes.opacityValueSpan.textContent = `${Math.round(state.opacity * 100)}%`;
        this.nodes.opacitySlider.value = state.opacity;
        this.nodes.coastlineToggle.checked = state.isCoastlineVisible;
        this.nodes.coastline1kmToggle.checked = state.isCoastline1kmVisible;
        this.nodes.graticuleToggle.checked = state.isGraticuleVisible;
        if (this.nodes.aquiferSelect.value !== state.selectedAquifer) {
            this.nodes.aquiferSelect.value = state.selectedAquifer;
        }
        const radioToCheck = this.nodes.filterRadios.find(radio => radio.value === String(state.filterValue)) || this.nodes.filterRadios[0];
        if (radioToCheck) {
            radioToCheck.checked = true;
        }
    }
}
