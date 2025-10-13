/**
 * @file dataLoader.js
 * @description Módulo para cargar los datos GeoJSON.
 */

/**
 * Carga un archivo GeoJSON desde una URL.
 * @param {string} url - La URL del archivo GeoJSON.
 * @returns {Promise<object>} - Una promesa que resuelve con los datos GeoJSON.
 */
async function fetchGeoJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`No se pudo cargar el archivo GeoJSON desde ${url}:`, error);
        // Retornamos null o un objeto GeoJSON vacío para evitar que la app se rompa.
        return null;
    }
}

export { fetchGeoJSON };
