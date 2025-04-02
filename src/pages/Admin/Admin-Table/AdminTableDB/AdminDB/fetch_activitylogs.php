<?php
// Enable reporting of all PHP errors
error_reporting(E_ALL);
// Enable displaying errors in the output (for debugging)
ini_set('display_errors', 1);

// Set header to allow cross-origin requests from any domain
header("Access-Control-Allow-Origin: *");
// Set header to allow POST and OPTIONS requests
header("Access-Control-Allow-Methods: POST, OPTIONS");
// Set header to allow Content-Type header in requests
header("Access-Control-Allow-Headers: Content-Type");
// Set header to specify that the response will be in JSON format
header("Content-Type: application/json");

// Check if the request method is OPTIONS (pre-flight request for CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Set HTTP response code to 200 (OK) for pre-flight request
    http_response_code(200);
    // Terminate script execution
    exit();
}

// Define the database server name
$servername = "localhost";
// Define the database username
$dbusername = "root";
// Define the database password (empty in this case)
$dbpassword = "";
// Define the database name
$dbname = "autopayrolldb";

// Create a new MySQLi connection object with server, username, password, and database name
$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

// Check if the database connection failed
if ($conn->connect_error) {
    // Set HTTP response code to 500 (Internal Server Error)
    http_response_code(500);
    // Output a JSON-encoded error message with the connection error details
    echo json_encode(["error" => "Connection failed: " . $conn->connect_error]);
    // Terminate script execution
    exit();
}

// Check if the request method is POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Decode the JSON input from the request body into an associative array
    $data = json_decode(file_get_contents("php://input"), true);

    // Get the user_id from the input data, default to null if not set
    $user_id = $data["user_id"] ?? null;
    // Get the activity_type from the input data, default to null if not set
    $activity_type = $data["activity_type"] ?? null;
    // Get the affected_table from the input data, default to null if not set
    $affected_table = $data["affected_table"] ?? null;
    // Get the affected_record_id from the input data, default to null if not set
    $affected_record_id = $data["affected_record_id"] ?? null;
    // Get the activity_description from the input data, default to null if not set
    $activity_description = $data["activity_description"] ?? null;

    // Check if required fields (user_id and activity_type) are missing
    if (!$user_id || !$activity_type) {
        // Set HTTP response code to 400 (Bad Request)
        http_response_code(400);
        // Output a JSON-encoded error message indicating missing required fields
        echo json_encode(["error" => "user_id and activity_type are required"]);
        // Terminate script execution
        exit();
    }

    // Prepare an SQL statement to insert a new activity log
    $stmt = $conn->prepare("
        INSERT INTO user_activity_logs (
            user_id, 
            activity_type, 
            affected_table, 
            affected_record_id, 
            activity_description
        ) VALUES (?, ?, ?, ?, ?)
    ");
    // Bind parameters to the prepared statement (integer, string, string, integer, string)
    $stmt->bind_param("isssiss", $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description);

    // Execute the prepared statement and check if it succeeds
    if ($stmt->execute()) {
        // Set HTTP response code to 201 (Created)
        http_response_code(201);
        // Output a JSON-encoded success message
        echo json_encode(["success" => "Activity logged"]);
    } else {
        // Set HTTP response code to 500 (Internal Server Error)
        http_response_code(500);
        // Output a JSON-encoded error message with the execution error
        echo json_encode(["error" => "Failed to log activity: " . $stmt->error]);
    }
    // Close the prepared statement
    $stmt->close();
} else {
    // Set HTTP response code to 405 (Method Not Allowed)
    http_response_code(405);
    // Output a JSON-encoded error message indicating an unsupported method
    echo json_encode(["error" => "Method not supported. Use POST."]);
}

// Close the database connection
$conn->close();
?>