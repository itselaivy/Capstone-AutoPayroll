<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

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
    $sql = "SELECT BranchID, BranchName FROM Branches";
    $result = $conn->query($sql);

    if ($result) {
        $branches = [];
        while ($row = $result->fetch_assoc()) {
            $branches[] = $row;
        }
        echo json_encode($branches);
    } else {
        echo json_encode(["error" => "Failed to fetch branches"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["error" => "Method not supported"]);
}

$conn->close();
?>