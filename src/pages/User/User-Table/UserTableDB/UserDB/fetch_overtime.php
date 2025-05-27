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

session_start();

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
        if ($id === null) {
            return true; // Allow NULL for BranchID
        }
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
        $sql = "SELECT OvertimeID FROM overtime WHERE Date = ? AND EmployeeID = ?";
        $params = [$date, $employeeId];
        $types = "si";

        if ($branchId !== null) {
            $sql .= " AND BranchID = ?";
            $types .= "i";
            $params[] = (int)$branchId;
        } else {
            $sql .= " AND BranchID IS NULL";
        }

        if ($excludeOvertimeId !== null) {
            $sql .= " AND OvertimeID != ?";
            $types .= "i";
            $params[] = (int)$excludeOvertimeId;
        }

        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
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
        if (empty($branchName)) {
            return [null, null]; // Allow empty BranchName to set BranchID to NULL
        }
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

    function getBranchNameById($conn, $branchId) {
        if ($branchId === null) {
            return "None";
        }
        $branchId = (int)$branchId;
        $stmt = $conn->prepare("SELECT BranchName FROM branches WHERE BranchID = ?");
        $stmt->bind_param("i", $branchId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $stmt->close();
            return htmlspecialchars($row['BranchName'], ENT_QUOTES, 'UTF-8');
        }
        $stmt->close();
        return "Branch ID $branchId";
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

    function validateTime($time) {
        return preg_match("/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/", $time);
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
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
            $start_date = isset($_GET['start_date']) ? sanitizeInput($_GET['start_date']) : null;
            $end_date = isset($_GET['end_date']) ? sanitizeInput($_GET['end_date']) : null;

            $sql = "
                SELECT 
                    o.OvertimeID,
                    o.Date,
                    o.EmployeeID,
                    e.EmployeeName,
                    b.BranchName,
                    o.`No. of Hours` AS No_of_Hours,
                    o.BranchID,
                    o.StartOvertime1,
                    o.EndOvertime1,
                    o.StartOvertime2,
                    o.EndOvertime2
                FROM overtime o
                JOIN employees e ON o.EmployeeID = e.EmployeeID
                LEFT JOIN branches b ON o.BranchID = b.BranchID
            ";

            $countSql = "
                SELECT COUNT(*) as total
                FROM overtime o
                JOIN employees e ON o.EmployeeID = e.EmployeeID
                LEFT JOIN branches b ON o.BranchID = b.BranchID
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

                if ($branch_id !== null) {
                    if (in_array($branch_id, $allowedBranches)) {
                        $whereClauses[] = "o.BranchID = ?";
                        $types .= "i";
                        $params[] = $branch_id;
                    } else {
                        echo json_encode(["success" => true, "data" => [], "total" => 0]);
                        exit;
                    }
                } else {
                    $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                    $whereClauses[] = "(o.BranchID IN ($placeholders) OR o.BranchID IS NULL)";
                    $types .= str_repeat('i', count($allowedBranches));
                    $params = array_merge($params, $allowedBranches);
                }
            } else {
                if ($branch_id !== null) {
                    $whereClauses[] = "o.BranchID = ?";
                    $types .= "i";
                    $params[] = $branch_id;
                }
            }

            if ($start_date && $end_date) {
                $whereClauses[] = "o.Date BETWEEN ? AND ?";
                $types .= "ss";
                $params[] = $start_date;
                $params[] = $end_date;
            }

            if (!empty($whereClauses)) {
                $sql .= " WHERE " . implode(" AND ", $whereClauses);
                $countSql .= " WHERE " . implode(" AND ", $whereClauses);
            }

            $sql .= " ORDER BY o.Date DESC LIMIT ? OFFSET ?";
            $types .= "ii";
            $params[] = $limit;
            $params[] = $offset;

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed: " . $conn->error);

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) throw new Exception("Prepare failed for count: " . $conn->error);

            if ($types) {
                $stmt->bind_param($types, ...$params);
                $countTypes = substr($types, 0, -2);
                $countParams = array_slice($params, 0, -2);
                if ($countTypes) {
                    $countStmt->bind_param($countTypes, ...$countParams);
                }
            }

            $countStmt->execute();
            $countResult = $countStmt->get_result();
            $total = $countResult->fetch_assoc()['total'];
            $countStmt->close();

            $stmt->execute();
            $result = $stmt->get_result();
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $row['EmployeeName'] = htmlspecialchars($row['EmployeeName'], ENT_QUOTES, 'UTF-8');
                $row['BranchName'] = $row['BranchName'] ? htmlspecialchars($row['BranchName'], ENT_QUOTES, 'UTF-8') : null;
                $data[] = $row;
            }
            $stmt->close();

            echo json_encode([
                "success" => true,
                "data" => $data,
                "total" => $total
            ]);
        }
    } elseif ($method == "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid data format. Please ensure the request contains valid JSON.");
        }

        if (!$user_id || !$role) {
            throw new Exception("user_id and role are required.");
        }

        if (is_array($data) && isset($data[0])) {
            $successCount = 0;
            $updatedCount = 0;
            $duplicateCount = 0;
            $errors = [];
            $validRecords = 0;

            $conn->begin_transaction();
            try {
                foreach ($data as $index => $record) {
                    if (!isset($record["Date"]) || empty($record["Date"]) ||
                        !isset($record["EmployeeName"]) || empty($record["EmployeeName"]) ||
                        !isset($record["No_of_Hours"]) || $record["No_of_Hours"] === '') {
                        $errors[] = "Row " . ($index + 1) . ": Missing required fields (Date, EmployeeName, No. of Hours).";
                        continue;
                    }

                    if (!isset($record["StartOvertime1"]) || empty($record["StartOvertime1"]) ||
                        !isset($record["EndOvertime1"]) || empty($record["EndOvertime1"])) {
                        $errors[] = "Row " . ($index + 1) . ": StartOvertime1 and EndOvertime1 are required.";
                        continue;
                    }

                    if (!validateTime($record["StartOvertime1"]) || !validateTime($record["EndOvertime1"])) {
                        $errors[] = "Row " . ($index + 1) . ": StartOvertime1 and EndOvertime1 must be in HH:mm format.";
                        continue;
                    }

                    if (isset($record["StartOvertime2"]) && !empty($record["StartOvertime2"]) &&
                        (!validateTime($record["StartOvertime2"]) || !isset($record["EndOvertime2"]) || !validateTime($record["EndOvertime2"]))) {
                        $errors[] = "Row " . ($index + 1) . ": StartOvertime2 and EndOvertime2 must be in HH:mm format if provided.";
                        continue;
                    }

                    $hours = (int)$record["No_of_Hours"];
                    if ($hours < 0 || $hours > 12) {
                        $errors[] = "Row " . ($index + 1) . ": No. of Hours must be between 0 and 12.";
                        continue;
                    }

                    list($employeeId, $employeeError) = getEmployeeIdByName($conn, $record["EmployeeName"], isset($record["BranchName"]) ? getBranchIdByName($conn, $record["BranchName"])[0] : null);
                    if ($employeeError) {
                        $errors[] = "Row " . ($index + 1) . ": $employeeError";
                        continue;
                    }

                    $branchId = null;
                    $branchError = null;
                    if (isset($record["BranchName"]) && !empty($record["BranchName"])) {
                        list($branchId, $branchError) = getBranchIdByName($conn, $record["BranchName"]);
                        if ($branchError) {
                            $errors[] = "Row " . ($index + 1) . ": $branchError";
                            continue;
                        }
                    }

                    if (!recordExists($conn, "employees", $employeeId)) {
                        $errors[] = "Row " . ($index + 1) . ": Invalid Employee ID: $employeeId.";
                        continue;
                    }
                    if ($branchId !== null && !recordExists($conn, "branches", $branchId)) {
                        $errors[] = "Row " . ($index + 1) . ": Invalid Branch ID: $branchId.";
                        continue;
                    }

                    $validRecords++;

                    if (checkDuplicateOvertime($conn, $record["Date"], $employeeId, $branchId)) {
                        $existingStmt = $conn->prepare("
                            SELECT OvertimeID, Date, EmployeeID, BranchID, `No. of Hours`, StartOvertime1, EndOvertime1, StartOvertime2, EndOvertime2
                            FROM overtime 
                            WHERE Date = ? AND EmployeeID = ? AND (BranchID = ? OR (BranchID IS NULL AND ? IS NULL))
                        ");
                        $existingStmt->bind_param("siii", $record["Date"], $employeeId, $branchId, $branchId);
                        $existingStmt->execute();
                        $result = $existingStmt->get_result();
                        $existingRecord = $result->fetch_assoc();
                        $existingStmt->close();

                        $changes = [];
                        if ($existingRecord["No. of Hours"] != $record["No_of_Hours"]) {
                            $changes[] = "No. of Hours from '{$existingRecord["No. of Hours"]}' to '{$record["No_of_Hours"]}'";
                        }
                        if ($existingRecord["BranchID"] != $branchId) {
                            $oldBranchName = getBranchNameById($conn, $existingRecord["BranchID"]);
                            $newBranchName = getBranchNameById($conn, $branchId);
                            $changes[] = "Branch from '$oldBranchName' to '$newBranchName'";
                        }
                        if ($existingRecord["StartOvertime1"] != $record["StartOvertime1"]) {
                            $changes[] = "StartOvertime1 from '{$existingRecord["StartOvertime1"]}' to '{$record["StartOvertime1"]}'";
                        }
                        if ($existingRecord["EndOvertime1"] != $record["EndOvertime1"]) {
                            $changes[] = "EndOvertime1 from '{$existingRecord["EndOvertime1"]}' to '{$record["EndOvertime1"]}'";
                        }
                        if ($existingRecord["StartOvertime2"] != ($record["StartOvertime2"] ?? null)) {
                            $changes[] = "StartOvertime2 from '{$existingRecord["StartOvertime2"]}' to '" . ($record["StartOvertime2"] ?? 'null') . "'";
                        }
                        if ($existingRecord["EndOvertime2"] != ($record["EndOvertime2"] ?? null)) {
                            $changes[] = "EndOvertime2 from '{$existingRecord["EndOvertime2"]}' to '" . ($record["EndOvertime2"] ?? 'null') . "'";
                        }

                        if (empty($changes)) {
                            $duplicateCount++;
                            continue;
                        }

                        $stmt = $conn->prepare("
                            UPDATE overtime 
                            SET BranchID = ?, `No. of Hours` = ?, StartOvertime1 = ?, EndOvertime1 = ?, StartOvertime2 = ?, EndOvertime2 = ? 
                            WHERE OvertimeID = ?
                        ");
                        $startOvertime2 = isset($record["StartOvertime2"]) ? $record["StartOvertime2"] : null;
                        $endOvertime2 = isset($record["EndOvertime2"]) ? $record["EndOvertime2"] : null;
                        $stmt->bind_param("iissssi", $branchId, $record["No_of_Hours"], $record["StartOvertime1"], $record["EndOvertime1"], $startOvertime2, $endOvertime2, $existingRecord["OvertimeID"]);

                        if ($stmt->execute()) {
                            $updatedCount++;
                            $employeeName = getEmployeeNameById($conn, $employeeId);
                            $formattedDate = formatDate($record["Date"]);
                            $description = "Overtime for '$employeeName' on '$formattedDate' updated: " . implode('/ ', $changes);
                            logUserActivity($conn, $user_id, "UPDATE_DATA", "Overtime", $existingRecord["OvertimeID"], $description);
                        } else {
                            $errors[] = "Row " . ($index + 1) . ": Unable to update overtime record.";
                        }
                        $stmt->close();
                    } else {
                        $stmt = $conn->prepare("
                            INSERT INTO overtime (Date, EmployeeID, BranchID, `No. of Hours`, StartOvertime1, EndOvertime1, StartOvertime2, EndOvertime2)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ");
                        $startOvertime2 = isset($record["StartOvertime2"]) ? $record["StartOvertime2"] : null;
                        $endOvertime2 = isset($record["EndOvertime2"]) ? $record["EndOvertime2"] : null;
                        $stmt->bind_param("siisssss", $record["Date"], $employeeId, $branchId, $record["No_of_Hours"], $record["StartOvertime1"], $record["EndOvertime1"], $startOvertime2, $endOvertime2);

                        if ($stmt->execute()) {
                            $successCount++;
                            $overtimeId = $conn->insert_id;
                            $employeeName = getEmployeeNameById($conn, $employeeId);
                            $formattedDate = formatDate($record["Date"]);
                            $description = "Overtime for '$employeeName' on '$formattedDate' added";
                            logUserActivity($conn, $user_id, "ADD_DATA", "Overtime", $overtimeId, $description);
                        } else {
                            $errors[] = "Row " . ($index + 1) . ": Unable to add overtime record.";
                        }
                        $stmt->close();
                    }
                }

                $description = "CSV upload: $successCount records added, $updatedCount records updated";
                logUserActivity($conn, $user_id, "UPLOAD_DATA", "Overtime", null, $description);

                $conn->commit();

                $response = [
                    "success" => true,
                    "successCount" => $successCount,
                    "updatedCount" => $updatedCount,
                ];

                if ($successCount === 0 && $updatedCount === 0) {
                    if ($validRecords > 0 && $duplicateCount === $validRecords) {
                        $response["allDuplicates"] = true;
                    } elseif (!empty($errors)) {
                        $response["errors"] = $errors;
                    } else {
                        $response["errors"] = ["No valid records were processed."];
                    }
                }

                echo json_encode($response);
            } catch (Exception $e) {
                $conn->rollback();
                throw new Exception("CSV upload failed: " . $e->getMessage());
            }
        } else {
            if (!isset($data["Date"]) || empty($data["Date"]) ||
                !isset($data["EmployeeID"]) || empty($data["EmployeeID"]) ||
                !isset($data["No_of_Hours"]) || $data["No_of_Hours"] === '' ||
                !isset($data["StartOvertime1"]) || empty($data["StartOvertime1"]) ||
                !isset($data["EndOvertime1"]) || empty($data["EndOvertime1"])) {
                throw new Exception("All required fields (Date, EmployeeID, No. of Hours, StartOvertime1, EndOvertime1) must be provided.");
            }

            $hours = (int)$data["No_of_Hours"];
            if ($hours < 0 || $hours > 12) {
                throw new Exception("No. of Hours must be between 0 and 12.");
            }

            if (!validateTime($data["StartOvertime1"]) || !validateTime($data["EndOvertime1"])) {
                throw new Exception("StartOvertime1 and EndOvertime1 must be in HH:mm format.");
            }

            if (isset($data["StartOvertime2"]) && !empty($data["StartOvertime2"]) &&
                (!validateTime($data["StartOvertime2"]) || !isset($data["EndOvertime2"]) || !validateTime($data["EndOvertime2"]))) {
                throw new Exception("StartOvertime2 and EndOvertime2 must be in HH:mm format if provided.");
            }

            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid Employee ID.");
            }
            if (isset($data["BranchID"]) && $data["BranchID"] !== null && !recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid Branch ID.");
            }

            if (checkDuplicateOvertime($conn, $data["Date"], $data["EmployeeID"], $data["BranchID"])) {
                $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                $formattedDate = formatDate($data["Date"]);
                throw new Exception("An overtime record for $employeeName on $formattedDate already exists.");
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("
                    INSERT INTO overtime (Date, EmployeeID, BranchID, `No. of Hours`, StartOvertime1, EndOvertime1, StartOvertime2, EndOvertime2)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $startOvertime2 = isset($data["StartOvertime2"]) ? $data["StartOvertime2"] : null;
                $endOvertime2 = isset($data["EndOvertime2"]) ? $data["EndOvertime2"] : null;
                $stmt->bind_param("siisssss", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["No_of_Hours"], $data["StartOvertime1"], $data["EndOvertime1"], $startOvertime2, $endOvertime2);

                if ($stmt->execute()) {
                    $overtimeId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $formattedDate = formatDate($data["Date"]);
                    $description = "Overtime for '$employeeName' on '$formattedDate' added";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Overtime", $overtimeId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "message" => "Overtime record added successfully.", "id" => $overtimeId]);
                } else {
                    throw new Exception("Unable to add overtime record.");
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid data format. Please ensure the request contains valid JSON.");
        }

        if (!$user_id || !$role) {
            throw new Exception("user_id and role are required.");
        }

        if (!isset($data["OvertimeID"]) || empty($data["OvertimeID"]) ||
            !isset($data["Date"]) || empty($data["Date"]) ||
            !isset($data["EmployeeID"]) || empty($data["EmployeeID"]) ||
            !isset($data["No_of_Hours"]) || $data["No_of_Hours"] === '' ||
            !isset($data["StartOvertime1"]) || empty($data["StartOvertime1"]) ||
            !isset($data["EndOvertime1"]) || empty($data["EndOvertime1"])) {
            throw new Exception("All required fields (OvertimeID, Date, EmployeeID, No. of Hours, StartOvertime1, EndOvertime1) must be provided.");
        }

        $hours = (int)$data["No_of_Hours"];
        if ($hours < 0 || $hours > 12) {
            throw new Exception("No. of Hours must be between 0 and 12.");
        }

        if (!validateTime($data["StartOvertime1"]) || !validateTime($data["EndOvertime1"])) {
            throw new Exception("StartOvertime1 and EndOvertime1 must be in HH:mm format.");
        }

        if (isset($data["StartOvertime2"]) && !empty($data["StartOvertime2"]) &&
            (!validateTime($data["StartOvertime2"]) || !isset($data["EndOvertime2"]) || !validateTime($data["EndOvertime2"]))) {
            throw new Exception("StartOvertime2 and EndOvertime2 must be in HH:mm format if provided.");
        }

        if (!recordExists($conn, "employees", $data["EmployeeID"])) {
            throw new Exception("Invalid Employee ID.");
        }
        if (isset($data["BranchID"]) && $data["BranchID"] !== null && !recordExists($conn, "branches", $data["BranchID"])) {
            throw new Exception("Invalid Branch ID.");
        }

        if (checkDuplicateOvertime($conn, $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["OvertimeID"])) {
            $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
            $formattedDate = formatDate($data["Date"]);
            throw new Exception("An overtime record for $employeeName on $formattedDate already exists.");
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("
                SELECT Date, EmployeeID, BranchID, `No. of Hours`, StartOvertime1, EndOvertime1, StartOvertime2, EndOvertime2 
                FROM overtime 
                WHERE OvertimeID = ?
            ");
            $stmt->bind_param("i", $data["OvertimeID"]);
            $stmt->execute();
            $result = $stmt->get_result();
            $currentRecord = $result->fetch_assoc();
            $stmt->close();

            if (!$currentRecord) {
                throw new Exception("Overtime record with ID {$data["OvertimeID"]} not found.");
            }

            $changes = [];
            if ($currentRecord["Date"] != $data["Date"]) {
                $oldDate = formatDate($currentRecord["Date"]);
                $newDate = formatDate($data["Date"]);
                $changes[] = "Date from '$oldDate' to '$newDate'";
            }
            if ($currentRecord["EmployeeID"] != $data["EmployeeID"]) {
                $oldEmployeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                $newEmployeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                $changes[] = "Employee from '$oldEmployeeName' to '$newEmployeeName'";
            }
            if ($currentRecord["BranchID"] != ($data["BranchID"] ?? null)) {
                $oldBranchName = getBranchNameById($conn, $currentRecord["BranchID"]);
                $newBranchName = getBranchNameById($conn, $data["BranchID"] ?? null);
                $changes[] = "Branch from '$oldBranchName' to '$newBranchName'";
            }
            if ($currentRecord["No. of Hours"] != $data["No_of_Hours"]) {
                $changes[] = "No. of Hours from '{$currentRecord["No. of Hours"]}' to '{$data["No_of_Hours"]}'";
            }
            if ($currentRecord["StartOvertime1"] != $data["StartOvertime1"]) {
                $changes[] = "StartOvertime1 from '{$currentRecord["StartOvertime1"]}' to '{$data["StartOvertime1"]}'";
            }
            if ($currentRecord["EndOvertime1"] != $data["EndOvertime1"]) {
                $changes[] = "EndOvertime1 from '{$currentRecord["EndOvertime1"]}' to '{$data["EndOvertime1"]}'";
            }
            if ($currentRecord["StartOvertime2"] != ($data["StartOvertime2"] ?? null)) {
                $changes[] = "StartOvertime2 from '{$currentRecord["StartOvertime2"]}' to '" . ($data["StartOvertime2"] ?? 'null') . "'";
            }
            if ($currentRecord["EndOvertime2"] != ($data["EndOvertime2"] ?? null)) {
                $changes[] = "EndOvertime2 from '{$currentRecord["EndOvertime2"]}' to '" . ($data["EndOvertime2"] ?? 'null') . "'";
            }

            $stmt = $conn->prepare("
                UPDATE overtime 
                SET Date = ?, EmployeeID = ?, BranchID = ?, `No. of Hours` = ?, StartOvertime1 = ?, EndOvertime1 = ?, StartOvertime2 = ?, EndOvertime2 = ? 
                WHERE OvertimeID = ?
            ");
            $startOvertime2 = isset($data["StartOvertime2"]) ? $data["StartOvertime2"] : null;
            $endOvertime2 = isset($data["EndOvertime2"]) ? $data["EndOvertime2"] : null;
            $stmt->bind_param("siisssssi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["No_of_Hours"], $data["StartOvertime1"], $data["EndOvertime1"], $startOvertime2, $endOvertime2, $data["OvertimeID"]);

            if ($stmt->execute()) {
                $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                $formattedDate = formatDate($data["Date"]);
                $description = empty($changes)
                    ? "Overtime for '$employeeName' on '$formattedDate' updated: No changes made"
                    : "Overtime for '$employeeName' on '$formattedDate' updated: " . implode('/ ', $changes);
                logUserActivity($conn, $user_id, "UPDATE_DATA", "Overtime", $data["OvertimeID"], $description);
                $conn->commit();
                echo json_encode(["success" => true, "message" => "Overtime record updated successfully."]);
            } else {
                throw new Exception("Unable to update overtime record.");
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            throw $e;
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data || empty($data["OvertimeID"])) {
            throw new Exception("OvertimeID is required to delete an overtime record.");
        }

        if (!$user_id || !$role) {
            throw new Exception("user_id and role are required.");
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT EmployeeID, Date FROM overtime WHERE OvertimeID = ?");
            $stmt->bind_param("i", $data["OvertimeID"]);
            $stmt->execute();
            $result = $stmt->get_result();
            $record = $result->fetch_assoc();
            $stmt->close();

            if (!$record) {
                throw new Exception("Overtime record with ID {$data["OvertimeID"]} not found.");
            }

            $stmt = $conn->prepare("DELETE FROM overtime WHERE OvertimeID = ?");
            $stmt->bind_param("i", $data["OvertimeID"]);

            if ($stmt->execute()) {
                $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                $formattedDate = formatDate($record["Date"]);
                $description = "Overtime for $employeeName on $formattedDate deleted";
                logUserActivity($conn, $user_id, "DELETE_DATA", "Overtime", $data["OvertimeID"], $description);
                $conn->commit();
                echo json_encode(["success" => true, "message" => "Overtime record deleted successfully."]);
            } else {
                throw new Exception("Unable to delete overtime record.");
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            throw $e;
        }
    } else {
        throw new Exception("Invalid request method.");
    }

    $conn->close();
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
    error_log("Error: " . $e->getMessage());
}
?>