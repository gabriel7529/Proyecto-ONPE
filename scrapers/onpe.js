const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function descargarONPE(dni, digitoVerificador, fechaNacimiento) {
    let browser;
    try {
        console.log(`[Scraper ONPE] Iniciando misión para DNI: ${dni}...`);

        // headless: false para que veas la magia ocurrir.
        // Cuando lo subas a tu servidor final (producción), cámbialo a true.
        browser = await chromium.launch({
            headless: true, // Ahora sí en true
            args: [
                '--disable-blink-features=AutomationControlled', // Quita la marca de "automatizado"
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        const context = await browser.newContext({
            acceptDownloads: true,
            // Ponemos un User Agent de una PC normal
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 } // Un tamaño de pantalla real
        });
        const page = await context.newPage();

        await page.goto('https://consultaelectoral.onpe.gob.pe/inicio');
        await page.waitForLoadState('networkidle');

        // --- FASE 1: LA CONSULTA INICIAL ---
        console.log(`[Scraper ONPE] Escribiendo DNI en el portal...`);
        // Usamos el placeholder porque los mat-input cambian de número
        await page.screenshot({ path: 'onpe_error.png' });
        console.log("Captura de pantalla guardada en el VPS");
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

        // 1. Preparamos la promesa para capturar la nueva página
        const nuevaPestanaPromise = context.waitForEvent('page');

        // 2. Hacemos clic en el botón de descargar
        await btnDescargar.click();

        // 3. CAPTURA INMEDIATA: Esperamos a que la pestaña exista, pero NO a que cargue
        const nuevaPestana = await nuevaPestanaPromise;

        // Le damos un respiro de medio segundo solo para que la URL se actualice de 'about:blank' a la de AWS
        await page.waitForTimeout(500);

        const urlPdfFinal = nuevaPestana.url();

        console.log(`[Scraper ONPE] ¡URL ATRAPADA CON ÉXITO!`);
        console.log(`[URL]: ${urlPdfFinal}`);

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
