const mysql = require('mysql2');

function getConnection() {
    return mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "root",
        database: "mydb70"
    });
}

module.exports = { getConnection };