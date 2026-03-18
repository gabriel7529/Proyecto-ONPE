const { chromium } = require('playwright');

async function descargarONPE(dni, digitoVerificador, fechaNacimiento) {
    let browser;
    try {
        

        if (!proxyServer) throw new Error('Falta PROXY_SERVER en variables de entorno');

        console.log(`[ONPE] Lanzando navegador con proxy residencial...`);

        browser = await chromium.launch({
            headless: true,
            proxy: {
                server:   proxyServer,
                username: proxyUser,
                password: proxyPassword
            },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-accelerated-2d-canvas',
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'es-PE',
            timezoneId: 'America/Lima',
        });

        const page = await context.newPage();

        console.log(`[ONPE] Navegando...`);
        await page.goto('https://consultaelectoral.onpe.gob.pe/inicio', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        const inputDniSelector = 'input[placeholder="Número de DNI"]';
        try {
            await page.waitForSelector(inputDniSelector, { state: 'visible', timeout: 20000 });
            console.log('[ONPE] Formulario cargado.');
        } catch (e) {
            await page.screenshot({ path: '/app/logs/error_inicio.png' });
            throw new Error('No cargó el formulario. Verifica el proxy.');
        }

        await page.fill(inputDniSelector, dni);
        await page.click('button[name="favorito"]');
        console.log('[ONPE] DNI enviado. Esperando respuesta...');

        const resultadoLocator = page.locator(
            '.m_mesa:has-text("NO ERES MIEMBRO DE MESA"), .bloquecredenciales'
        );
        await resultadoLocator.first().waitFor({ state: 'visible', timeout: 20000 });

        const noEsMiembro = await page
            .locator('.m_mesa:has-text("NO ERES MIEMBRO DE MESA")')
            .isVisible();

        if (noEsMiembro) {
            return { esMiembro: false, mensaje: 'NO ERES MIEMBRO DE MESA' };
        }

        console.log(`[ONPE] Es miembro. Llenando verificación...`);
        await page.click('.bloquecredenciales');
        await page.waitForSelector('input[placeholder="#"]');

        await page.locator('input[placeholder="#"]').pressSequentially(
            digitoVerificador.toString(), { delay: 150 }
        );
        await page.locator('input[placeholder="DD/MM/AAAA"]').pressSequentially(
            fechaNacimiento, { delay: 150 }
        );
        await page.keyboard.press('Tab');

        const btnDescargar = page
            .locator('button.button_estilo1', { hasText: 'Descargar' })
            .first();
        await btnDescargar.waitFor({ state: 'visible', timeout: 20000 });

        const peticionS3Promise = context.waitForEvent('request', req =>
            req.url().includes('amazonaws.com')
        );

        await btnDescargar.click();
        const peticionS3 = await peticionS3Promise;
        const urlPdf = peticionS3.url();

        if (!urlPdf) throw new Error('URL del PDF vino vacía.');

        console.log(`[ONPE] URL capturada: ${urlPdf}`);
        return { esMiembro: true, mensaje: 'URL generada exitosamente', urlPdf };

    } catch (error) {
        console.error(`[ONPE] Error:`, error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { descargarONPE };
