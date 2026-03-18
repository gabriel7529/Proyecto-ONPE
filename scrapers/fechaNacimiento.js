const { chromium } = require('playwright');

async function obtenerFecha(dni) {
    let browser;
    try {
        console.log(`[Scraper Fecha] Abriendo navegador para el DNI: ${dni}...`);

        // Mantenemos headless en false por ahora para que veas la magia
        browser = await chromium.launch({ headless: true, slowMo: 50 });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto('https://dniperu.com/buscar-fecha-de-nacimiento-con-dni-peru/');

        // 1. Usamos los IDs exactos del HTML que encontraste
        console.log(`[Scraper Fecha] Escribiendo DNI...`);
        await page.fill('#dni', dni);

        // 2. Hacemos clic en el botón exacto
        console.log(`[Scraper Fecha] Haciendo clic en Consultar...`);
        await page.click('#submit-button');

        // 3. LA SOLUCIÓN AL PROBLEMA:
        // En lugar de solo esperar a que exista el textarea, esperamos a que el textarea
        // realmente contenga el texto "Fecha de Nacimiento". Esto burla la pantalla de carga.
        console.log(`[Scraper Fecha] Esperando a que el servidor de ellos responda...`);
        await page.waitForFunction(() => {
            const textarea = document.querySelector('.result-textarea');
            // Retorna true solo cuando el textarea tiene texto y ya no está vacío
            return textarea && textarea.value.includes('Fecha de Nacimiento');
        }, { timeout: 15000 });

        // 4. Ahora sí, extraemos el texto con total seguridad
        const textoCompleto = await page.inputValue('.result-textarea');
        console.log(`[Scraper Fecha] Texto crudo obtenido:\n${textoCompleto}`);

        // 5. Aplicamos nuestras tijeras (Regex)
        const match = textoCompleto.match(/Fecha de Nacimiento:\s*(\d{2}\/\d{2}\/\d{4})/i);

        if (match && match[1]) {
            const fechaLimpia = match[1];
            console.log(`[Scraper Fecha] ¡ÉXITO TOTAL! Fecha extraída: ${fechaLimpia}`);
            return fechaLimpia;
        } else {
            throw new Error('El texto cargó, pero el formato no es el esperado.');
        }

    } catch (error) {
        console.error(`[Scraper Fecha] Error:`, error.message);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { obtenerFecha };
