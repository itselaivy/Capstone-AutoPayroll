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

    function logUserActivity($conn, $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description) {
        $stmt = $conn->prepare("
            INSERT INTO user_activity_logs (
                user_id, activity_type, affected_table, affected_record_id, activity_description, created_at
            ) VALUES (?, ?, ?, ?, ?, NOW())
        ");
        if (!$stmt) {
            error_log("Prepare failed for log: " . $conn->error);
            return false;
        }
        $stmt->bind_param("issis", $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description);
        $success = $stmt->execute();
        if (!$success) error_log("Log insert failed: " . $stmt->error);
        $stmt->close();
        return $success;
    }

    function recordExists($conn, $table, $id) {
        $idColumnMap = [
            'employees' => 'EmployeeID',
            'Contributions' => 'ContributionID',
            'branches' => 'BranchID'
        ];
        $idColumn = $idColumnMap[$table] ?? 'ID';
        $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
        if (!$stmt) {
            error_log("Prepare failed for recordExists: " . $conn->error);
            throw new Exception("Failed to check record existence: " . $conn->error);
        }
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        $exists = $stmt->num_rows > 0;
        $stmt->close();
        return $exists;
    }

    function getEmployeeNameById($conn, $employeeId) {
        $stmt = $conn->prepare("SELECT EmployeeName FROM employees WHERE EmployeeID = ?");
        if (!$stmt) {
            error_log("Prepare failed for getEmployeeNameById: " . $conn->error);
            throw new Exception("Failed to fetch employee name: " . $conn->error);
        }
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $employeeName = $row['EmployeeName'];
            $stmt->close();
            return $employeeName;
        }
        $stmt->close();
        return "Employee ID $employeeId";
    }

    function formatNumber($amount) {
        return number_format((float)$amount, 2, '.', '');
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $role = isset($_GET['role']) ? $_GET['role'] : null;
    $search = isset($_GET['search']) ? trim($_GET['search']) : '';

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            if ($type == 'employees') {
                if (!$user_id || !$role) {
                    throw new Exception("user_id and role are required for fetching employees.");
                }

                if ($role === 'Payroll Staff') {
                    $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                    if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
                    $branchStmt->bind_param("i", $user_id);
                    $branchStmt->execute();
                    $branchResult = $branchStmt->get_result();
                    $allowedBranches = [];
                    while ($row = $branchResult->fetch_assoc()) {
                        $allowedBranches[] = $row['BranchID'];
                    }
                    $branchStmt->close();

                    if (empty($allowedBranches)) {
                        echo json_encode([]);
                        exit;
                    }

                    $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                    $sql = "SELECT EmployeeID, EmployeeName, BranchID FROM employees WHERE BranchID IN ($placeholders)";
                    $stmt = $conn->prepare($sql);
                    if (!$stmt) throw new Exception("Prepare failed for employees query: " . $conn->error);
                    $types = str_repeat('i', count($allowedBranches));
                    $stmt->bind_param($types, ...$allowedBranches);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $data[] = $row;
                    }
                    $stmt->close();
                    echo json_encode($data);
                } else {
                    $sql = "SELECT EmployeeID, EmployeeName, BranchID FROM employees";
                    $result = $conn->query($sql);
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $data[] = $row;
                    }
                    echo json_encode($data);
                }
            } elseif ($type == 'branches') {
                $sql = "SELECT BranchID, BranchName FROM branches";
                $result = $conn->query($sql);
                $data = [];
                while ($row = $result->fetch_assoc()) {
                    $data[] = $row;
                }
                echo json_encode($data);
            } else {
                throw new Exception("Invalid type specified");
            }
        } else {
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = $page * $limit;
            $branch_id = isset($_GET['branch_id']) ? (int)$_GET['branch_id'] : null;

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for contributions fetch.");
            }

            $params = [];
            $types = '';
            $countParams = [];
            $countTypes = '';

            if ($role === 'Payroll Staff') {
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
                $branchStmt->bind_param("i", $user_id);
                $branchStmt->execute();
                $branchResult = $branchStmt->get_result();
                $allowedBranches = [];
                while ($row = $branchResult->fetch_assoc()) {
                    $allowedBranches[] = $row['BranchID'];
                }
                $branchStmt->close();

                if (empty($allowedBranches)) {
                    echo json_encode([
                        "success" => true,
                        "data" => [],
                        "total" => 0,
                        "page" => $page,
                        "limit" => $limit
                    ]);
                    exit;
                }

                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $countSql = "SELECT COUNT(DISTINCT c2.EmployeeID) as total 
                            FROM Contributions c2
                            JOIN employees e2 ON c2.EmployeeID = e2.EmployeeID
                            WHERE e2.BranchID IN ($placeholders)";
                
                // Derived table for paginated EmployeeIDs
                $subquery = "SELECT DISTINCT c2.EmployeeID
                            FROM Contributions c2
                            JOIN employees e2 ON c2.EmployeeID = e2.EmployeeID
                            WHERE e2.BranchID IN ($placeholders)";
                if ($branch_id) {
                    $subquery .= " AND e2.BranchID = ?";
                    $countSql .= " AND e2.BranchID = ?";
                    $params[] = $branch_id;
                    $countParams[] = $branch_id;
                    $types .= 'i';
                    $countTypes .= 'i';
                }
                if ($search) {
                    $subquery .= " AND (e2.EmployeeName LIKE ? OR c2.ContributionType LIKE ?)";
                    $countSql .= " AND (e2.EmployeeName LIKE ? OR c2.ContributionType LIKE ?)";
                    $searchParam = "%$search%";
                    $params[] = $searchParam;
                    $params[] = $searchParam;
                    $countParams[] = $searchParam;
                    $countParams[] = $searchParam;
                    $types .= 'ss';
                    $countTypes .= 'ss';
                }
                $subquery .= " ORDER BY c2.EmployeeID LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= 'ii';

                $sql = "SELECT 
                            c.ContributionID,
                            c.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            c.ContributionType,
                            c.Amount
                        FROM Contributions c
                        JOIN employees e ON c.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID
                        JOIN ($subquery) AS emp ON c.EmployeeID = emp.EmployeeID
                        ORDER BY c.EmployeeID";

                $countParams = array_merge($allowedBranches, $countParams);
                $countTypes = str_repeat('i', count($allowedBranches)) . $countTypes;
                $params = array_merge($allowedBranches, $params);
                $types = str_repeat('i', count($allowedBranches)) . $types;
            } else {
                $countSql = "SELECT COUNT(DISTINCT c2.EmployeeID) as total 
                            FROM Contributions c2
                            JOIN employees e2 ON c2.EmployeeID = e2.EmployeeID";
                
                $subquery = "SELECT DISTINCT c2.EmployeeID
                            FROM Contributions c2
                            JOIN employees e2 ON c2.EmployeeID = e2.EmployeeID";
                if ($branch_id) {
                    if (!recordExists($conn, 'branches', $branch_id)) {
                        throw new Exception("Invalid BranchID: Branch $branch_id does not exist.");
                    }
                    $subquery .= " WHERE e2.BranchID = ?";
                    $countSql .= " WHERE e2.BranchID = ?";
                    $params[] = $branch_id;
                    $countParams[] = $branch_id;
                    $types .= 'i';
                    $countTypes .= 'i';
                }
                if ($search) {
                    $where = $branch_id ? " AND" : " WHERE";
                    $subquery .= "$where (e2.EmployeeName LIKE ? OR c2.ContributionType LIKE ?)";
                    $countSql .= "$where (e2.EmployeeName LIKE ? OR c2.ContributionType LIKE ?)";
                    $searchParam = "%$search%";
                    $params[] = $searchParam;
                    $params[] = $searchParam;
                    $countParams[] = $searchParam;
                    $countParams[] = $searchParam;
                    $types .= 'ss';
                    $countTypes .= 'ss';
                }
                $subquery .= " ORDER BY c2.EmployeeID LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= 'ii';

                $sql = "SELECT 
                            c.ContributionID,
                            c.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            c.ContributionType,
                            c.Amount
                        FROM Contributions c
                        JOIN employees e ON c.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID
                        JOIN ($subquery) AS emp ON c.EmployeeID = emp.EmployeeID
                        ORDER BY c.EmployeeID";
            }

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
            if ($params) {
                $stmt->bind_param($types, ...$params);
            }

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);
            if ($countParams) {
                $countStmt->bind_param($countTypes, ...$countParams);
            }

            if (!$countStmt->execute()) {
                throw new Exception("Count query execution failed: " . $countStmt->error);
            }
            $countResult = $countStmt->get_result();
            $total = $countResult->fetch_assoc()['total'];
            $countStmt->close();

            if (!$stmt->execute()) {
                throw new Exception("Main query execution failed: " . $stmt->error);
            }
            $result = $stmt->get_result();
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            $stmt->close();

            echo json_encode([
                "success" => true,
                "data" => $data,
                "total" => $total,
                "page" => $page,
                "limit" => $limit
            ]);
        }
    } elseif ($method == "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("user_id is required");
        }

        if (isset($data["EmployeeID"]) && 
            !empty($data["ContributionType"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $validTypes = ['Pag-Ibig', 'SSS', 'PhilHealth'];
            if (!in_array($data["ContributionType"], $validTypes)) {
                throw new Exception("Invalid ContributionType");
            }

            $checkStmt = $conn->prepare("SELECT ContributionID FROM Contributions WHERE EmployeeID = ? AND ContributionType = ?");
            $checkStmt->bind_param("is", $data["EmployeeID"], $data["ContributionType"]);
            $checkStmt->execute();
            $checkStmt->store_result();
            if ($checkStmt->num_rows > 0) {
                $checkStmt->close();
                echo json_encode([
                    "success" => false,
                    "warning" => "Warning: An employee with this contribution record already exists."
                ]);
                exit;
            }
            $checkStmt->close();

            if ($role === 'Payroll Staff') {
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                $branchStmt->bind_param("i", $user_id);
                $branchStmt->execute();
                $branchResult = $branchStmt->get_result();
                $allowedBranches = [];
                while ($row = $branchResult->fetch_assoc()) {
                    $allowedBranches[] = $row['BranchID'];
                }
                $branchStmt->close();

                $empStmt = $conn->prepare("SELECT BranchID FROM employees WHERE EmployeeID = ?");
                $empStmt->bind_param("i", $data["EmployeeID"]);
                $empStmt->execute();
                $empResult = $empStmt->get_result();
                $employeeBranch = $empResult->fetch_assoc()['BranchID'];
                $empStmt->close();

                if (!in_array($employeeBranch, $allowedBranches)) {
                    throw new Exception("Employee does not belong to an assigned branch");
                }
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("INSERT INTO Contributions (EmployeeID, ContributionType, Amount) VALUES (?, ?, ?)");
                $stmt->bind_param("isd", $data["EmployeeID"], $data["ContributionType"], $data["Amount"]);

                if ($stmt->execute()) {
                    $contributionId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = "Contribution '{$data["ContributionType"]}' of ₱" . formatNumber($data["Amount"]) . " added for '$employeeName'";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Contributions", $contributionId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $contributionId]);
                } else {
                    throw new Exception("Failed to add contribution: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("All fields are required");
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("user_id is required");
        }

        if (!empty($data["ContributionID"]) && 
            isset($data["EmployeeID"]) && 
            !empty($data["ContributionType"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $validTypes = ['Pag-Ibig', 'SSS', 'PhilHealth'];
            if (!in_array($data["ContributionType"], $validTypes)) {
                throw new Exception("Invalid ContributionType");
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, ContributionType, Amount FROM Contributions WHERE ContributionID = ?");
                $stmt->bind_param("i", $data["ContributionID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecord = $result->fetch_assoc();
                $stmt->close();

                if (!$currentRecord) {
                    throw new Exception("Contribution record with ID {$data["ContributionID"]} not found.");
                }

                $changes = [];
                if ($currentRecord["EmployeeID"] != $data["EmployeeID"]) {
                    $oldEmployeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                    $newEmployeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $changes[] = "Employee from '$oldEmployeeName' to '$newEmployeeName'";
                }
                if ($currentRecord["ContributionType"] != $data["ContributionType"]) {
                    $changes[] = "ContributionType from '{$currentRecord["ContributionType"]}' to '{$data["ContributionType"]}'";
                }
                if ($currentRecord["Amount"] != $data["Amount"]) {
                    $changes[] = "Amount from '₱" . formatNumber($currentRecord["Amount"]) . "' to '₱" . formatNumber($data["Amount"]) . "'";
                }

                $stmt = $conn->prepare("UPDATE Contributions SET EmployeeID = ?, ContributionType = ?, Amount = ? WHERE ContributionID = ?");
                $stmt->bind_param("isdi", $data["EmployeeID"], $data["ContributionType"], $data["Amount"], $data["ContributionID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = empty($changes)
                        ? "Contribution '{$data["ContributionType"]}' for '$employeeName' updated: No changes made"
                        : "Contribution '{$data["ContributionType"]}' for '$employeeName' updated: " . implode('/ ', $changes);
                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Contributions", $data["ContributionID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to update contribution: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("All fields are required");
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("user_id is required");
        }

        if (!empty($data["ContributionID"])) {
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, ContributionType, Amount FROM Contributions WHERE ContributionID = ?");
                $stmt->bind_param("i", $data["ContributionID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $record = $result->fetch_assoc();
                $stmt->close();

                if (!$record) {
                    throw new Exception("Contribution record with ID {$data["ContributionID"]} not found.");
                }

                $stmt = $conn->prepare("DELETE FROM Contributions WHERE ContributionID = ?");
                $stmt->bind_param("i", $data["ContributionID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                    $description = "Contribution '{$record["ContributionType"]}' of ₱" . formatNumber($record["Amount"]) . " deleted for '$employeeName'";
                    logUserActivity($conn, $user_id, "DELETE_DATA", "Contributions", $data["ContributionID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to delete contribution: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Contribution ID is required");
        }
    } else {
        throw new Exception("Method not allowed");
    }
} catch (Exception $e) {
    http_response_code(500);
    error_log("Error in fetch_contributions.php: " . $e->getMessage());
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?>