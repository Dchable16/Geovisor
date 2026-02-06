/**
 * @file dataLoader.js
 * @description Módulo para cargar los datos GeoJSON.
 * Incluye control de concurrencia para evitar saturar el navegador y notificaciones de error.
 */

/**
 * Helper interno para mostrar notificaciones de error visuales en la UI.
 * @param {string} message - El mensaje a mostrar.
 */
function _showErrorNotification(message) {
    // Evitar duplicar la alerta si ya existe una
    if (document.querySelector('.dataload-error-toast')) return;

    const alertBox = document.createElement('div');
    alertBox.className = 'dataload-error-toast';
    // Estilos inline para asegurar visibilidad inmediata sin depender de CSS externo
    alertBox.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #e74c3c;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: fadeIn 0.3s ease-in-out;
    `;

    alertBox.innerHTML = `
        <span style="font-size: 1.2em">⚠️</span>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:white; cursor:pointer; font-weight:bold; font-size:16px; margin-left:10px;">&times;</button>
    `;

    document.body.appendChild(alertBox);

    // Auto-eliminar después de 8 segundos
    setTimeout(() => {
        if (alertBox.parentElement) alertBox.remove();
    }, 8000);
}

/**
 * Carga un archivo JSON o GeoJSON desde una URL con manejo de errores.
 * @param {string} url - La URL del archivo.
 * @returns {Promise<object|null>} - Promesa con los datos o null si falla.
 */
export async function fetchGeoJSON(url) {
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.warn(`⚠️ Falló la carga de: ${url}`, error);
        // No mostramos alerta por cada archivo individual fallido para no llenar la pantalla,
        // el error se maneja en el lote general o se ignora si es uno solo.
        return null; 
    }
}

/**
 * Carga múltiples archivos GeoJSON en paralelo pero controlando la concurrencia.
 * Evita el error "Failed to fetch" por saturación de red.
 * * @param {string[]} urls - Lista de URLs a cargar.
 * @param {number} concurrency - Cuántas peticiones hacer al mismo tiempo (Default: 5).
 * @returns {Promise<object[]>} - Array con los GeoJSONs cargados correctamente.
 */
export async function fetchAllGeoJSON(urls, concurrency = 5) {
    const results = [];
    const total = urls.length;
    
    // Función para procesar un sub-grupo de URLs
    async function processBatch(batch) {
        const promises = batch.map(url => fetchGeoJSON(url));
        return await Promise.all(promises);
    }

    try {
        // Iterar sobre las URLs en pasos de 'concurrency'
        for (let i = 0; i < total; i += concurrency) {
            const batch = urls.slice(i, i + concurrency);
            
            // Esperar a que este lote termine antes de lanzar el siguiente
            const batchResults = await processBatch(batch);
            results.push(...batchResults);
        }

        // Filtrar nulos (archivos que fallaron)
        const validData = results.filter(data => data !== null);

        // Notificar si hubo fallos masivos
        if (validData.length === 0 && urls.length > 0) {
            _showErrorNotification("Error crítico: No se pudo cargar ninguna capa de datos.");
        } else if (validData.length < urls.length) {
            console.warn(`Advertencia: Se cargaron ${validData.length} de ${urls.length} archivos.`);
            // Opcional: Notificar al usuario que faltan algunos datos
            // _showErrorNotification(`Atención: Algunos archivos (${urls.length - validData.length}) no se cargaron.`);
        }

        return validData;

    } catch (error) {
        console.error("Error crítico en el cargador de datos:", error);
        _showErrorNotification("Error del sistema al inicializar la carga de datos.");
        return [];
    }
}
