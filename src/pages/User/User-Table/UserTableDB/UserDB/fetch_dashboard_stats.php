<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

// Real-time stats queries (adjusted to match your schema)
$branchesQuery = "SELECT COUNT(*) as branches FROM branches";
$employeesQuery = "SELECT COUNT(*) as employees FROM employees";
$onTimeQuery = "SELECT COUNT(*) as onTimeToday FROM attendance WHERE DATE(Date) = CURDATE() AND TimeInStatus = 'On-Time'";
$lateQuery = "SELECT COUNT(*) as lateToday FROM attendance WHERE DATE(Date) = CURDATE() AND TimeInStatus = 'Late'";

$stats = [
  "branches" => 0,
  "employees" => 0,
  "onTimeToday" => 0,
  "lateToday" => 0,
];

if ($result = $conn->query($branchesQuery)) {
  $stats["branches"] = (int)$result->fetch_assoc()['branches'];
  $result->free();
}
if ($result = $conn->query($employeesQuery)) {
  $stats["employees"] = (int)$result->fetch_assoc()['employees'];
  $result->free();
}
if ($result = $conn->query($onTimeQuery)) {
  $stats["onTimeToday"] = (int)$result->fetch_assoc()['onTimeToday'];
  $result->free();
}
if ($result = $conn->query($lateQuery)) {
  $stats["lateToday"] = (int)$result->fetch_assoc()['lateToday'];
  $result->free();
}

echo json_encode($stats);
$conn->close();
?>