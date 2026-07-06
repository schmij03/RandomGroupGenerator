// core.js — reine, DOM-freie Logik (Parsing, Validierung, Team-Verteilung).
// Wird im Browser als window.TG genutzt und in Node (Tests) via module.exports.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.TG = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const TIME_RE = /^\d{2}:\d{2}$/;
    const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const WEEKDAYS_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const REASON_CATEGORIES = ['Krank', 'Verletzt', 'Entschuldigt', 'Unentschuldigt', 'Sonstiges'];

    // Nur diese drei Werte dürfen je in s.gender landen; alles andere fällt auf 'diverse' zurück.
    function sanitizeGender(g) { return (g === 'female' || g === 'male' || g === 'diverse') ? g : 'diverse'; }

    function todayStr() {
        const d = new Date();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    function getWeekdayIndex(dateStr) {
        return (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7;
    }
    // Schweizer Schuljahr: Semester 1 = August–Januar, Semester 2 = Februar–Juli.
    function getSemester(dateStr) {
        const month = parseInt(dateStr.slice(5, 7), 10);
        return (month >= 8 || month === 1) ? 1 : 2;
    }
    function formatDateDisplay(dateStr) {
        const [y, m, d] = dateStr.split('-');
        return `${d}.${m}.${y}`;
    }

    // BULK PARSER — Tags am Zeilenende: Geschlecht (m/w/d) und/oder s = sportlich,
    // kombiniert ("Max ms") oder als getrennte Tokens in beliebiger Reihenfolge
    // ("Max m s", "Max m (s)", "Max (m) (s)"). Nur KLEIN geschriebene Tags zählen
    // ("Max m"); Grossbuchstaben bleiben Namensbestandteil ("Anna M" = Name mit
    // Initial). In Klammern ist Gross-/Kleinschreibung egal: "Anna (M)".
    // Optionales Klassenkürzel in eckigen Klammern am Ende: "Max m s [7a]".
    function bulkParse(text, addFn) {
        const entries = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        let added = 0, skipped = 0, defaults = 0;
        entries.forEach(entry => {
            let classTag = '';
            const tagMatch = entry.match(/\s*\[([^\]]{1,20})\]$/);
            if (tagMatch) { classTag = tagMatch[1].trim(); entry = entry.slice(0, tagMatch.index).trim(); }
            let gender = 'female', sporty = false, rest = entry;
            let genderSet = false, sportySet = false, tagCount = 0;
            for (let iter = 0; iter < 2; iter++) {
                let tag = null, tagIndex = -1;
                const paren = rest.match(/\s*\(([A-Za-z]{1,2})\)$/);
                if (paren && /^(?:[mwd]s?|s[mwd]?)$/i.test(paren[1])) {
                    tag = paren[1].toLowerCase(); tagIndex = paren.index;
                } else {
                    const plain = rest.match(/\s+((?:[mwd]s?)|(?:s[mwd]?))$/); // bewusst case-sensitiv
                    if (plain) { tag = plain[1]; tagIndex = plain.index; }
                }
                if (tag === null) break;
                const genderChar = (tag.match(/[mwd]/) || [null])[0];
                const hasSport = tag.includes('s');
                // Doppeltes Merkmal (z.B. zwei Geschlechts-Tags) → das zweite Token gehört zum Namen.
                if ((genderChar && genderSet) || (hasSport && sportySet)) break;
                if (genderChar) {
                    gender = genderChar === 'm' ? 'male' : genderChar === 'd' ? 'diverse' : 'female';
                    genderSet = true;
                }
                if (hasSport) { sporty = true; sportySet = true; }
                rest = rest.slice(0, tagIndex).trim();
                tagCount++;
            }
            const cleanName = rest.replace(/[\s,:\-]+$/, '').trim();
            if (!cleanName) return;
            if (tagCount === 0) defaults++;
            if (addFn(cleanName, gender, sporty, classTag)) added++; else skipped++;
        });
        return { added, skipped, defaults };
    }

    // CSV/TXT-Import: "Klasse;Name;Geschlecht;Sportlich" pro Zeile. Eine Kopfzeile
    // (wie im Format-Beispiel) wird erkannt und übersprungen.
    function isCsvHeader(a, b) {
        return /^klasse$/i.test(a) && /^(name|sch(ü|ue)ler(in)?(nen)?|vorname)$/i.test(b || '');
    }
    function parseCsvImport(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const rows = [];
        lines.forEach((line, i) => {
            const parts = line.split(/[;,]/).map(p => p.trim());
            if (parts.length < 2) return;
            const [className, studentName, genderRaw, sportyRaw, classTagRaw] = parts;
            if (!className || !studentName) return;
            if (i === 0 && isCsvHeader(className, studentName)) return;
            let gender = 'female';
            const g = (genderRaw || '').toLowerCase();
            if (g.startsWith('m')) gender = 'male'; else if (g.startsWith('d')) gender = 'diverse';
            const sporty = /^(s|ja|x|1|sportlich|true)$/i.test(sportyRaw || '');
            const classTag = (classTagRaw || '').slice(0, 20).trim();
            rows.push({ className, studentName, gender, sporty, classTag });
        });
        return rows;
    }

    // ANWESENHEITS-IMPORT (CSV aus Excel): "Datum;Name;Status;Grund;Notiz" pro Zeile.
    // Datum: JJJJ-MM-TT oder TT.MM.JJJJ. Status: anwesend/abwesend (auch ja/nein, 1/0,
    // present/absent, x = anwesend). Grund muss einer der bekannten Kategorien entsprechen,
    // sonst wandert der Text in die Notiz. Kopfzeile ("Datum;Name;…") wird übersprungen.
    function parseAttendanceCsv(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const rows = [], invalid = [];
        lines.forEach((line, i) => {
            const parts = line.split(/[;,]/).map(p => p.trim());
            if (parts.length < 3) { if (parts.join('')) invalid.push(line); return; }
            const [dateRaw, name, statusRaw, reasonRaw, noteRaw] = parts;
            if (i === 0 && /^datum$/i.test(dateRaw) && /^(name|sch(ü|ue)ler(in)?(nen)?)$/i.test(name || '')) return;
            let date = null;
            if (DATE_RE.test(dateRaw)) date = dateRaw;
            else {
                const m = dateRaw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            }
            const s = (statusRaw || '').toLowerCase();
            let status = null;
            if (/^(anwesend|present|ja|1|x|a)$/.test(s)) status = 'present';
            else if (/^(abwesend|absent|nein|0|fehlt)$/.test(s)) status = 'absent';
            if (!date || !name || !status) { invalid.push(line); return; }
            let reasonCategory = '', note = typeof noteRaw === 'string' ? noteRaw : '';
            if (reasonRaw) {
                const cat = REASON_CATEGORIES.find(c => c.toLowerCase() === reasonRaw.toLowerCase());
                if (cat) reasonCategory = cat;
                else note = note ? `${reasonRaw} — ${note}` : reasonRaw;
            }
            rows.push({ date, name, status, reasonCategory, note });
        });
        return { rows, invalid };
    }

    // Schweizer Notenformel: Note = 5 × Punkte/Max + 1, begrenzt auf 1–6, auf Zehntel gerundet.
    function pointsToGrade(points, maxPoints) {
        if (typeof points !== 'number' || !isFinite(points) || typeof maxPoints !== 'number' || !(maxPoints > 0)) return null;
        const grade = 5 * points / maxPoints + 1;
        return Math.round(Math.min(6, Math.max(1, grade)) * 10) / 10;
    }

    // Führendes '='/'+'/'-'/'@' würde in Excel/LibreOffice als Formel ausgeführt (CSV-Injection).
    function escapeCsv(v) {
        let s = String(v).replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return `"${s}"`;
    }

    // TEAM-VERTEILUNG
    function shuffleArray(arr, rng) {
        const random = rng || Math.random;
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }

    function distributeTeams(list, n, opts) {
        const { balanceGender = false, balanceSport = false, rng } = opts || {};
        let teams = Array.from({ length: n }, () => []);
        const shuf = shuffleArray(list, rng);
        if (balanceGender || balanceSport) {
            // Personen in Gruppen mit gleichen Ausgleichs-Merkmalen aufteilen und diese
            // mit fortlaufendem Index über die Teams verteilen: so landet jede Gruppe
            // (z.B. "sportlich + weiblich") möglichst gleichmässig in allen Teams.
            const sportKeys = balanceSport ? [true, false] : [null];
            const genderKeys = balanceGender ? ['female', 'male', 'diverse'] : [null];
            const strata = [];
            sportKeys.forEach(sp => genderKeys.forEach(g => {
                strata.push(shuf.filter(p =>
                    (sp === null || (p.sporty === true) === sp) &&
                    (g === null || p.gender === g)));
            }));
            let idx = 0;
            strata.forEach(grp => grp.forEach(p => { teams[idx].push(p); idx = (idx + 1) % n; }));
            teams = teams.map(t => shuffleArray(t, rng));
        } else {
            shuf.forEach((p, i) => teams[i % n].push(p));
        }
        return teams;
    }

    // "Nicht zusammen"-Paare: versucht Verstösse durch Tauschen zweier Personen zu
    // beheben. Bei balanceStrict wird zuerst ein Tauschpartner mit gleichen Merkmalen
    // (Geschlecht + sportlich) gesucht, damit die Balance erhalten bleibt.
    function enforceApart(teams, pairs, opts) {
        const { balanceStrict = false } = opts || {};
        const key = name => String(name).trim().toLowerCase();
        const pairKey = (a, b) => [key(a), key(b)].sort().join(' ');
        const conflictSet = new Set((pairs || []).map(([a, b]) => pairKey(a, b)));
        if (conflictSet.size === 0) return { teams, unresolved: false };
        const inConflict = (a, b) => conflictSet.has(pairKey(a.name, b.name));
        const wouldConflict = (team, person, ignoreIdx) =>
            team.some((m, idx) => idx !== ignoreIdx && inConflict(m, person));
        const findViolation = () => {
            for (let t = 0; t < teams.length; t++) {
                const team = teams[t];
                for (let i = 0; i < team.length; i++)
                    for (let j = i + 1; j < team.length; j++)
                        if (inConflict(team[i], team[j])) return { t, i: j };
            }
            return null;
        };
        let guard = 0;
        while (guard++ < 200) {
            const v = findViolation();
            if (!v) return { teams, unresolved: false };
            const p = teams[v.t][v.i];
            let swapped = false;
            const modes = balanceStrict ? [true, false] : [false];
            outer:
            for (const strict of modes) {
                for (let t2 = 0; t2 < teams.length; t2++) {
                    if (t2 === v.t) continue;
                    for (let j = 0; j < teams[t2].length; j++) {
                        const q = teams[t2][j];
                        if (strict && (q.gender !== p.gender || (q.sporty === true) !== (p.sporty === true))) continue;
                        if (wouldConflict(teams[t2], p, j)) continue;
                        if (wouldConflict(teams[v.t], q, v.i)) continue;
                        teams[v.t][v.i] = q; teams[t2][j] = p;
                        swapped = true; break outer;
                    }
                }
            }
            if (!swapped) return { teams, unresolved: true };
        }
        return { teams, unresolved: true };
    }

    // BACKUP-VALIDIERUNG — prüft und normalisiert eine Backup-Datei;
    // gibt null zurück, wenn die Struktur nicht passt.
    function cleanPersonLike(s) {
        if (!s || typeof s !== 'object' || !Number.isInteger(s.id) || typeof s.name !== 'string' || !s.name.trim()) return null;
        return {
            id: s.id, name: s.name.trim(), gender: sanitizeGender(s.gender), sporty: s.sporty === true,
            classTag: typeof s.classTag === 'string' ? s.classTag.slice(0, 20).trim() : ''
        };
    }
    function validateBackup(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.classes)) return null;
        const cleanClasses = [];
        let maxClassId = 0, maxStuId = 0, maxPersonId = 0, maxExamId = 0;
        for (const cls of data.classes) {
            if (!cls || typeof cls !== 'object') return null;
            const id = Number.isInteger(cls.id) && cls.id > 0 ? cls.id : null;
            const name = typeof cls.name === 'string' ? cls.name.trim() : '';
            if (id === null || !name) return null;
            const students = [];
            for (const s of (Array.isArray(cls.students) ? cls.students : [])) {
                const clean = cleanPersonLike(s);
                if (!clean) continue;
                students.push(clean);
                if (clean.id > maxStuId) maxStuId = clean.id;
            }
            const formerStudents = [];
            for (const s of (Array.isArray(cls.formerStudents) ? cls.formerStudents : [])) {
                const clean = cleanPersonLike(s);
                if (!clean) continue;
                formerStudents.push(clean);
                if (clean.id > maxStuId) maxStuId = clean.id;
            }
            const schedule = (Array.isArray(cls.schedule) ? cls.schedule : [])
                .filter(e => e && Number.isInteger(e.weekday) && e.weekday >= 0 && e.weekday <= 6 && typeof e.time === 'string' && TIME_RE.test(e.time))
                .map(e => ({ weekday: e.weekday, time: e.time }));
            cleanClasses.push({ id, name, students, formerStudents, schedule });
            if (id > maxClassId) maxClassId = id;
        }
        const cleanAttendance = {};
        if (data.attendanceData && typeof data.attendanceData === 'object' && !Array.isArray(data.attendanceData)) {
            for (const [classIdKey, sessions] of Object.entries(data.attendanceData)) {
                if (!cleanClasses.find(c => String(c.id) === classIdKey)) continue;
                if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) continue;
                const cleanSessions = {};
                for (const [dateKey, session] of Object.entries(sessions)) {
                    if (!DATE_RE.test(dateKey) || !session || typeof session !== 'object') continue;
                    const records = {};
                    if (session.records && typeof session.records === 'object' && !Array.isArray(session.records)) {
                        for (const [stuKey, rec] of Object.entries(session.records)) {
                            if (!rec || typeof rec !== 'object') continue;
                            records[stuKey] = {
                                status: rec.status === 'absent' ? 'absent' : 'present',
                                reasonCategory: REASON_CATEGORIES.includes(rec.reasonCategory) ? rec.reasonCategory : '',
                                note: typeof rec.note === 'string' ? rec.note : ''
                            };
                        }
                    }
                    cleanSessions[dateKey] = { date: dateKey, weekday: getWeekdayIndex(dateKey), records };
                }
                if (Object.keys(cleanSessions).length) cleanAttendance[classIdKey] = cleanSessions;
            }
        }
        const cleanPersons = [];
        for (const p of (Array.isArray(data.persons) ? data.persons : [])) {
            const clean = cleanPersonLike(p);
            if (!clean) continue;
            cleanPersons.push(clean);
            if (clean.id > maxPersonId) maxPersonId = clean.id;
        }
        const cleanApart = [];
        for (const p of (Array.isArray(data.apartPairs) ? data.apartPairs : [])) {
            if (Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0].trim() && p[1].trim()) cleanApart.push([p[0], p[1]]);
        }
        // Prüfungen: { [classId]: [ { id, title, date, mode:'points'|'grades', maxPoints, results:{studentId:Zahl} } ] }
        // Punkte-Modus braucht ein gültiges Maximum; Noten müssen im Bereich 1–6 liegen.
        const cleanExams = {};
        if (data.exams && typeof data.exams === 'object' && !Array.isArray(data.exams)) {
            for (const [classIdKey, list] of Object.entries(data.exams)) {
                if (!cleanClasses.find(c => String(c.id) === classIdKey)) continue;
                if (!Array.isArray(list)) continue;
                const cleanList = [];
                for (const ex of list) {
                    if (!ex || typeof ex !== 'object' || !Number.isInteger(ex.id) || ex.id <= 0) continue;
                    const title = typeof ex.title === 'string' ? ex.title.trim() : '';
                    if (!title || typeof ex.date !== 'string' || !DATE_RE.test(ex.date)) continue;
                    const mode = ex.mode === 'points' ? 'points' : 'grades';
                    const maxPoints = typeof ex.maxPoints === 'number' && isFinite(ex.maxPoints) && ex.maxPoints > 0 ? ex.maxPoints : null;
                    if (mode === 'points' && maxPoints === null) continue;
                    const results = {};
                    if (ex.results && typeof ex.results === 'object' && !Array.isArray(ex.results)) {
                        for (const [stuKey, v] of Object.entries(ex.results)) {
                            if (typeof v !== 'number' || !isFinite(v) || v < 0) continue;
                            if (mode === 'grades' && (v < 1 || v > 6)) continue;
                            results[stuKey] = v;
                        }
                    }
                    cleanList.push({ id: ex.id, title, date: ex.date, mode, maxPoints: mode === 'points' ? maxPoints : null, results });
                    if (ex.id > maxExamId) maxExamId = ex.id;
                }
                if (cleanList.length) cleanExams[classIdKey] = cleanList;
            }
        }
        return {
            classes: cleanClasses,
            classIdCounter: Math.max(Number.isInteger(data.classIdCounter) ? data.classIdCounter : 1, maxClassId + 1),
            stuIdCounter: Math.max(Number.isInteger(data.stuIdCounter) ? data.stuIdCounter : 1, maxStuId + 1),
            attendanceData: cleanAttendance,
            persons: cleanPersons,
            personIdCounter: Math.max(Number.isInteger(data.personIdCounter) ? data.personIdCounter : 1, maxPersonId + 1),
            apartPairs: cleanApart,
            exams: cleanExams,
            examIdCounter: Math.max(Number.isInteger(data.examIdCounter) ? data.examIdCounter : 1, maxExamId + 1),
            exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null
        };
    }

    return {
        DATE_RE, TIME_RE, WEEKDAYS, WEEKDAYS_FULL, REASON_CATEGORIES,
        sanitizeGender, todayStr, getWeekdayIndex, getSemester, formatDateDisplay,
        bulkParse, isCsvHeader, parseCsvImport, parseAttendanceCsv, escapeCsv, pointsToGrade,
        shuffleArray, distributeTeams, enforceApart,
        validateBackup
    };
});
