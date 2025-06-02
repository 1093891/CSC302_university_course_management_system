
/*
login page script
This script handles the login functionality for the client-side application.
**/    

document.addEventListener('DOMContentLoaded', () => {
        //alert('Client page loaded');
    });
    document.getElementById('loginForm').addEventListener('submit', function(event) {
        event.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        const userData = async () => {
            try {
                // CORRECTED: Changed port from 3000 to 8080 to match Express server
                const response = await fetch('http://localhost:8080/api/user', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                console.log('Fetching user data...');
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return await response.json();
            } catch (error) {
                console.error('There has been a problem with your fetch operation:', error);
                // You might want to display an error message to the user here as well
                document.getElementById('errorMessage').textContent = 'Error fetching user data from server.';
                document.getElementById('errorMessage').style.display = 'block';
                document.getElementById('successMessage').textContent = '';
            }
        };

        userData().then(data => {
            console.log(data);
            // NOW, use the 'data' fetched from the API for validation
            const foundUser = data.find(user => user.UserID == username && user.Password == password); // Assuming UserID and Password keys
            
            if (foundUser) {
                const successMessage = document.getElementById('successMessage');
                successMessage.style.display = 'block';
                successMessage.style.color = 'green';
                document.getElementById('successMessage').textContent = `Login successful for ${foundUser.Role}!`;
                document.getElementById('errorMessage').textContent = '';

                // Implement redirection based on role
                // This would typically involve client-side routing or navigating to new HTML pages
                if(foundUser.Role === 'student') {
                    // Example: window.location.href = `/student-dashboard.html?id=${foundUser.StudentID}`;
                    console.log(`Redirecting to student dashboard for ID: ${foundUser.StudentID}`);
                } else if (foundUser.Role === 'faculty') {
                    // Example: window.location.href = `/faculty-dashboard.html?id=${foundUser.FacultyID}`;
                    console.log(`Redirecting to faculty dashboard for ID: ${foundUser.FacultyID}`);
                } else if (foundUser.Role === 'admin') {
                     window.location.href = `./doc_html/admin/admin-dashboard.html`;
                    console.log('Redirecting to admin dashboard');
                }
            } else {
                document.getElementById('errorMessage').textContent = 'Invalid username or password.';
                document.getElementById('errorMessage').style.display = 'block';
                document.getElementById('successMessage').textContent = '';
            }

        });

        document.getElementById('resetButton').addEventListener('click', function() {
            document.getElementById('loginForm').reset();
            document.getElementById('errorMessage').textContent = '';
            document.getElementById('errorMessage').style.display = 'none'; // Hide error message
            document.getElementById('successMessage').textContent = '';
            document.getElementById('successMessage').style.display = 'none'; // Hide success message
        });
    });
