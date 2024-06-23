function Err(error) {
    return { success: false, error }
}

function Ok(value) {
    return { success: true, value }
}

function expect(value) {
    if (!value.success) {
        throw new Error('An error occurred: ' + value.error);
    }

    return value.value;
}

function unwrap(value) {
    if (!value.success) {
        throw new Error('Unwraped error value: ' + value.error);
    }

    return value.value;
}

module.exports = { Ok, Err, expect, unwrap };