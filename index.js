const express = require('express');
const cors = require('cors');
const { calcularDigito } = require('./utils/dni');
const { obtenerFecha } = require('./scrapers/fechaNacimiento');
const { descargarONPE } = require('./scrapers/onpe');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.post('/api/credencial', async (req, res) => {
    const { dni } = req.body;

    if (!dni || dni.length !== 8 || isNaN(dni)) {
        return res.status(400).json({ error: 'DNI inválido. Debe tener 8 dígitos numéricos.' });
    }

    try {
        console.log(`\n--- Iniciando proceso para DNI: ${dni} ---`);

        const digitoVerificador = calcularDigito(dni);
        console.log(`Dígito verificador: ${digitoVerificador}`);

        const fechaNacimiento = await obtenerFecha(dni);
        if (!fechaNacimiento) {
            return res.status(404).json({ error: 'No se encontró la fecha de nacimiento.' });
        }
        console.log(`Fecha de nacimiento: ${fechaNacimiento}`);

        const resultado = await descargarONPE(dni, digitoVerificador, fechaNacimiento);

        if (!resultado.esMiembro) {
            return res.json({
                success: true,
                esMiembro: false,
                mensaje: resultado.mensaje
            });
        }

        return res.json({
            success: true,
            esMiembro: true,
            mensaje: resultado.mensaje,
            url_descarga: resultado.urlPdf
        });

    } catch (error) {
        console.error('Error en el proceso:', error.message);
        res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
