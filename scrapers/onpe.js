const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Le decimos a Playwright que use el plugin de sigilo globalmente
chromium.use(stealth);

async function descargarONPE(dni, digitoVerificador, fechaNacimiento) {
    let browser;
    try {
        console.log(`[Scraper ONPE] Iniciando navegación sigilosa...`);

        browser = await chromium.launch({
            headless: true, // Modo invisible (obligatorio para el VPS)
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Clave para evitar que Docker se quede sin memoria
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'es-PE',
            timezoneId: 'America/Lima',
            acceptDownloads: true
        });

        const page = await context.newPage();

        // 1. Navegamos a la ONPE
        console.log(`[Scraper ONPE] Conectando a la ONPE...`);
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
            throw new Error("Detección de bot persistente o la página tardó demasiado en cargar.");
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

        console.log(`[Scraper ONPE] ¡Botón activado! Preparando intercepción de red...`);

        // EL TRUCO DEFINITIVO: Interceptamos la petición HTTP en toda la ventana (context)
        const peticionS3Promise = context.waitForEvent('request', request =>
            request.url().includes('amazonaws.com')
        );

        // Hacemos clic en "Descargar"
        await btnDescargar.click();

        // Atrapamos la URL en el aire en cuanto sale del navegador
        const peticionS3 = await peticionS3Promise;
        const urlPdfFinal = peticionS3.url();

        if (!urlPdfFinal) {
            throw new Error("Se interceptó la red pero la URL vino vacía");
        }

        console.log(`[Scraper ONPE] ¡URL ATRAPADA CON ÉXITO!`);
        console.log(`[URL]: ${urlPdfFinal}`);

        // Pequeña pausa para que el plugin stealth y las promesas pendientes se resuelvan antes de matar el navegador
        await page.waitForTimeout(1000);

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
