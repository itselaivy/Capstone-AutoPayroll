<?php
ob_start(); // Prevent header issues
session_start();

// Include database configuration
include("config/config.php");

$error = ""; // Default empty error message

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $email = trim($_POST['email']);
    $password = trim($_POST['password']);

    if (!empty($email) && !empty($password)) {
        // Check if the email exists in the database
        $sql = "SELECT UserID, Email, Role, Password FROM useraccountmanagement WHERE Email = ?";
        $stmt = $conn->prepare($sql);

        if ($stmt) {
            $stmt->bind_param("s", $email);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows == 1) {
                // Fetch user data
                $row = $result->fetch_assoc();
                $stored_password = $row['Password'];
                $role = $row['Role'];

                // Check if the password matches (plain text comparison for now)
                if ($password === $stored_password) { 
                    // Set session variables
                    $_SESSION['loggedin'] = true;
                    $_SESSION['UserID'] = $row['UserID'];
                    $_SESSION['email'] = $row['Email'];
                    $_SESSION['role'] = $role;

                    // Redirect based on role
                    if ($role === 'Payroll Admin') {
                        header("Location: manage/user_dashboard.php"); 
                        exit();
                    } else {
                        header("Location: dashboard.php"); 
                        exit();
                    }
                } else {
                    $error = "Invalid email or password.";
                }
            } else {
                $error = "Email does not exist.";
            }

            // Close connections
            $stmt->close();
        } else {
            $error = "Database error: Failed to prepare statement.";
        }
    } else {
        $error = "Email and password are required.";
    }
}

// Close database connection
$conn->close();
ob_end_flush(); // Flush the output buffer
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <link rel="stylesheet" href="css/styles.css"/>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login</title>
    <script>
        document.addEventListener("DOMContentLoaded", function() {
            setTimeout(function() {
                let errorDiv = document.getElementById("error-message");
                if (errorDiv) {
                    errorDiv.classList.add("fade-out"); 
                    setTimeout(() => {
                        errorDiv.style.display = "none"; 
                    }, 500); 
                }
            }, 5000); 
        });
    </script>
</head>
<body>

    <div class="container">
        <div class="box form-box">
            <header>Login to your Account</header>

            <form action="<?php echo htmlspecialchars($_SERVER['PHP_SELF']); ?>" method="post">
                <div class="field input">
                    <label for="email">Email<span style="color: red;">*</span></label>
                    <input type="email" name="email" id="email" placeholder="Enter your Email" autocomplete="off" required>
                </div>

                <div class="field input">
                    <label for="password">Password<span style="color: red;">*</span></label>
                    <input type="password" name="password" id="password" placeholder="Enter your Password" autocomplete="off" required>
                </div>

                <div class="links">
                    <a href="register.php">Forgot Password?</a>
                </div>

                <div class="field">
                    <input type="submit" class="btn" name="submit" value="Login">
                </div>
            </form>

            <!-- Display error message only if a login attempt was made -->
            <?php if ($_SERVER["REQUEST_METHOD"] == "POST" && !empty($error)): ?>
                <div id="error-message" class="error-message" style="color: red; font-weight: bold;">
                    <p><?php echo htmlspecialchars($error); ?></p>
                </div>
            <?php endif; ?>
        </div>
    </div>

</body>
</html>