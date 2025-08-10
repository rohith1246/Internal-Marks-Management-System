const express = require('express');
const router = express.Router();
const { getConnection } = require('../db');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Serve login page
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'), (err) => {
        if (err) {
            console.error('Error sending login.html:', err);
            res.status(500).send('Error loading login page');
        }
    });
});

// Serve admin registration page
router.get('/AdminRegister', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'AdminRegister.html'), (err) => {
        if (err) {
            console.error('Error sending AdminRegister.html:', err);
            res.status(500).send('Error loading admin register page');
        }
    });
});

// Serve HOD registration page
router.get('/hodregister', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'HodRegister.html'), (err) => {
        if (err) {
            console.error('Error sending HodRegister.html:', err);
            res.status(500).send('Error loading HOD register page');
        }
    });
});

// Serve student registration page
router.get('/Student', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'StudentRegisterform.html'), (err) => {
        if (err) {
            console.error('Error sending StudentRegisterform.html:', err);
            res.status(500).send('Error loading student register page');
        }
    });
});

// Serve student dashboard (protected)
router.get('/StudentDashboard', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '..', 'StudentDashboard.html'), (err) => {
        if (err) {
            console.error('Error sending StudentDashboard.html:', err);
            res.status(500).send('Error loading student dashboard');
        }
    });
});

// Serve faculty registration page
router.get('/Faculty', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'FacultyRegister.html'), (err) => {
        if (err) {
            console.error('Error sending FacultyRegister.html:', err);
            res.status(500).send('Error loading faculty register page');
        }
    });
});

// Serve HOD dashboard (protected)
router.get('/HOD', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'hod') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '..', 'HodDashboard.html'), (err) => {
        if (err) {
            console.error('Error sending HodDashboard.html:', err);
            res.status(500).send('Error loading HOD dashboard');
        }
    });
});

// Serve admin dashboard (protected)
router.get('/Admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '..', 'AdminDashboard.html'), (err) => {
        if (err) {
            console.error('Error sending AdminDashboard.html:', err);
            res.status(500).send('Error loading admin dashboard');
        }
    });
});

// Serve faculty dashboard (protected)
router.get('/FacultyDashboard', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '..', 'FacultyDashboard.html'), (err) => {
        if (err) {
            console.error('Error sending FacultyDashboard.html:', err);
            res.status(500).send('Error loading faculty dashboard');
        }
    });
});

// Handle login
router.post('/log', (req, res) => {
    const { username, password, role } = req.body;
    console.log('Login attempt:', { username, password, role });

    if (!username || !password || !role) {
        return res.status(400).json({ success: false, error: 'Missing username, password, or role' });
    }

    const con = getConnection();
    con.connect(function(err) {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ success: false, error: 'Database connection failed' });
        }

        let query, params, dashboard, idField;
        switch (role) {
            case 'admin':
                query = "SELECT adminid AS userId FROM admin WHERE adminid = ? AND password = ?";
                params = [username, password];
                dashboard = "/Admin";
                idField = 'userId';
                break;
            case 'hod':
                query = "SELECT hod_id AS userId, dept_id FROM department_hod WHERE hod_id = ? AND hod_password = ?";
                params = [username, password];
                dashboard = "/HOD";
                idField = 'userId';
                break;
            case 'faculty':
                query = "SELECT faculty_id AS userId FROM faculty WHERE faculty_id = ? AND password = ?";
                params = [username, password];
                dashboard = "/FacultyDashboard";
                idField = 'userId';
                break;
            case 'student':
                query = "SELECT roll_number AS userId FROM students WHERE roll_number = ? AND password = ?";
                params = [username, password];
                dashboard = "/StudentDashboard";
                idField = 'userId';
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        console.log('Executing query:', query, params);
        con.query(query, params, function(err, result) {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ success: false, error: 'Database query failed' });
            }

            if (result.length > 0) {
                // ✅ Save user info in session
                let sessionData = { id: result[0][idField], role: role };
                if (role === 'hod') {
                    sessionData.dept_id = result[0].dept_id;
                }
                req.session.user = sessionData;

                console.log('Session set:', req.session.user);

                // ✅ Return userId so frontend can call face verification
                res.json({
                    success: true,
                    redirect: dashboard,
                    userId: result[0][idField],
                    role: role
                });
            } else {
                res.status(401).json({ success: false, error: 'Invalid username or password, please try again' });
            }
            con.end();
        });
    });
});

// Forgot Password - Send OTP
router.post('/forgot-password', (req, res) => {
    const { email, role } = req.body;

    if (!email || !role) {
        return res.status(400).json({ success: false, error: 'Email and role are required' });
    }

    const con = getConnection();
    con.connect(function(err) {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ success: false, error: 'Database connection failed' });
        }

        let query, emailField, idField;
        switch (role) {
            case 'admin':
                query = "SELECT * FROM admin WHERE email = ?";
                emailField = 'email';
                idField = 'adminid';
                break;
            case 'hod':
                query = "SELECT * FROM department_hod WHERE hod_email = ?";
                emailField = 'hod_email';
                idField = 'hod_id';
                break;
            case 'faculty':
                query = "SELECT * FROM faculty WHERE email = ?";
                emailField = 'email';
                idField = 'faculty_id';
                break;
            case 'student':
                query = "SELECT * FROM students WHERE email = ?";
                emailField = 'email';
                idField = 'roll_number';
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        con.query(query, [email], async function(err, result) {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ success: false, error: 'Database query failed' });
            }

            if (result.length === 0) {
                con.end();
                return res.status(404).json({ success: false, error: 'Email not found' });
            }

            // Generate OTP
            const otp = crypto.randomInt(100000, 999999).toString();
            const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

            // Store OTP in session (in production, use a proper storage like Redis)
            req.session.resetPassword = {
                email,
                role,
                otp,
                otpExpiry,
                userId: result[0][idField]
            };

            // Configure Nodemailer
            const transporter = nodemailer.createTransport({
                service: 'gmail', // or your email service
                auth: {
                    user: '1234maharshi@gmail.com', // Replace with your email
                    pass: 'mrxfwhabyryygqiw'     // Replace with your app-specific password
                }
            });

            const mailOptions = {
                from: '1234maharshi@gmail.com',
                to: email,
                subject: 'Password Reset OTP - Balaji Institute',
                html: `
                    <h2>Password Reset Request</h2>
                    <p>Your OTP for password reset is: <strong>${otp}</strong></p>
                    <p>This OTP is valid for 10 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                `
            };

            try {
                await transporter.sendMail(mailOptions);
                res.json({ success: true, message: 'OTP sent to your email' });
            } catch (emailErr) {
                console.error('Email sending error:', emailErr);
                res.status(500).json({ success: false, error: 'Failed to send OTP' });
            }
            con.end();
        });
    });
});

// Verify OTP and Reset Password
router.post('/reset-password', (req, res) => {
    const { otp, newPassword } = req.body;
    const resetData = req.session.resetPassword;

    if (!resetData || !otp || !newPassword) {
        return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    if (Date.now() > resetData.otpExpiry) {
        delete req.session.resetPassword;
        return res.status(400).json({ success: false, error: 'OTP has expired' });
    }

    if (resetData.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    const con = getConnection();
    con.connect(function(err) {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ success: false, error: 'Database connection failed' });
        }

        let query, params;
        switch (resetData.role) {
            case 'admin':
                query = "UPDATE admin SET password = ? WHERE email = ?";
                break;
            case 'hod':
                query = "UPDATE department_hod SET hod_password = ? WHERE hod_email = ?";
                break;
            case 'faculty':
                query = "UPDATE faculty SET password = ? WHERE email = ?";
                break;
            case 'student':
                query = "UPDATE students SET password = ? WHERE email = ?";
                break;
        }

        params = [newPassword, resetData.email];

        con.query(query, params, function(err, result) {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ success: false, error: 'Password reset failed' });
            }

            delete req.session.resetPassword;
            res.json({ success: true, message: 'Password reset successful', redirect: '/' });
            con.end();
        });
    });
});

module.exports = router;