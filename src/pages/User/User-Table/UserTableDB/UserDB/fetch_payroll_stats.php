<?php
// Prevent unwanted output
ob_start();

ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/php_errors.log');
error_log('fetch_payroll_stats.php executed');

header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
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

    // Cache for performance
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

    // Utility functions from fetch_payroll.php (copied to avoid dependency)
    function formatNumber($number) {
        return is_numeric($number) ? number_format((float)$number, 2, '.', '') : '0.00';
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

    // Include all necessary functions from fetch_payroll.php
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
                    'Balance' => '0.00'
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
            if (strtotime($holidayDate) >= strtotime($start_date) && strtotime($holidayDate) <= strtotime($end_date)) {
                if ($row['BranchID'] == 0 || $row['BranchID'] == $employeeBranchId) {
                    $holidays[] = [
                        'HolidayID' => $row['HolidayID'],
                        'Description' => $row['Description'],
                        'Date' => $holidayDate,
                        'HolidayType' => $row['HolidayType'],
                        'BranchID' => $row['BranchID']
                    ];
                }
            }
        }
        $stmt->close();
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
            error_log("Error: Could not fetch HourlyMinimumWage for EmployeeID $employeeId.");
            throw new Exception("Failed to retrieve HourlyMinimumWage for EmployeeID $employeeId.");
        }

        $hourlyMinimumWage = (float)$row['HourlyMinimumWage'];
        $dailyMinimumWage = $hourlyMinimumWage * 8;

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

        $periodBase = $dailyMinimumWage * $EXPECTED_DAYS;
        $basicPay = $periodBase + $allowancesSum;
        $dailyRate = $basicPay / $EXPECTED_DAYS;
        $premiumDailyRate = $basicPay / 8;
        $hourlyRate = $premiumDailyRate / 8;

        $payroll['DailyRate'] = formatNumber($dailyMinimumWage);
        $payroll['BasicPay'] = formatNumber($basicPay);

        $absentDays = isset($employeeData['AbsentDays']) ? (int)$employeeData['AbsentDays'] : 0;
        $payroll['AbsentDeduction'] = formatNumber($premiumDailyRate * $absentDays);

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

            $attendanceOnDate = array_filter($attendance, function($a) use ($ot) {
                return $a['Date'] === $ot['Date'];
            });
            $att = reset($attendanceOnDate);
            if (!$att || empty($att['TimeOut'])) {
                error_log("Overtime skipped for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: No valid attendance record");
                continue;
            }

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
                error_log("Overtime skipped for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: No valid schedule");
                continue;
            }

            $shiftEndTime = new DateTime($ot['Date'] . ' ' . $schedule['ShiftEnd']);
            $timeOut = new DateTime($ot['Date'] . ' ' . $att['TimeOut']);
            if ($timeOut < $shiftEndTime) {
                $timeOut->modify('+1 day');
            }

            if ($timeOut <= $shiftEndTime) {
                error_log("Overtime skipped for EmployeeID {$employeeData['EmployeeID']} on {$ot['Date']}: TimeOut does not exceed ShiftEnd");
                continue;
            }

            $interval = $shiftEndTime->diff($timeOut);
            $actualOtHours = $interval->h + ($interval->i / 60);
            $actualOtHours = min($actualOtHours, $approvedHours);

            $dayHours = 0;
            $nightHours = 0;
            $nightStart = new DateTime($ot['Date'] . ' 22:00:00');
            $nightEnd = (clone $nightStart)->modify('+8 hours');
            $otStart = clone $shiftEndTime;

            if ($timeOut <= $nightStart) {
                $dayHours = $actualOtHours;
            } else {
                if ($otStart < $nightStart) {
                    $dayInterval = $otStart->diff(min($timeOut, $nightStart));
                    $dayHours = min($actualOtHours, $dayInterval->h + ($dayInterval->i / 60));
                }
                if ($timeOut > $nightStart) {
                    $nightInterval = $nightStart->diff($timeOut);
                    $nightHoursPossible = $nightInterval->h + ($nightInterval->i / 60);
                    $nightHours = min($actualOtHours - $dayHours, $nightHoursPossible);
                }
            }

            if ($holiday) {
                if ($holiday['HolidayType'] === 'Special Non-Working Holiday') {
                    $specialOtDayHours += $dayHours;
                    $specialOtNightHours += $nightHours;
                    $specialOtDayAmount += $hourlyRate * 1.69 * $dayHours;
                    $specialOtNightAmount += $hourlyRate * 1.859 * $nightHours;
                } elseif ($holiday['HolidayType'] === 'Legal Holiday') {
                    $regularOtDayHours += $dayHours;
                    $regularOtNightHours += $nightHours;
                    $regularOtDayAmount += $hourlyRate * 2.60 * $dayHours;
                    $regularOtNightAmount += $hourlyRate * 2.86 * $nightHours;
                }
            } elseif ($isSunday) {
                $sundayOtDayHours += $dayHours;
                $sundayOtNightHours += $nightHours;
                $sundayOtDayAmount += $hourlyRate * 1.69 * $dayHours;
                $sundayOtNightAmount += $hourlyRate * 1.859 * $nightHours;
            } else {
                $otHoursRegular += $dayHours;
                $otHoursNight += $nightHours;
                $otAmountRegular += $hourlyRate * 1.25 * $dayHours;
                $otAmountNight += $hourlyRate * 1.375 * $nightHours;
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

        $holidayPay = 0;
        foreach ($holidays as $holiday) {
            $holidayDate = $holiday['Date'];
            if ($holiday['BranchID'] !== null && $holiday['BranchID'] != 0 && $holiday['BranchID'] != $employeeBranchId) {
                continue;
            }

            $hasLeave = false;
            foreach ($employeeData['LeaveData'] as $leave) {
                $leaveStart = new DateTime($leave['StartDate']);
                $leaveEnd = new DateTime($leave['EndDate']);
                $holidayDateObj = new DateTime($holidayDate);
                if ($holidayDateObj >= $leaveStart && $holidayDateObj <= $leaveEnd) {
                    $hasLeave = true;
                    break;
                }
            }

            $attendanceOnDate = array_filter($attendance, function($a) use ($holidayDate) {
                return $a['Date'] === $holidayDate;
            });
            $att = reset($attendanceOnDate);
            $hoursWorked = $att ? (float)$att['HoursWorked'] : 0;

            $regularHours = $hoursWorked > 0 ? min($hoursWorked, 8) : 0;
            $nonWorkedHours = 0;
            if ($holiday['HolidayType'] === 'Legal Holiday' && $regularHours < 8 && $regularHours > 0 && !$hasLeave) {
                $nonWorkedHours = 8 - $regularHours;
            }

            if ($holiday['HolidayType'] === 'Special Non-Working Holiday') {
                if ($regularHours > 0 && !$hasLeave) {
                    $specialHolidayHours += $regularHours;
                    $specialHolidayAmount += $hourlyRate * 1.30 * $regularHours;
                    $holidayPay += $hourlyRate * 1.30 * $regularHours;
                }
            } elseif ($holiday['HolidayType'] === 'Legal Holiday') {
                if ($regularHours > 0 && !$hasLeave) {
                    $regularHolidayHours += $regularHours;
                    $regularHolidayAmount += $hourlyRate * 2.00 * $regularHours;
                    $holidayPay += $hourlyRate * 2.00 * $regularHours;
                    if ($nonWorkedHours > 0) {
                        $nonWorkedLegalHolidayAmount += $hourlyRate * 1.00 * $nonWorkedHours;
                        $holidayPay += $hourlyRate * 1.00 * $nonWorkedHours;
                    }
                } else if (!$hasLeave) {
                    $noWorkedLegalHolidayAmount += $premiumDailyRate * 1.00;
                    $holidayPay += $premiumDailyRate * 1.00;
                }
            }
        }

        $holidayPay += $specialOtDayAmount + $specialOtNightAmount + $regularOtDayAmount + $regularOtNightAmount;
        $payroll['HolidayPay'] = [
            'Special' => formatNumber($specialHolidayAmount + $specialOtDayAmount + $specialOtNightAmount),
            'Regular' => formatNumber($regularHolidayAmount + $nonWorkedLegalHolidayAmount + $noWorkedLegalHolidayAmount + $regularOtDayAmount + $regularOtNightAmount),
            'Total' => formatNumber($holidayPay)
        ];
        $payroll['HolidayHours']['Special'] = formatNumber($specialHolidayHours);
        $payroll['HolidayHours']['Regular'] = formatNumber($regularHolidayHours);

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
                    $regularSundayHours = min($hoursWorked, 8);
                    $sundayHours += $regularSundayHours;
                    $sundayAmount += $hourlyRate * 1.30 * $regularSundayHours;
                    $sundayPay += $hourlyRate * 1.30 * $regularSundayHours;
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

    // Main logic
    $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $role = isset($_GET['role']) ? $_GET['role'] : null;
    $branch_id = isset($_GET['branch_id']) && $_GET['branch_id'] !== 'all' ? (int)$_GET['branch_id'] : null;
    $start_date = isset($_GET['start_date']) ? $_GET['start_date'] : null;
    $end_date = isset($_GET['end_date']) ? $_GET['end_date'] : null;
    $payroll_cut = isset($_GET['payroll_cut']) ? $_GET['payroll_cut'] : 'first';

    if (!$user_id || !$role) {
        throw new Exception("user_id and role are required");
    }

    if ($start_date && $end_date) {
        if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $start_date) || !preg_match("/^\d{4}-\d{2}-\d{2}$/", $end_date)) {
            throw new Exception("Invalid date format. Use YYYY-MM-DD.");
        }
        if (strtotime($end_date) < strtotime($start_date)) {
            throw new Exception("End date cannot be before start date.");
        }
    } else {
        // Default to current month
        $start_date = date('Y-m-01');
        $end_date = date('Y-m-t');
    }

    if (!in_array($payroll_cut, ['first', 'second'])) {
        throw new Exception("Invalid payroll_cut value. Must be 'first' or 'second'.");
    }

    $stats = [
        "totalNetPay" => "0.00",
        "employeeCount" => 0,
        "averageNetPay" => "0.00",
        "payrollPeriod" => "$start_date to $end_date",
        "payrollCut" => $payroll_cut === 'first' ? '1st Cut' : '2nd Cut'
    ];

    $sql = "
        SELECT 
            e.EmployeeID,
            e.EmployeeName,
            e.BranchID,
            b.BranchName,
            p.HourlyMinimumWage
        FROM Employees e
        JOIN Branches b ON e.BranchID = b.BranchID
        LEFT JOIN Positions p ON e.PositionID = p.PositionID
        WHERE 1=1";
    $params = [];
    $types = "";

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
            echo json_encode($stats);
            $conn->close();
            exit;
        }

        if ($branch_id && !in_array($branch_id, $allowedBranches)) {
            throw new Exception("Selected branch is not assigned to this user.");
        }

        $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
        $sql .= " AND e.BranchID IN ($placeholders)";
        $params = $allowedBranches;
        $types = str_repeat('i', count($allowedBranches));
    }

    if ($branch_id) {
        $sql .= " AND e.BranchID = ?";
        $params[] = $branch_id;
        $types .= "i";
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
    if (!empty($params)) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $totalNetPay = 0.00;
    $employeeCount = 0;

    while ($row = $result->fetch_assoc()) {
        $employeeId = $row['EmployeeID'];
        $employeeData = [
            'EmployeeID' => $employeeId,
            'EmployeeName' => $row['EmployeeName'],
            'BranchID' => $row['BranchID'],
            'BranchName' => $row['BranchName'],
            'HourlyMinimumWage' => formatNumber($row['HourlyMinimumWage'] ?? 0),
            'AllowancesData' => getAllowances($conn, $employeeId, $cache),
            'ContributionsData' => getContributions($conn, $employeeId, $cache, $payroll_cut),
            'CashAdvancesData' => getCashAdvances($conn, $employeeId, $cache, $start_date, $end_date),
            'OvertimeData' => getOvertime($conn, $employeeId, $start_date, $end_date, $cache),
            'HolidayData' => getHolidays($conn, $employeeId, $start_date, $end_date, $cache),
            'LeaveData' => getLeaves($conn, $employeeId, $start_date, $end_date, $cache),
            'AbsentDays' => getAbsentDays($conn, $employeeId, $start_date, $end_date, 
                getLeaves($conn, $employeeId, $start_date, $end_date, $cache),
                getHolidays($conn, $employeeId, $start_date, $end_date, $cache)),
            'AttendanceData' => getAttendance($conn, $employeeId, $start_date, $end_date, $cache)
        ];

        $payroll = calculatePayroll(
            $employeeData,
            $employeeData['AttendanceData'],
            $employeeData['OvertimeData'],
            $employeeData['HolidayData'],
            $payroll_cut
        );

        $netPay = (float)$payroll['NetPay'];
        $totalNetPay += $netPay;
        $employeeCount++;
    }
    $stmt->close();

    $stats['totalNetPay'] = formatNumber($totalNetPay);
    $stats['employeeCount'] = $employeeCount;
    $stats['averageNetPay'] = $employeeCount > 0 ? formatNumber($totalNetPay / $employeeCount) : "0.00";

    echo json_encode($stats);
    $conn->close();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server error: " . $e->getMessage()]);
    error_log("fetch_payroll_stats.php error: " . $e->getMessage());
}

ob_end_flush();
?>