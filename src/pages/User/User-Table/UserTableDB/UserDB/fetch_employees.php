<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

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
        // Map table names to their correct ID column names
        $idColumnMap = [
            'branches' => 'BranchID',
            'positions' => 'PositionID',
            'schedules' => 'ScheduleID'
        ];

        // Use the correct column name based on the table
        $idColumn = $idColumnMap[$table] ?? 'ID'; // Default to 'ID' if table not found (safety fallback)
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
            } elseif ($type == 'positions') {
                $sql = "SELECT PositionID, PositionTitle FROM positions";
            } elseif ($type == 'schedules') {
                $sql = "SELECT ScheduleID, ShiftStart, ShiftEnd FROM schedules";
            } else {
                throw new Exception("Invalid type specified");
            }

            $result = $conn->query($sql);
            if ($result) {
                $data = [];
                while ($row = $result->fetch_assoc()) {
                    $data[] = $row;
                }
                echo json_encode($data);
            } else {
                throw new Exception("Failed to fetch data: " . $conn->error);
            }
        } else {
            $sql = "SELECT 
                        e.EmployeeID AS `key`,
                        e.EmployeeName,
                        b.BranchName,
                        p.PositionTitle,
                        CONCAT(s.ShiftStart, ' - ', s.ShiftEnd) AS Schedule,
                        e.MemberSince,
                        e.BranchID,
                        e.PositionID,
                        e.ScheduleID
                    FROM 
                        Employees e
                    JOIN 
                        branches b ON e.BranchID = b.BranchID
                    JOIN 
                        positions p ON e.PositionID = p.PositionID
                    JOIN 
                        schedules s ON e.ScheduleID = s.ScheduleID";
            $result = $conn->query($sql);

            if ($result) {
                $employees = [];
                while ($row = $result->fetch_assoc()) {
                    $employees[] = $row;
                }
                echo json_encode($employees);
            } else {
                throw new Exception("Failed to fetch employees: " . $conn->error);
            }
        }
    } elseif ($method == "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        if (!empty($data["EmployeeName"]) && 
            isset($data["BranchID"]) && 
            isset($data["PositionID"]) && 
            isset($data["ScheduleID"]) && 
            !empty($data["MemberSince"])) {
            
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }
            if (!recordExists($conn, "positions", $data["PositionID"])) {
                throw new Exception("Invalid PositionID");
            }
            if (!recordExists($conn, "schedules", $data["ScheduleID"])) {
                throw new Exception("Invalid ScheduleID");
            }

            $stmt = $conn->prepare("INSERT INTO Employees (EmployeeName, BranchID, PositionID, ScheduleID, MemberSince) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("siiis", $data["EmployeeName"], $data["BranchID"], $data["PositionID"], $data["ScheduleID"], $data["MemberSince"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Employee added", "id" => $stmt->insert_id]);
            } else {
                throw new Exception("Failed to add employee: " . $stmt->error);
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

        if (!empty($data["EmployeeID"]) && !empty($data["EmployeeName"]) && 
            isset($data["BranchID"]) && isset($data["PositionID"]) && 
            isset($data["ScheduleID"]) && !empty($data["MemberSince"])) {
            
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }
            if (!recordExists($conn, "positions", $data["PositionID"])) {
                throw new Exception("Invalid PositionID");
            }
            if (!recordExists($conn, "schedules", $data["ScheduleID"])) {
                throw new Exception("Invalid ScheduleID");
            }

            $stmt = $conn->prepare("UPDATE employees SET EmployeeName = ?, BranchID = ?, PositionID = ?, ScheduleID = ?, MemberSince = ? WHERE EmployeeID = ?");
            $stmt->bind_param("siiisi", $data["EmployeeName"], $data["BranchID"], $data["PositionID"], $data["ScheduleID"], $data["MemberSince"], $data["EmployeeID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Employee updated"]);
            } else {
                throw new Exception("Failed to update employee: " . $stmt->error);
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

        if (!empty($data["employeeID"])) {
            $stmt = $conn->prepare("DELETE FROM employees WHERE EmployeeID = ?");
            $stmt->bind_param("i", $data["employeeID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Employee deleted"]);
            } else {
                throw new Exception("Failed to delete employee: " . $stmt->error);
            }
            $stmt->close();
        } else {
            throw new Exception("Employee ID is required");
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