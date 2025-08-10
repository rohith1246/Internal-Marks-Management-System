const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.use(session({
    secret: 'tinkuu',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const hodRoutes = require('./routes/hodRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const studentRoutes = require('./routes/studentRoutes'); 
app.use('/api', studentRoutes);
app.use(express.static(path.join(__dirname, 'images')))
app.get('/image', (req, res) => {
    res.sendFile(path.join(__dirname, 'images', 'img2.png'));
});
app.use('/', authRoutes);
app.use('/api', adminRoutes);
app.use('/api', hodRoutes);
app.use('/api', facultyRoutes);
app.use('/', adminRoutes);
app.get('/faceRegistration.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'faceRegistration.html'));
});
app.use('/models', express.static(path.join(__dirname, 'models')));


app.listen(3000, () => {
    console.log("Server running on port 5660");
});

module.exports = app;