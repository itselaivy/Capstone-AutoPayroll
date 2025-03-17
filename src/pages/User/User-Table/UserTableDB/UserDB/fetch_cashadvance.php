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
            'branches' => 'BranchID',
            'cashadvance' => 'CashAdvanceID'
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
                        ca.CashAdvanceID,
                        ca.Date,
                        ca.EmployeeID,
                        e.EmployeeName,
                        ca.BranchID,
                        b.BranchName,
                        ca.Amount
                    FROM cashadvance ca
                    JOIN employees e ON ca.EmployeeID = e.EmployeeID
                    JOIN branches b ON ca.BranchID = b.BranchID";
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
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }

            $stmt = $conn->prepare("INSERT INTO cashadvance (Date, EmployeeID, BranchID, Amount) VALUES (?, ?, ?, ?)");
            $stmt->bind_param("siid", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["Amount"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Cash Advance added", "id" => $stmt->insert_id]);
            } else {
                throw new Exception("Failed to add cash advance: " . $stmt->error);
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

        if (!empty($data["CashAdvanceID"]) && 
            !empty($data["Date"]) && 
            isset($data["EmployeeID"]) && 
            isset($data["BranchID"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID");
            }

            $stmt = $conn->prepare("UPDATE cashadvance SET Date = ?, EmployeeID = ?, BranchID = ?, Amount = ? WHERE CashAdvanceID = ?");
            $stmt->bind_param("siidi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["Amount"], $data["CashAdvanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Cash Advance updated"]);
            } else {
                throw new Exception("Failed to update cash advance: " . $stmt->error);
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

        if (!empty($data["CashAdvanceID"])) {
            $stmt = $conn->prepare("DELETE FROM cashadvance WHERE CashAdvanceID = ?");
            $stmt->bind_param("i", $data["CashAdvanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => "Cash Advance deleted"]);
            } else {
                throw new Exception("Failed to delete cash advance: " . $stmt->error);
            }
            $stmt->close();
        } else {
            throw new Exception("Cash Advance ID is required");
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