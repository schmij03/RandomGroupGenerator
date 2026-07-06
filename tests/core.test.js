const test = require('node:test');
const assert = require('node:assert/strict');
const TG = require('../core.js');

// --- sanitizeGender ---
test('sanitizeGender lässt nur gültige Werte durch', () => {
    assert.equal(TG.sanitizeGender('female'), 'female');
    assert.equal(TG.sanitizeGender('male'), 'male');
    assert.equal(TG.sanitizeGender('diverse'), 'diverse');
    assert.equal(TG.sanitizeGender('<img onerror=x>'), 'diverse');
    assert.equal(TG.sanitizeGender(undefined), 'diverse');
});

// --- getSemester (Schweizer Schuljahr) ---
test('getSemester: Aug–Jan = 1, Feb–Jul = 2', () => {
    assert.equal(TG.getSemester('2025-08-15'), 1);
    assert.equal(TG.getSemester('2025-12-01'), 1);
    assert.equal(TG.getSemester('2026-01-31'), 1);
    assert.equal(TG.getSemester('2026-02-01'), 2);
    assert.equal(TG.getSemester('2026-07-10'), 2);
});

test('getWeekdayIndex: Montag = 0, Sonntag = 6', () => {
    assert.equal(TG.getWeekdayIndex('2026-06-29'), 0); // Montag
    assert.equal(TG.getWeekdayIndex('2026-07-05'), 6); // Sonntag
});

// --- bulkParse ---
function collect(text) {
    const out = [];
    const res = TG.bulkParse(text, (name, gender, sporty) => { out.push({ name, gender, sporty }); return true; });
    return { out, res };
}

test('bulkParse: Kleinbuchstaben-Tags werden erkannt', () => {
    const { out } = collect('Max m\nAnna w\nKim d\nLea ms');
    assert.deepEqual(out, [
        { name: 'Max', gender: 'male', sporty: false },
        { name: 'Anna', gender: 'female', sporty: false },
        { name: 'Kim', gender: 'diverse', sporty: false },
        { name: 'Lea', gender: 'male', sporty: true }
    ]);
});

test('bulkParse: "s" allein = sportlich, Standard weiblich', () => {
    const { out } = collect('Mia s');
    assert.deepEqual(out, [{ name: 'Mia', gender: 'female', sporty: true }]);
});

test('bulkParse: Grossbuchstaben-Initialen bleiben Namensbestandteil', () => {
    const { out, res } = collect('Anna M\nMia S');
    assert.deepEqual(out, [
        { name: 'Anna M', gender: 'female', sporty: false },
        { name: 'Mia S', gender: 'female', sporty: false }
    ]);
    assert.equal(res.defaults, 2);
});

test('bulkParse: Klammer-Tags sind case-insensitiv', () => {
    const { out } = collect('Anna (M)\nLea (ws)\nKim (D)');
    assert.deepEqual(out, [
        { name: 'Anna', gender: 'male', sporty: false },
        { name: 'Lea', gender: 'female', sporty: true },
        { name: 'Kim', gender: 'diverse', sporty: false }
    ]);
});

test('bulkParse: getrennte Gender- und Sport-Tags ("Max m (s)")', () => {
    const { out } = collect('Max m (s)\nAnna w (s)\nTim m s\nEva (m) (s)\nBen s m');
    assert.deepEqual(out, [
        { name: 'Max', gender: 'male', sporty: true },
        { name: 'Anna', gender: 'female', sporty: true },
        { name: 'Tim', gender: 'male', sporty: true },
        { name: 'Eva', gender: 'male', sporty: true },
        { name: 'Ben', gender: 'male', sporty: true }
    ]);
});

test('bulkParse: doppelter Gender-Tag — zweites Token bleibt Namensbestandteil', () => {
    const { out } = collect('Anna w w');
    assert.deepEqual(out, [{ name: 'Anna w', gender: 'female', sporty: false }]);
});

test('bulkParse: Initial vor Tag bleibt erhalten ("Anna M w")', () => {
    const { out } = collect('Anna M w\nMia S s');
    assert.deepEqual(out, [
        { name: 'Anna M', gender: 'female', sporty: false },
        { name: 'Mia S', gender: 'female', sporty: true }
    ]);
});

test('bulkParse: zählt Duplikate als übersprungen', () => {
    const seen = new Set();
    const res = TG.bulkParse('Anna w, Anna w, Max m', name => {
        if (seen.has(name)) return false;
        seen.add(name); return true;
    });
    assert.equal(res.added, 2);
    assert.equal(res.skipped, 1);
});

test('bulkParse: Klassenkürzel in eckigen Klammern', () => {
    const out = [];
    TG.bulkParse('Max m s [7a]\nAnna w [7b]\nKim d\nLea [8c]', (name, gender, sporty, classTag) => { out.push({ name, gender, sporty, classTag }); return true; });
    assert.deepEqual(out, [
        { name: 'Max', gender: 'male', sporty: true, classTag: '7a' },
        { name: 'Anna', gender: 'female', sporty: false, classTag: '7b' },
        { name: 'Kim', gender: 'diverse', sporty: false, classTag: '' },
        { name: 'Lea', gender: 'female', sporty: false, classTag: '8c' }
    ]);
});

// --- pointsToGrade ---
test('pointsToGrade: Schweizer Formel, Rundung und Grenzen', () => {
    assert.equal(TG.pointsToGrade(20, 20), 6);
    assert.equal(TG.pointsToGrade(0, 20), 1);
    assert.equal(TG.pointsToGrade(10, 20), 3.5);
    assert.equal(TG.pointsToGrade(14.5, 20), 4.6); // 4.625 → 4.6
    assert.equal(TG.pointsToGrade(25, 20), 6);     // über Max → gedeckelt
    assert.equal(TG.pointsToGrade(5, 0), null);
    assert.equal(TG.pointsToGrade('x', 20), null);
});

// --- parseCsvImport mit Kürzel-Spalte ---
test('parseCsvImport: fünfte Spalte wird als Klassenkürzel gelesen', () => {
    const rows = TG.parseCsvImport('Klasse;Name;Geschlecht;Sportlich;Kürzel\nGruppe A;Anna;w;s;7a\nGruppe A;Max;m;;');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].classTag, '7a');
    assert.equal(rows[1].classTag, '');
});

// --- validateBackup: Prüfungen ---
test('validateBackup: Prüfungen werden validiert und normalisiert', () => {
    const result = TG.validateBackup({
        classes: [{ id: 1, name: '7a', students: [{ id: 1, name: 'Anna', gender: 'female' }] }],
        exams: {
            '1': [
                { id: 1, title: 'LZK 1', date: '2026-03-01', mode: 'points', maxPoints: 20, results: { '1': 15, '2': -3 } },
                { id: 2, title: 'LZK 2', date: '2026-03-08', mode: 'grades', results: { '1': 4.5, '2': 9 } },
                { id: 3, title: '', date: '2026-03-15', mode: 'grades', results: {} },
                { id: 4, title: 'Ohne Max', date: '2026-03-22', mode: 'points', results: {} }
            ],
            '99': [{ id: 5, title: 'Verwaist', date: '2026-01-01', mode: 'grades', results: {} }]
        },
        examIdCounter: 2
    });
    assert.ok(result);
    assert.equal(result.exams['1'].length, 2);
    assert.deepEqual(result.exams['1'][0].results, { '1': 15 });      // negative Punkte verworfen
    assert.deepEqual(result.exams['1'][1].results, { '1': 4.5 });     // Note 9 verworfen
    assert.equal(result.exams['99'], undefined);                       // verwaiste Klasse verworfen
    assert.equal(result.examIdCounter, 3);                             // Zähler wächst über höchste gültige ID
});

test('validateBackup: classTag der Schüler bleibt erhalten und wird begrenzt', () => {
    const result = TG.validateBackup({
        classes: [{ id: 1, name: 'G', students: [
            { id: 1, name: 'Anna', gender: 'female', classTag: '7a' },
            { id: 2, name: 'Max', gender: 'male', classTag: 'x'.repeat(50) }
        ] }]
    });
    assert.equal(result.classes[0].students[0].classTag, '7a');
    assert.equal(result.classes[0].students[1].classTag.length, 20);
});

// --- parseAttendanceCsv ---
test('parseAttendanceCsv: beide Datumsformate, Kopfzeile, Gründe und Notizen', () => {
    const { rows, invalid } = TG.parseAttendanceCsv(
        'Datum;Name;Status;Grund;Notiz\n' +
        '15.09.2025;Anna;anwesend;;\n' +
        '2025-09-15;Max;abwesend;Krank;Grippe\n' +
        '22.09.2025;Anna;abwesend;verletzt;\n' +
        '22.09.2025;Kim;abwesend;Zahnarzt;\n' +
        'kein-datum;Ben;anwesend;;'
    );
    assert.equal(invalid.length, 1);
    assert.deepEqual(rows, [
        { date: '2025-09-15', name: 'Anna', status: 'present', reasonCategory: '', note: '' },
        { date: '2025-09-15', name: 'Max', status: 'absent', reasonCategory: 'Krank', note: 'Grippe' },
        { date: '2025-09-22', name: 'Anna', status: 'absent', reasonCategory: 'Verletzt', note: '' },
        { date: '2025-09-22', name: 'Kim', status: 'absent', reasonCategory: '', note: 'Zahnarzt' }
    ]);
});

test('parseAttendanceCsv: Status-Synonyme und ungültiger Status', () => {
    const { rows, invalid } = TG.parseAttendanceCsv(
        '01.09.2025;Anna;x;;\n01.09.2025;Max;0;;\n01.09.2025;Kim;vielleicht;;'
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].status, 'present');
    assert.equal(rows[1].status, 'absent');
    assert.equal(invalid.length, 1);
});

// --- parseCsvImport ---
test('parseCsvImport: Kopfzeile wird übersprungen', () => {
    const rows = TG.parseCsvImport('Klasse;Name;Geschlecht;Sportlich\n7a;Anna;w;s\n7a;Max;m;');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { className: '7a', studentName: 'Anna', gender: 'female', sporty: true, classTag: '' });
    assert.deepEqual(rows[1], { className: '7a', studentName: 'Max', gender: 'male', sporty: false, classTag: '' });
});

test('parseCsvImport: ohne Kopfzeile bleibt alles erhalten', () => {
    const rows = TG.parseCsvImport('7a;Anna;w\n7b;Kim;d;ja');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].gender, 'diverse');
    assert.equal(rows[1].sporty, true);
});

test('parseCsvImport: Komma als Trennzeichen und leere Zeilen', () => {
    const rows = TG.parseCsvImport('\n7a,Anna,w\n\n7a,Max,m,x\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].sporty, true);
});

// --- escapeCsv (Formel-Injection) ---
test('escapeCsv neutralisiert Formeln und escapt Anführungszeichen', () => {
    assert.equal(TG.escapeCsv('=SUM(A1)'), '"\'=SUM(A1)"');
    assert.equal(TG.escapeCsv('+41 79'), '"\'+41 79"');
    assert.equal(TG.escapeCsv('@cmd'), '"\'@cmd"');
    assert.equal(TG.escapeCsv('Anna "A"'), '"Anna ""A"""');
    assert.equal(TG.escapeCsv('normal'), '"normal"');
});

// --- distributeTeams ---
function makePersons(n, opts = {}) {
    return Array.from({ length: n }, (_, i) => ({
        id: i + 1, name: `P${i + 1}`,
        gender: opts.genders ? opts.genders[i % opts.genders.length] : 'female',
        sporty: opts.sporty ? opts.sporty[i % opts.sporty.length] : false
    }));
}

test('distributeTeams: Teamgrössen unterscheiden sich höchstens um 1', () => {
    for (const [count, n] of [[10, 3], [7, 2], [9, 4], [20, 6]]) {
        const teams = TG.distributeTeams(makePersons(count), n, {});
        assert.equal(teams.length, n);
        const sizes = teams.map(t => t.length);
        assert.equal(sizes.reduce((a, b) => a + b, 0), count);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    }
});

test('distributeTeams: Geschlechter-Balance ±1 pro Team', () => {
    const persons = makePersons(12, { genders: ['female', 'male'] }); // 6 w, 6 m
    const teams = TG.distributeTeams(persons, 3, { balanceGender: true });
    teams.forEach(team => {
        const f = team.filter(p => p.gender === 'female').length;
        const m = team.filter(p => p.gender === 'male').length;
        assert.ok(Math.abs(f - m) <= 1, `unausgewogen: ${f}w/${m}m`);
    });
});

test('distributeTeams: Sportlichkeits-Balance ±1 pro Team', () => {
    const persons = makePersons(12, { sporty: [true, false] });
    const teams = TG.distributeTeams(persons, 4, { balanceSport: true });
    const sportyCounts = teams.map(t => t.filter(p => p.sporty).length);
    assert.ok(Math.max(...sportyCounts) - Math.min(...sportyCounts) <= 1);
});

test('distributeTeams: niemand geht verloren oder wird dupliziert', () => {
    const persons = makePersons(11, { genders: ['female', 'male', 'diverse'], sporty: [true, false, false] });
    const teams = TG.distributeTeams(persons, 3, { balanceGender: true, balanceSport: true });
    const all = teams.flat().map(p => p.id).sort((a, b) => a - b);
    assert.deepEqual(all, persons.map(p => p.id));
});

// --- enforceApart ---
test('enforceApart: trennt ein Konfliktpaar', () => {
    const teams = [
        [{ name: 'Anna', gender: 'female' }, { name: 'Max', gender: 'male' }],
        [{ name: 'Kim', gender: 'female' }, { name: 'Lea', gender: 'female' }]
    ];
    const { teams: fixed, unresolved } = TG.enforceApart(teams, [['Anna', 'Max']]);
    assert.equal(unresolved, false);
    fixed.forEach(team => {
        const names = team.map(p => p.name.toLowerCase());
        assert.ok(!(names.includes('anna') && names.includes('max')));
    });
});

test('enforceApart: Namensvergleich case-insensitiv', () => {
    const teams = [
        [{ name: 'anna' }, { name: 'MAX' }],
        [{ name: 'Kim' }]
    ];
    const { unresolved } = TG.enforceApart(teams, [['Anna', 'max']]);
    assert.equal(unresolved, false);
});

test('enforceApart: meldet unlösbare Konstellation', () => {
    // 3 Personen, die sich alle paarweise ausschliessen, aber nur 2 Teams
    const teams = [
        [{ name: 'A' }, { name: 'B' }],
        [{ name: 'C' }]
    ];
    const { unresolved } = TG.enforceApart(teams, [['A', 'B'], ['A', 'C'], ['B', 'C']]);
    assert.equal(unresolved, true);
});

test('enforceApart: keine Regeln → unverändert', () => {
    const teams = [[{ name: 'A' }], [{ name: 'B' }]];
    const res = TG.enforceApart(teams, []);
    assert.equal(res.unresolved, false);
    assert.deepEqual(res.teams, teams);
});

// --- validateBackup ---
const validBackup = () => ({
    version: 2,
    exportedAt: '2026-07-01T10:00:00.000Z',
    classes: [{
        id: 1, name: '7a',
        students: [{ id: 1, name: 'Anna', gender: 'female', sporty: true }],
        formerStudents: [{ id: 2, name: 'Max', gender: 'male', sporty: false }],
        schedule: [{ weekday: 0, time: '10:00' }]
    }],
    classIdCounter: 2, stuIdCounter: 3,
    attendanceData: {
        '1': { '2026-06-29': { date: '2026-06-29', weekday: 0, records: { '1': { status: 'present', reasonCategory: '', note: '' }, '2': { status: 'absent', reasonCategory: 'Krank', note: 'Grippe' } } } }
    },
    persons: [{ id: 5, name: 'Gast', gender: 'diverse', sporty: false }],
    personIdCounter: 6,
    apartPairs: [['Anna', 'Max']]
});

test('validateBackup: gültiges Backup inkl. persons und formerStudents', () => {
    const res = TG.validateBackup(validBackup());
    assert.ok(res);
    assert.equal(res.classes.length, 1);
    assert.equal(res.classes[0].formerStudents.length, 1);
    assert.equal(res.persons.length, 1);
    assert.equal(res.personIdCounter, 6);
    assert.equal(res.attendanceData['1']['2026-06-29'].records['2'].reasonCategory, 'Krank');
});

test('validateBackup: Version-1-Backup ohne persons bleibt gültig', () => {
    const b = validBackup();
    delete b.persons; delete b.personIdCounter; delete b.apartPairs;
    b.classes[0] = { id: 1, name: '7a', students: b.classes[0].students, schedule: [] };
    const res = TG.validateBackup(b);
    assert.ok(res);
    assert.deepEqual(res.persons, []);
    assert.deepEqual(res.apartPairs, []);
    assert.deepEqual(res.classes[0].formerStudents, []);
});

test('validateBackup: apartPairs werden übernommen und bereinigt', () => {
    const b = validBackup();
    b.apartPairs = [['Anna', 'Max'], ['nur-einer'], [1, 2], ['', 'Leer'], ['Kim', 'Lea']];
    const res = TG.validateBackup(b);
    assert.deepEqual(res.apartPairs, [['Anna', 'Max'], ['Kim', 'Lea']]);
});

test('validateBackup: lehnt kaputte Strukturen ab', () => {
    assert.equal(TG.validateBackup(null), null);
    assert.equal(TG.validateBackup({}), null);
    assert.equal(TG.validateBackup({ classes: [{ name: '' }] }), null);
    assert.equal(TG.validateBackup({ classes: [{ id: 1 }] }), null);
});

test('validateBackup: normalisiert ungültige Werte statt sie zu übernehmen', () => {
    const b = validBackup();
    b.classes[0].students.push({ id: 9, name: 'Evil', gender: '<script>', sporty: 'yes' });
    b.classes[0].schedule.push({ weekday: 9, time: '99:99' });
    b.attendanceData['1']['not-a-date'] = { records: {} };
    b.attendanceData['1']['2026-06-29'].records['1'].reasonCategory = 'Erfunden';
    const res = TG.validateBackup(b);
    const evil = res.classes[0].students.find(s => s.name === 'Evil');
    assert.equal(evil.gender, 'diverse');
    assert.equal(evil.sporty, false);
    assert.equal(res.classes[0].schedule.length, 1);
    assert.equal(res.attendanceData['1']['not-a-date'], undefined);
    assert.equal(res.attendanceData['1']['2026-06-29'].records['1'].reasonCategory, '');
});

test('validateBackup: Attendance verwaister Klassen wird verworfen, Zähler wachsen mit', () => {
    const b = validBackup();
    b.attendanceData['99'] = b.attendanceData['1'];
    b.stuIdCounter = 1; // zu klein — muss auf maxId+1 angehoben werden
    const res = TG.validateBackup(b);
    assert.equal(res.attendanceData['99'], undefined);
    assert.ok(res.stuIdCounter >= 3);
});
