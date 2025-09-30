init() {
            this.initMap();
            this.loadData();
        },

        initMap() {
            this.leaflet.map = L.map(this.CONFIG.mapId, {
                center: this.CONFIG.initialCoords, zoom: this.CONFIG.initialZoom,
                layers: [this.CONFIG.tileLayers["Neutral (defecto)"]],
                zoomControl: false // Desactivamos el zoom por defecto para controlar el orden
            });
            
            // Añadimos los controles de Leaflet en un orden específico
            L.control.zoom({ position: 'topleft' }).addTo(this.leaflet.map);
            this.initOpenButtonControl(); // 1. Se crea el botón ☰ y Leaflet lo posiciona
            this.initUiControlsPanel();   // 2. Se crea el panel y se alinea con el botón ☰
            
            L.control.layers(this.CONFIG.tileLayers, null, { collapsed: true, position: 'topright' }).addTo(this.leaflet.map);
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
                    `;
                    
                    if (this.state.isPanelCollapsed) container.classList.add('collapsed');
                    
                    // Alinear panel con el botón ☰ usando un micro-retraso
                    setTimeout(() => {
                        const openButtonPos = this.nodes.openButton.offsetTop;
                        container.style.top = `${openButtonPos}px`;
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
                    if (!this.state.isPanelCollapsed) {
                        button.style.opacity = '0'; // Corregir visibilidad inicial
                        button.style.pointerEvents = 'none';
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
            this.nodes.aquiferSelect.addEventListener('change', e => this.handleAquiferSelect(e.target.value));
            this.nodes.opacitySlider.addEventListener('input', e => this.handleOpacityChange(e.target.value));
            this.nodes.filterRadios.forEach(radio => radio.addEventListener('change', e => this.handleFilterChange(e.target.value)));
            this.nodes.closeButton.addEventListener('click', () => this.setPanelCollapsed(true));
        },

        async loadData() { /* Código idéntico a la versión final anterior */ },
        setPanelCollapsed(isCollapsed) {
            this.state.isPanelCollapsed = isCollapsed;
            this.nodes.uiControlContainer.classList.toggle('collapsed', isCollapsed);
            // El CSS ahora se encarga de mostrar/ocultar el botón `☰`
        },
        handleAquiferSelect(aquiferName) { /* ... */ },
        handleOpacityChange(opacity) { /* ... */ },
        handleFilterChange(filterValue) { /* ... */ },
        render() { /* ... */ },
        updateView() { /* ... */ },
        getLayerStyle(layer) { /* ... */ },
        getFeatureStyle(feature) { /* ... */ },
        getColor(v) { /* ... */ },
        processFeature(feature, layer) { /* ... */ },
        populateAquiferSelect() { /* ... */ },
        initLegend() { /* ... */ },
        initLogoControl() { /* ... */ }
    };
    
    // Polyfill con el resto de métodos para completitud y evitar errores
    Object.assign(GeovisorApp, {
        async loadData(){try{const response=await fetch(this.CONFIG.dataUrl);if(!response.ok)throw new Error(`HTTP ${response.status} - ${response.statusText}`);const geojsonData=await response.json();this.leaflet.geojsonLayer=L.geoJson(geojsonData,{style:feature=>this.getFeatureStyle(feature),onEachFeature:(feature,layer)=>this.processFeature(feature,layer)}).addTo(this.leaflet.map);this.populateAquiferSelect();this.updateView();}catch(error){console.error("Error al cargar los datos:",error);alert("No se pudo cargar la capa de datos.");}},
        handleAquiferSelect(aquiferName){this.state.selectedAquiferName=aquiferName||null;if(this.state.selectedAquiferName){this.leaflet.map.fitBounds(L.featureGroup(this.data.aquifers[this.state.selectedAquiferName]).getBounds().pad(0.1));}this.render();},handleOpacityChange(opacity){this.state.opacity=parseFloat(opacity);this.render();},handleFilterChange(filterValue){this.state.filterValue=filterValue;this.render();},
        render(){if(!this.leaflet.geojsonLayer)return;this.leaflet.geojsonLayer.eachLayer(layer=>layer.setStyle(this.getLayerStyle(layer)));this.updateView();},updateView(){this.nodes.opacityValueSpan.textContent=`${Math.round(this.state.opacity*100)}%`;this.nodes.opacitySlider.value=this.state.opacity;},
        getLayerStyle(layer){const{VULNERABIL,NOM_ACUIF}=layer.feature.properties;const matchesFilter=(this.state.filterValue==='all'||VULNERABIL==this.state.filterValue);if(!matchesFilter)return this.CONFIG.styles.muted;let finalStyle=this.getFeatureStyle(layer.feature);const isSelected=(this.state.selectedAquiferName===NOM_ACUIF);if(isSelected)finalStyle={...finalStyle,...this.CONFIG.styles.selection};return finalStyle;},
        getFeatureStyle(feature){return{...this.CONFIG.styles.base,fillColor:this.getColor(feature.properties.VULNERABIL),fillOpacity:this.state.opacity};},getColor(v){const value=parseInt(v,10);switch(value){case 5:return'#D90404';case 4:return'#F25C05';case 3:return'#F2B705';case 2:return'#99C140';case 1:return'#2DC937';default:return'#CCCCCC';}},
        processFeature(feature,layer){const{NOM_ACUIF,CLAVE_ACUI,VULNERABIL}=layer.feature.properties;layer.bindPopup(`<strong>Acuífero:</strong> ${NOM_ACUIF}<br><strong>Clave:</strong> ${CLAVE_ACUI}<br><strong>Vulnerabilidad:</strong> ${VULNERABIL}`);if(!this.data.aquifers[NOM_ACUIF])this.data.aquifers[NOM_ACUIF]=[];this.data.aquifers[NOM_ACUIF].push(layer);layer.on({mouseover:e=>{const h=e.target;h.setStyle(this.CONFIG.styles.hover);h.bringToFront();},mouseout:e=>this.render()});},
        populateAquiferSelect(){this.nodes.aquiferSelect.innerHTML+=Object.keys(this.data.aquifers).sort().map(name=>`<option value="${name}">${name}</option>`).join('');},
        initLegend(){const legend=L.control({position:'bottomright'});legend.onAdd=()=>{const div=L.DomUtil.create('div','info legend');const grades=[1,2,3,4,5],labels=['Muy Baja','Baja','Media','Alta','Muy Alta'];let content='<h4>Vulnerabilidad</h4>';grades.forEach((g,i)=>{content+=`<i style="background:${this.getColor(g)}"></i> ${labels[i]} (Nivel ${g})<br>`;});div.innerHTML=content;return div;};legend.addTo(this.leaflet.map);},
        initLogoControl(){const C=L.Control.extend({onAdd:map=>{const c=L.DomUtil.create('div','leaflet-logo-control');c.innerHTML=`<img src="https://raw.githubusercontent.com/Dchable16/geovisor_vulnerabilidad/main/logos/Logo_SSSIG.png" alt="Logo SSSIG">`;L.DomEvent.disableClickPropagation(c);return c;}});new C({position:'bottomleft'}).addTo(this.leaflet.map);}
    });

    GeovisorApp.init();
});
