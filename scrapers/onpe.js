// IMPORTANTE: Cambiamos la forma de importar
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Le decimos a Playwright que use el plugin de sigilo
chromium.use(stealth);

async function descargarONPE(dni, digitoVerificador, fechaNacimiento) {
    let browser;
    try {
        console.log(`[Scraper ONPE] Iniciando navegación sigilosa...`);

        browser = await chromium.launch({
            headless: true, // Siempre true en el VPS
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'es-PE',
            timezoneId: 'America/Lima'
        });

        const page = await context.newPage();

        // 1. Navegamos a la ONPE
        console.log(`[Scraper ONPE] Conectando a la ONPE desde NY...`);
        await page.goto('https://consultaelectoral.onpe.gob.pe/inicio', {
            waitUntil: 'networkidle', // Espera a que carguen los scripts de Angular
            timeout: 60000
        });

        // 2. Verificación de seguridad: ¿Apareció el input?
        const inputDniSelector = 'input[placeholder="Número de DNI"]';
        try {
            await page.waitForSelector(inputDniSelector, { state: 'visible', timeout: 15000 });
            console.log("[Scraper ONPE] ¡Formulario cargado exitosamente!");
        } catch (e) {
            console.log("[Scraper ONPE] El formulario no aparece. Tomando screenshot...");
            await page.screenshot({ path: 'onpe_error_stealth.png' });
            // Si esto falla, CloudFront nos está filtrando por IP
            throw new Error("Detección de bot persistente.");
        }

        // --- FASE 1: LLENADO ---
        await page.fill(inputDniSelector, dni);
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
