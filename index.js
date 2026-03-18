const express = require('express');
const cors = require('cors');
const { calcularDigito } = require('./utils/dni');
// Importaremos los scrapers más adelante
const { obtenerFecha } = require('./scrapers/fechaNacimiento');
const { descargarONPE } = require('./scrapers/onpe');

const app = express();

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json()); // Para poder leer el body en formato JSON

// El endpoint principal
app.post('/api/credencial', async (req, res) => {
    const { dni } = req.body;

    // Validación básica
    if (!dni || dni.length !== 8 || isNaN(dni)) {
        return res.status(400).json({ error: 'DNI inválido. Debe tener 8 dígitos numéricos.' });
    }

    try {
        console.log(`Iniciando proceso para el DNI: ${dni}`);

        // PASO 1: Calcular dígito verificador (Instantáneo)
        const digitoVerificador = calcularDigito(dni);
        console.log(`Dígito verificador calculado: ${digitoVerificador}`);

        // PASO 2: Extraer fecha de nacimiento (Descomentar cuando armemos el scraper)

        const fechaNacimiento = await obtenerFecha(dni);
        if (!fechaNacimiento) {
            return res.status(404).json({ error: 'No se encontró la fecha de nacimiento' });
        }
        console.log(`Fecha de nacimiento obtenida: ${fechaNacimiento}`);

        const { descargarONPE } = require('./scrapers/onpe');
        const resultado = await descargarONPE(dni, digitoVerificador, fechaNacimiento);

        if (!resultado.esMiembro) {
            return res.json({ success: true, esMiembro: false, mensaje: resultado.mensaje });
        }

        // Si llegó aquí, descargó el PDF con éxito. ¡Se lo enviamos al usuario!
       return res.json({
            success: true,
            esMiembro: true,
            mensaje: resultado.mensaje,
            url_descarga: resultado.urlPdf
        });

        // PASO 3: Automatizar ONPE con Playwright (Descomentar luego)
        /*
        const resultado = await descargarONPE(dni, digitoVerificador, fechaNacimiento);

        if (!resultado.esMiembro) {
            return res.json({ success: true, mensaje: 'El ciudadano NO es miembro de mesa.' });
        }

        // Si es miembro, enviamos el PDF de vuelta al cliente
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=credencial_${dni}.pdf`);
        return res.send(resultado.pdfBuffer);
        */

        // Respuesta temporal para probar que el servidor funciona


    } catch (error) {
        console.error('Error en el proceso:', error);
        res.status(500).json({ error: 'Ocurrió un error interno al procesar la solicitud.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
