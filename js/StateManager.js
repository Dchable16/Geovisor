/**
 * @file StateManager.js
 * @description Gestiona el estado global de la aplicación (Patrón Observador).
 * "El Cerebro": Centraliza la verdad y notifica cambios.
 */

export class StateManager {
    constructor() {
        // Estado inicial por defecto
        this.state = {
            activeTheme: 'vulnerability', // 'vulnerability' | 'hydraulics'
            selectedAquifer: null,        // Nombre del acuífero seleccionado
            selectedWellId: null,         // ID del pozo seleccionado
            opacity: 0.7,                 // Opacidad de las capas
            filterValue: null,            // Filtro de nivel de vulnerabilidad
            
            // Estado de visibilidad de capas
            areWellsVisible: false,
            isCoastlineVisible: false,
            isCoastline1kmVisible: false,
            isGraticuleVisible: false,
            
            // Acciones especiales (reset, volar a coordenadas)
            flyToCoords: null,            // [lat, lon, zoom]
            reset: false
        };
        
        this.listeners = [];
    }

    /**
     * Suscribe una función para ser notificada cuando el estado cambie.
     * @param {Function} listener - Función callback (recibe el nuevo estado).
     */
    subscribe(listener) {
        this.listeners.push(listener);
    }

    /**
     * Actualiza el estado parcialmente y notifica a los suscriptores.
     * @param {Object} partialState - Objeto con las propiedades a actualizar.
     */
    setState(partialState) {
        // Fusionar estado anterior con el nuevo
        this.state = { ...this.state, ...partialState };
        
        // Logs para depuración (opcional, útil en desarrollo)
        // console.log('Estado actualizado:', this.state);
        
        this.notify();
    }

    /**
     * Obtiene una copia del estado actual.
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Avisa a todos los suscriptores que hubo un cambio.
     */
    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}
