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

    function getUserIdByRole($conn, $role) {
        $stmt = $conn->prepare("SELECT UserID FROM useraccounts WHERE Role = ? LIMIT 1");
        if (!$stmt) {
            error_log("Prepare failed for getUserIdByRole: " . $conn->error);
            throw new Exception("Failed to fetch user ID: " . $conn->error);
        }
        $stmt->bind_param("s", $role);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $userId = (int)$row['UserID'];
            $stmt->close();
            return $userId;
        }
        $stmt->close();
        throw new Exception("No user found for role: $role");
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
            'contributions' => 'ContributionID',
            'branches' => 'BranchID',
            'useraccounts' => 'UserID',
            'positions' => 'PositionID'
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

    function getPhilHealthContri($conn, $employeeId, $periodStart = null, $periodEnd = null) {
        try {
            if (!recordExists($conn, "employees", $employeeId)) {
                throw new Exception("Invalid EmployeeID: $employeeId does not exist");
            }

            // Fetch HourlyMinWage from contributions or positions
            $stmt = $conn->prepare("
                SELECT c.HourlyMinWage 
                FROM contributions c 
                JOIN employees e ON c.EmployeeID = e.EmployeeID 
                JOIN positions p ON e.PositionID = p.PositionID 
                WHERE c.EmployeeID = ? 
                LIMIT 1
            ");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($row = $result->fetch_assoc()) {
                $hourlyMinWage = floatval($row['HourlyMinWage']);
            } else {
                $stmt = $conn->prepare("
                    SELECT p.HourlyMinimumWage 
                    FROM employees e 
                    JOIN positions p ON e.PositionID = p.PositionID 
                    WHERE e.EmployeeID = ?
                ");
                $stmt->bind_param("i", $employeeId);
                $stmt->execute();
                $result = $stmt->get_result();
                if ($row = $result->fetch_assoc()) {
                    $hourlyMinWage = floatval($row['HourlyMinimumWage']);
                } else {
                    error_log("No hourly wage found for employee ID: $employeeId");
                    return number_format(0.00, 2, '.', '');
                }
            }
            $stmt->close();

            // Sum TotalHours from attendance for the period
            if (!$periodStart) {
                $periodStart = date('Y-m-d', strtotime('-30 days'));
            }
            if (!$periodEnd) {
                $periodEnd = date('Y-m-d');
            }
            $stmt = $conn->prepare("
                SELECT SUM(TotalHours) as total_hours 
                FROM attendance 
                WHERE EmployeeID = ? AND Date BETWEEN ? AND ? AND TimeInStatus IN ('On-Time', 'Late')
            ");
            $stmt->bind_param("iss", $employeeId, $periodStart, $periodEnd);
            $stmt->execute();
            $result = $stmt->get_result();
            $totalHours = $result->fetch_assoc()['total_hours'] ?? 0;
            $stmt->close();

            if ($totalHours <= 0) {
                error_log("No valid attendance hours found for employee ID: $employeeId between $periodStart and $periodEnd");
                return number_format(0.00, 2, '.', '');
            }

            // Calculate basic pay based on actual hours
            $basicPay = $hourlyMinWage * $totalHours;
            // Exclude transportation allowance (assuming 100.00 per day, estimate days from total hours)
            $estimatedDays = $totalHours / 8; // Rough estimate of days worked
            $basicPay -= (100.00 * $estimatedDays);
            // Convert to monthly equivalent
            $monthlyFactor = 365 / 12;
            $monthlyBasicPay = ($basicPay / $estimatedDays) * $monthlyFactor;
            $assessedSalary = min(max($monthlyBasicPay, 10000), 100000);
            $totalContriAmount = $assessedSalary * 0.05;
            $employeeShare = $totalContriAmount / 2;
            return number_format((float)$employeeShare, 2, '.', '');
        } catch (Exception $e) {
            error_log("Error calculating PhilHealth contribution for employee ID $employeeId: " . $e->getMessage());
            return number_format(0.00, 2, '.', '');
        }
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $role = isset($_GET['role']) ? $_GET['role'] : null;
    $search = isset($_GET['search']) ? trim($_GET['search']) : '';

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            if ($type == 'employees') {
                if (!$role) {
                    throw new Exception("role is required for fetching employees.");
                }

                if ($role === 'Payroll Staff') {
                    $userId = getUserIdByRole($conn, $role);
                    $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                    if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
                    $branchStmt->bind_param("i", $userId);
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
            } elseif ($type == 'employee_details') {
                $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
                if (!$employeeId) {
                    throw new Exception("employee_id is required");
                }
                $stmt = $conn->prepare("
                    SELECT p.HourlyMinimumWage 
                    FROM employees e 
                    JOIN positions p ON e.PositionID = p.PositionID 
                    WHERE e.EmployeeID = ?
                ");
                $stmt->bind_param("i", $employeeId);
                $stmt->execute();
                $result = $stmt->get_result();
                if ($row = $result->fetch_assoc()) {
                    echo json_encode($row);
                } else {
                    echo json_encode(['HourlyMinimumWage' => 0]);
                }
                $stmt->close();
                exit;
            } else {
                throw new Exception("Invalid type specified");
            }
        } else {
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = $page * $limit;
            $branch_id = isset($_GET['branch_id']) ? (int)$_GET['branch_id'] : null;

            if (!$role) {
                throw new Exception("role is required for contributions fetch.");
            }

            $params = [];
            $types = '';
            $countParams = [];
            $countTypes = '';

            if ($role === 'Payroll Staff') {
                $userId = getUserIdByRole($conn, $role);
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
                $branchStmt->bind_param("i", $userId);
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
                            FROM contributions c2
                            JOIN employees e2 ON c2.EmployeeID = e2.EmployeeID
                            WHERE e2.BranchID IN ($placeholders)";
                
                $subquery = "SELECT DISTINCT c2.EmployeeID
                            FROM contributions c2
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
                            c.Amount,
                            c.HourlyMinWage
                        FROM contributions c
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
                            FROM contributions c2
                            JOIN employees e2 ON c2.EmployeeID = e2.EmployeeID";
                
                $subquery = "SELECT DISTINCT c2.EmployeeID
                            FROM contributions c2
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
                            c.Amount,
                            c.HourlyMinWage
                        FROM contributions c
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

        error_log("POST payload: " . json_encode($data));

        $missingFields = [];
        if (!isset($data['EmployeeID']) || (empty($data['EmployeeID']) && $data['EmployeeID'] !== 0)) $missingFields[] = 'EmployeeID';
        if (!isset($data['BranchID']) || (empty($data['BranchID']) && $data['BranchID'] !== 0)) $missingFields[] = 'BranchID';
        if (!isset($data['ContributionType']) || empty($data['ContributionType'])) $missingFields[] = 'ContributionType';
        if (!isset($data['Amount']) && $data['Amount'] !== 0) $missingFields[] = 'Amount';
        if (!isset($data['role']) || empty($data['role'])) $missingFields[] = 'role';
        if (!isset($data['user_id']) || (empty($data['user_id']) && $data['user_id'] !== 0)) $missingFields[] = 'user_id';
        if (!isset($data['HourlyMinWage']) || (empty($data['HourlyMinWage']) && $data['HourlyMinWage'] !== 0)) $missingFields[] = 'HourlyMinWage';

        if (!empty($missingFields)) {
            throw new Exception("Missing or empty fields: " . implode(', ', $missingFields));
        }

        $employeeId = (int)$data['EmployeeID'];
        $branchId = (int)$data['BranchID'];
        $contributionType = $data['ContributionType'];
        $amount = (float)$data['Amount'];
        $role = $data['role'];
        $userId = (int)$data['user_id'];
        $hourlyMinWage = (float)$data['HourlyMinWage'];

        if (!recordExists($conn, "useraccounts", $userId)) {
            throw new Exception("Invalid user_id: $userId does not exist in useraccounts");
        }

        if ($role !== 'Payroll Admin') {
            $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
            if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
            $branchStmt->bind_param("i", $userId);
            $branchStmt->execute();
            $branchResult = $branchStmt->get_result();
            $allowedBranches = [];
            while ($row = $branchResult->fetch_assoc()) {
                $allowedBranches[] = $row['BranchID'];
            }
            $branchStmt->close();

            if (!in_array($branchId, $allowedBranches)) {
                throw new Exception("Unauthorized access: Branch $branchId not assigned to user $userId");
            }
        }

        if (!recordExists($conn, "employees", $employeeId)) {
            throw new Exception("Invalid EmployeeID: $employeeId does not exist");
        }
        if (!recordExists($conn, "branches", $branchId)) {
            throw new Exception("Invalid BranchID: $branchId does not exist");
        }
        $empStmt = $conn->prepare("SELECT BranchID, PositionID FROM employees WHERE EmployeeID = ?");
        $empStmt->bind_param("i", $employeeId);
        $empStmt->execute();
        $empResult = $empStmt->get_result();
        if ($row = $empResult->fetch_assoc()) {
            $employeeBranch = $row['BranchID'];
            $positionId = $row['PositionID'];
        } else {
            $empStmt->close();
            throw new Exception("EmployeeID $employeeId not found");
        }
        $empStmt->close();
        if ($employeeBranch != $branchId) {
            throw new Exception("Employee $employeeId does not belong to BranchID $branchId");
        }

        if (!recordExists($conn, "positions", $positionId)) {
            throw new Exception("Invalid PositionID: $positionId for EmployeeID $employeeId");
        }

        $validTypes = ['Pag-Ibig', 'SSS', 'PhilHealth'];
        if (!in_array($contributionType, $validTypes)) {
            throw new Exception("Invalid ContributionType: $contributionType");
        }

        $checkStmt = $conn->prepare("SELECT ContributionID FROM contributions WHERE EmployeeID = ? AND ContributionType = ?");
        $checkStmt->bind_param("is", $employeeId, $contributionType);
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

        if ($contributionType === "PhilHealth") {
            $amount = getPhilHealthContri($conn, $employeeId);
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("
                INSERT INTO contributions (EmployeeID, BranchID, ContributionType, Amount, user_id, HourlyMinWage) 
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->bind_param("iisdid", $employeeId, $branchId, $contributionType, $amount, $userId, $hourlyMinWage);

            if ($stmt->execute()) {
                $contributionId = $conn->insert_id;
                $employeeName = getEmployeeNameById($conn, $employeeId);
                $description = "Contribution '$contributionType' of ₱" . formatNumber($amount) . " added for '$employeeName'";
                logUserActivity($conn, $userId, "ADD_DATA", "contributions", $contributionId, $description);
                $conn->commit();
                echo json_encode([
                    "success" => true,
                    "id" => $contributionId,
                    "amount" => formatNumber($amount),
                    "employee_id" => $employeeId,
                    "contribution_type" => $contributionType
                ]);
            } else {
                throw new Exception("Failed to add contribution: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Insert error: " . $e->getMessage() . " | Payload: " . json_encode($data));
            throw $e;
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        error_log("PUT payload: " . json_encode($data));

        $missingFields = [];
        if (!isset($data['ContributionID']) || empty($data['ContributionID'])) $missingFields[] = 'ContributionID';
        if (!isset($data['EmployeeID']) || (empty($data['EmployeeID']) && $data['EmployeeID'] !== 0)) $missingFields[] = 'EmployeeID';
        if (!isset($data['BranchID']) || (empty($data['BranchID']) && $data['BranchID'] !== 0)) $missingFields[] = 'BranchID';
        if (!isset($data['ContributionType']) || empty($data['ContributionType'])) $missingFields[] = 'ContributionType';
        if (!isset($data['Amount']) && $data['Amount'] !== 0) $missingFields[] = 'Amount';
        if (!isset($data['role']) || empty($data['role'])) $missingFields[] = 'role';
        if (!isset($data['user_id']) || (empty($data['user_id']) && $data['user_id'] !== 0)) $missingFields[] = 'user_id';
        if (!isset($data['HourlyMinWage']) || (empty($data['HourlyMinWage']) && $data['HourlyMinWage'] !== 0)) $missingFields[] = 'HourlyMinWage';

        if (!empty($missingFields)) {
            throw new Exception("Missing or empty fields: " . implode(', ', $missingFields));
        }

        $contributionId = (int)$data['ContributionID'];
        $employeeId = (int)$data['EmployeeID'];
        $branchId = (int)$data['BranchID'];
        $contributionType = $data['ContributionType'];
        $amount = (float)$data['Amount'];
        $role = $data['role'];
        $userId = (int)$data['user_id'];
        $hourlyMinWage = (float)$data['HourlyMinWage'];

        if (!recordExists($conn, "useraccounts", $userId)) {
            throw new Exception("Invalid user_id: $userId does not exist in useraccounts");
        }

        if ($role !== 'Payroll Admin') {
            $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
            if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
            $branchStmt->bind_param("i", $userId);
            $branchStmt->execute();
            $branchResult = $branchStmt->get_result();
            $allowedBranches = [];
            while ($row = $branchResult->fetch_assoc()) {
                $allowedBranches[] = $row['BranchID'];
            }
            $branchStmt->close();

            if (!in_array($branchId, $allowedBranches)) {
                throw new Exception("Unauthorized access: Branch $branchId not assigned to user $userId");
            }
        }

        if (!recordExists($conn, "employees", $employeeId)) {
            throw new Exception("Invalid EmployeeID: $employeeId");
        }
        if (!recordExists($conn, "branches", $branchId)) {
            throw new Exception("Invalid BranchID: $branchId");
        }
        if (!recordExists($conn, "contributions", $contributionId)) {
            throw new Exception("Contribution record with ID $contributionId not found.");
        }
        $empStmt = $conn->prepare("SELECT BranchID, PositionID FROM employees WHERE EmployeeID = ?");
        $empStmt->bind_param("i", $employeeId);
        $empStmt->execute();
        $empResult = $empStmt->get_result();
        if ($row = $empResult->fetch_assoc()) {
            $employeeBranch = $row['BranchID'];
            $positionId = $row['PositionID'];
        } else {
            $empStmt->close();
            throw new Exception("EmployeeID $employeeId not found");
        }
        $empStmt->close();
        if ($employeeBranch != $branchId) {
            throw new Exception("Employee $employeeId does not belong to BranchID $branchId");
        }

        if (!recordExists($conn, "positions", $positionId)) {
            throw new Exception("Invalid PositionID: $positionId for EmployeeID $employeeId");
        }

        $validTypes = ['Pag-Ibig', 'SSS', 'PhilHealth'];
        if (!in_array($contributionType, $validTypes)) {
            throw new Exception("Invalid ContributionType: $contributionType");
        }

        if ($contributionType === "PhilHealth") {
            $amount = getPhilHealthContri($conn, $employeeId);
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT EmployeeID, BranchID, ContributionType, Amount, HourlyMinWage FROM contributions WHERE ContributionID = ?");
            $stmt->bind_param("i", $contributionId);
            $stmt->execute();
            $result = $stmt->get_result();
            $currentRecord = $result->fetch_assoc();
            $stmt->close();

            if (!$currentRecord) {
                throw new Exception("Contribution record with ID $contributionId not found.");
            }

            $changes = [];
            if ($currentRecord["EmployeeID"] != $employeeId) {
                $oldEmployeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                $newEmployeeName = getEmployeeNameById($conn, $employeeId);
                $changes[] = "Employee from '$oldEmployeeName' to '$newEmployeeName'";
            }
            if ($currentRecord["BranchID"] != $branchId) {
                $changes[] = "BranchID from '{$currentRecord["BranchID"]}' to '$branchId'";
            }
            if ($currentRecord["ContributionType"] != $contributionType) {
                $changes[] = "ContributionType from '{$currentRecord["ContributionType"]}' to '$contributionType'";
            }
            if ($currentRecord["Amount"] != $amount) {
                $changes[] = "Amount from '₱" . formatNumber($currentRecord["Amount"]) . "' to '₱" . formatNumber($amount) . "'";
            }
            if ($currentRecord["HourlyMinWage"] != $hourlyMinWage) {
                $changes[] = "HourlyMinWage from '{$currentRecord["HourlyMinWage"]}' to '$hourlyMinWage'";
            }

            $stmt = $conn->prepare("
                UPDATE contributions 
                SET EmployeeID = ?, BranchID = ?, ContributionType = ?, Amount = ?, user_id = ?, HourlyMinWage = ? 
                WHERE ContributionID = ?
            ");
            $stmt->bind_param("iisdidi", $employeeId, $branchId, $contributionType, $amount, $userId, $hourlyMinWage, $contributionId);

            if ($stmt->execute()) {
                $employeeName = getEmployeeNameById($conn, $employeeId);
                $description = empty($changes)
                    ? "Contribution '$contributionType' for '$employeeName' updated: No changes made"
                    : "Contribution '$contributionType' for '$employeeName' updated: " . implode('/ ', $changes);
                logUserActivity($conn, $userId, "UPDATE_DATA", "contributions", $contributionId, $description);
                $conn->commit();
                echo json_encode(["success" => true]);
            } else {
                throw new Exception("Failed to update contribution: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Update error: " . $e->getMessage() . " | Payload: " . json_encode($data));
            throw $e;
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        error_log("DELETE payload: " . json_encode($data));

        if (!isset($data['ContributionID']) || empty($data['ContributionID'])) {
            throw new Exception("ContributionID is required");
        }
        if (!isset($data['role']) || empty($data['role'])) {
            throw new Exception("role is required");
        }
        if (!isset($data['user_id']) || (empty($data['user_id']) && $data['user_id'] !== 0)) {
            throw new Exception("user_id is required");
        }

        $contributionId = (int)$data['ContributionID'];
        $role = $data['role'];
        $userId = (int)$data['user_id'];

        if (!recordExists($conn, "useraccounts", $userId)) {
            throw new Exception("Invalid user_id: $userId does not exist in useraccounts");
        }

        if ($role !== 'Payroll Admin') {
            $stmt = $conn->prepare("
                SELECT c.BranchID
                FROM contributions c
                JOIN UserBranches ub ON c.BranchID = ub.BranchID
                WHERE c.ContributionID = ? AND ub.UserID = ?
            ");
            $stmt->bind_param("ii", $contributionId, $userId);
            $stmt->execute();
            $stmt->store_result();
            if ($stmt->num_rows == 0) {
                $stmt->close();
                throw new Exception("Unauthorized access: Not allowed to delete contribution in this branch");
            }
            $stmt->close();
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT EmployeeID, BranchID, ContributionType, Amount FROM contributions WHERE ContributionID = ?");
            $stmt->bind_param("i", $contributionId);
            $stmt->execute();
            $result = $stmt->get_result();
            $record = $result->fetch_assoc();
            $stmt->close();

            if (!$record) {
                throw new Exception("Contribution record with ID $contributionId not found.");
            }

            $stmt = $conn->prepare("DELETE FROM contributions WHERE ContributionID = ?");
            $stmt->bind_param("i", $contributionId);

            if ($stmt->execute()) {
                $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                $description = "Contribution '{$record["ContributionType"]}' of ₱" . formatNumber($record["Amount"]) . " deleted for '$employeeName'";
                logUserActivity($conn, $userId, "DELETE_DATA", "contributions", $contributionId, $description);
                $conn->commit();
                echo json_encode(["success" => true]);
            } else {
                throw new Exception("Failed to delete contribution: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Delete error: " . $e->getMessage() . " | Payload: " . json_encode($data));
            throw $e;
        }
    } else {
        throw new Exception("Method not allowed");
    }
} catch (Exception $e) {
    http_response_code(500);
    error_log("Error in fetch_contribution.php: " . $e->getMessage());
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?>