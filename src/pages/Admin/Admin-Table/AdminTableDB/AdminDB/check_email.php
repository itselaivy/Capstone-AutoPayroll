<?php
// Enable reporting of all PHP errors
error_reporting(E_ALL);
// Disable displaying errors in the output
ini_set('display_errors', 0);
// Enable logging of errors to a file
ini_set('log_errors', 1);
// Specify the file where errors will be logged
ini_set('error_log', 'php_errors.log');

// Set header to allow cross-origin requests from any domain
header("Access-Control-Allow-Origin: *");
// Set header to allow GET, POST, PUT, DELETE, and OPTIONS requests
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
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
    // Log the connection error to the error log file
    error_log("Connection failed: " . $conn->connect_error);
    // Set HTTP response code to 500 (Internal Server Error)
    http_response_code(500);
    // Output a JSON-encoded error message with the connection error details
    echo json_encode(["success" => false, "error" => "Connection failed: " . $conn->connect_error]);
    // Terminate script execution
    exit();
}

$email = $_GET['email'];
$stmt = $conn->prepare("SELECT COUNT(*) FROM UserAccounts WHERE LOWER(email) = LOWER(?)");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->bind_result($count);
$stmt->fetch();
$stmt->close();
$conn->close();

echo json_encode(["exists" => $count > 0]);
?>