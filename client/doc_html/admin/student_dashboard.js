// student_dashboard.js

const API_BASE_URL = 'http://localhost:8080/api';

// --- Global Variables for User Session ---
let loggedInUser = null;
let STUDENT_ID = null;
let myGradesChartInstance = null; // Chart instance for grades

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
            // Attempt to parse error message from response body if available
            // Use .text() first to avoid JSON parsing errors for non-JSON responses
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
        throw error;
    }
}

/**
 * Student Logout Functionality
 */
function studentLogout() {
    showMessageBox('Logout Confirmation', 'Are you sure you want to log out?', 'confirm', (confirmed) => {
        if (confirmed) {
            localStorage.removeItem('loggedInUser'); // Clear user session
            window.location.href = 'login.html'; // Redirect to login page
        }
    });
}

/**
 * Clears the student content frame.
 */
function clearStudentContent() {
    const contentFrame = document.getElementById('student-content-frame');
    if (contentFrame) {
        contentFrame.innerHTML = '';
    }
}

/**
 * Loads HTML content into the student content frame.
 * @param {string} htmlContent - The HTML string to load.
 */
function loadStudentContent(htmlContent) {
    clearStudentContent();
    const contentFrame = document.getElementById('student-content-frame');
    if (contentFrame) {
        contentFrame.innerHTML = htmlContent;
    }
}

// --- Student Sub-Page Initialization Functions (Assigned to pageInitializers object) ---

// Object to hold references to student sub-page initialization functions
const studentPageInitializers = {};

/**
 * Loads an external HTML file into the student content frame and then
 * executes a callback function to initialize its JavaScript.
 * @param {string} filePath - The path to the HTML file.
 * @param {string} initializerKey - The key of the function in studentPageInitializers to call after the HTML is loaded.
 */
async function loadStudentPage(filePath, initializerKey) {
    clearStudentContent();
    const contentFrame = document.getElementById('student-content-frame');
    if (!contentFrame) {
        console.error("Student content frame not found.");
        return;
    }

    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            // Log the full path the browser tried to fetch for debugging 404s
            console.error(`Attempted to load: ${window.location.origin}/${filePath}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        contentFrame.innerHTML = html;

        if (studentPageInitializers[initializerKey] && typeof studentPageInitializers[initializerKey] === 'function') {
            studentPageInitializers[initializerKey]();
        } else {
            console.warn(`Student initializer function "${initializerKey}" not found or is not a function.`);
        }
    } catch (error) {
        console.error(`Error loading student page from ${filePath}:`, error);
        showMessageBox('Error', `Could not load student page: ${error.message}. Please ensure file exists at correct path.`, 'error');
        loadStudentContent('<div class="welcome-content">' +
                           '<h2 class="welcome-title error-title">Error Loading Page</h2>' +
                           '<p class="welcome-text">Please try again or contact support.</p>' +
                           '</div>');
    }
}


studentPageInitializers.initStudentProfile = async function () {
    const profileContainer = document.getElementById('student-profile-container');
    if (!profileContainer) return;

    try {
        const student = await fetchData(`/student/${STUDENT_ID}`);
        if (student) {
            profileContainer.innerHTML = `
                <div class="profile-card">
                    <h3 class="profile-title">Student Profile</h3>
                    <div class="profile-detail-group">
                        <span class="profile-label">Student ID:</span>
                        <span class="profile-value">${student.StudentID}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Name:</span>
                        <span class="profile-value">${student.FirstName} ${student.LastName}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Email:</span>
                        <span class="profile-value">${student.Email}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Phone:</span>
                        <span class="profile-value">${student.PhoneNumber || 'N/A'}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Address:</span>
                        <span class="profile-value">${student.Address || 'N/A'}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Date of Birth:</span>
                        <span class="profile-value">${student.DOB ? student.DOB.split('T')[0] : 'N/A'}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Gender:</span>
                        <span class="profile-value">${student.Gender || 'N/A'}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Enrollment Date:</span>
                        <span class="profile-value">${student.EnrollmentDate ? student.EnrollmentDate.split('T')[0] : 'N/A'}</span>
                    </div>
                    <div class="profile-detail-group">
                        <span class="profile-label">Department ID:</span>
                        <span class="profile-value">${student.DepartmentID || 'N/A'}</span>
                    </div>
                </div>
            `;
        } else {
            profileContainer.innerHTML = '<p class="loading-message">Student profile not found.</p>';
        }
    } catch (error) {
        profileContainer.innerHTML = '<p class="loading-message">Error loading student profile.</p>';
    }
};

studentPageInitializers.initStudentSchedules = async function () {
    const semesterSelect = document.getElementById('schedule-semester-select');
    const scheduleTableBody = document.querySelector('#student-schedule-table tbody');
    if (!semesterSelect || !scheduleTableBody) return;

    let allSemesters = [];

    const fetchAndPopulateSemesters = async () => {
        allSemesters = await fetchData(`/student-semesters/${STUDENT_ID}`);
        if (allSemesters && allSemesters.length > 0) {
            semesterSelect.innerHTML = allSemesters.map(sem => `<option value="${sem}">${sem}</option>`).join('');
            // Set default to the most recent semester if available
            semesterSelect.value = allSemesters[0]; 
            await displayStudentSchedule();
        } else {
            semesterSelect.innerHTML = '<option value="">No semesters found</option>';
            scheduleTableBody.innerHTML = '<tr><td colspan="6" class="loading-message">No schedules available.</td></tr>';
        }
    };

    const displayStudentSchedule = async () => {
        const selectedSemester = semesterSelect.value;
        if (!selectedSemester || selectedSemester === "") { // Check for empty value as well
            scheduleTableBody.innerHTML = '<tr><td colspan="6" class="loading-message">Please select a semester.</td></tr>';
            return;
        }

        const season = selectedSemester.slice(0, -4);
        const year = selectedSemester.slice(-4);

        const scheduleData = await fetchData(`/student-schedule-sections/${STUDENT_ID}/${season}/${year}`);
        scheduleTableBody.innerHTML = '';
        if (scheduleData && scheduleData.length > 0) {
            scheduleData.forEach(section => {
                const row = scheduleTableBody.insertRow();
                row.innerHTML = `
                    <td>${section.CourseCode}</td>
                    <td>${section.CourseTitle}</td>
                    <td>${section.SectionID}</td>
                    <td>${section.StartTime}-${section.EndTime}</td>
                    <td>${section.DayOfWeek}</td>
                    <td>${section.FacultyName || 'N/A'}</td>
                    <td>${section.RoomNumber || 'N/A'}</td>
                `;
            });
        } else {
            scheduleTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No courses scheduled for this semester.</td></tr>';
        }
    };

    semesterSelect.addEventListener('change', displayStudentSchedule);
    await fetchAndPopulateSemesters();
};

studentPageInitializers.initStudentNewEnrollment = async function () {
    const semesterSelect = document.getElementById('enrollment-semester-select');
    const availableSectionsTableBody = document.querySelector('#available-sections-table tbody');
    if (!semesterSelect || !availableSectionsTableBody) return;

    let allSemesters = [];

    const fetchAndPopulateSemesters = async () => {
        // Fetch all available semesters (not just student's enrolled ones)
        allSemesters = await fetchData('/semesters'); 
        if (allSemesters && allSemesters.length > 0) {
            semesterSelect.innerHTML = allSemesters.map(sem => `<option value="${sem.Season}${sem.Year}">${sem.Season} ${sem.Year}</option>`).join('');
            // Set default to the most recent semester if available
            semesterSelect.value = `${allSemesters[0].Season}${allSemesters[0].Year}`; 
            await displayAvailableSections();
        } else {
            semesterSelect.innerHTML = '<option value="">No semesters available</option>';
            availableSectionsTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No sections available for enrollment.</td></tr>';
        }
    };

    const displayAvailableSections = async () => {
        const selectedSemesterString = semesterSelect.value;
        if (!selectedSemesterString || selectedSemesterString === "") { // Check for empty value as well
            availableSectionsTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">Please select a semester.</td></tr>';
            return;
        }

        const season = selectedSemesterString.slice(0, -4);
        const year = selectedSemesterString.slice(-4);

        const availableSections = await fetchData(`/sections-for-student-enrollment-view/${season}/${year}`);
        availableSectionsTableBody.innerHTML = '';

        if (availableSections && availableSections.length > 0) {
            let foundNewSections = false;
            for (const section of availableSections) {
                // Check if student is already enrolled in this section
                const isEnrolledCheck = await fetchData(`/enrollment/is-enrolled/${STUDENT_ID}/${section.SectionID}`);
                if (isEnrolledCheck && isEnrolledCheck.isEnrolled) {
                    continue; // Skip sections the student is already enrolled in
                }
                foundNewSections = true;
                const row = availableSectionsTableBody.insertRow();
                row.innerHTML = `
                    <td>${section.SectionID}</td>
                    <td>${section.CourseTitle} (${section.CourseCode})</td>
                    <td>${section.Season} ${section.Year}</td>
                    <td>${section.StartTime}-${section.EndTime}</td>
                    <td>${section.DayOfWeek}</td>
                    <td>${section.FacultyName || 'N/A'}</td>
                    <td class="action-buttons">
                        <button class="enroll-button" onclick="studentPageInitializers.enrollStudentAction('${section.SectionID}')">Enroll</button>
                    </td>
                `;
            }
            if (!foundNewSections) {
                 availableSectionsTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No new sections available for enrollment in this semester.</td></tr>';
            }
        } else {
            availableSectionsTableBody.innerHTML = '<tr><td colspan="7" class="loading-message">No sections found for this semester.</td></tr>';
        }
    };

    semesterSelect.addEventListener('change', displayAvailableSections);
    await fetchAndPopulateSemesters();
};

// Moved to studentPageInitializers for consistency
studentPageInitializers.enrollStudentAction = async function (sectionId) {
    const studentIdToEnroll = STUDENT_ID;

    const studentInfo = await fetchData(`/student-info-for-enrollment/${studentIdToEnroll}`);
    if (!studentInfo || !studentInfo.DepartmentID) {
        showMessageBox('Enrollment Error', 'Could not retrieve student department for eligibility check.');
        return;
    }
    const studentDeptId = studentInfo.DepartmentID;

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
            showMessageBox('Enrollment Failed', "Your department does not match the course department, and this course is not an elective.");
            return;
        }

        let capacityMessage = "";
        if (currentEnrollmentCount >= classroomCapacity) {
            capacityMessage = `\nWARNING: Class capacity (${classroomCapacity}) reached or exceeded (current: ${currentEnrollmentCount}).`;
            showMessageBox('Capacity Alert', `Class is full! ${capacityMessage}\nYou will still be enrolled.`, 'warning');
        } else if (currentEnrollmentCount + 1 > classroomCapacity) {
            capacityMessage = `\nWARNING: Enrolling will exceed class capacity (${classroomCapacity}).`;
            showMessageBox('Capacity Alert', `Enrolling will make class full! ${capacityMessage}\nYou will still be enrolled.`, 'warning');
        }

        showMessageBox('Confirm Enrollment', `Are you sure you want to enroll in Section ${sectionId}?${capacityMessage}`, 'confirm', async (confirmed) => {
            if (confirmed) {
                try {
                    await sendData('/enrollment', 'POST', { StudentID: studentIdToEnroll, SectionID: sectionId, Grade: 'Ungraded' });
                    showMessageBox('Success', `Successfully enrolled in Section ${sectionId}! ${capacityMessage}`);
                    await studentPageInitializers.initStudentNewEnrollment(); // Refresh the list of available sections
                } catch (error) {
                    if (error.message.includes('Duplicate entry')) {
                        showMessageBox('Enrollment Error', 'You are already enrolled in this section.');
                    } else {
                        // Error message already displayed by sendData
                    }
                }
            }
        });

    } catch (error) {
        showMessageBox('Application Error', 'An unexpected error occurred during enrollment validation.');
    }
};


studentPageInitializers.initStudentGradeReports = async function () {
    const gradesTableBody = document.querySelector('#student-grades-table tbody');
    const gradesChartContainer = document.getElementById('grades-chart-container');
    const gradesChartCanvas = document.getElementById('gradesChart'); // Reference to the canvas element
    const gradesViewSelect = document.getElementById('grades-view-select');

    // myGradesChartInstance is global, no need to declare again here.

    if (!gradesTableBody || !gradesChartContainer || !gradesChartCanvas || !gradesViewSelect) {
        console.error("Grade reports elements not found.");
        return;
    }

    const fetchAndDisplayGrades = async () => {
        const gradeData = await fetchData(`/enrollments/student/${STUDENT_ID}`);
        if (gradeData) {
            populateGradesTable(gradeData);
            if (gradesViewSelect.value === 'Graph') {
                showGradesGraph(gradeData);
                gradesChartContainer.classList.remove('hidden'); // Show chart container
            } else {
                if (myGradesChartInstance) {
                    myGradesChartInstance.destroy();
                    myGradesChartInstance = null;
                }
                gradesChartContainer.classList.add('hidden'); // Hide chart container
            }
        } else {
            gradesTableBody.innerHTML = '<tr><td colspan="4" class="loading-message">No grades found.</td></tr>';
            gradesChartContainer.classList.add('hidden');
        }
    };

    const populateGradesTable = (grades) => {
        gradesTableBody.innerHTML = '';
        if (grades.length === 0) {
            gradesTableBody.innerHTML = '<tr><td colspan="4" class="loading-message">No grades to display.</td></tr>';
            return;
        }
        grades.forEach(grade => {
            const row = gradesTableBody.insertRow();
            row.innerHTML = `
                <td>${grade.CourseCode}</td>
                <td>${grade.Title}</td>
                <td>${grade.SectionID}</td>
                <td>${grade.Grade || 'Ungraded'}</td>
            `;
        });
    };

    const showGradesGraph = (grades) => {
        // Ensure data is not empty before proceeding with chart rendering
        if (!grades || grades.length === 0) {
            gradesChartContainer.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title">No Data for Graph</h3>
                    <p class="welcome-text">No grades available to generate a graph.</p>
                </div>
            `;
            // Ensure the canvas is hidden if no data
            gradesChartContainer.classList.add('hidden');
            return;
        }

        // Destroy existing chart instance if any, before creating a new one
        if (myGradesChartInstance) {
            myGradesChartInstance.destroy();
            myGradesChartInstance = null;
        }

        // Get the current canvas element. If it exists, replace it to ensure a clean slate.
        // This addresses the "Canvas element 'myChart' not found" type of error.
        let currentGradesCanvas = document.getElementById('gradesChart');
        if (currentGradesCanvas) {
            const oldCanvas = currentGradesCanvas;
            const newCanvas = document.createElement('canvas');
            newCanvas.id = 'gradesChart';
            // Set width and height to be responsive
            newCanvas.style.width = '100%';
            newCanvas.style.height = '100%';
            oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
            currentGradesCanvas = newCanvas; // Update reference to the new canvas
        } else {
             // If canvas somehow wasn't found initially, try creating it directly
             currentGradesCanvas = document.createElement('canvas');
             currentGradesCanvas.id = 'gradesChart';
             currentGradesCanvas.style.width = '100%';
             currentGradesCanvas.style.height = '100%';
             gradesChartContainer.appendChild(currentGradesCanvas);
        }
        
        if (!currentGradesCanvas) {
            console.error("Failed to get or create canvas element 'gradesChart' for charting.");
            gradesChartContainer.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title error-title">Chart Error</h3>
                    <p class="welcome-text">Could not prepare canvas for charting.</p>
                </div>
            `;
            return;
        }

        const ctx = currentGradesCanvas.getContext('2d');
        if (!ctx) {
             console.error("Failed to get 2D context from grades canvas.");
             gradesChartContainer.innerHTML = `
                <div class="welcome-content">
                    <h3 class="welcome-title error-title">Chart Error</h3>
                    <p class="welcome-text">Could not get 2D rendering context from canvas.</p>
                </div>
            `;
            return;
        }

        gradesChartContainer.classList.remove('hidden'); // Ensure chart container is visible

        const gradeCounts = {};
        const gradePointMap = {
            'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
            'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0.0
        };
        let totalPoints = 0;
        let totalCourses = 0;

        grades.forEach(g => {
            const gradeLetter = (g.Grade || '').trim().toUpperCase();
            if (gradeLetter && gradeLetter !== 'UNGRADED') {
                gradeCounts[gradeLetter] = (gradeCounts[gradeLetter] || 0) + 1;
                if (gradePointMap.hasOwnProperty(gradeLetter)) {
                    totalPoints += gradePointMap[gradeLetter];
                    totalCourses++;
                }
            }
        });

        const gpa = totalCourses > 0 ? (totalPoints / totalCourses).toFixed(2) : 'N/A';

        const labels = Object.keys(gradeCounts).sort((a, b) => {
            const order = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
            return order.indexOf(a) - order.indexOf(b);
        });
        const dataValues = labels.map(label => gradeCounts[label]);

        myGradesChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Number of Courses',
                    data: dataValues,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: `Grade Distribution (Overall GPA: ${gpa})`
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        },
                        title: { display: true, text: 'Count' }
                    },
                    x: {
                        title: { display: true, text: 'Grade' }
                    }
                }
            }
        });
    };

    gradesViewSelect.addEventListener('change', fetchAndDisplayGrades);
    await fetchAndDisplayGrades();
};


// --- Main Student Navigation Handler (Called by DOMContentLoaded event listeners) ---
/**
 * Handles student navigation menu selections.
 * @param {string} menuOption - 'profile', 'schedules', 'enrollment', 'grades'.
 */
function handleStudentMenu(menuOption) {
    switch (menuOption) {
        case 'profile':
            loadStudentPage('student_profile.html', 'initStudentProfile');
            break;
        case 'schedules':
            loadStudentPage('student_schedules.html', 'initStudentSchedules');
            break;
        case 'enrollment':
            loadStudentPage('student_new_enrollment.html', 'initStudentNewEnrollment');
            break;
        case 'grades':
            loadStudentPage('student_grade_reports.html', 'initStudentGradeReports');
            break;
        default:
            console.warn(`Unknown student menu option: ${menuOption}`);
            break;
    }
}


// --- Authentication Check and Event Listener Attachment on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    loggedInUser = JSON.parse(localStorage.getItem('loggedInUser'));

    if (!loggedInUser || loggedInUser.Role !== 'student') {
        window.location.href = 'login.html';
        return;
    }

    STUDENT_ID = loggedInUser.StudentID;

    if (!STUDENT_ID) {
        showMessageBox('Authentication Error', 'Student ID not found for this user. Please contact support.', 'error', () => {
            localStorage.removeItem('loggedInUser');
            window.location.href = 'login.html';
        });
        return;
    }

    const welcomeMessageElement = document.getElementById('student-welcome-message');
    if (welcomeMessageElement) {
        welcomeMessageElement.textContent = `Welcome, ${loggedInUser.UserID}!`;
    }

    // Attach event listeners to navigation buttons
    // Using event delegation or direct event listeners as needed
    // The existing onclick attributes in student_dashboard.html are fine,
    // but adding explicit listeners here makes the JS more self-contained.
    const profileButton = document.querySelector('.menu-button[onclick*="\'profile\'"]');
    if (profileButton) profileButton.addEventListener('click', () => handleStudentMenu('profile'));

    const schedulesButton = document.querySelector('.menu-button[onclick*="\'schedules\'"]');
    if (schedulesButton) schedulesButton.addEventListener('click', () => handleStudentMenu('schedules'));

    const enrollmentButton = document.querySelector('.menu-button[onclick*="\'enrollment\'"]');
    if (enrollmentButton) enrollmentButton.addEventListener('click', () => handleStudentMenu('enrollment'));

    const gradesButton = document.querySelector('.menu-button[onclick*="\'grades\'"]');
    if (gradesButton) gradesButton.addEventListener('click', () => handleStudentMenu('grades'));

    const logoutButton = document.querySelector('.bottom-buttons .logout-button');
    if (logoutButton) logoutButton.addEventListener('click', studentLogout);

    // Load initial content (e.g., profile)
    handleStudentMenu('profile');
});
