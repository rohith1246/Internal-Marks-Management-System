const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Database Connection Pool
const pool = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',      // Replace with your DB user
    password: 'root', // Replace with your DB password
    database: 'mydb70'  // Replace with your DB name
});

// Middleware to check if user is HOD
const isHOD = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'hod') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// HOD Details
router.get('/hod-details', isHOD, async (req, res) => {
    const hodId = req.session.user.id;
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT hod_id, hod_name, dept_id, dept_name FROM department_hod WHERE hod_id = ?',
            [hodId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'HOD not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching HOD details:', error);
        res.status(500).json({ error: 'Failed to fetch HOD details' });
    } finally {
        if (connection) connection.release();
    }
});

// Fetch Subjects
router.get('/subjects', isHOD, async (req, res) => {
    const { deptId, course, semester, facultyId } = req.query;
    if (!deptId || !course) {
        return res.status(400).json({ error: 'Department ID and course are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        let query = `
            SELECT s.subject_id, s.subject_name, s.dept_id, s.semester, s.course, f.full_name as assigned_faculty
            FROM subjects s
            LEFT JOIN faculty f ON s.assigned_faculty = f.faculty_id
            WHERE s.dept_id = ? AND s.course = ?`;
        const params = [deptId, course];
        if (semester) {
            query += ' AND s.semester = ?';
            params.push(semester);
        }
        if (facultyId) {
            query += ' AND s.assigned_faculty = ?';
            params.push(facultyId);
        }
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching subjects:', error);
        res.status(500).json({ error: 'Failed to fetch subjects' });
    } finally {
        if (connection) connection.release();
    }
});

// Add Subject
router.post('/add-subject', isHOD, async (req, res) => {
    const { subjectId, subjectName, deptId, semester, course, facultyId } = req.body;
    if (!subjectId || !subjectName || !deptId || !semester || !course) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [existing] = await connection.query('SELECT 1 FROM subjects WHERE subject_id = ?', [subjectId]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Subject ID already exists' });
        }
        await connection.query(
            'INSERT INTO subjects (subject_id, subject_name, dept_id, semester, course, assigned_faculty) VALUES (?, ?, ?, ?, ?, ?)',
            [subjectId, subjectName, deptId, semester, course, facultyId || null]
        );
        res.status(200).json({ message: 'Subject added successfully' });
    } catch (error) {
        console.error('Error adding subject:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: 'Subject ID already exists' });
        } else {
            res.status(500).json({ error: 'Failed to add subject' });
        }
    } finally {
        if (connection) connection.release();
    }
});

// Update Subject
router.put('/update-subject', isHOD, async (req, res) => {
    const { subjectId, subjectName, deptId, semester, course, facultyId } = req.body;
    if (!subjectId || !subjectName || !deptId || !semester || !course) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query(
            'UPDATE subjects SET subject_name = ?, dept_id = ?, semester = ?, course = ?, assigned_faculty = ? WHERE subject_id = ?',
            [subjectName, deptId, semester, course, facultyId || null, subjectId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        res.status(200).json({ message: 'Subject updated successfully' });
    } catch (error) {
        console.error('Error updating subject:', error);
        res.status(500).json({ error: 'Failed to update subject' });
    } finally {
        if (connection) connection.release();
    }
});

// Delete Subject
router.delete('/delete-subject', isHOD, async (req, res) => {
    const { subject_id } = req.query;
    if (!subject_id) {
        return res.status(400).json({ error: 'Subject ID is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query('DELETE FROM subjects WHERE subject_id = ?', [subject_id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        res.status(200).json({ message: 'Subject deleted successfully' });
    } catch (error) {
        console.error('Error deleting subject:', error);
        res.status(500).json({ error: 'Failed to delete subject' });
    } finally {
        if (connection) connection.release();
    }
});

// Fetch Faculty
router.get('/faculty', isHOD, async (req, res) => {
    const { deptId } = req.query;
    if (!deptId) {
        return res.status(400).json({ error: 'Department ID is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT faculty_id, full_name, email, dept_id FROM faculty WHERE dept_id = ?',
            [deptId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching faculty:', error);
        res.status(500).json({ error: 'Failed to fetch faculty' });
    } finally {
        if (connection) connection.release();
    }
});

// Add Faculty
router.post('/add-faculty', isHOD, async (req, res) => {
    const { facultyId, fullName, email, password, deptId } = req.body;
    if (!facultyId || !fullName || !email || !password || !deptId) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [existing] = await connection.query('SELECT 1 FROM faculty WHERE faculty_id = ?', [facultyId]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Faculty ID already exists' });
        }
        await connection.query(
            'INSERT INTO faculty (faculty_id, full_name, email, password, dept_id) VALUES (?, ?, ?, ?, ?)',
            [facultyId, fullName, email, password, deptId]
        );
        res.status(200).json({ message: 'Faculty added successfully' });
    } catch (error) {
        console.error('Error adding faculty:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: 'Faculty ID already exists' });
        } else {
            res.status(500).json({ error: 'Failed to add faculty' });
        }
    } finally {
        if (connection) connection.release();
    }
});

// Update Faculty
router.put('/update-faculty', isHOD, async (req, res) => {
    const { facultyId, fullName, email, password, deptId } = req.body;
    if (!facultyId || !fullName || !email || !deptId) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const query = password ?
            'UPDATE faculty SET full_name = ?, email = ?, password = ?, dept_id = ? WHERE faculty_id = ?' :
            'UPDATE faculty SET full_name = ?, email = ?, dept_id = ? WHERE faculty_id = ?';
        const params = password ?
            [fullName, email, password, deptId, facultyId] :
            [fullName, email, deptId, facultyId];
        const [result] = await connection.query(query, params);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Faculty not found' });
        }
        res.status(200).json({ message: 'Faculty updated successfully' });
    } catch (error) {
        console.error('Error updating faculty:', error);
        res.status(500).json({ error: 'Failed to update faculty' });
    } finally {
        if (connection) connection.release();
    }
});

// Delete Faculty
router.delete('/delete-faculty', isHOD, async (req, res) => {
    const { faculty_id } = req.query;
    if (!faculty_id) {
        return res.status(400).json({ error: 'Faculty ID is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await connection.query('UPDATE subjects SET assigned_faculty = NULL WHERE assigned_faculty = ?', [faculty_id]);
        const [result] = await connection.query('DELETE FROM faculty WHERE faculty_id = ?', [faculty_id]);
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Faculty not found' });
        }
        await connection.commit();
        res.status(200).json({ message: 'Faculty deleted successfully' });
    } catch (error) {
        console.error('Error deleting faculty:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ error: 'Failed to delete faculty' });
    } finally {
        if (connection) connection.release();
    }
});

// Fetch Students
router.get('/hod-students', isHOD, async (req, res) => {
    const { deptId, course, semester } = req.query;
    if (!deptId || !course) {
        return res.status(400).json({ error: 'Department ID and course are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        let query = 'SELECT roll_number, full_name, email, dept_id, semester, course FROM students WHERE dept_id = ? AND course = ?';
        const params = [deptId, course];
        if (semester) {
            query += ' AND semester = ?';
            params.push(semester);
        }
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Failed to fetch students' });
    } finally {
        if (connection) connection.release();
    }
});

// Add Student
router.post('/add-student', isHOD, async (req, res) => {
    const { rollNumber, fullName, email, password, deptId, semester, course } = req.body;
    if (!rollNumber || !fullName || !email || !password || !deptId || !semester || !course) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [existing] = await connection.query('SELECT 1 FROM students WHERE roll_number = ?', [rollNumber]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Roll number already exists' });
        }
        await connection.query(
            'INSERT INTO students (roll_number, full_name, email, password, dept_id, semester, course) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [rollNumber, fullName, email, password, deptId, semester, course]
        );
        res.status(200).json({ message: 'Student added successfully' });
    } catch (error) {
        console.error('Error adding student:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: 'Roll number already exists' });
        } else {
            res.status(500).json({ error: 'Failed to add student' });
        }
    } finally {
        if (connection) connection.release();
    }
});

// Update Student
router.put('/update-student', isHOD, async (req, res) => {
    const { rollNumber, fullName, email, password, deptId, semester, course } = req.body;
    if (!rollNumber || !fullName || !email || !deptId || !semester || !course) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const query = password ?
            'UPDATE students SET full_name = ?, email = ?, password = ?, dept_id = ?, semester = ?, course = ? WHERE roll_number = ?' :
            'UPDATE students SET full_name = ?, email = ?, dept_id = ?, semester = ?, course = ? WHERE roll_number = ?';
        const params = password ?
            [fullName, email, password, deptId, semester, course, rollNumber] :
            [fullName, email, deptId, semester, course, rollNumber];
        const [result] = await connection.query(query, params);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.status(200).json({ message: 'Student updated successfully' });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ error: 'Failed to update student' });
    } finally {
        if (connection) connection.release();
    }
});

// Delete Student
router.delete('/delete-student', isHOD, async (req, res) => {
    const { roll_number } = req.query;
    if (!roll_number) {
        return res.status(400).json({ error: 'Roll number is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.query('DELETE FROM students WHERE roll_number = ?', [roll_number]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.status(200).json({ message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ error: 'Failed to delete student' });
    } finally {
        if (connection) connection.release();
    }
});
router.get('/timetables', isHOD, async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.dept_id) {
            console.error('Session missing or dept_id not set:', req.session.user);
            return res.status(401).json({ error: 'Session invalid, please log in again' });
        }
        console.log('Fetching timetables for dept_id:', req.session.user.dept_id);

        const connection = await pool.getConnection();
        console.log('Database connected successfully');
        connection.release();

        const [timetables] = await pool.query(
            'SELECT t.id, t.type, t.faculty_id, t.semester, t.dept_id, f.full_name AS faculty_name ' +
            'FROM timetables t ' +
            'LEFT JOIN faculty f ON t.faculty_id = f.faculty_id ' + // Changed f.id to f.faculty_id
            'WHERE t.dept_id = ?',
            [req.session.user.dept_id]
        );
        console.log('Timetables fetched:', timetables.length);

        for (let timetable of timetables) {
            console.log('Fetching slots for timetable ID:', timetable.id);
            const [slots] = await pool.query(
                'SELECT ts.day, ts.slot, ts.subject, ts.semester ' +
                'FROM timetable_slots ts WHERE ts.timetable_id = ?',
                [timetable.id]
            );
            timetable.schedule = slots;
        }

        res.status(200).json(timetables);
    } catch (error) {
        console.error('Error fetching timetables:', error);
        res.status(500).json({ error: 'Failed to fetch timetables' });
    }
});
async function generateFacultyTimetables(connection, timetableId, schedule, dept_id) {
    console.log('Generating faculty timetables for timetable ID:', timetableId);
    const subjects = [...new Set(schedule.map(slot => slot.subject))];
    if (!subjects.length) return;

    // Fetch subject details to map subjects to semesters
    const [subjectDetails] = await connection.query(
        'SELECT subject_id, semester FROM subjects WHERE subject_id IN (?)',
        [subjects]
    );

    const subjectSemesterMap = {};
    subjectDetails.forEach(subject => {
        subjectSemesterMap[subject.subject_id] = subject.semester;
    });

    // Fetch faculty assignments from the faculty_subjects table
    const [facultyAssignments] = await connection.query(
        'SELECT subject_id, faculty_id FROM faculty_subjects WHERE subject_id IN (?)',
        [subjects]
    );

    // Group slots by faculty
    const facultySchedules = {};
    schedule.forEach(slot => {
        const subjectId = slot.subject;
        const assignment = facultyAssignments.find(a => a.subject_id === subjectId);
        if (assignment) {
            facultySchedules[assignment.faculty_id] = facultySchedules[assignment.faculty_id] || [];
            const semester = subjectSemesterMap[subjectId] || null;
            facultySchedules[assignment.faculty_id].push({ ...slot, semester, faculty_id: assignment.faculty_id });
        }
    });

    // Process each faculty's schedule
    for (const facultyId in facultySchedules) {
        const [existing] = await connection.query(
            'SELECT id FROM timetables WHERE type = "faculty" AND faculty_id = ? AND dept_id = ?',
            [facultyId, dept_id]
        );

        const slots = facultySchedules[facultyId];
        const currentSemester = subjectSemesterMap[slots[0].subject]; // Get the semester of the current timetable

        if (existing.length > 0) {
            const existingId = existing[0].id;

            // Fetch existing slots for this faculty timetable
            const [existingSlots] = await connection.query(
                'SELECT day, slot, subject, semester FROM timetable_slots WHERE timetable_id = ?',
                [existingId]
            );

            // Create a map of existing slots (key: day-slot, value: slot details)
            const existingSlotsMap = {};
            existingSlots.forEach(slot => {
                const key = `${slot.day}-${slot.slot}`;
                existingSlotsMap[key] = slot;
            });

            // Merge new slots with existing ones
            for (const slot of slots) {
                const key = `${slot.day}-${slot.slot}`;
                const existingSlot = existingSlotsMap[key];

                if (existingSlot) {
                    // If a slot exists at this day-slot, update it only if it belongs to the current semester
                    if (existingSlot.semester === currentSemester) {
                        await connection.query(
                            'UPDATE timetable_slots SET subject = ?, semester = ?, faculty_id = ? WHERE timetable_id = ? AND day = ? AND slot = ?',
                            [slot.subject, slot.semester, slot.faculty_id, existingId, slot.day, slot.slot]
                        );
                    }
                    // If the existing slot is for a different semester, leave it unchanged
                } else {
                    // If no slot exists at this day-slot, insert the new slot
                    await connection.query(
                        'INSERT INTO timetable_slots (timetable_id, day, slot, subject, semester, faculty_id) VALUES (?, ?, ?, ?, ?, ?)',
                        [existingId, slot.day, slot.slot, slot.subject, slot.semester, slot.faculty_id]
                    );
                }
            }
        } else {
            // If no faculty timetable exists, create a new one
            const [result] = await connection.query(
                'INSERT INTO timetables (type, faculty_id, semester, dept_id) VALUES ("faculty", ?, NULL, ?)',
                [facultyId, dept_id]
            );
            const newId = result.insertId;
            for (const slot of slots) {
                await connection.query(
                    'INSERT INTO timetable_slots (timetable_id, day, slot, subject, semester, faculty_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [newId, slot.day, slot.slot, slot.subject, slot.semester, slot.faculty_id]
                );
            }
        }
    }
}
router.post('/create-timetable', isHOD, async (req, res) => {
    const { type, faculty_id, semester, dept_id, schedule } = req.body;
    if (!type || !dept_id || !schedule || (type === 'faculty' && !faculty_id) || (type === 'semester' && !semester)) {
        return res.status(400).json({ error: 'All required fields must be provided' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.query(
            type === 'semester'
                ? 'SELECT id FROM timetables WHERE type = ? AND semester = ? AND dept_id = ?'
                : 'SELECT id FROM timetables WHERE type = ? AND faculty_id = ? AND dept_id = ?',
            type === 'semester' ? ['semester', semester, dept_id] : ['faculty', faculty_id, dept_id]
        );

        let timetableId;
        if (existing.length > 0) {
            timetableId = existing[0].id;
            await connection.query('DELETE FROM timetable_slots WHERE timetable_id = ?', [timetableId]);
        } else {
            const [result] = await connection.query(
                'INSERT INTO timetables (type, faculty_id, semester, dept_id) VALUES (?, ?, ?, ?)',
                [type, faculty_id || null, semester || null, dept_id]
            );
            timetableId = result.insertId;
        }

        for (const slot of schedule) {
            await connection.query(
                'INSERT INTO timetable_slots (timetable_id, day, slot, subject) VALUES (?, ?, ?, ?)', // Changed subject_id to subject
                [timetableId, slot.day, slot.slot, slot.subject]
            );
        }

        if (type === 'semester') {
            await generateFacultyTimetables(connection, timetableId, schedule, dept_id);
        }
        await connection.commit();
        res.status(200).json({ message: 'Timetable created/updated successfully' });
    } catch (error) {
        console.error('Error creating/updating timetable:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ error: `Failed to create/update timetable: ${error.message}` }); // Improved error message
    } finally {
        if (connection) connection.release();
    }
});
// Upload Timetable
router.post('/upload-timetable', isHOD, async (req, res) => {
    const { type, faculty_id, semester, dept_id, schedule } = req.body;
    if (!type || !dept_id || !schedule || (type === 'faculty' && !faculty_id) || (type === 'semester' && !semester)) {
        return res.status(400).json({ error: 'All required fields must be provided' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.query(
            'INSERT INTO timetables (type, faculty_id, semester, dept_id) VALUES (?, ?, ?, ?)',
            [type, faculty_id || null, semester || null, dept_id]
        );
        const timetableId = result.insertId;
        for (const slot of schedule) {
            await connection.query(
                'INSERT INTO timetable_slots (timetable_id, day, slot, subject) VALUES (?, ?, ?, ?)',
                [timetableId, slot.day, slot.slot, slot.subject]
            );
        }
        if (type === 'semester') {
            await generateFacultyTimetables(connection, timetableId, schedule, dept_id);
        }
        await connection.commit();
        res.status(200).json({ message: 'Timetable uploaded successfully' });
    } catch (error) {
        console.error('Error uploading timetable:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ error: 'Failed to upload timetable' });
    } finally {
        if (connection) connection.release();
    }
});

// Delete Timetable
router.delete('/delete-timetable', isHOD, async (req, res) => {
    const { timetable_id } = req.query;
    if (!timetable_id) {
        return res.status(400).json({ error: 'Timetable ID is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await connection.query('DELETE FROM timetable_slots WHERE timetable_id = ?', [timetable_id]);
        const [result] = await connection.query('DELETE FROM timetables WHERE id = ?', [timetable_id]);
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Timetable not found' });
        }
        await connection.commit();
        res.status(200).json({ message: 'Timetable deleted successfully' });
    } catch (error) {
        console.error('Error deleting timetable:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ error: 'Failed to delete timetable' });
    } finally {
        if (connection) connection.release();
    }
});

// Fetch Marks
router.get('/hod-marks', isHOD, async (req, res) => {
    const { deptId, semester, course, subjectId } = req.query;
    if (!deptId || !semester || !course || !subjectId) {
        return res.status(400).json({ error: 'All filters are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT 
                m.roll_number,
                m.subject_id,
                s.subject_name,
                st.semester,
                st.course,
                MAX(CASE WHEN m.assessment_type = 'Assignment 1' THEN m.mark END) AS 'Assignment 1',
                MAX(CASE WHEN m.assessment_type = 'Assignment 2' THEN m.mark END) AS 'Assignment 2',
                MAX(CASE WHEN m.assessment_type = 'Assignment 3' THEN m.mark END) AS 'Assignment 3'
            FROM marks m
            JOIN subjects s ON m.subject_id = s.subject_id
            JOIN students st ON m.roll_number = st.roll_number
            WHERE st.dept_id = ? AND st.semester = ? AND st.course = ? AND m.subject_id = ?
            GROUP BY m.roll_number, m.subject_id, s.subject_name, st.semester, st.course`,
            [deptId, semester, course, subjectId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching marks:', error);
        res.status(500).json({ error: 'Failed to fetch marks' });
    } finally {
        if (connection) connection.release();
    }
});

// Fetch Faculty Assignments
router.get('/faculty-assignments', isHOD, async (req, res) => {
    const { deptId } = req.query;
    if (!deptId) {
        return res.status(400).json({ error: 'Department ID is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT subject_id, assigned_faculty FROM subjects WHERE dept_id = ? AND assigned_faculty IS NOT NULL',
            [deptId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching faculty assignments:', error);
        res.status(500).json({ error: 'Failed to fetch faculty assignments' });
    } finally {
        if (connection) connection.release();
    }
});

// Logout
router.post('/', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.status(500).json({ error: 'Failed to log out' });
        }
        res.status(200).json({ message: 'Logged out successfully' });
    });
});

router.put('/update-timetable', isHOD, async (req, res) => {
    const { timetable_id, type, semester, dept_id, schedule } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await connection.query('DELETE FROM timetable_slots WHERE timetable_id = ?', [timetable_id]);
        for (const slot of schedule) {
            await connection.query(
                'INSERT INTO timetable_slots (timetable_id, day, slot, subject) VALUES (?, ?, ?, ?)', // Changed subject_id to subject
                [timetable_id, slot.day, slot.slot, slot.subject]
            );
        }
        if (type === 'semester') {
            await generateFacultyTimetables(connection, timetable_id, schedule, dept_id);
        }
        await connection.commit();
        res.status(200).json({ message: 'Timetable updated successfully' });
    } catch (error) {
        console.error('Error updating timetable:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ error: `Failed to update timetable: ${error.message}` });
    } finally {
        if (connection) connection.release();
    }
});
router.get('/check-faculty-conflict', isHOD, async (req, res) => {
    const { subjectId, day, slot, semester } = req.query;
    let connection;
    try {
        connection = await pool.getConnection();
        const [faculty] = await connection.query(
            'SELECT faculty_id FROM faculty_subjects WHERE subject_id = ?',
            [subjectId]
        );
        if (!faculty.length) return res.json({ conflict: false });
        const facultyId = faculty[0].faculty_id;
        const [conflicts] = await connection.query(`
            SELECT t.semester
            FROM timetables t
            JOIN timetable_slots ts ON t.id = ts.timetable_id
            WHERE t.type = 'semester' AND t.semester != ? AND ts.day = ? AND ts.slot = ?
            AND ts.subject IN (SELECT subject_id FROM faculty_subjects WHERE faculty_id = ?)
        `, [semester, day, slot, facultyId]);
        if (conflicts.length > 0) {
            res.json({ conflict: true, semester: conflicts[0].semester });
        } else {
            res.json({ conflict: false });
        }
    } catch (error) {
        console.error('Error checking conflict:', error);
        res.status(500).json({ error: 'Failed to check conflict' });
    } finally {
        if (connection) connection.release();
    }
});
router.get('/timetable-details', isHOD, async (req, res) => {
    const { timetable_id } = req.query;
    if (!timetable_id) return res.status(400).json({ error: 'Timetable ID is required' });
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT t.id, t.type, t.faculty_id, t.semester, t.dept_id, ts.day, ts.slot, ts.subject
            FROM timetables t
            LEFT JOIN timetable_slots ts ON t.id = ts.timetable_id
            WHERE t.id = ?`, [timetable_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Timetable not found' });
        const timetable = {
            id: rows[0].id,
            type: rows[0].type,
            faculty_id: rows[0].faculty_id,
            semester: rows[0].semester,
            dept_id: rows[0].dept_id,
            schedule: rows.filter(row => row.day).map(row => ({
                day: row.day,
                slot: row.slot,
                subject: row.subject
            }))
        };
        res.json(timetable);
    } catch (error) {
        console.error('Error fetching timetable:', error);
        res.status(500).json({ error: 'Failed to fetch timetable' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;