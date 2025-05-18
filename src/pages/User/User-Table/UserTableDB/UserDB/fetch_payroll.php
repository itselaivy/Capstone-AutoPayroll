<?php
// Prevent unwanted output
ob_start();

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_log('fetch_payroll.php executed');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Handle CORS preflight request
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

    $cache = [
        'allowances' => [],
        'contributions' => [],
        'loans' => [],
        'cashadvances' => [],
        'overtime' => [],
        'holidays' => [],
        'leaves' => [],
        'attendance' => []
    ];

    function formatNumber($number) {
        return is_numeric($number) ? number_format((float)$number, 2, '.', '') : '0.00';
    }

    function recordExists($conn, $table, $id) {
        $id = (int)$id;
        if ($id <= 0) return false;
        $table = $conn->real_escape_string($table);
        $idColumn = ($table === 'UserAccounts') ? 'UserID' : 'EmployeeID';
        $stmt = $conn->prepare("SELECT 1 FROM $table WHERE $idColumn = ? LIMIT 1");
        if (!$stmt) {
            error_log("Prepare failed for recordExists ($table): " . $conn->error);
            return false;
        }
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $result = $stmt->get_result();
        $exists = $result->num_rows > 0;
        $stmt->close();
        return $exists;
    }

    function getEmployeeNameById($conn, $employeeId) {
        $stmt = $conn->prepare("SELECT EmployeeName FROM Employees WHERE EmployeeID = ?");
        if (!$stmt) return "Unknown";
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $stmt->close();
        return $row['EmployeeName'] ?? "Unknown";
    }

    function logUserActivity($conn, $user_id, $activity_type, $affected_table, $affected_record_id, $description) {
        $stmt = $conn->prepare("
            INSERT INTO user_activity_logs (user_id, activity_type, affected_table, affected_record_id, activity_description)
            VALUES (?, ?, ?, ?, ?)
        ");
        if (!$stmt) {
            error_log("Failed to log activity: " . $conn->error);
            return;
        }
        $stmt->bind_param("issis", $user_id, $activity_type, $affected_table, $affected_record_id, $description);
        $stmt->execute();
        $stmt->close();
    }

    function getAllowances($conn, $employeeId, &$cache) {
        $cacheKey = "allowances_{$employeeId}";
        if (isset($cache['allowances'][$cacheKey])) {
            return $cache['allowances'][$cacheKey];
        }

        $stmt = $conn->prepare("
            SELECT AllowanceID, Description, Amount
            FROM Allowances
            WHERE EmployeeID = ?
        ");
        if (!$stmt) {
            error_log("Prepare failed for allowances: " . $conn->error);
            throw new Exception("Failed to fetch allowances: " . $conn->error);
        }
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        $allowances = [];
        while ($row = $result->fetch_assoc()) {
            $allowances[] = [
                'AllowanceID' => $row['AllowanceID'],
                'Description' => $row['Description'],
                'Amount' => formatNumber($row['Amount'])
            ];
        }
        $stmt->close();
        $cache['allowances'][$cacheKey] = $allowances;
        return $allowances;
    }

    function getContributions($conn, $employeeId, &$cache, $payroll_cut) {
    $cacheKey = "contributions_{$employeeId}_{$payroll_cut}";
    if (isset($cache[$cacheKey])) {
        return $cache[$cacheKey];
    }

    $data = [];
    if ($payroll_cut === 'second') {
        $stmt = $conn->prepare("
            SELECT LoanID AS ID, LoanKey AS ContributionType, LoanType, Amount
            FROM Loans
            WHERE EmployeeID = ?
        ");
        if (!$stmt) throw new Exception("Prepare failed for loans query: " . $conn->error);
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $data[] = [
                'ID' => $row['ID'],
                'ContributionType' => $row['ContributionType'] . ' ' . $row['LoanType'],
                'Amount' => formatNumber($row['Amount']),
                'Balance' => '0.00' // Assuming balance is not tracked here; adjust if needed
            ];
        }
        $stmt->close();
    } else {
        $stmt = $conn->prepare("
            SELECT ContributionID AS ID, ContributionType, Amount
            FROM Contributions
            WHERE EmployeeID = ?
        ");
        if (!$stmt) throw new Exception("Prepare failed for contributions query: " . $conn->error);
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $data[] = [
                'ID' => $row['ID'],
                'ContributionType' => $row['ContributionType'],
                'Amount' => formatNumber($row['Amount']),
                'Balance' => '0.00'
            ];
        }
        $stmt->close();
    }

    $cache[$cacheKey] = $data;
    return $data;
}

    function getCashAdvances($conn, $employeeId, &$cache, $start_date, $end_date) {
        $cacheKey = "cashadvances_{$employeeId}_{$start_date}_{$end_date}";
        if (isset($cache['cashadvances'][$cacheKey])) {
            return $cache['cashadvances'][$cacheKey];
        }

        $stmt = $conn->prepare("
            SELECT CashAdvanceID, Date, Amount, Balance
            FROM CashAdvance
            WHERE EmployeeID = ? AND Date BETWEEN ? AND ?
        ");
        if (!$stmt) {
            error_log("Prepare failed for cash advances: " . $conn->error);
            throw new Exception("Failed to fetch cash advances: " . $conn->error);
        }
        $stmt->bind_param("iss", $employeeId, $start_date, $end_date);
        $stmt->execute();
        $result = $stmt->get_result();
        $cashAdvances = [];
        while ($row = $result->fetch_assoc()) {
            $cashAdvances[] = [
                'CashAdvanceID' => $row['CashAdvanceID'],
                'Date' => $row['Date'],
                'Amount' => formatNumber($row['Amount']),
                'Balance' => formatNumber($row['Balance'])
            ];
        }
        $stmt->close();
        $cache['cashadvances'][$cacheKey] = $cashAdvances;
        return $cashAdvances;
    }

    function getOvertime($conn, $employeeId, $start_date, $end_date, &$cache) {
        $cacheKey = "overtime_{$employeeId}_{$start_date}_{$end_date}";
        if (isset($cache['overtime'][$cacheKey])) {
            return $cache['overtime'][$cacheKey];
        }

        $stmt = $conn->prepare("
            SELECT OvertimeID, Date, `No. of Hours` AS Hours
            FROM Overtime
            WHERE EmployeeID = ? AND Date BETWEEN ? AND ?
        ");
        if (!$stmt) {
            error_log("Prepare failed for overtime: " . $conn->error);
            throw new Exception("Failed to fetch overtime: " . $conn->error);
        }
        $stmt->bind_param("iss", $employeeId, $start_date, $end_date);
        $stmt->execute();
        $result = $stmt->get_result();
        $overtime = [];
        while ($row = $result->fetch_assoc()) {
            $overtime[] = [
                'OvertimeID' => $row['OvertimeID'],
                'Date' => $row['Date'],
                'Hours' => formatNumber($row['Hours'])
            ];
        }
        $stmt->close();
        $cache['overtime'][$cacheKey] = $overtime;
        return $overtime;
    }

    function getHolidays($conn, $employeeId, $start_date, $end_date, &$cache) {
        $cacheKey = "holidays_{$employeeId}_{$start_date}_{$end_date}";
        if (isset($cache['holidays'][$cacheKey])) {
            return $cache['holidays'][$cacheKey];
        }
    
        // Get employee's branch
        $stmt = $conn->prepare("SELECT BranchID FROM Employees WHERE EmployeeID = ?");
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        $employeeBranchId = $result->fetch_assoc()['BranchID'] ?? 0;
        $stmt->close();
    
        $startYear = date('Y', strtotime($start_date));
        $endYear = date('Y', strtotime($end_date));
    
        $stmt = $conn->prepare("
            SELECT 
                h.HolidayID, 
                h.Description, 
                h.HolidayType, 
                h.MonthDay, 
                h.FixedYear, 
                h.Recurring,
                COALESCE(hb.BranchID, 0) AS BranchID
            FROM Holidays h
            LEFT JOIN HolidayBranch hb ON h.HolidayID = hb.HolidayID
            WHERE (
                (h.Recurring = 1 AND (
                    CONCAT(?, '-', h.MonthDay) BETWEEN ? AND ?
                    OR CONCAT(?, '-', h.MonthDay) BETWEEN ? AND ?
                ))
                OR (
                    h.FixedYear IN (?, ?) AND
                    CONCAT(h.FixedYear, '-', h.MonthDay) BETWEEN ? AND ?
                )
            )
        ");
        if (!$stmt) {
            error_log("Prepare failed for holidays: " . $conn->error);
            throw new Exception("Failed to fetch holidays: " . $conn->error);
        }
        $stmt->bind_param("ssssssssss", $startYear, $start_date, $end_date, $endYear, $start_date, $end_date, $startYear, $endYear, $start_date, $end_date);
        $stmt->execute();
        $result = $stmt->get_result();
        $holidays = [];
        while ($row = $result->fetch_assoc()) {
            $holidayDate = ($row['Recurring'] ? $startYear : $row['FixedYear']) . '-' . $row['MonthDay'];
            error_log("Processing holiday for EmployeeID $employeeId: ID={$row['HolidayID']}, Date=$holidayDate, Type={$row['HolidayType']}, BranchID={$row['BranchID']}");
            if (strtotime($holidayDate) >= strtotime($start_date) && strtotime($holidayDate) <= strtotime($end_date)) {
                // Include holiday if BranchID is 0/null or matches employee's branch
                if ($row['BranchID'] == 0 || $row['BranchID'] == $employeeBranchId) {
                    $holidays[] = [
                        'HolidayID' => $row['HolidayID'],
                        'Description' => $row['Description'],
                        'Date' => $holidayDate,
                        'HolidayType' => $row['HolidayType'],
                        'BranchID' => $row['BranchID']
                    ];
                } else {
                    error_log("Skipping holiday {$row['HolidayID']} for EmployeeID $employeeId: BranchID {$row['BranchID']} does not match Employee BranchID $employeeBranchId");
                }
            }
        }
        $stmt->close();
        error_log("Holidays fetched for EmployeeID $employeeId, period $start_date to $end_date: " . json_encode($holidays));
        $cache['holidays'][$cacheKey] = $holidays;
        return $holidays;
    }

    function getLeaves($conn, $employeeId, $start_date, $end_date, &$cache) {
        $cacheKey = "leaves_{$employeeId}_{$start_date}_{$end_date}";
        if (isset($cache['leaves'][$cacheKey])) {
            return $cache['leaves'][$cacheKey];
        }

        $stmt = $conn->prepare("
            SELECT LeaveID, StartDate, EndDate, LeaveType
            FROM Leaves
            WHERE EmployeeID = ? 
            AND LeaveType IN ('Vacation Leave', 'Sick Leave')
            AND (StartDate <= ? AND EndDate >= ?)
        ");
        if (!$stmt) {
            error_log("Prepare failed for leaves: " . $conn->error);
            throw new Exception("Failed to fetch leaves: " . $conn->error);
        }
        $stmt->bind_param("iss", $employeeId, $end_date, $start_date);
        $stmt->execute();
        $result = $stmt->get_result();
        $leaves = [];
        while ($row = $result->fetch_assoc()) {
            $leaves[] = [
                'LeaveID' => $row['LeaveID'],
                'StartDate' => $row['StartDate'],
                'EndDate' => $row['EndDate'],
                'LeaveType' => $row['LeaveType']
            ];
        }
        $stmt->close();
        $cache['leaves'][$cacheKey] = $leaves;
        return $leaves;
    }

    function getAttendance($conn, $employeeId, $start_date, $end_date, &$cache) {
    $cacheKey = "attendance_{$employeeId}_{$start_date}_{$end_date}";
    if (isset($cache['attendance'][$cacheKey])) {
        return $cache['attendance'][$cacheKey];
    }

    $stmt = $conn->prepare("
        SELECT 
            a.Date, 
            a.TimeIn, 
            a.TimeOut,
            a.TimeInStatus,
            COALESCE(
                TIMESTAMPDIFF(MINUTE, a.TimeIn, a.TimeOut) / 60.0
                - CASE 
                    WHEN a.TimeOut > TIME('12:00:00') THEN 1 
                    ELSE 0 
                  END, 0
            ) AS HoursWorked,
            COALESCE(
                CASE 
                    WHEN a.TimeIn IS NOT NULL AND TIME(a.TimeIn) > TIME('08:10:00')
                    THEN TIMESTAMPDIFF(MINUTE, TIME('08:00:00'), TIME(a.TimeIn))
                    ELSE 0 
                END, 0
            ) AS LateMinutes,
            COALESCE(
                CASE 
                    WHEN a.TimeOut IS NOT NULL AND TIME(a.TimeOut) < s.ShiftEnd
                    THEN TIMESTAMPDIFF(MINUTE, TIME(a.TimeOut), s.ShiftEnd)
                    ELSE 0 
                END, 0
            ) AS UndertimeMinutes
        FROM Attendance a
        JOIN Employees e ON e.EmployeeID = a.EmployeeID
        LEFT JOIN Schedules s ON e.ScheduleID = s.ScheduleID
        WHERE a.EmployeeID = ? AND a.Date BETWEEN ? AND ?
    ");
    if (!$stmt) {
        error_log("Prepare failed for attendance: " . $conn->error);
        throw new Exception("Failed to fetch attendance: " . $conn->error);
    }
    $stmt->bind_param("iss", $employeeId, $start_date, $end_date);
    $stmt->execute();
    $result = $stmt->get_result();
    $attendance = [];
    while ($row = $result->fetch_assoc()) {
        $attendance[] = [
            'Date' => $row['Date'],
            'TimeIn' => $row['TimeIn'],
            'TimeOut' => $row['TimeOut'],
            'TimeInStatus' => $row['TimeInStatus'],
            'HoursWorked' => formatNumber($row['HoursWorked']),
            'LateMinutes' => (int)$row['LateMinutes'],
            'UndertimeMinutes' => (int)$row['UndertimeMinutes']
        ];
    }
    $stmt->close();
    $cache['attendance'][$cacheKey] = $attendance;
    return $attendance;
}

function getAbsentDays($conn, $employeeId, $start_date, $end_date, $leaves, $holidays) {
    $stmt = $conn->prepare("
        SELECT DISTINCT Date
        FROM Attendance
        WHERE EmployeeID = ? AND Date BETWEEN ? AND ?
    ");
    if (!$stmt) {
        error_log("Prepare failed for attendance: " . $conn->error);
        throw new Exception("Failed to fetch attendance: " . $conn->error);
    }
    $stmt->bind_param("iss", $employeeId, $start_date, $end_date);
    $stmt->execute();
    $result = $stmt->get_result();
    $attendanceDates = [];
    while ($row = $result->fetch_assoc()) {
        $attendanceDates[] = $row['Date'];
    }
    $stmt->close();

    $leaveDates = [];
    foreach ($leaves as $leave) {
        $leavePeriod = new DatePeriod(
            new DateTime($leave['StartDate']),
            new DateInterval('P1D'),
            (new DateTime($leave['EndDate']))->modify('+1 day')
        );
        foreach ($leavePeriod as $date) {
            $leaveDates[] = $date->format('Y-m-d');
        }
    }

    // Only Legal Holidays count as "Present"
    $legalHolidayDates = array_filter($holidays, function($h) {
        return $h['HolidayType'] === 'Legal Holiday';
    });
    $legalHolidayDates = array_map(function($h) { return $h['Date']; }, $legalHolidayDates);

    $period = new DatePeriod(
        new DateTime($start_date),
        new DateInterval('P1D'),
        (new DateTime($end_date))->modify('+1 day')
    );
    $allDates = [];
    foreach ($period as $date) {
        $allDates[] = $date->format('Y-m-d');
    }

    $absentDays = 0;
    foreach ($allDates as $date) {
        $dateObj = new DateTime($date);
        $isSunday = $dateObj->format('N') == 7;
        $isLegalHoliday = in_array($date, $legalHolidayDates);
        $isLeave = in_array($date, $leaveDates);
        $isAttendance = in_array($date, $attendanceDates);

        if (!$isAttendance && !$isSunday && !$isLegalHoliday && !$isLeave) {
            $absentDays++;
        }
    }

    return $absentDays;
}

function calculatePayroll($employeeData, $attendance, $overtime, $holidays, $payroll_cut) {
    global $conn;
    $EXPECTED_DAYS = 12;

    // Fetch HourlyMinimumWage from database
    $employeeId = (int)$employeeData['EmployeeID'];
    $stmt = $conn->prepare("
        SELECT p.HourlyMinimumWage
        FROM Employees e
        INNER JOIN Positions p ON e.PositionID = p.PositionID
        WHERE e.EmployeeID = ?
    ");
    $stmt->bind_param("i", $employeeId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();

    if (!$row || !isset($row['HourlyMinimumWage'])) {
        error_log("Error: Could not fetch HourlyMinimumWage for EmployeeID $employeeId. PositionID may be missing or invalid.");
        throw new Exception("Failed to retrieve HourlyMinimumWage for EmployeeID $employeeId.");
    }

    $hourlyMinimumWage = (float)$row['HourlyMinimumWage'];
    $dailyMinimumWage = $hourlyMinimumWage * 8; // e.g., 80.625 * 8 = 645

    $payroll = [
        'DailyRate' => '0.00',
        'BasicPay' => '0.00',
        'OvertimePay' => ['Regular' => '0.00', 'Night' => '0.00', 'Total' => '0.00'],
        'HolidayPay' => ['Special' => '0.00', 'Regular' => '0.00', 'Total' => '0.00'],
        'SundayPay' => ['Hours' => '0.00', 'Total' => '0.00'],
        'LateDeduction' => '0.00',
        'AbsentDeduction' => '0.00',
        'TotalEarnings' => '0.00',
        'TotalDeductions' => '0.00',
        'NetPay' => '0.00',
        'HoursWorked' => '0.00',
        'LateMinutes' => 0,
        'UndertimeMinutes' => 0,
        'OvertimeHours' => ['Regular' => '0.00', 'Night' => '0.00'],
        'SundayHours' => '0.00',
        'HolidayHours' => ['Special' => '0.00', 'Regular' => '0.00'],
        'EarningsData' => [],
        'PremiumPayData' => []
    ];

    if (empty($attendance)) {
        $payroll['DailyRate'] = formatNumber($dailyMinimumWage);
        $payroll['AbsentDeduction'] = formatNumber($dailyMinimumWage * $EXPECTED_DAYS);
        $payroll['EarningsData'] = [
            ['Description' => 'Daily Rate', 'Amount' => $payroll['DailyRate']],
            ['Description' => 'Basic Pay', 'Amount' => '0.00']
        ];
        return $payroll;
    }

    $payroll['HoursWorked'] = array_sum(array_map(function($a) {
        return is_numeric($a['HoursWorked']) ? (float)$a['HoursWorked'] : 0;
    }, $attendance));
    $payroll['LateMinutes'] = array_sum(array_map(function($a) {
        return isset($a['LateMinutes']) ? (int)$a['LateMinutes'] : 0;
    }, $attendance));
    $payroll['UndertimeMinutes'] = array_sum(array_map(function($a) {
        return isset($a['UndertimeMinutes']) ? (int)$a['UndertimeMinutes'] : 0;
    }, $attendance));

    // Calculate allowances
    $allowancesSum = 0;
    $allowancesData = [];
    if (is_array($employeeData['AllowancesData'])) {
        foreach ($employeeData['AllowancesData'] as $allowance) {
            $amount = is_numeric($allowance['Amount']) ? (float)$allowance['Amount'] : 0;
            $allowancesSum += $amount;
            $allowancesData[] = [
                'Description' => $allowance['Description'] ?? 'Allowance',
                'Amount' => formatNumber($amount)
            ];
        }
    }

    // Compute Basic Pay: (Daily Minimum Wage * Expected Days) + Allowances
    $periodBase = $dailyMinimumWage * $EXPECTED_DAYS; // 645 * 12 = 7,740
    $basicPay = $periodBase + $allowancesSum; // e.g., 7,740 + 250 = 7,990
    $dailyRate = $basicPay / $EXPECTED_DAYS; // 7,990 / 12 = 665.8333
    $premiumDailyRate = $basicPay / 8; // 7,990 / 8 = 998.75
    $hourlyRate = $premiumDailyRate / 8; // 998.75 / 8 = 124.84375

    $payroll['DailyRate'] = formatNumber($dailyMinimumWage); // 645.00
    $payroll['BasicPay'] = formatNumber($basicPay); // 7,990.00

    $absentDays = isset($employeeData['AbsentDays']) ? (int)$employeeData['AbsentDays'] : 0;
    $payroll['AbsentDeduction'] = formatNumber($premiumDailyRate * $absentDays);

    // Initialize tracking for Premium Pay
    $sundayHours = 0;
    $sundayAmount = 0;
    $sundayOtDayHours = 0;
    $sundayOtNightHours = 0;
    $sundayOtDayAmount = 0;
    $sundayOtNightAmount = 0;
    $specialHolidayHours = 0;
    $specialHolidayAmount = 0;
    $nonWorkedLegalHolidayAmount = 0;
    $noWorkedLegalHolidayAmount = 0;
    $specialOtDayHours = 0;
    $specialOtNightHours = 0;
    $specialOtDayAmount = 0;
    $specialOtNightAmount = 0;
    $regularHolidayHours = 0;
    $regularHolidayAmount = 0;
    $regularOtDayHours = 0;
    $regularOtNightHours = 0;
    $regularOtDayAmount = 0;
    $regularOtNightAmount = 0;

    $employeeBranchId = $employeeData['BranchID'];

    // Overtime Calculations
    $overtimePay = 0;
    $otHoursRegular = 0;
    $otHoursNight = 0;
    $otAmountRegular = 0;
    $otAmountNight = 0;

    foreach ($overtime as $ot) {
        $otDate = new DateTime($ot['Date']);
        $isSunday = $otDate->format('N') == 7;

        $hasLeave = false;
        foreach ($employeeData['LeaveData'] as $leave) {
            $leaveStart = new DateTime($leave['StartDate']);
            $leaveEnd = new DateTime($leave['EndDate']);
            $otDateObj = new DateTime($ot['Date']);
            if ($otDateObj >= $leaveStart && $otDateObj <= $leaveEnd) {
                $hasLeave = true;
                error_log("Overtime skipped for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: On leave");
                break;
            }
        }
        if ($hasLeave) {
            continue;
        }

        $holidaysOnDate = array_filter($holidays, function($h) use ($ot, $employeeBranchId) {
            return $h['Date'] === $ot['Date'] && ($h['BranchID'] == 0 || $h['BranchID'] == $employeeBranchId);
        });
        $holiday = reset($holidaysOnDate);
        $approvedHours = is_numeric($ot['Hours']) ? (float)$ot['Hours'] : 0;
        error_log("Overtime for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: ApprovedHours=$approvedHours, Holiday=" . ($holiday ? json_encode($holiday) : 'none'));

        // Step 2: Check Attendance Record
        $attendanceOnDate = array_filter($attendance, function($a) use ($ot) {
            return $a['Date'] === $ot['Date'];
        });
        $att = reset($attendanceOnDate);
        if (!$att || empty($att['TimeOut'])) {
            error_log("Overtime skipped for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: No valid attendance record or TimeOut");
            continue;
        }

        // Step 3: Check Schedule Record
        $stmt = $conn->prepare("
            SELECT s.ShiftEnd
            FROM Employees e
            INNER JOIN Schedules s ON e.ScheduleID = s.ScheduleID
            WHERE e.EmployeeID = ?
        ");
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        $schedule = $result->fetch_assoc();
        $stmt->close();

        if (!$schedule || empty($schedule['ShiftEnd'])) {
            error_log("Overtime skipped for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: No valid schedule assigned");
            continue;
        }

        // Step 4 & 5: Check TimeOut exceeds ShiftEnd
        $shiftEndTime = new DateTime($ot['Date'] . ' ' . $schedule['ShiftEnd']);
        $timeOut = new DateTime($ot['Date'] . ' ' . $att['TimeOut']);
        // Handle TimeOut crossing midnight
        if ($timeOut < $shiftEndTime) {
            $timeOut->modify('+1 day');
        }

        if ($timeOut <= $shiftEndTime) {
            error_log("Overtime skipped for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: TimeOut does not exceed ShiftEnd");
            continue;
        }

        // Step 6: Compute valid overtime hours
        $interval = $shiftEndTime->diff($timeOut);
        $actualOtHours = $interval->h + ($interval->i / 60);
        $actualOtHours = min($actualOtHours, $approvedHours);
        error_log("Overtime validated for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: ActualOtHours=$actualOtHours");

        // Step 7: Split into Day and Night Overtime
        $dayHours = 0;
        $nightHours = 0;
        $nightStart = new DateTime($ot['Date'] . ' 22:00:00');
        $nightEnd = (clone $nightStart)->modify('+8 hours'); // 22:00:00 to 06:00:00 next day
        $otStart = clone $shiftEndTime;

        if ($timeOut <= $nightStart) {
            // All overtime is daytime (before 22:00:00)
            $dayHours = $actualOtHours;
        } else {
            // Calculate daytime hours (from ShiftEnd to 22:00:00)
            if ($otStart < $nightStart) {
                $dayInterval = $otStart->diff(min($timeOut, $nightStart));
                $dayHours = min($actualOtHours, $dayInterval->h + ($dayInterval->i / 60));
            }
            // Calculate nighttime hours (from 22:00:00 onward)
            if ($timeOut > $nightStart) {
                $nightInterval = $nightStart->diff($timeOut);
                $nightHoursPossible = $nightInterval->h + ($nightInterval->i / 60);
                $nightHours = min($actualOtHours - $dayHours, $nightHoursPossible);
            }
        }

        // Apply overtime rates based on day type
        if ($holiday) {
            if ($holiday['HolidayType'] === 'Special Non-Working Holiday') {
                $specialOtDayHours += $dayHours;
                $specialOtNightHours += $nightHours;
                $specialOtDayAmount += $hourlyRate * 1.69 * $dayHours;
                $specialOtNightAmount += $hourlyRate * 1.859 * $nightHours;
                error_log("Special Holiday OT for EmployeeID {$employeeData['EmployeeID']}: DayHours=$dayHours, NightHours=$nightHours");
            } elseif ($holiday['HolidayType'] === 'Legal Holiday') {
                $regularOtDayHours += $dayHours;
                $regularOtNightHours += $nightHours;
                $regularOtDayAmount += $hourlyRate * 2.60 * $dayHours;
                $regularOtNightAmount += $hourlyRate * 2.86 * $nightHours;
                error_log("Legal Holiday OT for EmployeeID {$employeeData['EmployeeID']}: DayHours=$dayHours, NightHours=$nightHours");
            }
        } elseif ($isSunday) {
            $sundayOtDayHours += $dayHours;
            $sundayOtNightHours += $nightHours;
            $sundayOtDayAmount += $hourlyRate * 1.69 * $dayHours;
            $sundayOtNightAmount += $hourlyRate * 1.859 * $nightHours;
            error_log("Sunday OT for EmployeeID {$employeeData['EmployeeID']}: DayHours=$dayHours, NightHours=$nightHours");
        } else {
            $otHoursRegular += $dayHours;
            $otHoursNight += $nightHours;
            $otAmountRegular += $hourlyRate * 1.25 * $dayHours;
            $otAmountNight += $hourlyRate * 1.375 * $nightHours;
            error_log("Regular OT for EmployeeID {$employeeData['EmployeeID']}: DayHours=$dayHours, NightHours=$nightHours");
        }
    }

    $overtimePay = $otAmountRegular + $otAmountNight;
    $payroll['OvertimePay'] = [
        'Regular' => formatNumber($otAmountRegular),
        'Night' => formatNumber($otAmountNight),
        'Total' => formatNumber($overtimePay)
    ];
    $payroll['OvertimeHours']['Regular'] = formatNumber($otHoursRegular);
    $payroll['OvertimeHours']['Night'] = formatNumber($otHoursNight);

    // Holiday Calculations
    $holidayPay = 0;
    foreach ($holidays as $holiday) {
        $holidayDate = $holiday['Date'];
        error_log("Processing holiday for EmployeeID {$employeeData['EmployeeID']}: ID={$holiday['HolidayID']}, Date=$holidayDate, Type={$holiday['HolidayType']}, BranchID={$holiday['BranchID']}");

        if ($holiday['BranchID'] !== null && $holiday['BranchID'] != 0 && $holiday['BranchID'] != $employeeBranchId) {
            error_log("Skipping holiday {$holiday['HolidayID']} for EmployeeID {$employeeData['EmployeeID']}: BranchID {$holiday['BranchID']} does not match Employee BranchID $employeeBranchId");
            continue;
        }

        $hasLeave = false;
        foreach ($employeeData['LeaveData'] as $leave) {
            $leaveStart = new DateTime($leave['StartDate']);
            $leaveEnd = new DateTime($leave['EndDate']);
            $holidayDateObj = new DateTime($holidayDate);
            if ($holidayDateObj >= $leaveStart && $holidayDateObj <= $leaveEnd) {
                $hasLeave = true;
                error_log("Holiday {$holiday['HolidayID']} skipped for EmployeeID {$employeeData['EmployeeID']}: On leave on $holidayDate");
                break;
            }
        }

        $attendanceOnDate = array_filter($attendance, function($a) use ($holidayDate) {
            return $a['Date'] === $holidayDate;
        });
        $att = reset($attendanceOnDate);
        $hoursWorked = $att ? (float)$att['HoursWorked'] : 0;
        error_log("Attendance for EmployeeID {$employeeData['EmployeeID']} on holiday $holidayDate: " . ($att ? json_encode($att) : 'none') . ", HoursWorked=$hoursWorked");

        // Cap regular holiday hours at 8 to exclude overtime
        $regularHours = $hoursWorked > 0 ? min($hoursWorked, 8) : 0;

        // Handle undertime for regular holidays
        $nonWorkedHours = 0;
        if ($holiday['HolidayType'] === 'Legal Holiday' && $regularHours < 8 && $regularHours > 0 && !$hasLeave) {
            $nonWorkedHours = 8 - $regularHours;
        }

        if ($holiday['HolidayType'] === 'Special Non-Working Holiday') {
            if ($regularHours > 0 && !$hasLeave) {
                $specialHolidayHours += $regularHours;
                $specialHolidayAmount += $hourlyRate * 1.30 * $regularHours;
                $holidayPay += $hourlyRate * 1.30 * $regularHours;
                error_log("Special Holiday pay for EmployeeID {$employeeData['EmployeeID']}: RegularHours=$regularHours, Amount=" . ($hourlyRate * 1.30 * $regularHours));
            }
        } elseif ($holiday['HolidayType'] === 'Legal Holiday') {
            if ($regularHours > 0 && !$hasLeave) {
                $regularHolidayHours += $regularHours;
                $regularHolidayAmount += $hourlyRate * 2.00 * $regularHours;
                $holidayPay += $hourlyRate * 2.00 * $regularHours;
                error_log("Legal Holiday worked pay for EmployeeID {$employeeData['EmployeeID']}: RegularHours=$regularHours, Amount=" . ($hourlyRate * 2.00 * $regularHours));
                if ($nonWorkedHours > 0) {
                    $nonWorkedLegalHolidayAmount += $hourlyRate * 1.00 * $nonWorkedHours;
                    $holidayPay += $hourlyRate * 1.00 * $nonWorkedHours;
                    error_log("Legal Holiday non-worked pay for EmployeeID {$employeeData['EmployeeID']}: NonWorkedHours=$nonWorkedHours, Amount=" . ($hourlyRate * 1.00 * $nonWorkedHours));
                }
            } else if (!$hasLeave) {
                $noWorkedLegalHolidayAmount += $premiumDailyRate * 1.00;
                $holidayPay += $premiumDailyRate * 1.00;
                error_log("Non-Worked Legal Holiday pay for EmployeeID {$employeeData['EmployeeID']}: Amount=$noWorkedLegalHolidayAmount");
            }
        } else {
            error_log("Unknown HolidayType for EmployeeID {$employeeData['EmployeeID']}: Type={$holiday['HolidayType']}");
        }
    }

    // Add holiday overtime amounts to holiday pay
    $holidayPay += $specialOtDayAmount + $specialOtNightAmount + $regularOtDayAmount + $regularOtNightAmount;
    error_log("Holiday overtime pay for EmployeeID {$employeeData['EmployeeID']}: SpecialOTDay=$specialOtDayAmount, SpecialOTNight=$specialOtNightAmount, RegularOTDay=$regularOtDayAmount, RegularOTNight=$regularOtNightAmount");

    $payroll['HolidayPay'] = [
        'Special' => formatNumber($specialHolidayAmount + $specialOtDayAmount + $specialOtNightAmount),
        'Regular' => formatNumber($regularHolidayAmount + $nonWorkedLegalHolidayAmount + $noWorkedLegalHolidayAmount + $regularOtDayAmount + $regularOtNightAmount),
        'Total' => formatNumber($holidayPay)
    ];
    $payroll['HolidayHours']['Special'] = formatNumber($specialHolidayHours);
    $payroll['HolidayHours']['Regular'] = formatNumber($regularHolidayHours);

    // Sunday Calculations
    $sundayPay = 0;
    foreach ($attendance as $att) {
        $attDate = new DateTime($att['Date']);
        $isSunday = $attDate->format('N') == 7;
        $isHoliday = array_filter($holidays, function($h) use ($att) {
            return $h['Date'] === $att['Date'];
        });
        if ($isSunday && empty($isHoliday)) {
            $hoursWorked = (float)$att['HoursWorked'];
            if ($hoursWorked > 0) {
                // Cap regular Sunday hours at 8 hours to exclude overtime
                $regularSundayHours = min($hoursWorked, 8);
                $sundayHours += $regularSundayHours;
                $sundayAmount += $hourlyRate * 1.30 * $regularSundayHours;
                $sundayPay += $hourlyRate * 1.30 * $regularSundayHours;
                error_log("Sunday pay for EmployeeID {$employeeData['EmployeeID']}: RegularHours=$regularSundayHours, Amount=" . ($hourlyRate * 1.30 * $regularSundayHours));
            }
        }
    }
    $payroll['SundayPay'] = [
        'Hours' => formatNumber($sundayHours),
        'Total' => formatNumber($sundayPay)
    ];
    $payroll['SundayHours'] = formatNumber($sundayHours);

    $totalLateMinutes = $payroll['LateMinutes'] + $payroll['UndertimeMinutes'];
    $payroll['LateDeduction'] = formatNumber(($premiumDailyRate / 8) / 60 * $totalLateMinutes);

    $payroll['EarningsData'] = array_merge(
        [
            ['Description' => 'Daily Rate', 'Amount' => $payroll['DailyRate']],
        ],
        $allowancesData,
        [
            ['Description' => 'Basic Pay', 'Amount' => $payroll['BasicPay']],
            ['Description' => "Overtime Hours (125%): {$payroll['OvertimeHours']['Regular']} hrs", 'Amount' => $payroll['OvertimePay']['Regular']],
            ['Description' => "Overtime Hours (137.5%): {$payroll['OvertimeHours']['Night']} hrs", 'Amount' => $payroll['OvertimePay']['Night']],
            ['Description' => 'Overtime Pay', 'Amount' => $payroll['OvertimePay']['Total']],
        ]
    );

    $payroll['PremiumPayData'] = [
        ['Description' => "Sunday Hours (130%): " . formatNumber($sundayHours) . " hrs", 'Amount' => formatNumber($sundayAmount)],
        ['Description' => "Sunday Overtime Hours (169%): " . formatNumber($sundayOtDayHours) . " hrs", 'Amount' => formatNumber($sundayOtDayAmount)],
        ['Description' => "Sunday Overtime Hours (185.9%): " . formatNumber($sundayOtNightHours) . " hrs", 'Amount' => formatNumber($sundayOtNightAmount)],
        ['Description' => 'Sunday Pay', 'Amount' => formatNumber($sundayAmount + $sundayOtDayAmount + $sundayOtNightAmount)],
        ['Description' => "Holiday Hours (Special Non-Working Holiday) 130%: " . formatNumber($specialHolidayHours) . " hrs", 'Amount' => formatNumber($specialHolidayAmount)],
        ['Description' => "Holiday Overtime Hours (Special Non-Working Holiday) 169%: " . formatNumber($specialOtDayHours) . " hrs", 'Amount' => formatNumber($specialOtDayAmount)],
        ['Description' => "Holiday Overtime Hours (Special Non-Working Holiday) 185.9%: " . formatNumber($specialOtNightHours) . " hrs", 'Amount' => formatNumber($specialOtNightAmount)],
        ['Description' => "Holiday Hours (Regular Holiday) 200%: " . formatNumber($regularHolidayHours) . " hrs", 'Amount' => formatNumber($regularHolidayAmount)],
        ['Description' => "Holiday Overtime Hours (Regular Holiday) 260%: " . formatNumber($regularOtDayHours) . " hrs", 'Amount' => formatNumber($regularOtDayAmount)],
        ['Description' => "Holiday Overtime Hours (Regular Holiday) 286%: " . formatNumber($regularOtNightHours) . " hrs", 'Amount' => formatNumber($regularOtNightAmount)],
        ['Description' => "Non-Worked Legal Holiday 100%", 'Amount' => formatNumber($noWorkedLegalHolidayAmount)],
        ['Description' => 'Holiday Pay', 'Amount' => formatNumber($specialHolidayAmount + $specialOtDayAmount + $specialOtNightAmount + $regularHolidayAmount + $regularOtDayAmount + $regularOtNightAmount + $nonWorkedLegalHolidayAmount + $noWorkedLegalHolidayAmount)]
    ];

    $payroll['TotalEarnings'] = formatNumber(
        (float)$payroll['BasicPay'] +
        (float)$payroll['OvertimePay']['Total'] +
        (float)$payroll['HolidayPay']['Total'] +
        (float)$payroll['SundayPay']['Total']
    );

    $contributionsSum = is_array($employeeData['ContributionsData']) ? array_sum(array_map(function($c) {
        return is_numeric($c['Amount']) ? (float)$c['Amount'] : 0;
    }, $employeeData['ContributionsData'])) : 0;
    $payroll['TotalDeductions'] = formatNumber(
        (float)$payroll['LateDeduction'] +
        (float)$payroll['AbsentDeduction'] +
        $contributionsSum
    );

    $payroll['NetPay'] = formatNumber(
        (float)$payroll['TotalEarnings'] - (float)$payroll['TotalDeductions']
    );

    return $payroll;
}

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            if ($type == 'branches') {
                $sql = "SELECT BranchID, BranchName FROM Branches";
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
            $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
            $role = isset($_GET['role']) ? $_GET['role'] : null;
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = $page * $limit;
            $branch_id = isset($_GET['branch_id']) ? (int)$_GET['branch_id'] : null;
            $start_date = isset($_GET['start_date']) ? $_GET['start_date'] : null;
            $end_date = isset($_GET['end_date']) ? $_GET['end_date'] : null;
            $payroll_cut = isset($_GET['payroll_cut']) ? $_GET['payroll_cut'] : null;

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for payroll fetch.");
            }

            if ($start_date && $end_date) {
                if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $start_date) || !preg_match("/^\d{4}-\d{2}-\d{2}$/", $end_date)) {
                    throw new Exception("Invalid date format. Use YYYY-MM-DD.");
                }
                if (strtotime($end_date) < strtotime($start_date)) {
                    throw new Exception("End date cannot be before start date.");
                }
            }

            if ($payroll_cut && !in_array($payroll_cut, ['first', 'second'])) {
                throw new Exception("Invalid payroll_cut value. Must be 'first' or 'second'.");
            }

            $data = [];
            $total = 0;

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

                if ($branch_id && !in_array($branch_id, $allowedBranches)) {
                    throw new Exception("Selected branch is not assigned to this user.");
                }

                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $sql = "
                    SELECT 
                        e.EmployeeID,
                        e.EmployeeName,
                        e.BranchID,
                        b.BranchName,
                        p.HourlyMinimumWage,
                        SUM(
                            COALESCE(
                                CASE 
                                    WHEN a.TimeIn IS NOT NULL AND TIME(a.TimeIn) > ADDTIME(s.ShiftStart, '00:10:00')
                                    THEN TIMESTAMPDIFF(MINUTE, s.ShiftStart, TIME(a.TimeIn))
                                    ELSE 0 
                                END, 0
                            )
                        ) AS LateMinutes,
                        SUM(
                            COALESCE(
                                CASE 
                                    WHEN a.TimeOut IS NOT NULL AND TIME(a.TimeOut) < s.ShiftEnd
                                    THEN TIMESTAMPDIFF(MINUTE, TIME(a.TimeOut), s.ShiftEnd)
                                    ELSE 0 
                                END, 0
                            )
                        ) AS UndertimeMinutes,
                        COALESCE(
                            SUM(
                                CASE 
                                    WHEN a.TimeIn IS NOT NULL AND a.TimeOut IS NOT NULL
                                    THEN TIMESTAMPDIFF(MINUTE, a.TimeIn, a.TimeOut) / 60.0
                                    - CASE 
                                        WHEN TIME(a.TimeOut) > TIME('12:00:00') THEN 1 
                                        ELSE 0 
                                      END
                                    ELSE 0 
                                END
                            ), 0
                        ) AS HoursWorked
                    FROM Employees e
                    JOIN Attendance a ON e.EmployeeID = a.EmployeeID
                    JOIN Branches b ON e.BranchID = b.BranchID
                    LEFT JOIN Positions p ON e.PositionID = p.PositionID
                    LEFT JOIN Schedules s ON e.ScheduleID = s.ScheduleID
                    WHERE e.BranchID IN ($placeholders)";
                $countSql = "
                    SELECT COUNT(DISTINCT e.EmployeeID) as total 
                    FROM Employees e
                    JOIN Attendance a ON e.EmployeeID = a.EmployeeID
                    WHERE e.BranchID IN ($placeholders)";

                $params = $allowedBranches;
                $types = str_repeat('i', count($allowedBranches));

                if ($branch_id) {
                    $sql .= " AND e.BranchID = ?";
                    $countSql .= " AND e.BranchID = ?";
                    $params[] = $branch_id;
                    $types .= "i";
                }

                if ($start_date && $end_date) {
                    $sql .= " AND a.Date BETWEEN ? AND ?";
                    $countSql .= " AND a.Date BETWEEN ? AND ?";
                    $params[] = $start_date;
                    $params[] = $end_date;
                    $types .= "ss";
                }

                $sql .= " GROUP BY e.EmployeeID, e.EmployeeName, e.BranchID, b.BranchName, p.HourlyMinimumWage";
                $sql .= " LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= "ii";

                $stmt = $conn->prepare($sql);
                if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $result = $stmt->get_result();

                while ($row = $result->fetch_assoc()) {
                    $employeeId = $row['EmployeeID'];
                    $leaves = getLeaves($conn, $employeeId, $start_date, $end_date, $cache);
                    $holidays = getHolidays($conn, $employeeId, $start_date, $end_date, $cache);
                    $data[] = [
                        'EmployeeID' => $employeeId,
                        'EmployeeName' => $row['EmployeeName'],
                        'BranchID' => $row['BranchID'],
                        'BranchName' => $row['BranchName'],
                        'HourlyMinimumWage' => formatNumber($row['HourlyMinimumWage']),
                        'LateMinutes' => (int)$row['LateMinutes'],
                        'UndertimeMinutes' => (int)$row['UndertimeMinutes'],
                        'HoursWorked' => formatNumber($row['HoursWorked']),
                        'AllowancesData' => getAllowances($conn, $employeeId, $cache),
                        'ContributionsData' => getContributions($conn, $employeeId, $cache, $payroll_cut),
                        'CashAdvancesData' => getCashAdvances($conn, $employeeId, $cache, $start_date, $end_date),
                        'OvertimeData' => getOvertime($conn, $employeeId, $start_date, $end_date, $cache),
                        'HolidayData' => $holidays,
                        'LeaveData' => $leaves,
                        'AbsentDays' => getAbsentDays($conn, $employeeId, $start_date, $end_date, $leaves, $holidays),
                        'AttendanceData' => getAttendance($conn, $employeeId, $start_date, $end_date, $cache)
                    ];
                }
                $stmt->close();

                $countStmt = $conn->prepare($countSql);
                if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);
                $countParams = array_slice($params, 0, count($params) - 2);
                $countTypes = substr($types, 0, strlen($types) - 2);
                $countStmt->bind_param($countTypes, ...$countParams);
                $countStmt->execute();
                $countResult = $countStmt->get_result();
                $total = $countResult->fetch_assoc()['total'];
                $countStmt->close();

                error_log("Payroll Staff Data for user_id=$user_id, branch_id=" . ($branch_id ?? 'all') . ": " . json_encode($data));
            } elseif ($role === 'Payroll Admin') {
                $sql = "
                    SELECT 
                        e.EmployeeID,
                        e.EmployeeName,
                        e.BranchID,
                        b.BranchName,
                        p.HourlyMinimumWage,
                        SUM(
                            COALESCE(
                                CASE 
                                    WHEN a.TimeIn IS NOT NULL AND TIME(a.TimeIn) > ADDTIME(s.ShiftStart, '00:10:00')
                                    THEN TIMESTAMPDIFF(MINUTE, s.ShiftStart, TIME(a.TimeIn))
                                    ELSE 0 
                                END, 0
                            )
                        ) AS LateMinutes,
                        SUM(
                            COALESCE(
                                CASE 
                                    WHEN a.TimeOut IS NOT NULL AND TIME(a.TimeOut) < s.ShiftEnd
                                    THEN TIMESTAMPDIFF(MINUTE, TIME(a.TimeOut), s.ShiftEnd)
                                    ELSE 0 
                                END, 0
                            )
                        ) AS UndertimeMinutes,
                        COALESCE(
                            SUM(
                                CASE 
                                    WHEN a.TimeIn IS NOT NULL AND a.TimeOut IS NOT NULL
                                    THEN TIMESTAMPDIFF(MINUTE, a.TimeIn, a.TimeOut) / 60.0
                                    - CASE 
                                        WHEN TIME(a.TimeOut) > TIME('12:00:00') THEN 1 
                                        ELSE 0 
                                      END
                                    ELSE 0 
                                END
                            ), 0
                        ) AS HoursWorked
                    FROM Employees e
                    JOIN Attendance a ON e.EmployeeID = a.EmployeeID
                    JOIN Branches b ON e.BranchID = b.BranchID
                    LEFT JOIN Positions p ON e.PositionID = p.PositionID
                    LEFT JOIN Schedules s ON e.ScheduleID = s.ScheduleID
                    WHERE 1=1";
                $countSql = "
                    SELECT COUNT(DISTINCT e.EmployeeID) as total 
                    FROM Employees e
                    JOIN Attendance a ON e.EmployeeID = a.EmployeeID
                    WHERE 1=1";

                $params = [];
                $types = "";

                if ($branch_id) {
                    $sql .= " AND e.BranchID = ?";
                    $countSql .= " AND e.BranchID = ?";
                    $params[] = $branch_id;
                    $types .= "i";
                }

                if ($start_date && $end_date) {
                    $sql .= " AND a.Date BETWEEN ? AND ?";
                    $countSql .= " AND a.Date BETWEEN ? AND ?";
                    $params[] = $start_date;
                    $params[] = $end_date;
                    $types .= "ss";
                }

                $sql .= " GROUP BY e.EmployeeID, e.EmployeeName, e.BranchID, b.BranchName, p.HourlyMinimumWage";
                $sql .= " LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= "ii";

                $stmt = $conn->prepare($sql);
                if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
                if (!empty($params)) {
                    $stmt->bind_param($types, ...$params);
                }
                $stmt->execute();
                $result = $stmt->get_result();

                while ($row = $result->fetch_assoc()) {
                    $employeeId = $row['EmployeeID'];
                    $leaves = getLeaves($conn, $employeeId, $start_date, $end_date, $cache);
                    $holidays = getHolidays($conn, $employeeId, $start_date, $end_date, $cache);
                    $data[] = [
                        'EmployeeID' => $employeeId,
                        'EmployeeName' => $row['EmployeeName'],
                        'BranchID' => $row['BranchID'],
                        'BranchName' => $row['BranchName'],
                        'HourlyMinimumWage' => formatNumber($row['HourlyMinimumWage']),
                        'LateMinutes' => (int)$row['LateMinutes'],
                        'UndertimeMinutes' => (int)$row['UndertimeMinutes'],
                        'HoursWorked' => formatNumber($row['HoursWorked']),
                        'AllowancesData' => getAllowances($conn, $employeeId, $cache),
                        'ContributionsData' => getContributions($conn, $employeeId, $cache, $payroll_cut),
                        'CashAdvancesData' => getCashAdvances($conn, $employeeId, $cache, $start_date, $end_date),
                        'OvertimeData' => getOvertime($conn, $employeeId, $start_date, $end_date, $cache),
                        'HolidayData' => $holidays,
                        'LeaveData' => $leaves,
                        'AbsentDays' => getAbsentDays($conn, $employeeId, $start_date, $end_date, $leaves, $holidays),
                        'AttendanceData' => getAttendance($conn, $employeeId, $start_date, $end_date, $cache)
                    ];
                }
                $stmt->close();

                $countStmt = $conn->prepare($countSql);
                if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);
                $countParams = array_slice($params, 0, count($params) - 2);
                $countTypes = substr($types, 0, strlen($types) - 2);
                if (!empty($countParams)) {
                    $countStmt->bind_param($countTypes, ...$countParams);
                }
                $countStmt->execute();
                $countResult = $countStmt->get_result();
                $total = $countResult->fetch_assoc()['total'];
                $countStmt->close();

                error_log("Payroll Admin Data for user_id=$user_id, branch_id=" . ($branch_id ?? 'all') . ": " . json_encode($data));
            } else {
                throw new Exception("Invalid role specified. Must be 'Payroll Staff' or 'Payroll Admin'.");
            }

            echo json_encode([
                "success" => true,
                "data" => $data,
                "total" => $total,
                "page" => $page,
                "limit" => $limit
            ]);
        }
    } elseif ($method == "POST") {
        $input = json_decode(file_get_contents('php://input'), true);
        $action = isset($input['action']) ? $input['action'] : null;
        $user_id = isset($input['user_id']) ? $input['user_id'] : null;
        $payroll_cut = isset($input['payroll_cut']) ? $input['payroll_cut'] : null;
        $start_date = isset($input['start_date']) ? $input['start_date'] : null;
        $end_date = isset($input['end_date']) ? $input['end_date'] : null;

        if (!$action || !is_numeric($user_id) || (int)$user_id <= 0) {
            throw new Exception("action and a valid user_id are required for POST requests.");
        }
        $user_id = (int)$user_id;

        if (!recordExists($conn, 'UserAccounts', $user_id)) {
            throw new Exception("Invalid user_id: User does not exist.");
        }

        if ($action === 'generate_payslip') {
            $employeeId = isset($input['employeeId']) ? $input['employeeId'] : null;
            if (!is_numeric($employeeId) || (int)$employeeId <= 0) {
                throw new Exception("Invalid or missing employeeId: Must be a positive integer.");
            }
            $employeeId = (int)$employeeId;

            if (!recordExists($conn, 'Employees', $employeeId)) {
                throw new Exception("Employee ID $employeeId does not exist.");
            }

            if (!$start_date || !$end_date) {
                throw new Exception("start_date and end_date are required for payslip generation.");
            }

            error_log("Generating payslip: employeeId=$employeeId, user_id=$user_id, payroll_cut=" . ($payroll_cut ?? 'null') . ", start_date=$start_date, end_date=$end_date");

            $employeeName = getEmployeeNameById($conn, $employeeId);
            $leaves = getLeaves($conn, $employeeId, $start_date, $end_date, $cache);
            $holidays = getHolidays($conn, $employeeId, $start_date, $end_date, $cache);
            $attendance = getAttendance($conn, $employeeId, $start_date, $end_date, $cache);
            $overtime = getOvertime($conn, $employeeId, $start_date, $end_date, $cache);

            $stmt = $conn->prepare("
                SELECT e.EmployeeID, e.EmployeeName, e.BranchID, b.BranchName, p.HourlyMinimumWage
                FROM Employees e
                LEFT JOIN Branches b ON e.BranchID = b.BranchID
                LEFT JOIN Positions p ON e.PositionID = p.PositionID
                WHERE e.EmployeeID = ?
            ");
            if (!$stmt) throw new Exception("Prepare failed for payslip data: " . $conn->error);
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result->fetch_assoc();
            $stmt->close();

            $employeeData = [
                'EmployeeID' => $employeeId,
                'EmployeeName' => $employeeName,
                'BranchID' => $row['BranchID'],
                'BranchName' => $row['BranchName'],
                'HourlyMinimumWage' => formatNumber($row['HourlyMinimumWage'] ?? 0),
                'AllowancesData' => getAllowances($conn, $employeeId, $cache),
                'ContributionsData' => getContributions($conn, $employeeId, $cache, $payroll_cut),
                'CashAdvancesData' => getCashAdvances($conn, $employeeId, $cache, $start_date, $end_date),
                'OvertimeData' => $overtime,
                'HolidayData' => $holidays,
                'LeaveData' => $leaves,
                'AbsentDays' => getAbsentDays($conn, $employeeId, $start_date, $end_date, $leaves, $holidays),
                'AttendanceData' => $attendance
            ];

            $payroll = calculatePayroll($employeeData, $attendance, $overtime, $holidays, $payroll_cut);
            $employeeData = array_merge($employeeData, $payroll);

            $description = "Generated payslip for EmployeeID: $employeeId ($employeeName), Wage: ₱" . $employeeData['HourlyMinimumWage'];
            logUserActivity($conn, $user_id, 'GENERATE_DATA', 'Employees', $employeeId, $description);

            echo json_encode([
                "success" => true,
                "message" => "Payslip generated for EmployeeID: $employeeId",
                "data" => $employeeData
            ]);
        } elseif ($action === 'generate_bulk_payslip') {
            $employeeIds = isset($input['employeeIds']) && is_array($input['employeeIds']) ? $input['employeeIds'] : [];
            if (empty($employeeIds)) {
                throw new Exception("employeeIds array is required and cannot be empty.");
            }

            if (!$start_date || !$end_date) {
                throw new Exception("start_date and end_date are required for bulk payslip generation.");
            }

            error_log("Generating bulk payslip: user_id=$user_id, payroll_cut=" . ($payroll_cut ?? 'null') . ", start_date=$start_date, end_date=$end_date, employeeIds=" . json_encode($employeeIds));

            $processedData = [];
            foreach ($employeeIds as $employeeId) {
                $employeeId = (int)$employeeId;
                if (!recordExists($conn, 'Employees', $employeeId)) {
                    error_log("Skipping invalid EmployeeID: $employeeId");
                    continue;
                }

                $employeeName = getEmployeeNameById($conn, $employeeId);
                $leaves = getLeaves($conn, $employeeId, $start_date, $end_date, $cache);
                $holidays = getHolidays($conn, $employeeId, $start_date, $end_date, $cache);
                $attendance = getAttendance($conn, $employeeId, $start_date, $end_date, $cache);
                $overtime = getOvertime($conn, $employeeId, $start_date, $end_date, $cache);

                $stmt = $conn->prepare("
                    SELECT e.EmployeeID, e.EmployeeName, e.BranchID, b.BranchName, p.HourlyMinimumWage
                    FROM Employees e
                    LEFT JOIN Branches b ON e.BranchID = b.BranchID
                    LEFT JOIN Positions p ON e.PositionID = p.PositionID
                    WHERE e.EmployeeID = ?
                ");
                if (!$stmt) throw new Exception("Prepare failed for bulk payslip data: " . $conn->error);
                $stmt->bind_param("i", $employeeId);
                $stmt->execute();
                $result = $stmt->get_result();
                $row = $result->fetch_assoc();
                $stmt->close();

                $employeeData = [
                    'EmployeeID' => $employeeId,
                    'EmployeeName' => $employeeName,
                    'BranchID' => $row['BranchID'],
                    'BranchName' => $row['BranchName'],
                    'HourlyMinimumWage' => formatNumber($row['HourlyMinimumWage'] ?? 0),
                    'AllowancesData' => getAllowances($conn, $employeeId, $cache),
                    'ContributionsData' => getContributions($conn, $employeeId, $cache, $payroll_cut),
                    'CashAdvancesData' => getCashAdvances($conn, $employeeId, $cache, $start_date, $end_date),
                    'OvertimeData' => $overtime,
                    'HolidayData' => $holidays,
                    'LeaveData' => $leaves,
                    'AbsentDays' => getAbsentDays($conn, $employeeId, $start_date, $end_date, $leaves, $holidays),
                    'AttendanceData' => $attendance
                ];

                $payroll = calculatePayroll($employeeData, $attendance, $overtime, $holidays, $payroll_cut);
                $employeeData = array_merge($employeeData, $payroll);

                $description = "Generated bulk payslip for EmployeeID: $employeeId ($employeeName), Wage: ₱" . $employeeData['HourlyMinimumWage'];
                logUserActivity($conn, $user_id, 'GENERATE_DATA', 'Employees', $employeeId, $description);

                $processedData[] = $employeeData;
            }

            if (empty($processedData)) {
                throw new Exception("No valid employee IDs were processed for bulk payslip generation.");
            }

            echo json_encode([
                "success" => true,
                "message" => "Bulk payslips generated successfully.",
                "data" => $processedData,
                "processedIds" => array_column($processedData, 'EmployeeID')
            ]);
        } elseif ($action === 'generate_report') {
            $branch_id = isset($input['branch_id']) ? (int)$input['branch_id'] : null;

            $sql = "
                SELECT 
                    e.EmployeeID,
                    e.EmployeeName,
                    b.BranchName,
                    p.HourlyMinimumWage,
                    COALESCE(
                        SUM(
                            CASE 
                                WHEN a.TimeIn IS NOT NULL AND a.TimeOut IS NOT NULL
                                THEN TIMESTAMPDIFF(MINUTE, a.TimeIn, a.TimeOut) / 60.0
                                - CASE 
                                    WHEN TIME(a.TimeOut) > TIME('12:00:00') THEN 1 
                                    ELSE 0 
                                END
                                ELSE 0 
                            END
                        ), 0
                    ) AS HoursWorked
                FROM Employees e
                JOIN Branches b ON e.BranchID = b.BranchID
                LEFT JOIN Positions p ON e.PositionID = p.PositionID
                LEFT JOIN Attendance a ON e.EmployeeID = a.EmployeeID
                WHERE 1=1
            ";
            $params = [];
            $types = "";

            if ($branch_id) {
                $sql .= " AND e.BranchID = ?";
                $params[] = $branch_id;
                $types .= "i";
            }

            $sql .= " GROUP BY e.EmployeeID, e.EmployeeName, b.BranchName, p.HourlyMinimumWage";

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed for report query: " . $conn->error);
            if (!empty($params)) {
                $stmt->bind_param($types, ...$params);
            }
            $stmt->execute();
            $result = $stmt->get_result();

            $reportData = [];
            while ($row = $result->fetch_assoc()) {
                $reportData[] = [
                    'EmployeeID' => $row['EmployeeID'],
                    'EmployeeName' => $row['EmployeeName'],
                    'BranchName' => $row['BranchName'],
                    'HourlyMinimumWage' => formatNumber($row['HourlyMinimumWage']),
                    'HoursWorked' => formatNumber($row['HoursWorked'])
                ];
            }
            $stmt->close();

            $description = "Generated payroll report" . ($branch_id ? " for BranchID: $branch_id" : "");
            logUserActivity($conn, $user_id, 'GENERATE_DATA', 'Payroll', null, $description);

            echo json_encode([
                "success" => true,
                "message" => "Payroll report generated successfully.",
                "data" => $reportData
            ]);
        } else {
            throw new Exception("Invalid action specified.");
        }
    } else {
        throw new Exception("Method not allowed.");
    }

    $conn->close();
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}

ob_end_flush();
?>