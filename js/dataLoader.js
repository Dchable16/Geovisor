/**
 * @file dataLoader.js
 * @description Módulo para cargar los datos GeoJSON.
 * PARCHEADO: Manejo de errores robusto con notificaciones visuales (Fase 1).
 */

/**
 * Helper interno para mostrar notificaciones de error en la UI.
 * Evita la duplicación de alertas si fallan múltiples archivos a la vez.
 * @param {string} message - El mensaje a mostrar.
 */
function _showErrorNotification(message) {
    // Si ya existe una alerta visible, no creamos otra para no saturar la pantalla
    if (document.querySelector('.dataload-error-toast')) return;

    const alertBox = document.createElement('div');
    alertBox.className = 'dataload-error-toast';
    // Estilos inline para asegurar que se vea sin necesidad de editar el CSS ahora mismo
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
 * @returns {Promise<object>} - Una promesa que resuelve con los datos o null si falla.
 */
export async function fetchGeoJSON(url) {
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`❌ No se pudo cargar el archivo desde ${url}:`, error);
        
        // Notificar al usuario visualmente
        const fileName = url.split('/').pop();
        _showErrorNotification(`Error cargando datos (${fileName}). Verifique su conexión.`);
        
        return null; // Retornamos null para que el código principal sepa que falló
    }
}

/**
 * Carga múltiples archivos GeoJSON desde un array de URLs en paralelo.
 * @param {string[]} urls - El array de URLs de los archivos GeoJSON.
 * @returns {Promise<object[]>} - Una promesa que resuelve con un array de datos GeoJSON válidos.
 */
export async function fetchAllGeoJSON(urls) {
    try {
        // Mapea cada URL a una promesa de fetchGeoJSON
        const promises = urls.map(url => fetchGeoJSON(url));
        
        // Espera a que todas las promesas se resuelvan (incluso si alguna falla y devuelve null)
        const results = await Promise.all(promises);
        
        // Filtramos cualquier resultado nulo (archivos que fallaron al cargar) para no romper el mapa
        const validData = results.filter(data => data !== null);

        if (validData.length === 0 && urls.length > 0) {
            _showErrorNotification("Fallo crítico: No se pudo cargar ninguna capa de datos.");
        } else if (validData.length < urls.length) {
            console.warn(`Advertencia: Se cargaron ${validData.length} de ${urls.length} archivos.`);
        }

        return validData;
    } catch (error) {
        console.error("Error crítico cargando archivos GeoJSON en paralelo:", error);
        _showErrorNotification("Error del sistema al inicializar la carga de datos.");
        return [];
    }
}
