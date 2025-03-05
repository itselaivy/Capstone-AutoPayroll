<?php
error_reporting(E_ALL); // Report all PHP errors
ini_set('display_errors', 1); // Display errors

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
    // Return HTTP 200 OK for preflight requests
    http_response_code(200);
    exit();
}

$servername = "localhost";
$dbusername = "root";
$dbpassword = ""; // Ensure this is correct
$dbname = "autopayrolldb"; // Ensure this is correct

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

if ($conn->connect_error) {
    http_response_code(500); // Internal Server Error
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method == "GET") {
    $sql = "SELECT ScheduleID AS `key`, TimeIn, TimeOut FROM schedules"; // Fix: Use correct table name
    $result = $conn->query($sql);

    if ($result) {
        $schedules = [];
        while ($row = $result->fetch_assoc()) {
            $schedules[] = $row;
        }
        http_response_code(200); // OK
        echo json_encode($schedules);
    } else {
        http_response_code(500); // Internal Server Error
        echo json_encode(["error" => "Failed to fetch schedules: " . $conn->error]);
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("POST Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["timeIn"]) && !empty($data["timeOut"])) { // Fix: Check for correct fields
        $stmt = $conn->prepare("INSERT INTO schedules (TimeIn, TimeOut) VALUES (?, ?)"); // Fix: Use correct table and fields
        $stmt->bind_param("ss", $data["timeIn"], $data["timeOut"]); // Fix: Bind two parameters

        if ($stmt->execute()) {
            http_response_code(201); // Created
            echo json_encode(["success" => "Schedule added"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to add schedule: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Time In and Time Out are required"]);
    }
} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("PUT Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["scheduleID"]) && !empty($data["timeIn"]) && !empty($data["timeOut"])) {
        $stmt = $conn->prepare("UPDATE schedules SET TimeIn = ?, TimeOut = ? WHERE ScheduleID = ?");
        $stmt->bind_param("ssi", $data["timeIn"], $data["timeOut"], $data["scheduleID"]);

        if ($stmt->execute()) {
            http_response_code(200); // OK
            echo json_encode(["success" => "Schedule updated"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to update schedule: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Schedule ID, Time In, and Time Out are required"]);
    }

} elseif ($method == "DELETE") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("DELETE Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["scheduleID"])) {
        $stmt = $conn->prepare("DELETE FROM schedules WHERE ScheduleID = ?");
        $stmt->bind_param("i", $data["scheduleID"]);

        if ($stmt->execute()) {
            http_response_code(200); // OK
            echo json_encode(["success" => "Schedule deleted"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to delete schedule: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Schedule ID is required"]);
    }
}

$conn->close();
?>