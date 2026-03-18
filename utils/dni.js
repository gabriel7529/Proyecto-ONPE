function calcularDigito(dni) {
    const pesos = [3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;

    for (let i = 0; i < 8; i++) {
        suma += parseInt(dni.charAt(i)) * pesos[i];
    }

    const resto = suma % 11;
    const diferencia = 11 - resto;

    const equivalencias = [6, 7, 8, 9, 0, 1, 1, 2, 3, 4, 5];
    return equivalencias[diferencia];
}

module.exports = { calcularDigito };
