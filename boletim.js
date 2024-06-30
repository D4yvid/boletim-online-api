const { JSDOM } = require('jsdom');
const { Ok, Err, expect, unwrap } = require('./err');

const URL_BASE = 'https://www.seduc.pa.gov.br/portal/boletim_online/';

const parseCookies = (cookieString) => {
    try {
        let cookies = {};
        let parts = cookieString.split(';');

        for (let part of parts) {
            let [key, value] = part.split('=');

            cookies[key.trim()] = value.trim();
        }

        return Ok(cookies);
    } catch (e) {
        return Err(e.message);
    }
}

const sendFormRequest = async ({ studentName, motherName, birthDate, year }) => {
    let body = new URLSearchParams({
        txtAnoLetivo: year.toString(),
        txtDataNascimento: birthDate,
        txtNomeAluno: studentName.toLowerCase(),
        txtNomeMae: motherName.toLowerCase(),
        rdTipoBoletim: '1',
        btnVisualiza: 'Pesquisar'
    });

    try {
        let response = await fetch(URL_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        let text = await response.text();

        if (text.indexOf("O aluno informado") != -1) {
            return Err("The user doesn't exist");
        }

        let windowLocation = text.lastIndexOf('window.location');

        if (windowLocation <= 0) {
            return Err("The user doesn't exist");
        }

        let semicolonLocation = text.slice(windowLocation).indexOf("';") + 2; // To include the ';
        let line = text.slice(windowLocation).slice(0, semicolonLocation);

        // Now get everything inside single quotes
        let result = /window\.location = '(.*?)';/g.exec(line)[1];

        let cookies = expect(parseCookies(response.headers.get('Set-Cookie')));

        return Ok({ actionUrl: result, sessionId: cookies['PHPSESSID'] });
    } catch (e) {
        return Err(e.message);
    }
};

const getBoletimURL = async ({ actionUrl, sessionId }) => {
    try {
        let response = await fetch(URL_BASE + actionUrl, {
            headers: {
                'Cookie': `PHPSESSID=${sessionId}`
            }
        });

        if (response.status != 200) {
            return Err(response.statusText);
        }

        return Ok({ boletimUrl: 'visualizaBoletim.php' });
    } catch (e) {
        return Err(e.message);
    }
}

const parseDataTable = (dataTable) => {
    try {
        // Escola: School
        // Aluno(a): Student
        // Data de Nascimento: Date of Birth
        // Curso: Course
        // Série: Grade
        // Turma: Class
        // Turno: Shift
        // Cidade: City
        // Estado: State
        // Ano Letivo: Academic Year
        const TABLE_FIELD_TO_DATA_TABLE = {
            'Escola': 'school',
            'Aluno(a)': 'name',
            'Data de Nascimento': 'birthDate',
            'Curso': 'course',
            'Série': 'grade',
            'Turma': 'class',
            'Turno': 'shift',
            'Cidade': 'city',
            'Estado': 'state',
            'Ano Letivo': 'academicYear'
        };

        let data = {
            school: null,
            name: null,
            course: null,
            class: null,
            city: null,
            birthDate: null,
            grade: null,
            shift: null,
            state: null,
            academicYear: null,
        };

        /** @type {NodeList} rows */
        let rows = dataTable.querySelectorAll('tbody > tr');

        for (let row of rows) {
            let children = row.childNodes;
            let nextIsValue = false;
            let key;

            for (let child of children) {
                let name = child.nodeName.toLowerCase();
                let content = child.textContent;

                if (name == '#text' || name == '#comment') continue;

                if (name == 'th' && nextIsValue) {
                    return Err("Malformed table data");
                } else if (name == 'th') {
                    nextIsValue = true;

                    let normalizedName = content.replaceAll(':', '').replaceAll(/ - ([0-9]*)/g, '').trim();

                    if (!TABLE_FIELD_TO_DATA_TABLE[normalizedName]) {
                        continue;
                    }

                    key = TABLE_FIELD_TO_DATA_TABLE[normalizedName];

                    continue;
                }

                if (name == 'td' && !nextIsValue) {
                    return Err("Malformed table data");
                } else if (name == 'td') {
                    nextIsValue = false;

                    data[key] = content.trim() == '' ? null : content.trim();

                    key = null;
                    continue;
                }
            }
        }

        return Ok(data);
    } catch (e) {
        return Err(e.message);
    }
};

const parseCurricularDataTable = (gradesTable) => {
    try {
        let data = [];
        let rows = gradesTable.querySelectorAll('tbody > tr');

        for (let row of rows) {
            const ROW_DATA_NAME_FROM_INDEX = [
                'subject',
                'grades',
                'grades',
                'grades',
                'grades',
                'annualGradeAverage',
                'absences',
                'annualFrequence',
                'finalResult'
            ];
            const INDEX_OF_GRADES = ROW_DATA_NAME_FROM_INDEX.indexOf('grades');

            let rowIndex = 0;
            let hasData = false;
            let rowData = {
                subject: null,
                grades: {
                    1: 0,
                    2: 0,
                    3: 0,
                    4: 0
                },
                annualGradeAverage: 0,
                absences: 0,
                annualFrequence: 0,
                finalResult: null
            };

            let children = row.childNodes;
            let skipRow = false;

            for (let child of children) {
                if (skipRow) continue;

                let name = child.nodeName.toLowerCase();
                let content = child.textContent;

                if (name == '#text' || name == '#comment') continue;

                if (content == 'Componentes Curriculares' || content == '1ª Av' || content == 'Resultado Final Matrícula Regular: ' ||
                    content == 'Frequência Anual(%):') {
                    skipRow = true;
                    continue;
                }

                let dataName = ROW_DATA_NAME_FROM_INDEX[rowIndex];

                if (dataName == 'grades') {
                    let gradeIndex = INDEX_OF_GRADES + rowIndex - 1;

                    rowData.grades[gradeIndex] = parseFloat(content.trim().replace(',', '.'));
                    hasData = true;
                } else {
                    if (dataName != 'subject' && dataName != 'finalResult')
                        rowData[dataName] = parseFloat(content.trim().replace(',', '.'));
                    else {
                        rowData[dataName] = content.trim() == '-' ? null : content.trim();
                    }

                    hasData = true;
                }
            
                rowIndex++;
            }

            if (!skipRow && hasData)
                data.push(rowData);
        }

        return Ok(data);
    } catch (e) {
        return Err(e.message);
    }
};

const getBoletim = async ({ boletimUrl, sessionId }) => {
    try {
        let response = await fetch(URL_BASE + boletimUrl, {
            headers: {
                'Cookie': `PHPSESSID=${sessionId}`
            }
        });

        if (response.status != 200) {
            return Err(response.statusText);
        }

        let text = await response.text();

        let boletimData = {
            information: {
                school: null,
                name: null,
                course: null,
                class: null,
                city: null,
                birthDate: null,
                grade: null,
                shift: null,
                state: null,
                academicYear: null,
            },
            grades: []
        };

        const { document } = (new JSDOM(text)).window;

        let tables = document.querySelectorAll('table.table');

        for (let table of tables) {
            let dataTable = table.querySelector('tbody>tr>th>strong')?.innerHTML == 'Escola:';

            if (dataTable) {
                boletimData.information = expect(parseDataTable(table));
                continue;
            }

            boletimData.grades = expect(parseCurricularDataTable(table));
        }

        return Ok({ boletimData });
    } catch (e) {
        return Err(e.message);
    }
};

async function fetchBoletim({ studentName, motherName, birthDate, year }) {
    let result = await sendFormRequest({ studentName, motherName, birthDate, year });

    if (!result.success) {
        return result;
    }

    let { actionUrl, sessionId } = unwrap(result);

    result = await getBoletimURL({ actionUrl, sessionId });

    if (!result.success) {
        return result;
    }

    let { boletimUrl } = unwrap(result);

    result = await getBoletim({ boletimUrl, sessionId });

    
    if (!result.success) {
        return result;
    }

    let { boletimData } = unwrap(result);

    return Ok(boletimData);
}

module.exports = {
    fetchBoletim,
    sendFormRequest
};
