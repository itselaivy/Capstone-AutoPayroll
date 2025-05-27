<?php
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_log('fetch_payroll_holidays.php executed');
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

    $start_date = $_GET['start_date'] ?? '';
    $end_date = $_GET['end_date'] ?? '';
    $branch_id = isset($_GET['branch_id']) && $_GET['branch_id'] !== 'null' ? (int)$_GET['branch_id'] : null;

    if (!$start_date || !$end_date) {
        throw new Exception('Start date and end date are required');
    }

    if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $start_date) || !preg_match("/^\d{4}-\d{2}-\d{2}$/", $end_date)) {
        throw new Exception("Invalid date format. Use YYYY-MM-DD.");
    }

    $payroll_year = (int)date('Y', strtotime($start_date));
    $start_month_day = date('m-d', strtotime($start_date));
    $end_month_day = date('m-d', strtotime($end_date));

    $query = "
        SELECT COUNT(DISTINCT h.HolidayID) AS HolidayCount
        FROM Holidays h
        LEFT JOIN HolidayBranch hb ON h.HolidayID = hb.HolidayID
        WHERE (
            (h.Recurring = 1 AND DATE_FORMAT(h.MonthDay, '%m-%d') BETWEEN ? AND ?)
            OR (h.Recurring = 0 AND h.FixedYear = ? AND h.MonthDay BETWEEN ? AND ?)
        )
        AND (hb.BranchID = ? OR hb.BranchID IS NULL)
    ";

    $stmt = $conn->prepare($query);
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }

    if ($branch_id === null) {
        $query = "
            SELECT COUNT(DISTINCT h.HolidayID) AS HolidayCount
            FROM Holidays h
            LEFT JOIN HolidayBranch hb ON h.HolidayID = hb.HolidayID
            WHERE (
                (h.Recurring = 1 AND DATE_FORMAT(h.MonthDay, '%m-%d') BETWEEN ? AND ?)
                OR (h.Recurring = 0 AND h.FixedYear = ? AND h.MonthDay BETWEEN ? AND ?)
            )
            AND hb.BranchID IS NULL
        ";
        $stmt = $conn->prepare($query);
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }
        $stmt->bind_param("ssiss", $start_month_day, $end_month_day, $payroll_year, $start_date, $end_date);
    } else {
        $stmt->bind_param("ssissi", $start_month_day, $end_month_day, $payroll_year, $start_date, $end_date, $branch_id);
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $holiday_count = (int)($row['HolidayCount'] ?? 0);

    error_log("Holiday query: $query");
    error_log("Params: start=$start_month_day, end=$end_month_day, year=$payroll_year, start_date=$start_date, end_date=$end_date, branch_id=" . ($branch_id ?? 'null'));
    error_log("Holiday count: $holiday_count");

    $stmt->close();
    $conn->close();

    echo json_encode([
        'success' => true,
        'data' => ['HolidayCount' => $holiday_count]
    ]);
} catch (Exception $e) {
    error_log("Error in fetch_payroll_holidays.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>