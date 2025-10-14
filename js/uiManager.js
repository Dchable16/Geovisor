/**
 * @file uiManager.js
 * @description Gestiona el panel de controles y la interacción del usuario.
 */
export class UIManager {
    constructor(map, onStateChange) {
        this.map = map;
        this.onStateChange = onStateChange;
        this.nodes = {};
        this.initControlsPanel();
        this.initOpenButton();
    }

    initControlsPanel() {
        const UiControl = L.Control.extend({
            onAdd: () => {
                const container = L.DomUtil.create('div', 'leaflet-custom-controls collapsed');
                this.nodes.uiControlContainer = container;
                container.innerHTML = this.getPanelHTML();
                
                this.cacheNodes(container);
                this.addListeners();
                
                L.DomEvent.disableClickPropagation(container);
                return container;
            }
        });
        new UiControl({ position: 'topleft' }).addTo(this.map);
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
                
                // Alinea el panel con el botón una vez que ambos existen
                if (this.nodes.uiControlContainer) {
                    this.nodes.uiControlContainer.style.top = `${button.offsetTop}px`;
                }

                return button;
            }
        });
        new OpenButtonControl({ position: 'topleft' }).addTo(this.map);
    }
    
    getPanelHTML() {
        // HTML del panel, incluyendo el nuevo panel de información
        return `
            <div class="panel-close-button" title="Ocultar controles">«</div>
            <h1>Vulnerabilidad a la Intrusión Salina</h1>
            
            <div id="info-panel" class="info-panel">
                <div class="info-placeholder">
                    <p>Haz clic en un acuífero para ver sus detalles.</p>
                </div>
                <div class="info-content" style="display:none;">
                    <h3 id="info-title"></h3>
                    <table id="info-table"></table>
                </div>
            </div>
    
            <div class="control-section">
                <label for="acuifero-select">Selecciona un acuífero:</label>
                <select id="acuifero-select"><option value="">-- Mostrar todos --</option></select>
            </div>
            <div class="control-section">
                <label for="opacity-slider">Opacidad general: <span id="opacity-value"></span></label>
                <input id="opacity-slider" type="range" min="0" max="1" step="0.05">
            </div>
            <div class="control-section">
                <label>Filtrar por vulnerabilidad:</label>
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
                    <label class="switch"><input type="checkbox" id="coastline-toggle"><span class="slider"></span></label>
                </div>
                <div class="layer-toggle" style="margin-top: 10px;">
                    <span>Línea de Costa (1km)</span>
                    <label class="switch"><input type="checkbox" id="coastline-1km-toggle"><span class="slider"></span></label>
                </div>
            </div>
        `;
    }

    cacheNodes(container) {
        // Guarda referencias a los elementos del DOM para no tener que buscarlos cada vez
        this.nodes.aquiferSelect = container.querySelector('#acuifero-select');
        this.nodes.opacitySlider = container.querySelector('#opacity-slider');
        this.nodes.opacityValueSpan = container.querySelector('#opacity-value');
        this.nodes.filterRadios = container.querySelectorAll('input[name="vulnerability"]');
        this.nodes.closeButton = container.querySelector('.panel-close-button');
        this.nodes.coastlineToggle = container.querySelector('#coastline-toggle');
        this.nodes.coastline1kmToggle = container.querySelector('#coastline-1km-toggle');
        // Nodos para el panel de información
        this.nodes.infoPlaceholder = container.querySelector('.info-placeholder');
        this.nodes.infoContent = container.querySelector('.info-content');
        this.nodes.infoTitle = container.querySelector('#info-title');
        this.nodes.infoTable = container.querySelector('#info-table');
    }

    addListeners() {
        // Asigna los eventos a los controles
        this.nodes.closeButton.addEventListener('click', () => this.setPanelCollapsed(true));
        this.nodes.aquiferSelect.addEventListener('change', e => this.onStateChange({ selectedAquifer: e.target.value }));
        this.nodes.opacitySlider.addEventListener('input', e => this.onStateChange({ opacity: parseFloat(e.target.value) }));
        this.nodes.filterRadios.forEach(radio => {
            radio.addEventListener('change', e => this.onStateChange({ filterValue: e.target.value }));
        });
        this.nodes.coastlineToggle.addEventListener('change', e => this.onStateChange({ isCoastlineVisible: e.target.checked }));
        this.nodes.coastline1kmToggle.addEventListener('change', e => this.onStateChange({ isCoastline1kmVisible: e.target.checked }));
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
    }
    
    updateInfoPanel(properties) {
        if (!properties) {
            this.nodes.infoContent.style.display = 'none';
            this.nodes.infoPlaceholder.style.display = 'block';
            return;
        }

        this.nodes.infoPlaceholder.style.display = 'none';
        this.nodes.infoContent.style.display = 'block';
        
        this.nodes.infoTitle.textContent = properties.NOM_ACUIF;

        const details = {
            "Clave:": properties.CLAVE_ACUI,
            "Vulnerabilidad:": properties.VULNERABIL
        };

        this.nodes.infoTable.innerHTML = Object.entries(details)
            .map(([key, value]) => `<tr><td>${key}</td><td>${value}</td></tr>`)
            .join('');
    }
}
