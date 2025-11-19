/**
 * @file uiManager.js
 * @description Módulo encargado de la gestión de la interfaz de usuario (paneles, controles, eventos).
 * Integra la lógica para el panel lateral responsivo y el panel de información.
 */

import { CONFIG } from './config.js';

export class UiManager {
    constructor(app) {
        this.app = app;
        this.map = null; // Se asignará cuando se inicie el mapa
        
        // Referencias a elementos del DOM
        this.nodes = {
            uiControl: null,
            uiControlContainer: null,
            openButton: null,
            closeButton: null,
            infoPanel: null,
            infoContent: null,
            loader: document.getElementById('loader'),
            // Elementos dentro del panel (se llenan al cachear)
            radios: [],
            toggles: {},
            inputs: {}
        };
    }

    /**
     * Muestra u oculta el indicador de carga.
     * @param {boolean} isLoading 
     */
    setLoading(isLoading) {
        if (this.nodes.loader) {
            this.nodes.loader.style.opacity = isLoading ? '1' : '0';
            setTimeout(() => {
                this.nodes.loader.style.display = isLoading ? 'flex' : 'none';
            }, 300);
        }
    }

    /**
     * Actualiza la interfaz según el estado de la aplicación.
     * Sincroniza los inputs visuales con el estado interno (state).
     * @param {Object} state - Estado actual de la aplicación.
     */
    updateView(state) {
        if (!this.nodes.uiControlContainer) return;

        // 1. Actualizar Radios (Vulnerabilidad)
        const radio = this.nodes.radios.find(r => r.value === state.currentVulnerabilityLayer);
        if (radio) radio.checked = true;

        // 2. Actualizar Toggles (Capas base/overlay)
        if (this.nodes.toggles.clip) this.nodes.toggles.clip.checked = state.layers.clip;
        if (this.nodes.toggles.graticule) this.nodes.toggles.graticule.checked = state.layers.graticule;
        if (this.nodes.toggles.municipalities) this.nodes.toggles.municipalities.checked = state.layers.municipalities;

        // 3. Actualizar Inputs numéricos y selects
        if (this.nodes.inputs.opacity) this.nodes.inputs.opacity.value = state.opacity;
        if (this.nodes.inputs.acuifero) this.nodes.inputs.acuifero.value = state.selectedAcuifero || "";
    }

    /**
     * Inicializa el botón flotante para abrir el panel.
     * Se coloca fuera del panel para estar siempre visible.
     */
    initOpenButton() {
        const openBtn = L.DomUtil.create('div', 'leaflet-open-button is-visible');
        openBtn.innerHTML = '☰';
        openBtn.title = 'Abrir Menú';
        
        // Prevenir propagación de clics al mapa
        L.DomEvent.disableClickPropagation(openBtn);
        L.DomEvent.disableScrollPropagation(openBtn);

        openBtn.onclick = (e) => {
            L.DomEvent.stop(e);
            this.togglePanel(true);
        };

        // Añadirlo al contenedor de controles de Leaflet (arriba a la izquierda)
        const leafletControlContainer = document.querySelector('.leaflet-top.leaflet-left');
        if (leafletControlContainer) {
            leafletControlContainer.appendChild(openBtn);
            this.nodes.openButton = openBtn;
        }
    }

    /**
     * Inicializa el panel principal de controles como un L.Control personalizado.
     */
    initControlsPanel() {
        const UiControl = L.Control.extend({
            // La posición es referencial, el CSS (.leaflet-custom-controls) tiene la última palabra
            options: { position: 'topleft' },

            onAdd: () => {
                // Crear contenedor principal con la clase 'collapsed' por defecto (cerrado al inicio)
                const container = L.DomUtil.create('div', 'leaflet-custom-controls collapsed');
                this.nodes.uiControlContainer = container;
                
                // Insertar contenido desde el <template> HTML
                const template = document.querySelector('#panel-template');
                if (template) {
                    container.appendChild(template.content.cloneNode(true));
                } else {
                    console.error("Error crítico: No se encontró el elemento #panel-template en el HTML.");
                    container.innerHTML = "<p style='color:red'>Error de plantilla</p>";
                }

                // Generar dinámicamente los radio buttons de vulnerabilidad
                this.generateVulnerabilityRadios(container);

                // --- CORRECCIÓN CRÍTICA DE POSICIONAMIENTO ---
                // Eliminamos cualquier cálculo manual de 'top' o 'left' con JS.
                // Confiamos puramente en el CSS para la responsividad.
                
                // Prevenir que los eventos del mouse/touch atraviesen el panel y muevan el mapa
                L.DomEvent.disableScrollPropagation(container);
                L.DomEvent.disableClickPropagation(container);

                // Cachear referencias a los elementos internos y añadir eventos
                // Se hace en un timeout 0 para asegurar que el DOM esté listo
                setTimeout(() => {
                    this.cacheNodes(container);
                    this.addListeners();
                }, 0);

                return container;
            }
        });

        this.nodes.uiControl = new UiControl();
        this.nodes.uiControl.addTo(this.map); // this.map se asigna desde Main
    }

    /**
     * Genera dinámicamente los radio buttons para las capas de vulnerabilidad
     * basándose en la configuración (CONFIG.layers).
     */
    generateVulnerabilityRadios(container) {
        const radioGroup = container.querySelector('.radio-group');
        if (!radioGroup) return;

        radioGroup.innerHTML = ''; // Limpiar contenido previo

        Object.entries(CONFIG.layers).forEach(([key, layerConfig]) => {
            const uniqueId = `radio-${key}`;
            
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'vulnerabilidad';
            input.id = uniqueId;
            input.value = key;
            
            const label = document.createElement('label');
            label.htmlFor = uniqueId;
            label.textContent = layerConfig.name; // Usar nombre corto o completo según config

            radioGroup.appendChild(input);
            radioGroup.appendChild(label);
        });
    }

    /**
     * Guarda referencias a los elementos del DOM dentro del panel para acceso rápido.
     */
    cacheNodes(container) {
        // Botón de cerrar (dentro del panel)
        this.nodes.closeButton = container.querySelector('.panel-close-button');

        // Radios
        this.nodes.radios = Array.from(container.querySelectorAll('input[name="vulnerabilidad"]'));

        // Toggles (Interruptores)
        this.nodes.toggles = {
            clip: container.querySelector('#toggle-clip'),
            graticule: container.querySelector('#toggle-graticule'),
            municipalities: container.querySelector('#toggle-municipalities')
        };

        // Inputs y Selects
        this.nodes.inputs = {
            opacity: container.querySelector('#opacity-slider'),
            acuifero: container.querySelector('#acuifero-select'),
            search: container.querySelector('#search-input'),
            coordLat: document.getElementById('lat-input'), // Puede estar fuera del panel
            coordLng: document.getElementById('lng-input'),
            coordName: document.getElementById('coord-name')
        };

        // Botones de acción
        this.nodes.buttons = {
            reset: container.querySelector('#reset-view'),
            addPoint: document.getElementById('add-coord-btn')
        };
        
        // Contenedor de resultados de búsqueda
        this.nodes.searchResults = container.querySelector('#search-results-container');
    }

    /**
     * Configura todos los "Event Listeners" (clics, cambios, inputs).
     * Conecta la vista con los métodos del App/State.
     */
    addListeners() {
        // 1. Cerrar Panel
        if (this.nodes.closeButton) {
            this.nodes.closeButton.onclick = (e) => {
                L.DomEvent.stop(e); // Detener propagación es crucial
                this.togglePanel(false);
            };
        }

        // 2. Cambiar Capa de Vulnerabilidad
        this.nodes.radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.app.handleLayerChange(e.target.value);
                }
            });
        });

        // 3. Slider de Opacidad
        if (this.nodes.inputs.opacity) {
            this.nodes.inputs.opacity.addEventListener('input', (e) => {
                this.app.handleOpacityChange(parseFloat(e.target.value));
            });
        }

        // 4. Toggles (Clip, Graticule, Municipios)
        if (this.nodes.toggles.clip) {
            this.nodes.toggles.clip.addEventListener('change', (e) => {
                this.app.handleToggleChange('clip', e.target.checked);
            });
        }
        if (this.nodes.toggles.graticule) {
            this.nodes.toggles.graticule.addEventListener('change', (e) => {
                this.app.handleToggleChange('graticule', e.target.checked);
            });
        }
        if (this.nodes.toggles.municipalities) {
            this.nodes.toggles.municipalities.addEventListener('change', (e) => {
                this.app.handleToggleChange('municipalities', e.target.checked);
            });
        }

        // 5. Selector de Acuíferos
        if (this.nodes.inputs.acuifero) {
            this.nodes.inputs.acuifero.addEventListener('change', (e) => {
                this.app.handleAcuiferoSelect(e.target.value);
            });
        }

        // 6. Botón Restablecer Vista
        if (this.nodes.buttons.reset) {
            this.nodes.buttons.reset.addEventListener('click', () => {
                this.app.resetView();
            });
        }

        // 7. Búsqueda de Acuíferos (Input)
        if (this.nodes.inputs.search) {
            this.nodes.inputs.search.addEventListener('input', (e) => {
                this.app.handleSearch(e.target.value);
            });
        }

        // 8. Añadir Punto por Coordenadas
        if (this.nodes.buttons.addPoint) {
            this.nodes.buttons.addPoint.addEventListener('click', () => {
                this.app.handleAddCoordinatePoint();
            });
        }
    }

    /**
     * Inicializa el panel inferior/lateral para mostrar información detallada.
     */
    initInfoPanel() {
        this.nodes.infoPanel = document.getElementById('info-panel');
        this.nodes.infoContent = document.getElementById('info-panel-content');
        const closeBtn = document.getElementById('info-panel-close');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.toggleInfoPanel(false);
            });
        }
    }

    /**
     * Abre o cierra el panel principal de controles.
     * Gestiona las clases CSS y la visibilidad del botón de abrir.
     * @param {boolean} show - True para abrir, False para cerrar.
     */
    togglePanel(show) {
        if (!this.nodes.uiControlContainer || !this.nodes.openButton) return;

        if (show) {
            // Abrir: Quitar clase 'collapsed', ocultar botón de abrir
            this.nodes.uiControlContainer.classList.remove('collapsed');
            this.nodes.openButton.classList.remove('is-visible');
        } else {
            // Cerrar: Añadir clase 'collapsed', mostrar botón de abrir
            this.nodes.uiControlContainer.classList.add('collapsed');
            this.nodes.openButton.classList.add('is-visible');
        }
    }

    /**
     * Abre o cierra el panel de información detallada.
     * @param {boolean} show - True para mostrar, False para ocultar.
     */
    toggleInfoPanel(show) {
        if (!this.nodes.infoPanel) return;

        if (show) {
            this.nodes.infoPanel.classList.add('is-visible');
        } else {
            this.nodes.infoPanel.classList.remove('is-visible');
        }
    }

    /**
     * Actualiza el contenido HTML del panel de información.
     * @param {string} htmlContent - Código HTML a inyectar.
     */
    updateInfoPanel(htmlContent) {
        if (this.nodes.infoContent) {
            this.nodes.infoContent.innerHTML = htmlContent;
            this.toggleInfoPanel(true); // Abrir automáticamente al actualizar
        }
    }
    
    /**
     * Muestra los resultados de la búsqueda de acuíferos.
     * @param {Array} results - Lista de acuíferos encontrados.
     */
    showSearchResults(results) {
        const container = this.nodes.searchResults;
        if (!container) return;

        container.innerHTML = '';
        
        if (results.length === 0) {
            container.style.display = 'none';
            return;
        }

        results.forEach(acuifero => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<strong>${acuifero.properties.CLAVE}</strong> - ${acuifero.properties.NOMBRE}`;
            div.onclick = () => {
                this.app.handleAcuiferoSelect(acuifero.properties.CLAVE);
                container.style.display = 'none';
                if(this.nodes.inputs.search) this.nodes.inputs.search.value = '';
            };
            container.appendChild(div);
        });

        container.style.display = 'block';
    }
}
