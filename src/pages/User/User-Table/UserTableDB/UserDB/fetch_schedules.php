<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Allow requests from any origin
header("Access-Control-Allow-Origin: *");
// Allow specific HTTP methods
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
// Allow specific headers
header("Access-Control-Allow-Headers: Content-Type");
// Set response content type to JSON
header("Content-Type: application/json");

// Handle preflight requests
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
    http_response_code(500);
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

// Helper function to log activity
function logActivity($conn, $userId, $activityType, $affectedTable, $affectedRecordId, $description) {
    $stmt = $conn->prepare(
        "INSERT INTO user_activity_logs (user_id, activity_type, affected_table, affected_record_id, activity_description, created_at) 
        VALUES (?, ?, ?, ?, ?, NOW())"
    );
    $stmt->bind_param("issis", $userId, $activityType, $affectedTable, $affectedRecordId, $description);
    if (!$stmt->execute()) {
        error_log("Failed to log activity: " . $stmt->error);
    }
    $stmt->close();
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method == "GET") {
    $sql = "SELECT ScheduleID AS `key`, ShiftStart, ShiftEnd FROM schedules";
    $result = $conn->query($sql);

    if ($result) {
        $schedules = [];
        while ($row = $result->fetch_assoc()) {
            // Ensure times are in HH:mm format
            $row['ShiftStart'] = date("H:i", strtotime($row['ShiftStart']));
            $row['ShiftEnd'] = date("H:i", strtotime($row['ShiftEnd']));
            $schedules[] = $row;
        }
        http_response_code(200);
        echo json_encode($schedules);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to fetch schedules: " . $conn->error]);
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("POST Data: " . print_r($data, true));

    if (!isset($data["shiftStart"]) || empty($data["shiftStart"]) ||
        !isset($data["shiftEnd"]) || empty($data["shiftEnd"]) ||
        !isset($data["user_id"]) || empty($data["user_id"])) {
        http_response_code(400);
        echo json_encode(["error" => "Shift Start, Shift End, and user_id are required"]);
        exit();
    }

    // Validate HH:mm format
    if (!preg_match("/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/", $data["shiftStart"]) ||
        !preg_match("/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/", $data["shiftEnd"])) {
        http_response_code(400);
        echo json_encode(["error" => "Shift Start and Shift End must be in HH:mm format"]);
        exit();
    }

    $stmt = $conn->prepare("INSERT INTO schedules (ShiftStart, ShiftEnd) VALUES (?, ?)");
    $stmt->bind_param("ss", $data["shiftStart"], $data["shiftEnd"]);

    if ($stmt->execute()) {
        $scheduleId = $conn->insert_id;
        // Log activity
        $description = "Added schedule '{$data["shiftStart"]}-{$data["shiftEnd"]}'";
        logActivity($conn, $data["user_id"], "ADD_DATA", "Schedules", $scheduleId, $description);
        http_response_code(201);
        echo json_encode(["success" => "Schedule added"]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to add schedule: " . $stmt->error]);
    }
    $stmt->close();
} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("PUT Data: " . print_r($data, true));

    if (!isset($data["scheduleID"]) || empty($data["scheduleID"]) ||
        !isset($data["shiftStart"]) || empty($data["shiftStart"]) ||
        !isset($data["shiftEnd"]) || empty($data["shiftEnd"]) ||
        !isset($data["user_id"]) || empty($data["user_id"])) {
        http_response_code(400);
        echo json_encode(["error" => "Schedule ID, Shift Start, Shift End, and user_id are required"]);
        exit();
    }

    // Validate HH:mm format
    if (!preg_match("/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/", $data["shiftStart"]) ||
        !preg_match("/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/", $data["shiftEnd"])) {
        http_response_code(400);
        echo json_encode(["error" => "Shift Start and Shift End must be in HH:mm format"]);
        exit();
    }

    // Fetch current schedule for logging changes
    $stmt = $conn->prepare("SELECT ShiftStart, ShiftEnd FROM schedules WHERE ScheduleID = ?");
    $stmt->bind_param("i", $data["scheduleID"]);
    $stmt->execute();
    $result = $stmt->get_result();
    $currentSchedule = $result->num_rows > 0 ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$currentSchedule) {
        http_response_code(404);
        echo json_encode(["error" => "Schedule not found"]);
        exit();
    }

    // Prepare changes for logging
    $changes = [];
    if ($currentSchedule["ShiftStart"] != $data["shiftStart"]) {
        $changes[] = "ShiftStart from '{$currentSchedule["ShiftStart"]}' to '{$data["shiftStart"]}'";
    }
    if ($currentSchedule["ShiftEnd"] != $data["shiftEnd"]) {
        $changes[] = "ShiftEnd from '{$currentSchedule["ShiftEnd"]}' to '{$data["shiftEnd"]}'";
    }
    $description = empty($changes)
        ? "Updated schedule '{$data["shiftStart"]}-{$data["shiftEnd"]}': No changes made"
        : "Updated schedule '{$data["shiftStart"]}-{$data["shiftEnd"]}': " . implode(', ', $changes);

    $stmt = $conn->prepare("UPDATE schedules SET ShiftStart = ?, ShiftEnd = ? WHERE ScheduleID = ?");
    $stmt->bind_param("ssi", $data["shiftStart"], $data["shiftEnd"], $data["scheduleID"]);

    if ($stmt->execute()) {
        // Log activity
        logActivity($conn, $data["user_id"], "UPDATE_DATA", "Schedules", $data["scheduleID"], $description);
        http_response_code(200);
        echo json_encode(["success" => "Schedule updated"]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to update schedule: " . $stmt->error]);
    }
    $stmt->close();
} elseif ($method == "DELETE") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("DELETE Data: " . print_r($data, true));

    if (!isset($data["scheduleID"]) || empty($data["scheduleID"]) ||
        !isset($data["user_id"]) || empty($data["user_id"])) {
        http_response_code(400);
        echo json_encode(["error" => "Schedule ID and user_id are required"]);
        exit();
    }

    // Fetch schedule details for logging
    $stmt = $conn->prepare("SELECT ShiftStart, ShiftEnd FROM schedules WHERE ScheduleID = ?");
    $stmt->bind_param("i", $data["scheduleID"]);
    $stmt->execute();
    $result = $stmt->get_result();
    $schedule = $result->num_rows > 0 ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$schedule) {
        http_response_code(404);
        echo json_encode(["error" => "Schedule not found"]);
        exit();
    }

    $stmt = $conn->prepare("DELETE FROM schedules WHERE ScheduleID = ?");
    $stmt->bind_param("i", $data["scheduleID"]);

    if ($stmt->execute()) {
        // Log activity
        $description = "Deleted schedule '{$schedule["ShiftStart"]}-{$schedule["ShiftEnd"]}'";
        logActivity($conn, $data["user_id"], "DELETE_DATA", "Schedules", $data["scheduleID"], $description);
        http_response_code(200);
        echo json_encode(["success" => "Schedule deleted"]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to delete schedule: " . $stmt->error]);
    }
    $stmt->close();
}

$conn->close();
?>