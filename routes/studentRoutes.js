const express = require('express');
const router = express.Router();
const { getConnection } = require('../db');

// Student Details API
router.get('/student-details', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const rollNumber = req.session.user.id;
    const con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ error: 'Database connection failed' });
        }
        const query = `
            SELECT s.full_name, s.roll_number, s.semester, d.dept_name
            FROM students s
            JOIN department_hod d ON s.dept_id = d.dept_id
            WHERE s.roll_number = ?`;
        console.log(`Query: ${query}, params: [${rollNumber}]`);
        con.query(query, [rollNumber], (err, result) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            if (result.length === 0) {
                con.end();
                return res.status(404).json({ error: 'Student not found' });
            }
            console.log('Student Details Result:', result);
            res.json(result[0]);
            con.end();
        });
    });
});

// Student Marks API
router.get('/student-marks', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const rollNumber = req.session.user.id;
    const queryRollNumber = req.query.roll_number;
    const semester = req.query.semester;
    if (!queryRollNumber || queryRollNumber !== rollNumber) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!semester) {
        return res.status(400).json({ error: 'Semester is required' });
    }

    const con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ error: 'Database connection failed' });
        }
        const query = `
            SELECT s.subject_id, s.subject_name,
                   MAX(CASE WHEN m.assessment_type = 'assignment 1' THEN m.mark END) as assignment1,
                   MAX(CASE WHEN m.assessment_type = 'assignment 2' THEN m.mark END) as assignment2,
                   MAX(CASE WHEN m.assessment_type = 'assignment 3' THEN m.mark END) as assignment3
            FROM subjects s
            LEFT JOIN marks m ON s.subject_id = m.subject_id AND m.roll_number = ?
            WHERE s.dept_id = (SELECT dept_id FROM students WHERE roll_number = ?)
            AND s.course = (SELECT course FROM students WHERE roll_number = ?)
            AND s.semester = ?
            GROUP BY s.subject_id, s.subject_name`;
        const params = [rollNumber, rollNumber, rollNumber, semester];
        console.log(`Query: ${query}, params: ${params}`);
        con.query(query, params, (err, result) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            console.log('Marks Query Result:', result);
            res.json(result);
            con.end();
        });
    });
});
// Student Timetable API
router.get('/student-timetable', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const rollNumber = req.session.user.id;
    const semester = req.query.semester;

    if (!semester) {
        return res.status(400).json({ error: 'Semester is required' });
    }

    const con = getConnection();
    con.connect((err) => {
        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({ error: 'Database connection failed' });
        }

        // First, get the student's department
        const deptQuery = `SELECT dept_id FROM students WHERE roll_number = ?`;
        con.query(deptQuery, [rollNumber], (err, deptResult) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            if (deptResult.length === 0) {
                con.end();
                return res.status(404).json({ error: 'Student not found' });
            }

            const deptId = deptResult[0].dept_id;

            // Fetch timetable for the department and semester
            const timetableQuery = `
                SELECT 
                    t.id AS timetable_id, 
                    t.dept_id, 
                    t.semester, 
                    ts.day, 
                    ts.slot, 
                    s.subject_id,
                    s.subject_name,
                    f.faculty_id,
                    f.full_name
                FROM timetables t
                JOIN timetable_slots ts ON t.id = ts.timetable_id
                LEFT JOIN subjects s ON ts.subject = s.subject_id
                LEFT JOIN faculty_subjects fs ON s.subject_id = fs.subject_id
                LEFT JOIN faculty f ON fs.faculty_id = f.faculty_id
                WHERE t.type = 'semester' 
                AND t.dept_id = ? 
                AND t.semester = ?
                ORDER BY ts.day, ts.slot
            `;
            const params = [deptId, semester];
            console.log(`Query: ${timetableQuery}, params: ${params}`);

            con.query(timetableQuery, params, (err, result) => {
                if (err) {
                    console.error('Query error:', err);
                    con.end();
                    return res.status(500).json({ error: 'Query failed' });
                }
                console.log('Timetable Query Result:', result);
                res.json(result);
                con.end();
            });
        });
    });
});

module.exports = router;