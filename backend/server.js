import express from 'express';
import cors from 'cors';
import { createPool } from 'mysql2/promise'; // Use mysql2/promise for async/await
import path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // Correct import for fileURLToPath in ES modules
import { configDotenv } from 'dotenv';

configDotenv(); // Load environment variables from .env file

const app = express();
const PORT = 8080;

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the absolute path to your frontend directory
// This path goes up one level from 'backend', then into 'client', then 'doc_html', then 'admin'
const frontendPath = path.join(__dirname, '..', 'client', 'doc_html', 'admin');

const corsOptions = {
    origin: 'https://app-8d8cf157-1ab5-4af1-8764-ac50e6f681f3.cleverapps.io', // Ensure this matches your frontend's actual origin for Live Server
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Serve static files from the frontend directory
app.use(express.static(frontendPath));


// Connect to the database using a connection pool
const datapool = createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'Isaac',
    password: process.env.DB_PASSWORD || '0000',
    database: process.env.DB_NAME || 'university_database',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/**
 * Initializes the database schema by creating tables if they do not already exist.
 * Based on the provided ER Diagram.
 */
async function initializeDatabaseSchema() {
    console.log('Attempting to initialize database schema...');
    let connection;
    try {
        connection = await datapool.getConnection();
        console.log('Database connection acquired for schema initialization.');

        // SQL statements to create tables based on the ER Diagram
        // Order matters for foreign key dependencies
        const createTableQueries = [
            `CREATE TABLE IF NOT EXISTS Department (
                DepartmentID INT PRIMARY KEY,
                DepartmentName VARCHAR(255) NOT NULL UNIQUE
            );`,
            `CREATE TABLE IF NOT EXISTS ClassRoom (
                RoomNumber INT PRIMARY KEY,
                ClassRoomType VARCHAR(50),
                Capacity INT,
                Building VARCHAR(255),
                DepartmentID INT,
                PhoneNumber VARCHAR(15),
                FOREIGN KEY (DepartmentID) REFERENCES Department(DepartmentID)
            );`,
            `CREATE TABLE IF NOT EXISTS Schedules (
                ScheduleID INT PRIMARY KEY,
                StartTime TIME NOT NULL,
                EndTime TIME NOT NULL,
                DayOfWeek VARCHAR(10) NOT NULL
            );`,
            `CREATE TABLE IF NOT EXISTS Semester (
                SemesterID INT PRIMARY KEY,
                Year INT NOT NULL,
                Season VARCHAR(50) NOT NULL,
                UNIQUE (Year, Season)
            );`,
            `CREATE TABLE IF NOT EXISTS Course (
                CourseCode VARCHAR(50) PRIMARY KEY,
                Title VARCHAR(255) NOT NULL,
                CreditHours INT NOT NULL,
                CourseType VARCHAR(50),
                Description TEXT,
                DepartmentID INT,
                FOREIGN KEY (DepartmentID) REFERENCES Department(DepartmentID)
            );`,
            `CREATE TABLE IF NOT EXISTS Faculty (
                FacultyID INT PRIMARY KEY,
                FullName VARCHAR(255) NOT NULL,
                Designation VARCHAR(100),
                HireDate DATE,
                PhoneNumber VARCHAR(15),
                Email VARCHAR(255) UNIQUE,
                DepartmentID INT,
                FOREIGN KEY (DepartmentID) REFERENCES Department(DepartmentID)
            );`,
            `CREATE TABLE IF NOT EXISTS Student (
                StudentID INT PRIMARY KEY,
                FirstName VARCHAR(255) NOT NULL,
                LastName VARCHAR(255) NOT NULL,
                Gender VARCHAR(10),
                DOB DATE,
                Address TEXT,
                PhoneNumber VARCHAR(15),
                Email VARCHAR(255) UNIQUE,
                EnrollmentDate DATE,
                DepartmentID INT,
                FOREIGN KEY (DepartmentID) REFERENCES Department(DepartmentID)
            );`,
            `CREATE TABLE IF NOT EXISTS User (
                UserID VARCHAR(255) PRIMARY KEY, -- Changed to VARCHAR based on existing code usage
                Password VARCHAR(255) NOT NULL,
                Role VARCHAR(50) NOT NULL,
                FacultyID INT NULL,
                StudentID INT NULL,
                FOREIGN KEY (FacultyID) REFERENCES Faculty(FacultyID),
                FOREIGN KEY (StudentID) REFERENCES Student(StudentID)
            );`,
            `CREATE TABLE IF NOT EXISTS Section (
                SectionID INT PRIMARY KEY,
                CourseCode VARCHAR(50) NOT NULL,
                SemesterID INT NOT NULL,
                ScheduleID INT NOT NULL,
                RoomNumber INT,
                FacultyID INT,
                FOREIGN KEY (CourseCode) REFERENCES Course(CourseCode),
                FOREIGN KEY (SemesterID) REFERENCES Semester(SemesterID),
                FOREIGN KEY (ScheduleID) REFERENCES Schedules(ScheduleID),
                FOREIGN KEY (RoomNumber) REFERENCES ClassRoom(RoomNumber),
                FOREIGN KEY (FacultyID) REFERENCES Faculty(FacultyID)
            );`,
            `CREATE TABLE IF NOT EXISTS Enrollment (
                StudentID INT NOT NULL,
                SectionID INT NOT NULL,
                Grade VARCHAR(20),
                PRIMARY KEY (StudentID, SectionID),
                FOREIGN KEY (StudentID) REFERENCES Student(StudentID),
                FOREIGN KEY (SectionID) REFERENCES Section(SectionID)
            );`
        ];

        for (const query of createTableQueries) {
            console.log(`Executing query: ${query.substring(0, 50)}...`); // Log first 50 chars
            await connection.query(query);
        }
        console.log('Database schema initialized successfully!');

    } catch (err) {
        console.error('Error initializing database schema:', err);
        // It's crucial to handle this error appropriately in a production environment.
        // For development, you might let the server continue, but it won't function correctly.
        // For production, you might want to exit the process or trigger alerts.
    } finally {
        if (connection) connection.release(); // Release the connection back to the pool
    }
}

// Test database connection and initialize schema
datapool.getConnection()
    .then(async connection => { // Use async here because initializeDatabaseSchema is async
        console.log('Database connected successfully!');
        connection.release(); // Release the connection back to the pool
        await initializeDatabaseSchema(); // Initialize schema after successful connection
    })
    .catch(err => {
        console.error('Database connection failed:', err);
        // Exit the process if database connection fails on startup
        process.exit(1);
    });

// Root endpoint - Redirect to login page
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'login.html'));
});

// Admin Sign Up Page
app.get('/admin_signup.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'admin_signup.html'));
});

// --- NEW LOGIN ENDPOINT ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await datapool.query(
            'SELECT UserID, Password, Role, StudentID, FacultyID FROM User WHERE UserID = ?',
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'User not found.' });
        }

        const user = rows[0];

        // In a real application, use a secure password hashing library (e.g., bcrypt)
        // For this example, we're doing a plain text comparison as per original Python DB logic.
        if (user.Password === password) {
            // Successful login
            // Send back user data, excluding the password for security
            const userResponse = {
                UserID: user.UserID,
                Role: user.Role,
                StudentID: user.StudentID,
                FacultyID: user.FacultyID
            };
            res.status(200).json({ message: 'Login successful!', user: userResponse });
        } else {
            res.status(401).json({ error: 'Incorrect password.' });
        }
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'An internal server error occurred during login.' });
    }
});

// --- User API Endpoints ---

// Fetch all users
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT UserID, Role, FacultyID, StudentID FROM User'); // Exclude password for security
        res.json(rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Fetch a user by UserID
app.get('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT UserID, Role, FacultyID, StudentID FROM User WHERE UserID = ?', [userId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Add a new user
app.post('/api/user', async (req, res) => {
    const { UserID, Password, Role, FacultyID, StudentID } = req.body;
    try {
        if (Role === 'faculty' && !FacultyID) {
            return res.status(400).json({ error: 'FacultyID is required for faculty role.' });
        }
        if (Role === 'student' && !StudentID) {
            return res.status(400).json({ error: 'StudentID is required for student role.' });
        }
        if (Role === 'admin' && (FacultyID || StudentID)) {
            return res.status(400).json({ error: 'Admin role should not have FacultyID or StudentID.' });
        }

        const [result] = await datapool.query(
            'INSERT INTO User (UserID, Password, Role, FacultyID, StudentID) VALUES (?, ?, ?, ?, ?)',
            [UserID, Password, Role, FacultyID || null, StudentID || null]
        );
        res.status(201).json({ message: 'User added successfully!', insertId: result.insertId });
    }
    catch (err) {
        console.error('Error adding user:', err);
        res.status(500).json({ error: 'Failed to add user' });
    }
});

// Update a user by UserID
app.put('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const { Password, Role, FacultyID, StudentID } = req.body;
    try {
        const [result] = await datapool.query(
            'UPDATE User SET Password = ?, Role = ?, FacultyID = ?, StudentID = ? WHERE UserID = ?',
            [Password, Role, FacultyID || null, StudentID || null, userId]
        );
        if (result.affectedRows > 0) {
            res.json({ message: 'User updated successfully!' });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete a user by UserID
app.delete('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [result] = await datapool.query('DELETE FROM User WHERE UserID = ?', [userId]);
        if (result.affectedRows > 0) {
            res.json({ message: 'User deleted successfully!' });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Get user role by UserID
app.get('/api/user-role/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT Role FROM User WHERE UserID = ?', [userId]);
        if (rows.length > 0) {
            res.json({ role: rows[0].Role });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Error fetching user role:', err);
        res.status(500).json({ error: 'Failed to fetch user role' });
    }
});

// Get StudentID by UserID
app.get('/api/user/student-id/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT StudentID FROM User WHERE UserID = ?', [userId]);
        if (rows.length > 0 && rows[0].StudentID !== null) {
            res.json({ studentId: rows[0].StudentID });
        } else {
            res.status(404).json({ error: 'Student ID not found for this user.' });
        }
    } catch (err) {
        console.error('Error fetching student ID by user ID:', err);
        res.status(500).json({ error: 'Failed to fetch student ID.' });
    }
});

// Get FacultyID by UserID
app.get('/api/user/faculty-id/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT FacultyID FROM User WHERE UserID = ?', [userId]);
        if (rows.length > 0 && rows[0].FacultyID !== null) {
            res.json({ facultyId: rows[0].FacultyID });
        } else {
            res.status(404).json({ error: 'Faculty ID not found for this user.' });
        }
    } catch (err) {
        console.error('Error fetching faculty ID by user ID:', err);
        res.status(500).json({ error: 'Failed to fetch faculty ID.' });
    }
});

// Get User by StudentID
app.get('/api/user/by-student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT UserID, Password, Role FROM User WHERE StudentID = ?', [studentId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'User not found for this student ID.' });
        }
    } catch (err) {
        console.error('Error fetching user by student ID:', err);
        res.status(500).json({ error: 'Failed to fetch user.' });
    }
});

// Delete user by StudentID
app.delete('/api/user/by-student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        await datapool.query('SET FOREIGN_KEY_CHECKS=0'); // Temporarily disable FK checks
        const [result] = await datapool.query('DELETE FROM User WHERE StudentID = ?', [studentId]);
        await datapool.query('SET FOREIGN_KEY_CHECKS=1'); // Re-enable FK checks
        if (result.affectedRows > 0) {
            res.json({ message: 'User deleted successfully by student ID!' });
        } else {
            res.status(404).json({ error: 'User not found for this student ID.' });
        }
    } catch (err) {
        console.error('Error deleting user by student ID:', err);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// Delete user by FacultyID
app.delete('/api/user/by-faculty/:facultyId', async (req, res) => {
    const { facultyId } = req.params;
    try {
        await datapool.query('SET FOREIGN_KEY_CHECKS=0'); // Temporarily disable FK checks
        const [result] = await datapool.query('DELETE FROM User WHERE FacultyID = ?', [facultyId]);
        await datapool.query('SET FOREIGN_KEY_CHECKS=1'); // Re-enable FK checks
        if (result.affectedRows > 0) {
            res.json({ message: 'User deleted successfully by faculty ID!' });
        } else {
            res.status(404).json({ error: 'User not found for this faculty ID.' });
        }
    } catch (err) {
        console.error('Error deleting user by faculty ID:', err);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});


// --- Student API Endpoints ---

// Get all students
app.get('/api/students', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT * FROM Student');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

// Get student by StudentID
app.get('/api/student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT * FROM Student WHERE StudentID = ?', [studentId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Student not found' });
        }
    } catch (err) {
        console.error('Error fetching student:', err);
        res.status(500).json({ error: 'Failed to fetch student' });
    }
});

// Add a new student
app.post('/api/student', async (req, res) => {
    const { StudentID, FirstName, LastName, Email, PhoneNumber, Address, DOB, Gender, EnrollmentDate, DepartmentID } = req.body;
    try {
        const [result] = await datapool.query(
            'INSERT INTO Student (StudentID, FirstName, LastName, Email, PhoneNumber, Address, DOB, Gender, EnrollmentDate, DepartmentID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [StudentID, FirstName, LastName, Email, PhoneNumber, Address, DOB, Gender, EnrollmentDate, DepartmentID]
        );
        res.status(201).json({ message: 'Student added successfully!', insertId: result.insertId });
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: 'Failed to add student' });
    }
});

// Update a student by StudentID
app.put('/api/student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const { FirstName, LastName, Gender, DOB, Address,PhoneNumber, Email, EnrollmentDate, DepartmentID } = req.body;
    try {
        const [result] = await datapool.query(
            'UPDATE Student SET FirstName = ?, LastName = ?, Email = ?, PhoneNumber = ?, Address = ?, DOB = ?, Gender = ?, EnrollmentDate = ?, DepartmentID = ? WHERE StudentID = ?',
            [FirstName, LastName, Email, PhoneNumber, Address, DOB, Gender, EnrollmentDate, DepartmentID, studentId]
        );
        if (result.affectedRows > 0) {
            res.json({ message: 'Student updated successfully!' });
        } else {
            res.status(404).json({ error: 'Student not found' });
        }
    }
    catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ error: 'Failed to update student' });
    }
});

// Delete a student by StudentID
app.delete('/api/student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        await datapool.query('SET FOREIGN_KEY_CHECKS=0'); // Temporarily disable FK checks
        const [result] = await datapool.query('DELETE FROM Student WHERE StudentID = ?', [studentId]);
        await datapool.query('SET FOREIGN_KEY_CHECKS=1'); // Re-enable FK checks
        if (result.affectedRows > 0) {
            res.json({ message: 'Student deleted successfully!' });
        } else {
            res.status(404).json({ error: 'Student not found' });
        }
    } catch (err) {
        console.error('Error deleting student:', err);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

// Get student name by ID
app.get('/api/student-name/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT FirstName, LastName FROM Student WHERE StudentID = ?', [studentId]);
        if (rows.length > 0) {
            res.json({ fullName: `${rows[0].FirstName} ${rows[0].LastName}` });
        } else {
            res.status(404).json({ error: 'Student not found' });
        }
    } catch (err) {
        console.error('Error fetching student name:', err);
        res.status(500).json({ error: 'Failed to fetch student name' });
    }
});

// Get student department ID
app.get('/api/student-department/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT DepartmentID FROM Student WHERE StudentID = ?', [studentId]);
        if (rows.length > 0 && rows[0].DepartmentID !== null) {
            res.json({ departmentId: rows[0].DepartmentID });
        } else {
            res.status(404).json({ error: 'Student department not found' });
        }
    } catch (err) {
        console.error('Error fetching student department ID:', err);
        res.status(500).json({ error: 'Failed to fetch student department ID' });
    }
});

// Get student enrolled semesters
app.get('/api/student-semesters/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT DISTINCT
                sem.Season,
                sem.Year
            FROM Enrollment e
            JOIN Section s ON e.SectionID = s.SectionID
            JOIN Semester sem ON s.SemesterID = sem.SemesterID
            WHERE e.StudentID = ?
            ORDER BY sem.Year DESC, FIELD(sem.Season, 'Fall', 'Summer', 'Spring') DESC;
        `, [studentId]);
        const semesters = rows.map(row => `${row.Season}${row.Year}`);
        res.json(semesters);
    } catch (err) {
        console.error('Error fetching student enrolled semesters:', err);
        res.status(500).json({ error: 'Failed to fetch student enrolled semesters' });
    }
});

// Get student info for enrollment (StudentID, FullName, DepartmentID)
app.get('/api/student-info-for-enrollment/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT StudentID, CONCAT(FirstName, " ", LastName) AS FullName, DepartmentID FROM Student WHERE StudentID = ?', [studentId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Student info not found for enrollment' });
        }
    } catch (err) {
        console.error('Error fetching student info for enrollment:', err);
        res.status(500).json({ error: 'Failed to fetch student info for enrollment' });
    }
});

// --- Faculty API Endpoints ---

// Get all faculty members
app.get('/api/faculty/all', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT * FROM Faculty');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching faculties:', err);
        res.status(500).json({ error: 'Failed to fetch faculties' });
    }
});

// Get all faculty members
app.get('/api/faculties', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT * FROM Faculty');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching faculties:', err);
        res.status(500).json({ error: 'Failed to fetch faculties' });
    }
});

// Get faculty member by FacultyID
app.get('/api/faculty/:facultyId', async (req, res) => {
    const { facultyId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT * FROM Faculty WHERE FacultyID = ?', [facultyId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Faculty member not found' });
        }
    } catch (err) {
        console.error('Error fetching faculty member:', err);
        res.status(500).json({ error: 'Failed to fetch faculty member' });
    }
});

// Add a new faculty member
app.post('/api/faculty', async (req, res) => {
    const { FacultyID, FullName, Email, PhoneNumber, HireDate, Designation, DepartmentID } = req.body;
    try {
        const [result] = await datapool.query(
            'INSERT INTO Faculty (FacultyID, FullName, Email, PhoneNumber, HireDate, Designation, DepartmentID) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [FacultyID, FullName, Email, PhoneNumber, HireDate, Designation, DepartmentID]
        );
        res.status(201).json({ message: 'Faculty member added successfully!', insertId: result.insertId });
    } catch (err) {
        console.error('Error adding faculty member:', err);
        res.status(500).json({ error: 'Failed to add faculty member' });
    }
});

// Update a faculty member by FacultyID
app.put('/api/faculty/:facultyId', async (req, res) => {
    const { facultyId } = req.params;
    const { FullName, Email, PhoneNumber, HireDate, Designation, DepartmentID } = req.body;
    try {
        const [result] = await datapool.query(
            'UPDATE Faculty SET FullName = ?, Email = ?, PhoneNumber = ?, HireDate = ?, Designation = ?, DepartmentID = ? WHERE FacultyID = ?',
            [FullName, Email, PhoneNumber, HireDate, Designation, DepartmentID, facultyId]
        );
        if (result.affectedRows > 0) {
            res.json({ message: 'Faculty member updated successfully!' });
        } else {
            res.status(404).json({ error: 'Faculty member not found' });
        }
    } catch (err) {
        console.error('Error updating faculty member:', err);
        res.status(500).json({ error: 'Failed to update faculty member' });
    }
});

// Delete a faculty member by FacultyID
app.delete('/api/faculty/:facultyId', async (req, res) => {
    const { facultyId } = req.params;
    try {
        await datapool.query('SET FOREIGN_KEY_CHECKS=0'); // Temporarily disable FK checks
        const [result] = await datapool.query('DELETE FROM Faculty WHERE FacultyID = ?', [facultyId]);
        await datapool.query('SET FOREIGN_KEY_CHECKS=1'); // Re-enable FK checks
        if (result.affectedRows > 0) {
            res.json({ message: 'Faculty member deleted successfully!' });
        } else {
            res.status(404).json({ error: 'Faculty member not found' });
        }
    } catch (err) {
        console.error('Error deleting faculty member:', err);
        res.status(500).json({ error: 'Failed to delete faculty member' });
    }
});

// Get faculty ID by email
app.get('/api/faculty-id-by-email/:email', async (req, res) => {
    const { email } = req.params;
    try {
        const [rows] = await datapool.query('SELECT FacultyID FROM Faculty WHERE Email = ?', [email]);
        if (rows.length > 0 && rows[0].FacultyID !== null) {
            res.json({ facultyId: rows[0].FacultyID });
        } else {
            res.status(404).json({ error: 'Faculty ID not found for this email.' });
        }
    } catch (err) {
        console.error('Error fetching faculty ID by email:', err);
        res.status(500).json({ error: 'Failed to fetch faculty ID.' });
    }
});

// Get faculty profile
app.get('/api/faculty-profile/:facultyId', async (req, res) => {
    const { facultyId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT FacultyID, FullName, Designation, HireDate, PhoneNumber, Email, DepartmentID FROM Faculty WHERE FacultyID = ?', [facultyId]);
        if (rows.length > 0) {
            const facultyData = rows[0];
            const facultyProfile = {
                faculty_id: facultyData.FacultyID,
                name: facultyData.FullName,
                email: facultyData.Email,
                phone: facultyData.PhoneNumber,
                hire_date: facultyData.HireDate,
                designation: facultyData.Designation,
                department_id: facultyData.DepartmentID
            };
            res.json(facultyProfile);
        } else {
            res.status(404).json({ error: 'Faculty profile not found' });
        }
    } catch (err) {
        console.error('Error fetching faculty profile:', err);
        res.status(500).json({ error: 'Failed to fetch faculty profile' });
    }
});

// Get faculty courses code
app.get('/api/faculty-courses-code/:facultyId', async (req, res) => {
    const { facultyId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT CourseCode FROM Section WHERE FacultyID = ?', [facultyId]);
        const courses = rows.map(row => row.CourseCode);
        res.json(courses);
    } catch (err) {
        console.error('Error fetching faculty courses code:', err);
        res.status(500).json({ error: 'Failed to fetch faculty courses code' });
    }
});

// Get faculty courses by semester (CORRECTED ROUTE PARAMETERS)
app.get('/api/faculty-courses/:facultyId/:season/:year', async (req, res) => {
    const { facultyId, season, year } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT
                C.CourseCode,
                C.Title,
                s.SectionID,
                sch.StartTime,
                sch.EndTime,
                sch.DayOfWeek,
                s.RoomNumber
            FROM Section s
            JOIN Course C ON s.CourseCode = C.CourseCode
            JOIN Semester sem ON s.SemesterID = sem.SemesterID
            JOIN Schedules sch ON s.ScheduleID = sch.ScheduleID
            WHERE s.FacultyID = ? AND sem.Season = ? AND sem.Year = ?
        `, [facultyId, season, year]);

        const facultyCourses = rows.map(row => ({
            course_code: row.CourseCode,
            title: row.Title,
            section_id: row.SectionID,
            time_slot: `${row.StartTime} - ${row.EndTime}`, // Combine for display
            days: row.DayOfWeek,
            room_number: row.RoomNumber // Include room number
        }));
        res.json(facultyCourses);
    } catch (err) {
        console.error('Error fetching faculty courses:', err);
        res.status(500).json({ error: 'Failed to fetch faculty courses' });
    }
});

// Get faculty semesters
app.get('/api/faculty-semesters/:facultyId', async (req, res) => {
    const { facultyId } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT DISTINCT
                sem.Season,
                sem.Year
            FROM Section s
            JOIN Semester sem ON s.SemesterID = sem.SemesterID
            WHERE s.FacultyID = ?
            ORDER BY sem.Year DESC, FIELD(sem.Season, 'Fall', 'Summer', 'Spring') DESC;
        `, [facultyId]);
        const semesters = rows.map(row => `${row.Season}${row.Year}`);
        res.json(semesters);
    } catch (err) {
        console.error('Error fetching faculty semesters:', err);
        res.status(500).json({ error: 'Failed to fetch faculty semesters' });
    }
});

// Get faculties by department ID
app.get('/api/faculties-by-department/:departmentId', async (req, res) => {
    const { departmentId } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT FacultyID, FullName
            FROM Faculty
            WHERE DepartmentID = ?
            ORDER BY FullName;
        `, [departmentId]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching faculties by department ID:', err);
        res.status(500).json({ error: 'Failed to fetch faculties by department ID' });
    }
});


// --- Department API Endpoints ---

// Get all departments
app.get('/api/departments', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT DepartmentID, DepartmentName FROM Department ORDER BY DepartmentName');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching departments:', err);
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

// Get department by ID
app.get('/api/department/:departmentId', async (req, res) => {
    const { departmentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT * FROM Department WHERE DepartmentID = ?', [departmentId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Department not found' });
        }
    } catch (err) {
        console.error('Error fetching department:', err);
        res.status(500).json({ error: 'Failed to fetch department' });
    }
});

// Add a new department
app.post('/api/department', async (req, res) => {
    const { DepartmentID, DepartmentName } = req.body;
    try {
        const [result] = await datapool.query('INSERT INTO Department (DepartmentID, DepartmentName) VALUES (?, ?)', [DepartmentID, DepartmentName]);
        res.status(201).json({ message: 'Department added successfully!', insertId: result.insertId });
    } catch (err) {
        console.error('Error adding department:', err);
        res.status(500).json({ error: 'Failed to add department' });
    }
});

// Update a department by ID
app.put('/api/department/:departmentId', async (req, res) => {
    const { departmentId } = req.params;
    const { DepartmentName } = req.body;
    try {
        const [result] = await datapool.query('UPDATE Department SET DepartmentName = ? WHERE DepartmentID = ?', [DepartmentName, departmentId]);
        if (result.affectedRows > 0) {
            res.json({ message: 'Department updated successfully!' });
        } else {
            res.status(404).json({ error: 'Department not found' });
        }
    } catch (err) {
        console.error('Error updating department:', err);
        res.status(500).json({ error: 'Failed to update department' });
    }
});

// Delete a department by ID
app.delete('/api/department/:departmentId', async (req, res) => {
    const { departmentId } = req.params;
    let connection;
    try {
        connection = await datapool.getConnection();
        await connection.beginTransaction();

        await connection.query('SET FOREIGN_KEY_CHECKS=0'); // Temporarily disable FK checks

        await connection.query('DELETE FROM Course WHERE DepartmentID = ?', [departmentId]);
        await connection.query('DELETE FROM Faculty WHERE DepartmentID = ?', [departmentId]);
        await connection.query('DELETE FROM ClassRoom WHERE DepartmentID = ?', [departmentId]);
        await connection.query('DELETE FROM Student WHERE DepartmentID = ?', [departmentId]);

        const [result] = await connection.query('DELETE FROM Department WHERE DepartmentID = ?', [departmentId]);

        await connection.query('SET FOREIGN_KEY_CHECKS=1'); // Re-enable FK checks
        await connection.commit();

        if (result.affectedRows > 0) {
            res.json({ message: 'Department and related data deleted successfully!' });
        } else {
            res.status(404).json({ error: 'Department not found' });
        }
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error deleting department:', err);
        res.status(500).json({ error: 'Failed to delete department' });
    } finally {
        if (connection) connection.release();
    }
});

// Get department ID by name
app.get('/api/department-id-by-name/:departmentName', async (req, res) => {
    const { departmentName } = req.params;
    try {
        const [rows] = await datapool.query('SELECT DepartmentID FROM Department WHERE DepartmentName = ?', [departmentName]);
        if (rows.length > 0 && rows[0].DepartmentID !== null) {
            res.json({ departmentId: rows[0].DepartmentID });
        } else {
            res.status(404).json({ error: 'Department ID not found for this name.' });
        }
    } catch (err) {
        console.error('Error fetching department ID by name:', err);
        res.status(500).json({ error: 'Failed to fetch department ID.' });
    }
});

// Get department name by ID
app.get('/api/department-name/:departmentId', async (req, res) => {
    const { departmentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT DepartmentName FROM Department WHERE DepartmentID = ?', [departmentId]);
        if (rows.length > 0 && rows[0].DepartmentName !== null) {
            res.json({ departmentName: rows[0].DepartmentName });
        } else {
            res.status(404).json({ error: 'Department name not found for this ID.' });
        }
    } catch (err) {
        console.error('Error fetching department name by ID:', err);
        res.status(500).json({ error: 'Failed to fetch department name.' });
    }
});

// Get students in section
app.get('/api/department/students-in-section/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT
                E.StudentID,
                S.FirstName,
                S.LastName,
                E.Grade
            FROM Enrollment E
            JOIN Student S ON E.StudentID = S.StudentID
            WHERE E.SectionID = ?
        `, [sectionId]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching students in section:', err);
        res.status(500).json({ error: 'Failed to fetch students in section' });
    }
});


// --- Course API Endpoints ---

// Get all courses
app.get('/api/courses', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT CourseCode, Title, CreditHours, CourseType, Description, DepartmentID FROM Course');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching courses:', err);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// Get course by CourseCode
app.get('/api/course/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    try {
        const [rows] = await datapool.query('SELECT CourseCode, Title, CreditHours, CourseType, Description, DepartmentID FROM Course WHERE CourseCode = ?', [courseCode]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Course not found' });
        }
    } catch (err) {
        console.error('Error fetching course:', err);
        res.status(500).json({ error: 'Failed to fetch course' });
    }
});

// Add a new course
app.post('/api/course', async (req, res) => {
    const { CourseCode, Title, CreditHours, CourseType, Description, DepartmentID } = req.body;
    try {
        const [result] = await datapool.query(
            'INSERT INTO Course (CourseCode, Title, CreditHours, CourseType, Description, DepartmentID) VALUES (?, ?, ?, ?, ?, ?)',
            [CourseCode, Title, CreditHours, CourseType, Description, DepartmentID]
        );
        res.status(201).json({ message: 'Course added successfully!', insertId: result.insertId });
    } catch (err) {
        console.error('Error adding course:', err);
        res.status(500).json({ error: 'Failed to add course' });
    }
});

// Update a course by CourseCode
app.put('/api/course/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const { Title, CreditHours, CourseType, Description, DepartmentID } = req.body;
    try {
        const [result] = await datapool.query(
            'UPDATE Course SET Title = ?, CreditHours = ?, CourseType = ?, Description = ?, DepartmentID = ? WHERE CourseCode = ?',
            [Title, CreditHours, CourseType, Description, DepartmentID, courseCode]
        );
        if (result.affectedRows > 0) {
            res.json({ message: 'Course updated successfully!' });
        } else {
            res.status(404).json({ error: 'Course not found' });
        }
    } catch (err) {
        console.error('Error updating course:', err);
        res.status(500).json({ error: 'Failed to update course' });
    }
});

// Delete a course by CourseCode
app.delete('/api/course/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    try {
        //await datapool.query('SET FOREIGN_KEY_CHECKS=0'); // Temporarily disable FK checks
        const [result] = await datapool.query('DELETE FROM Course WHERE CourseCode = ?', [courseCode]);
        //await datapool.query('SET FOREIGN_KEY_CHECKS=1'); // Re-enable FK checks
        if (result.affectedRows > 0) {
            res.json({ message: 'Course deleted successfully!' });
        } else {
            res.status(404).json({ error: 'Course not found' });
        }
    } catch (err) {
        console.error('Error deleting course:', err);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

// Check if course is elective
app.get('/api/course/is-elective/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    try {
        const [rows] = await datapool.query('SELECT CourseType FROM Course WHERE CourseCode = ?', [courseCode]);
        if (rows.length > 0) {
            res.json({ isElective: rows[0].CourseType === 'Elective' });
        } else {
            res.status(404).json({ error: 'Course not found' });
        }
    } catch (err) {
        console.error('Error checking if course is elective:', err);
        res.status(500).json({ error: 'Failed to check course type' });
    }
});

// Check if course is major for a student
app.get('/api/course/is-major/:studentId/:courseCode', async (req, res) => {
    const { studentId, courseCode } = req.params;
    try {
        const [courseDeptRows] = await datapool.query('SELECT DepartmentID FROM Course WHERE CourseCode = ?', [courseCode]);
        const [studentDeptRows] = await datapool.query('SELECT DepartmentID FROM Student WHERE StudentID = ?', [studentId]);

        if (courseDeptRows.length > 0 && studentDeptRows.length > 0) {
            const courseDepartmentId = courseDeptRows[0].DepartmentID;
            const studentDepartmentId = studentDeptRows[0].DepartmentID;
            res.json({ isMajor: courseDepartmentId === studentDepartmentId });
        } else {
            res.status(404).json({ error: 'Course or Student not found' });
        }
    } catch (err) {
        console.error('Error checking if course is major:', err);
        res.status(500).json({ error: 'Failed to check major status' });
    }
});

// Get courses by department ID
app.get('/api/courses-by-department/:departmentId', async (req, res) => {
    const { departmentId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT CourseCode, Title FROM Course WHERE DepartmentID = ?', [departmentId]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching courses by department ID:', err);
        res.status(500).json({ error: 'Failed to fetch courses by department ID' });
    }
});

// Get course name by course code
app.get('/api/course-name/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    try {
        const [rows] = await datapool.query('SELECT Title FROM Course WHERE CourseCode = ?', [courseCode]);
        if (rows.length > 0 && rows[0].Title !== null) {
            res.json({ courseName: rows[0].Title });
        } else {
            res.status(404).json({ error: 'Course name not found for this code.' });
        }
    } catch (err) {
        console.error('Error fetching course name:', err);
        res.status(500).json({ error: 'Failed to fetch course name.' });
    }
});


// --- Classroom API Endpoints ---

// Get all classrooms
app.get('/api/classrooms', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT RoomNumber, ClassRoomType, Capacity, Building, PhoneNumber, DepartmentID FROM ClassRoom');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching classrooms:', err);
        res.status(500).json({ error: 'Failed to fetch classrooms' });
    }
});

// Get classroom by RoomNumber
app.get('/api/classroom/:roomNumber', async (req, res) => {
    const { roomNumber } = req.params;
    try {
        const [rows] = await datapool.query('SELECT RoomNumber, ClassRoomType, Capacity, Building, PhoneNumber, DepartmentID FROM ClassRoom WHERE RoomNumber = ?', [roomNumber]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Classroom not found' });
        }
    } catch (err) {
        console.error('Error fetching classroom:', err);
        res.status(500).json({ error: 'Failed to fetch classroom' });
    }
});

// Add a new classroom
app.post('/api/classroom', async (req, res) => {
    const { RoomNumber, ClassRoomType, Capacity, Building, DepartmentID, PhoneNumber } = req.body;
    try {
        const [result] = await datapool.query(
            'INSERT INTO ClassRoom (RoomNumber, ClassRoomType, Capacity, Building, DepartmentID, PhoneNumber) VALUES (?, ?, ?, ?, ?, ?)',
            [RoomNumber, ClassRoomType, Capacity, Building, DepartmentID, PhoneNumber]
        );
        res.status(201).json({ message: 'Classroom added successfully!', insertId: result.insertId });
    } catch (err) {
        console.error('Error adding classroom:', err);
        res.status(500).json({ error: 'Failed to add classroom' });
    }
});

// Update a classroom by RoomNumber
app.put('/api/classroom/:roomNumber', async (req, res) => {
    const { roomNumber } = req.params;
    const { newRoomNumber, ClassRoomType, Capacity, Building, DepartmentID, PhoneNumber } = req.body;
    try {
        const [result] = await datapool.query(
            'UPDATE ClassRoom SET RoomNumber = ?, ClassRoomType = ?, Capacity = ?, Building = ?, DepartmentID = ?, PhoneNumber = ? WHERE RoomNumber = ?',
            [newRoomNumber, ClassRoomType, Capacity, Building, DepartmentID, PhoneNumber, roomNumber]
        );
        if (result.affectedRows > 0) {
            res.json({ message: 'Classroom updated successfully!' });
        } else {
            res.status(404).json({ error: 'Classroom not found' });
        }
    } catch (err) {
        console.error('Error updating classroom:', err);
        res.status(500).json({ error: 'Failed to update classroom' });
    }
});

// Delete a classroom by RoomNumber
app.delete('/api/classroom/:roomNumber', async (req, res) => {
    const { roomNumber } = req.params;
    try {
        await datapool.query('SET FOREIGN_KEY_CHECKS=0'); // Temporarily disable FK checks
        const [result] = await datapool.query('DELETE FROM ClassRoom WHERE RoomNumber = ?', [roomNumber]);
        await datapool.query('SET FOREIGN_KEY_CHECKS=1'); // Re-enable FK checks
        if (result.affectedRows > 0) {
            res.json({ message: 'Classroom deleted successfully!' });
        } else {
            res.status(404).json({ error: 'Classroom not found' });
        }
    } catch (err) {
        console.error('Error deleting classroom:', err);
        res.status(500).json({ error: 'Failed to delete classroom' });
    }
});


// --- Section API Endpoints ---

// Get all sections
app.get('/api/sections', async (req, res) => {
    try {
        const [rows] = await datapool.query(`
            SELECT sec.SectionID, sec.CourseCode, sem.SemesterID, sem.Year, sem.Season,
                   sch.StartTime, sch.EndTime, sch.DayOfWeek, sec.FacultyID, sec.RoomNumber
            FROM Section sec
            JOIN Schedules sch ON sec.ScheduleID = sch.ScheduleID
            JOIN Semester sem ON sec.SemesterID = sem.SemesterID
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching sections:', err);
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// Get section by SectionID
app.get('/api/section/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT * FROM Section WHERE SectionID = ?', [sectionId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Section not found' });
        }
    } catch (err) {
        console.error('Error fetching section:', err);
        res.status(500).json({ error: 'Failed to fetch section' });
    }
});

// Add a new section
app.post('/api/section', async (req, res) => {
    const { SectionID, CourseCode, SemesterID, Year, Season, StartTime, EndTime, DayOfWeek, FacultyID, RoomNumber } = req.body;
    let connection;
    try {
        connection = await datapool.getConnection();
        await connection.beginTransaction();

        await connection.query(
            'INSERT IGNORE INTO Semester (SemesterID, Year, Season) VALUES (?, ?, ?)',
            [SemesterID, Year, Season]
        );

        const ScheduleID = Math.floor(Math.random() * 100000);
        await connection.query(
            'INSERT INTO Schedules (ScheduleID, StartTime, EndTime, DayOfWeek) VALUES (?, ?, ?, ?)',
            [ScheduleID, StartTime, EndTime, DayOfWeek]
        );

        const [result] = await connection.query(
            'INSERT INTO Section (SectionID, CourseCode, SemesterID, ScheduleID, FacultyID, RoomNumber) VALUES (?, ?, ?, ?, ?, ?)',
            [SectionID, CourseCode, SemesterID, ScheduleID, FacultyID, RoomNumber]
        );
        await connection.commit();
        res.status(201).json({ message: 'Section added successfully!', insertId: result.insertId });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error adding section:', err);
        res.status(500).json({ error: 'Failed to add section' });
    } finally {
        if (connection) connection.release();
    }
});

// Update a section by SectionID
app.put('/api/section/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    const { CourseCode, SemesterID, Year, Season, StartTime, EndTime, DayOfWeek, FacultyID, RoomNumber } = req.body;
    let connection;
    try {
        connection = await datapool.getConnection();
        await connection.beginTransaction();

        const [sectionRows] = await connection.query('SELECT ScheduleID, SemesterID FROM Section WHERE SectionID = ?', [sectionId]);
        if (sectionRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Section not found' });
        }
        const existingScheduleID = sectionRows[0].ScheduleID;
        const existingSemesterID = sectionRows[0].SemesterID;

        if (SemesterID && (SemesterID !== existingSemesterID || Year || Season)) {
             await connection.query(
                'INSERT INTO Semester (SemesterID, Year, Season) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE Year = VALUES(Year), Season = VALUES(Season)',
                [SemesterID, Year, Season]
            );
        }

        await connection.query(
            'UPDATE Schedules SET StartTime = ?, EndTime = ?, DayOfWeek = ? WHERE ScheduleID = ?',
            [StartTime, EndTime, DayOfWeek, existingScheduleID]
        );

        const [result] = await datapool.query(
            'UPDATE Section SET CourseCode = ?, SemesterID = ?, FacultyID = ?, RoomNumber = ? WHERE SectionID = ?',
            [CourseCode, SemesterID, FacultyID, RoomNumber, sectionId]
        );

        await connection.commit();
        if (result.affectedRows > 0) {
            res.json({ message: 'Section updated successfully!' });
        } else {
            res.status(404).json({ error: 'Section not found or no changes made' });
        }
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error updating section:', err);
        res.status(500).json({ error: 'Failed to update section' });
    } finally {
        if (connection) connection.release();
    }
});

// Delete a section by SectionID
app.delete('/api/section/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    let connection;
    try {
        connection = await datapool.getConnection();
        await connection.beginTransaction();

        const [sectionRows] = await connection.query('SELECT ScheduleID FROM Section WHERE SectionID = ?', [sectionId]);
        if (sectionRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Section not found' });
        }
        const scheduleIdToDelete = sectionRows[0].ScheduleID;

        await connection.query('SET FOREIGN_KEY_CHECKS=0');

        await connection.query('DELETE FROM Enrollment WHERE SectionID = ?', [sectionId]);

        const [resultSection] = await connection.query('DELETE FROM Section WHERE SectionID = ?', [sectionId]);

        if (resultSection.affectedRows > 0 && scheduleIdToDelete) {
            await connection.query('DELETE FROM Schedules WHERE ScheduleID = ?', [scheduleIdToDelete]);
        }

        await connection.query('SET FOREIGN_KEY_CHECKS=1');
        await connection.commit();

        if (resultSection.affectedRows > 0) {
            res.json({ message: 'Section and associated schedule deleted successfully!' });
        } else {
            res.status(404).json({ error: 'Section not found' });
        }
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error deleting section:', err);
        res.status(500).json({ error: 'Failed to delete section' });
    } finally {
        if (connection) connection.release();
    }
});

// Get total sections
app.get('/api/sections/total', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT COUNT(*) AS totalSections FROM Section');
        res.json({ totalSections: rows[0].totalSections });
    } catch (err) {
        console.error('Error fetching total sections:', err);
        res.status(500).json({ error: 'Failed to fetch total sections' });
    }
});

// Get section details for enrollment
app.get('/api/section-details-for-enrollment/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT
                s.SectionID,
                s.CourseCode,
                c.CourseType,
                c.DepartmentID AS CourseDepartmentID,
                cr.Capacity AS ClassroomCapacity,
                (SELECT COUNT(*) FROM Enrollment WHERE SectionID = s.SectionID) AS CurrentEnrollment
            FROM Section s
            JOIN Course c ON s.CourseCode = c.CourseCode
            LEFT JOIN ClassRoom cr ON s.RoomNumber = cr.RoomNumber
            WHERE s.SectionID = ?;
        `, [sectionId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Section details not found for enrollment' });
        }
    } catch (err) {
        console.error('Error fetching section details for enrollment:', err);
        res.status(500).json({ error: 'Failed to fetch section details for enrollment' });
    }
});

// Get sections for student enrollment view
app.get('/api/sections-for-student-enrollment-view/:season/:year', async (req, res) => {
    const { season, year } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT
                s.SectionID,
                s.RoomNumber,
                s.CourseCode,
                c.Title AS CourseTitle,
                sem.Season,
                sem.Year,
                sch.StartTime,
                sch.EndTime,
                sch.DayOfWeek,
                f.FullName AS FacultyName,
                c.DepartmentID AS CourseDepartmentID,
                c.CourseType
            FROM Section s
            JOIN Course c ON s.CourseCode = c.CourseCode
            LEFT JOIN ClassRoom cr ON s.RoomNumber = cr.RoomNumber
            JOIN Semester sem ON s.SemesterID = sem.SemesterID
            JOIN Schedules sch ON s.ScheduleID = sch.ScheduleID
            LEFT JOIN Faculty f ON s.FacultyID = f.FacultyID
            WHERE sem.Season = ? AND sem.Year = ?
            ORDER BY c.CourseCode, s.SectionID;
        `, [season, year]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching sections for student enrollment view:', err);
        res.status(500).json({ error: 'Failed to fetch sections for student enrollment view' });
    }
});

// Get student schedule sections
app.get('/api/student-schedule-sections/:studentId/:season/:year', async (req, res) => {
    const { studentId, season, year } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT
                s.SectionID,
                s.CourseCode,
                c.Title AS CourseTitle,
                sch.StartTime,
                sch.EndTime,
                sch.DayOfWeek,
                f.FullName AS FacultyName,
                cr.RoomNumber
            FROM Enrollment e
            JOIN Section s ON e.SectionID = s.SectionID
            JOIN Course c ON s.CourseCode = c.CourseCode
            JOIN Semester sem ON s.SemesterID = sem.SemesterID
            JOIN Schedules sch ON s.ScheduleID = sch.ScheduleID
            LEFT JOIN Faculty f ON s.FacultyID = f.FacultyID
            LEFT JOIN ClassRoom cr ON s.RoomNumber = cr.RoomNumber
            WHERE e.StudentID = ? AND sem.Season = ? AND sem.Year = ?
            ORDER BY sch.DayOfWeek, sch.StartTime;
        `, [studentId, season, year]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching student schedule sections:', err);
        res.status(500).json({ error: 'Failed to fetch student schedule sections' });
    }
});

// Get ScheduleID by SectionID
app.get('/api/schedule-id-by-section/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT sch.ScheduleID
            FROM Section sec
            JOIN Schedules sch ON sec.ScheduleID = sch.ScheduleID
            WHERE sec.SectionID = ?
        `, [sectionId]);
        if (rows.length > 0 && rows[0].ScheduleID !== null) {
            res.json({ scheduleId: rows[0].ScheduleID });
        } else {
            res.status(404).json({ error: 'Schedule ID not found for this section.' });
        }
    } catch (err) {
        console.error('Error fetching schedule ID by section ID:', err);
        res.status(500).json({ error: 'Failed to fetch schedule ID.' });
    }
});


// --- Enrollment API Endpoints ---

// Get all enrollments with details for a student
app.get('/api/enrollments/student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [rows] = await datapool.query(`
            SELECT e.StudentID, c.CourseCode, c.Title, e.Grade, s.SectionID
            FROM Enrollment e
            JOIN Section s ON e.SectionID = s.SectionID
            JOIN Course c ON c.CourseCode = s.CourseCode
            WHERE e.StudentID = ?;
        `, [studentId]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching enrollments with details:', err);
        res.status(500).json({ error: 'Failed to fetch enrollments with details' });
    }
});

// Add a new enrollment
app.post('/api/enrollment', async (req, res) => {
    const { StudentID, SectionID, Grade = 'Ungraded' } = req.body;
    try {
        const [result] = await datapool.query(
            'INSERT INTO Enrollment (StudentID, SectionID, Grade) VALUES (?, ?, ?)',
            [StudentID, SectionID, Grade]
        );
        res.status(201).json({ message: 'Enrollment added successfully!', insertId: result.insertId });
    } catch (err) {
        console.error('Error adding enrollment:', err);
        res.status(500).json({ error: 'Failed to add enrollment' });
    }
});

// Update enrollment grade
app.put('/api/enrollment/:studentId/:sectionId', async (req, res) => {
    const { studentId, sectionId } = req.params;
    const { Grade } = req.body;
    try {
        const [result] = await datapool.query(
            'UPDATE Enrollment SET Grade = ? WHERE StudentID = ? AND SectionID = ?',
            [Grade, studentId, sectionId]
        );
        if (result.affectedRows > 0) {
            res.json({ message: 'Enrollment grade updated successfully!' });
        } else {
            res.status(404).json({ error: 'Enrollment not found for this student and section.' });
        }
    } catch (err) {
        console.error('Error updating enrollment grade:', err);
        res.status(500).json({ error: 'Failed to update enrollment grade' });
    }
});

// Delete enrollment by StudentID
app.delete('/api/enrollment/student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        await datapool.query('SET FOREIGN_KEY_CHECKS=0');
        const [result] = await datapool.query('DELETE FROM Enrollment WHERE StudentID = ?', [studentId]);
        await datapool.query('SET FOREIGN_KEY_CHECKS=1');
        if (result.affectedRows > 0) {
            res.json({ message: 'Enrollment(s) deleted successfully for student!' });
        } else {
            res.status(404).json({ error: 'Enrollment(s) not found for this student ID.' });
        }
    } catch (err) {
        console.error('Error deleting enrollment:', err);
        res.status(500).json({ error: 'Failed to delete enrollment' });
    }
});

// Delete enrollments by SectionID
app.delete('/api/enrollment/section/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    try {
        await datapool.query('SET FOREIGN_KEY_CHECKS=0');
        const [result] = await datapool.query('DELETE FROM Enrollment WHERE SectionID = ?', [sectionId]);
        await datapool.query('SET FOREIGN_KEY_CHECKS=1');
        if (result.affectedRows > 0) {
            res.json({ message: 'Enrollment(s) deleted successfully for section!' });
        } else {
            res.status(404).json({ error: 'Enrollment(s) not found for this section ID.' });
        }
    } catch (err) {
        console.error('Error deleting enrollment by section ID:', err);
        res.status(500).json({ error: 'Failed to delete enrollment.' });
    }
});


// Check if student is enrolled in section
app.get('/api/enrollment/is-enrolled/:studentId/:sectionId', async (req, res) => {
    const { studentId, sectionId } = req.params;
    try {
        const [rows] = await datapool.query('SELECT COUNT(*) AS count FROM Enrollment WHERE StudentID = ? AND SectionID = ?', [studentId, sectionId]);
        res.json({ isEnrolled: rows[0].count > 0 });
    }
    catch (err) {
        console.error('Error checking enrollment status:', err);
        res.status(500).json({ error: 'Failed to check enrollment status' });
    }
});


// --- Report API Endpoints ---

// Get students enrolled per department (over last 3 semesters)
app.get('/api/reports/students-enrolled-per-department', async (req, res) => {
    try {
        const query = `
            SELECT d.DepartmentName, COUNT(e.StudentID) AS EnrollmentCount
            FROM Enrollment e
            JOIN Student s ON e.StudentID = s.StudentID
            JOIN Department d ON s.DepartmentID = d.DepartmentID
            JOIN Section sec ON e.SectionID = sec.SectionID
            JOIN Semester sem ON sec.SemesterID = sem.SemesterID
            JOIN (
                SELECT SemesterID FROM Semester
                ORDER BY Year DESC, FIELD(Season, 'Fall', 'Summer', 'Spring', 'Winter') DESC
                LIMIT 3
            ) AS RecentSemesters ON sem.SemesterID = RecentSemesters.SemesterID
            GROUP BY d.DepartmentName
            ORDER BY d.DepartmentName;
        `;
        console.log("DEBUG: students-enrolled-per-department Query:", query); // DEBUG LOG
        const [rows] = await datapool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching students enrolled per department:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get average GPA per department (with optional gender/semester filters)
app.get('/api/reports/average-gpa-per-department', async (req, res) => {
    const { gender, semesterId } = req.query;
    let query = `
        SELECT
            d.DepartmentName,
            sem.Year,
            sem.Season,
            s.Gender,
            AVG(CASE
                WHEN e.Grade = 'A' THEN 4.0
                WHEN e.Grade = 'A-' THEN 3.7
                WHEN e.Grade = 'B+' THEN 3.3
                WHEN e.Grade = 'B' THEN 3.0
                WHEN e.Grade = 'B-' THEN 2.7
                WHEN e.Grade = 'C+' THEN 2.3
                WHEN e.Grade = 'C' THEN 2.0
                WHEN e.Grade = 'C-' THEN 1.7
                WHEN e.Grade = 'D+' THEN 1.3
                WHEN e.Grade = 'D' THEN 1.0
                WHEN e.Grade = 'D-' THEN 0.7
                ELSE 0.0
            END) AS AverageGPA
        FROM Enrollment e
        JOIN Student s ON e.StudentID = s.StudentID
        JOIN Section sec ON e.SectionID = sec.SectionID
        JOIN Semester sem ON sec.SemesterID = sem.SemesterID
        JOIN Department d ON s.DepartmentID = d.DepartmentID
    `;
    const conditions = [];
    const params = [];

    if (gender && gender.toLowerCase() !== 'all') { // Corrected from 'both' to 'all' for consistency
        conditions.push("s.Gender = ?");
        params.push(gender);
    }
    if (semesterId && semesterId.toLowerCase() !== 'all') { // Ensure 'all' is handled
        conditions.push("sem.SemesterID = ?");
        params.push(semesterId);
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    query += `
        GROUP BY d.DepartmentName, sem.Year, sem.Season, s.Gender
        ORDER BY d.DepartmentName, sem.Year DESC, FIELD(sem.Season, 'Fall', 'Summer', 'Spring', 'Winter') DESC, s.Gender;
    `;
    console.log("DEBUG: average-gpa-per-department Query:", query, "Params:", params); // DEBUG LOG
    try {
        const [rows] = await datapool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching average GPA per department:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get faculty with courses (more than 3 courses in past year)
app.get('/api/reports/faculty-with-courses', async (req, res) => {
    try {
        const query = `
            SELECT f.FullName, COUNT(DISTINCT sec.SectionID) AS CourseCount
            FROM Faculty f
            JOIN Section sec ON f.FacultyID = sec.FacultyID
            JOIN Semester sem ON sec.SemesterID = sem.SemesterID
            WHERE sem.Year >= YEAR(CURRENT_DATE) - 1
            GROUP BY f.FacultyID, f.FullName
            HAVING CourseCount > 3
            ORDER BY CourseCount DESC;
        `;
        console.log("DEBUG: faculty-with-courses Query:", query); // DEBUG LOG
        const [rows] = await datapool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching faculty with courses:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get most popular courses (by enrollment in last two academic years)
app.get('/api/reports/most-popular-courses', async (req, res) => {
    try {
        const query = `
            SELECT c.Title, COUNT(e.StudentID) AS EnrollmentCount
            FROM Course c
            JOIN Section sec ON c.CourseCode = sec.CourseCode
            JOIN Enrollment e ON sec.SectionID = e.SectionID
            JOIN Semester sem ON sec.SemesterID = sem.SemesterID
            WHERE sem.Year >= YEAR(CURRENT_DATE) - 2
            GROUP BY c.CourseCode, c.Title
            ORDER BY EnrollmentCount DESC;
        `;
        console.log("DEBUG: most-popular-courses Query:", query); // DEBUG LOG
        const [rows] = await datapool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching most popular courses:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get overbooked classrooms (current academic year)
app.get('/api/reports/overbooked-classrooms', async (req, res) => {
    try {
        const query = `
            SELECT
                cr.RoomNumber,
                cr.Capacity,
                COUNT(e.StudentID) AS TotalEnrollment,
                (COUNT(e.StudentID) - cr.Capacity) AS OverCapacity
            FROM ClassRoom cr
            JOIN Section sec ON cr.RoomNumber = sec.RoomNumber
            JOIN Enrollment e ON sec.SectionID = e.SectionID
            JOIN Semester sem ON sec.SemesterID = sem.SemesterID
            WHERE sem.Year = YEAR(CURRENT_DATE)
            GROUP BY cr.RoomNumber, cr.Capacity
            HAVING TotalEnrollment > cr.Capacity
            ORDER BY OverCapacity DESC;
        `;
        console.log("DEBUG: overbooked-classrooms Query:", query); // DEBUG LOG
        const [rows] = await datapool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching overbooked classrooms:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get students on probation (average GPA < 2.0)
app.get('/api/reports/students-on-probation', async (req, res) => {
    try {
        const query = `
            SELECT s.FirstName, s.LastName, AVG(CASE
                WHEN e.Grade = 'A' THEN 4.0
                WHEN e.Grade = 'A-' THEN 3.7
                WHEN e.Grade = 'B+' THEN 3.3
                WHEN e.Grade = 'B' THEN 3.0
                WHEN e.Grade = 'B-' THEN 2.7
                WHEN e.Grade = 'C+' THEN 2.3
                WHEN e.Grade = 'C' THEN 2.0
                WHEN e.Grade = 'C-' THEN 1.7
                WHEN e.Grade = 'D+' THEN 1.3
                WHEN e.Grade = 'D' THEN 1.0
                WHEN e.Grade = 'D-' THEN 0.7
                ELSE 0.0
            END) AS GPA
            FROM Student s
            JOIN Enrollment e ON s.StudentID = e.StudentID
            GROUP BY s.StudentID, s.FirstName, s.LastName
            HAVING GPA < 2.0
            ORDER BY GPA ASC;
        `;
        console.log("DEBUG: students-on-probation Query:", query); // DEBUG LOG
        const [rows] = await datapool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching students on probation:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get course performance trends (with optional courseCode filter)
app.get('/api/reports/course-performance-trends', async (req, res) => {
    const { courseCode } = req.query;
    let query = `
        SELECT
            sem.Year,
            sem.Season,
            c.Title,
            AVG(CASE
                WHEN e.Grade = 'A' THEN 4.0
                WHEN e.Grade = 'A-' THEN 3.7
                WHEN e.Grade = 'B+' THEN 3.3
                WHEN e.Grade = 'B' THEN 3.0
                WHEN e.Grade = 'B-' THEN 2.7
                WHEN e.Grade = 'C+' THEN 2.3
                WHEN e.Grade = 'C' THEN 2.0
                WHEN e.Grade = 'C-' THEN 1.7
                WHEN e.Grade = 'D+' THEN 1.3
                WHEN e.Grade = 'D' THEN 1.0
                WHEN e.Grade = 'D-' THEN 0.7
                ELSE 0.0
            END) AS AverageGrade
        FROM Enrollment e
        JOIN Section sec ON e.SectionID = sec.SectionID
        JOIN Semester sem ON sec.SemesterID = sem.SemesterID
        JOIN Course c ON sec.CourseCode = c.CourseCode
    `;
    const conditions = []; // Moved conditions declaration here
    const params = [];
    if (courseCode && courseCode.toLowerCase() !== 'all') { // Ensure 'all' is handled
        conditions.push("c.CourseCode = ?");
        params.push(courseCode);
    }
    if (conditions.length > 0) { // Add this block to apply conditions
        query += " WHERE " + conditions.join(" AND ");
    }
    query += `
        GROUP BY sem.Year, sem.Season, c.Title
        ORDER BY sem.Year ASC, FIELD(sem.Season, 'Fall', 'Summer', 'Spring', 'Winter') ASC, c.Title;
    `;
    console.log("DEBUG: course-performance-trends Query:", query, "Params:", params); // DEBUG LOG
    try {
        const [rows] = await datapool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching course performance trends:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get timetable conflicts
app.get('/api/reports/timetable-conflicts', async (req, res) => {
    try {
        const query = `
            SELECT
                s.FirstName,
                s.LastName,
                e1.SectionID AS Section1ID,
                e2.SectionID AS Section2ID
            FROM Enrollment e1
            JOIN Enrollment e2 ON e1.StudentID = e2.StudentID AND e1.SectionID <> e2.SectionID
            JOIN Section sec1 ON e1.SectionID = sec1.SectionID
            JOIN Section sec2 ON e2.SectionID = sec2.SectionID
            JOIN Schedules sch1 ON sec1.ScheduleID = sch1.ScheduleID
            JOIN Schedules sch2 ON sec2.ScheduleID = sch2.ScheduleID
            JOIN Student s ON e1.StudentID = s.StudentID
            WHERE sec1.SemesterID = sec2.SemesterID
              AND sch1.DayOfWeek = sch2.DayOfWeek
              AND (
                    (sch1.StartTime < sch2.EndTime AND sch1.EndTime > sch2.StartTime) OR
                    (sch2.StartTime < sch1.EndTime AND sch2.EndTime > sch1.StartTime)
                  )
            ORDER BY s.FirstName, s.LastName;
        `;
        console.log("DEBUG: timetable-conflicts Query:", query); // DEBUG LOG
        const [rows] = await datapool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching timetable conflicts:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get top performing students (with optional departmentId and minGpa filters)
app.get('/api/reports/top-performing-students', async (req, res) => {
    const { departmentId, minGpa } = req.query; // minGpa might be undefined or "All"
    let query = `
        SELECT
            s.FirstName,
            s.LastName,
            AVG(CASE
                WHEN e.Grade = 'A' THEN 4.0
                WHEN e.Grade = 'A-' THEN 3.7
                WHEN e.Grade = 'B+' THEN 3.3
                WHEN e.Grade = 'B' THEN 3.0
                WHEN e.Grade = 'B-' THEN 2.7
                WHEN e.Grade = 'C+' THEN 2.3
                WHEN e.Grade = 'C' THEN 2.0
                WHEN e.Grade = 'C-' THEN 1.7
                WHEN e.Grade = 'D+' THEN 1.3
                WHEN e.Grade = 'D' THEN 1.0
                WHEN e.Grade = 'D-' THEN 0.7
                ELSE 0.0
            END) AS GPA,
            d.DepartmentName
        FROM Student s
        JOIN Enrollment e ON s.StudentID = e.StudentID
        JOIN Department d ON s.DepartmentID = d.DepartmentID
    `;
    const conditions = [];
    const params = [];

    if (departmentId && departmentId.toLowerCase() !== 'all') { // Ensure 'all' is handled
        conditions.push("s.DepartmentID = ?");
        params.push(departmentId);
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY s.StudentID, s.FirstName, s.LastName, d.DepartmentName";

    const havingConditions = [];
    // Only apply minGpa filter if it's a valid number and not "All"
    if (minGpa !== null && minGpa !== undefined && String(minGpa).toLowerCase() !== 'all') {
        const parsedGpa = parseFloat(minGpa);
        if (!isNaN(parsedGpa)) {
            havingConditions.push("GPA >= ?");
            params.push(parsedGpa);
        }
    } else {
        // Default to GPA >= 0.0 if minGpa is "All" or not provided
        // This ensures the HAVING clause is always present if minGpa is not explicitly filtered out
        havingConditions.push("GPA >= ?");
        params.push(0.0); // Default minimum GPA
    }


    if (havingConditions.length > 0) {
        query += " HAVING " + havingConditions.join(" AND ");
    }

    query += " ORDER BY GPA DESC";
    // The requirement is "Top five students with the highest GPA in each department".
    // The current query limits overall top 10 if no department is specified.
    // To get top 5 *per department*, a more complex query (e.g., using ROW_NUMBER() or subqueries) is needed.
    // For now, if department is specified, it gets all in that dept >= minGpa.
    // If no department is specified, it gets overall top 10.
    if (!departmentId || departmentId.toLowerCase() === 'all') { // If no specific department, limit overall top 10
         query += " LIMIT 10";
    }

    console.log("DEBUG: top-performing-students Query:", query, "Params:", params); // DEBUG LOG
    try {
        const [rows] = await datapool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching top performing students:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get inactive students
app.get('/api/reports/inactive-students', async (req, res) => {
    try {
        const [recentSemesterRows] = await datapool.query(`
            SELECT SemesterID
            FROM Semester
            ORDER BY Year DESC, FIELD(Season, 'Fall', 'Summer', 'Spring', 'Winter') DESC
            LIMIT 2;
        `);
        const recentSemesterIds = recentSemesterRows.map(row => row.SemesterID);

        if (recentSemesterIds.length === 0) {
            return res.json([]);
        }

        const query = `
            SELECT s.FirstName, s.LastName, s.StudentID
            FROM Student s
            WHERE s.StudentID NOT IN (
                SELECT DISTINCT e_sub.StudentID
                FROM Enrollment e_sub
                JOIN Section sec_sub ON e_sub.SectionID = sec_sub.SectionID
                WHERE sec_sub.SemesterID IN (${recentSemesterIds.map(() => '?').join(',')})
            );
        `;
        console.log("DEBUG: inactive-students Query:", query, "Params:", recentSemesterIds); // DEBUG LOG
        const [rows] = await datapool.query(query, recentSemesterIds);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching inactive students:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get section fill rate
app.get('/api/reports/section-fill-rate', async (req, res) => {
    const { sectionId } = req.query;
    let query = `
        SELECT
            sec.SectionID,
            c.Title AS CourseTitle,
            COUNT(e.StudentID) AS EnrolledStudents,
            cr.Capacity,
            (COUNT(e.StudentID) / cr.Capacity) * 100 AS FillRate
        FROM Section sec
        JOIN Course c ON sec.CourseCode = c.CourseCode
        JOIN ClassRoom cr ON sec.RoomNumber = cr.RoomNumber
        LEFT JOIN Enrollment e ON sec.SectionID = e.SectionID
    `;
    const params = [];
    if (sectionId && sectionId.toLowerCase() !== 'all') { // Ensure 'all' is handled
        query += " WHERE sec.SectionID = ?";
        params.push(sectionId);
    }
    query += `
        GROUP BY sec.SectionID, c.Title, cr.Capacity
        ORDER BY sec.SectionID;
    `;
    console.log("DEBUG: section-fill-rate Query:", query, "Params:", params); // DEBUG LOG
    try {
        const [rows] = await datapool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching section fill rate:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get grade distribution for course
app.get('/api/reports/grade-distribution', async (req, res) => {
    const { courseCode, semesterId, facultyId } = req.query;
    let query = `
        SELECT
            sem.Year,
            sem.Season,
            COALESCE(f.FullName, 'N/A') AS InstructorName,
            e.Grade,
            COUNT(e.Grade) AS GradeCount
        FROM Enrollment e
        JOIN Section sec ON e.SectionID = sec.SectionID
        JOIN Course c ON sec.CourseCode = c.CourseCode
        JOIN Semester sem ON sec.SemesterID = sem.SemesterID
        LEFT JOIN Faculty f ON sec.FacultyID = f.FacultyID
    `;
    const conditions = [];
    const params = [];

    if (courseCode && courseCode.toLowerCase() !== 'all') {
        conditions.push("c.CourseCode = ?");
        params.push(courseCode);
    }
    if (semesterId && semesterId.toLowerCase() !== 'all') {
        conditions.push("sem.SemesterID = ?");
        params.push(semesterId);
    }
    if (facultyId && facultyId.toLowerCase() !== 'all') {
        conditions.push("f.FacultyID = ?");
        params.push(facultyId);
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    query += `
        GROUP BY sem.Year, sem.Season, InstructorName, e.Grade -- Changed f.FullName to InstructorName alias
        ORDER BY sem.Year DESC, FIELD(sem.Season, 'Fall', 'Summer', 'Spring', 'Winter') DESC, InstructorName, e.Grade;
    `;
    console.log("DEBUG: grade-distribution Query:", query, "Params:", params); // DEBUG LOG
    try {
        const [rows] = await datapool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching grade distribution:', err);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get all semesters
app.get('/api/semesters', async (req, res) => {
    try {
        const [rows] = await datapool.query("SELECT SemesterID, Season, Year FROM Semester ORDER BY Year DESC, FIELD(Season, 'Fall', 'Summer', 'Spring', 'Winter') DESC");
        res.json(rows);
    } catch (err) {
        console.error('Error fetching semesters:', err);
        res.status(500).json({ error: 'Failed to fetch semesters' });
    }
});

// Get semester ID by season and year
app.get('/api/semester-id/:season/:year', async (req, res) => {
    const { season, year } = req.params;
    try {
        const [rows] = await datapool.query('SELECT SemesterID FROM Semester WHERE Season = ? AND Year = ?', [season, year]);
        if (rows.length > 0 && rows[0].SemesterID !== null) {
            res.json({ semesterId: rows[0].SemesterID });
        } else {
            res.status(404).json({ error: 'Semester ID not found.' });
        }
    } catch (err) {
        console.error('Error fetching semester ID:', err);
        res.status(500).json({ error: 'Failed to fetch semester ID.' });
    }
});

// Get all courses
app.get('/api/courses/all', async (req, res) => {
    try {
        const [rows] = await datapool.query('SELECT CourseCode, Title FROM Course ORDER BY Title');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching all courses:', err);
        res.status(500).json({ error: 'Failed to fetch all courses' });
    }
});

// Get grades for GPA analysis
app.get('/api/gpa-analysis-grades', async (req, res) => {
    const { semesterId, gender } = req.query;
    let query = `
        SELECT
            E.StudentID,
            S.Gender,
            D.DepartmentName,
            C.CourseCode,
            E.Grade,
            SEM.SemesterID
        FROM Enrollment E
        JOIN Student S ON E.StudentID = S.StudentID
        JOIN Section SEC ON E.SectionID = SEC.SectionID
        JOIN Course C ON SEC.CourseCode = C.CourseCode
        JOIN Department D ON S.DepartmentID = D.DepartmentID
        JOIN Semester SEM ON SEC.SemesterID = SEM.SemesterID
        WHERE 1=1
    `;
    const params = [];
    if (semesterId && semesterId.toLowerCase() !== 'all') { // Ensure 'all' is handled
        query += " AND SEM.SemesterID = ?";
        params.push(semesterId);
    }
    if (gender && gender.toLowerCase() !== 'all') { // Corrected from 'both' to 'all' for consistency
        query += " AND S.Gender = ?";
        params.push(gender);
    }
    console.log("DEBUG: gpa-analysis-grades Query:", query, "Params:", params); // DEBUG LOG
    try {
        const [rows] = await datapool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching grades for GPA analysis:', err);
        res.status(500).json({ error: 'Failed to fetch grades for GPA analysis' });
    }
});

// Get enrollment counts by department for semesters
app.get('/api/enrollment-counts-by-department', async (req, res) => {
    const { semesters } = req.query;
    if (!semesters) {
        // If no semesters are provided, return counts for all departments as 0
        const [allDepts] = await datapool.query('SELECT DepartmentName FROM Department');
        const enrollmentCounts = {};
        allDepts.forEach(dept => {
            enrollmentCounts[dept.DepartmentName] = 0;
        });
        return res.json(enrollmentCounts); // Return empty counts, not an error
    }
    const semesterStrings = semesters.split(',');
    const targetSemesterIds = [];

    try {
        for (const semStr of semesterStrings) {
            const season = semStr.slice(0, -4);
            const year = parseInt(semStr.slice(-4));
            const [rows] = await datapool.query('SELECT SemesterID FROM Semester WHERE Season = ? AND Year = ?', [season, year]);
            if (rows.length > 0) {
                targetSemesterIds.push(rows[0].SemesterID);
            }
        }

        if (targetSemesterIds.length === 0) {
            // If no valid semester IDs found from the input, return empty counts
            const [allDepts] = await datapool.query('SELECT DepartmentName FROM Department');
            const enrollmentCounts = {};
            allDepts.forEach(dept => {
                enrollmentCounts[dept.DepartmentName] = 0;
            });
            return res.json(enrollmentCounts);
        }

        const query = `
            SELECT
                D.DepartmentName,
                COUNT(DISTINCT E.StudentID) AS EnrolledStudents
            FROM Enrollment E
            JOIN Section S ON E.SectionID = S.SectionID
            JOIN Course C ON S.CourseCode = C.CourseCode
            JOIN Department D ON C.DepartmentID = D.DepartmentID
            WHERE S.SemesterID IN (${targetSemesterIds.map(() => '?').join(',')})
            GROUP BY D.DepartmentName;
        `;
        console.log("DEBUG: enrollment-counts-by-department Query:", query, "Params:", targetSemesterIds); // DEBUG LOG
        const [rows] = await datapool.query(query, targetSemesterIds);

        const enrollmentCounts = {};
        const [allDepts] = await datapool.query('SELECT DepartmentName FROM Department');
        allDepts.forEach(dept => {
            enrollmentCounts[dept.DepartmentName] = 0;
        });
        rows.forEach(row => {
            enrollmentCounts[row.DepartmentName] = row.EnrolledStudents;
        });

        res.json(enrollmentCounts);
    } catch (err) {
        console.error('Error fetching enrollment counts by department for semesters:', err);
        res.status(500).json({ error: 'Failed to fetch enrollment counts' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
