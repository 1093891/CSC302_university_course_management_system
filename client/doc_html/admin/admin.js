// admin.js

// Base URL for your Node.js backend API
const API_BASE_URL = 'https://app-8d8cf157-1ab5-4af1-8764-ac50e6f681f3.cleverapps.io/api';

// Object to hold references to page initialization functions
// This ensures they are accessible by string name after parsing the entire script.
const pageInitializers = {};
let myChartInstance = null; // Global Chart.js instance for reports

// --- Utility Functions for Semester Generation (from Python files) ---

/**
 * Generates a list of semesters within a specified range, from oldest to newest.
 * Example: (2020, "Fall", 2025, "Spring") will generate Fall2020, Spring2021, Summer2021, ..., Spring2025.
 * @param {number} startYear
 * @param {string} startSeason
 * @param {number} endYear
 * @param {string} endSeason
 * @returns {string[]} List of semester strings (e.g., "Fall2023")
 */
function generateSemestersInRange(startYear, startSeason, endYear, endSeason) {
    const semesterOrder = ["Spring", "Summer", "Fall"];
    const semesters = [];

    let startSeasonIdx;
    let endSeasonIdx;
    try {
        startSeasonIdx = semesterOrder.indexOf(startSeason);
        endSeasonIdx = semesterOrder.indexOf(endSeason);
        if (startSeasonIdx === -1 || endSeasonIdx === -1) {
            showMessageBox("Error", "Invalid start or end season name for semester generation.");
            return [];
        }
    } catch (e) {
        showMessageBox("Error", "Invalid start or end season name for semester generation.");
        return [];
    }

    let currentYear = startYear;
    let currentSeasonIdx = startSeasonIdx;

    while (true) {
        const semesterStr = `${semesterOrder[currentSeasonIdx]}${currentYear}`;
        semesters.push(semesterStr);

        if (currentYear === endYear && currentSeasonIdx === endSeasonIdx) {
            break;
        }
        if (currentYear > endYear) {
            // Safeguard against infinite loop if end_year is somehow passed unexpectedly
            break;
        }

        currentSeasonIdx++;
        if (currentSeasonIdx >= semesterOrder.length) {
            currentSeasonIdx = 0;
            currentYear++;
        }
    }
    return semesters;
}

/**
 * Helper function to parse semester string for sorting (chronological order).
 * @param {string} sStr - Semester string like "Fall2023"
 * @returns {number[]} Tuple (year, season_index) for sorting
 */
function parseSemesterForSort(sStr) {
    const seasonMap = {"Spring": 0, "Summer": 1, "Fall": 2};
    let yearPart = "";
    let seasonPart = "";

    // Determine season and year parts
    for (const season of ["Spring", "Summer", "Fall"]) {
        if (sStr.startsWith(season)) {
            seasonPart = season;
            yearPart = sStr.substring(season.length);
            break;
        }
    }

    try {
        const year = parseInt(yearPart);
        const seasonIndex = seasonMap[seasonPart] !== undefined ? seasonMap[seasonPart] : -1;
        return [year, seasonIndex];
    } catch (e) {
        // Fallback for malformed strings, place them at the end
        return [9999, 99];
    }
}


// --- Global Utility Functions (Defined first to ensure availability) ---

/**
 * Displays a custom message box (modal).
 * @param {string} title - The title of the message box.
 * @param {string} message - The content message.
 * @param {string} type - 'info', 'success', 'error', 'confirm'.
 * @param {function} [onConfirm=null] - Callback function to execute if user confirms.
 */
function showMessageBox(title, message, type = 'info', onConfirm = null) {
    const modal = document.getElementById('message-box-modal');
    const modalTitle = document.getElementById('message-box-title');
    const modalContent = document.getElementById('message-box-content');
    const okButton = modal.querySelector('.message-box-ok-button');
    const confirmButton = modal.querySelector('.message-box-confirm-button');
    const cancelButton = modal.querySelector('.message-box-cancel-button');

    if (modal && modalTitle && modalContent && okButton && confirmButton && cancelButton) {
        modalTitle.textContent = title;
        modalContent.textContent = message;

        okButton.classList.add('hidden');
        confirmButton.classList.add('hidden');
        cancelButton.classList.add('hidden');

        if (type === 'confirm' && onConfirm) {
            confirmButton.classList.remove('hidden');
            cancelButton.classList.remove('hidden');
            confirmButton.onclick = () => {
                closeMessageBox();
                onConfirm(true);
            };
            cancelButton.onclick = () => {
                closeMessageBox();
                onConfirm(false);
            };
        } else {
            okButton.classList.remove('hidden');
            okButton.onclick = () => {
                closeMessageBox();
                if (onConfirm) onConfirm(true);
            };
        }

        modal.classList.remove('hidden');
    }
}

/**
 * Closes the custom message box.
 */
function closeMessageBox() {
    const modal = document.getElementById('message-box-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Handles Admin Logout.
 */
function logout() {
    showMessageBox('Logout Confirmation', 'Are you sure you want to log out?', 'confirm', (confirmed) => {
        if (confirmed) {
            localStorage.removeItem('loggedInUser'); // Clear user session
            window.location.href = 'login.html'; // Redirect to login page
        }
    });
}

/**
 * Clears the content frame.
 */
function clearContent() {
    const contentFrame = document.getElementById('content-frame');
    if (contentFrame) {
        contentFrame.innerHTML = '';
    }
}

/**
 * Loads HTML content into the content frame.
 * @param {string} htmlContent - The HTML string to load.
 */
function loadContent(htmlContent) {
    clearContent();
    const contentFrame = document.getElementById('content-frame');
    if (contentFrame) {
        contentFrame.innerHTML = htmlContent;
    }
}

/**
 * Fetches data from a given API endpoint.
 * @param {string} endpoint - The API endpoint (e.g., '/departments').
 * @returns {Promise<Array>} - A promise that resolves to the fetched data.
 */
async function fetchData(endpoint) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        if (!response.ok) {
            // Attempt to parse error message from response body if available
            const errorText = await response.text();
            let errorMessage = `HTTP error! Status: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
            } catch (jsonError) {
                // If parsing as JSON fails, use the raw text or default message
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        showMessageBox('Error', `Failed to load data from ${endpoint}: ${error.message}`, 'error');
        return []; // Return empty array on error for consistency with data processing
    }
}

/**
 * Sends data to a given API endpoint using POST, PUT, or DELETE.
 * @param {string} endpoint - The API endpoint.
 * @param {string} method - HTTP method ('POST', 'PUT', 'DELETE').
 * @param {object} [data=null] - The data to send (for POST/PUT).
 * @returns {Promise<object>} - A promise that resolves to the API response.
 */
async function sendData(endpoint, method, data = null) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : null,
        };
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const responseText = await response.text(); // Get raw text to handle non-JSON responses
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch (jsonError) {
            // If response is not valid JSON, treat it as plain text or an empty object
            responseData = { message: responseText || 'Operation completed.', error: responseText || 'Unknown error.' };
        }
        if (!response.ok) {
            throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }
        return responseData;
    } catch (error) {
        console.error(`Error sending data to ${endpoint} with method ${method}:`, error);
        showMessageBox('Error', `Operation failed: ${error.message}`, 'error');
        throw error; // Re-throw to allow calling functions to handle
    }
}

// --- User Creation Modal Logic (Shared by Student and Faculty Forms) ---
// (These functions are global utilities, not part of pageInitializers)

let currentUserCreationType = ''; // 'student' or 'faculty'
let currentAssociatedId = ''; // studentId or facultyId

function showUserCreationModal(type, associatedId) {
    currentUserCreationType = type;
    currentAssociatedId = associatedId;

    const modalOverlay = document.getElementById('user-creation-modal-overlay');
    const modalTitle = document.getElementById('user-creation-modal-title');
    const associatedIdLabel = document.getElementById('associated-id-label');
    const associatedIdDisplay = document.getElementById('associated-id-display');

    if (modalOverlay && modalTitle && associatedIdLabel && associatedIdDisplay) {
        modalTitle.textContent = `Create User Login for ${type.charAt(0).toUpperCase() + type.slice(1)}`;
        associatedIdLabel.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} ID:`;
        associatedIdDisplay.textContent = associatedId;

        document.getElementById('user-creation-username').value = '';
        document.getElementById('user-creation-password').value = '';

        modalOverlay.classList.remove('hidden');
    }
}

function closeUserCreationModal() {
    const modalOverlay = document.getElementById('user-creation-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('hidden');
    }
}

async function submitUserCreationForm() {
    const username = document.getElementById('user-creation-username').value;
    const password = document.getElementById('user-creation-password').value;

    if (!username || !password) {
        showMessageBox('Input Error', 'Username and password are required for user creation.');
        return;
    }

    const userData = {
        UserID: username,
        Password: password,
        Role: currentUserCreationType,
        FacultyID: currentUserCreationType === 'faculty' ? currentAssociatedId : null,
        StudentID: currentUserCreationType === 'student' ? currentAssociatedId : null
    };

    try {
        await sendData('/user', 'POST', userData);
        showMessageBox('Success', `User login created successfully for ${currentUserCreationType} ID: ${currentAssociatedId}!`);
        closeUserCreationModal();
    } catch (error) {
        // Error message already displayed by sendData
    }
}


// --- Enrollment Modal Logic (for Section List) ---
// (These functions are global utilities, not part of pageInitializers)

let currentSectionForEnrollment = null;
let currentStudentForEnrollment = { StudentID: null, FullName: null, DepartmentID: null };

function showEnrollStudentModal(sectionId) {
    currentSectionForEnrollment = sectionId;
    document.getElementById('enroll-student-id').value = '';
    document.getElementById('enroll-student-name-display').textContent = 'Student Name: -';
    currentStudentForEnrollment = { StudentID: null, FullName: null, DepartmentID: null };

    const modalOverlay = document.getElementById('enroll-student-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('hidden');
    }
}

function closeEnrollStudentModal() {
    const modalOverlay = document.getElementById('enroll-student-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('hidden');
    }
}

async function searchStudentForEnrollment() {
    const studentIdInput = document.getElementById('enroll-student-id').value.trim();
    const studentNameDisplay = document.getElementById('enroll-student-name-display');

    if (!studentIdInput) {
        showMessageBox('Input Missing', 'Please enter a Student ID.');
        return;
    }

    try {
        const studentInfo = await fetchData(`/student-info-for-enrollment/${studentIdInput}`);
        if (studentInfo) {
            studentNameDisplay.textContent = `Student Name: ${studentInfo.FullName} (ID: ${studentInfo.StudentID})`;
            currentStudentForEnrollment = {
                StudentID: studentInfo.StudentID,
                FullName: studentInfo.FullName,
                DepartmentID: studentInfo.DepartmentID
            };
        } else {
            studentNameDisplay.textContent = `Student ID '${studentIdInput}' not found.`;
            currentStudentForEnrollment = { StudentID: null, FullName: null, DepartmentID: null };
            showMessageBox('Student Not Found', `Student with ID '${studentIdInput}' was not found.`);
        }
    } catch (error) {
        studentNameDisplay.textContent = 'Student Name: Error searching.';
    }
}

async function performEnrollment() {
    if (!currentStudentForEnrollment.StudentID || !currentSectionForEnrollment) {
        showMessageBox('Enrollment Error', 'Please search and select a valid student first.');
        return;
    }

    const studentIdToEnroll = currentStudentForEnrollment.StudentID;
    const studentDeptId = currentStudentForEnrollment.DepartmentID;
    const sectionId = currentSectionForEnrollment;

    try {
        const sectionDetails = await fetchData(`/section-details-for-enrollment/${sectionId}`);
        if (!sectionDetails) {
            showMessageBox('Enrollment Error', 'Could not retrieve section details for validation.');
            return;
        }

        const courseDeptId = sectionDetails.CourseDepartmentID;
        const courseType = sectionDetails.CourseType;
        const classroomCapacity = sectionDetails.ClassroomCapacity || Infinity;
        const currentEnrollmentCount = sectionDetails.CurrentEnrollment;

        let isEligible = false;
        if (studentDeptId == courseDeptId) {
            isEligible = true;
        } else if (courseType && courseType.toLowerCase() === "elective") {
            isEligible = true;
        }

        if (!isEligible) {
            showMessageBox('Enrollment Failed', "Student's department does not match section's course department, and this course is not an elective.");
            return;
        }

        let capacityMessage = "";
        if (currentEnrollmentCount >= classroomCapacity) {
            capacityMessage = `\nWARNING: Class capacity (${classroomCapacity}) reached or exceeded (current: ${currentEnrollmentCount}).`;
            showMessageBox('Capacity Alert', `Class is full! ${capacityMessage}\nStudent will still be enrolled.`, 'warning');
        } else if (currentEnrollmentCount + 1 > classroomCapacity) {
            capacityMessage = `\nWARNING: Enrolling this student will exceed class capacity (${classroomCapacity}).`;
            showMessageBox('Capacity Alert', `Enrolling will make class full! ${capacityMessage}\nStudent will still be enrolled.`, 'warning');
        }

        showMessageBox('Confirm Enrollment', `Enroll ${currentStudentForEnrollment.FullName} (ID: ${studentIdToEnroll}) into section ${sectionId}?${capacityMessage}`, 'confirm', async (confirmed) => {
            if (confirmed) {
                try {
                    await sendData('/enrollment', 'POST', { StudentID: studentIdToEnroll, SectionID: sectionId, Grade: 'Ungraded' });
                    showMessageBox('Success', `Successfully enrolled in Section ${sectionId}! ${capacityMessage}`);
                    closeEnrollStudentModal();
                    pageInitializers.initSectionList(); // Refresh section list to reflect potential enrollment count changes
                } catch (error) {
                    if (error.message.includes('Duplicate entry')) {
                        showMessageBox('Enrollment Error', 'Student is already enrolled in this section.');
                    } else {
                        // Error message already displayed by sendData
                    }
                }
            }
        });
    } catch (error) {
        // Error message already displayed by sendData or fetchData
    }
}


// --- Page Initialization Functions (Assigned to pageInitializers object) ---

/**
 * Loads an external HTML file into the content frame and then
 * executes a callback function to initialize its JavaScript.
 * @param {string} filePath - The path to the HTML file.
 * @param {string} initializerKey - The key of the function in pageInitializers to call after the HTML is loaded.
 */
async function loadPage(filePath, initializerKey) {
    clearContent();
    const contentFrame = document.getElementById('content-frame');
    if (!contentFrame) {
        console.error("Content frame not found.");
        return;
    }

    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        contentFrame.innerHTML = html;

        // Execute the initializer function via the pageInitializers object
        if (pageInitializers[initializerKey] && typeof pageInitializers[initializerKey] === 'function') {
            pageInitializers[initializerKey]();
        } else {
            console.warn(`Initializer function "${initializerKey}" not found or is not a function.`);
        }
    } catch (error) {
        console.error(`Error loading page from ${filePath}:`, error);
        showMessageBox('Error', `Could not load page: ${error.message}`, 'error');
        loadContent('<div class="welcome-content">' +
                    '<h2 class="welcome-title error-title">Error Loading Page</h2>' +
                    '<p class="welcome-text">Please try again or contact support.</p>' +
                    '</div>');
    }
}

pageInitializers.initStudentForm = async function () {
    const form = document.getElementById('new-student-form');
    if (!form) return;

    const departmentSelect = form.querySelector('#department');
    const dobInput = form.querySelector('#dob');
    const enrollmentDateInput = form.querySelector('#enrollmentDate');

    const departments = await fetchData('/departments');
    departmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    if (departments.length > 0) {
        departmentSelect.value = departments[0].DepartmentID;
    }

    const today = new Date().toISOString().split('T')[0];
    const defaultDOB = '2000-01-01';
    if (dobInput) dobInput.value = defaultDOB;
    if (enrollmentDateInput) enrollmentDateInput.value = today;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const studentData = {
            StudentID: form.querySelector('#studentId').value,
            FirstName: form.querySelector('#firstName').value,
            LastName: form.querySelector('#lastName').value,
            Email: form.querySelector('#email').value,
            PhoneNumber: form.querySelector('#phone').value,
            Address: form.querySelector('#address').value,
            DOB: dobInput.value,
            Gender: form.querySelector('#gender').value,
            EnrollmentDate: enrollmentDateInput.value,
            DepartmentID: departmentSelect.value
        };

        if (!studentData.StudentID || !studentData.FirstName || !studentData.LastName || !studentData.Email || !studentData.DepartmentID) {
            showMessageBox('Input Error', 'Student ID, First Name, Last Name, Email, and Department are required.');
            return;
        }

        try {
            await sendData('/student', 'POST', studentData);
            showMessageBox('Success', 'Student added successfully!');
            form.reset();
            if (dobInput) dobInput.value = defaultDOB;
            if (enrollmentDateInput) enrollmentDateInput.value = today;
            if (departments.length > 0) {
                departmentSelect.value = departments[0].DepartmentID;
            }
            showUserCreationModal('student', studentData.StudentID);
        } catch (error) {
            // Error message already displayed by sendData
        }
    });

    form.querySelector('.clear-button').addEventListener('click', () => {
        form.reset();
        if (dobInput) dobInput.value = defaultDOB;
        if (enrollmentDateInput) enrollmentDateInput.value = today;
        if (departments.length > 0) {
            departmentSelect.value = departments[0].DepartmentID;
        }
    });
};

pageInitializers.editStudent = async function (studentId) {
    const student = await fetchData(`/student/${studentId}`);
    if (!student) return;

    const editFormHtml = `
        <div class="form-container">
            <h2 class="form-title">Edit Student: ${student.StudentID}</h2>
            <form id="edit-student-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="editFirstName" class="form-label">First Name:</label>
                        <input type="text" id="editFirstName" value="${student.FirstName}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editLastName" class="form-label">Last Name:</label>
                        <input type="text" id="editLastName" value="${student.LastName}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editGender" class="form-label">Gender:</label>
                        <select id="editGender" class="form-input" required>
                            <option value="Male" ${student.Gender === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${student.Gender === 'Female' ? 'selected' : ''}>Female</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editDOB" class="form-label">Date of Birth:</label>
                        <input type="date" id="editDOB" value="${student.DOB ? student.DOB.split('T')[0] : ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="editAddress" class="form-label">Address:</label>
                        <input type="text" id="editAddress" value="${student.Address || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="editPhone" class="form-label">Phone:</label>
                        <input type="text" id="editPhone" value="${student.PhoneNumber || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="editEmail" class="form-label">Email:</label>
                        <input type="email" id="editEmail" value="${student.Email}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editDepartment" class="form-label">Department ID:</label>
                        <select id="editDepartment" class="form-input" required></select>
                    </div>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="save-button">Save Changes</button>
                    <button type="button" class="clear-button" onclick="handleMenu('student', 'View Student')">Cancel</button>
                </div>
            </form>
        </div>
    `;
    loadContent(editFormHtml);

    const editForm = document.getElementById('edit-student-form');
    const editDepartmentSelect = editForm.querySelector('#editDepartment');

    const departments = await fetchData('/departments');
    editDepartmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    editDepartmentSelect.value = student.DepartmentID;

    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const updatedStudentData = {
            FirstName: editForm.querySelector('#editFirstName').value,
            LastName: editForm.querySelector('#editLastName').value,
            Gender: editForm.querySelector('#editGender').value,
            DOB: editForm.querySelector('#editDOB').value,
            Address: editForm.querySelector('#editAddress').value,
            PhoneNumber: editForm.querySelector('#editPhone').value,
            Email: editForm.querySelector('#editEmail').value,
            EnrollmentDate: student.EnrollmentDate,
            DepartmentID: editDepartmentSelect.value
        };

        if (!updatedStudentData.FirstName || !updatedStudentData.LastName || !updatedStudentData.Email || !updatedStudentData.DepartmentID) {
            showMessageBox('Input Error', 'First Name, Last Name, Email, and Department are required.');
            return;
        }

        try {
            console.log("student Id", studentId, 'is going to edition', updatedStudentData);
            await sendData(`/student/${studentId}`, 'PUT', updatedStudentData);
            showMessageBox('Success', 'Student updated successfully!');
            handleMenu('student', 'View Student');
        } catch (error) {
            // Error message already displayed by sendData
        }
    });
};

pageInitializers.deleteStudent = async function (studentId) {
    showMessageBox('Confirm Delete', `Are you sure you want to delete student with ID: ${studentId} and their user account?`, 'confirm', async (confirmed) => {
        if (confirmed) {
            try {
                await sendData(`/user/by-student/${studentId}`, 'DELETE');
                await sendData(`/student/${studentId}`, 'DELETE');
                showMessageBox('Success', 'Student and associated user deleted successfully!');
                pageInitializers.initStudentsList();
            } catch (error) {
                // Error message already displayed by sendData
            }
        }
    });
};

pageInitializers.initFacultyForm = async function () {
    const form = document.getElementById('new-faculty-form');
    if (!form) return;

    const departmentSelect = form.querySelector('#department');
    const hiredDateInput = form.querySelector('#hiredDate');

    const departments = await fetchData('/departments');
    departmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    if (departments.length > 0) {
        departmentSelect.value = departments[0].DepartmentID;
    }

    if (hiredDateInput) hiredDateInput.value = new Date().toISOString().split('T')[0];

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const facultyData = {
            FacultyID: form.querySelector('#facultyId').value,
            FullName: `${form.querySelector('#firstName').value} ${form.querySelector('#lastName').value}`,
            Email: form.querySelector('#email').value,
            PhoneNumber: form.querySelector('#phone').value,
            Address: form.querySelector('#address').value,
            HireDate: hiredDateInput.value,
            Designation: form.querySelector('#designation').value,
            DepartmentID: departmentSelect.value
        };

        if (!facultyData.FacultyID || !form.querySelector('#firstName').value || !form.querySelector('#lastName').value || !facultyData.Email || !facultyData.Designation || !facultyData.DepartmentID) {
            showMessageBox('Input Error', 'Faculty ID, First Name, Last Name, Email, Designation, and Department are required.');
            return;
        }

        try {
            await sendData('/faculty', 'POST', facultyData);
            showMessageBox('Success', 'Faculty member added successfully!');
            form.reset();
            if (hiredDateInput) hiredDateInput.value = new Date().toISOString().split('T')[0];
            if (departments.length > 0) {
                departmentSelect.value = departments[0].DepartmentID;
            }
            showUserCreationModal('faculty', facultyData.FacultyID);
        } catch (error) {
            // Error message already displayed by sendData
        }
    });

    form.querySelector('.clear-button').addEventListener('click', () => {
        form.reset();
        if (hiredDateInput) hiredDateInput.value = new Date().toISOString().split('T')[0];
        if (departments.length > 0) {
            departmentSelect.value = departments[0].DepartmentID;
        }
    });
};

pageInitializers.editFaculty = async function (facultyId) {
    const faculty = await fetchData(`/faculty/${facultyId}`);
    if (!faculty) return;

    const [firstName, ...lastNameParts] = faculty.FullName.split(' ');
    const lastName = lastNameParts.join(' ');

    const editFormHtml = `
        <div class="form-container">
            <h2 class="form-title">Edit Faculty: ${faculty.FacultyID}</h2>
            <form id="edit-faculty-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="editFirstName" class="form-label">First Name:</label>
                        <input type="text" id="editFirstName" value="${firstName}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editLastName" class="form-label">Last Name:</label>
                        <input type="text" id="editLastName" value="${lastName}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editEmail" class="form-label">Email:</label>
                        <input type="email" id="editEmail" value="${faculty.Email}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editPhone" class="form-label">Phone:</label>
                        <input type="text" id="editPhone" value="${faculty.PhoneNumber || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="editHiredDate" class="form-label">Hired Date:</label>
                        <input type="date" id="editHiredDate" value="${faculty.HireDate ? faculty.HireDate.split('T')[0] : ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="editDesignation" class="form-label">Designation:</label>
                        <input type="text" id="editDesignation" value="${faculty.Designation}" class="form-input" required>
                    </div>
                    <div class="form-group col-span-full">
                        <label for="editDepartment" class="form-label">Department ID:</label>
                        <select id="editDepartment" class="form-input" required></select>
                    </div>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="save-button">Save Changes</button>
                    <button type="button" class="clear-button" onclick="handleMenu('faculty', 'View Faculty')">Cancel</button>
                </div>
            </form>
        </div>
    `;
    loadContent(editFormHtml);

    const editForm = document.getElementById('edit-faculty-form');
    const editDepartmentSelect = editForm.querySelector('#editDepartment');

    const departments = await fetchData('/departments');
    editDepartmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    editDepartmentSelect.value = faculty.DepartmentID;

    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const updatedFacultyData = {
            FullName: `${editForm.querySelector('#editFirstName').value} ${editForm.querySelector('#editLastName').value}`,
            Email: editForm.querySelector('#editEmail').value,
            PhoneNumber: editForm.querySelector('#editPhone').value,
            HireDate: editForm.querySelector('#editHiredDate').value,
            Designation: editForm.querySelector('#editDesignation').value,
            DepartmentID: editDepartmentSelect.value
        };

        if (!updatedFacultyData.FullName || !updatedFacultyData.Email || !updatedFacultyData.Designation || !updatedFacultyData.DepartmentID) {
            showMessageBox('Input Error', 'Full Name, Email, Designation, and Department are required.');
            return;
        }

        try {
            await sendData(`/faculty/${facultyId}`, 'PUT', updatedFacultyData);
            showMessageBox('Success', 'Faculty member updated successfully!');
            handleMenu('faculty', 'View Faculty');
        } catch (error) {
            // Error message already displayed by sendData
        }
    });
};

pageInitializers.deleteFaculty = async function (facultyId) {
    showMessageBox('Confirm Delete', `Are you sure you want to delete faculty member with ID: ${facultyId} and their user account?`, 'confirm', async (confirmed) => {
        if (confirmed) {
            try {
                await sendData(`/user/by-faculty/${facultyId}`, 'DELETE');
                await sendData(`/faculty/${facultyId}`, 'DELETE');
                showMessageBox('Success', 'Faculty member and associated user deleted successfully!');
                pageInitializers.initFacultyList();
            } catch (error) {
                // Error message already displayed by sendData
            }
        }
    });
};

pageInitializers.initCourseForm = async function () {
    const form = document.getElementById('new-course-form');
    if (!form) return;

    const departmentSelect = form.querySelector('#department');
    const courseTypeSelect = form.querySelector('#courseType');

    const departments = await fetchData('/departments');
    departmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    if (departments.length > 0) {
        departmentSelect.value = departments[0].DepartmentID;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const courseData = {
            CourseCode: form.querySelector('#courseCode').value,
            Title: form.querySelector('#title').value,
            CreditHours: parseInt(form.querySelector('#creditHours').value),
            CourseType: courseTypeSelect.value,
            Description: form.querySelector('#description').value,
            DepartmentID: departmentSelect.value
        };

        if (!courseData.CourseCode || !courseData.Title || isNaN(courseData.CreditHours) || courseData.CreditHours <= 0 || !courseData.CourseType || !courseData.DepartmentID) {
            showMessageBox('Input Error', 'Course Code, Title, Credit Hours (must be positive number), Course Type, and Department are required.');
            return;
        }

        try {
            await sendData('/course', 'POST', courseData);
            showMessageBox('Success', 'Course added successfully!');
            form.reset();
            if (departments.length > 0) {
                departmentSelect.value = departments[0].DepartmentID;
            }
            courseTypeSelect.value = "Core";
        } catch (error) {
            // Error message already displayed by sendData
        }
    });

    form.querySelector('.clear-button').addEventListener('click', () => {
        form.reset();
        if (departments.length > 0) {
            departmentSelect.value = departments[0].DepartmentID;
        }
        courseTypeSelect.value = "Core";
    });
};

pageInitializers.editCourse = async function (courseCode) {
    const course = await fetchData(`/course/${courseCode}`);
    if (!course) return;

    const editFormHtml = `
        <div class="form-container">
            <h2 class="form-title">Edit Course: ${course.CourseCode}</h2>
            <form id="edit-course-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="editTitle" class="form-label">Title:</label>
                        <input type="text" id="editTitle" value="${course.Title}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editCreditHours" class="form-label">Credit Hours:</label>
                        <input type="number" id="editCreditHours" value="${course.CreditHours}" min="1" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editCourseType" class="form-label">Course Type:</label>
                        <select id="editCourseType" class="form-input" required>
                            <option value="Core" ${course.CourseType === 'Core' ? 'selected' : ''}>Core</option>
                            <option value="Elective" ${course.CourseType === 'Elective' ? 'selected' : ''}>Elective</option>
                            <option value="Lab" ${course.CourseType === 'Lab' ? 'selected' : ''}>Lab</option>
                            <option value="Seminar" ${course.CourseType === 'Seminar' ? 'selected' : ''}>Seminar</option>
                        </select>
                    </div>
                    <div class="form-group col-span-full">
                        <label for="editDescription" class="form-label">Description:</label>
                        <textarea id="editDescription" rows="4" class="form-input">${course.Description || ''}</textarea>
                    </div>
                    <div class="form-group col-span-full">
                        <label for="editDepartment" class="form-label">Department:</label>
                        <select id="editDepartment" class="form-input" required></select>
                    </div>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="save-button">Save Changes</button>
                    <button type="button" class="clear-button" onclick="handleMenu('course', 'View Course')">Cancel</button>
                </div>
            </form>
        </div>
    `;
    loadContent(editFormHtml);

    const editForm = document.getElementById('edit-course-form');
    const editDepartmentSelect = editForm.querySelector('#editDepartment');

    const departments = await fetchData('/departments');
    editDepartmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    editDepartmentSelect.value = course.DepartmentID;

    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const updatedCourseData = {
            Title: editForm.querySelector('#editTitle').value,
            CreditHours: parseInt(editForm.querySelector('#editCreditHours').value),
            CourseType: editForm.querySelector('#editCourseType').value,
            Description: editForm.querySelector('#editDescription').value,
            DepartmentID: editDepartmentSelect.value
        };

        if (!updatedCourseData.Title || isNaN(updatedCourseData.CreditHours) || updatedCourseData.CreditHours <= 0 || !updatedCourseData.CourseType || !updatedCourseData.DepartmentID) {
            showMessageBox('Input Error', 'Title, Credit Hours (positive number), Course Type, and Department are required.');
            return;
        }

        try {
            await sendData(`/course/${courseCode}`, 'PUT', updatedCourseData);
            showMessageBox('Success', 'Course updated successfully!');
            handleMenu('course', 'View Course');
        } catch (error) {
            // Error message already displayed by sendData
        }
    });
};

pageInitializers.deleteCourse = async function (courseCode) {
    showMessageBox('Confirm Delete', `Are you sure you want to delete course with Code: ${courseCode}?`, 'confirm', async (confirmed) => {
        if (confirmed) {
            try {
                await sendData(`/course/${courseCode}`, 'DELETE');
                showMessageBox('Success', 'Course deleted successfully!');
                pageInitializers.initCourseList();
            } catch (error) {
                // Error message already displayed by sendData
            }
        }
    });
};

pageInitializers.initClassroomForm = async function () {
    const form = document.getElementById('new-classroom-form');
    if (!form) return;

    const departmentSelect = form.querySelector('#departmentId');

    const departments = await fetchData('/departments');
    departmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    if (departments.length > 0) {
        departmentSelect.value = departments[0].DepartmentID;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const classroomData = {
            RoomNumber: form.querySelector('#roomNumber').value,
            ClassRoomType: form.querySelector('#classroomType').value,
            Capacity: parseInt(form.querySelector('#capacity').value),
            Building: form.querySelector('#building').value,
            DepartmentID: departmentSelect.value,
            PhoneNumber: form.querySelector('#phoneNumber').value
        };

        if (!classroomData.RoomNumber || !classroomData.ClassRoomType || isNaN(classroomData.Capacity) || classroomData.Capacity <= 0 || !classroomData.Building || !classroomData.DepartmentID || !classroomData.PhoneNumber) {
            showMessageBox('Input Error', 'All fields are required and capacity must be a positive number.');
            return;
        }

        try {
            await sendData('/classroom', 'POST', classroomData);
            showMessageBox('Success', 'Classroom added successfully!');
            form.reset();
            if (departments.length > 0) {
                departmentSelect.value = departments[0].DepartmentID;
            }
        } catch (error) {
            // Error message already displayed by sendData
        }
    });

    form.querySelector('.clear-button').addEventListener('click', () => {
        form.reset();
        if (departments.length > 0) {
            departmentSelect.value = departments[0].DepartmentID;
        }
    });
};

pageInitializers.editClassroom = async function (roomNumber) {
    const classroom = await fetchData(`/classroom/${roomNumber}`);
    if (!classroom) return;

    const editFormHtml = `
        <div class="form-container">
            <h2 class="form-title">Edit Classroom: ${classroom.RoomNumber}</h2>
            <form id="edit-classroom-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="editRoomNumber" class="form-label">New Room Number:</label>
                        <input type="text" id="editRoomNumber" value="${classroom.RoomNumber}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editClassroomType" class="form-label">Classroom Type:</label>
                        <input type="text" id="editClassroomType" value="${classroom.ClassRoomType}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editCapacity" class="form-label">Capacity:</label>
                        <input type="number" id="editCapacity" value="${classroom.Capacity}" min="1" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editBuilding" class="form-label">Building:</label>
                        <input type="text" id="editBuilding" value="${classroom.Building}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editDepartmentId" class="form-label">Department:</label>
                        <select id="editDepartmentId" class="form-input" required></select>
                    </div>
                    <div class="form-group">
                        <label for="editPhoneNumber" class="form-label">Phone Number:</label>
                        <input type="text" id="editPhoneNumber" value="${classroom.PhoneNumber || ''}" class="form-input" required>
                    </div>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="save-button">Save Changes</button>
                    <button type="button" class="clear-button" onclick="handleMenu('classroom', 'View Classroom')">Cancel</button>
                </div>
            </form>
        </div>
    `;
    loadContent(editFormHtml);

    const editForm = document.getElementById('edit-classroom-form');
    const editDepartmentSelect = editForm.querySelector('#editDepartmentId');

    const departments = await fetchData('/departments');
    editDepartmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
    editDepartmentSelect.value = classroom.DepartmentID;

    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const updatedClassroomData = {
            newRoomNumber: editForm.querySelector('#editRoomNumber').value,
            ClassRoomType: editForm.querySelector('#editClassroomType').value,
            Capacity: parseInt(editForm.querySelector('#editCapacity').value),
            Building: editForm.querySelector('#editBuilding').value,
            DepartmentID: editDepartmentSelect.value,
            PhoneNumber: editForm.querySelector('#editPhoneNumber').value
        };

        if (!updatedClassroomData.newRoomNumber || !updatedClassroomData.ClassRoomType || isNaN(updatedClassroomData.Capacity) || updatedClassroomData.Capacity <= 0 || !updatedClassroomData.Building || !updatedClassroomData.DepartmentID || !updatedClassroomData.PhoneNumber) {
            showMessageBox('Input Error', 'All fields are required and capacity must be a positive number.');
            return;
        }

        try {
            await sendData(`/classroom/${roomNumber}`, 'PUT', updatedClassroomData);
            showMessageBox('Success', 'Classroom updated successfully!');
            handleMenu('classroom', 'View Classroom');
        } catch (error) {
            // Error message already displayed by sendData
        }
    });
};

pageInitializers.deleteClassroom = async function (roomNumber) {
    showMessageBox('Confirm Delete', `Are you sure you want to delete classroom with Room Number: ${roomNumber}?`, 'confirm', async (confirmed) => {
        if (confirmed) {
            try {
                await sendData(`/classroom/${roomNumber}`, 'DELETE');
                showMessageBox('Success', 'Classroom deleted successfully!');
                pageInitializers.initClassroomList();
            } catch (error) {
                // Error message already displayed by sendData
            }
        }
    });
};

pageInitializers.initDepartmentForm = async function () {
    const form = document.getElementById('new-department-form');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const departmentData = {
            DepartmentID: form.querySelector('#departmentId').value,
            DepartmentName: form.querySelector('#departmentName').value
        };

        if (!departmentData.DepartmentID || !departmentData.DepartmentName) {
            showMessageBox('Input Error', 'Both Department ID and Department Name are required.');
            return;
        }

        try {
            await sendData('/department', 'POST', departmentData);
            showMessageBox('Success', 'Department added successfully!');
            form.reset();
        } catch (error) {
            // Error message already displayed by sendData
        }
    });

    form.querySelector('.clear-button').addEventListener('click', () => {
        form.reset();
    });
};

pageInitializers.editDepartment = async function (departmentId) {
    const department = await fetchData(`/department/${departmentId}`);
    if (!department) return;

    const editFormHtml = `
        <div class="form-container">
            <h2 class="form-title">Edit Department: ${department.DepartmentID}</h2>
            <form id="edit-department-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="editDepartmentName" class="form-label">Department Name:</label>
                        <input type="text" id="editDepartmentName" value="${department.DepartmentName}" class="form-input" required>
                    </div>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="save-button">Save Changes</button>
                    <button type="button" class="clear-button" onclick="handleMenu('department', 'View Department')">Cancel</button>
                </div>
            </form>
        </div>
    `;
    loadContent(editFormHtml);

    const editForm = document.getElementById('edit-department-form');
    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const updatedDepartmentData = {
            DepartmentName: editForm.querySelector('#editDepartmentName').value
        };

        if (!updatedDepartmentData.DepartmentName) {
            showMessageBox('Input Error', 'Department Name cannot be empty.');
            return;
        }

        try {
            await sendData(`/department/${departmentId}`, 'PUT', updatedDepartmentData);
            showMessageBox('Success', 'Department updated successfully!');
            handleMenu('department', 'View Department');
        } catch (error) {
            // Error message already displayed by sendData
        }
    });
};

pageInitializers.deleteDepartment = async function (departmentId) {
    showMessageBox('Confirm Delete', `Are you sure you want to delete department with ID: ${departmentId}?`, 'confirm', async (confirmed) => {
        if (confirmed) {
            try {
                await sendData(`/department/${departmentId}`, 'DELETE');
                showMessageBox('Success', 'Department deleted successfully!');
                pageInitializers.initDepartmentList();
            }
            catch (error) {
                // Error message already displayed by sendData
            }
        }
    });
};

pageInitializers.initSectionForm = async function () {
    const form = document.getElementById('new-section-form');
    if (!form) return;

    const departmentSelect = form.querySelector('#department');
    const courseSelect = form.querySelector('#course');
    const facultySelect = form.querySelector('#faculty');
    const seasonSelect = form.querySelector('#season');
    const dayOfWeekSelect = form.querySelector('#dayOfWeek');

    const allDepartments = await fetchData('/departments');
    const allCourses = await fetchData('/courses');
    const allFaculties = await fetchData('/faculties');

    function populateDepartmentsForSection(departments) {
        departmentSelect.innerHTML = departments.map(dept => `<option value="${dept.DepartmentID}">${dept.DepartmentName}</option>`).join('');
        if (departments.length > 0) {
            departmentSelect.value = departments[0].DepartmentID;
            populateCoursesAndFacultiesByDepartment(allCourses, allFaculties);
        } else {
            departmentSelect.innerHTML = '<option value="">No Departments</option>';
            courseSelect.innerHTML = '<option value="">No Courses</option>';
            facultySelect.innerHTML = '<option value="">No Faculty</option>';
        }
    }

    function populateCoursesAndFacultiesByDepartment(courses, faculties) {
        const selectedDepartmentId = departmentSelect.value;

        const filteredCourses = courses.filter(course => course.DepartmentID == selectedDepartmentId);
        courseSelect.innerHTML = filteredCourses.map(course => `<option value="${course.CourseCode}">${course.Title} (${course.CourseCode})</option>`).join('');
        if (filteredCourses.length > 0) {
            courseSelect.value = filteredCourses[0].CourseCode;
        } else {
            courseSelect.innerHTML = '<option value="">No Courses</option>';
        }

        const filteredFaculties = faculties.filter(faculty => faculty.DepartmentID == selectedDepartmentId);
        facultySelect.innerHTML = filteredFaculties.map(faculty => `<option value="${faculty.FacultyID}">${faculty.FullName}</option>`).join('');
        if (filteredFaculties.length > 0) {
            facultySelect.value = filteredFaculties[0].FacultyID;
        } else {
            facultySelect.innerHTML = '<option value="">No Faculty</option>';
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const sectionData = {
            SectionID: form.querySelector('#sectionId').value,
            CourseCode: courseSelect.value,
            SemesterID: form.querySelector('#semesterId').value,
            Year: parseInt(form.querySelector('#year').value),
            Season: seasonSelect.value,
            StartTime: form.querySelector('#startTime').value,
            EndTime: form.querySelector('#endTime').value,
            DayOfWeek: dayOfWeekSelect.value,
            FacultyID: facultySelect.value,
            RoomNumber: form.querySelector('#roomNumber').value
        };

        if (!sectionData.SectionID || !sectionData.CourseCode || !sectionData.SemesterID || isNaN(sectionData.Year) || !sectionData.Season || !sectionData.StartTime || !sectionData.EndTime || !sectionData.DayOfWeek || !sectionData.FacultyID || !sectionData.RoomNumber) {
            showMessageBox('Input Error', 'All fields are required and valid selections must be made.');
            return;
        }

        try {
            await sendData('/section', 'POST', sectionData);
            showMessageBox('Success', 'Section added successfully!');
            form.reset();
            populateDepartmentsForSection(allDepartments);
            seasonSelect.value = "Spring";
            dayOfWeekSelect.value = "Monday";
        } catch (error) {
            // Error message already displayed by sendData
        }
    });

    form.querySelector('.clear-button').addEventListener('click', () => {
        form.reset();
        populateDepartmentsForSection(allDepartments);
        seasonSelect.value = "Spring";
        dayOfWeekSelect.value = "Monday";
    });

    populateDepartmentsForSection(allDepartments);
};

pageInitializers.editSection = async function (sectionId) {
    const section = await fetchData(`/section/${sectionId}`);
    if (!section) return;

    const editFormHtml = `
        <div class="form-container">
            <h2 class="form-title">Edit Section: ${section.SectionID}</h2>
            <form id="edit-section-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="editCourseCode" class="form-label">Course Code:</label>
                        <input type="text" id="editCourseCode" value="${section.CourseCode}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editSemesterId" class="form-label">Semester ID:</label>
                        <input type="text" id="editSemesterId" value="${section.SemesterID}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editYear" class="form-label">Year:</label>
                        <input type="number" id="editYear" value="${section.Year}" min="1900" max="2100" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editSeason" class="form-label">Season:</label>
                        <select id="editSeason" class="form-input" required>
                            <option value="Spring" ${section.Season === 'Spring' ? 'selected' : ''}>Spring</option>
                            <option value="Summer" ${section.Season === 'Summer' ? 'selected' : ''}>Summer</option>
                            <option value="Fall" ${section.Season === 'Fall' ? 'selected' : ''}>Fall</option>
                            <option value="Winter" ${section.Season === 'Winter' ? 'selected' : ''}>Winter</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editStartTime" class="form-label">Start Time (HH:MM):</label>
                        <input type="time" id="editStartTime" value="${section.StartTime}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editEndTime" class="form-label">End Time (HH:MM):</label>
                        <input type="time" id="editEndTime" value="${section.EndTime}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editDayOfWeek" class="form-label">Day of Week:</label>
                        <select id="editDayOfWeek" class="form-input" required>
                            <option value="Monday" ${section.DayOfWeek === 'Monday' ? 'selected' : ''}>Monday</option>
                            <option value="Tuesday" ${section.DayOfWeek === 'Tuesday' ? 'selected' : ''}>Tuesday</option>
                            <option value="Wednesday" ${section.DayOfWeek === 'Wednesday' ? 'selected' : ''}>Wednesday</option>
                            <option value="Thursday" ${section.DayOfWeek === 'Thursday' ? 'selected' : ''}>Thursday</option>
                            <option value="Friday" ${section.DayOfWeek === 'Friday' ? 'selected' : ''}>Friday</option>
                            <option value="Saturday" ${section.DayOfWeek === 'Saturday' ? 'selected' : ''}>Saturday</option>
                            <option value="Sunday" ${section.DayOfWeek === 'Sunday' ? 'selected' : ''}>Sunday</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editFacultyId" class="form-label">Faculty ID:</label>
                        <input type="text" id="editFacultyId" value="${section.FacultyID || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="editRoomNumber" class="form-label">Room Number:</label>
                        <input type="text" id="editRoomNumber" value="${section.RoomNumber || ''}" class="form-input">
                    </div>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="save-button">Save Changes</button>
                    <button type="button" class="clear-button" onclick="handleMenu('section', 'View Section')">Cancel</button>
                </div>
            </form>
        </div>
    `;
    loadContent(editFormHtml);

    const editForm = document.getElementById('edit-section-form');
    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const updatedSectionData = {
            CourseCode: editForm.querySelector('#editCourseCode').value,
            SemesterID: editForm.querySelector('#editSemesterId').value,
            Year: parseInt(editForm.querySelector('#editYear').value),
            Season: editForm.querySelector('#editSeason').value,
            StartTime: editForm.querySelector('#editStartTime').value,
            EndTime: editForm.querySelector('#editEndTime').value,
            DayOfWeek: editForm.querySelector('#editDayOfWeek').value,
            FacultyID: editForm.querySelector('#editFacultyId').value || null,
            RoomNumber: editForm.querySelector('#editRoomNumber').value || null
        };

        if (!updatedSectionData.CourseCode || !updatedSectionData.SemesterID || isNaN(updatedSectionData.Year) || !updatedSectionData.Season || !updatedSectionData.StartTime || !updatedSectionData.EndTime || !updatedSectionData.DayOfWeek) {
            showMessageBox('Input Error', 'All main fields are required.');
            return;
        }

        try {
            await sendData(`/section/${sectionId}`, 'PUT', updatedSectionData);
            showMessageBox('Success', 'Section updated successfully!');
            handleMenu('section', 'View Section');
        } catch (error) {
            // Error message already displayed by sendData
        }
    });
};

pageInitializers.deleteSection = async function (sectionId) {
    showMessageBox('Confirm Delete', `Are you sure you want to delete section ID: ${sectionId}? This will also delete associated enrollments and schedule data.`, 'confirm', async (confirmed) => {
        if (confirmed) {
            try {
                await sendData(`/section/${sectionId}`, 'DELETE');
                showMessageBox('Success', 'Section, associated enrollments, and schedule deleted successfully!');
                pageInitializers.initSectionList();
            } catch (error) {
                // Error message already displayed by sendData
            }
        }
    });
};

pageInitializers.initStudentsList = async function () {
    const tableBody = document.querySelector('#students-table tbody');
    const searchInput = document.getElementById('students-search-input');
    const searchButton = document.getElementById('students-search-button');
    const resetButton = document.getElementById('students-reset-button');

    let allStudents = [];

    const fetchAndPopulateStudents = async () => {
        allStudents = await fetchData('/students');
        populateTable(allStudents);
    };

    const populateTable = (studentsToDisplay) => {
        if (!tableBody) {
            console.error("Students table body not found.");
            return;
        }
        tableBody.innerHTML = '';
        if (studentsToDisplay.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" class="loading-message">No students found.</td></tr>';
            return;
        }
        studentsToDisplay.forEach(student => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${student.StudentID}</td>
                <td>${student.FirstName}</td>
                <td>${student.LastName}</td>
                <td>${student.Gender}</td>
                <td>${student.DOB ? student.DOB.split('T')[0] : 'N/A'}</td>
                <td>${student.Address || 'N/A'}</td>
                <td>${student.PhoneNumber || 'N/A'}</td>
                <td>${student.Email}</td>
                <td>${student.EnrollmentDate ? student.EnrollmentDate.split('T')[0] : 'N/A'}</td>
                <td>${student.DepartmentID || 'N/A'}</td>
                <td class="action-buttons">
                    <button class="edit-button" onclick="pageInitializers.editStudent('${student.StudentID}')">Edit</button>
                    <button class="delete-button" onclick="pageInitializers.deleteStudent('${student.StudentID}')">Delete</button>
                </td>
            `;
        });
    };

    const searchStudents = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredStudents = allStudents.filter(student =>
            (student.StudentID && String(student.StudentID).toLowerCase().includes(searchTerm)) ||
            (student.FirstName && student.FirstName.toLowerCase().includes(searchTerm)) ||
            (student.LastName && student.LastName.toLowerCase().includes(searchTerm)) ||
            (student.Email && student.Email.toLowerCase().includes(searchTerm)) ||
            (student.PhoneNumber && String(student.PhoneNumber).toLowerCase().includes(searchTerm))
        );
        populateTable(filteredStudents);
    };

    const resetSearch = () => {
        if (searchInput) searchInput.value = '';
        populateTable(allStudents);
    };

    if (searchInput) searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchStudents();
        }
    });
    if (searchButton) searchButton.addEventListener('click', searchStudents);
    if (resetButton) resetButton.addEventListener('click', resetSearch);

    await fetchAndPopulateStudents();
};

pageInitializers.initFacultyList = async function () {
    const tableBody = document.querySelector('#faculty-table tbody');
    const searchInput = document.getElementById('faculty-search-input');
    const searchButton = document.getElementById('faculty-search-button');
    const resetButton = document.getElementById('faculty-reset-button');

    let allFaculties = [];

    const fetchAndPopulateFaculties = async () => {
        allFaculties = await fetchData('/faculties');
        populateTable(allFaculties);
    };

    const populateTable = (facultiesToDisplay) => {
        if (!tableBody) {
            console.error("Faculty table body not found.");
            return;
        }
        tableBody.innerHTML = '';
        if (facultiesToDisplay.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="loading-message">No faculty members found.</td></tr>';
            return;
        }
        facultiesToDisplay.forEach(faculty => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${faculty.FacultyID}</td>
                <td>${faculty.FullName}</td>
                <td>${faculty.Email}</td>
                <td>${faculty.PhoneNumber || 'N/A'}</td>
                <td>${faculty.HireDate ? faculty.HireDate.split('T')[0] : 'N/A'}</td>
                <td>${faculty.Designation}</td>
                <td>${faculty.DepartmentID || 'N/A'}</td>
                <td class="action-buttons">
                    <button class="edit-button" onclick="pageInitializers.editFaculty('${faculty.FacultyID}')">Edit</button>
                    <button class="delete-button" onclick="pageInitializers.deleteFaculty('${faculty.FacultyID}')">Delete</button>
                </td>
            `;
        });
    };

    const searchFaculties = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredFaculties = allFaculties.filter(faculty =>
            (faculty.FacultyID && String(faculty.FacultyID).toLowerCase().includes(searchTerm)) ||
            (faculty.FullName && faculty.FullName.toLowerCase().includes(searchTerm)) ||
            (faculty.Email && faculty.Email.toLowerCase().includes(searchTerm)) ||
            (faculty.PhoneNumber && String(faculty.PhoneNumber).toLowerCase().includes(searchTerm))
        );
        populateTable(filteredFaculties);
    };

    const resetSearch = () => {
        if (searchInput) searchInput.value = '';
        populateTable(allFaculties);
    };

    if (searchInput) searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchFaculties();
        }
    });
    if (searchButton) searchButton.addEventListener('click', searchFaculties);
    if (resetButton) resetButton.addEventListener('click', resetSearch);

    await fetchAndPopulateFaculties();
};

pageInitializers.initCourseList = async function () {
    const tableBody = document.querySelector('#courses-table tbody');
    const searchInput = document.getElementById('courses-search-input');
    const searchButton = document.getElementById('courses-search-button');
    const resetButton = document.getElementById('courses-reset-button');

    let allCourses = [];
    let allDepartmentsMap = {};

    const fetchAndPopulateCourses = async () => {
        allCourses = await fetchData('/courses');
        const departments = await fetchData('/departments');
        allDepartmentsMap = departments.reduce((map, dept) => {
            map[dept.DepartmentID] = dept.DepartmentName;
            return map;
        }, {});
        populateTable(allCourses);
    };

    const populateTable = (coursesToDisplay) => {
        if (!tableBody) {
            console.error("Courses table body not found.");
            return;
        }
        tableBody.innerHTML = '';
        if (coursesToDisplay.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No courses found.</td></tr>';
            return;
        }
        coursesToDisplay.forEach(course => {
            const departmentName = allDepartmentsMap[course.DepartmentID] || 'N/A';
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${course.CourseCode}</td>
                <td>${course.Title}</td>
                <td>${course.CreditHours}</td>
                <td>${course.CourseType}</td>
                <td>${course.Description || 'N/A'}</td>
                <td>${departmentName}</td>
                <td class="action-buttons">
                    <button class="edit-button" onclick="pageInitializers.editCourse('${course.CourseCode}')">Edit</button>
                    <button class="delete-button" onclick="pageInitializers.deleteCourse('${course.CourseCode}')">Delete</button>
                </td>
            `;
        });
    };

    const searchCourses = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredCourses = allCourses.filter(course =>
            (course.CourseCode && String(course.CourseCode).toLowerCase().includes(searchTerm)) ||
            (course.Title && course.Title.toLowerCase().includes(searchTerm)) ||
            (course.Description && course.Description.toLowerCase().includes(searchTerm))
        );
        populateTable(filteredCourses);
    };

    const resetSearch = () => {
        if (searchInput) searchInput.value = '';
        populateTable(allCourses);
    };

    if (searchInput) searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchCourses();
        }
    });
    if (searchButton) searchButton.addEventListener('click', searchCourses);
    if (resetButton) resetButton.addEventListener('click', resetSearch);

    await fetchAndPopulateCourses();
};

pageInitializers.initClassroomList = async function () {
    const tableBody = document.querySelector('#classrooms-table tbody');
    const searchInput = document.getElementById('classrooms-search-input');
    const searchButton = document.getElementById('classrooms-search-button');
    const resetButton = document.getElementById('classrooms-reset-button');

    let allClassrooms = [];
    let allDepartmentsMap = {};

    const fetchAndPopulateClassrooms = async () => {
        allClassrooms = await fetchData('/classrooms');
        const departments = await fetchData('/departments');
        allDepartmentsMap = departments.reduce((map, dept) => {
            map[dept.DepartmentID] = dept.DepartmentName;
            return map;
        }, {});
        populateTable(allClassrooms);
    };

    const populateTable = (classroomsToDisplay) => {
        if (!tableBody) {
            console.error("Classrooms table body not found.");
            return;
        }
        tableBody.innerHTML = '';
        if (classroomsToDisplay.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No classrooms found.</td></tr>';
            return;
        }
        classroomsToDisplay.forEach(classroom => {
            const departmentName = allDepartmentsMap[classroom.DepartmentID] || 'N/A';
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${classroom.RoomNumber}</td>
                <td>${classroom.ClassRoomType}</td>
                <td>${classroom.Capacity}</td>
                <td>${classroom.Building}</td>
                <td>${classroom.PhoneNumber || 'N/A'}</td>
                <td>${departmentName}</td>
                <td class="action-buttons">
                    <button class="edit-button" onclick="pageInitializers.editClassroom('${classroom.RoomNumber}')">Edit</button>
                    <button class="delete-button" onclick="pageInitializers.deleteClassroom('${classroom.RoomNumber}')">Delete</button>
                </td>
            `;
        });
    };

    const searchClassrooms = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredClassrooms = allClassrooms.filter(classroom =>
            (classroom.RoomNumber && String(classroom.RoomNumber).toLowerCase().includes(searchTerm)) ||
            (classroom.ClassRoomType && classroom.ClassRoomType.toLowerCase().includes(searchTerm)) ||
            (classroom.Building && classroom.Building.toLowerCase().includes(searchTerm)) ||
            (classroom.PhoneNumber && String(classroom.PhoneNumber).toLowerCase().includes(searchTerm))
        );
        populateTable(filteredClassrooms);
    };

    const resetSearch = () => {
        if (searchInput) searchInput.value = '';
        populateTable(allClassrooms);
    };

    if (searchInput) searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchClassrooms();
        }
    });
    if (searchButton) searchButton.addEventListener('click', searchClassrooms);
    if (resetButton) resetButton.addEventListener('click', resetSearch);

    await fetchAndPopulateClassrooms();
};

pageInitializers.initDepartmentList = async function () {
    const tableBody = document.querySelector('#departments-table tbody');
    const searchInput = document.getElementById('departments-search-input');
    const searchButton = document.getElementById('departments-search-button');
    const resetButton = document.getElementById('departments-reset-button');

    let allDepartments = [];

    const fetchAndPopulateDepartments = async () => {
        allDepartments = await fetchData('/departments');
        populateTable(allDepartments);
    };

    const populateTable = (departmentsToDisplay) => {
        if (!tableBody) {
            console.error("Departments table body not found.");
            return;
        }
        tableBody.innerHTML = '';
        if (departmentsToDisplay.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="loading-message">No departments found.</td></tr>';
            return;
        }
        departmentsToDisplay.forEach(department => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${department.DepartmentID}</td>
                <td>${department.DepartmentName}</td>
                <td class="action-buttons">
                    <button class="edit-button" onclick="pageInitializers.editDepartment('${department.DepartmentID}')">Edit</button>
                    <button class="delete-button" onclick="pageInitializers.deleteDepartment('${department.DepartmentID}')">Delete</button>
                </td>
            `;
        });
    };

    const searchDepartments = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredDepartments = allDepartments.filter(department =>
            (department.DepartmentID && String(department.DepartmentID).toLowerCase().includes(searchTerm)) ||
            (department.DepartmentName && department.DepartmentName.toLowerCase().includes(searchTerm))
        );
        populateTable(filteredDepartments);
    };

    const resetSearch = () => {
        if (searchInput) searchInput.value = '';
        populateTable(allDepartments);
    };

    if (searchInput) searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchDepartments();
        }
    });
    if (searchButton) searchButton.addEventListener('click', searchDepartments);
    if (resetButton) resetButton.addEventListener('click', resetSearch);

    await fetchAndPopulateDepartments();
};

pageInitializers.initSectionList = async function () {
    const tableBody = document.querySelector('#sections-table tbody');
    const searchInput = document.getElementById('sections-search-input');
    const searchButton = document.getElementById('sections-search-button');
    const resetButton = document.getElementById('sections-reset-button');

    let allSections = [];

    const fetchAndPopulateSections = async () => {
        allSections = await fetchData('/sections');
        populateTable(allSections);
    };

    const populateTable = (sectionsToDisplay) => {
        if (!tableBody) {
            console.error("Sections table body not found.");
            return;
        }
        tableBody.innerHTML = '';
        if (sectionsToDisplay.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" class="loading-message">No sections found.</td></tr>';
            return;
        }
        sectionsToDisplay.forEach(section => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${section.SectionID}</td>
                <td>${section.CourseCode}</td>
                <td>${section.SemesterID}</td>
                <td>${section.Year}</td>
                <td>${section.Season}</td>
                <td>${section.StartTime}</td>
                <td>${section.EndTime}</td>
                <td>${section.DayOfWeek}</td>
                <td class="action-buttons">
                    <button class="edit-button" onclick="pageInitializers.editSection('${section.SectionID}')">Edit</button>
                    <button class="delete-button" onclick="pageInitializers.deleteSection('${section.SectionID}')">Delete</button>
                    <button class="enroll-button" onclick="showEnrollStudentModal('${section.SectionID}')">Enroll Student</button>
                </td>
            `;
        });
    };

    const searchSections = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredSections = allSections.filter(section =>
            (section.SectionID && String(section.SectionID).toLowerCase().includes(searchTerm)) ||
            (section.CourseCode && String(section.CourseCode).toLowerCase().includes(searchTerm)) ||
            (section.SemesterID && String(section.SemesterID).toLowerCase().includes(searchTerm)) ||
            (section.Year && String(section.Year).toLowerCase().includes(searchTerm)) ||
            (section.Season && section.Season.toLowerCase().includes(searchTerm)) ||
            (section.DayOfWeek && section.DayOfWeek.toLowerCase().includes(searchTerm))
        );
        populateTable(filteredSections);
    };

    const resetSearch = () => {
        if (searchInput) searchInput.value = '';
        populateTable(allSections);
    };

    if (searchInput) searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchSections();
        }
    });
    if (searchButton) searchButton.addEventListener('click', searchSections);
    if (resetButton) resetButton.addEventListener('click', resetSearch);

    await fetchAndPopulateSections();
};


pageInitializers.initReportsDashboard = async function () {
    const reportSelect = document.getElementById('report-select');
    const viewSelect = document.getElementById('view-select');
    const filterOptionsContainer = document.getElementById('filter-options-container');
    const reportDisplayArea = document.getElementById('report-display-area');
    const initialReportMessage = document.getElementById('initial-report-message');
    const reportTableView = document.getElementById('report-table-view');
    const reportChartView = document.getElementById('report-chart-view');
    // myChartInstance is global, no need to declare again here.

    if (!reportSelect || !viewSelect || !filterOptionsContainer || !reportDisplayArea || !initialReportMessage || !reportTableView || !reportChartView) {
        console.error("Reports dashboard elements not found. Cannot initialize.");
        return;
    }

    const reportsMetadata = [
        { name: "Departmental Enrollment Statistics", func: "/reports/students-enrolled-per-department", headers: ["Department", "Student Count"], graphType: "bar", plotIndices: [[0], 1], filters: [] },
        { name: "Average GPA Analysis by Department", func: "/reports/average-gpa-per-department", headers: ["Department", "Year", "Season", "Gender", "Average GPA"], graphType: "bar", plotIndices: [[0, 1, 2, 3], 4], filters: ["gender", "semester_id"] },
        { name: "Faculty Course Load", func: "/reports/faculty-with-courses", headers: ["Faculty Name", "Course Count"], graphType: "pie", plotIndices: [[0], 1], filters: [] },
        { name: "Popular Courses by Enrollment", func: "/reports/most-popular-courses", headers: ["Course Title", "Enrollment Count"], graphType: "bar", plotIndices: [[0], 1], filters: [] },
        { name: "Classroom Utilization Audit", func: "/reports/overbooked-classrooms", headers: ["Classroom", "Capacity", "Total Enrollment", "Over Capacity"], graphType: "bar", plotIndices: [[0], 2], filters: [] },
        { name: "Academic Probation List", func: "/reports/students-on-probation", headers: ["First Name", "Last Name", "GPA"], graphType: "bar", plotIndices: [[0, 1], 2], filters: [] },
        { name: "Course Performance Trend", func: "/reports/course-performance-trends", headers: ["Year", "Season", "Course Title", "Average Grade"], graphType: "line", plotIndices: [[0, 1, 2], 3], filters: ["course_code"] },
        { name: "Schedule Conflict Detection", func: "/reports/timetable-conflicts", headers: ["Student First Name", "Student Last Name", "Section 1 ID", "Section 2 ID"], graphType: null, plotIndices: null, filters: [] },
        { name: "Top Performing Students", func: "/reports/top-performing-students", headers: ["First Name", "Last Name", "GPA", "Department"], graphType: "bar", plotIndices: [[0, 1], 2], filters: ["department_id", "min_gpa"] },
        { name: "Inactive Students Report", func: "/reports/inactive-students", headers: ["First Name", "Last Name", "Student ID"], graphType: null, plotIndices: null, filters: [] },
        { name: "Section Fill Rate", func: "/reports/section-fill-rate", headers: ["Section ID", "Course Title", "Enrolled Students", "Capacity", "Fill Rate (%)"], graphType: "bar", plotIndices: [[0, 1], 4], filters: ["section_id"] },
        { name: "Custom Report: Grade Distribution", func: "/reports/grade-distribution", headers: ["Semester Year", "Semester Season", "Instructor", "Grade", "Count"], graphType: "bar", plotIndices: [[0, 1, 2, 3], 4], filters: ["course_code", "semester_id", "faculty_id"] },
    ];

    let currentReportInfo = null;
    const filterValues = {}; // This object will hold the current values of all filters

    reportSelect.innerHTML = reportsMetadata.map(r => `<option value="${r.name}">${r.name}</option>`).join('');

    const setupFilters = async () => {
        filterOptionsContainer.innerHTML = ''; // Clear existing filters
        currentReportInfo = reportsMetadata.find(r => r.name === reportSelect.value);
        if (!currentReportInfo) return;

        // Reset filterValues for the new report
        for (const key in filterValues) {
            delete filterValues[key];
        }

        for (const filterKey of currentReportInfo.filters) {
            const filterGroup = document.createElement('div');
            filterGroup.className = 'filter-group';
            let labelText = '';
            let inputElement;

            switch (filterKey) {
                case "gender":
                    labelText = "Gender:";
                    inputElement = document.createElement('select');
                    inputElement.className = 'form-input';
                    inputElement.innerHTML = `
                        <option value="All">All</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    `;
                    filterValues[filterKey] = "All"; // Default to "All"
                    break;
                case "semester_id":
                    labelText = "Semester:";
                    inputElement = document.createElement('select');
                    inputElement.className = 'form-input';
                    const semesters = await fetchData('/semesters');
                    inputElement.innerHTML = `<option value="All">All</option>` + semesters.map(s => `<option value="${s.Season}${s.Year}">${s.Season} ${s.Year}</option>`).join('');
                    filterValues[filterKey] = "All"; // Default to "All"
                    break;
                case "course_code":
                    labelText = "Course:";
                    inputElement = document.createElement('select');
                    inputElement.className = 'form-input';
                    const courses = await fetchData('/courses/all');
                    inputElement.innerHTML = `<option value="All">All</option>` + courses.map(c => `<option value="${c.CourseCode}">${c.Title} (${c.CourseCode})</option>`).join('');
                    filterValues[filterKey] = "All"; // Default to "All"
                    break;
                case "department_id":
                    labelText = "Department:";
                    inputElement = document.createElement('select');
                    inputElement.className = 'form-input';
                    const departments = await fetchData('/departments');
                    inputElement.innerHTML = `<option value="All">All</option>` + departments.map(d => `<option value="${d.DepartmentID}">${d.DepartmentName}</option>`).join('');
                    filterValues[filterKey] = "All"; // Default to "All"
                    break;
                case "min_gpa":
                    labelText = "Min GPA:";
                    inputElement = document.createElement('input');
                    inputElement.type = "number";
                    inputElement.step = "0.1";
                    inputElement.value = "2.0"; // Default value
                    inputElement.className = 'form-input';
                    filterValues[filterKey] = 2.0; // Default value
                    break;
                case "section_id":
                    labelText = "Section:";
                    inputElement = document.createElement('select');
                    inputElement.className = 'form-input';
                    const sections = await fetchData('/sections');
                    inputElement.innerHTML = `<option value="All">All</option>` + sections.map(s => `<option value="${s.SectionID}">SecID: ${s.SectionID} (${s.CourseCode})</option>`).join('');
                    filterValues[filterKey] = "All"; // Default to "All"
                    break;
                case "faculty_id":
                    labelText = "Instructor:";
                    inputElement = document.createElement('select');
                    inputElement.className = 'form-input';
                    // Corrected endpoint for fetching all faculty
                    const faculties = await fetchData('/faculty/all');
                    inputElement.innerHTML = `<option value="All">All</option>` + faculties.map(f => `<option value="${f.FacultyID}">${f.FullName}</option>`).join('');
                    filterValues[filterKey] = "All"; // Default to "All"
                    break;
            }

            if (inputElement) {
                const label = document.createElement('label');
                label.textContent = labelText;
                label.className = 'form-label';

                inputElement.addEventListener('change', (e) => {
                    filterValues[filterKey] = e.target.value;
                    displayReport();
                });
                if (inputElement.type === 'number') {
                    inputElement.addEventListener('input', (e) => {
                        filterValues[filterKey] = parseFloat(e.target.value);
                        displayReport();
                    });
                }
                filterGroup.appendChild(label);
                filterGroup.appendChild(inputElement);
                filterOptionsContainer.appendChild(filterGroup);
            }
        }
    };

    const displayReport = async () => {
        initialReportMessage.classList.add('hidden');
        reportTableView.classList.add('hidden');
        reportChartView.classList.add('hidden');

        if (myChartInstance) {
            myChartInstance.destroy();
            myChartInstance = null;
        }

        if (!currentReportInfo) {
            initialReportMessage.classList.remove('hidden');
            initialReportMessage.textContent = 'Please select a report.';
            return;
        }

        const params = new URLSearchParams();
        for (const key in filterValues) {
            // Special handling for semester_id to convert "SeasonYear" to SemesterID
            if (key === "semester_id" && filterValues[key] !== "All") {
                const semesterStr = filterValues[key];
                const season = semesterStr.slice(0, -4);
                const year = parseInt(semesterStr.slice(-4));
                try {
                    const semesterData = await fetchData(`/semester-id/${season}/${year}`);
                    if (semesterData && semesterData.semesterId) {
                        params.append(key, semesterData.semesterId);
                    } else {
                        console.warn(`Semester ID not found for ${semesterStr}. Skipping filter.`);
                        showMessageBox('Filter Warning', `Semester "${semesterStr}" not found. Report might not be filtered by semester.`, 'warning');
                    }
                } catch (error) {
                    console.error(`Error fetching semester ID for ${semesterStr}:`, error);
                    showMessageBox('Filter Error', `Failed to retrieve semester ID for "${semesterStr}". Report might not be filtered by semester.`, 'error');
                }
            }
            // Handle other filters: only append if value is not "All" and not null/undefined
            else if (filterValues[key] !== "All" && filterValues[key] !== null && filterValues[key] !== undefined) {
                params.append(key, filterValues[key]);
            }
        }

        console.log("DEBUG: API Call Parameters:", params.toString()); // DEBUG LOG
        const data = await fetchData(`${currentReportInfo.func}?${params.toString()}`);
        console.log("DEBUG: Data Received:", data); // DEBUG LOG

        // IMPORTANT: Add a check for empty or invalid data BEFORE attempting to render graph/table
        if (!data || data.length === 0) {
            initialReportMessage.classList.remove('hidden');
            initialReportMessage.textContent = 'No data available for this report with the selected filters.';
            return; // Exit function if no data
        }

        if (viewSelect.value === "Table") {
            reportTableView.classList.remove('hidden');
            showReportTable(data, currentReportInfo.headers);
        } else {
            reportChartView.classList.remove('hidden');
            showReportGraph(data, currentReportInfo);
        }
    };

    const showReportTable = (data, headers) => {
        let tableHtml = `
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            ${headers.map(header => `<th class="table-header">${header}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(row => `
                            <tr>
                                ${Object.values(row).map(cell => `<td class="table-cell">${cell !== null ? cell : 'N/A'}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        reportTableView.innerHTML = tableHtml;
    };

    const showReportGraph = (data, reportInfo) => {
        // Ensure data is not empty before proceeding with chart rendering
        if (!data || data.length === 0) {
            reportChartView.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title">No Data for Graph</h3>
                    <p class="welcome-text">No data available to generate a graph for this report with the current filters.</p>
                </div>
            `;
            // Ensure the canvas is hidden if no data
            reportChartView.classList.add('hidden');
            return;
        }

        if (!reportInfo.graphType || !reportInfo.plotIndices || !Array.isArray(reportInfo.plotIndices[0]) || reportInfo.plotIndices.length < 2) {
            reportChartView.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title">Graph View Not Available</h3>
                    <p class="welcome-text">Graph view is not configured for this report type or plot indices are invalid.</p>
                </div>
            `;
            return;
        }

        const canvas = document.getElementById('myChart');
        // Ensure canvas exists before attempting to replace/get context
        if (!canvas) {
            console.error("Canvas element 'myChart' not found for charting.");
            reportChartView.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title error-title">Chart Error</h3>
                    <p class="welcome-text">Could not find canvas element for charting.</p>
                </div>
            `;
            return;
        }

        // Destroy existing chart instance if any, before creating a new one
        if (myChartInstance) {
            myChartInstance.destroy();
            myChartInstance = null;
        }

        // Recreate canvas element to avoid issues with Chart.js re-initialization
        // This is a common pattern to ensure a clean canvas for new charts
        const oldCanvas = canvas;
        const newCanvas = document.createElement('canvas');
        newCanvas.id = 'myChart';
        // Set width and height to be responsive
        newCanvas.style.width = '100%';
        newCanvas.style.height = '100%';
        oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);

        const currentCanvas = document.getElementById('myChart'); // Get reference to the new canvas
        if (!currentCanvas) { // Double check if new canvas was created successfully
            console.error("New canvas element 'myChart' not found after replacement.");
            reportChartView.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title error-title">Chart Error</h3>
                    <p class="welcome-text">Could not create new canvas element for charting.</p>
                </div>
            `;
            return;
        }

        const ctx = currentCanvas.getContext('2d');
        if (!ctx) {
             console.error("Failed to get 2D context from canvas.");
             reportChartView.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title error-title">Chart Error</h3>
                    <p class="welcome-text">Could not get 2D rendering context from canvas.</p>
                </div>
            `;
            return;
        }

        const labels = data.map(item => {
            const keys = Object.keys(item);
            // Ensure item and keys[idx] exist before accessing
            // Corrected to use item[keys[idx]] for robust access
            return reportInfo.plotIndices[0].map(idx => {
                const key = keys[idx];
                return (item && key !== undefined && item[key] !== null && item[key] !== undefined) ? String(item[key]) : 'N/A';
            }).join(' ');
        });

        const values = data.map(item => {
            const keys = Object.keys(item);
            // Ensure item and keys[reportInfo.plotIndices[1]] exist
            // Corrected to use item[keys[reportInfo.plotIndices[1]]] for robust access
            const value = (item && keys[reportInfo.plotIndices[1]] !== undefined) ? item[keys[reportInfo.plotIndices[1]]] : 0;
            return typeof value === 'number' ? value : parseFloat(value) || 0;
        });

        const backgroundColors = values.map(() => `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.6)`);
        const borderColors = backgroundColors.map(color => color.replace('0.6', '1'));

        const chartConfig = {
            data: {
                labels: labels,
                datasets: [{
                    label: reportInfo.headers[reportInfo.plotIndices[1]],
                    data: values,
                    backgroundColor: reportInfo.graphType === 'pie' ? backgroundColors : 'rgba(75, 192, 192, 0.6)',
                    borderColor: reportInfo.graphType === 'pie' ? borderColors : 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: reportInfo.graphType === 'pie' || labels.length <= 10,
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: reportInfo.name,
                        font: {
                            size: 16
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        display: reportInfo.graphType !== 'pie'
                    },
                    x: {
                        display: reportInfo.graphType !== 'pie'
                    }
                }
            }
        };

        if (reportInfo.graphType === 'pie') {
            chartConfig.type = 'pie';
            delete chartConfig.options.scales;
        } else if (reportInfo.graphType === 'line') {
            chartConfig.type = 'line';
            chartConfig.datasets[0].fill = false;
            chartConfig.datasets[0].borderColor = 'rgba(75, 192, 192, 1)';
            chartConfig.datasets[0].backgroundColor = 'rgba(75, 192, 192, 0.2)';
        } else {
            chartConfig.type = 'bar';
        }

        myChartInstance = new Chart(ctx, chartConfig);
    };

    // Initial setup for reports dashboard
    // Event listeners are attached inside DOMContentLoaded for the select elements.
    // This function runs when reports_dashboard.html is loaded via loadPage.
    // It will then set up its internal event listeners for its own select elements.
    // The initial display will also be triggered here.

    if (reportSelect && viewSelect) {
        reportSelect.addEventListener('change', async () => {
            await setupFilters();
            displayReport();
        });
        viewSelect.addEventListener('change', displayReport);
    }

    await setupFilters();
    displayReport();
};


// --- Main Navigation Handler (Called by DOMContentLoaded event listeners) ---
/**
 * Handles menu selections from the navigation.
 * Dynamically loads the appropriate form or list.
 * @param {string} menuType - The type of management (e.g., 'student', 'faculty').
 * @param {string} value - The selected action (e.g., 'New Student', 'View Student').
 */
function handleMenu(menuType, value) {
    const action = value.split(' ')[0].toLowerCase(); // e.g., "new", "view"

    switch (menuType) {
        case 'student':
            if (action === 'new') {
                loadPage('new_student_form.html', 'initStudentForm');
            } else if (value.toLowerCase().includes('statistics')) {
                loadContent('<div class="welcome-content"><h2>Student Statistics (Web)</h2><p>Displaying interactive charts or data grids for student statistics.</p></div>');
            } else { // View Student
                loadPage('students_list.html', 'initStudentsList');
            }
            break;
        case 'faculty':
            if (action === 'new') {
                loadPage('new_faculty_form.html', 'initFacultyForm');
            } else { // View Faculty
                loadPage('faculty_list.html', 'initFacultyList');
            }
            break;
        case 'course':
            if (action === 'new') {
                loadPage('new_course_form.html', 'initCourseForm');
            } else { // View Course
                loadPage('course_list.html', 'initCourseList');
            }
            break;
        case 'section':
            if (action === 'new') {
                loadPage('new_section_form.html', 'initSectionForm');
            } else { // View Section
                loadPage('section_list.html', 'initSectionList');
            }
            break;
        case 'classroom':
            if (action === 'new') {
                loadPage('new_classroom_form.html', 'initClassroomForm');
            } else { // View Classroom
                loadPage('classroom_list.html', 'initClassroomList');
            }
            break;
        case 'department':
            if (action === 'new') {
                loadPage('new_department_form.html', 'initDepartmentForm');
            } else { // View Department
                loadPage('department_list.html', 'initDepartmentList');
            }
            break;
        default:
            showMessageBox('Navigation Error', `Unsupported menu type: ${menuType}`, 'error');
            break;
    }
}

/**
 * Simulates showing reports.
 */
function showReports() {
    loadPage('reports_dashboard.html', 'initReportsDashboard');
}

// --- DOMContentLoaded Event Listener for Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners to all navigation select elements
    const studentSelect = document.getElementById('student-select');
    if (studentSelect) {
        studentSelect.addEventListener('change', (event) => {
            handleMenu('student', event.target.value);
        });
        // Set default selection to "View Student"
        studentSelect.value = "View Student";
    }

    const facultySelect = document.getElementById('faculty-select');
    if (facultySelect) {
        facultySelect.addEventListener('change', (event) => {
            handleMenu('faculty', event.target.value);
        });
    }

    const courseSelect = document.getElementById('course-select');
    if (courseSelect) {
        courseSelect.addEventListener('change', (event) => {
            handleMenu('course', event.target.value);
        });
    }

    const sectionSelect = document.getElementById('section-select');
    if (sectionSelect) {
        sectionSelect.addEventListener('change', (event) => {
            handleMenu('section', event.target.value);
        });
    }

    const classroomSelect = document.getElementById('classroom-select');
    if (classroomSelect) {
        classroomSelect.addEventListener('change', (event) => {
            handleMenu('classroom', event.target.value);
        });
    }

    const departmentSelect = document.getElementById('department-select');
    if (departmentSelect) {
        departmentSelect.addEventListener('change', (event) => {
            handleMenu('department', event.target.value);
        });
    }

    // Attach event listeners to bottom buttons
    const reportsButton = document.getElementById('reports-button');
    if (reportsButton) {
        reportsButton.addEventListener('click', showReports);
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }

    // Load the default content on initial page load (e.g., student list)
    // Only load if the content frame is empty (avoids overwriting if server-rendered initial content exists)
    const contentFrame = document.getElementById('content-frame');
    if (contentFrame && contentFrame.innerHTML.trim() === '' && studentSelect) {
        handleMenu('student', studentSelect.value);
    } else if (contentFrame && contentFrame.innerHTML.trim() === '') {
        // Fallback if studentSelect isn't available, load a default welcome or first available
        loadContent('<div class="welcome-content">' +
                           '<h2 class="welcome-title">Welcome to your Admin Dashboard!</h2>' +
                           '<p class="welcome-text">Select an option from the left navigation to manage your university data.</p>' +
                           '<div class="welcome-image-container">' +
                               '<img src="https://placehold.co/400x200/E0F2F7/2E8B57?text=University+Admin" alt="University Admin Placeholder" class="welcome-image">' +
                           '</div>' +
                           '</div>');
    }

    // Attach event listeners for the enrollment modal buttons once the DOM is loaded
    const searchStudentEnrollmentButton = document.getElementById('search-student-enrollment-button');
    if (searchStudentEnrollmentButton) {
        searchStudentEnrollmentButton.addEventListener('click', searchStudentForEnrollment);
    }

    const performEnrollmentButton = document.getElementById('perform-enrollment-button');
    if (performEnrollmentButton) {
        performEnrollmentButton.addEventListener('click', performEnrollment);
    }

    const closeEnrollmentButton = document.getElementById('close-enrollment-button');
    if (closeEnrollmentButton) {
        closeEnrollmentButton.addEventListener('click', closeEnrollStudentModal);
    }

     // Attach event listeners for the user creation modal buttons
    const submitUserCreationButton = document.getElementById('submit-user-creation-button');
    if (submitUserCreationButton) {
        submitUserCreationButton.addEventListener('click', submitUserCreationForm);
    }

    const closeUserCreationButton = document.getElementById('close-user-creation-button');
    if (closeUserCreationButton) {
        closeUserCreationButton.addEventListener('click', closeUserCreationModal);
    }
});
