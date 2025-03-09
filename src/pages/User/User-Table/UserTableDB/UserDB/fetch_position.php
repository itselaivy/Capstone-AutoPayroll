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
    header("HTTP/1.1 200 OK");
    exit();
}

$servername = "localhost";
$dbusername = "root";
$dbpassword = ""; // Ensure this is correct
$dbname = "autopayrolldb"; // Ensure this is correct

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method == "GET") {
    $sql = "SELECT PositionID AS `key`, PositionTitle, RatePerHour FROM Positions"; // Fetch data from Positions table
    error_log("GET Query: " . $sql); // Log the SQL query
    $result = $conn->query($sql);

    if ($result) {
        $positions = [];
        while ($row = $result->fetch_assoc()) {
            $positions[] = $row;
        }
        http_response_code(200); // OK
        echo json_encode($positions);
    } else {
        http_response_code(500); // Internal Server Error
        echo json_encode(["error" => "Failed to fetch positions: " . $conn->error]);
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("POST Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["PositionTitle"]) && !empty($data["RatePerHour"])) { // Check for correct fields
        $stmt = $conn->prepare("INSERT INTO Positions (PositionTitle, RatePerHour) VALUES (?, ?)"); // Insert into Positions table
        $stmt->bind_param("sd", $data["PositionTitle"], $data["RatePerHour"]); // Bind parameters

        if ($stmt->execute()) {
            http_response_code(201); // Created
            echo json_encode(["success" => "Position added"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to add position: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Position Title and Rate Per Hour are required"]);
    }

} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("Received Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["PositionID"]) && !empty($data["PositionTitle"]) && !empty($data["RatePerHour"])) {
        $stmt = $conn->prepare("UPDATE positions SET PositionTitle = ?, RatePerHour = ? WHERE PositionID = ?");
        $stmt->bind_param("sdi", $data["PositionTitle"], $data["RatePerHour"], $data["PositionID"]);

        if ($stmt->execute()) {
            http_response_code(200); // OK
            echo json_encode(["success" => "Position updated"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to update position: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Position ID, Position Title, and Rate Per Hour are required"]);
    }

} elseif ($method == "DELETE") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("DELETE Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["positionID"])) {
        $stmt = $conn->prepare("DELETE FROM positions WHERE PositionID = ?");
        $stmt->bind_param("i", $data["positionID"]);

        if ($stmt->execute()) {
            http_response_code(200); // OK
            echo json_encode(["success" => "Position deleted"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to delete position: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Position ID is required"]);
    }
}

$conn->close();
?>