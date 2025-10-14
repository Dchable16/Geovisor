/**
 * @file uiManager.js
 * @description Gestiona el panel de controles y la interacción del usuario.
 */
export class UIManager {
    constructor(map, onStateChange) {
        this.map = map;
        this.onStateChange = onStateChange; // Callback para notificar cambios de estado
        this.nodes = {}; // Almacenará referencias a los elementos del DOM
        this.nodes.loader = document.querySelector('#app-loader');
        this.initControlsPanel();
        this.initOpenButton();
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
    
    cacheNodes(container) {
        this.nodes.aquiferSelect = container.querySelector('#acuifero-select');
        this.nodes.opacitySlider = container.querySelector('#opacity-slider');
        this.nodes.opacityValueSpan = container.querySelector('#opacity-value');
        this.nodes.filterRadios = container.querySelectorAll('input[name="vulnerability"]');
        this.nodes.closeButton = container.querySelector('.panel-close-button');
        this.nodes.coastlineToggle = container.querySelector('#coastline-toggle');
        this.nodes.coastline1kmToggle = container.querySelector('#coastline-1km-toggle');
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
}
