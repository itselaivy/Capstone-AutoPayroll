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

    $year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
    $branch = isset($_GET['branch']) ? $_GET['branch'] : 'all';

    $sql = "SELECT 
                MONTHNAME(Date) AS month,
                SUM(CASE WHEN TimeInStatus = 'On-Time' THEN 1 ELSE 0 END) AS onTime,
                SUM(CASE WHEN TimeInStatus = 'Late' THEN 1 ELSE 0 END) AS late
            FROM attendance
            WHERE YEAR(Date) = ?";
    if ($branch !== 'all') {
        $sql .= " AND BranchID = ?";
    }
    $sql .= " GROUP BY MONTH(Date) ORDER BY MONTH(Date)";

    $stmt = $conn->prepare($sql);
    if ($branch !== 'all') {
        $stmt->bind_param("ii", $year, $branch);
    } else {
        $stmt->bind_param("i", $year);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $data = [];
    while ($row = $result->fetch_assoc()) {
        $data[] = [
            "month" => $row['month'],
            "onTime" => (int)$row['onTime'],
            "late" => (int)$row['late']
        ];
    }
    echo json_encode($data);

    $stmt->close();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?>