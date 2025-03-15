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
            'employees' => 'EmployeeID',
            'attendance' => 'AttendanceID'
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
            } elseif ($type == 'employees') {
                $sql = "SELECT EmployeeID, EmployeeName, BranchID FROM employees"; // Ensure BranchID is included
            } else {
                throw new Exception("Invalid type specified");
            }

            $result = $conn->query($sql);
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            echo json_encode($data);
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