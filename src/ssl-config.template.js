// https ssl files
let fs = require('fs');
exports.option = {
    ca: fs.readFileSync('/path/to/fullchain.pem'),
    key: fs.readFileSync('/path/to/privkey.pem'),
    cert: fs.readFileSync('/path/to/cert.pem')
};