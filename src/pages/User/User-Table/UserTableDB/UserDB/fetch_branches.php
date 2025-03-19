<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
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
    http_response_code(500);
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method == "GET") {
    $sql = "SELECT BranchID AS `key`, BranchName, BranchAddress, BranchContact FROM branches";
    $result = $conn->query($sql);

    if ($result) {
        $branches = [];
        while ($row = $result->fetch_assoc()) {
            $branches[] = $row;
        }
        http_response_code(200);
        echo json_encode($branches);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to fetch branches: " . $conn->error]);
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("POST Data: " . print_r($data, true));

    if (!empty($data["branchName"]) && !empty($data["branchAddress"]) && !empty($data["branchContact"])) {
        $stmt = $conn->prepare("INSERT INTO branches (BranchName, BranchAddress, BranchContact) VALUES (?, ?, ?)");
        $stmt->bind_param("sss", $data["branchName"], $data["branchAddress"], $data["branchContact"]);

        if ($stmt->execute()) {
            http_response_code(201);
            echo json_encode(["success" => "Branch added"]);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Failed to add branch: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400);
        echo json_encode(["error" => "Branch name, address, and contact are required"]);
    }
} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("PUT Data: " . print_r($data, true));

    if (!empty($data["branchID"]) && !empty($data["branchName"]) && !empty($data["branchAddress"]) && !empty($data["branchContact"])) {
        $stmt = $conn->prepare("UPDATE branches SET BranchName = ?, BranchAddress = ?, BranchContact = ? WHERE BranchID = ?");
        $stmt->bind_param("sssi", $data["branchName"], $data["branchAddress"], $data["branchContact"], $data["branchID"]);

        if ($stmt->execute()) {
            http_response_code(200);
            echo json_encode(["success" => "Branch updated"]);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Failed to update branch: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400);
        echo json_encode(["error" => "Branch ID, name, address, and contact are required"]);
    }
} elseif ($method == "DELETE") {
    $data = json_decode(file_get_contents("php://input"), true);
    error_log("DELETE Data: " . print_r($data, true));

    if (!empty($data["branchID"])) {
        $stmt = $conn->prepare("DELETE FROM branches WHERE BranchID = ?");
        $stmt->bind_param("i", $data["branchID"]);

        if ($stmt->execute()) {
            http_response_code(200);
            echo json_encode(["success" => "Branch deleted"]);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Failed to delete branch: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400);
        echo json_encode(["error" => "Branch ID is required"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["error" => "Method not supported"]);
}

$conn->close();
?>