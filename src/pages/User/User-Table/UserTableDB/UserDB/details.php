<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("HTTP/1.1 200 OK");
    exit();
}

$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

try {
    $conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
    if ($conn->connect_error) {
        throw new Exception("Connection failed: " . $conn->connect_error);
    }

    $date = isset($_GET['date']) ? $_GET['date'] : date('Y-m-d');
    $branch = isset($_GET['branch']) ? $_GET['branch'] : 'all';

    $sql = "SELECT 
                e.EmployeeName AS name,
                a.TimeInStatus AS status
            FROM attendance a
            JOIN employees e ON a.EmployeeID = e.EmployeeID
            WHERE a.Date = ?";
    if ($branch !== 'all') {
        $sql .= " AND a.BranchID = ?";
    }

    $stmt = $conn->prepare($sql);
    if ($branch !== 'all') {
        $stmt->bind_param("si", $date, $branch);
    } else {
        $stmt->bind_param("s", $date);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $employees = [];
    while ($row = $result->fetch_assoc()) {
        $employees[] = [
            "name" => $row['name'],
            "status" => $row['status']
        ];
    }

    $response = [
        "date" => $date,
        "employees" => $employees
    ];
    echo json_encode($response);

    $stmt->close();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?>