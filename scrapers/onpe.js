const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function descargarONPE(dni, digitoVerificador, fechaNacimiento) {
    let browser;
    try {
        console.log(`[Scraper ONPE] Iniciando misión para DNI: ${dni}...`);

        // headless: false para que veas la magia ocurrir.
        // Cuando lo subas a tu servidor final (producción), cámbialo a true.
        browser = await chromium.launch({ headless: true, slowMo: 50 });
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();

        await page.goto('https://consultaelectoral.onpe.gob.pe/inicio');

        // --- FASE 1: LA CONSULTA INICIAL ---
        console.log(`[Scraper ONPE] Escribiendo DNI en el portal...`);
        // Usamos el placeholder porque los mat-input cambian de número
        await page.fill('input[placeholder="Número de DNI"]', dni);

        console.log(`[Scraper ONPE] Haciendo clic en Consultar...`);
        await page.click('button[name="favorito"]');

        // --- FASE 2: ¿ES MIEMBRO DE MESA? ---
        console.log(`[Scraper ONPE] Esperando respuesta de la ONPE...`);

        // Esperamos a que aparezca O el bloque de "No es miembro" O el bloque de descargar
        const resultadoLocator = page.locator('.m_mesa:has-text("NO ERES MIEMBRO DE MESA"), .bloquecredenciales');
        await resultadoLocator.first().waitFor({ state: 'visible', timeout: 15000 });

        // Verificamos qué apareció en pantalla
        const noEsMiembro = await page.locator('.m_mesa:has-text("NO ERES MIEMBRO DE MESA")').isVisible();

        if (noEsMiembro) {
            console.log(`[Scraper ONPE] El ciudadano NO es miembro de mesa.`);
            return { esMiembro: false, mensaje: 'NO ERES MIEMBRO DE MESA' };
        }

        console.log(`[Scraper ONPE] ¡ES MIEMBRO DE MESA! Procediendo a descargar...`);

        // --- FASE 3: LLENAR DATOS Y DESCARGAR ---
       await page.click('.bloquecredenciales');

        await page.waitForSelector('input[placeholder="#"]');
        console.log(`[Scraper ONPE] Tecleando Código de Verificación y Fecha...`);

        await page.locator('input[placeholder="#"]').click();
        await page.locator('input[placeholder="#"]').pressSequentially(digitoVerificador.toString(), { delay: 100 });

        await page.locator('input[placeholder="DD/MM/AAAA"]').click();
        await page.locator('input[placeholder="DD/MM/AAAA"]').pressSequentially(fechaNacimiento, { delay: 100 });

        // Presionar Tabulador para forzar la validación de Angular
        await page.keyboard.press('Tab');

        console.log(`[Scraper ONPE] Esperando a que el botón Descargar esté listo...`);
        // Usamos una combinación que asegure que atrapamos el botón correcto
        const btnDescargar = page.locator('button.button_estilo1', { hasText: 'Descargar' }).first();
        await btnDescargar.waitFor({ state: 'visible', timeout: 15000 });

        console.log(`[Scraper ONPE] ¡Botón activado! Preparando trampa para la nueva pestaña...`);

        // EL TRUCO CORREGIDO: Le decimos a Playwright que espere a que se abra una NUEVA PESTAÑA
        const [nuevaPestana] = await Promise.all([
            context.waitForEvent('page'), // Escucha el evento de nueva pestaña
            btnDescargar.click()          // Hace el clic que detona la nueva pestaña
        ]);

        // Esperamos un milisegundo a que la pestaña empiece a cargar
        await nuevaPestana.waitForLoadState('domcontentloaded');

        // ¡Le robamos la URL a la nueva pestaña!
        const urlPdfFinal = nuevaPestana.url();

        console.log(`[Scraper ONPE] ¡URL ATRAPADA CON ÉXITO!`);

        return {
            esMiembro: true,
            mensaje: 'URL generada exitosamente',
            urlPdf: urlPdfFinal
        };

    } catch (error) {
        console.error(`[Scraper ONPE] Error crítico:`, error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { descargarONPE };
