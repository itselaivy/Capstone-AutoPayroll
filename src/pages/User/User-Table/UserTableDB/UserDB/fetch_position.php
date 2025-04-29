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
$dbpassword = "";
$dbname = "autopayrolldb";

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

$method = $_SERVER['REQUEST_METHOD'];

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

if ($method == "GET") {
    if (isset($_GET['check_duplicate']) && isset($_GET['PositionTitle'])) {
        // Check for duplicate PositionTitle
        $positionTitle = $_GET['PositionTitle'];
        $stmt = $conn->prepare("SELECT PositionID, PositionTitle FROM Positions WHERE PositionTitle = ?");
        $stmt->bind_param("s", $positionTitle);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows > 0) {
            $position = $result->fetch_assoc();
            http_response_code(200);
            echo json_encode(["exists" => true, "position" => $position]);
        } else {
            http_response_code(200);
            echo json_encode(["exists" => false]);
        }
        $stmt->close();
    } else {
        // Fetch all positions
        $sql = "SELECT PositionID AS `key`, PositionTitle, RatePerHour FROM Positions";
        error_log("GET Query: " . $sql);
        $result = $conn->query($sql);

        if ($result) {
            $positions = [];
            while ($row = $result->fetch_assoc()) {
                $positions[] = $row;
            }
            http_response_code(200);
            echo json_encode($positions);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Failed to fetch positions: " . $conn->error]);
        }
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("POST Data: " . print_r($data, true));

    if (!isset($data["PositionTitle"]) || trim($data["PositionTitle"]) === "" || 
        !isset($data["RatePerHour"]) || $data["RatePerHour"] === "" || 
        !isset($data["user_id"]) || $data["user_id"] === "") {
        http_response_code(400);
        echo json_encode(["error" => "Position Title, Rate Per Hour, and user_id are required and cannot be empty"]);
        exit();
    }

    // Check for duplicate PositionTitle
    $stmt = $conn->prepare("SELECT PositionID FROM Positions WHERE PositionTitle = ?");
    $stmt->bind_param("s", $data["PositionTitle"]);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows > 0) {
        http_response_code(400);
        echo json_encode(["error" => "A position with this title already exists"]);
        $stmt->close();
        exit();
    }
    $stmt->close();

    // Insert new position
    $stmt = $conn->prepare("INSERT INTO Positions (PositionTitle, RatePerHour) VALUES (?, ?)");
    $stmt->bind_param("sd", $data["PositionTitle"], $data["RatePerHour"]);
    if ($stmt->execute()) {
        $newPositionId = $conn->insert_id;
        // Log activity
        $description = "Added position '{$data["PositionTitle"]}' with rate ₱{$data["RatePerHour"]}";
        logActivity($conn, $data["user_id"], "ADD_DATA", "Positions", $newPositionId, $description);
        http_response_code(201);
        echo json_encode(["success" => "Position added"]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to add position: " . $stmt->error]);
    }
    $stmt->close();
} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("PUT Data: " . print_r($data, true));

    if (!isset($data["PositionID"]) || $data["PositionID"] === "" ||
        !isset($data["PositionTitle"]) || trim($data["PositionTitle"]) === "" || 
        !isset($data["RatePerHour"]) || $data["RatePerHour"] === "" || 
        !isset($data["user_id"]) || $data["user_id"] === "") {
        http_response_code(400);
        echo json_encode(["error" => "Position ID, Position Title, Rate Per Hour, and user_id are required and cannot be empty"]);
        exit();
    }

    // Check for duplicate PositionTitle (excluding current record)
    $stmt = $conn->prepare("SELECT PositionID FROM Positions WHERE PositionTitle = ? AND PositionID != ?");
    $stmt->bind_param("si", $data["PositionTitle"], $data["PositionID"]);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows > 0) {
        http_response_code(400);
        echo json_encode(["error" => "A position with this title already exists"]);
        $stmt->close();
        exit();
    }
    $stmt->close();

    // Update position
    $stmt = $conn->prepare("UPDATE Positions SET PositionTitle = ?, RatePerHour = ? WHERE PositionID = ?");
    $stmt->bind_param("sdi", $data["PositionTitle"], $data["RatePerHour"], $data["PositionID"]);
    if ($stmt->execute()) {
        // Log activity
        $description = "Updated position '{$data["PositionTitle"]}' with rate ₱{$data["RatePerHour"]}'";
        logActivity($conn, $data["user_id"], "UPDATE_DATA", "Positions", $data["PositionID"], $description);
        http_response_code(200);
        echo json_encode(["success" => "Position updated"]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to update position: " . $stmt->error]);
    }
    $stmt->close();
} elseif ($method == "DELETE") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("DELETE Data: " . print_r($data, true));

    if (!isset($data["positionID"]) || $data["positionID"] === "" || 
        !isset($data["user_id"]) || $data["user_id"] === "") {
        http_response_code(400);
        echo json_encode(["error" => "Position ID and user_id are required and cannot be empty"]);
        exit();
    }

    // Fetch position title for logging
    $stmt = $conn->prepare("SELECT PositionTitle FROM Positions WHERE PositionID = ?");
    $stmt->bind_param("i", $data["positionID"]);
    $stmt->execute();
    $result = $stmt->get_result();
    $positionTitle = $result->num_rows > 0 ? $result->fetch_assoc()['PositionTitle'] : "Unknown";
    $stmt->close();

    // Delete position
    $stmt = $conn->prepare("DELETE FROM Positions WHERE PositionID = ?");
    $stmt->bind_param("i", $data["positionID"]);
    if ($stmt->execute()) {
        // Log activity
        $description = "Deleted position '$positionTitle'";
        logActivity($conn, $data["user_id"], "DELETE_DATA", "Positions", $data["positionID"], $description);
        http_response_code(200);
        echo json_encode(["success" => "Position deleted"]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to delete position: " . $stmt->error]);
    }
    $stmt->close();
}

$conn->close();
?>