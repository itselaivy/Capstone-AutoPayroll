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
            'employees' => 'EmployeeID',
            'allowances' => 'AllowanceID'
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
            if ($type == 'employees') {
                $sql = "SELECT EmployeeID, EmployeeName FROM employees";
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
                        a.AllowanceID,
                        a.EmployeeID,
                        e.EmployeeName,
                        a.Description,
                        a.Amount
                    FROM allowances a
                    JOIN employees e ON a.EmployeeID = e.EmployeeID";
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

        if (isset($data["EmployeeID"]) && 
            !empty($data["Description"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $stmt = $conn->prepare("INSERT INTO allowances (EmployeeID, Description, Amount) VALUES (?, ?, ?)");
            $stmt->bind_param("isd", $data["EmployeeID"], $data["Description"], $data["Amount"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Allowance added", "id" => $stmt->insert_id]);
            } else {
                throw new Exception("Failed to add allowance: " . $stmt->error);
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

        if (!empty($data["AllowanceID"]) && 
            isset($data["EmployeeID"]) && 
            !empty($data["Description"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $stmt = $conn->prepare("UPDATE allowances SET EmployeeID = ?, Description = ?, Amount = ? WHERE AllowanceID = ?");
            $stmt->bind_param("isdi", $data["EmployeeID"], $data["Description"], $data["Amount"], $data["AllowanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Allowance updated"]);
            } else {
                throw new Exception("Failed to update allowance: " . $stmt->error);
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

        if (!empty($data["AllowanceID"])) {
            $stmt = $conn->prepare("DELETE FROM allowances WHERE AllowanceID = ?");
            $stmt->bind_param("i", $data["AllowanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Allowance deleted"]);
            } else {
                throw new Exception("Failed to delete allowance: " . $stmt->error);
            }
            $stmt->close();
        } else {
            throw new Exception("Allowance ID is required");
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