<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', 'php_errors.log');

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
        $activity_description = htmlspecialchars($activity_description, ENT_QUOTES, 'UTF-8');
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
        if (!$success) {
            error_log("Log insert failed: " . $stmt->error);
        }
        $stmt->close();
        return $success;
    }

    function recordExists($conn, $table, $id) {
        $id = (int)$id;
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
        $exists = $stmt->num_rows > 0;
        $stmt->close();
        return $exists;
    }

    function checkDuplicateOvertime($conn, $date, $employeeId, $branchId, $excludeOvertimeId = null) {
        $date = htmlspecialchars($date, ENT_QUOTES, 'UTF-8');
        $employeeId = (int)$employeeId;
        $branchId = (int)$branchId;
        $sql = "SELECT OvertimeID FROM overtime WHERE Date = ? AND EmployeeID = ? AND BranchID = ?";
        if ($excludeOvertimeId !== null) {
            $sql .= " AND OvertimeID != ?";
        }
        $stmt = $conn->prepare($sql);
        if ($excludeOvertimeId !== null) {
            $excludeOvertimeId = (int)$excludeOvertimeId;
            $stmt->bind_param("siii", $date, $employeeId, $branchId, $excludeOvertimeId);
        } else {
            $stmt->bind_param("sii", $date, $employeeId, $branchId);
        }
        $stmt->execute();
        $stmt->store_result();
        $exists = $stmt->num_rows > 0;
        $stmt->close();
        return $exists;
    }

    function getEmployeeIdByName($conn, $employeeName, $branchId = null) {
        $employeeName = htmlspecialchars(trim($employeeName), ENT_QUOTES, 'UTF-8');
        $sql = "SELECT EmployeeID, BranchID FROM employees WHERE EmployeeName = ?";
        $types = "s";
        $params = [$employeeName];

        if ($branchId !== null) {
            $sql .= " AND BranchID = ?";
            $types .= "i";
            $params[] = (int)$branchId;
        }

        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
        $employees = [];
        while ($row = $result->fetch_assoc()) {
            $employees[] = $row;
        }
        $stmt->close();

        if (count($employees) === 0) {
            return [null, "Employee '$employeeName' not found"];
        } elseif (count($employees) > 1) {
            return [null, "Multiple employees found with name '$employeeName'. Please use a unique name or contact your administrator."];
        }
        return [$employees[0]['EmployeeID'], null];
    }

    function getBranchIdByName($conn, $branchName) {
        $branchName = htmlspecialchars(trim($branchName), ENT_QUOTES, 'UTF-8');
        $stmt = $conn->prepare("SELECT BranchID FROM branches WHERE BranchName = ?");
        $stmt->bind_param("s", $branchName);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $stmt->close();
            return [$row['BranchID'], null];
        }
        $stmt->close();
        return [null, "Branch '$branchName' not found"];
    }

    function getEmployeeNameById($conn, $employeeId) {
        $employeeId = (int)$employeeId;
        $stmt = $conn->prepare("SELECT EmployeeName FROM employees WHERE EmployeeID = ?");
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $stmt->close();
            return htmlspecialchars($row['EmployeeName'], ENT_QUOTES, 'UTF-8');
        }
        $stmt->close();
        return "Employee ID $employeeId";
    }

    function formatDate($date) {
        try {
            return (new DateTime($date))->format('m/d/Y');
        } catch (Exception $e) {
            error_log("Date format error: " . $e->getMessage());
            return $date;
        }
    }

    function sanitizeInput($input) {
        return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;
    $role = isset($_GET['role']) ? sanitizeInput($_GET['role']) : null;

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = sanitizeInput($_GET['type']);
            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required.");
            }

            if ($type == 'branches') {
                if ($role === 'Payroll Staff') {
                    $stmt = $conn->prepare("SELECT BranchID, BranchName FROM branches WHERE BranchID IN (SELECT BranchID FROM UserBranches WHERE UserID = ?)");
                    $stmt->bind_param("i", $user_id);
                } else {
                    $stmt = $conn->prepare("SELECT BranchID, BranchName FROM branches");
                }
                $stmt->execute();
                $result = $stmt->get_result();
                $data = [];
                while ($row = $result->fetch_assoc()) {
                    $row['BranchName'] = htmlspecialchars($row['BranchName'], ENT_QUOTES, 'UTF-8');
                    $data[] = $row;
                }
                $stmt->close();
                echo json_encode($data);
            } elseif ($type == 'employees') {
                if ($role === 'Payroll Staff') {
                    $stmt = $conn->prepare("
                        SELECT EmployeeID, EmployeeName, BranchID 
                        FROM employees 
                        WHERE BranchID IN (SELECT BranchID FROM UserBranches WHERE UserID = ?)
                    ");
                    $stmt->bind_param("i", $user_id);
                } else {
                    $stmt = $conn->prepare("SELECT EmployeeID, EmployeeName, BranchID FROM employees");
                }
                $stmt->execute();
                $result = $stmt->get_result();
                $data = [];
                while ($row = $result->fetch_assoc()) {
                    $row['EmployeeName'] = htmlspecialchars($row['EmployeeName'], ENT_QUOTES, 'UTF-8');
                    $data[] = $row;
                }
                $stmt->close();
                echo json_encode($data);
            } else {
                throw new Exception("Invalid type specified");
            }
        } else {
            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required.");
            }

            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = $page * $limit;
            $branch_id = isset($_GET['branch_id']) ? (int)$_GET['branch_id'] : null;

            $sql = "
                SELECT 
                    o.OvertimeID,
                    o.Date,
                    o.EmployeeID,
                    e.EmployeeName,
                    b.BranchName,
                    o.`No. of Hours` AS No_of_Hours,
                    o.`No. of Mins` AS No_of_Mins,
                    o.Rate AS Rate,
                    o.BranchID
                FROM overtime o
                JOIN employees e ON o.EmployeeID = e.EmployeeID
                JOIN branches b ON o.BranchID = b.BranchID
            ";

            $countSql = "
                SELECT COUNT(*) as total
                FROM overtime o
                JOIN employees e ON o.EmployeeID = e.EmployeeID
                JOIN branches b ON o.BranchID = b.BranchID
            ";

            $params = [];
            $types = "";
            $whereClauses = [];

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

                if (empty($allowedBranches)) {
                    echo json_encode(["success" => true, "data" => [], "total" => 0]);
                    exit;
                }

                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $whereClauses[] = "o.BranchID IN ($placeholders)";
                $types .= str_repeat('i', count($allowedBranches));
                $params = array_merge($params, $allowedBranches);
            }

            if ($branch_id !== null) {
                $whereClauses[] = "o.BranchID = ?";
                $types .= "i";
                $params[] = $branch_id;
            }

            if (!empty($whereClauses)) {
                $sql .= " WHERE " . implode(' AND ', $whereClauses);
                $countSql .= " WHERE " . implode(' AND ', $whereClauses);
            }

            $countStmt = $conn->prepare($countSql);
            if ($types) {
                $countStmt->bind_param($types, ...$params);
            }
            $countStmt->execute();
            $countResult = $countStmt->get_result();
            $total = $countResult->fetch_assoc()['total'];
            $countStmt->close();

            $sql .= " ORDER BY o.Date DESC LIMIT ? OFFSET ?";
            $types .= "ii";
            $params[] = $limit;
            $params[] = $offset;

            $stmt = $conn->prepare($sql);
            if ($types) {
                $stmt->bind_param($types, ...$params);
            }
            $stmt->execute();
            $result = $stmt->get_result();
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $row['EmployeeName'] = htmlspecialchars($row['EmployeeName'], ENT_QUOTES, 'UTF-8');
                $row['BranchName'] = htmlspecialchars($row['BranchName'], ENT_QUOTES, 'UTF-8');
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

        $conn->begin_transaction();
        try {
            if (is_array($data) && isset($data[0])) {
                $successCount = 0;
                $errors = [];
                foreach ($data as $index => $row) {
                    if (!isset($row["Date"]) || empty(trim($row["Date"])) ||
                        !isset($row["No_of_Hours"]) || !is_numeric($row["No_of_Hours"]) ||
                        !isset($row["No_of_Mins"]) || !is_numeric($row["No_of_Mins"]) ||
                        !isset($row["Rate"]) || !is_numeric($row["Rate"])) {
                        $errors[] = "Row " . ($index + 1) . ": Missing or invalid required fields (Date, No. of Hours, No. of Mins, Rate).";
                        continue;
                    }

                    $row["Date"] = sanitizeInput($row["Date"]);
                    $row["No_of_Hours"] = (int)$row["No_of_Hours"];
                    $row["No_of_Mins"] = (int)$row["No_of_Mins"];
                    $row["Rate"] = (float)$row["Rate"];

                    if ($row["No_of_Hours"] < 0 || $row["No_of_Hours"] > 12) {
                        $errors[] = "Row " . ($index + 1) . ": Hours must be between 0 and 12.";
                        continue;
                    }
                    if ($row["No_of_Mins"] < 0 || $row["No_of_Mins"] > 59) {
                        $errors[] = "Row " . ($index + 1) . ": Minutes must be between 0 and 59.";
                        continue;
                    }
                    if ($row["Rate"] < 0) {
                        $errors[] = "Row " . ($index + 1) . ": Rate must be non-negative.";
                        continue;
                    }

                    if (isset($row["EmployeeName"]) && isset($row["BranchName"])) {
                        [$branchId, $branchError] = getBranchIdByName($conn, $row["BranchName"]);
                        if ($branchId === null) {
                            $errors[] = "Row " . ($index + 1) . ": " . $branchError;
                            continue;
                        }

                        [$employeeId, $employeeError] = getEmployeeIdByName($conn, $row["EmployeeName"], $branchId);
                        if ($employeeId === null) {
                            $errors[] = "Row " . ($index + 1) . ": " . $employeeError;
                            continue;
                        }

                        if ($role === 'Payroll Staff') {
                            $stmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ? AND BranchID = ?");
                            $stmt->bind_param("ii", $user_id, $branchId);
                            $stmt->execute();
                            $stmt->store_result();
                            if ($stmt->num_rows === 0) {
                                $errors[] = "Row " . ($index + 1) . ": Branch '$row[BranchName]' not assigned to user.";
                                $stmt->close();
                                continue;
                            }
                            $stmt->close();
                        }

                        if (checkDuplicateOvertime($conn, $row["Date"], $employeeId, $branchId)) {
                            $errors[] = "Row " . ($index + 1) . "Warning: An employee with this cash advance record already exists.";
                            continue;
                        }

                        $stmt = $conn->prepare("
                            INSERT INTO overtime (Date, EmployeeID, BranchID, `No. of Hours`, `No. of Mins`, Rate) 
                            VALUES (?, ?, ?, ?, ?, ?)
                        ");
                        $hours = $row["No_of_Hours"];
                        $mins = $row["No_of_Mins"];
                        $rate = $row["Rate"];
                        $stmt->bind_param("siiidd", $row["Date"], $employeeId, $branchId, $hours, $mins, $rate);

                        if ($stmt->execute()) {
                            $successCount++;
                            $overtimeId = $conn->insert_id;
                            $employeeName = getEmployeeNameById($conn, $employeeId) ?? "Unknown Employee";
                            $formattedDate = formatDate($row["Date"]) ?? $row["Date"];
                            $description = "Overtime for $employeeName on $formattedDate added via CSV";
                            logUserActivity($conn, $user_id, "ADD_DATA", "Overtime", $overtimeId, $description);
                        } else {
                            $errors[] = "Row " . ($index + 1) . ": Failed to add overtime: " . $stmt->error;
                        }
                        $stmt->close();
                    } else {
                        $errors[] = "Row " . ($index + 1) . ": EmployeeName and BranchName are required for CSV import.";
                        continue;
                    }
                }

                $description = "CSV upload: $successCount overtime records added";
                logUserActivity($conn, $user_id, "UPLOAD_DATA", "Overtime", null, $description);

                $conn->commit();
                $response = ["success" => true, "successCount" => $successCount];
                if (!empty($errors)) {
                    $response["success"] = false;
                    $response["warning"] = "Some records could not be imported.";
                    $response["errors"] = $errors;
                }
                echo json_encode($response);
            } else {
                if (empty(trim($data["Date"])) || 
                    !isset($data["EmployeeID"]) || !is_numeric($data["EmployeeID"]) || 
                    !isset($data["BranchID"]) || !is_numeric($data["BranchID"]) || 
                    !isset($data["No_of_Hours"]) || !is_numeric($data["No_of_Hours"]) || 
                    !isset($data["No_of_Mins"]) || !is_numeric($data["No_of_Mins"]) || 
                    !isset($data["Rate"]) || !is_numeric($data["Rate"])) {
                    throw new Exception("All fields are required and must be valid");
                }

                $data["Date"] = sanitizeInput($data["Date"]);
                $data["EmployeeID"] = (int)$data["EmployeeID"];
                $data["BranchID"] = (int)$data["BranchID"];
                $data["No_of_Hours"] = (int)$data["No_of_Hours"];
                $data["No_of_Mins"] = (int)$data["No_of_Mins"];
                $data["Rate"] = (float)$data["Rate"];

                if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                    throw new Exception("Invalid EmployeeID");
                }
                if (!recordExists($conn, "branches", $data["BranchID"])) {
                    throw new Exception("Invalid BranchID");
                }

                if ($data["No_of_Hours"] < 0 || $data["No_of_Hours"] > 12) {
                    throw new Exception("Hours must be between 0 and 12");
                }
                if ($data["No_of_Mins"] < 0 || $data["No_of_Mins"] > 59) {
                    throw new Exception("Minutes must be between 0 and 59");
                }
                if ($data["Rate"] < 0) {
                    throw new Exception("Rate must be non-negative");
                }

                if ($role === 'Payroll Staff') {
                    $stmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ? AND BranchID = ?");
                    $stmt->bind_param("ii", $user_id, $data["BranchID"]);
                    $stmt->execute();
                    $stmt->store_result();
                    if ($stmt->num_rows === 0) {
                        $stmt->close();
                        throw new Exception("Branch not assigned to user");
                    }
                    $stmt->close();
                }

                if (checkDuplicateOvertime($conn, $data["Date"], $data["EmployeeID"], $data["BranchID"])) {
                    echo json_encode(["success" => false, "warning" => "Warning: An employee with this overtime record already exists."]);
                    $conn->commit();
                    exit;
                }

                $hours = $data["No_of_Hours"];
                $mins = $data["No_of_Mins"];
                $rate = $data["Rate"];

                $stmt = $conn->prepare("
                    INSERT INTO overtime (Date, EmployeeID, BranchID, `No. of Hours`, `No. of Mins`, Rate) 
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                $stmt->bind_param("siiidd", $data["Date"], $data["EmployeeID"], $data["BranchID"], $hours, $mins, $rate);

                if ($stmt->execute()) {
                    $overtimeId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]) ?? "Unknown Employee";
                    $formattedDate = formatDate($data["Date"]) ?? $data["Date"];
                    $description = "Overtime for $employeeName on $formattedDate added";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Overtime", $overtimeId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $overtimeId]);
                } else {
                    throw new Exception("Failed to add overtime: " . $stmt->error);
                }
                $stmt->close();
            }
        } catch (Exception $e) {
            $conn->rollback();
            error_log("POST error: " . $e->getMessage());
            throw $e;
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        if (empty($data["OvertimeID"]) || 
            empty(trim($data["Date"])) || 
            !isset($data["EmployeeID"]) || !is_numeric($data["EmployeeID"]) || 
            !isset($data["BranchID"]) || !is_numeric($data["BranchID"]) || 
            !isset($data["No_of_Hours"]) || !is_numeric($data["No_of_Hours"]) || 
            !isset($data["No_of_Mins"]) || !is_numeric($data["No_of_Mins"]) || 
            !isset($data["Rate"]) || !is_numeric($data["Rate"])) {
            throw new Exception("All fields are required and must be valid");
        }

        $data["OvertimeID"] = (int)$data["OvertimeID"];
        $data["Date"] = sanitizeInput($data["Date"]);
        $data["EmployeeID"] = (int)$data["EmployeeID"];
        $data["BranchID"] = (int)$data["BranchID"];
        $data["No_of_Hours"] = (int)$data["No_of_Hours"];
        $data["No_of_Mins"] = (int)$data["No_of_Mins"];
        $data["Rate"] = (float)$data["Rate"];

        if (!recordExists($conn, "employees", $data["EmployeeID"])) {
            throw new Exception("Invalid EmployeeID");
        }
        if (!recordExists($conn, "branches", $data["BranchID"])) {
            throw new Exception("Invalid BranchID");
        }

        if ($data["No_of_Hours"] < 0 || $data["No_of_Hours"] > 12) {
            throw new Exception("Hours must be between 0 and 12");
        }
        if ($data["No_of_Mins"] < 0 || $data["No_of_Mins"] > 59) {
            throw new Exception("Minutes must be between 0 and 59");
        }
        if ($data["Rate"] < 0) {
            throw new Exception("Rate must be non-negative");
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT `No. of Hours`, `No. of Mins`, Rate FROM overtime WHERE OvertimeID = ?");
            $stmt->bind_param("i", $data["OvertimeID"]);
            $stmt->execute();
            $result = $stmt->get_result();
            $currentRecord = $result->fetch_assoc();
            $stmt->close();

            if (!$currentRecord) {
                throw new Exception("Overtime record not found");
            }

            if (checkDuplicateOvertime($conn, $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["OvertimeID"])) {
                echo json_encode(["success" => false, "warning" => "Warning: An employee with this overtime record already exists."]);
                $conn->commit();
                exit;
            }

            $changes = [];
            $hours = (int)$data["No_of_Hours"];
            $mins = (int)$data["No_of_Mins"];
            $rate = (float)$data["Rate"];
            $currentHours = isset($currentRecord['No. of Hours']) ? (int)$currentRecord['No. of Hours'] : 0;
            $currentMins = isset($currentRecord['No. of Mins']) ? (int)$currentRecord['No. of Mins'] : 0;
            $currentRate = isset($currentRecord['Rate']) ? (float)$currentRecord['Rate'] : 0.0;

            if ($currentHours !== $hours) {
                $changes[] = "Hours from $currentHours to $hours";
            }
            if ($currentMins !== $mins) {
                $changes[] = "Minutes from $currentMins to $mins";
            }
            if ($currentRate !== $rate) {
                $changes[] = "Rate from $currentRate to $rate";
            }

            $stmt = $conn->prepare("
                UPDATE overtime 
                SET Date = ?, EmployeeID = ?, BranchID = ?, `No. of Hours` = ?, `No. of Mins` = ?, Rate = ? 
                WHERE OvertimeID = ?
            ");
            $stmt->bind_param("siiiddi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $hours, $mins, $rate, $data["OvertimeID"]);

            if ($stmt->execute()) {
                $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]) ?? "Unknown Employee";
                $formattedDate = formatDate($data["Date"]) ?? $data["Date"];
                $description = empty($changes) ?
                    "Overtime for $employeeName on $formattedDate updated: No changes made" :
                    "Overtime for $employeeName on $formattedDate updated: " . implode('/ ', $changes);
                logUserActivity($conn, $user_id, "UPDATE_DATA", "Overtime", $data["OvertimeID"], $description);
                $conn->commit();
                echo json_encode(["success" => true]);
            } else {
                throw new Exception("Failed to update overtime: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("PUT error: " . $e->getMessage());
            throw $e;
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        if (empty($data["OvertimeID"]) || !is_numeric($data["OvertimeID"])) {
            throw new Exception("Overtime ID is required and must be numeric");
        }

        $data["OvertimeID"] = (int)$data["OvertimeID"];

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT Date, EmployeeID FROM overtime WHERE OvertimeID = ?");
            $stmt->bind_param("i", $data["OvertimeID"]);
            $stmt->execute();
            $result = $stmt->get_result();
            $record = $result->fetch_assoc();
            $stmt->close();

            if (!$record) {
                throw new Exception("Overtime record not found");
            }

            $stmt = $conn->prepare("DELETE FROM overtime WHERE OvertimeID = ?");
            $stmt->bind_param("i", $data["OvertimeID"]);

            if ($stmt->execute()) {
                $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]) ?? "Unknown Employee";
                $formattedDate = formatDate($record["Date"]) ?? $record["Date"];
                $description = "Overtime for $employeeName on $formattedDate deleted";
                logUserActivity($conn, $user_id, "DELETE_DATA", "Overtime", $data["OvertimeID"], $description);
                $conn->commit();
                echo json_encode(["success" => true]);
            } else {
                throw new Exception("Failed to delete overtime: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("DELETE error: " . $e->getMessage());
            throw $e;
        }
    } else {
        throw new Exception("Method not allowed");
    }
} catch (Exception $e) {
    if (isset($conn) && $conn instanceof mysqli) {
        $conn->close();
    }
    http_response_code(500);
    error_log("General error: " . $e->getMessage());
    echo json_encode(["error" => $e->getMessage()]);
}
?>