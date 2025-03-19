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

    $month = isset($_GET['month']) ? $_GET['month'] : null;
    $year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
    $branch = isset($_GET['branch']) ? $_GET['branch'] : 'all';

    $sql = "SELECT 
                e.EmployeeName AS name,
                ROUND((SUM(CASE WHEN a.TimeInStatus = 'On-Time' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) AS onTimeRate
            FROM employees e
            LEFT JOIN attendance a ON e.EmployeeID = a.EmployeeID
            WHERE YEAR(a.Date) = ?";
    if ($month !== null && $month !== 'all') {
        $sql .= " AND MONTH(a.Date) = ?";
    }
    if ($branch !== 'all') {
        $sql .= " AND a.BranchID = ?";
    }
    $sql .= " GROUP BY e.EmployeeID, e.EmployeeName 
              HAVING COUNT(*) > 0 
              ORDER BY onTimeRate DESC LIMIT 5";

    $stmt = $conn->prepare($sql);
    if ($month !== null && $month !== 'all' && $branch !== 'all') {
        $stmt->bind_param("iii", $year, $month, $branch);
    } elseif ($month !== null && $month !== 'all') {
        $stmt->bind_param("ii", $year, $month);
    } elseif ($branch !== 'all') {
        $stmt->bind_param("ii", $year, $branch);
    } else {
        $stmt->bind_param("i", $year);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $data = [];
    while ($row = $result->fetch_assoc()) {
        $data[] = [
            "name" => $row['name'],
            "onTimeRate" => (float)$row['onTimeRate']
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