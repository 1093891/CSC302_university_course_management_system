// faculty_dashboard.js

const API_BASE_URL = 'http://localhost:8080/api';

// --- Global Variables for User Session ---
let loggedInUser = null;
let FACULTY_ID = null;
let myGradesChartInstance = null; // Chart instance for grades (if used in faculty grading)

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
 * Utility: Fetches data from a given API endpoint.
 * Improved error handling for non-JSON responses.
 * @param {string} endpoint - The API endpoint.
 * @returns {Promise<Array|object|null>} - A promise that resolves to the fetched data or null on error.
 */
async function fetchData(endpoint) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP error! Status: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
            } catch (jsonError) {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        showMessageBox('Error', `Failed to load data from ${endpoint}: ${error.message}`, 'error');
        return null; // Return null to indicate failure
    }
}

/**
 * Utility: Sends data to a given API endpoint (POST, PUT, DELETE).
 * Improved error handling for non-JSON responses.
 * @param {string} endpoint - The API endpoint.
 * @param {string} method - HTTP method ('POST', 'PUT', 'DELETE').
 * @param {object} [data=null] - The data to send.
 * @returns {Promise<object>} - A promise that resolves to the the API response.
 */
async function sendData(endpoint, method, data = null) {
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: data ? JSON.stringify(data) : null,
        };
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const responseText = await response.text();
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch (jsonError) {
            responseData = { message: responseText || 'Operation completed.', error: responseText || 'Unknown error.' };
        }

        if (!response.ok) {
            throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }
        return responseData;
    } catch (error) {
        console.error(`Error sending data to ${endpoint} with method ${method}:`, error);
        showMessageBox('Error', `Operation failed: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Faculty Logout Functionality
 */
function facultyLogout() {
    showMessageBox('Logout Confirmation', 'Are you sure you want to log out?', 'confirm', (confirmed) => {
        if (confirmed) {
            localStorage.removeItem('loggedInUser'); // Clear user session
            window.location.href = 'login.html'; // Redirect to login page
        }
    });
}

/**
 * Clears the faculty content frame.
 */
function clearFacultyContent() {
    const contentFrame = document.getElementById('faculty-content-frame');
    if (contentFrame) {
        contentFrame.innerHTML = '';
    }
}

/**
 * Loads HTML content into the faculty content frame.
 * @param {string} htmlContent - The HTML string to load.
 */
function loadFacultyContent(htmlContent) {
    clearFacultyContent();
    const contentFrame = document.getElementById('faculty-content-frame');
    if (contentFrame) {
        contentFrame.innerHTML = htmlContent;
    }
}

// --- Faculty Sub-Page Initialization Functions (Assigned to pageInitializers object) ---

// Object to hold references to faculty sub-page initialization functions
const facultyPageInitializers = {};

/**
 * Loads an external HTML file into the faculty content frame and then
 * executes a callback function to initialize its JavaScript.
 * @param {string} filePath - The path to the HTML file.
 * @param {string} initializerKey - The key of the function in facultyPageInitializers to call after the HTML is loaded.
 */
async function loadFacultyPage(filePath, initializerKey) {
    clearFacultyContent();
    const contentFrame = document.getElementById('faculty-content-frame');
    if (!contentFrame) {
        console.error("Faculty content frame not found.");
        return;
    }

    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            console.error(`Attempted to load: ${window.location.origin}/${filePath}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        contentFrame.innerHTML = html;

        if (facultyPageInitializers[initializerKey] && typeof facultyPageInitializers[initializerKey] === 'function') {
            facultyPageInitializers[initializerKey]();
        } else {
            console.warn(`Faculty initializer function "${initializerKey}" not found or is not a function.`);
        }
    } catch (error) {
        console.error(`Error loading faculty page from ${filePath}:`, error);
        showMessageBox('Error', `Could not load faculty page: ${error.message}. Please ensure file exists at correct path.`, 'error');
        loadFacultyContent('<div class="welcome-content">' +
                           '<h2 class="welcome-title error-title">Error Loading Page</h2>' +
                           '<p class="welcome-text">Please try again or contact support.</p>' +
                           '</div>');
    }
}

// --- My Courses (faculty_course_view.py equivalent) ---
facultyPageInitializers.initMyCourses = async function() {
    const semesterSelect = document.getElementById('course-view-semester-select');
    const courseTableBody = document.querySelector('#faculty-course-table tbody');

    if (!semesterSelect || !courseTableBody) return;

    let allSemesters = [];

    const fetchAndPopulateSemesters = async () => {
        allSemesters = await fetchData(`/faculty-semesters/${FACULTY_ID}`);
        if (allSemesters && allSemesters.length > 0) {
            semesterSelect.innerHTML = allSemesters.map(sem => `<option value="${sem}">${sem}</option>`).join('');
            semesterSelect.value = allSemesters[allSemesters.length - 1]; // Set to most recent
            await displayFacultyCourses();
        } else {
            semesterSelect.innerHTML = '<option value="">No semesters found</option>';
            courseTableBody.innerHTML = '<tr><td colspan="5" class="loading-message">No courses found for any semester.</td></tr>';
        }
    };

    const displayFacultyCourses = async () => {
        const selectedSemester = semesterSelect.value;
        if (!selectedSemester || selectedSemester === "") {
            courseTableBody.innerHTML = '<tr><td colspan="5" class="loading-message">Please select a semester.</td></tr>';
            return;
        }

        const season = selectedSemester.slice(0, -4);
        const year = selectedSemester.slice(-4);

        const coursesData = await fetchData(`/faculty-courses/${FACULTY_ID}/${season}/${year}`);
        courseTableBody.innerHTML = ''; // Clear existing data

        if (coursesData && coursesData.length > 0) {
            coursesData.forEach(course => {
                const row = courseTableBody.insertRow();
                row.innerHTML = `
                    <td>${course.course_code}</td>
                    <td>${course.title}</td>
                    <td>${course.section_id}</td>
                    <td>${course.time_slot}</td>
                    <td>${course.days}</td>
                `;
            });
        } else {
            courseTableBody.innerHTML = '<tr><td colspan="5" class="loading-message">No courses scheduled for this semester.</td></tr>';
        }
    };

    semesterSelect.addEventListener('change', displayFacultyCourses);
    await fetchAndPopulateSemesters();
};

// --- Enter Grades (faculty_grading.py equivalent) ---
facultyPageInitializers.initEnterGrades = async function() {
    const semesterSelect = document.getElementById('grading-semester-select');
    const courseSectionSelect = document.getElementById('grading-course-section-select');
    const studentTableBody = document.querySelector('#grading-student-table tbody');

    if (!semesterSelect || !courseSectionSelect || !studentTableBody) return;

    let allSemesters = [];
    let courseSectionMap = {}; // Maps display string to sectionId

    const fetchAndPopulateSemesters = async () => {
        allSemesters = await fetchData(`/faculty-semesters/${FACULTY_ID}`);
        if (allSemesters && allSemesters.length > 0) {
            semesterSelect.innerHTML = allSemesters.map(sem => `<option value="${sem}">${sem}</option>`).join('');
            semesterSelect.value = allSemesters[allSemesters.length - 1]; // Set to most recent
            await fetchAndPopulateCourseSections();
        } else {
            semesterSelect.innerHTML = '<option value="">No semesters found</option>';
            courseSectionSelect.innerHTML = '<option value="">No courses found</option>';
            studentTableBody.innerHTML = '<tr><td colspan="4" class="loading-message">No data available.</td></tr>';
        }
    };

    const fetchAndPopulateCourseSections = async () => {
        const selectedSemester = semesterSelect.value;
        if (!selectedSemester || selectedSemester === "") {
            courseSectionSelect.innerHTML = '<option value="">No courses found</option>';
            studentTableBody.innerHTML = '<tr><td colspan="4" class="loading-message">Please select a semester.</td></tr>';
            return;
        }

        const season = selectedSemester.slice(0, -4);
        const year = selectedSemester.slice(-4);

        const coursesData = await fetchData(`/faculty-courses/${FACULTY_ID}/${season}/${year}`);
        courseSectionSelect.innerHTML = '';
        courseSectionMap = {};

        if (coursesData && coursesData.length > 0) {
            coursesData.forEach(course => {
                const displayString = `${course.course_code} - ${course.section_id} (${course.title})`;
                courseSectionMap[displayString] = course.section_id;
                const option = document.createElement('option');
                option.value = displayString;
                option.textContent = displayString;
                courseSectionSelect.appendChild(option);
            });
            courseSectionSelect.value = Object.keys(courseSectionMap)[0]; // Select first course by default
            await displayStudentsForGrading();
        } else {
            courseSectionSelect.innerHTML = '<option value="">No courses found</option>';
            studentTableBody.innerHTML = '<tr><td colspan="4" class="loading-message">No courses found for this semester.</td></tr>';
        }
    };

    const displayStudentsForGrading = async () => {
        const selectedDisplayString = courseSectionSelect.value;
        const sectionId = courseSectionMap[selectedDisplayString];

        if (!sectionId) {
            studentTableBody.innerHTML = '<tr><td colspan="4" class="loading-message">Select a course section.</td></tr>';
            return;
        }

        const studentsData = await fetchData(`/department/students-in-section/${sectionId}`); // Reusing existing endpoint
        studentTableBody.innerHTML = '';

        if (studentsData && studentsData.length > 0) {
            studentsData.forEach(student => {
                const row = studentTableBody.insertRow();
                row.innerHTML = `
                    <td>${student.StudentID}</td>
                    <td>${student.FirstName}</td>
                    <td>${student.LastName}</td>
                    <td class="editable-grade" data-student-id="${student.StudentID}" data-section-id="${sectionId}">${student.Grade || 'Ungraded'}</td>
                `;
            });
            attachGradeEditListeners();
        } else {
            studentTableBody.innerHTML = '<tr><td colspan="4" class="loading-message">No students enrolled in this section.</td></tr>';
        }
    };

    const attachGradeEditListeners = () => {
        document.querySelectorAll('.editable-grade').forEach(cell => {
            cell.removeEventListener('click', handleGradeEditClick); // Prevent multiple listeners
            cell.addEventListener('click', handleGradeEditClick);
        });
    };

    const handleGradeEditClick = (event) => {
        const cell = event.target;
        if (cell.classList.contains('editing')) return; // Already editing

        const studentId = cell.dataset.studentId;
        const sectionId = cell.dataset.sectionId;
        const currentGrade = cell.textContent.trim();

        cell.classList.add('editing');
        const originalContent = cell.innerHTML;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentGrade === 'Ungraded' ? '' : currentGrade;
        input.className = 'grade-input'; // Add a class for styling if needed
        input.style.width = '100%'; // Make input fill cell
        input.style.boxSizing = 'border-box'; // Include padding/border in width

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();

        const saveGrade = async () => {
            const newGrade = input.value.trim().toUpperCase();
            const validGrades = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "UNGRADED"];

            if (!newGrade || !validGrades.includes(newGrade)) {
                showMessageBox('Invalid Grade', 'Please enter a valid grade (e.g., A, B+, F, Ungraded).', 'warning', () => {
                    cell.innerHTML = originalContent; // Revert if invalid
                    cell.classList.remove('editing');
                });
                return;
            }

            try {
                await sendData(`/enrollment/${studentId}/${sectionId}`, 'PUT', { Grade: newGrade });
                showMessageBox('Success', `Grade for ${studentId} updated to ${newGrade}.`);
                cell.textContent = newGrade;
            } catch (error) {
                // Error already displayed by sendData
                cell.innerHTML = originalContent; // Revert on API error
            } finally {
                cell.classList.remove('editing');
            }
        };

        input.addEventListener('blur', saveGrade); // Save when input loses focus
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                input.blur(); // Trigger blur to save
            }
        });
    };

    semesterSelect.addEventListener('change', fetchAndPopulateCourseSections);
    courseSectionSelect.addEventListener('change', displayStudentsForGrading);

    await fetchAndPopulateSemesters();
};

// --- My Schedule (faculty_schedule.py equivalent) ---
facultyPageInitializers.initMySchedule = async function() {
    const semesterSelect = document.getElementById('schedule-semester-select');
    const scheduleTableBody = document.querySelector('#faculty-schedule-table tbody');

    if (!semesterSelect || !scheduleTableBody) return;

    let allSemesters = [];

    const fetchAndPopulateSemesters = async () => {
        allSemesters = await fetchData(`/faculty-semesters/${FACULTY_ID}`);
        if (allSemesters && allSemesters.length > 0) {
            semesterSelect.innerHTML = allSemesters.map(sem => `<option value="${sem}">${sem}</option>`).join('');
            semesterSelect.value = allSemesters[allSemesters.length - 1]; // Set to most recent
            await displayFacultySchedule();
        } else {
            semesterSelect.innerHTML = '<option value="">No semesters found</option>';
            scheduleTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No schedules available.</td></tr>';
        }
    };

    const displayFacultySchedule = async () => {
        const selectedSemester = semesterSelect.value;
        if (!selectedSemester || selectedSemester === "") {
            scheduleTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">Please select a semester.</td></tr>';
            return;
        }

        const season = selectedSemester.slice(0, -4);
        const year = selectedSemester.slice(-4);

        const scheduleData = await fetchData(`/faculty-courses/${FACULTY_ID}/${season}/${year}`);
        scheduleTableBody.innerHTML = ''; // Clear existing data

        if (scheduleData && scheduleData.length > 0) {
            scheduleData.forEach(section => {
                const row = scheduleTableBody.insertRow();
                row.innerHTML = `
                    <td>${section.course_code}</td>
                    <td>${section.title}</td>
                    <td>${section.section_id}</td>
                    <td>${section.time_slot}</td>
                    <td>${section.days}</td>
                    <td>${section.room_number || 'N/A'}</td>
                `;
            });
        } else {
            scheduleTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No courses scheduled for this semester.</td></tr>';
        }
    };

    semesterSelect.addEventListener('change', displayFacultySchedule);
    await fetchAndPopulateSemesters();
};

// --- My Profile (faculty_profile.py equivalent) ---
facultyPageInitializers.initMyProfile = async function() {
    const profileContainer = document.getElementById('faculty-profile-container');
    if (!profileContainer) return;

    try {
        const faculty = await fetchData(`/faculty-profile/${FACULTY_ID}`);
        if (faculty) {
            // Fetch department name separately as faculty profile endpoint returns DepartmentID
            const department = await fetchData(`/department-name/${faculty.department_id}`);
            const departmentName = department ? department.departmentName : 'N/A';

            profileContainer.innerHTML = `
                <div class="profile-card">
                    <h3 class="profile-title">Faculty Profile</h3>
                    <div class="profile-detail-group">
                        <span class="profile-label">Faculty ID:</span>
                        <span class="profile-value">${faculty.faculty_id}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Full Name:</span>
                        <span class="profile-value">${faculty.name}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Designation:</span>
                        <span class="profile-value">${faculty.designation}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Hire Date:</span>
                        <span class="profile-value">${faculty.hire_date ? faculty.hire_date.split('T')[0] : 'N/A'}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Phone Number:</span>
                        <span class="profile-value">${faculty.phone || 'N/A'}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Email:</span>
                        <span class="profile-value">${faculty.email}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Department:</span>
                        <span class="profile-value">${departmentName}</span>
                    </div>
                    <div class="profile-detail-group full-width">
                        <span class="profile-label">Courses Taught:</span>
                        <div class="profile-value course-list" id="faculty-courses-list">
                            </div>
                    </div>
                </div>
            `;
            // Load courses taught
            const coursesListDiv = document.getElementById('faculty-courses-list');
            if (coursesListDiv) {
                const coursesCodes = await fetchData(`/faculty-courses-code/${FACULTY_ID}`);
                if (coursesCodes && coursesCodes.length > 0) {
                    let coursesHtml = '';
                    for (const courseCodeArr of coursesCodes) {
                        const courseCode = courseCodeArr; // Assuming it's just the code now
                        const courseDetails = await fetchData(`/course-name/${courseCode}`);
                        const courseTitle = courseDetails ? courseDetails.courseName : 'N/A';
                        coursesHtml += `<p class="course-item">- ${courseCode}: ${courseTitle}</p>`;
                    }
                    coursesListDiv.innerHTML = coursesHtml;
                } else {
                    coursesListDiv.innerHTML = '<p class="course-item">No courses taught.</p>';
                }
            }
        } else {
            profileContainer.innerHTML = '<p class="loading-message">Faculty profile not found.</p>';
        }
    } catch (error) {
        profileContainer.innerHTML = '<p class="loading-message">Error loading faculty profile.</p>';
    }
};


// --- Main Faculty Navigation Handler ---
/**
 * Handles faculty navigation menu selections.
 * @param {string} menuOption - 'my_courses', 'enter_grades', 'my_schedule', 'my_profile'.
 */
function handleFacultyMenu(menuOption) {
    switch (menuOption) {
        case 'my_courses':
            loadFacultyPage('faculty_my_courses.html', 'initMyCourses');
            break;
        case 'enter_grades':
            loadFacultyPage('faculty_enter_grades.html', 'initEnterGrades');
            break;
        case 'my_schedule':
            loadFacultyPage('faculty_my_schedule.html', 'initMySchedule');
            break;
        case 'my_profile':
            loadFacultyPage('faculty_my_profile.html', 'initMyProfile');
            break;
        default:
            console.warn(`Unknown faculty menu option: ${menuOption}`);
            break;
    }
}


// --- Authentication Check and Event Listener Attachment on Page Load ---
document.addEventListener('DOMContentLoaded', async () => {
    loggedInUser = JSON.parse(localStorage.getItem('loggedInUser'));

    if (!loggedInUser || loggedInUser.Role !== 'faculty') {
        window.location.href = 'login.html';
        return;
    }

    // Fetch FacultyID from the user object stored in localStorage
    // This assumes the login endpoint returns FacultyID for faculty users
    FACULTY_ID = loggedInUser.FacultyID;

    if (!FACULTY_ID) {
        // Attempt to fetch FacultyID if not directly in loggedInUser (e.g., if only UserID is present initially)
        try {
            const facultyIdResponse = await fetchData(`/user/faculty-id/${loggedInUser.UserID}`);
            if (facultyIdResponse && facultyIdResponse.facultyId) {
                FACULTY_ID = facultyIdResponse.facultyId;
                loggedInUser.FacultyID = FACULTY_ID; // Update local storage object
                localStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
            } else {
                throw new Error('Faculty ID not found for this user.');
            }
        } catch (error) {
            showMessageBox('Authentication Error', `Faculty ID not found or could not be retrieved: ${error.message}. Please contact support.`, 'error', () => {
                localStorage.removeItem('loggedInUser');
                window.location.href = 'login.html';
            });
            return;
        }
    }

    const welcomeMessageElement = document.getElementById('faculty-welcome-message');
    if (welcomeMessageElement) {
        welcomeMessageElement.textContent = `Welcome, ${loggedInUser.UserID} (ID: ${FACULTY_ID})!`;
    }

    // Attach event listeners to navigation buttons
    document.querySelector('.menu-button[onclick*="\'my_courses\'"]').addEventListener('click', () => handleFacultyMenu('my_courses'));
    document.querySelector('.menu-button[onclick*="\'enter_grades\'"]').addEventListener('click', () => handleFacultyMenu('enter_grades'));
    document.querySelector('.menu-button[onclick*="\'my_schedule\'"]').addEventListener('click', () => handleFacultyMenu('my_schedule'));
    document.querySelector('.menu-button[onclick*="\'my_profile\'"]').addEventListener('click', () => handleFacultyMenu('my_profile'));
    document.querySelector('.bottom-buttons .logout-button').addEventListener('click', facultyLogout);

    // Load initial content (e.g., My Courses)
    handleFacultyMenu('my_courses');
});
