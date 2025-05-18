<?php
ob_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_log('fetch_payroll_history.php executed');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $servername = "localhost";
    $username = "root";
    $password = "";
    $dbname = "autopayrolldb";

    $conn = new mysqli($servername, $username, $password, $dbname);
    if ($conn->connect_error) {
        throw new Exception("Connection failed: " . $conn->connect_error);
    }
    $conn->set_charset("utf8mb4");

    $method = $_SERVER['REQUEST_METHOD'];

    try {
        if ($method !== 'POST') {
            throw new Exception("Invalid request method. Only POST is allowed.");
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            throw new Exception("Invalid JSON input.");
        }

        $user_id = isset($input['user_id']) ? (int)$input['user_id'] : null;
        $role = isset($input['role']) ? $input['role'] : null;
        $branch_id = isset($input['branch_id']) ? (int)$input['branch_id'] : null;
        $start_date = isset($input['start_date']) ? $input['start_date'] : null;
        $end_date = isset($input['end_date']) ? $input['end_date'] : null;
        $payroll_cut = isset($input['payroll_cut']) ? $input['payroll_cut'] : null;
        $employees = isset($input['employees']) ? $input['employees'] : [];

        if (!$user_id || !$role) {
            throw new Exception("user_id and role are required.");
        }

        if (!$start_date || !$end_date || !$payroll_cut) {
            throw new Exception("start_date, end_date, and payroll_cut are required.");
        }

        if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $start_date) || !preg_match("/^\d{4}-\d{2}-\d{2}$/", $end_date)) {
            throw new Exception("Invalid date format. Use YYYY-MM-DD.");
        }

        if (strtotime($end_date) < strtotime($start_date)) {
            throw new Exception("End date cannot be before start date.");
        }

        if (!in_array($payroll_cut, ['first', 'second'])) {
            throw new Exception("Invalid payroll_cut value. Must be 'first' or 'second'.");
        }

        if (empty($employees)) {
            throw new Exception("No employee data provided.");
        }

        $conn->begin_transaction();

        foreach ($employees as $employee) {
            $employee_id = (int)$employee['EmployeeID'];
            $hours_worked = (float)$employee['HoursWorked'];
            $late_minutes = (int)$employee['LateMinutes'];
            $hourly_wage = (float)$employee['HourlyMinimumWage'];

            $gross_pay = $hours_worked * $hourly_wage;

            $allowances_total = 0;
            foreach ($employee['Allowances'] as $allowance) {
                $allowances_total += (float)$allowance['amount'];
            }

            $contributions_total = 0;
            foreach ($employee['Contributions'] as $contribution) {
                $contributions_total += (float)$contribution['amount'];
            }

            $cash_advances_total = 0;
            foreach ($employee['CashAdvances'] as $cash_advance) {
                $cash_advances_total += (float)$cash_advance['amount'];
            }

            $net_pay = $gross_pay + $allowances_total - $contributions_total - $cash_advances_total;

            $stmt = $conn->prepare("
                INSERT INTO PayrollRecords (
                    EmployeeID, PayrollDate, PayrollCut, HoursWorked, LateMinutes, 
                    GrossPay, AllowancesTotal, ContributionsTotal, CashAdvancesTotal, NetPay
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            if (!$stmt) {
                throw new Exception("Prepare failed for PayrollRecords insert: " . $conn->error);
            }

            $payroll_date = $end_date;
            $stmt->bind_param(
                "issdiddddd",
                $employee_id,
                $payroll_date,
                $payroll_cut,
                $hours_worked,
                $late_minutes,
                $gross_pay,
                $allowances_total,
                $contributions_total,
                $cash_advances_total,
                $net_pay
            );
            if (!$stmt->execute()) {
                throw new Exception("Failed to insert PayrollRecord for EmployeeID $employee_id: " . $stmt->error);
            }
            $stmt->close();
        }

        $log_stmt = $conn->prepare("
            INSERT INTO ActivityLog (UserID, Action, Details, Timestamp)
            VALUES (?, ?, ?, NOW())
        ");
        if (!$log_stmt) {
            throw new Exception("Prepare failed for ActivityLog insert: " . $conn->error);
        }

        $action = "Generated bulk payslips";
        $details = json_encode([
            'branch_id' => $branch_id,
            'start_date' => $start_date,
            'end_date' => $end_date,
            'payroll_cut' => $payroll_cut,
            'employee_count' => count($employees)
        ]);
        $log_stmt->bind_param("iss", $user_id, $action, $details);
        if (!$log_stmt->execute()) {
            throw new Exception("Failed to log activity: " . $log_stmt->error);
        }
        $log_stmt->close();

        $conn->commit();
        $conn->close();

        echo json_encode([
            "success" => true,
            "message" => "Bulk payslips generated successfully"
        ]);
    } catch (Exception $e) {
        if (isset($conn) && $conn->ping()) {
            $conn->rollback();
            $conn->close();
        }
        echo json_encode([
            "success" => false,
            "error" => $e->getMessage()
        ]);
    }
} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "error" => "An unexpected error occurred: " . $e->getMessage()
    ]);
}
?>