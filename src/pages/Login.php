<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

session_start();
include("Loginconfig.php");

$error = "";

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    $username = trim($data['username']);
    $password = trim($data['password']);

    if (!empty($username) && !empty($password)) {
        $sql = "SELECT UserID, Username, Role, Password FROM useraccounts WHERE Username = ?";
        $stmt = $conn->prepare($sql);

        if ($stmt) {
            $stmt->bind_param("s", $username);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows === 1) {
                $row = $result->fetch_assoc();
                $stored_password = $row['Password'];
                $role = $row['Role'];
                $userID = $row['UserID'];
                $loggedUsername = $row['Username']; // Use this for consistency

                if (password_verify($password, $stored_password)) {
                    $_SESSION['loggedin'] = true;
                    $_SESSION['UserID'] = $userID;
                    $_SESSION['username'] = $loggedUsername;
                    $_SESSION['role'] = $role;

                    $activity_description = "$loggedUsername logged in";

                    $log_stmt = $conn->prepare("
                        INSERT INTO user_activity_logs (
                            user_id, activity_type, activity_description
                        ) VALUES (?, 'LOGIN', ?)
                    ");
                    if (!$log_stmt) {
                        $error = "Failed to prepare log statement: " . $conn->error;
                    } else {
                        $log_stmt->bind_param("is", $userID, $activity_description);
                        if ($log_stmt->execute()) {
                            $log_stmt->close();
                            echo json_encode([
                                'success' => true,
                                'role' => $role,
                                'userID' => $userID
                            ]);
                            exit();
                        } else {
                            $error = "Failed to log login: " . $log_stmt->error;
                            $log_stmt->close();
                        }
                    }
                } else {
                    $error = "Invalid username or password.";
                }
            } else {
                $error = "Username does not exist.";
            }

            $stmt->close();
        } else {
            $error = "Database error: Failed to prepare statement.";
        }
    } else {
        $error = "Username and password are required.";
    }
} else {
    $error = "Invalid request method.";
}

echo json_encode([
    'success' => false,
    'error' => $error,
]);

$conn->close();
?>