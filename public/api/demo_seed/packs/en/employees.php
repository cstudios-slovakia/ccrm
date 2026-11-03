<?php
/**
 * Pack `employees` (en) - what the company pack does not hold: job descriptions, leave
 * allowances, the install month's payroll lines and the leave calendar of the six staff.
 * Personal data (names, e-mails, addresses, salaries) lives in packs/en/company.php.
 *
 * Shape rules: demo_seed/index.php (section 2). Vacation `start` is a day offset from
 * today, `days` counts WORKING days; the module moves a start that falls on a weekend or
 * holiday to the next working day. Nobody with a login (E1-E3) is on leave inside the
 * last three weeks, because the time module logs hours for them there.
 */
return [
    'staff' => [
        'E1' => ['notes' => 'Founder and managing director. Signs off offers, big slab purchases and payroll.', 'allowances' => ['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E2' => ['notes' => 'Runs production and projects: workshop plan, installation crew, supplier deliveries and site checks.', 'allowances' => ['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E3' => ['notes' => 'Showroom sales: consultations, measuring visits and offers for private clients and partner studios.', 'allowances' => ['annual' => 20, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E4' => ['notes' => 'Leads the two-person installation crew; plans and signs off every fitting on site.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E5' => ['notes' => 'Runs the CNC and waterjet, the edge polisher and the cutting plan of every slab.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E6' => ['notes' => 'Office, invoicing, accounting and purchasing paperwork; the first voice on the phone.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
    ],

    // The install month's payroll: one row per employee, a base line plus these extras.
    // 'category' is the id of the salary type in EMPLOYEE_SETTINGS (bonus | overtime | reimbursement).
    'payroll' => [
        'dueDay' => 15,
        'baseName' => 'Base salary',
        'paidNote' => 'Paid by bank transfer',
        'pendingNote' => 'Payroll planned for the payout date',
        'extras' => [
            ['employee' => 'E3', 'category' => 'bonus', 'name' => 'Sales commission', 'amountEur' => 380],
            ['employee' => 'E2', 'category' => 'reimbursement', 'name' => 'Travel & per diem', 'amountEur' => 85],
            ['employee' => 'E4', 'category' => 'overtime', 'name' => 'Overtime', 'amountEur' => 150],
            ['employee' => 'E5', 'category' => 'overtime', 'name' => 'Overtime', 'amountEur' => 120],
        ],
    ],

    // status: approved | pending (a request that waits for approval, always in the future).
    'approvedBy' => '{user:owner}',
    'vacations' => [
        ['employee' => 'E1', 'type' => 'annual', 'start' => -64, 'days' => 5, 'status' => 'approved', 'note' => 'Family holiday by the lake'],
        ['employee' => 'E1', 'type' => 'doctor', 'start' => -38, 'days' => 1, 'status' => 'approved', 'note' => 'Annual check-up'],
        ['employee' => 'E1', 'type' => 'annual', 'start' => 25, 'days' => 4, 'status' => 'approved', 'note' => 'Long weekend in the mountains'],
        ['employee' => 'E1', 'type' => 'annual', 'start' => 61, 'days' => 5, 'status' => 'pending', 'note' => 'Winter holiday'],

        ['employee' => 'E2', 'type' => 'annual', 'start' => -71, 'days' => 5, 'status' => 'approved', 'note' => 'Summer holiday'],
        ['employee' => 'E2', 'type' => 'sick', 'start' => -45, 'days' => 2, 'status' => 'approved', 'note' => 'Flu'],
        ['employee' => 'E2', 'type' => 'doctor', 'start' => -36, 'days' => 1, 'status' => 'approved', 'note' => 'Dentist'],
        ['employee' => 'E2', 'type' => 'annual', 'start' => 14, 'days' => 3, 'status' => 'approved', 'note' => 'Long weekend'],
        ['employee' => 'E2', 'type' => 'annual', 'start' => 40, 'days' => 5, 'status' => 'pending', 'note' => 'Planned holiday'],

        ['employee' => 'E3', 'type' => 'annual', 'start' => -55, 'days' => 4, 'status' => 'approved', 'note' => 'Trip with the family'],
        ['employee' => 'E3', 'type' => 'doctor', 'start' => -37, 'days' => 1, 'status' => 'approved', 'note' => 'Eye exam'],
        ['employee' => 'E3', 'type' => 'annual', 'start' => 20, 'days' => 5, 'status' => 'approved', 'note' => 'Holiday after the showroom open day'],
        ['employee' => 'E3', 'type' => 'annual', 'start' => 52, 'days' => 3, 'status' => 'pending', 'note' => 'Long weekend'],

        ['employee' => 'E4', 'type' => 'annual', 'start' => -48, 'days' => 3, 'status' => 'approved', 'note' => 'Autumn break'],
        ['employee' => 'E4', 'type' => 'sick', 'start' => -30, 'days' => 3, 'status' => 'approved', 'note' => 'Back pain'],
        ['employee' => 'E4', 'type' => 'annual', 'start' => -1, 'days' => 3, 'status' => 'approved', 'note' => 'Short break, away from the workshop this week'],
        ['employee' => 'E4', 'type' => 'doctor', 'start' => 9, 'days' => 1, 'status' => 'approved', 'note' => 'Doctor visit'],
        ['employee' => 'E4', 'type' => 'annual', 'start' => 33, 'days' => 5, 'status' => 'pending', 'note' => 'Planned holiday'],

        ['employee' => 'E5', 'type' => 'sick', 'start' => -52, 'days' => 2, 'status' => 'approved', 'note' => 'Cold'],
        ['employee' => 'E5', 'type' => 'doctor', 'start' => -12, 'days' => 1, 'status' => 'approved', 'note' => 'Check-up'],
        ['employee' => 'E5', 'type' => 'annual', 'start' => 5, 'days' => 4, 'status' => 'approved', 'note' => 'Long weekend'],
        ['employee' => 'E5', 'type' => 'annual', 'start' => 44, 'days' => 5, 'status' => 'pending', 'note' => 'Planned holiday'],

        ['employee' => 'E6', 'type' => 'annual', 'start' => -66, 'days' => 5, 'status' => 'approved', 'note' => 'Summer holiday'],
        ['employee' => 'E6', 'type' => 'doctor', 'start' => -22, 'days' => 1, 'status' => 'approved', 'note' => 'Check-up'],
        ['employee' => 'E6', 'type' => 'annual', 'start' => 12, 'days' => 5, 'status' => 'approved', 'note' => 'Holiday with the kids'],
        ['employee' => 'E6', 'type' => 'unpaid', 'start' => 30, 'days' => 1, 'status' => 'pending', 'note' => 'Personal errand'],
    ],
];
