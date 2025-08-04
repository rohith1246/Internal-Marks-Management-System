const express = require('express');
const router = express.Router();
const { getConnection } = require('../db');
const nodemailer = require('nodemailer');
const { Parser } = require('json2csv');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '1234maharshi@gmail.com',
        pass: 'mrxfwhabyryygqiw'
    }
});

// Unchanged endpoints: /faculty-details, /faculty-subjects remain the same
router.get('/faculty-details', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;
    var con = getConnection();
    con.connect((err) => {
        if (err) throw err;
        con.query(`
            SELECT f.full_name, d.dept_name
            FROM faculty f
            JOIN department_hod d ON f.dept_id = d.dept_id
            WHERE f.faculty_id = ?`, [facultyId], (err, result) => {
            if (err) throw err;
            if (result.length > 0) res.json(result[0]);
            else res.status(404).json({ error: 'Faculty not found' });
            con.end();
        });
    });
});

router.get('/faculty-subjects', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;
    var con = getConnection();
    con.connect((err) => {
        if (err) throw err;
        con.query(`
            SELECT s.subject_id, s.subject_name
            FROM subjects s
            JOIN faculty_subjects fs ON s.subject_id = fs.subject_id
            WHERE fs.faculty_id = ?`, [facultyId], (err, result) => {
            if (err) throw err;
            res.json(result);
            con.end();
        });
    });
});

// Updated /subject-students
router.get('/subject-students', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;
    const subjectId = req.query.subject_id;
    if (!subjectId) return res.status(400).json({ error: 'Subject ID required' });

    var con = getConnection();
    con.connect((err) => {
        if (err) throw err;
        con.query(`
            SELECT 1 FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?`, [facultyId, subjectId], (err, result) => {
            if (err) throw err;
            if (result.length === 0) return res.status(403).json({ error: 'Forbidden' });

            con.query(`
                SELECT dept_id, course, semester FROM subjects WHERE subject_id = ?`, [subjectId], (err, subjectResult) => {
                if (err) throw err;
                if (subjectResult.length === 0) return res.status(404).json({ error: 'Subject not found' });

                const { dept_id, course, semester } = subjectResult[0];
                con.query(`
                    SELECT s.roll_number, s.full_name, m.assessment_type, m.mark
                    FROM students s
                    LEFT JOIN marks m ON s.roll_number = m.roll_number AND m.subject_id = ?
                    WHERE s.dept_id = ? AND s.course = ? AND s.semester = ?`, [subjectId, dept_id, course, semester], (err, results) => {
                    if (err) throw err;

                    const studentsMap = {};
                    results.forEach(row => {
                        if (!studentsMap[row.roll_number]) {
                            studentsMap[row.roll_number] = { roll_number: row.roll_number, full_name: row.full_name, marks: {} };
                        }
                        if (row.assessment_type) {
                            studentsMap[row.roll_number].marks[row.assessment_type] = row.mark; // No scaling needed
                        }
                    });
                    res.json(Object.values(studentsMap));
                    con.end();
                });
            });
        });
    });
});

// Updated /subject-analytics
router.get('/subject-analytics', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;
    const subjectId = req.query.subject_id;
    if (!subjectId) return res.status(400).json({ error: 'Subject ID required' });

    var con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ error: 'Database connection failed' });
        }
        con.query(`
            SELECT 1 FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?`, [facultyId, subjectId], (err, result) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            if (result.length === 0) {
                con.end();
                return res.status(403).json({ error: 'Forbidden' });
            }

            con.query(`
                SELECT dept_id, course, semester
                FROM subjects WHERE subject_id = ?`, [subjectId], (err, subjectResult) => {
                if (err) {
                    console.error('Query error:', err);
                    con.end();
                    return res.status(500).json({ error: 'Query failed' });
                }
                if (subjectResult.length === 0) {
                    con.end();
                    return res.status(404).json({ error: 'Subject not found' });
                }

                const { dept_id, course, semester } = subjectResult[0];
                con.query(`
                    SELECT s.roll_number, s.full_name, m.assessment_type, m.mark
                    FROM students s
                    LEFT JOIN marks m ON s.roll_number = m.roll_number AND m.subject_id = ?
                    WHERE s.dept_id = ? AND s.course = ? AND s.semester = ?`, 
                    [subjectId, dept_id, course, semester], (err, results) => {
                    if (err) {
                        console.error('Query error:', err);
                        con.end();
                        return res.status(500).json({ error: 'Query failed' });
                    }

                    const studentsMap = {};
                    results.forEach(row => {
                        if (!studentsMap[row.roll_number]) {
                            studentsMap[row.roll_number] = { roll_number: row.roll_number, full_name: row.full_name, marks: {} };
                        }
                        if (row.assessment_type) {
                            studentsMap[row.roll_number].marks[row.assessment_type] = row.mark; // No scaling
                        }
                    });

                    const students = Object.values(studentsMap);
                    if (students.length === 0) {
                        con.end();
                        return res.json({
                            topper: null,
                            avgAssignment1: null,
                            avgAssignment2: null,
                            avgAssignment3: null
                        });
                    }

                    // Calculate total marks and find topper
                    let topper = null;
                    let maxTotal = -Infinity;
                    students.forEach(student => {
                        const totalMarks = (parseFloat(student.marks['Assignment 1']) || 0) +
                                          (parseFloat(student.marks['Assignment 2']) || 0) +
                                          (parseFloat(student.marks['Assignment 3']) || 0);
                        student.totalMarks = totalMarks;
                        if (totalMarks > maxTotal) {
                            maxTotal = totalMarks;
                            topper = { full_name: student.full_name, totalMarks };
                        }
                    });

                    // Calculate averages
                    const totals = { 'Assignment 1': 0, 'Assignment 2': 0, 'Assignment 3': 0 };
                    const counts = { 'Assignment 1': 0, 'Assignment 2': 0, 'Assignment 3': 0 };
                    students.forEach(student => {
                        ['Assignment 1', 'Assignment 2', 'Assignment 3'].forEach(type => {
                            const mark = parseFloat(student.marks[type]);
                            if (!isNaN(mark)) {
                                totals[type] += mark;
                                counts[type]++;
                            }
                        });
                    });

                    const avgAssignment1 = counts['Assignment 1'] > 0 ? totals['Assignment 1'] / counts['Assignment 1'] : null;
                    const avgAssignment2 = counts['Assignment 2'] > 0 ? totals['Assignment 2'] / counts['Assignment 2'] : null;
                    const avgAssignment3 = counts['Assignment 3'] > 0 ? totals['Assignment 3'] / counts['Assignment 3'] : null;

                    res.json({
                        topper,
                        avgAssignment1,
                        avgAssignment2,
                        avgAssignment3
                    });
                    con.end();
                });
            });
        });
    });
});

// Unchanged /save-marks (already updated)
router.post('/save-marks', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;
    const { roll_number, subject_id, marks } = req.body;

    if (!roll_number || typeof roll_number !== 'string' || 
        !subject_id || typeof subject_id !== 'string' || 
        !marks || typeof marks !== 'object') {
        return res.status(400).json({ error: 'Bad Request: Invalid input format' });
    }

    const assessments = ['Assignment 1', 'Assignment 2', 'Assignment 3'];
    const markValues = {};

    for (const assessment of assessments) {
        const markInput = marks[assessment];
        if (markInput === undefined || markInput === '') {
            return res.status(400).json({ error: `Bad Request: ${assessment} mark is required` });
        }

        const mark = parseFloat(markInput);
        if (isNaN(mark)) {
            return res.status(400).json({ error: `${assessment} mark must be a valid number, got: ${markInput}` });
        }
        if (mark < 0) {
            return res.status(400).json({ error: `${assessment} mark cannot be negative, got: ${mark}` });
        }
        markValues[assessment] = mark;
    }

    const totalMarks = markValues['Assignment 1'] + markValues['Assignment 2'] + markValues['Assignment 3'];
    if (totalMarks > 40) {
        return res.status(400).json({ 
            error: `Total internal marks (${totalMarks}) exceed the limit of 40: Assignment 1 (${markValues['Assignment 1']}), Assignment 2 (${markValues['Assignment 2']}), Assignment 3 (${markValues['Assignment 3']})` 
        });
    }

    const con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            con.end();
            return res.status(500).json({ error: 'Database connection failed' });
        }

        con.query(
            `SELECT 1 FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?`,
            [facultyId, subject_id],
            (err, result) => {
                if (err) {
                    console.error('Query error:', err);
                    con.end();
                    return res.status(500).json({ error: 'Query failed' });
                }
                if (result.length === 0) {
                    con.end();
                    return res.status(403).json({ error: 'Forbidden' });
                }

                const queries = assessments.map((assessment) => {
                    const mark = markValues[assessment];
                    return new Promise((resolve, reject) => {
                        con.query(
                            `INSERT INTO marks (roll_number, subject_id, assessment_type, mark)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE mark = ?`,
                            [roll_number, subject_id, assessment, mark, mark],
                            (err) => {
                                if (err) {
                                    reject(new Error(`Failed to save ${assessment} mark: ${err.message}`));
                                } else {
                                    resolve();
                                }
                            }
                        );
                    });
                });

                Promise.all(queries)
                    .then(() => {
                        res.status(200).json({ 
                            message: 'Marks saved successfully', 
                            total: totalMarks 
                        });
                        con.end();
                    })
                    .catch((err) => {
                        console.error(`Error saving marks for roll_number ${roll_number}, subject ${subject_id}:`, err);
                        res.status(500).json({ error: err.message });
                        con.end();
                    });
            }
        );
    });
});

// Updated /export-marks
router.get('/export-marks', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;
    const subjectId = req.query.subject_id;
    if (!subjectId) return res.status(400).json({ error: 'Subject ID required' });

    var con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ error: 'Database connection failed' });
        }
        con.query(`
            SELECT 1 FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?`, [facultyId, subjectId], (err, result) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            if (result.length === 0) {
                con.end();
                return res.status(403).json({ error: 'Forbidden' });
            }

            con.query(`
                SELECT subject_name, dept_id, course, semester
                FROM subjects WHERE subject_id = ?`, [subjectId], (err, subjectResult) => {
                if (err) {
                    console.error('Query error:', err);
                    con.end();
                    return res.status(500).json({ error: 'Query failed' });
                }
                if (subjectResult.length === 0) {
                    con.end();
                    return res.status(404).json({ error: 'Subject not found' });
                }

                const { dept_id, course, semester } = subjectResult[0];
                con.query(`
                    SELECT s.roll_number, s.full_name, m.assessment_type, m.mark
                    FROM students s
                    LEFT JOIN marks m ON s.roll_number = m.roll_number AND m.subject_id = ?
                    WHERE s.dept_id = ? AND s.course = ? AND s.semester = ?`, 
                    [subjectId, dept_id, course, semester], (err, results) => {
                    if (err) {
                        console.error('Query error:', err);
                        con.end();
                        return res.status(500).json({ error: 'Query failed' });
                    }

                    const studentsMap = {};
                    results.forEach(row => {
                        if (!studentsMap[row.roll_number]) {
                            studentsMap[row.roll_number] = {
                                roll_number: row.roll_number,
                                full_name: row.full_name,
                                'Assignment 1': '',
                                'Assignment 2': '',
                                'Assignment 3': ''
                            };
                        }
                        if (row.assessment_type) {
                            studentsMap[row.roll_number][row.assessment_type] = row.mark; // No scaling
                        }
                    });

                    const students = Object.values(studentsMap);
                    if (students.length === 0) {
                        con.end();
                        return res.status(404).json({ error: 'No students found for this subject' });
                    }

                    const fields = ['roll_number', 'full_name', 'Assignment 1', 'Assignment 2', 'Assignment 3'];
                    const json2csvParser = new Parser({ fields });
                    const csv = json2csvParser.parse(students);

                    res.header('Content-Type', 'text/csv');
                    res.attachment(`${subjectId}_marks.csv`);
                    res.send(csv);
                    con.end();
                });
            });
        });
    });
});

router.post('/send-marks-email', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;
    const subjectId = req.query.subject_id;
    if (!subjectId) return res.status(400).json({ error: 'Subject ID required' });

    const con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ error: 'Database connection failed' });
        }

        con.query(
            `SELECT 1 FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?`,
            [facultyId, subjectId],
            (err, result) => {
                if (err) {
                    console.error('Query error:', err);
                    con.end();
                    return res.status(500).json({ error: 'Query failed' });
                }
                if (result.length === 0) {
                    con.end();
                    return res.status(403).json({ error: 'Forbidden' });
                }

                con.query(
                    `SELECT subject_name, dept_id, course, semester FROM subjects WHERE subject_id = ?`,
                    [subjectId],
                    (err, subjectResult) => {
                        if (err) {
                            console.error('Query error:', err);
                            con.end();
                            return res.status(500).json({ error: 'Query failed' });
                        }
                        if (subjectResult.length === 0) {
                            con.end();
                            return res.status(404).json({ error: 'Subject not found' });
                        }

                        const { subject_name, dept_id, course, semester } = subjectResult[0];
                        con.query(
                            `SELECT s.roll_number, s.full_name, s.email, m.assessment_type, m.mark
                             FROM students s
                             LEFT JOIN marks m ON s.roll_number = m.roll_number AND m.subject_id = ?
                             WHERE s.dept_id = ? AND s.course = ? AND s.semester = ?`,
                            [subjectId, dept_id, course, semester],
                            (err, results) => {
                                if (err) {
                                    console.error('Query error:', err);
                                    con.end();
                                    return res.status(500).json({ error: 'Query failed' });
                                }

                                const studentsMap = {};
                                results.forEach(row => {
                                    if (!studentsMap[row.roll_number]) {
                                        studentsMap[row.roll_number] = { roll_number: row.roll_number, full_name: row.full_name, email: row.email, marks: {} };
                                    }
                                    if (row.assessment_type) {
                                        studentsMap[row.roll_number].marks[row.assessment_type] = row.mark;
                                    }
                                });

                                const students = Object.values(studentsMap);
                                async function sendEmailWithThrottle(student, retries = 3, delay = 5000, throttleDelay = 2000) {
                                    const marksText = Object.entries(student.marks)
                                        .map(([type, mark]) => `${type}: ${mark || 'N/A'}`)
                                        .join('\n');

                                    const mailOptions = {
                                        from: '1234maharshi@gmail.com',
                                        to: student.email,
                                        subject: `Marks Update for ${subject_name}`,
                                        text: `Dear ${student.full_name},\n\nYour marks for ${subject_name} (Subject ID: ${subjectId}) have been updated:\n\n${marksText}\n\nRegards,\nFaculty`
                                    };

                                    for (let i = 0; i < retries; i++) {
                                        try {
                                            await transporter.sendMail(mailOptions);
                                            console.log(`Email sent to ${student.email}`);
                                            break;
                                        } catch (err) {
                                            console.error(`Attempt ${i + 1} failed for ${student.email}: ${err.message}`, {
                                                code: err.code,
                                                response: err.response,
                                                responseCode: err.responseCode
                                            });
                                            if (i < retries - 1) {
                                                if (err.responseCode === 421 || err.code === 'ECONNECTION' || err.message.includes('socket')) {
                                                    console.log(`Retrying in ${delay}ms...`);
                                                    await new Promise(resolve => setTimeout(resolve, delay));
                                                } else if (err.responseCode === 550) {
                                                    throw new Error('Daily sending limit exceeded. Please try again after 24 hours.');
                                                } else {
                                                    throw err;
                                                }
                                            } else {
                                                throw err;
                                            }
                                        }
                                    }
                                    await new Promise(resolve => setTimeout(resolve, throttleDelay));
                                }

                                async function sendAllEmails() {
                                    for (const student of students) {
                                        await sendEmailWithThrottle(student);
                                    }
                                }

                                sendAllEmails()
                                    .then(() => {
                                        console.log(`Emails sent successfully for subject ${subjectId}`);
                                        res.sendStatus(200);
                                        con.end();
                                    })
                                    .catch(emailErr => {
                                        console.error('Error sending emails:', emailErr);
                                        res.status(500).json({ error: emailErr.message });
                                        con.end();
                                    });
                            }
                        );
                    }
                );
            }
        );
    });
});
// New endpoint to fetch faculty timetable
router.get('/faculty-timetable', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const facultyId = req.session.user.id;

    var con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ error: 'Database connection failed' });
        }

        // Fetch the faculty timetable
        con.query(`
            SELECT 
                t.id, 
                t.type, 
                t.faculty_id, 
                t.semester, 
                t.dept_id, 
                ts.day, 
                ts.slot, 
                ts.subject,
                ts.semester AS slot_semester
            FROM timetables t
            LEFT JOIN timetable_slots ts ON t.id = ts.timetable_id
            WHERE t.type = "faculty" AND t.faculty_id = ?`, [facultyId], (err, rows) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }

            if (rows.length === 0) {
                con.end();
                return res.json({ id: null, type: 'faculty', faculty_id: facultyId, schedule: [] });
            }

            const timetable = {
                id: rows[0].id,
                type: rows[0].type,
                faculty_id: rows[0].faculty_id,
                semester: rows[0].semester,
                dept_id: rows[0].dept_id,
                schedule: []
            };

            rows.forEach(row => {
                if (row.day) {
                    timetable.schedule.push({
                        day: row.day,
                        slot: row.slot,
                        subject: row.subject,
                        semester: row.slot_semester
                    });
                }
            });

            res.json(timetable);
            con.end();
        });
    });
});
module.exports = router;