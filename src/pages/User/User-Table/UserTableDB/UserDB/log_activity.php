<?php
// Enable CORS for all origins
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database connection details
$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

// Create connection
$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
if ($conn->connect_error) {
    http_response_code(500);
    error_log("Connection failed: " . $conn->connect_error);
    echo json_encode(["error" => "Connection failed: " . $conn->connect_error]);
    exit();
}

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
if (!$input || !isset($input['user_id'], $input['activity_type'], $input['affected_table'])) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid or missing input data"]);
    $conn->close();
    exit();
}

// Validate user_id
$user_id = (int)$input['user_id'];
if ($user_id <= 0) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid user_id"]);
    $conn->close();
    exit();
}

// Validate activity_type
$valid_activities = ['LOGIN', 'LOGOUT', 'UPDATE_DATA', 'UPLOAD_DATA', 'DELETE_DATA', 'ADD_DATA', 'GENERATE_DATA'];
$activity_type = $input['activity_type'];
if (!in_array($activity_type, $valid_activities)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid activity_type"]);
    $conn->close();
    exit();
}

// Validate affected_table
$valid_tables = ['Employees', 'Payroll', 'Branches', 'Attendance', 'UserAccounts', 'PayrollRecords'];
$affected_table = $input['affected_table'];
if (!in_array($affected_table, $valid_tables)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid affected_table"]);
    $conn->close();
    exit();
}

// Prepare data
$affected_record_id = isset($input['affected_record_id']) ? ($input['affected_record_id'] !== null ? (int)$input['affected_record_id'] : null) : null;
$activity_description = isset($input['activity_description']) ? $input['activity_description'] : null;

// Validate activity_description
if ($activity_description !== null) {
    // Check size (TEXT limit is 65,535 bytes in utf8mb4)
    if (strlen($activity_description) > 65535) {
        http_response_code(400);
        echo json_encode(["error" => "Activity description exceeds maximum length"]);
        $conn->close();
        exit();
    }
    // Validate JSON if it appears to be JSON
    if (preg_match('/^\{.*\}$/', $activity_description) && json_decode($activity_description) === null) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid JSON in activity_description"]);
        $conn->close();
        exit();
    }
}

// Insert log
$stmt = $conn->prepare("INSERT INTO user_activity_logs (user_id, activity_type, affected_table, affected_record_id, activity_description) VALUES (?, ?, ?, ?, ?)");
if (!$stmt) {
    http_response_code(500);
    error_log("Prepare failed: " . $conn->error);
    echo json_encode(["error" => "Prepare failed: " . $conn->error]);
    $conn->close();
    exit();
}
$stmt->bind_param("issis", $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description);

if ($stmt->execute()) {
    echo json_encode(["success" => true]);
} else {
    http_response_code(500);
    error_log("Failed to log activity: " . $stmt->error);
    echo json_encode(["error" => "Failed to log activity: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>