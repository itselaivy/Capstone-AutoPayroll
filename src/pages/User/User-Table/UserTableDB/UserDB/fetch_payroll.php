<?php
// Prevent unwanted output
ob_start();

ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
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

    function formatNumberWithDecimals($value) {
        // Format to exactly 3 decimal places without rounding
        return sprintf('%.3f', floor($value * 1000) / 1000);
    }

    function formatNumber($value, $roundToWhole = false) {
        $floatValue = (float)$value;
        if ($roundToWhole) {
            // Round to nearest whole number based on tenths digit
            $tenths = floor($floatValue * 10) % 10;
            if ($tenths >= 5) {
                return (string)ceil($floatValue); // Round up
            } else {
                return (string)floor($floatValue); // Round down
            }
        }
        // For non-whole number cases, format to 2 decimal places if not a whole number
        if (floor($floatValue) == $floatValue) {
            return (string)(int)$floatValue; // No decimals for whole numbers
        }
        return number_format($floatValue, 2, '.', '');
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
            SELECT OvertimeID, Date, `No. of Hours` AS Hours, 
                StartOvertime1, EndOvertime1, StartOvertime2, EndOvertime2
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
            // Skip records where StartOvertime1 and EndOvertime1 are null or empty
            if (empty($row['StartOvertime1']) || empty($row['EndOvertime1'])) {
                error_log("Skipping overtime record for EmployeeID $employeeId on {$row['Date']}: StartOvertime1 or EndOvertime1 is null/empty");
                continue;
            }
            $overtime[] = [
                'OvertimeID' => $row['OvertimeID'],
                'Date' => $row['Date'],
                'Hours' => formatNumber($row['Hours']),
                'StartOvertime1' => $row['StartOvertime1'],
                'EndOvertime1' => $row['EndOvertime1'],
                'StartOvertime2' => $row['StartOvertime2'],
                'EndOvertime2' => $row['EndOvertime2']
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
        if (isset($cache[$cacheKey])) {
            return $cache[$cacheKey];
        }

        $stmt = $conn->prepare("
            SELECT LeaveID, StartDate, EndDate, LeaveType, LeaveCredits, AvailableLeaveCredits, UsedLeaveCredits
            FROM Leaves
            WHERE EmployeeID = ? AND (
                (StartDate <= ? AND EndDate >= ?) OR
                (StartDate >= ? AND StartDate <= ?) OR
                (EndDate >= ? AND EndDate <= ?)
            )
        ");
        if (!$stmt) {
            error_log("Prepare failed for leaves query: " . $conn->error);
            return [];
        }
        $stmt->bind_param("issssss", $employeeId, $end_date, $start_date, $start_date, $end_date, $start_date, $end_date);
        $stmt->execute();
        $result = $stmt->get_result();
        $leaves = [];

        while ($row = $result->fetch_assoc()) {
            $leaveStart = new DateTime($row['StartDate']);
            $leaveEnd = new DateTime($row['EndDate']);
            $payrollStart = new DateTime($start_date);
            $payrollEnd = new DateTime($end_date);

            // Calculate days within the payroll period
            $start = $leaveStart < $payrollStart ? $payrollStart : $leaveStart;
            $end = $leaveEnd > $payrollEnd ? $payrollEnd : $leaveEnd;
            $interval = $start->diff($end);
            $days = $interval->days + 1; // Include end date

            $leaves[] = [
                'LeaveID' => $row['LeaveID'],
                'StartDate' => $row['StartDate'],
                'EndDate' => $row['EndDate'],
                'LeaveType' => $row['LeaveType'],
                'UsedLeaveCredits' => $days
            ];
        }
        $stmt->close();
        $cache[$cacheKey] = $leaves;
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
            s.ShiftStart,
            s.ShiftEnd,
            o.StartOvertime1,
            o.EndOvertime1,
            o.StartOvertime2,
            o.EndOvertime2,
            COALESCE(
                TIMESTAMPDIFF(MINUTE, a.TimeIn, a.TimeOut) / 60.0
                - CASE 
                    WHEN a.TimeOut > TIME('12:00:00') THEN 1 
                    ELSE 0 
                  END, 0
            ) AS HoursWorked
        FROM Attendance a
        JOIN Employees e ON e.EmployeeID = a.EmployeeID
        LEFT JOIN Schedules s ON e.ScheduleID = s.ScheduleID
        LEFT JOIN Overtime o ON a.EmployeeID = o.EmployeeID AND a.Date = o.Date
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
        $lateMinutes = 0;
        $undertimeMinutes = 0;

        // Calculate LateMinutes
        if ($row['TimeIn']) {
            $timeIn = new DateTime($row['Date'] . ' ' . $row['TimeIn']);
            $shiftStart = new DateTime($row['Date'] . ' ' . $row['ShiftStart']);

            // Check if overtime exists and StartOvertime1 is before ShiftStart
            if ($row['StartOvertime1'] && $row['EndOvertime1'] && $row['StartOvertime1'] < $row['ShiftStart']) {
                $otStart = new DateTime($row['Date'] . ' ' . $row['StartOvertime1']);
                if ($timeIn > $otStart) {
                    $interval = $otStart->diff($timeIn);
                    $lateMinutes = $interval->h * 60 + $interval->i;
                }
            } else {
                // Apply 10-minute grace period to ShiftStart
                $gracePeriod = clone $shiftStart;
                $gracePeriod->modify('+10 minutes');
                if ($timeIn > $gracePeriod) {
                    $interval = $shiftStart->diff($timeIn);
                    $lateMinutes = $interval->h * 60 + $interval->i;
                }
            }
        }

        // Calculate UndertimeMinutes
        if ($row['TimeOut']) {
            $timeOut = new DateTime($row['Date'] . ' ' . $row['TimeOut']);
            $shiftEnd = new DateTime($row['Date'] . ' ' . $row['ShiftEnd']);

            // Check if overtime exists after ShiftEnd (using either EndOvertime1 or EndOvertime2)
            $otEnd = null;
            if ($row['StartOvertime1'] && $row['EndOvertime1'] && $row['EndOvertime1'] > $row['ShiftEnd']) {
                $otEnd = new DateTime($row['Date'] . ' ' . $row['EndOvertime1']);
            } elseif ($row['StartOvertime2'] && $row['EndOvertime2'] && $row['EndOvertime2'] > $row['ShiftEnd']) {
                $otEnd = new DateTime($row['Date'] . ' ' . $row['EndOvertime2']);
            }

            if ($otEnd) {
                if ($otEnd < $timeOut) {
                    $otEnd->modify('+1 day');
                }
                if ($timeOut < $otEnd) {
                    $interval = $timeOut->diff($otEnd);
                    $undertimeMinutes = $interval->h * 60 + $interval->i;
                }
            } else {
                // Compare against ShiftEnd
                if ($timeOut < $shiftEnd) {
                    $interval = $timeOut->diff($shiftEnd);
                    $undertimeMinutes = $interval->h * 60 + $interval->i;
                }
            }
        }

        $attendance[] = [
            'Date' => $row['Date'],
            'TimeIn' => $row['TimeIn'],
            'TimeOut' => $row['TimeOut'],
            'TimeInStatus' => $lateMinutes > 0 ? 'Late' : 'On-Time',
            'HoursWorked' => formatNumber($row['HoursWorked']),
            'LateMinutes' => (int)$lateMinutes,
            'UndertimeMinutes' => (int)$undertimeMinutes
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

function calculatePayroll($employeeData, $attendance, $overtime, $holidays, $payrollCut, $startDate, $endDate) {
    global $conn;
    $payroll = [];
    $employeeId = $employeeData['EmployeeID'];

    // Calculate Days Present
    $start = new DateTime($startDate);
    $end = new DateTime($endDate);
    $interval = DateInterval::createFromDateString('1 day');
    $period = new DatePeriod($start, $interval, $end->modify('+1 day')); // Include end date
    $expectedDays = 0;
    foreach ($period as $date) {
        $dayOfWeek = $date->format('N');
        if ($dayOfWeek >= 1 && $dayOfWeek <= 6) { // Monday to Saturday
            $expectedDays++;
        }
    }
    $absentDays = (float)$employeeData['AbsentDays'];
    $leaveDays = 0;
    if (is_array($employeeData['LeaveData'])) {
        foreach ($employeeData['LeaveData'] as $leave) {
            $leaveStart = new DateTime($leave['StartDate']);
            $leaveEnd = new DateTime($leave['EndDate']);
            if (
                ($leaveStart >= $start && $leaveStart <= $end) ||
                ($leaveEnd >= $start && $leaveEnd <= $end) ||
                ($leaveStart <= $start && $leaveEnd >= $end)
            ) {
                $leaveDays += (float)($leave['UsedLeaveCredits'] ?? 0);
            }
        }
    }
    $holidayDays = is_array($holidays) ? count(array_filter($holidays, function($h) use ($start, $end) {
        $holidayDate = new DateTime($h['Date']);
        return $holidayDate >= $start && $holidayDate <= $end;
    })) : 0;
    $daysPresent = max(0, $expectedDays - $absentDays - $leaveDays - $holidayDays);

    // Calculate Rates
    $hourlyMinimumWage = (float)$employeeData['HourlyMinimumWage'];
    $dailyRate = $hourlyMinimumWage * 8;
    $hourlyRate = $hourlyMinimumWage;
    $payroll['DailyRate'] = formatNumber($dailyRate, true);
    $payroll['BasicRate'] = formatNumber($dailyRate, true);
    $payroll['HourlyRate'] = formatNumber($hourlyRate, true);

    // Calculate Allowances
    $allowancesData = [];
    $transportAllowance = 0;
    foreach ($employeeData['AllowancesData'] as $allowance) {
        $amount = (float)$allowance['Amount'];
        if ($allowance['Description'] === 'Transportation') {
            $transportAllowance = $amount;
        }
        $allowancesData[] = [
            'Description' => $allowance['Description'],
            'Amount' => formatNumber($amount, true)
        ];
    }

    // Calculate Earnings
    $dailyRateAmount = $dailyRate * $daysPresent;
    $transportAllowanceAmount = ($leaveDays + $daysPresent + $holidayDays) * $transportAllowance;
    $minTranspo = ($dailyRate + $transportAllowance) / 8;
    $basicPay = $dailyRateAmount + $transportAllowanceAmount;
    $leavePay = $dailyRate * $leaveDays;

    function computeBasicPay($dailyRateAmount, $transportAllowanceAmount) {
        $dailyRateAmt = $dailyRateAmount;
        $transportAllowanceAmt = $transportAllowanceAmount;
        $_basicPay = $dailyRateAmt + $transportAllowanceAmt;
        return $_basicPay;
    }

    $payroll['BasicPay'] = formatNumber($basicPay, true);
    $payroll['LeavePay'] = formatNumber($leavePay, true);
    
    // Calculate Overtime Pay
    $regularOtHours = 0;
    $nightOtHours = 0;
    $regularOtAmount = 0;
    $nightOtAmount = 0;

    foreach ($overtime as $ot) {
        $otDate = new DateTime($ot['Date']);
        $isSunday = $otDate->format('N') == 7;
        $isHoliday = array_filter($holidays, function($h) use ($ot) {
            return $h['Date'] === $ot['Date'];
        });

        if ($isSunday || !empty($isHoliday)) {
            continue; // Skip overtime on Sundays or holidays as they are handled in PremiumPayData
        }

        // Get attendance for the overtime date
        $attendanceOnDate = array_filter($attendance, function($a) use ($ot) {
            return $a['Date'] === $ot['Date'];
        });
        $attendanceOnDate = reset($attendanceOnDate); // Get first matching attendance

        if (!$attendanceOnDate) {
            continue; // Skip if no attendance for this date
        }

        // Get schedule for the employee
        $stmt = $conn->prepare("SELECT ShiftStart, ShiftEnd FROM Schedules WHERE ScheduleID = (SELECT ScheduleID FROM Employees WHERE EmployeeID = ?)");
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $schedule = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $shiftStart = $schedule['ShiftStart'] ? new DateTime($ot['Date'] . ' ' . $schedule['ShiftStart']) : null;
        $shiftEnd = $schedule['ShiftEnd'] ? new DateTime($ot['Date'] . ' ' . $schedule['ShiftEnd']) : null;

        // Initialize overtime periods
        $otPeriods = [];
        if ($ot['StartOvertime1'] && $ot['EndOvertime1']) {
            $startOt1 = new DateTime($ot['Date'] . ' ' . $ot['StartOvertime1']);
            $endOt1 = new DateTime($ot['Date'] . ' ' . $ot['EndOvertime1']);
            if ($endOt1 < $startOt1) {
                $endOt1->modify('+1 day');
            }
            $otPeriods[] = ['start' => $startOt1, 'end' => $endOt1];
        }
        if ($ot['StartOvertime2'] && $ot['EndOvertime2']) {
            $startOt2 = new DateTime($ot['Date'] . ' ' . $ot['StartOvertime2']);
            $endOt2 = new DateTime($ot['Date'] . ' ' . $ot['EndOvertime2']);
            if ($endOt2 < $startOt2) {
                $endOt2->modify('+1 day');
            }
            $otPeriods[] = ['start' => $startOt2, 'end' => $endOt2];
        }

        // Calculate total overtime hours
        $totalOtHours = 0;
        foreach ($otPeriods as $period) {
            // Ensure overtime is within attendance TimeIn and TimeOut
            $attTimeIn = new DateTime($ot['Date'] . ' ' . $attendanceOnDate['TimeIn']);
            $attTimeOut = new DateTime($ot['Date'] . ' ' . $attendanceOnDate['TimeOut']);
            if ($attTimeOut < $attTimeIn) {
                $attTimeOut->modify('+1 day');
            }
            $otStart = max($period['start'], $attTimeIn);
            $otEnd = min($period['end'], $attTimeOut);
            if ($otEnd <= $otStart) {
                continue;
            }
            $interval = $otStart->diff($otEnd);
            $hours = $interval->h + $interval->i / 60;
            $totalOtHours += $hours;
        }

        if ($totalOtHours <= 0) {
            continue;
        }

        // Calculate regular shift hours (capped at 8 hours)
        $regularShiftStart = max($attTimeIn, $shiftStart);
        $regularShiftEnd = min($attTimeOut, $shiftEnd);
        $regularInterval = $regularShiftStart->diff($regularShiftEnd);
        $regularShiftHours = ($regularInterval->h + $regularInterval->i / 60);
        $regularShiftHours = min($regularShiftHours, 8); // Cap at 8 hours

        // Overtime hours are the calculated periods minus any overlap with regular shift
        $overtimeHours = $totalOtHours;
        if ($overtimeHours <= 0) {
            continue;
        }

        // Calculate night shift differential (10 PM - 6 AM)
        $nightHours = 0;
        foreach ($otPeriods as $period) {
            $nightStart = new DateTime($ot['Date'] . ' 22:00:00');
            $nightEnd = (new DateTime($ot['Date'] . ' 06:00:00'))->modify('+1 day');
            $otStart = max($period['start'], $attTimeIn);
            $otEnd = min($period['end'], $attTimeOut);
            if ($otEnd <= $otStart) {
                continue;
            }
            $nightShiftStart = max($otStart, $nightStart);
            $nightShiftEnd = min($otEnd, $nightEnd);
            if ($nightShiftStart < $nightShiftEnd) {
                $nightInterval = $nightShiftStart->diff($nightShiftEnd);
                $nightHours += $nightInterval->h + $nightInterval->i / 60;
            }
        }

        // Ensure night hours do not exceed overtime hours
        $nightHours = min($nightHours, $overtimeHours);
        $regularHours = $overtimeHours - $nightHours;

        // Apply rates
        $regularOtHours += $regularHours;
        $regularOtAmount += $hourlyRate * 1.25 * $regularHours;
        $nightOtHours += $nightHours;
        $nightOtAmount += $hourlyRate * 1.375 * $nightHours;
    }

    $overtimePayTotal = $regularOtAmount + $nightOtAmount;
    $payroll['OvertimePay'] = [
        'Regular' => formatNumber($regularOtAmount, true),
        'Night' => formatNumber($nightOtAmount, true),
        'Total' => formatNumber($overtimePayTotal, true)
    ];
    $payroll['OvertimeHours'] = [
        'Regular' => formatNumber($regularOtHours),
        'Night' => formatNumber($nightOtHours)
    ];

    // Calculate Holiday Pay
    $specialHolidayHours = 0;
    $specialHolidayAmount = 0;
    $specialOtHours = 0;
    $specialOtAmount = 0;
    $regularHolidayHours = 0;
    $regularHolidayAmount = 0;
    $regularOtHours = 0;
    $regularOtAmount = 0;
    $noWorkedLegalHolidayAmount = 0;
    $holidayPay = 0;

    // Ensure required variables are defined
    $hourlyRate = isset($hourlyRate) ? (float)$hourlyRate : 0;
    $dailyRate = isset($dailyRate) ? (float)$dailyRate : 0;
    $holidays = isset($holidays) && is_array($holidays) ? $holidays : [];
    $leaves = isset($leaves) && is_array($leaves) ? $leaves : [];
    $attendance = isset($attendance) && is_array($attendance) ? $attendance : [];
    $overtime = isset($overtime) && is_array($overtime) ? $overtime : [];

    if ($hourlyRate === 0 || $dailyRate === 0) {
        error_log("Warning: hourlyRate or dailyRate is zero for EmployeeID {$employeeData['EmployeeID']}");
    }

    try {
        $start = new DateTime($startDate);
        $end = new DateTime($endDate);
    } catch (Exception $e) {
        error_log("Invalid date format for start_date or end_date: " . $e->getMessage());
        $start = new DateTime();
        $end = new DateTime();
    }

    foreach ($holidays as $holiday) {
        $holidayDate = isset($holiday['Date']) ? $holiday['Date'] : null;
        $holidayType = isset($holiday['HolidayType']) ? $holiday['HolidayType'] : null;
        if (!$holidayDate || !$holidayType) continue;

        try {
            $holidayDt = new DateTime($holidayDate);
            if ($holidayDt < $start || $holidayDt > $end) continue;
        } catch (Exception $e) {
            error_log("Invalid holiday date format for holiday: " . json_encode($holiday));
            continue;
        }

        // Check if employee has leave on this holiday
        $hasLeave = array_filter($leaves, function($leave) use ($holidayDate) {
            return isset($leave['StartDate']) && isset($leave['EndDate']) &&
                   $leave['StartDate'] <= $holidayDate && $leave['EndDate'] >= $holidayDate;
        });

        // Check if employee worked on this holiday
        $att = array_filter($attendance, function($a) use ($holidayDate) {
            return isset($a['Date']) && $a['Date'] === $holidayDate;
        });
        $att = reset($att);

        if ($holidayType === 'Special Non-Working Holiday') {
            if ($att && isset($att['HoursWorked']) && (float)$att['HoursWorked'] > 0) {
                $hoursWorked = min((float)$att['HoursWorked'], 8);
                $specialHolidayHours += $hoursWorked;
                $specialHolidayAmount += $hourlyRate * 1.30 * $hoursWorked;
                $holidayPay += $hourlyRate * 1.30 * $hoursWorked;
            }
            // Special Holiday Overtime
            $otOnDate = array_filter($overtime, function($ot) use ($holidayDate) {
                return isset($ot['Date']) && $ot['Date'] === $holidayDate;
            });
            foreach ($otOnDate as $ot) {
                $hours = isset($ot['Hours']) ? (float)$ot['Hours'] : 0;
                $specialOtHours += $hours;
                $specialOtAmount += $hourlyRate * 1.30 * $hours;
                $holidayPay += $hourlyRate * 1.30 * $hours;
            }
        } elseif ($holidayType === 'Legal Holiday') {
            if ($att && isset($att['HoursWorked']) && (float)$att['HoursWorked'] > 0) {
                $hoursWorked = min((float)$att['HoursWorked'], 8);
                $regularHolidayHours += $hoursWorked;
                $regularHolidayAmount += $hourlyRate * 2.00 * $hoursWorked;
                $holidayPay += $hourlyRate * 2.00 * $hoursWorked;
            } elseif (!$hasLeave && !$att) {
                // Non-worked legal holiday (100% of daily rate)
                $noWorkedLegalHolidayAmount += $dailyRate;
                $holidayPay += $dailyRate;
            }
            // Legal Holiday Overtime
            $otOnDate = array_filter($overtime, function($ot) use ($holidayDate) {
                return isset($ot['Date']) && $ot['Date'] === $holidayDate;
            });
            foreach ($otOnDate as $ot) {
                $hours = isset($ot['Hours']) ? (float)$ot['Hours'] : 0;
                $regularOtHours += $hours;
                $regularOtAmount += $hourlyRate * 2.00 * $hours;
                $holidayPay += $hourlyRate * 2.00 * $hours;
            }
        }
    }

    $payroll['HolidayPay'] = [
        'Special' => formatNumber($specialHolidayAmount + $specialOtAmount),
        'Regular' => formatNumber($regularHolidayAmount + $regularOtAmount),
        'Total' => formatNumber($holidayPay, true)
    ];
    $payroll['HolidayHours'] = [
        'Special' => formatNumber($specialHolidayHours),
        'Regular' => formatNumber($regularHolidayHours)
    ];

    // Calculate Sunday Pay
    $sundayHours = 0;
    $sundayAmount = 0;
    $sundayOtHours = 0;
    $sundayOtAmount = 0;
    foreach ($attendance as $att) {
        $attDate = new DateTime($att['Date']);
        $isSunday = $attDate->format('N') == 7;
        $isHoliday = array_filter($holidays, function($h) use ($att) {
            return $h['Date'] === $att['Date'];
        });
        if ($isSunday && empty($isHoliday)) {
            $hoursWorked = (float)($att['HoursWorked'] ?? 0);
            if ($hoursWorked > 0) {
                $regularSundayHours = min($hoursWorked, 8);
                $sundayHours += $regularSundayHours;
                $sundayAmount += $hourlyRate * 1.30 * $regularSundayHours;
            }
        }
    }
    // Sunday Overtime
    foreach ($overtime as $ot) {
        $otDate = new DateTime($ot['Date']);
        $isSunday = $otDate->format('N') == 7;
        $isHoliday = array_filter($holidays, function($h) use ($ot) {
            return $h['Date'] === $ot['Date'];
        });
        if ($isSunday && empty($isHoliday)) {
            $sundayOtHours += (float)$ot['Hours'];
            $sundayOtAmount += $hourlyRate * 1.30 * (float)$ot['Hours'];
        }
    }
    $sundayPayTotal = $sundayAmount + $sundayOtAmount;
    $payroll['SundayPay'] = [
        'Hours' => formatNumber($sundayHours),
        'Total' => formatNumber($sundayPayTotal, true)
    ];
    $payroll['SundayHours'] = formatNumber($sundayHours);

    // Calculate Deductions
    $payroll['LateMinutes'] = array_sum(array_map(function($a) use ($start, $end) {
        $attDate = new DateTime($a['Date']);
        if ($attDate < $start || $attDate > $end) return 0;
        return (int)($a['LateMinutes'] ?? 0);
    }, $attendance));
    $payroll['UndertimeMinutes'] = array_sum(array_map(function($a) use ($start, $end) {
        $attDate = new DateTime($a['Date']);
        if ($attDate < $start || $attDate > $end) return 0;
        return (int)($a['UndertimeMinutes'] ?? 0);
    }, $attendance));
    $totalLateMinutes = $payroll['LateMinutes'] + $payroll['UndertimeMinutes'];
    $payroll['LateDeduction'] = formatNumber(($minTranspo / 60) * $totalLateMinutes, true);

    // Contributions
    $contributionsSum = is_array($employeeData['ContributionsData']) ? array_sum(array_map(function($c) {
        return is_numeric($c['Amount']) ? (float)$c['Amount'] : 0;
    }, $employeeData['ContributionsData'])) : 0;

    // Earnings Data for Table
    $payroll['EarningsData'] = array_merge(
        [
            ['Description' => "Daily Rate: $daysPresent Days Present", 'Amount' => formatNumber($dailyRateAmount, true)],
            ['Description' => 'Transportation Allowance', 'Amount' => formatNumber($transportAllowanceAmount, true)],
            ['Description' => 'Basic Pay', 'Amount' => formatNumber($basicPay, true)],
            ['Description' => "Leave with Pay: $leaveDays Days", 'Amount' => formatNumber($leavePay, true)],
            ['Description' => "Overtime Hours (125%): {$payroll['OvertimeHours']['Regular']} hrs", 'Amount' => $payroll['OvertimePay']['Regular']],
            ['Description' => "Overtime Hours (137.5%): {$payroll['OvertimeHours']['Night']} hrs", 'Amount' => $payroll['OvertimePay']['Night']],
            ['Description' => 'Overtime Pay', 'Amount' => $payroll['OvertimePay']['Total']],
        ],
        $allowancesData
    );

    // Premium Pay Data
    $payroll['PremiumPayData'] = [
        ['Description' => "Sunday Hours (130%): {$payroll['SundayHours']} hrs", 'Amount' => formatNumber($sundayAmount, true)],
        ['Description' => "Sunday Overtime (130%): " . formatNumber($sundayOtHours) . " hrs", 'Amount' => formatNumber($sundayOtAmount, true)],
        ['Description' => "Sunday Pay", 'Amount' => $payroll['SundayPay']['Total']],
        ['Description' => "Holiday Hours (Special 130%): {$payroll['HolidayHours']['Special']} hrs", 'Amount' => formatNumber($specialHolidayAmount, true)],
        ['Description' => "Holiday Overtime (Special 130%): " . formatNumber($specialOtHours) . " hrs", 'Amount' => formatNumber($specialOtAmount, true)],
        ['Description' => "Holiday Hours (Legal 200%): {$payroll['HolidayHours']['Regular']} hrs", 'Amount' => formatNumber($regularHolidayAmount, true)],
        ['Description' => "Holiday Overtime (Legal 200%): " . formatNumber($regularOtHours) . " hrs", 'Amount' => formatNumber($regularOtAmount, true)],
        ['Description' => "No-Worked Legal Holiday (100%)", 'Amount' => formatNumber($noWorkedLegalHolidayAmount, true)],
        ['Description' => "Holiday Pay", 'Amount' => $payroll['HolidayPay']['Total']]
    ];

    // Calculate Total Earnings (Gross Pay)
    $payroll['TotalEarnings'] = formatNumber(
        (float)$payroll['BasicPay'] +
        (float)$payroll['OvertimePay']['Total'] +
        (float)$payroll['HolidayPay']['Total'] +
        (float)$payroll['SundayPay']['Total'] +
        (float)$payroll['LeavePay'],
        true
    );

    // Calculate Total Deductions
    $payroll['TotalDeductions'] = formatNumber(
        (float)$payroll['LateDeduction'] +
        $contributionsSum,
        true
    );

    // Calculate Net Pay
    $payroll['NetPay'] = formatNumber(
        (float)$payroll['TotalEarnings'] - (float)$payroll['TotalDeductions'],
        true
    );

    // Additional Payroll Data
    $payroll['LateMinutes'] = (int)$payroll['LateMinutes'];
    $payroll['UndertimeMinutes'] = (int)$payroll['UndertimeMinutes'];
    $payroll['AbsentDays'] = $absentDays;

    error_log("EmployeeID $employeeId: Final Payroll=" . json_encode($payroll));
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
            exit;
        }

        if (isset($_GET['action']) && $_GET['action'] === 'fetch_payroll_history') {
            $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
            $role = isset($_GET['role']) ? $conn->real_escape_string($_GET['role']) : null;
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
            $offset = $page * $limit;

            error_log("fetch_payroll_history called with: user_id=$user_id, role=$role, page=$page, limit=$limit, offset=$offset");

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for payroll history fetch.");
            }

            if (!recordExists($conn, 'UserAccounts', $user_id)) {
                throw new Exception("Invalid user_id: User does not exist.");
            }

            $allowedBranches = [];
            if ($role === 'Payroll Staff') {
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
                $branchStmt->bind_param("i", $user_id);
                $branchStmt->execute();
                $branchResult = $branchStmt->get_result();
                while ($row = $branchResult->fetch_assoc()) {
                    $allowedBranches[] = $row['BranchID'];
                }
                $branchStmt->close();

                if (empty($allowedBranches)) {
                    echo json_encode([
                        'success' => true,
                        'data' => [],
                        'total' => 0,
                        'page' => $page,
                        'limit' => $limit
                    ]);
                    exit;
                }
            }

            // Query for paginated data
            $query = "
                SELECT 
                    ual.log_id, 
                    ual.activity_description, 
                    ual.created_at, 
                    ual.affected_record_id
                FROM user_activity_logs ual
                JOIN Employees e ON ual.affected_record_id = e.EmployeeID
                WHERE ual.activity_type = 'GENERATE_DATA' 
                AND ual.affected_table IN ('Single Payslip', 'Bulk Payslips')";
            
            $countQuery = "
                SELECT COUNT(DISTINCT ual.log_id) as total 
                FROM user_activity_logs ual
                JOIN Employees e ON ual.affected_record_id = e.EmployeeID
                WHERE ual.activity_type = 'GENERATE_DATA' 
                AND ual.affected_table IN ('Single Payslip', 'Bulk Payslips')";
            
            $params = [];
            $types = "";
            
            if ($role === 'Payroll Staff') {
                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $query .= " AND e.BranchID IN ($placeholders)";
                $countQuery .= " AND e.BranchID IN ($placeholders)";
                $params = array_merge($params, $allowedBranches);
                $types .= str_repeat('i', count($allowedBranches));
            } elseif ($role !== 'Payroll Admin') {
                $query .= " AND ual.user_id = ?";
                $countQuery .= " AND ual.user_id = ?";
                $params[] = $user_id;
                $types .= "i";
            }

            $query .= " ORDER BY ual.created_at DESC LIMIT ? OFFSET ?";
            $params[] = $limit;
            $params[] = $offset;
            $types .= "ii";

            error_log("Payroll history query: $query, Params: " . json_encode($params));

            // Fetch paginated data
            $stmt = $conn->prepare($query);
            if (!$stmt) {
                error_log("Prepare failed for payroll history: " . $conn->error);
                throw new Exception("Prepare failed for payroll history: " . $conn->error);
            }

            if (!empty($params)) {
                $stmt->bind_param($types, ...$params);
            }

            $stmt->execute();
            $result = $stmt->get_result();
            $data = [];

            while ($row = $result->fetch_assoc()) {
                $data[] = [
                    'log_id' => $row['log_id'],
                    'activity_description' => $row['activity_description'],
                    'created_at' => $row['created_at'],
                    'affected_id' => $row['affected_record_id']
                ];
            }
            $stmt->close();

            // Fetch total count
            $countStmt = $conn->prepare($countQuery);
            if (!$countStmt) {
                error_log("Prepare failed for count query: " . $conn->error);
                throw new Exception("Prepare failed for count query: " . $conn->error);
            }

            if (!empty($params)) {
                $countParams = array_slice($params, 0, count($params) - 2);
                $countTypes = substr($types, 0, strlen($types) - 2);
                if (!empty($countParams)) {
                    $countStmt->bind_param($countTypes, ...$countParams);
                }
            }

            $countStmt->execute();
            $countResult = $countStmt->get_result();
            $total = $countResult->fetch_assoc()['total'];
            $countStmt->close();

            error_log("Payroll history response: Total=$total, Data count=" . count($data));

            echo json_encode([
                'success' => true,
                'data' => $data,
                'total' => $total,
                'page' => $page,
                'limit' => $limit
            ]);
            exit;
        }
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

            // Validate date format
            if (!DateTime::createFromFormat('Y-m-d', $start_date) || !DateTime::createFromFormat('Y-m-d', $end_date)) {
                throw new Exception("Invalid date format for start_date or end_date. Use YYYY-MM-DD.");
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
                'HourlyMinimumWage' => formatNumberWithDecimals($row['HourlyMinimumWage'] ?? 0),
                'AllowancesData' => getAllowances($conn, $employeeId, $cache),
                'ContributionsData' => getContributions($conn, $employeeId, $cache, $payroll_cut),
                'CashAdvancesData' => getCashAdvances($conn, $employeeId, $cache, $start_date, $end_date),
                'OvertimeData' => $overtime,
                'HolidayData' => $holidays,
                'LeaveData' => $leaves,
                'AbsentDays' => getAbsentDays($conn, $employeeId, $start_date, $end_date, $leaves, $holidays),
                'AttendanceData' => $attendance
            ];

            $payroll = calculatePayroll($employeeData, $attendance, $overtime, $holidays, $payroll_cut, $start_date, $end_date);
            $employeeData = array_merge($employeeData, $payroll);

            // Safe access to AllowancesData and ContributionsData
            $transportAllowance = !empty($employeeData['AllowancesData']) && isset($employeeData['AllowancesData'][0]['Amount']) ? $employeeData['AllowancesData'][0]['Amount'] : '0';
            $contributions = [
                'PagIbig' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][0]['Amount']) ? $employeeData['ContributionsData'][0]['Amount'] : '0',
                'SSS' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][1]['Amount']) ? $employeeData['ContributionsData'][1]['Amount'] : '0',
                'PhilHealth' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][2]['Amount']) ? $employeeData['ContributionsData'][2]['Amount'] : '0',
                'PagIbigCalamity' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][0]['Amount']) ? $employeeData['ContributionsData'][0]['Amount'] : '0',
                'SSSSalary' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][1]['Amount']) ? $employeeData['ContributionsData'][1]['Amount'] : '0',
                'PagIbigSalary' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][2]['Amount']) ? $employeeData['ContributionsData'][2]['Amount'] : '0',
                'SSSCalamity' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][3]['Amount']) ? $employeeData['ContributionsData'][3]['Amount'] : '0'
            ];

            $description = "Generated payslip for EmployeeID: $employeeId ($employeeName)\n" .
                "Employee Name: $employeeName\n" .
                "Payroll Period: $start_date to $end_date\n" .
                "Cut Off: " . ($payroll_cut === 'first' ? '1st Cut' : '2nd Cut') . "\n" .
                "Hourly Minimum Wage: ₱{$employeeData['HourlyMinimumWage']}\n" .
                "Daily Rate: ₱{$payroll['DailyRate']}\n" .
                "Basic Rate: ₱{$payroll['BasicRate']}\n" .
                "Hourly Rate: ₱{$payroll['HourlyRate']}\n" .
                "Transportation Allowance: ₱$transportAllowance\n" .
                "Basic Pay: ₱{$payroll['BasicPay']}\n" .
                "Overtime Hours (125%): {$payroll['OvertimeHours']['Regular']} hrs ₱{$payroll['OvertimePay']['Regular']}\n" .
                "Overtime Hours (137.5%): {$payroll['OvertimeHours']['Night']} hrs ₱{$payroll['OvertimePay']['Night']}\n" .
                "Overtime Pay: ₱{$payroll['OvertimePay']['Total']}\n" .
                "Sunday Hours (130%): {$payroll['SundayHours']} hrs ₱{$payroll['PremiumPayData'][0]['Amount']}\n" .
                "Sunday Overtime (130%): {$payroll['PremiumPayData'][1]['Amount']} hrs\n" .
                "Sunday Pay: ₱{$payroll['SundayPay']['Total']}\n" .
                "Holiday Hours (Special 130%): {$payroll['HolidayHours']['Special']} hrs ₱{$payroll['PremiumPayData'][3]['Amount']}\n" .
                "Holiday Overtime (Special 130%): {$payroll['PremiumPayData'][4]['Amount']} hrs\n" .
                "Holiday Hours (Legal 200%): {$payroll['HolidayHours']['Regular']} hrs ₱{$payroll['PremiumPayData'][5]['Amount']}\n" .
                "Holiday Overtime (Legal 200%): {$payroll['PremiumPayData'][6]['Amount']} hrs\n" .
                "Non-Worked Legal Holiday (100%): ₱{$payroll['PremiumPayData'][7]['Amount']}\n" .
                "Holiday Pay: ₱{$payroll['HolidayPay']['Total']}\n" .
                "Late/Undertime Mins: " . ($payroll['LateMinutes'] + $payroll['UndertimeMinutes']) . " mins ₱{$payroll['LateDeduction']}\n" .
                "Absent (Days): {$employeeData['AbsentDays']} days ₱{$payroll['AbsentDeduction']}\n" .
                ($payroll_cut === 'first' ? 
                    "Pag-Ibig: ₱{$contributions['PagIbig']}\n" .
                    "SSS: ₱{$contributions['SSS']}\n" .
                    "PhilHealth: ₱{$contributions['PhilHealth']}\n" :
                    "Pag-Ibig Calamity: ₱{$contributions['PagIbigCalamity']}\n" .
                    "SSS Salary: ₱{$contributions['SSSSalary']}\n" .
                    "Pag-Ibig Salary: ₱{$contributions['PagIbigSalary']}\n" .
                    "SSS Calamity: ₱{$contributions['SSSCalamity']}\n") .
                "Gross Pay: ₱{$payroll['TotalEarnings']}\n" .
                "Total Deductions: ₱{$payroll['TotalDeductions']}\n" .
                "Net Pay: ₱{$payroll['NetPay']}";
            logUserActivity($conn, $user_id, 'GENERATE_DATA', 'Single Payslip', $employeeId, $description);

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

            // Validate date format
            if (!DateTime::createFromFormat('Y-m-d', $start_date) || !DateTime::createFromFormat('Y-m-d', $end_date)) {
                throw new Exception("Invalid date format for start_date or end_date. Use YYYY-MM-DD.");
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
                    'HourlyMinimumWage' => formatNumberWithDecimals($row['HourlyMinimumWage'] ?? 0),
                    'AllowancesData' => getAllowances($conn, $employeeId, $cache),
                    'ContributionsData' => getContributions($conn, $employeeId, $cache, $payroll_cut),
                    'CashAdvancesData' => getCashAdvances($conn, $employeeId, $cache, $start_date, $end_date),
                    'OvertimeData' => $overtime,
                    'HolidayData' => $holidays,
                    'LeaveData' => $leaves,
                    'AbsentDays' => getAbsentDays($conn, $employeeId, $start_date, $end_date, $leaves, $holidays),
                    'AttendanceData' => $attendance
                ];

                $payroll = calculatePayroll($employeeData, $attendance, $overtime, $holidays, $payroll_cut, $start_date, $end_date);
                $employeeData = array_merge($employeeData, $payroll);

                // Safe access to AllowancesData and ContributionsData
                $transportAllowance = !empty($employeeData['AllowancesData']) && isset($employeeData['AllowancesData'][0]['Amount']) ? $employeeData['AllowancesData'][0]['Amount'] : '0';
                $contributions = [
                    'PagIbig' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][0]['Amount']) ? $employeeData['ContributionsData'][0]['Amount'] : '0',
                    'SSS' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][1]['Amount']) ? $employeeData['ContributionsData'][1]['Amount'] : '0',
                    'PhilHealth' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][2]['Amount']) ? $employeeData['ContributionsData'][2]['Amount'] : '0',
                    'PagIbigCalamity' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][0]['Amount']) ? $employeeData['ContributionsData'][0]['Amount'] : '0',
                    'SSSSalary' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][1]['Amount']) ? $employeeData['ContributionsData'][1]['Amount'] : '0',
                    'PagIbigSalary' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][2]['Amount']) ? $employeeData['ContributionsData'][2]['Amount'] : '0',
                    'SSSCalamity' => !empty($employeeData['ContributionsData']) && isset($employeeData['ContributionsData'][3]['Amount']) ? $employeeData['ContributionsData'][3]['Amount'] : '0'
                ];

                $description = "Generated bulk payslip for EmployeeID: $employeeId ($employeeName)\n" .
                    "Employee Name: $employeeName\n" .
                    "Payroll Period: $start_date to $end_date\n" .
                    "Cut Off: " . ($payroll_cut === 'first' ? '1st Cut' : '2nd Cut') . "\n" .
                    "Hourly Minimum Wage: ₱{$employeeData['HourlyMinimumWage']}\n" .
                    "Daily Rate: ₱{$payroll['DailyRate']}\n" .
                    "Basic Rate: ₱{$payroll['BasicRate']}\n" .
                    "Hourly Rate: ₱{$payroll['HourlyRate']}\n" .
                    "Transportation Allowance: ₱$transportAllowance\n" .
                    "Basic Pay: ₱{$payroll['BasicPay']}\n" .
                    "Overtime Hours (125%): {$payroll['OvertimeHours']['Regular']} hrs ₱{$payroll['OvertimePay']['Regular']}\n" .
                    "Overtime Hours (137.5%): {$payroll['OvertimeHours']['Night']} hrs ₱{$payroll['OvertimePay']['Night']}\n" .
                    "Overtime Pay: ₱{$payroll['OvertimePay']['Total']}\n" .
                    "Sunday Hours (130%): {$payroll['SundayHours']} hrs ₱{$payroll['PremiumPayData'][0]['Amount']}\n" .
                    "Sunday Overtime (130%): {$payroll['PremiumPayData'][1]['Amount']} hrs\n" .
                    "Sunday Pay: ₱{$payroll['SundayPay']['Total']}\n" .
                    "Holiday Hours (Special 130%): {$payroll['HolidayHours']['Special']} hrs ₱{$payroll['PremiumPayData'][3]['Amount']}\n" .
                    "Holiday Overtime (Special 130%): {$payroll['PremiumPayData'][4]['Amount']} hrs\n" .
                    "Holiday Hours (Legal 200%): {$payroll['HolidayHours']['Regular']} hrs ₱{$payroll['PremiumPayData'][5]['Amount']}\n" .
                    "Holiday Overtime (Legal 200%): {$payroll['PremiumPayData'][6]['Amount']} hrs\n" .
                    "Non-Worked Legal Holiday (100%): ₱{$payroll['PremiumPayData'][7]['Amount']}\n" .
                    "Holiday Pay: ₱{$payroll['HolidayPay']['Total']}\n" .
                    "Late/Undertime Mins: " . ($payroll['LateMinutes'] + $payroll['UndertimeMinutes']) . " mins ₱{$payroll['LateDeduction']}\n" .
                    "Absent (Days): {$employeeData['AbsentDays']} days ₱{$payroll['AbsentDeduction']}\n" .
                    ($payroll_cut === 'first' ? 
                        "Pag-Ibig: ₱{$contributions['PagIbig']}\n" .
                        "SSS: ₱{$contributions['SSS']}\n" .
                        "PhilHealth: ₱{$contributions['PhilHealth']}\n" :
                        "Pag-Ibig Calamity: ₱{$contributions['PagIbigCalamity']}\n" .
                        "SSS Salary: ₱{$contributions['SSSSalary']}\n" .
                        "Pag-Ibig Salary: ₱{$contributions['PagIbigSalary']}\n" .
                        "SSS Calamity: ₱{$contributions['SSSCalamity']}\n") .
                    "Gross Pay: ₱{$payroll['TotalEarnings']}\n" .
                    "Total Deductions: ₱{$payroll['TotalDeductions']}\n" .
                    "Net Pay: ₱{$payroll['NetPay']}";
                logUserActivity($conn, $user_id, 'GENERATE_DATA', 'Bulk Payslips', $employeeId, $description);
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
            logUserActivity($conn, $user_id, 'GENERATE_DATA', 'Payroll_Report', null, $description);

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