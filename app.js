// STATE
let classes = [], classIdCounter = 1, stuIdCounter = 1;
let activeClassId = null, selAttendClassId = null;
let persons = [], personIdCounter = 1;
// attendanceData: { [classId]: { [dateStr]: { date, weekday, records: { [studentId]: {status, reasonCategory, note} } } } }
let attendanceData = {};
// currentSessionRecords: { [studentId]: {status:'present'|'absent', reasonCategory:'', note:''} } for the class/date currently shown in the Anwesenheit tab
let currentSessionRecords = {};

const GENDER_ICONS = {
    female:  '<i class="fas fa-venus text-pink-500" title="Weiblich"></i>',
    male:    '<i class="fas fa-mars text-blue-500" title="Männlich"></i>',
    diverse: '<i class="fas fa-genderless text-purple-500" title="Divers"></i>'
};
// Nur diese drei Werte dürfen je in s.gender landen; alles andere fällt auf 'diverse' zurück,
// damit GENDER_ICONS[gender] nie undefined in innerHTML schreibt.
function sanitizeGender(g) { return (g === 'female' || g === 'male' || g === 'diverse') ? g : 'diverse'; }
function genderIconEl(g) { const span = document.createElement('span'); span.innerHTML = GENDER_ICONS[sanitizeGender(g)]; return span; }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const WEEKDAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const WEEKDAYS_FULL = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const REASON_CATEGORIES = ['Krank','Entschuldigt','Unentschuldigt','Sonstiges'];

function todayStr() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function getWeekdayIndex(dateStr) {
    return (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7;
}
function formatDateDisplay(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
}

// STORAGE
function saveClasses() {
    try { localStorage.setItem('tg2_classes', JSON.stringify(classes)); localStorage.setItem('tg2_classId', String(classIdCounter)); localStorage.setItem('tg2_stuId', String(stuIdCounter)); } catch(e) {}
}
function savePersons() {
    try { localStorage.setItem('tg2_persons', JSON.stringify(persons)); localStorage.setItem('tg2_personId', String(personIdCounter)); } catch(e) {}
}
function saveAttendanceData() {
    try { localStorage.setItem('tg2_attendance', JSON.stringify(attendanceData)); } catch(e) {}
}
function loadStorage() {
    try {
        const c = localStorage.getItem('tg2_classes');
        if (c) {
            const parsed = JSON.parse(c);
            if (Array.isArray(parsed)) {
                classes = parsed;
                classes.forEach(cls => {
                    if (!Array.isArray(cls.students)) cls.students = [];
                    if (!Array.isArray(cls.schedule)) cls.schedule = [];
                    cls.students.forEach(s => { s.gender = sanitizeGender(s.gender); s.sporty = s.sporty === true; });
                });
                classIdCounter = parseInt(localStorage.getItem('tg2_classId')||'1',10) || 1;
                stuIdCounter = parseInt(localStorage.getItem('tg2_stuId')||'1',10) || 1;
            }
        }
        const p = localStorage.getItem('tg2_persons');
        if (p) {
            const parsed = JSON.parse(p);
            if (Array.isArray(parsed)) {
                persons = parsed;
                persons.forEach(x => { x.gender = sanitizeGender(x.gender); x.sporty = x.sporty === true; });
                personIdCounter = parseInt(localStorage.getItem('tg2_personId')||'1',10) || 1;
            }
        }
        const a = localStorage.getItem('tg2_attendance');
        if (a) {
            const parsed = JSON.parse(a);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) attendanceData = parsed;
        }
    } catch(e) {}
}

// TABS
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
function switchTab(tab) {
    ['classes','attendance','stats','teams'].forEach(t => document.getElementById('tab-'+t).classList.toggle('hidden', t !== tab));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    if (tab === 'attendance') refreshAttendanceSelect();
    if (tab === 'stats') refreshStatsSelect();
    if (tab === 'teams') renderPersonList();
}

// WOCHENPLAN (gemeinsame Helfer für Klassen-Formular & Detailansicht)
function createScheduleRow(container, entry) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 schedule-row';
    const sel = document.createElement('select');
    sel.className = 'schedule-weekday border rounded-md p-1.5 text-xs bg-white focus:border-indigo-500 focus:outline-none';
    sel.innerHTML = '<option value="">Tag</option>' + WEEKDAYS.map((w, i) => `<option value="${i}">${w}</option>`).join('');
    if (entry && entry.weekday !== undefined && entry.weekday !== null) sel.value = String(entry.weekday);
    const time = document.createElement('input');
    time.type = 'time';
    time.className = 'schedule-time border rounded-md p-1.5 text-xs flex-1 focus:border-indigo-500 focus:outline-none';
    if (entry && entry.time) time.value = entry.time;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'text-gray-300 hover:text-red-500 px-1';
    rm.innerHTML = '<i class="fas fa-times text-xs"></i>';
    rm.addEventListener('click', () => row.remove());
    row.appendChild(sel); row.appendChild(time); row.appendChild(rm);
    container.appendChild(row);
    return row;
}
function readScheduleRows(container) {
    const schedule = [];
    container.querySelectorAll('.schedule-row').forEach(row => {
        const weekday = row.querySelector('.schedule-weekday').value;
        const time = row.querySelector('.schedule-time').value;
        if (weekday === '' || !time) return;
        schedule.push({ weekday: parseInt(weekday, 10), time });
    });
    return schedule;
}

// TAB 1: KLASSEN
const $newClassForm = document.getElementById('new-class-form');
const $newClassName = document.getElementById('new-class-name');
const $newClassErr  = document.getElementById('new-class-error');

const $newClassScheduleRows = document.getElementById('new-class-schedule-rows');

function resetNewClassForm() {
    $newClassName.value = ''; $newClassErr.classList.add('hidden');
    $newClassScheduleRows.innerHTML = '';
    createScheduleRow($newClassScheduleRows);
}

document.getElementById('create-class-btn').addEventListener('click', () => { $newClassForm.classList.remove('hidden'); resetNewClassForm(); $newClassName.focus(); });
document.getElementById('cancel-class-btn').addEventListener('click', () => { $newClassForm.classList.add('hidden'); resetNewClassForm(); });
document.getElementById('new-class-schedule-add-btn').addEventListener('click', () => createScheduleRow($newClassScheduleRows));
document.getElementById('save-class-btn').addEventListener('click', doCreateClass);
$newClassName.addEventListener('keydown', e => { if (e.key === 'Enter') doCreateClass(); });

function doCreateClass() {
    const name = $newClassName.value.trim();
    if (!name) return;
    if (classes.find(c => c.name.toLowerCase() === name.toLowerCase())) { $newClassErr.textContent = `Eine Klasse "${name}" existiert bereits.`; $newClassErr.classList.remove('hidden'); return; }
    const schedule = readScheduleRows($newClassScheduleRows);
    classes.push({ id: classIdCounter++, name, students: [], schedule });
    saveClasses();
    $newClassForm.classList.add('hidden'); resetNewClassForm();
    renderClassList();
    selectClass(classes[classes.length - 1].id);
}

function renderClassList() {
    const list = document.getElementById('class-list');
    list.innerHTML = '';
    if (classes.length === 0) {
        const noMsg = document.createElement('li');
        noMsg.id = 'no-classes-msg';
        noMsg.className = 'text-center text-gray-400 text-sm py-10';
        noMsg.innerHTML = '<i class="fas fa-graduation-cap text-3xl mb-2 opacity-30 block"></i>Noch keine Klassen angelegt.';
        list.appendChild(noMsg);
        return;
    }
    classes.forEach(cls => {
        const isActive = cls.id === activeClassId;
        const li = document.createElement('li');
        li.className = `flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'}`;
        const left = document.createElement('div');
        left.className = 'flex items-center gap-2 flex-1 min-w-0';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-semibold truncate text-sm';
        nameSpan.textContent = cls.name;
        const badge = document.createElement('span');
        badge.className = `text-xs px-2 py-0.5 rounded-full ml-1 ${isActive ? 'bg-white bg-opacity-20 text-white' : 'bg-gray-100 text-gray-500'}`;
        badge.textContent = `${cls.students.length} SuS`;
        left.appendChild(nameSpan); left.appendChild(badge);
        left.addEventListener('click', () => selectClass(cls.id));
        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-0.5 ml-2 flex-shrink-0';
        [['fa-pen','Umbenennen',() => renameClass(cls.id)],['fa-trash-alt','Löschen',() => deleteClass(cls.id)]].forEach(([icon, title, fn]) => {
            const btn = document.createElement('button');
            btn.className = `p-1.5 rounded text-xs transition-colors ${isActive ? 'text-indigo-200 hover:text-white hover:bg-white hover:bg-opacity-20' : 'text-gray-300 hover:text-indigo-500 hover:bg-indigo-50'}`;
            btn.innerHTML = `<i class="fas ${icon}"></i>`; btn.title = title;
            btn.addEventListener('click', e => { e.stopPropagation(); fn(); });
            actions.appendChild(btn);
        });
        li.appendChild(left); li.appendChild(actions);
        list.appendChild(li);
    });
}

function selectClass(id) { activeClassId = id; renderClassList(); renderClassDetail(); }

function renameClass(id) {
    const cls = classes.find(c => c.id === id);
    if (!cls) return;
    const n = prompt('Neuer Klassenname:', cls.name);
    if (!n || !n.trim()) return;
    const t = n.trim();
    if (classes.find(c => c.id !== id && c.name.toLowerCase() === t.toLowerCase())) { alert(`Eine Klasse "${t}" existiert bereits.`); return; }
    cls.name = t; saveClasses(); renderClassList(); renderClassDetail();
}

function deleteClass(id) {
    const cls = classes.find(c => c.id === id);
    if (!cls || !confirm(`Klasse "${cls.name}" wirklich löschen? Damit werden auch alle erfassten Anwesenheiten dieser Klasse gelöscht.`)) return;
    classes = classes.filter(c => c.id !== id);
    if (activeClassId === id) activeClassId = null;
    if (selAttendClassId === id) { selAttendClassId = null; currentSessionRecords = {}; }
    delete attendanceData[id];
    saveClasses(); saveAttendanceData(); renderClassList(); renderClassDetail();
}

function renderClassDetail() {
    const panel = document.getElementById('class-detail-panel');
    const noSel = document.getElementById('no-class-selected');
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) { panel.classList.add('hidden'); noSel.classList.remove('hidden'); return; }
    panel.classList.remove('hidden'); noSel.classList.add('hidden');
    document.getElementById('detail-class-name').textContent = cls.name;
    document.getElementById('detail-student-count').textContent = `${cls.students.length} Schüler(in)`;
    document.getElementById('detail-schedule-edit').classList.add('hidden');
    document.getElementById('detail-schedule-display').classList.remove('hidden');
    renderScheduleDisplayBadges(cls);
    renderStudentList(cls);
}

function renderScheduleDisplayBadges(cls) {
    const disp = document.getElementById('detail-schedule-display');
    disp.innerHTML = '';
    if (!cls.schedule || cls.schedule.length === 0) {
        const span = document.createElement('span');
        span.className = 'text-xs text-gray-400 italic';
        span.textContent = 'Kein Wochenplan hinterlegt.';
        disp.appendChild(span);
        return;
    }
    cls.schedule.slice().sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)).forEach(e => {
        const badge = document.createElement('span');
        badge.className = 'text-xs bg-white border border-indigo-200 text-indigo-700 px-2 py-1 rounded-full';
        badge.textContent = `${WEEKDAYS[e.weekday]} ${e.time}`;
        disp.appendChild(badge);
    });
}

document.getElementById('edit-schedule-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    const editDiv = document.getElementById('detail-schedule-edit');
    const displayDiv = document.getElementById('detail-schedule-display');
    const rowsContainer = document.getElementById('detail-schedule-rows');
    const opening = editDiv.classList.contains('hidden');
    if (opening) {
        rowsContainer.innerHTML = '';
        if (cls.schedule && cls.schedule.length) cls.schedule.forEach(e => createScheduleRow(rowsContainer, e));
        else createScheduleRow(rowsContainer);
        editDiv.classList.remove('hidden'); displayDiv.classList.add('hidden');
    } else {
        editDiv.classList.add('hidden'); displayDiv.classList.remove('hidden');
    }
});
document.getElementById('detail-schedule-add-btn').addEventListener('click', () => createScheduleRow(document.getElementById('detail-schedule-rows')));
document.getElementById('detail-schedule-save-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    cls.schedule = readScheduleRows(document.getElementById('detail-schedule-rows'));
    saveClasses();
    document.getElementById('detail-schedule-edit').classList.add('hidden');
    document.getElementById('detail-schedule-display').classList.remove('hidden');
    renderScheduleDisplayBadges(cls);
});

document.getElementById('add-student-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('student-name-input').value.trim();
    const gender = document.querySelector('input[name="student-gender"]:checked').value;
    const sporty = document.getElementById('student-sporty-input').checked;
    const errEl = document.getElementById('student-error-msg');
    if (!name || !activeClassId) return;
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    if (cls.students.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        errEl.textContent = `"${name}" ist bereits in dieser Klasse.`; errEl.classList.remove('hidden');
        setTimeout(() => errEl.classList.add('hidden'), 3000); return;
    }
    cls.students.push({ id: stuIdCounter++, name, gender, sporty });
    saveClasses();
    document.getElementById('student-name-input').value = '';
    document.getElementById('student-sporty-input').checked = false;
    errEl.classList.add('hidden');
    renderClassDetail();
});

function removeStudent(studentId) {
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    cls.students = cls.students.filter(s => s.id !== studentId);
    saveClasses(); renderClassDetail();
}

function renderStudentList(cls) {
    const ul = document.getElementById('student-list');
    ul.innerHTML = '';
    if (cls.students.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-center text-gray-400 text-sm py-8';
        li.innerHTML = '<i class="fas fa-user-plus text-2xl mb-2 opacity-30 block"></i>Noch keine Schüler eingetragen.';
        ul.appendChild(li); return;
    }
    cls.students.forEach(s => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between bg-white p-2 rounded-lg border border-gray-100 shadow-sm fade-in';
        const left = document.createElement('div'); left.className = 'flex items-center gap-2 min-w-0';
        const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[sanitizeGender(s.gender)];
        const nameSpan = document.createElement('span'); nameSpan.className = 'text-sm text-gray-700 truncate'; nameSpan.textContent = s.name;
        left.appendChild(icon); left.appendChild(nameSpan);
        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-0.5 flex-shrink-0';
        const sportyBtn = document.createElement('button');
        sportyBtn.className = `text-xs p-1 rounded transition-colors ${s.sporty ? 'text-emerald-500 hover:text-emerald-700' : 'text-gray-200 hover:text-emerald-400'}`;
        sportyBtn.innerHTML = '<i class="fas fa-person-running"></i>';
        sportyBtn.title = s.sporty ? 'Sportlich (klicken zum Ändern)' : 'Nicht sportlich (klicken zum Ändern)';
        sportyBtn.addEventListener('click', () => { s.sporty = !s.sporty; saveClasses(); renderStudentList(cls); });
        const delBtn = document.createElement('button');
        delBtn.className = 'text-gray-200 hover:text-red-500 text-xs p-1 transition-colors';
        delBtn.innerHTML = '<i class="fas fa-times"></i>';
        delBtn.title = 'Schüler(in) entfernen';
        delBtn.addEventListener('click', () => removeStudent(s.id));
        actions.appendChild(sportyBtn); actions.appendChild(delBtn);
        li.appendChild(left); li.appendChild(actions); ul.appendChild(li);
    });
}

document.getElementById('sort-alpha-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    cls.students.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    saveClasses(); renderStudentList(cls);
});

document.getElementById('toggle-class-bulk-btn').addEventListener('click', () => document.getElementById('class-bulk-area').classList.toggle('hidden'));
document.getElementById('class-bulk-import-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    const text = document.getElementById('class-bulk-input').value.trim();
    if (!text) return;
    const { added, skipped, defaults } = bulkParse(text, (name, gender, sporty) => {
        if (cls.students.find(s => s.name.toLowerCase() === name.toLowerCase())) return false;
        cls.students.push({ id: stuIdCounter++, name, gender, sporty }); return true;
    });
    saveClasses(); document.getElementById('class-bulk-input').value = '';
    showBulkMsg('class-bulk-msg', added, skipped, defaults);
    setTimeout(() => document.getElementById('class-bulk-area').classList.add('hidden'), 4000);
    renderClassDetail();
});

// KLASSEN IMPORT / EXPORT
document.getElementById('export-classes-btn').addEventListener('click', () => {
    if (classes.length === 0) { alert('Keine Klassen zum Exportieren vorhanden.'); return; }
    const data = classes.map(c => ({ name: c.name, schedule: c.schedule || [], students: c.students.map(s => ({ name: s.name, gender: s.gender, sporty: s.sporty === true })) }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `klassen-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

const $importFileInput = document.getElementById('import-file-input');
document.getElementById('import-classes-btn').addEventListener('click', () => $importFileInput.click());
$importFileInput.addEventListener('change', () => {
    const file = $importFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            let imported = 0, importedStudents = 0;
            if (file.name.toLowerCase().endsWith('.json')) {
                const data = JSON.parse(reader.result);
                const list = Array.isArray(data) ? data : [data];
                list.forEach(entry => {
                    const name = (entry.name || '').trim();
                    if (!name) return;
                    let cls = classes.find(c => c.name.toLowerCase() === name.toLowerCase());
                    if (!cls) {
                        const schedule = Array.isArray(entry.schedule)
                            ? entry.schedule.filter(e => e && Number.isInteger(e.weekday) && e.weekday >= 0 && e.weekday <= 6 && typeof e.time === 'string' && TIME_RE.test(e.time)).map(e => ({ weekday: e.weekday, time: e.time }))
                            : [];
                        cls = { id: classIdCounter++, name, students: [], schedule }; classes.push(cls); imported++;
                    }
                    (entry.students || []).forEach(s => {
                        const sName = (typeof s === 'string' ? s : s.name || '').trim();
                        if (!sName) return;
                        if (cls.students.find(st => st.name.toLowerCase() === sName.toLowerCase())) return;
                        const gender = (typeof s === 'object' && (s.gender === 'female' || s.gender === 'male' || s.gender === 'diverse')) ? s.gender : 'female';
                        const sporty = typeof s === 'object' && s.sporty === true;
                        cls.students.push({ id: stuIdCounter++, name: sName, gender, sporty });
                        importedStudents++;
                    });
                });
            } else {
                // CSV / TXT: "Klasse;Name;Geschlecht;Sportlich" (Sportlich optional: s/ja/x/1) pro Zeile
                const lines = reader.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                lines.forEach(line => {
                    const parts = line.split(/[;,]/).map(p => p.trim());
                    if (parts.length < 2) return;
                    const [className, studentName, genderRaw, sportyRaw] = parts;
                    if (!className || !studentName) return;
                    let cls = classes.find(c => c.name.toLowerCase() === className.toLowerCase());
                    if (!cls) { cls = { id: classIdCounter++, name: className, students: [], schedule: [] }; classes.push(cls); imported++; }
                    if (cls.students.find(st => st.name.toLowerCase() === studentName.toLowerCase())) return;
                    let gender = 'female';
                    const g = (genderRaw || '').toLowerCase();
                    if (g.startsWith('m')) gender = 'male'; else if (g.startsWith('d')) gender = 'diverse';
                    const sporty = /^(s|ja|x|1|sportlich|true)$/i.test(sportyRaw || '');
                    cls.students.push({ id: stuIdCounter++, name: studentName, gender, sporty });
                    importedStudents++;
                });
            }
            saveClasses(); renderClassList(); renderClassDetail();
            alert(`Import abgeschlossen: ${imported} neue Klasse(n), ${importedStudents} Schüler(innen) hinzugefügt.`);
        } catch (err) {
            alert('Import fehlgeschlagen: Datei konnte nicht gelesen werden. Bitte ein gültiges JSON (Klassenexport) oder eine CSV mit "Klasse;Name;Geschlecht" verwenden.');
        }
        $importFileInput.value = '';
    };
    reader.readAsText(file);
});

// TAB 2: ANWESENHEIT
function refreshAttendanceSelect() {
    const sel = document.getElementById('attendance-class-select');
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- Klasse wählen --</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = String(cls.id); opt.textContent = `${cls.name} (${cls.students.length} SuS)`;
        sel.appendChild(opt);
    });
    if (prev && classes.find(c => String(c.id) === prev)) sel.value = prev;
    const dateInput = document.getElementById('attendance-date-input');
    if (!dateInput.value) dateInput.value = todayStr();
}

document.getElementById('attendance-class-select').addEventListener('change', function() {
    const id = parseInt(this.value, 10);
    const emptyEl = document.getElementById('attendance-empty');
    const contentEl = document.getElementById('attendance-content');
    if (isNaN(id)) {
        selAttendClassId = null; currentSessionRecords = {};
        emptyEl.classList.remove('hidden'); contentEl.classList.add('hidden'); return;
    }
    selAttendClassId = id;
    emptyEl.classList.add('hidden'); contentEl.classList.remove('hidden');
    loadAttendanceSession();
});

document.getElementById('attendance-date-input').addEventListener('change', () => {
    if (selAttendClassId !== null) loadAttendanceSession();
});

function loadAttendanceSession() {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const dateInput = document.getElementById('attendance-date-input');
    const dateStr = dateInput.value || todayStr();
    dateInput.value = dateStr;
    const existing = attendanceData[cls.id] && attendanceData[cls.id][dateStr];
    currentSessionRecords = {};
    cls.students.forEach(s => {
        const rec = existing && existing.records[s.id];
        currentSessionRecords[s.id] = rec ? { status: rec.status, reasonCategory: rec.reasonCategory || '', note: rec.note || '' } : { status: 'present', reasonCategory: '', note: '' };
    });
    document.getElementById('attendance-saved-msg').classList.add('hidden');
    renderScheduleHint(cls, dateStr);
    renderAttendanceGrid();
    renderAttendanceSessionsList(cls);
}

function renderScheduleHint(cls, dateStr) {
    const hintEl = document.getElementById('attendance-schedule-hint');
    const textEl = hintEl.querySelector('span');
    if (!cls.schedule || cls.schedule.length === 0) { hintEl.classList.add('hidden'); return; }
    const weekday = getWeekdayIndex(dateStr);
    const matches = cls.schedule.filter(e => e.weekday === weekday);
    if (matches.length > 0) {
        textEl.textContent = `Geplanter Termin: ${WEEKDAYS_FULL[weekday]}, ${matches.map(m => m.time).join(' / ')} Uhr.`;
    } else {
        textEl.textContent = `Hinweis: Laut Wochenplan von "${cls.name}" ist am ${WEEKDAYS_FULL[weekday]} normalerweise kein Termin vorgesehen.`;
    }
    hintEl.classList.remove('hidden');
}

document.getElementById('all-present-btn').addEventListener('click', () => {
    Object.keys(currentSessionRecords).forEach(id => { currentSessionRecords[id].status = 'present'; });
    renderAttendanceGrid();
});
document.getElementById('all-absent-btn').addEventListener('click', () => {
    Object.keys(currentSessionRecords).forEach(id => { currentSessionRecords[id].status = 'absent'; });
    renderAttendanceGrid();
});

function renderAttendanceGrid() {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const presentCount = Object.values(currentSessionRecords).filter(r => r.status === 'present').length;
    document.getElementById('total-students-count').textContent = cls.students.length;
    document.getElementById('present-count').textContent = presentCount;
    document.getElementById('load-to-teams-label').textContent = `Teams erstellen mit ${presentCount} Schüler${presentCount === 1 ? '' : 'n'}`;
    const grid = document.getElementById('attendance-grid');
    grid.innerHTML = '';
    if (cls.students.length === 0) { grid.innerHTML = '<p class="text-sm text-gray-400 col-span-full text-center py-6">Diese Klasse hat noch keine Schüler.</p>'; return; }
    cls.students.forEach(s => {
        const rec = currentSessionRecords[s.id];
        const present = rec.status === 'present';
        const card = document.createElement('div');
        card.className = `attendance-card p-3 rounded-xl border-2 select-none ${present ? 'bg-green-50 border-green-400 text-green-900' : 'bg-red-50 border-red-300 text-red-900'}`;
        const topRow = document.createElement('div');
        topRow.className = 'flex items-center gap-3 cursor-pointer';
        topRow.addEventListener('click', () => { rec.status = present ? 'absent' : 'present'; renderAttendanceGrid(); });
        const checkbox = document.createElement('div');
        checkbox.className = `w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${present ? 'bg-green-500 border-green-500' : 'bg-red-400 border-red-400'}`;
        checkbox.innerHTML = present ? '<i class="fas fa-check text-white text-xs"></i>' : '<i class="fas fa-times text-white text-xs"></i>';
        const iconSpan = document.createElement('span'); iconSpan.innerHTML = GENDER_ICONS[sanitizeGender(s.gender)];
        const nameSpan = document.createElement('span'); nameSpan.className = 'font-medium text-sm flex-1 truncate'; nameSpan.textContent = s.name;
        topRow.appendChild(checkbox); topRow.appendChild(iconSpan); topRow.appendChild(nameSpan);
        card.appendChild(topRow);
        if (!present) {
            const reasonRow = document.createElement('div');
            reasonRow.className = 'flex flex-col sm:flex-row gap-1.5 mt-2 pt-2 border-t border-red-200';
            const sel = document.createElement('select');
            sel.className = 'text-xs border border-red-200 rounded-md p-1.5 bg-white focus:outline-none focus:border-red-400';
            sel.innerHTML = '<option value="">Grund wählen…</option>' + REASON_CATEGORIES.map(r => `<option value="${r}">${r}</option>`).join('');
            sel.value = rec.reasonCategory || '';
            sel.addEventListener('click', e => e.stopPropagation());
            sel.addEventListener('change', e => { rec.reasonCategory = e.target.value; });
            const note = document.createElement('input');
            note.type = 'text'; note.placeholder = 'Notiz (optional)'; note.value = rec.note || '';
            note.className = 'text-xs border border-red-200 rounded-md p-1.5 flex-1 focus:outline-none focus:border-red-400';
            note.addEventListener('click', e => e.stopPropagation());
            note.addEventListener('input', e => { rec.note = e.target.value; });
            reasonRow.appendChild(sel); reasonRow.appendChild(note);
            card.appendChild(reasonRow);
        }
        grid.appendChild(card);
    });
}

document.getElementById('save-attendance-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const dateStr = document.getElementById('attendance-date-input').value || todayStr();
    if (!attendanceData[cls.id]) attendanceData[cls.id] = {};
    const records = {};
    Object.keys(currentSessionRecords).forEach(id => { records[id] = { ...currentSessionRecords[id] }; });
    attendanceData[cls.id][dateStr] = { date: dateStr, weekday: getWeekdayIndex(dateStr), records };
    saveAttendanceData();
    const msg = document.getElementById('attendance-saved-msg');
    msg.classList.remove('hidden');
    renderAttendanceSessionsList(cls);
});

function renderAttendanceSessionsList(cls) {
    const list = document.getElementById('attendance-sessions-list');
    list.innerHTML = '';
    const sessions = attendanceData[cls.id] ? Object.values(attendanceData[cls.id]).sort((a, b) => b.date.localeCompare(a.date)) : [];
    if (sessions.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-gray-400 text-xs py-2';
        li.textContent = 'Noch keine Termine für diese Klasse gespeichert.';
        list.appendChild(li);
        return;
    }
    sessions.forEach(session => {
        const presentN = Object.values(session.records).filter(r => r.status === 'present').length;
        const totalN = Object.values(session.records).length;
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-sm';
        const left = document.createElement('button');
        left.className = 'flex items-center gap-2 text-left hover:text-indigo-600 transition-colors';
        [[ 'font-medium', formatDateDisplay(session.date) ],
         [ 'text-xs text-gray-400', WEEKDAYS[session.weekday] || '' ],
         [ 'text-xs text-gray-400', `· ${presentN}/${totalN} anwesend` ]].forEach(([cls2, txt]) => {
            const sp = document.createElement('span'); sp.className = cls2; sp.textContent = txt; left.appendChild(sp);
        });
        left.addEventListener('click', () => { document.getElementById('attendance-date-input').value = session.date; loadAttendanceSession(); });
        const delBtn = document.createElement('button');
        delBtn.className = 'text-gray-300 hover:text-red-500 text-xs p-1';
        delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        delBtn.addEventListener('click', () => {
            if (!confirm(`Termin vom ${formatDateDisplay(session.date)} wirklich löschen?`)) return;
            delete attendanceData[cls.id][session.date];
            saveAttendanceData();
            if (document.getElementById('attendance-date-input').value === session.date) loadAttendanceSession();
            else renderAttendanceSessionsList(cls);
        });
        li.appendChild(left); li.appendChild(delBtn);
        list.appendChild(li);
    });
}

document.getElementById('load-to-teams-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const present = cls.students.filter(s => currentSessionRecords[s.id] && currentSessionRecords[s.id].status === 'present');
    if (present.length === 0) { alert('Keine Schüler(innen) als anwesend markiert.'); return; }
    persons = present.map(s => ({ id: personIdCounter++, name: s.name, gender: s.gender, sporty: s.sporty === true }));
    savePersons();
    document.getElementById('source-banner-text').textContent = `Geladen aus "${cls.name}": ${present.length} von ${cls.students.length} Schüler(innen) anwesend.`;
    document.getElementById('source-banner').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
    switchTab('teams');
});

// TAB: AUSWERTUNG
function refreshStatsSelect() {
    const sel = document.getElementById('stats-class-select');
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- Klasse wählen --</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = String(cls.id); opt.textContent = cls.name;
        sel.appendChild(opt);
    });
    if (prev && classes.find(c => String(c.id) === prev)) { sel.value = prev; renderStats(); }
}

document.getElementById('stats-class-select').addEventListener('change', renderStats);

function renderStats() {
    const id = parseInt(document.getElementById('stats-class-select').value, 10);
    const emptyEl = document.getElementById('stats-empty');
    const contentEl = document.getElementById('stats-content');
    const exportBtn = document.getElementById('export-stats-btn');
    const cls = classes.find(c => c.id === id);
    const sessions = cls && attendanceData[cls.id] ? Object.values(attendanceData[cls.id]).sort((a, b) => a.date.localeCompare(b.date)) : [];
    if (!cls || sessions.length === 0) {
        emptyEl.classList.remove('hidden'); contentEl.classList.add('hidden'); exportBtn.classList.add('hidden');
        return;
    }
    emptyEl.classList.add('hidden'); contentEl.classList.remove('hidden'); exportBtn.classList.remove('hidden');
    document.getElementById('stats-session-count').textContent = sessions.length;

    const statsRows = cls.students.map(s => {
        let present = 0, absent = 0;
        const reasonCounts = {};
        const absences = [];
        sessions.forEach(session => {
            const rec = session.records[s.id];
            if (!rec) return;
            if (rec.status === 'present') present++;
            else {
                absent++;
                const key = rec.reasonCategory || 'Ohne Angabe';
                reasonCounts[key] = (reasonCounts[key] || 0) + 1;
                absences.push({ date: session.date, reasonCategory: rec.reasonCategory || '', note: rec.note || '' });
            }
        });
        const total = present + absent;
        const quote = total > 0 ? Math.round((present / total) * 100) : null;
        return { student: s, present, absent, quote, reasonCounts, absences };
    });

    const tbody = document.getElementById('stats-table-body');
    tbody.innerHTML = '';
    statsRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'border-t border-gray-100';
        const nameTd = document.createElement('td');
        nameTd.className = 'px-3 py-2 flex items-center gap-2';
        nameTd.appendChild(genderIconEl(row.student.gender));
        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-medium';
        nameSpan.textContent = row.student.name;
        nameTd.appendChild(nameSpan);
        const presentTd = document.createElement('td'); presentTd.className = 'text-center px-3 py-2 text-green-700'; presentTd.textContent = row.present;
        const absentTd = document.createElement('td'); absentTd.className = 'text-center px-3 py-2 text-red-600'; absentTd.textContent = row.absent;
        const quoteTd = document.createElement('td');
        quoteTd.className = 'text-center px-3 py-2 font-semibold';
        if (row.quote !== null) {
            quoteTd.textContent = `${row.quote}%`;
            quoteTd.className += row.quote < 80 ? ' text-red-600' : row.quote < 95 ? ' text-amber-600' : ' text-green-700';
        } else { quoteTd.textContent = '–'; }
        const reasonsTd = document.createElement('td');
        reasonsTd.className = 'px-3 py-2 text-xs text-gray-500';
        const reasonEntries = Object.entries(row.reasonCounts);
        reasonsTd.textContent = reasonEntries.length ? reasonEntries.map(([k, v]) => `${k}: ${v}`).join(', ') : '–';
        tr.appendChild(nameTd); tr.appendChild(presentTd); tr.appendChild(absentTd); tr.appendChild(quoteTd); tr.appendChild(reasonsTd);
        tbody.appendChild(tr);

        if (row.absences.length > 0) {
            tr.className += ' cursor-pointer hover:bg-gray-50';
            tr.title = 'Klicken für Abwesenheits-Details';
            const detailTr = document.createElement('tr');
            detailTr.className = 'hidden bg-gray-50 border-t border-gray-100';
            const detailTd = document.createElement('td');
            detailTd.colSpan = 5;
            detailTd.className = 'px-3 py-2';
            const ul = document.createElement('ul');
            ul.className = 'text-xs text-gray-600 space-y-1';
            row.absences.forEach(a => {
                const li = document.createElement('li');
                li.className = 'flex items-center gap-2';
                const dateSpan = document.createElement('span');
                dateSpan.className = 'font-medium text-gray-700 w-20 flex-shrink-0';
                dateSpan.textContent = formatDateDisplay(a.date);
                const catSpan = document.createElement('span');
                catSpan.className = 'px-1.5 py-0.5 rounded bg-red-50 text-red-700 flex-shrink-0';
                catSpan.textContent = a.reasonCategory || 'Ohne Angabe';
                li.appendChild(dateSpan); li.appendChild(catSpan);
                if (a.note) {
                    const noteSpan = document.createElement('span');
                    noteSpan.className = 'text-gray-400 truncate';
                    noteSpan.textContent = a.note;
                    li.appendChild(noteSpan);
                }
                ul.appendChild(li);
            });
            detailTd.appendChild(ul);
            detailTr.appendChild(detailTd);
            tbody.appendChild(detailTr);
            tr.addEventListener('click', () => detailTr.classList.toggle('hidden'));
        }
    });

    exportBtn.onclick = () => exportStatsCsv(cls, statsRows, sessions.length);
}

function exportStatsCsv(cls, statsRows, sessionCount) {
    // Führendes '='/'+'/'-'/'@' würde in Excel/LibreOffice als Formel ausgeführt (CSV-Injection).
    const escapeCsv = v => {
        let s = String(v).replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return `"${s}"`;
    };
    const lines = [['Name', 'Anwesend', 'Abwesend', 'Quote (%)', 'Gründe', 'Abwesenheits-Details'].map(escapeCsv).join(';')];
    statsRows.forEach(row => {
        const reasons = Object.entries(row.reasonCounts).map(([k, v]) => `${k}: ${v}`).join(', ');
        const details = (row.absences || []).map(a => `${formatDateDisplay(a.date)} ${a.reasonCategory || 'Ohne Angabe'}${a.note ? ` (${a.note})` : ''}`).join(' | ');
        lines.push([row.student.name, row.present, row.absent, row.quote === null ? '' : row.quote, reasons, details].map(escapeCsv).join(';'));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `anwesenheit-${cls.name}-${todayStr()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// TAB 3: TEAMS
function addPerson(name, gender, sporty = false) {
    if (persons.find(p => p.name.toLowerCase() === name.toLowerCase())) { showAddError(`"${name}" ist bereits in der Liste.`); return false; }
    persons.push({ id: personIdCounter++, name, gender, sporty: sporty === true }); savePersons(); renderPersonList(); return true;
}
function showAddError(msg) {
    const el = document.getElementById('add-error-msg'); el.textContent = msg; el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}
function removePerson(id) { persons = persons.filter(p => p.id !== id); savePersons(); renderPersonList(); }

document.getElementById('add-person-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('person-name').value.trim();
    const gender = document.querySelector('input[name="gender"]:checked').value;
    const sporty = document.getElementById('person-sporty-input').checked;
    if (!name) return;
    const ok = addPerson(name, gender, sporty);
    if (ok) {
        document.getElementById('person-name').value = '';
        document.getElementById('person-sporty-input').checked = false;
        document.getElementById('add-error-msg').classList.add('hidden');
    }
    document.getElementById('person-name').focus();
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (!confirm('Alle Teilnehmer löschen?')) return;
    persons = []; savePersons();
    document.getElementById('source-banner').classList.add('hidden');
    document.getElementById('results-section').classList.add('hidden');
    renderPersonList();
});

function renderPersonList() {
    const list = document.getElementById('person-list');
    const emptyEl = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-all-btn');
    document.getElementById('total-count').textContent = persons.length;
    list.innerHTML = '';
    if (persons.length === 0) { list.appendChild(emptyEl); clearBtn.classList.add('hidden'); return; }
    clearBtn.classList.remove('hidden');
    persons.forEach(p => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-white p-2.5 rounded-lg shadow-sm border border-gray-100 fade-in';
        const inner = document.createElement('div'); inner.className = 'flex items-center gap-2';
        const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[sanitizeGender(p.gender)];
        const name = document.createElement('span'); name.className = 'text-sm font-medium text-gray-700'; name.textContent = p.name;
        inner.appendChild(icon); inner.appendChild(name);
        const btn = document.createElement('button');
        btn.className = 'text-gray-200 hover:text-red-500 text-xs transition-colors';
        btn.innerHTML = '<i class="fas fa-times"></i>';
        btn.addEventListener('click', () => removePerson(p.id));
        li.appendChild(inner); li.appendChild(btn); list.appendChild(li);
    });
}

document.getElementById('toggle-bulk-btn').addEventListener('click', () => document.getElementById('bulk-area').classList.toggle('hidden'));
document.getElementById('add-bulk-btn').addEventListener('click', () => {
    const text = document.getElementById('bulk-input').value.trim();
    if (!text) return;
    const { added, skipped, defaults } = bulkParse(text, addPerson);
    document.getElementById('bulk-input').value = '';
    showBulkMsg('bulk-result-msg', added, skipped, defaults);
    setTimeout(() => { document.getElementById('bulk-result-msg').classList.add('hidden'); document.getElementById('bulk-area').classList.add('hidden'); }, 4000);
});

// BULK PARSER (gemeinsam) — Tag am Zeilenende: Geschlecht (m/w/d), optional gefolgt von s = sportlich, z.B. "Max ms"
function bulkParse(text, addFn) {
    const entries = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    let added = 0, skipped = 0, defaults = 0;
    entries.forEach(entry => {
        let gender = 'female', sporty = false, cleanName = entry, hadTag = false;
        const match = entry.match(/\s+\(?((?:[mwd]s?)|s)\)?$/i);
        if (match) {
            hadTag = true;
            const tag = match[1].toLowerCase();
            const g = tag[0];
            if (g === 'm') gender = 'male'; else if (g === 'd') gender = 'diverse';
            sporty = tag.endsWith('s');
            cleanName = entry.substring(0, match.index).trim();
        }
        cleanName = cleanName.replace(/[\s,:\-]+$/, '').trim();
        if (!cleanName) return;
        if (!hadTag) defaults++;
        if (addFn(cleanName, gender, sporty)) added++; else skipped++;
    });
    return { added, skipped, defaults };
}
function showBulkMsg(elId, added, skipped, defaults) {
    let msg = `${added} hinzugefügt.`;
    if (skipped  > 0) msg += ` ${skipped} übersprungen (Duplikate).`;
    if (defaults > 0) msg += ` ${defaults} ohne Angabe als "weiblich".`;
    const el = document.getElementById(elId); el.textContent = msg; el.classList.remove('hidden');
}

// TEAM-GENERIERUNG
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

document.getElementById('generate-btn').addEventListener('click', generateTeams);
document.getElementById('regenerate-btn').addEventListener('click', generateTeams);

function generateTeams() {
    const n = parseInt(document.getElementById('num-teams').value, 10);
    const balanceGender = document.getElementById('balance-gender').checked;
    const balanceSport = document.getElementById('balance-sport').checked;
    const errEl = document.getElementById('error-msg');
    errEl.classList.add('hidden');
    if (persons.length === 0) { errEl.textContent = 'Bitte füge zuerst Personen hinzu.'; errEl.classList.remove('hidden'); return; }
    if (isNaN(n) || n < 2)   { errEl.textContent = 'Mindestens 2 Teams erforderlich.';  errEl.classList.remove('hidden'); return; }
    if (n > persons.length)  { errEl.textContent = 'Mehr Teams als Teilnehmer.';         errEl.classList.remove('hidden'); return; }
    let teams = Array.from({ length: n }, () => []);
    const shuf = shuffleArray(persons);
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
        teams = teams.map(t => shuffleArray(t));
    } else {
        shuf.forEach((p, i) => teams[i % n].push(p));
    }
    renderTeams(teams);
}

function renderTeams(teams) {
    const container = document.getElementById('teams-container');
    container.innerHTML = '';
    const COLORS = ['bg-blue-500','bg-green-500','bg-red-500','bg-yellow-500','bg-purple-500','bg-pink-500','bg-indigo-500','bg-teal-500'];
    teams.forEach((team, i) => {
        const fC = team.filter(p => p.gender === 'female').length;
        const mC = team.filter(p => p.gender === 'male').length;
        const dC = team.filter(p => p.gender === 'diverse').length;
        const card = document.createElement('div');
        card.className = 'team-card bg-white rounded-xl shadow-md overflow-hidden border border-gray-200 flex flex-col fade-in';
        card.style.animationDelay = `${i * 0.08}s`;
        const header = document.createElement('div');
        header.className = `${COLORS[i % COLORS.length]} text-white p-4 flex justify-between items-center`;
        const titleEl = document.createElement('h3'); titleEl.className = 'font-bold text-lg'; titleEl.textContent = `Team ${i + 1}`;
        const badge = document.createElement('span'); badge.className = 'bg-white bg-opacity-20 rounded-full px-3 py-1 text-sm font-medium'; badge.textContent = `${team.length} ${team.length === 1 ? 'Person' : 'Personen'}`;
        header.appendChild(titleEl); header.appendChild(badge);
        const stats = document.createElement('div');
        stats.className = 'px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex text-xs text-gray-500 gap-3';
        [[fC,'fa-venus','text-pink-400','Weiblich'],[mC,'fa-mars','text-blue-400','Männlich'],[dC,'fa-genderless','text-purple-400','Divers']].forEach(([cnt,icon,color,lbl]) => {
            if (!cnt) return;
            const s = document.createElement('span'); s.title = `${cnt} ${lbl}`; s.innerHTML = `<i class="fas ${icon} ${color} mr-0.5"></i>${cnt}`; stats.appendChild(s);
        });
        const ul = document.createElement('ul'); ul.className = 'p-4 flex-grow space-y-1.5';
        team.forEach(p => {
            const li = document.createElement('li'); li.className = 'flex items-center gap-2 py-1 border-b border-gray-50 last:border-0';
            const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[sanitizeGender(p.gender)];
            const name = document.createElement('span'); name.className = 'text-gray-700 text-sm'; name.textContent = p.name;
            li.appendChild(icon); li.appendChild(name); ul.appendChild(li);
        });
        card.appendChild(header); card.appendChild(stats); card.appendChild(ul);
        container.appendChild(card);
    });
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('copy-teams-btn').addEventListener('click', async () => {
    const cards = document.querySelectorAll('.team-card');
    if (!cards.length) return;
    let text = 'Generierte Teams:\n\n';
    cards.forEach((card, i) => { text += `--- Team ${i+1} ---\n`; card.querySelectorAll('ul li span:last-child').forEach(s => text += `- ${s.textContent.trim()}\n`); text += '\n'; });
    const orig = document.getElementById('copy-teams-btn').innerHTML;
    try {
        await navigator.clipboard.writeText(text);
        document.getElementById('copy-teams-btn').innerHTML = '<i class="fas fa-check text-green-500 mr-1"></i> Kopiert!';
    } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0' });
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); document.getElementById('copy-teams-btn').innerHTML = '<i class="fas fa-check text-green-500 mr-1"></i> Kopiert!'; } catch {}
        document.body.removeChild(ta);
    }
    setTimeout(() => { document.getElementById('copy-teams-btn').innerHTML = orig; }, 2000);
});

// KOMPLETT-BACKUP (Klassen + Wochenpläne + Anwesenheitsdaten)
document.getElementById('backup-export-btn').addEventListener('click', () => {
    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        classes, classIdCounter, stuIdCounter,
        attendanceData
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `teamgenerator-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

const $backupFileInput = document.getElementById('backup-file-input');
document.getElementById('backup-import-btn').addEventListener('click', () => $backupFileInput.click());
$backupFileInput.addEventListener('change', () => {
    const file = $backupFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const result = validateBackup(data);
            if (!result) { alert('Ungültige Backup-Datei: Es wurde kein Komplett-Backup dieser App erkannt.'); return; }
            if (!confirm(`Backup vom ${result.exportedAt ? formatDateDisplay(result.exportedAt.slice(0,10)) : 'unbekannten Datum'} mit ${result.classes.length} Klasse(n) wiederherstellen? Alle aktuellen Klassen und Anwesenheitsdaten werden ersetzt.`)) return;
            classes = result.classes;
            classIdCounter = result.classIdCounter;
            stuIdCounter = result.stuIdCounter;
            attendanceData = result.attendanceData;
            activeClassId = null; selAttendClassId = null; currentSessionRecords = {};
            saveClasses(); saveAttendanceData();
            renderClassList(); renderClassDetail();
            document.getElementById('attendance-class-select').value = '';
            document.getElementById('attendance-empty').classList.remove('hidden');
            document.getElementById('attendance-content').classList.add('hidden');
            switchTab('classes');
            alert(`Backup wiederhergestellt: ${result.classes.length} Klasse(n).`);
        } catch (err) {
            alert('Backup konnte nicht gelesen werden (kein gültiges JSON).');
        }
        $backupFileInput.value = '';
    };
    reader.readAsText(file);
});

// Prüft und normalisiert eine Backup-Datei; gibt null zurück, wenn die Struktur nicht passt.
function validateBackup(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.classes)) return null;
    const cleanClasses = [];
    let maxClassId = 0, maxStuId = 0;
    for (const cls of data.classes) {
        if (!cls || typeof cls !== 'object') return null;
        const id = Number.isInteger(cls.id) && cls.id > 0 ? cls.id : null;
        const name = typeof cls.name === 'string' ? cls.name.trim() : '';
        if (id === null || !name) return null;
        const students = [];
        for (const s of (Array.isArray(cls.students) ? cls.students : [])) {
            if (!s || typeof s !== 'object' || !Number.isInteger(s.id) || typeof s.name !== 'string' || !s.name.trim()) continue;
            students.push({ id: s.id, name: s.name.trim(), gender: sanitizeGender(s.gender), sporty: s.sporty === true });
            if (s.id > maxStuId) maxStuId = s.id;
        }
        const schedule = (Array.isArray(cls.schedule) ? cls.schedule : [])
            .filter(e => e && Number.isInteger(e.weekday) && e.weekday >= 0 && e.weekday <= 6 && typeof e.time === 'string' && TIME_RE.test(e.time))
            .map(e => ({ weekday: e.weekday, time: e.time }));
        cleanClasses.push({ id, name, students, schedule });
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
    return {
        classes: cleanClasses,
        classIdCounter: Math.max(Number.isInteger(data.classIdCounter) ? data.classIdCounter : 1, maxClassId + 1),
        stuIdCounter: Math.max(Number.isInteger(data.stuIdCounter) ? data.stuIdCounter : 1, maxStuId + 1),
        attendanceData: cleanAttendance,
        exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null
    };
}

// INIT
loadStorage(); renderClassList(); renderClassDetail(); renderPersonList(); switchTab('classes');
