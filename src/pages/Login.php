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
        // Check if the username exists in the database
        $sql = "SELECT UserID, Username, Role, Password FROM useraccounts WHERE Username = ?";
        $stmt = $conn->prepare($sql);

        if ($stmt) {
            $stmt->bind_param("s", $username);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows === 1) {
                $row = $result->fetch_assoc();
                $stored_password = $row['Password']; // Hashed password from the database
                $role = $row['Role'];
                $userID = $row['UserID'];

                // Verify the entered password against the hashed password
                if (password_verify($password, $stored_password)) {
                    $_SESSION['loggedin'] = true;
                    $_SESSION['UserID'] = $userID;
                    $_SESSION['username'] = $row['Username'];
                    $_SESSION['role'] = $role;

                    echo json_encode([
                        'success' => true,
                        'role' => $role,
                        'userID' => $userID
                    ]);
                    exit();
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