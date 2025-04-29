<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', 'php_errors.log');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

if ($conn->connect_error) {
    error_log("Database connection failed: " . $conn->connect_error);
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Connection failed: " . $conn->connect_error]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("Raw input: " . file_get_contents("php://input"));

    $user_id = $data["user_id"] ?? null;

    if (!$user_id) {
        error_log("No user_id provided");
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "user_id is required"]);
        exit();
    }

    error_log("Logout request for user_id: $user_id");

    // Fetch username from UserAccounts table
    $stmt = $conn->prepare("SELECT Username FROM UserAccounts WHERE UserID = ?");
    if (!$stmt) {
        error_log("Prepare failed for SELECT: " . $conn->error);
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Prepare failed: " . $conn->error]);
        exit();
    }
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();

    if (!$user || !$user['Username']) {
        error_log("User not found for UserID: $user_id");
        http_response_code(404);
        echo json_encode(["success" => false, "error" => "User not found for UserID: $user_id"]);
        exit();
    }

    $username = $user['Username'];
    $activity_description = "$username has logged out.";
    error_log("Prepared description: $activity_description");

    // Insert into user_activity_logs
    $logStmt = $conn->prepare("
        INSERT INTO user_activity_logs (
            user_id, activity_type, activity_description
        ) VALUES (?, 'LOGOUT', ?)
    ");
    if (!$logStmt) {
        error_log("Prepare failed for INSERT: " . $conn->error);
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Prepare failed: " . $conn->error]);
        exit();
    }
    $logStmt->bind_param("is", $user_id, $activity_description);
    error_log("Parameters bound: user_id=$user_id, description=$activity_description");

    if ($logStmt->execute()) {
        error_log("Logout logged successfully for $username");
        http_response_code(201);
        echo json_encode(["success" => true]);
    } else {
        $error = $logStmt->error;
        error_log("Logout insert failed: $error");
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Failed to log logout: $error"]);
    }
    $logStmt->close();
} else {
    error_log("Invalid method: " . $_SERVER['REQUEST_METHOD']);
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not supported. Use POST."]);
}

$conn->close();
?>