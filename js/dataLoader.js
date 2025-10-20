/**
 * @file dataLoader.js
 * @description Módulo para cargar los datos GeoJSON.
 */

/**
 * Carga un archivo JSON o GeoJSON desde una URL.
 * @param {string} url - La URL del archivo.
 * @returns {Promise<object>} - Una promesa que resuelve con los datos.
 */
export async function fetchGeoJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`No se pudo cargar el archivo desde ${url}:`, error);
        return null;
    }
}

/**
 * Carga múltiples archivos GeoJSON desde un array de URLs en paralelo.
 * @param {string[]} urls - El array de URLs de los archivos GeoJSON.
 * @returns {Promise<object[]>} - Una promesa que resuelve con un array de datos GeoJSON.
 */
export async function fetchAllGeoJSON(urls) {
    try {
        // Mapea cada URL a una promesa de fetchGeoJSON
        const promises = urls.map(url => fetchGeoJSON(url));
        
        // Espera a que todas las promesas se resuelvan
        const results = await Promise.all(promises);
        
        // Filtramos cualquier resultado nulo (archivos que fallaron al cargar)
        return results.filter(data => data !== null);
    } catch (error) {
        console.error("Error cargando archivos GeoJSON en paralelo:", error);
        return [];
    }
}
