<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
if ($conn->connect_error) {
  die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

$month = $_GET['month'] ?? date('m');
$employee = $_GET['employee'] ?? 'all';
$branch = $_GET['branch'] ?? 'all';
$year = $_GET['year'] ?? date('Y');

$sql = "
  SELECT 
    DATE(attendance_date) AS date,
    SUM(CASE WHEN status = 'On-Time' THEN 1 ELSE 0 END) AS onTime,
    SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late
  FROM attendance
  WHERE MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?
";

$params = [$month, $year];
$types = "ii";

if ($employee !== 'all') {
  $sql .= " AND employee_id = ?";
  $params[] = $employee;
  $types .= "i";
}

if ($branch !== 'all') {
  $sql .= " AND branch_id = ?";
  $params[] = $branch;
  $types .= "i";
}

$sql .= " GROUP BY DATE(attendance_date) ORDER BY attendance_date";

$stmt = $conn->prepare($sql);
if (!$stmt) {
  die(json_encode(["error" => "Prepare failed: " . $conn->error]));
}

$stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();

$data = [];
while ($row = $result->fetch_assoc()) {
  $data[] = [
    "date" => date('m-d', strtotime($row['date'])), // Format as MM-DD
    "onTime" => (int)$row['onTime'],
    "late" => (int)$row['late'],
  ];
}

// If no data, fill with zeros for the month
if (empty($data)) {
  $daysInMonth = cal_days_in_month(CAL_GREGORIAN, $month, $year);
  for ($day = 1; $day <= $daysInMonth; $day++) {
    $data[] = [
      "date" => sprintf("%02d-%02d", $month, $day),
      "onTime" => 0,
      "late" => 0,
    ];
  }
}

echo json_encode($data);

$stmt->close();
$conn->close();
?>