const express = require('express');
const router = express.Router();
const { getConnection } = require('../db');
const path = require('path');

// Middleware to validate required fields
const validateRequiredFields = (fields, body, res) => {
    for (const field of fields) {
        if (!body[field]) {
            return res.status(400).json({ error: `Missing required field: ${field}` });
        }
    }
    return null;
};

// Admin Registration (removed duplicate /reg route)
router.post('/adminreg', (req, res) => {
    const { fullName, adminId, email, password } = req.body;

    // Validate required fields
    const validationError = validateRequiredFields(['fullName', 'adminId', 'email', 'password'], req.body, res);
    if (validationError) return validationError;

    console.log('Admin Registration:', { fullName, email, adminId });

    const con = getConnection();
    con.query(
        "INSERT INTO Admin (fullname, email, password, adminid) VALUES (?, ?, ?, ?)",
        [fullName, email, password, adminId],
        (err, result) => {
            if (err) {
                console.error('Insert error:', err);
                con.end();
                return res.status(500).json({ error: 'Failed to register admin' });
            }
            console.log("Admin inserted");
            res.sendStatus(200);
            con.end();
        }
    );
});

// Faculty Registration
router.post('/facreg', (req, res) => {
    const { fullName, facultyId, deptId, email, password } = req.body;

    const validationError = validateRequiredFields(['fullName', 'facultyId', 'deptId', 'email', 'password'], req.body, res);
    if (validationError) return validationError;

    const con = getConnection();
    con.query(
        "INSERT INTO Faculty (faculty_id, full_name, dept_id, email, password) VALUES (?, ?, ?, ?, ?)",
        [facultyId, fullName, deptId, email, password],
        (err, result) => {
            if (err) {
                console.error('Insert error:', err);
                con.end();
                return res.status(500).json({ error: 'Failed to register faculty' });
            }
            console.log("Faculty inserted");
            res.sendStatus(200);
            con.end();
        }
    );
});

// Update Faculty
router.put('/update-faculty', (req, res) => {
    const { facultyId, fullName, deptId, email, password } = req.body;

    const validationError = validateRequiredFields(['facultyId', 'fullName', 'deptId', 'email'], req.body, res);
    if (validationError) return validationError;

    const con = getConnection();
    let query = "UPDATE Faculty SET full_name = ?, dept_id = ?, email = ?";
    const params = [fullName, deptId, email];
    if (password) {
        query += ", password = ?";
        params.push(password);
    }
    query += " WHERE faculty_id = ?";
    params.push(facultyId);

    con.query(query, params, (err, result) => {
        if (err) {
            console.error('Update error:', err);
            con.end();
            return res.status(500).json({ error: 'Failed to update faculty' });
        }
        if (result.affectedRows === 0) {
            con.end();
            return res.status(404).json({ error: 'Faculty not found' });
        }
        res.sendStatus(200);
        con.end();
    });
});

// Delete Faculty
router.delete('/delete-faculty', (req, res) => {
    const facultyId = req.query.faculty_id;
    if (!facultyId) {
        return res.status(400).json({ error: 'Missing required query parameter: faculty_id' });
    }

    const con = getConnection();
    con.query("DELETE FROM Faculty WHERE faculty_id = ?", [facultyId], (err, result) => {
        if (err) {
            console.error('Delete error:', err);
            con.end();
            return res.status(500).json({ error: 'Failed to delete faculty' });
        }
        if (result.affectedRows === 0) {
            con.end();
            return res.status(404).json({ error: 'Faculty not found' });
        }
        res.sendStatus(200);
        con.end();
    });
});

// Student Registration
router.post('/stureg', (req, res) => {
    const { fullName, rollNumber, deptId, course, semester, email, password } = req.body;

    const validationError = validateRequiredFields(
        ['fullName', 'rollNumber', 'deptId', 'course', 'semester', 'email', 'password'],
        req.body,
        res
    );
    if (validationError) return validationError;

    const con = getConnection();
    con.query(
        "INSERT INTO Students (roll_number, full_name, dept_id, course, semester, email, password) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [rollNumber, fullName, deptId, course, semester, email, password],
        (err, result) => {
            if (err) {
                console.error('Insert error:', err);
                con.end();
                return res.status(500).json({ error: 'Failed to register student' });
            }
            console.log("Student inserted");
            res.sendStatus(200);
            con.end();
        }
    );
});

// Update Student
router.put('/update-student', (req, res) => {
    const { rollNumber, fullName, deptId, course, semester, email, password } = req.body;

    const validationError = validateRequiredFields(
        ['rollNumber', 'fullName', 'deptId', 'course', 'semester', 'email'],
        req.body,
        res
    );
    if (validationError) return validationError;

    const con = getConnection();
    let query = "UPDATE Students SET full_name = ?, dept_id = ?, course = ?, semester = ?, email = ?";
    const params = [fullName, deptId, course, semester, email];
    if (password) {
        query += ", password = ?";
        params.push(password);
    }
    query += " WHERE LOWER(roll_number) = LOWER(?)";
    params.push(rollNumber);

    con.query(query, params, (err, result) => {
        if (err) {
            console.error('Update error:', err);
            con.end();
            return res.status(500).json({ error: 'Failed to update student' });
        }
        if (result.affectedRows === 0) {
            con.end();
            return res.status(404).json({ error: 'Student not found' });
        }
        res.sendStatus(200);
        con.end();
    });
});

// Delete Student
router.delete('/delete-student', (req, res) => {
    const rollNumber = req.query.roll_number;
    if (!rollNumber) {
        return res.status(400).json({ error: 'Missing required query parameter: roll_number' });
    }

    const con = getConnection();
    con.query("DELETE FROM Students WHERE roll_number = ?", [rollNumber], (err, result) => {
        if (err) {
            console.error('Delete error:', err);
            con.end();
            return res.status(500).json({ error: 'Failed to delete student' });
        }
        if (result.affectedRows === 0) {
            con.end();
            return res.status(404).json({ error: 'Student not found' });
        }
        res.sendStatus(200);
        con.end();
    });
});

// Department Registration
router.post('/depreg', (req, res) => {
    const { deptName, deptId, hodName, hodId, hodEmail, hodPassword } = req.body;

    const validationError = validateRequiredFields(
        ['deptName', 'deptId', 'hodName', 'hodId', 'hodEmail', 'hodPassword'],
        req.body,
        res
    );
    if (validationError) return validationError;

    const con = getConnection();
    const sql = "INSERT INTO Department_HOD (dept_id, dept_name, hod_id, hod_name, hod_email, hod_password) VALUES (?, ?, ?, ?, ?, ?)";
    con.query(sql, [deptId, deptName, hodId, hodName, hodEmail, hodPassword], (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            con.end();
            return res.status(500).json({ error: 'Failed to register department' });
        }
        console.log("Department inserted");
        res.sendStatus(200);
        con.end();
    });
});

// Update Department
router.put('/update-dept', (req, res) => {
    const { deptId, deptName, hodId, hodName, hodEmail, hodPassword } = req.body;

    const validationError = validateRequiredFields(
        ['deptId', 'deptName', 'hodId', 'hodName', 'hodEmail'],
        req.body,
        res
    );
    if (validationError) return validationError;

    const con = getConnection();
    let query = "UPDATE Department_HOD SET dept_name = ?, hod_id = ?, hod_name = ?, hod_email = ?";
    const params = [deptName, hodId, hodName, hodEmail];
    if (hodPassword) {
        query += ", hod_password = ?";
        params.push(hodPassword);
    }
    query += " WHERE LOWER(dept_id) = LOWER(?)";
    params.push(deptId);

    con.query(query, params, (err, result) => {
        if (err) {
            console.error('Update error:', err);
            con.end();
            return res.status(500).json({ error: 'Failed to update department' });
        }
        if (result.affectedRows === 0) {
            con.end();
            return res.status(404).json({ error: 'Department not found' });
        }
        res.sendStatus(200);
        con.end();
    });
});

// Delete Department
router.delete('/delete-dept', (req, res) => {
    const deptId = req.query.dept_id;
    if (!deptId) {
        return res.status(400).json({ error: 'Missing required query parameter: dept_id' });
    }

    const con = getConnection();
    con.query("DELETE FROM Department_HOD WHERE dept_id = ?", [deptId], (err, result) => {
        if (err) {
            console.error('Delete error:', err);
            con.end();
            return res.status(500).json({ error: 'Failed to delete department' });
        }
        if (result.affectedRows === 0) {
            con.end();
            return res.status(404).json({ error: 'Department not found' });
        }
        res.sendStatus(200);
        con.end();
    });
});

// Get Departments
router.get('/departments', (req, res) => {
    const con = getConnection();
    con.query("SELECT dept_id, dept_name, hod_id, hod_name, hod_email FROM Department_HOD", (err, result) => {
        if (err) {
            console.error('Query error:', err);
            con.end();
            return res.status(500).json({ error: 'Query failed' });
        }
        res.json(result);
        con.end();
    });
});

// Get Faculty
router.get('/faculty', (req, res) => {
    const con = getConnection();
    con.query("SELECT faculty_id, full_name, dept_id, email FROM Faculty", (err, result) => {
        if (err) {
            console.error('Query error:', err);
            con.end();
            return res.status(500).json({ error: 'Query failed' });
        }
        res.json(result);
        con.end();
    });
});

// Get Faculty by ID
router.get('/faculty/:facultyId', (req, res) => {
    const facultyId = req.params.facultyId;
    const con = getConnection();
    con.query(
        "SELECT faculty_id, full_name, dept_id, email FROM Faculty WHERE faculty_id = ?",
        [facultyId],
        (err, result) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            if (result.length === 0) {
                con.end();
                return res.status(404).json({ error: 'Faculty not found' });
            }
            res.json(result[0]);
            con.end();
        }
    );
});

// Get Students (with optional deptId filter)
router.get('/students', (req, res) => {
    const deptId = req.query.deptId;
    const con = getConnection();
    let query = "SELECT roll_number, full_name, dept_id, course, semester, email FROM Students";
    const params = [];
    
    if (deptId) {
        query += " WHERE dept_id = ?";
        params.push(deptId);
    }

    con.query(query, params, (err, result) => {
        if (err) {
            console.error('Query error:', err);
            con.end();
            return res.status(500).json({ error: 'Query failed' });
        }
        res.json(result);
        con.end();
    });
});

// Get Student by Roll Number
router.get('/students/:rollNumber', (req, res) => {
    const rollNumber = req.params.rollNumber;
    const con = getConnection();
    con.query(
        "SELECT roll_number, full_name, dept_id, course, semester, email FROM Students WHERE roll_number = ?",
        [rollNumber],
        (err, result) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            if (result.length === 0) {
                con.end();
                return res.status(404).json({ error: 'Student not found' });
            }
            res.json(result[0]);
            con.end();
        }
    );
});

// Get Subjects
router.get('/subjects', (req, res) => {
    const deptId = req.query.deptId;
    const semester = req.query.semester;
    console.log(`Received /subjects request with deptId: ${deptId}, semester: ${semester}`);
    const con = getConnection();
    let query = `
        SELECT s.subject_id, s.subject_name, s.semester, s.course, s.dept_id, f.faculty_id AS assigned_faculty
        FROM subjects s
        LEFT JOIN faculty_subjects fs ON s.subject_id = fs.subject_id
        LEFT JOIN faculty f ON fs.faculty_id = f.faculty_id
    `;
    const params = [];
    const conditions = [];

    if (deptId) {
        conditions.push("s.dept_id = ?");
        params.push(deptId);
    }
    if (semester) {
        conditions.push("s.semester = ?");
        params.push(semester);
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    console.log(`Query: ${query}, params: ${params}`);
    con.query(query, params, (err, result) => {
        if (err) {
            console.error('Query error:', err);
            con.end();
            return res.status(500).json({ error: 'Query failed' });
        }
        console.log(`Subjects Query Result:`, result);
        res.json(result);
        con.end();
    });
});
// Add Subject
router.post('/add-subject', (req, res) => {
    const { subjectId, subjectName, deptId, semester, course, facultyId } = req.body;

    const validationError = validateRequiredFields(
        ['subjectId', 'subjectName', 'deptId', 'semester', 'course'],
        req.body,
        res
    );
    if (validationError) return validationError;

    const con = getConnection();
    con.beginTransaction((err) => {
        if (err) {
            console.error('Transaction error:', err);
            con.end();
            return res.status(500).json({ error: 'Transaction failed' });
        }

        con.query(
            "INSERT INTO subjects (subject_id, subject_name, dept_id, semester, course) VALUES (?, ?, ?, ?, ?)",
            [subjectId, subjectName, deptId, semester, course],
            (err) => {
                if (err) {
                    console.error('Insert subjects error:', err);
                    con.rollback(() => con.end());
                    return res.status(500).json({ error: 'Failed to add subject' });
                }

                if (facultyId) {
                    con.query(
                        "INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (?, ?)",
                        [facultyId, subjectId],
                        (err) => {
                            if (err) {
                                console.error('Insert faculty_subjects error:', err);
                                con.rollback(() => con.end());
                                return res.status(500).json({ error: 'Failed to assign faculty' });
                            }
                            con.commit((err) => {
                                if (err) {
                                    console.error('Commit error:', err);
                                    con.rollback(() => con.end());
                                    return res.status(500).json({ error: 'Commit failed' });
                                }
                                res.sendStatus(200);
                                con.end();
                            });
                        }
                    );
                } else {
                    con.commit((err) => {
                        if (err) {
                            console.error('Commit error:', err);
                            con.rollback(() => con.end());
                            return res.status(500).json({ error: 'Commit failed' });
                        }
                        res.sendStatus(200);
                        con.end();
                    });
                }
            }
        );
    });
});

// Update Subject
router.put('/update-subject', (req, res) => {
    const { subjectId, subjectName, deptId, semester, course, facultyId } = req.body;

    const validationError = validateRequiredFields(
        ['subjectId', 'subjectName', 'deptId', 'semester', 'course'],
        req.body,
        res
    );
    if (validationError) return validationError;

    const con = getConnection();
    con.beginTransaction((err) => {
        if (err) {
            console.error('Transaction error:', err);
            con.end();
            return res.status(500).json({ error: 'Transaction failed' });
        }

        con.query(
            "UPDATE subjects SET subject_name = ?, dept_id = ?, semester = ?, course = ? WHERE subject_id = ?",
            [subjectName, deptId, semester, course, subjectId],
            (err, result) => {
                if (err) {
                    console.error('Update subjects error:', err);
                    con.rollback(() => con.end());
                    return res.status(500).json({ error: 'Failed to update subject' });
                }
                if (result.affectedRows === 0) {
                    con.rollback(() => con.end());
                    return res.status(404).json({ error: 'Subject not found' });
                }

                con.query("DELETE FROM faculty_subjects WHERE subject_id = ?", [subjectId], (err) => {
                    if (err) {
                        console.error('Delete faculty_subjects error:', err);
                        con.rollback(() => con.end());
                        return res.status(500).json({ error: 'Failed to update faculty assignment' });
                    }

                    if (facultyId) {
                        con.query(
                            "INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (?, ?)",
                            [facultyId, subjectId],
                            (err) => {
                                if (err) {
                                    console.error('Insert faculty_subjects error:', err);
                                    con.rollback(() => con.end());
                                    return res.status(500).json({ error: 'Failed to assign faculty' });
                                }
                                con.commit((err) => {
                                    if (err) {
                                        console.error('Commit error:', err);
                                        con.rollback(() => con.end());
                                        return res.status(500).json({ error: 'Commit failed' });
                                    }
                                    res.sendStatus(200);
                                    con.end();
                                });
                            }
                        );
                    } else {
                        con.commit((err) => {
                            if (err) {
                                console.error('Commit error:', err);
                                con.rollback(() => con.end());
                                return res.status(500).json({ error: 'Commit failed' });
                            }
                            res.sendStatus(200);
                            con.end();
                        });
                    }
                });
            }
        );
    });
});

// Delete Subject
router.delete('/delete-subject', (req, res) => {
    const subjectId = req.query.subject_id;
    if (!subjectId) {
        return res.status(400).json({ error: 'Missing required query parameter: subject_id' });
    }

    const con = getConnection();
    con.query("DELETE FROM subjects WHERE subject_id = ?", [subjectId], (err, result) => {
        if (err) {
            console.error('Query error:', err);
            con.end();
            return res.status(500).json({ error: 'Query failed' });
        }
        if (result.affectedRows === 0) {
            con.end();
            return res.status(404).json({ error: 'Subject not found' });
        }
        res.sendStatus(200);
        con.end();
    });
});

// Assign Faculty to Subject
router.post('/assign-faculty', (req, res) => {
    const { subjectId, facultyId } = req.body;

    const validationError = validateRequiredFields(['subjectId', 'facultyId'], req.body, res);
    if (validationError) return validationError;

    const con = getConnection();
    con.query(
        "INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE faculty_id = ?",
        [facultyId, subjectId, facultyId],
        (err) => {
            if (err) {
                console.error('Insert faculty_subjects error:', err);
                con.end();
                return res.status(500).json({ error: 'Failed to assign faculty' });
            }
            res.sendStatus(200);
            con.end();
        }
    );
});

// Get Faculty Assignments
router.get('/faculty-assignments', (req, res) => {
    const con = getConnection();
    con.query(
        "SELECT fs.faculty_id, fs.subject_id, s.subject_name, s.dept_id, s.semester, s.course FROM faculty_subjects fs JOIN subjects s ON fs.subject_id = s.subject_id",
        (err, result) => {
            if (err) {
                console.error('Query error:', err);
                con.end();
                return res.status(500).json({ error: 'Query failed' });
            }
            res.json(result);
            con.end();
        }
    );
});

// Get Marks (with filters for deptId, subjectId, and semester)
router.get('/marks', (req, res) => {
    const { deptId, subjectId, semester } = req.query;

    console.log('Received /marks request with query:', { deptId, subjectId, semester });

    const con = getConnection();
    let query = `
        SELECT s.roll_number, s.full_name, sub.subject_id, sub.subject_name, sub.semester, sub.course, m.assessment_type, m.mark
        FROM students s
        JOIN subjects sub ON s.dept_id = sub.dept_id AND s.semester = sub.semester AND s.course = sub.course
        LEFT JOIN marks m ON s.roll_number = m.roll_number AND m.subject_id = sub.subject_id
    `;
    const params = [];

    // Apply filters if provided
    if (deptId || subjectId || semester) {
        query += " WHERE";
        const conditions = [];
        if (deptId) {
            conditions.push(" s.dept_id = ?");
            params.push(deptId);
        }
        if (subjectId) {
            conditions.push(" sub.subject_id = ?");
            params.push(subjectId);
        }
        if (semester) {
            conditions.push(" sub.semester = ?");
            params.push(semester);
        }
        query += conditions.join(" AND ");
    }

    console.log('Executing SQL Query:', query);
    console.log('SQL Parameters:', params);

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
router.get('/timetables/semester', (req, res) => {
    const deptId = req.query.deptId;
    const semester = req.query.semester;

    const con = getConnection();
    let query = `
        SELECT 
            t.id AS timetable_id, 
            t.dept_id, 
            COALESCE(ts.semester, 'N/A') AS semester,
            ts.day, 
            ts.slot, 
            s.subject_id,
            s.subject_name,
            fs.faculty_id,
            f.full_name
        FROM timetables t
        JOIN timetable_slots ts ON t.id = ts.timetable_id
        LEFT JOIN subjects s ON ts.subject = s.subject_id
        LEFT JOIN faculty_subjects fs ON s.subject_id = fs.subject_id
        LEFT JOIN faculty f ON fs.faculty_id = f.faculty_id
        WHERE t.type = 'semester'
    `;
    const params = [];

    if (deptId) {
        query += " AND t.dept_id = ?";
        params.push(deptId);
    }
    if (semester) {
        query += " AND t.semester = ?";
        params.push(semester);
    }

    query += " ORDER BY t.semester, ts.day, ts.slot";

    con.query(query, params, (err, result) => {
        if (err) {
            console.error('Query error:', err);
            con.end();
            return res.status(500).json({ error: 'Query failed' });
        }
        res.json(result);
        con.end();
    });
});
router.get('/timetables/faculty', (req, res) => {
    const { deptId, facultyId } = req.query;

    const validationError = validateRequiredFields(['facultyId'], req.query, res);
    if (validationError) return validationError;

    const query = `
        SELECT 
            t.id AS timetable_id, 
            t.dept_id, 
            t.faculty_id, 
            ts.day, 
            ts.slot, 
            ts.semester,
            s.subject_id,
            s.subject_name
        FROM timetables t
        JOIN timetable_slots ts ON t.id = ts.timetable_id
        LEFT JOIN subjects s ON ts.subject = s.subject_id
        WHERE t.type = 'faculty'
        AND t.dept_id = ?
        AND t.faculty_id = ?
        ORDER BY ts.day, ts.slot
    `;
    const params = [deptId || '', facultyId];

    const con = getConnection();
    con.query(query, params, (err, result) => {
        if (err) {
            con.end();
            return res.status(500).json({ error: 'Query failed' });
        }
        console.log('Faculty Timetable Query Result:', result); // Log the result
        res.json(result);
        con.end();
    });
});
module.exports = router;