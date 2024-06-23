const { fetchBoletim } = require('./boletim');
const { Ok, Err, unwrap } = require('./err');

const express = require('express');

const app = express();

app.get('/', async (req, res) => {
    let result = validateParams(new Map(Object.entries(req.query)));

    if (!result.success) {
        return res.status(400).json(result);
    }

    result = await fetchBoletim(unwrap(result));

    if (!result.success) {
        return res.status(400).json(result);
    }

    return res.status(200).json(unwrap(result));
});

function validateParams(searchParams) {
    let result = {
        studentName: null,
        motherName: null,
        birthDate: null,
        year: null
    };

    if (!searchParams.has('studentName')) {
        return Err('O nome do estudante não existe! (param: studentName)');
    }

    result.studentName = searchParams.get('studentName');

    if (!searchParams.has('motherName')) {
        return Err('O nome da mãe não existe! (param: motherName)');
    }

    result.motherName = searchParams.get('motherName');

    if (!searchParams.has('birthDate')) {
        return Err('A data de nascimento não existe! (param: birthDate)');
    }

    if (!searchParams.get('birthDate').match(/[0-9]{2}\/[0-9]{2}\/[0-9]{4}/g)) {
        return Err('A data de nascimento não esta no formato dd/mm/YYYY! (param: birthDate)');
    }

    result.birthDate = searchParams.get('birthDate');

    if (!searchParams.has('year')) {
        return Err('O ano letivo não foi especificado! (param: year)');
    }

    result.year = parseInt(searchParams.get('year'));

    if (result.year < 2021 || result.year > 2024) {
        return Err('O ano letivo é inválido! (param: year)');
    }

    return Ok(result);
};

app.listen(8080, () => console.log("Server running"));