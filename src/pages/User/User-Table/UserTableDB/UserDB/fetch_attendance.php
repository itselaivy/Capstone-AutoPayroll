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

    function recordExists($conn, $table, $id) {
        $idColumnMap = [
            'branches' => 'BranchID',
            'employees' => 'EmployeeID',
            'attendance' => 'AttendanceID'
        ];
        $idColumn = $idColumnMap[$table] ?? 'ID';
        $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        return $stmt->num_rows > 0;
    }

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            if ($type == 'branches') {
                $sql = "SELECT BranchID, BranchName FROM branches";
            } elseif ($type == 'employees') {
                $sql = "SELECT EmployeeID, EmployeeName, BranchID FROM employees";
            } else {
                throw new Exception("Invalid type specified");
            }
            $result = $conn->query($sql);
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            echo json_encode($data);
        } elseif (isset($_GET['year'])) {
            $year = $_GET['year'];
            $month = isset($_GET['month']) && $_GET['month'] !== 'all' ? $_GET['month'] : null;
            $branch = isset($_GET['branch']) && $_GET['branch'] !== 'all' ? $_GET['branch'] : null;

            // Base SQL query
            $sql = "SELECT DAY(Date) AS day, 
                           SUM(CASE WHEN TimeInStatus = 'On-Time' THEN 1 ELSE 0 END) AS onTime, 
                           SUM(CASE WHEN TimeInStatus = 'Late' THEN 1 ELSE 0 END) AS late
                    FROM attendance 
                    WHERE YEAR(Date) = ?";
            $types = "i"; // Type string for bind_param
            $params = [$year]; // Parameters array

            // Add month filter if provided
            if ($month !== null) {
                $sql .= " AND MONTH(Date) = ?";
                $types .= "i";
                $params[] = $month;
            }

            // Add branch filter if provided
            if ($branch !== null) {
                $sql .= " AND BranchID = ?";
                $types .= "i";
                $params[] = $branch;
            }

            $sql .= " GROUP BY DAY(Date)";

            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                throw new Exception("Prepare failed: " . $conn->error);
            }

            // Dynamically bind parameters
            if (count($params) > 1) {
                $stmt->bind_param($types, ...$params);
            } else {
                $stmt->bind_param($types, $params[0]);
            }

            $stmt->execute();
            $result = $stmt->get_result();
            $data = [];

            // Determine days to include based on month or full year
            $daysInPeriod = $month !== null ? cal_days_in_month(CAL_GREGORIAN, $month, $year) : 365;
            $dayMap = array_fill(1, $daysInPeriod, ['onTime' => 0, 'late' => 0]);

            while ($row = $result->fetch_assoc()) {
                $dayMap[(int)$row['day']] = [
                    'onTime' => (int)$row['onTime'],
                    'late' => (int)$row['late'],
                ];
            }

            foreach ($dayMap as $day => $counts) {
                $data[] = [
                    "date" => sprintf("%d-%02d-%02d", $year, $month ?: 1, $day), // Use month if provided, else default to 1
                    "onTime" => $counts['onTime'],
                    "late" => $counts['late'],
                ];
            }

            echo json_encode($data);
            $stmt->close();
        } else {
            $sql = "SELECT 
                        a.AttendanceID,
                        a.Date,
                        a.EmployeeID,
                        e.EmployeeName,
                        b.BranchName,
                        a.TimeIn,
                        a.TimeOut,
                        a.TimeInStatus,
                        a.BranchID
                    FROM attendance a
                    JOIN employees e ON a.EmployeeID = e.EmployeeID
                    JOIN branches b ON a.BranchID = b.BranchID";
            $result = $conn->query($sql);
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            echo json_encode($data);
        }
    } elseif ($method == "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        if (!empty($data["Date"]) && 
            isset($data["EmployeeID"]) && 
            isset($data["BranchID"]) && 
            !empty($data["TimeIn"]) && 
            !empty($data["TimeOut"]) && 
            !empty($data["TimeInStatus"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }

            $stmt = $conn->prepare("INSERT INTO attendance (Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("siisss", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $data["TimeInStatus"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Attendance added", "id" => $stmt->insert_id]);
            } else {
                throw new Exception("Failed to add attendance: " . $stmt->error);
            }
            $stmt->close();
        } else {
            throw new Exception("All fields are required");
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        if (!empty($data["AttendanceID"]) && 
            !empty($data["Date"]) && 
            isset($data["EmployeeID"]) && 
            isset($data["BranchID"]) && 
            !empty($data["TimeIn"]) && 
            !empty($data["TimeOut"]) && 
            !empty($data["TimeInStatus"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }

            $stmt = $conn->prepare("UPDATE attendance SET Date = ?, EmployeeID = ?, BranchID = ?, TimeIn = ?, TimeOut = ?, TimeInStatus = ? WHERE AttendanceID = ?");
            $stmt->bind_param("siisssi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $data["TimeInStatus"], $data["AttendanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Attendance updated"]);
            } else {
                throw new Exception("Failed to update attendance: " . $stmt->error);
            }
            $stmt->close();
        } else {
            throw new Exception("All fields are required");
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        if (!empty($data["AttendanceID"])) {
            $stmt = $conn->prepare("DELETE FROM attendance WHERE AttendanceID = ?");
            $stmt->bind_param("i", $data["AttendanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Attendance deleted"]);
            } else {
                throw new Exception("Failed to delete attendance: " . $stmt->error);
            }
            $stmt->close();
        } else {
            throw new Exception("Attendance ID is required");
        }
    } else {
        throw new Exception("Method not allowed");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?>