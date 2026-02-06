/**
 * @file dataLoader.js
 * @description Módulo para cargar los datos GeoJSON con control de concurrencia.
 * PARCHEADO: Carga por lotes para evitar 'Failed to fetch' por saturación de red.
 */

// ... (Mantén la función _showErrorNotification igual que antes) ...
function _showErrorNotification(message) {
    if (document.querySelector('.dataload-error-toast')) return;
    const alertBox = document.createElement('div');
    alertBox.className = 'dataload-error-toast';
    alertBox.style.cssText = `position: fixed; top: 20px; right: 20px; background-color: #e74c3c; color: white; padding: 16px 24px; border-radius: 8px; z-index: 9999; font-family: sans-serif; display: flex; gap: 12px; animation: fadeIn 0.3s ease-in-out; box-shadow: 0 4px 12px rgba(0,0,0,0.2);`;
    alertBox.innerHTML = `<span style="font-size: 1.2em">⚠️</span><span>${message}</span><button onclick="this.parentElement.remove()" style="background:none; border:none; color:white; cursor:pointer; font-weight:bold; margin-left:10px;">&times;</button>`;
    document.body.appendChild(alertBox);
    setTimeout(() => { if (alertBox.parentElement) alertBox.remove(); }, 8000);
}

// ... (Mantén fetchGeoJSON igual que antes) ...
export async function fetchGeoJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`❌ Falló carga: ${url}`, error);
        return null;
    }
}

/**
 * Carga múltiples archivos con límite de concurrencia (Batching).
 * Evita saturar el navegador con demasiadas peticiones simultáneas.
 */
export async function fetchAllGeoJSON(urls, concurrency = 5) {
    const results = [];
    const total = urls.length;
    
    // Función auxiliar para procesar un lote
    async function processBatch(batch) {
        const promises = batch.map(url => fetchGeoJSON(url));
        return await Promise.all(promises);
    }

    try {
        // Procesar en bucle por lotes
        for (let i = 0; i < total; i += concurrency) {
            const batch = urls.slice(i, i + concurrency);
            // console.log(`Cargando lote ${i/concurrency + 1}...`); // Opcional: Debug
            const batchResults = await processBatch(batch);
            results.push(...batchResults);
        }

        const validData = results.filter(data => data !== null);
        
        if (validData.length === 0 && urls.length > 0) {
            _showErrorNotification("No se pudieron cargar las capas de datos.");
        } else if (validData.length < urls.length) {
            console.warn(`Advertencia: Se cargaron ${validData.length} de ${urls.length} archivos.`);
        }

        return validData;
    } catch (error) {
        console.error("Error crítico en carga por lotes:", error);
        return [];
    }
}
