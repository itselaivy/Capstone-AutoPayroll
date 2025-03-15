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
        $idColumnMap = [
            'branches' => 'BranchID',
            'employees' => 'EmployeeID',
            'overtime' => 'OvertimeID'
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
        } else {
            $sql = "SELECT 
                        o.OvertimeID,
                        o.Date,
                        o.EmployeeID,
                        e.EmployeeName,
                        b.BranchName,
                        o.`No. of Hours` AS No_of_Hours,
                        o.`No. of Mins` AS No_of_Mins,
                        o.`Rate (₱)` AS Rate,
                        o.BranchID
                    FROM overtime o
                    JOIN employees e ON o.EmployeeID = e.EmployeeID
                    JOIN branches b ON o.BranchID = b.BranchID";
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
            !empty($data["No_of_Hours"]) && 
            !empty($data["No_of_Mins"]) && 
            !empty($data["Rate"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }

            $stmt = $conn->prepare("INSERT INTO overtime (Date, EmployeeID, BranchID, `No. of Hours`, `No. of Mins`, `Rate (₱)`) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("siidid", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["No_of_Hours"], $data["No_of_Mins"], $data["Rate"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Overtime added", "id" => $stmt->insert_id]);
            } else {
                throw new Exception("Failed to add overtime: " . $stmt->error);
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

        if (!empty($data["OvertimeID"]) && 
            !empty($data["Date"]) && 
            isset($data["EmployeeID"]) && 
            isset($data["BranchID"]) && 
            !empty($data["No_of_Hours"]) && 
            !empty($data["No_of_Mins"]) && 
            !empty($data["Rate"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }

            $stmt = $conn->prepare("UPDATE overtime SET Date = ?, EmployeeID = ?, BranchID = ?, `No. of Hours` = ?, `No. of Mins` = ?, `Rate (₱)` = ? WHERE OvertimeID = ?");
            $stmt->bind_param("siididi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["No_of_Hours"], $data["No_of_Mins"], $data["Rate"], $data["OvertimeID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Overtime updated"]);
            } else {
                throw new Exception("Failed to update overtime: " . $stmt->error);
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

        if (!empty($data["OvertimeID"])) {
            $stmt = $conn->prepare("DELETE FROM overtime WHERE OvertimeID = ?");
            $stmt->bind_param("i", $data["OvertimeID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Overtime deleted"]);
            } else {
                throw new Exception("Failed to delete overtime: " . $stmt->error);
            }
            $stmt->close();
        } else {
            throw new Exception("Overtime ID is required");
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