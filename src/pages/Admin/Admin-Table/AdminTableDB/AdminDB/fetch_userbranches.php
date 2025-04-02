<?php
// Set header to allow cross-origin requests from any domain
header("Access-Control-Allow-Origin: *");
// Set header to allow only GET requests
header("Access-Control-Allow-Methods: GET");
// Set header to specify that the response will be in JSON format
header("Content-Type: application/json");

// Create a new MySQLi connection object with server, username, password, and database name
$conn = new mysqli("localhost", "root", "", "autopayrolldb");
// Check if the database connection failed
if ($conn->connect_error) {
    // Set HTTP response code to 500 (Internal Server Error)
    http_response_code(500);
    // Output a JSON-encoded error message indicating connection failure
    echo json_encode(["success" => false, "error" => "Connection failed"]);
    // Terminate script execution
    exit();
}

// Execute a query to select BranchID and BranchName from the Branches table
$result = $conn->query("SELECT BranchID, BranchName FROM Branches");
// Fetch all rows from the query result as an associative array
$data = $result->fetch_all(MYSQLI_ASSOC);
// Output a JSON-encoded response with success flag and the fetched data
echo json_encode(["success" => true, "data" => $data]);
// Close the database connection
$conn->close();
?>