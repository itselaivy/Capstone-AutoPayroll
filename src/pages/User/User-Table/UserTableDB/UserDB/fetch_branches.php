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
    $sql = "SELECT BranchID AS `key`, BranchName FROM branches";
    $result = $conn->query($sql);

    if ($result) {
        $branches = [];
        while ($row = $result->fetch_assoc()) {
            $branches[] = $row;
        }
        http_response_code(200); // OK
        echo json_encode($branches);
    } else {
        http_response_code(500); // Internal Server Error
        echo json_encode(["error" => "Failed to fetch branches: " . $conn->error]);
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("POST Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["branchName"])) {
        $stmt = $conn->prepare("INSERT INTO branches (BranchName) VALUES (?)");
        $stmt->bind_param("s", $data["branchName"]);

        if ($stmt->execute()) {
            http_response_code(201); // Created
            echo json_encode(["success" => "Branch added"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to add branch: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Branch name is required"]);
    }
} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("PUT Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["branchID"]) && !empty($data["branchName"])) {
        $stmt = $conn->prepare("UPDATE branches SET BranchName = ? WHERE BranchID = ?");
        $stmt->bind_param("si", $data["branchName"], $data["branchID"]);

        if ($stmt->execute()) {
            http_response_code(200); // OK
            echo json_encode(["success" => "Branch updated"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to update branch: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Branch ID and name are required"]);
    }
} elseif ($method == "DELETE") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("DELETE Data: " . print_r($data, true)); // Log the received data

    if (!empty($data["branchID"])) {
        $stmt = $conn->prepare("DELETE FROM branches WHERE BranchID = ?");
        $stmt->bind_param("i", $data["branchID"]);

        if ($stmt->execute()) {
            http_response_code(200); // OK
            echo json_encode(["success" => "Branch deleted"]);
        } else {
            http_response_code(500); // Internal Server Error
            echo json_encode(["error" => "Failed to delete branch: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400); // Bad Request
        echo json_encode(["error" => "Branch ID is required"]);
    }
} else {
    http_response_code(405); // Method Not Allowed
    echo json_encode(["error" => "Method not supported"]);
}

$conn->close();
?>