// app.js — DOM/State der App. Reine Logik (Parser, Validierung, Team-Verteilung) liegt in core.js (window.TG).
const {
    WEEKDAYS, WEEKDAYS_FULL, REASON_CATEGORIES, TIME_RE,
    sanitizeGender, todayStr, getWeekdayIndex, getSemester, formatDateDisplay,
    bulkParse, parseCsvImport, parseAttendanceCsv, escapeCsv, pointsToGrade, computePointsTotal,
    distributeTeams, enforceApart, validateBackup
} = window.TG;

// STATE
let classes = [], classIdCounter = 1, stuIdCounter = 1;
let activeClassId = null, selAttendClassId = null;
let persons = [], personIdCounter = 1;
// personsManual: true, wenn die Teilnehmerliste von Hand gepflegt wurde (dann vor Überschreiben warnen)
let personsManual = false;
// apartPairs: [["Anna","Max"], ...] — Paare, die nicht ins gleiche Team sollen (Namensvergleich case-insensitiv)
let apartPairs = [];
// attendanceData: { [classId]: { [dateStr]: { date, weekday, records: { [studentId]: {status, reasonCategory, note} } } } }
let attendanceData = {};
// currentSessionRecords: { [studentId]: {status:'present'|'absent', reasonCategory:'', note:''} } für Klasse/Datum im Anwesenheits-Tab
let currentSessionRecords = {};
let attendanceDirty = false;
let statsSort = { key: 'name', dir: 1 };
// exams: { [classId]: [ { id, title, date, mode:'points'|'grades', maxPoints, results:{ [studentId]: Zahl } } ] }
let exams = {}, examIdCounter = 1;
let selExamClassId = null, selExamId = null, examDirty = false;
// pointsData: { [classId]: { goals: [{id,text,points}], entries: [{id,type:'lektion'|'reset',date,goalIds,note,points}] } }
let pointsData = {}, pointsIdCounter = 1;
let selPointsClassId = null;

const GENDER_ICONS = {
    female:  '<i class="fas fa-venus text-pink-500" title="Weiblich" aria-hidden="true"></i><span class="sr-only">weiblich</span>',
    male:    '<i class="fas fa-mars text-blue-500" title="Männlich" aria-hidden="true"></i><span class="sr-only">männlich</span>',
    diverse: '<i class="fas fa-genderless text-purple-500" title="Divers" aria-hidden="true"></i><span class="sr-only">divers</span>'
};
function genderIconEl(g) { const span = document.createElement('span'); span.innerHTML = GENDER_ICONS[sanitizeGender(g)]; return span; }

// STORAGE
let storageWarned = false;
function storageWarn() {
    if (storageWarned) return;
    storageWarned = true;
    const el = document.getElementById('storage-warning');
    el.classList.remove('hidden');
}
document.getElementById('storage-warning-close').addEventListener('click', () => document.getElementById('storage-warning').classList.add('hidden'));

function saveClasses() {
    try { localStorage.setItem('tg2_classes', JSON.stringify(classes)); localStorage.setItem('tg2_classId', String(classIdCounter)); localStorage.setItem('tg2_stuId', String(stuIdCounter)); } catch(e) { storageWarn(); }
    scheduleDataFileWrite();
}
function savePersons() {
    try { localStorage.setItem('tg2_persons', JSON.stringify(persons)); localStorage.setItem('tg2_personId', String(personIdCounter)); localStorage.setItem('tg2_personsManual', personsManual ? '1' : '0'); } catch(e) { storageWarn(); }
    scheduleDataFileWrite();
}
function saveAttendanceData() {
    try { localStorage.setItem('tg2_attendance', JSON.stringify(attendanceData)); } catch(e) { storageWarn(); }
    scheduleDataFileWrite();
}
function saveApartPairs() {
    try { localStorage.setItem('tg2_apart', JSON.stringify(apartPairs)); } catch(e) { storageWarn(); }
    scheduleDataFileWrite();
}
function saveExams() {
    try { localStorage.setItem('tg2_exams', JSON.stringify(exams)); localStorage.setItem('tg2_examId', String(examIdCounter)); } catch(e) { storageWarn(); }
    scheduleDataFileWrite();
}
function savePointsData() {
    try { localStorage.setItem('tg2_points', JSON.stringify(pointsData)); localStorage.setItem('tg2_pointsId', String(pointsIdCounter)); } catch(e) { storageWarn(); }
    scheduleDataFileWrite();
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
                    if (!Array.isArray(cls.formerStudents)) cls.formerStudents = [];
                    if (!Array.isArray(cls.schedule)) cls.schedule = [];
                    cls.students.forEach(s => { s.gender = sanitizeGender(s.gender); s.sporty = s.sporty === true; s.classTag = typeof s.classTag === 'string' ? s.classTag.slice(0, 20).trim() : ''; });
                    cls.formerStudents.forEach(s => { s.gender = sanitizeGender(s.gender); s.sporty = s.sporty === true; s.classTag = typeof s.classTag === 'string' ? s.classTag.slice(0, 20).trim() : ''; });
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
        personsManual = localStorage.getItem('tg2_personsManual') === '1';
        const a = localStorage.getItem('tg2_attendance');
        if (a) {
            const parsed = JSON.parse(a);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) attendanceData = parsed;
        }
        const ap = localStorage.getItem('tg2_apart');
        if (ap) {
            const parsed = JSON.parse(ap);
            if (Array.isArray(parsed)) apartPairs = parsed.filter(x => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string');
        }
        const ex = localStorage.getItem('tg2_exams');
        if (ex) {
            const parsed = JSON.parse(ex);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) exams = parsed;
            examIdCounter = parseInt(localStorage.getItem('tg2_examId')||'1',10) || 1;
        }
        const pts = localStorage.getItem('tg2_points');
        if (pts) {
            const parsed = JSON.parse(pts);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) pointsData = parsed;
            pointsIdCounter = parseInt(localStorage.getItem('tg2_pointsId')||'1',10) || 1;
        }
    } catch(e) {}
}

// MODAL-DIALOGE (ersetzen alert/confirm/prompt)
const $modalOverlay = document.getElementById('modal-overlay');
const $modalTitle   = document.getElementById('modal-title');
const $modalMessage = document.getElementById('modal-message');
const $modalInput   = document.getElementById('modal-input');
const $modalHint    = document.getElementById('modal-input-hint');
const $modalOk      = document.getElementById('modal-ok');
const $modalCancel  = document.getElementById('modal-cancel');
let modalResolve = null, modalHasInput = false, modalPrevFocus = null;

function showModal({ title = '', message = '', input = false, inputType = 'text', value = '', placeholder = '', hint = '', okLabel = 'OK', cancelLabel = null, danger = false }) {
    return new Promise(resolve => {
        modalResolve = resolve; modalHasInput = input;
        modalPrevFocus = document.activeElement;
        $modalTitle.textContent = title;
        $modalTitle.classList.toggle('hidden', !title);
        $modalMessage.textContent = message;
        $modalInput.classList.toggle('hidden', !input);
        $modalHint.classList.toggle('hidden', !hint);
        $modalHint.textContent = hint;
        if (input) { $modalInput.type = inputType; $modalInput.value = value; $modalInput.placeholder = placeholder; }
        $modalOk.textContent = okLabel;
        $modalOk.className = danger
            ? 'px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 font-medium'
            : 'px-4 py-2 text-sm rounded-md text-white bg-indigo-600 hover:bg-indigo-700 font-medium';
        $modalCancel.textContent = cancelLabel || 'Abbrechen';
        $modalCancel.classList.toggle('hidden', cancelLabel === null && !input);
        $modalOverlay.classList.remove('hidden');
        (input ? $modalInput : $modalOk).focus();
        if (input) $modalInput.select();
    });
}
function closeModal(result) {
    if (!modalResolve) return;
    $modalOverlay.classList.add('hidden');
    const resolve = modalResolve; modalResolve = null;
    if (modalPrevFocus && typeof modalPrevFocus.focus === 'function') modalPrevFocus.focus();
    resolve(result);
}
$modalOk.addEventListener('click', () => closeModal(modalHasInput ? $modalInput.value : true));
$modalCancel.addEventListener('click', () => closeModal(modalHasInput ? null : false));
$modalOverlay.addEventListener('mousedown', e => { if (e.target === $modalOverlay) closeModal(modalHasInput ? null : false); });
document.addEventListener('keydown', e => {
    if ($modalOverlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(modalHasInput ? null : false); }
    if (e.key === 'Enter' && document.activeElement !== $modalCancel) { e.preventDefault(); closeModal(modalHasInput ? $modalInput.value : true); }
});
const uiAlert   = (message, title = '') => showModal({ title, message });
const uiConfirm = (message, opts = {}) => showModal({ message, cancelLabel: 'Abbrechen', ...opts });
const uiPrompt  = (message, opts = {}) => showModal({ message, input: true, cancelLabel: 'Abbrechen', ...opts });

// TOASTS + UNDO
function showToast(message, { undo = null, duration = 6000 } = {}) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast bg-gray-900 text-white text-sm rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-3 fade-in';
    toast.setAttribute('role', 'status');
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    let removed = false;
    const remove = () => { if (removed) return; removed = true; toast.remove(); };
    if (undo) {
        const btn = document.createElement('button');
        btn.className = 'text-indigo-300 hover:text-indigo-100 font-semibold flex-shrink-0';
        btn.textContent = 'Rückgängig';
        btn.addEventListener('click', () => { remove(); undo(); });
        toast.appendChild(btn);
    }
    container.appendChild(toast);
    setTimeout(remove, duration);
}
function snapshotState() {
    return {
        classes: structuredClone(classes),
        attendanceData: structuredClone(attendanceData),
        persons: structuredClone(persons),
        exams: structuredClone(exams),
        pointsData: structuredClone(pointsData),
        classIdCounter, stuIdCounter, personIdCounter, examIdCounter, pointsIdCounter,
        activeClassId, selAttendClassId, personsManual
    };
}
function restoreState(snap) {
    classes = snap.classes; attendanceData = snap.attendanceData; persons = snap.persons;
    exams = snap.exams; pointsData = snap.pointsData;
    classIdCounter = snap.classIdCounter; stuIdCounter = snap.stuIdCounter; personIdCounter = snap.personIdCounter;
    examIdCounter = snap.examIdCounter; pointsIdCounter = snap.pointsIdCounter;
    activeClassId = snap.activeClassId; selAttendClassId = snap.selAttendClassId; personsManual = snap.personsManual;
    saveClasses(); saveAttendanceData(); savePersons(); saveExams(); savePointsData();
    renderClassList(); renderClassDetail(); renderPersonList();
    refreshAttendanceSelect(); refreshStatsSelect();
    const attSel = document.getElementById('attendance-class-select');
    if (selAttendClassId !== null && classes.find(c => c.id === selAttendClassId)) {
        attSel.value = String(selAttendClassId);
        document.getElementById('attendance-empty').classList.add('hidden');
        document.getElementById('attendance-content').classList.remove('hidden');
        loadAttendanceSession();
    } else {
        attSel.value = '';
        document.getElementById('attendance-empty').classList.remove('hidden');
        document.getElementById('attendance-content').classList.add('hidden');
    }
    renderStats();
}
// Führt eine destruktive Änderung aus und bietet danach "Rückgängig" per Toast an.
function withUndo(message, mutate) {
    const snap = snapshotState();
    mutate();
    showToast(message, { undo: () => restoreState(snap) });
}

// TABS
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
tabButtons.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
tabButtons.forEach((btn, i) => btn.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = tabButtons[(i + dir + tabButtons.length) % tabButtons.length];
    next.focus(); switchTab(next.dataset.tab);
}));
function switchTab(tab) {
    ['classes','attendance','stats','exams','points','teams'].forEach(t => document.getElementById('tab-'+t).classList.toggle('hidden', t !== tab));
    tabButtons.forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
    if (tab === 'attendance') refreshAttendanceSelect();
    if (tab === 'stats') refreshStatsSelect();
    if (tab === 'exams') refreshExamsSelect();
    if (tab === 'points') refreshPointsSelect();
    if (tab === 'teams') renderPersonList();
}

// WOCHENPLAN (gemeinsame Helfer für Klassen-Formular & Detailansicht)
function createScheduleRow(container, entry) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 schedule-row';
    const sel = document.createElement('select');
    sel.className = 'schedule-weekday border rounded-md p-1.5 text-xs bg-white focus:border-indigo-500 focus:outline-none';
    sel.setAttribute('aria-label', 'Wochentag');
    sel.innerHTML = '<option value="">Tag</option>' + WEEKDAYS.map((w, i) => `<option value="${i}">${w}</option>`).join('');
    if (entry && entry.weekday !== undefined && entry.weekday !== null) sel.value = String(entry.weekday);
    const time = document.createElement('input');
    time.type = 'time';
    time.setAttribute('aria-label', 'Uhrzeit');
    time.className = 'schedule-time border rounded-md p-1.5 text-xs flex-1 focus:border-indigo-500 focus:outline-none';
    if (entry && entry.time) time.value = entry.time;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'text-gray-300 hover:text-red-500 px-1';
    rm.innerHTML = '<i class="fas fa-times text-xs" aria-hidden="true"></i>';
    rm.setAttribute('aria-label', 'Termin entfernen');
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
    document.getElementById('new-class-points-input').checked = false;
}

// Standard-Ziele des Punkte-Trackers (aus der Sport-Praxis; jederzeit anpassbar).
const DEFAULT_POINT_GOALS = [
    ['Alle starten sofort / gute Startphase', 1],
    ['Aktives Mitmachen der Mehrheit', 2],
    ['Fairplay, respektvolle Kommunikation', 2],
    ['Gute Zusammenarbeit / helfen / motivieren', 2],
    ['Material schnell und sauber verräumt', 1],
    ['Exzellentes Verhalten / über Erwartung', 2]
];
function seedPointGoals(classId) {
    if (pointsData[classId] && pointsData[classId].goals && pointsData[classId].goals.length) return;
    pointsData[classId] = pointsData[classId] || { goals: [], entries: [] };
    pointsData[classId].goals = DEFAULT_POINT_GOALS.map(([text, points]) => ({ id: pointsIdCounter++, text, points }));
    savePointsData();
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
    const collectsPoints = document.getElementById('new-class-points-input').checked;
    const newId = classIdCounter++;
    classes.push({ id: newId, name, students: [], formerStudents: [], schedule, collectsPoints });
    if (collectsPoints) seedPointGoals(newId);
    saveClasses();
    // Frischer Start nach dem Anlegen, damit alle Auswahllisten (Anwesenheit,
    // Auswertung, Teams) die neue Klasse sicher kennen; die neue Klasse wird
    // nach dem Reload wieder ausgewählt.
    try { sessionStorage.setItem('tg2_selectClassAfterReload', String(newId)); } catch (e) {}
    flushAndReload();
}

function renderClassList() {
    const list = document.getElementById('class-list');
    list.innerHTML = '';
    if (classes.length === 0) {
        const noMsg = document.createElement('li');
        noMsg.id = 'no-classes-msg';
        noMsg.className = 'text-center text-gray-400 text-sm py-10';
        noMsg.innerHTML = '<i class="fas fa-graduation-cap text-3xl mb-2 opacity-30 block" aria-hidden="true"></i>Noch keine Klassen angelegt.';
        list.appendChild(noMsg);
        return;
    }
    classes.forEach(cls => {
        const isActive = cls.id === activeClassId;
        const li = document.createElement('li');
        li.className = `flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'}`;
        const left = document.createElement('button');
        left.type = 'button';
        left.className = 'flex items-center gap-2 flex-1 min-w-0 text-left';
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
            btn.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
            btn.title = title;
            btn.setAttribute('aria-label', `Klasse "${cls.name}" ${title.toLowerCase()}`);
            btn.addEventListener('click', e => { e.stopPropagation(); fn(); });
            actions.appendChild(btn);
        });
        li.appendChild(left); li.appendChild(actions);
        list.appendChild(li);
    });
}

function selectClass(id) { activeClassId = id; renderClassList(); renderClassDetail(); }

async function renameClass(id) {
    const cls = classes.find(c => c.id === id);
    if (!cls) return;
    const n = await uiPrompt('Neuer Klassenname:', { title: 'Klasse umbenennen', value: cls.name });
    if (!n || !n.trim()) return;
    const t = n.trim();
    if (classes.find(c => c.id !== id && c.name.toLowerCase() === t.toLowerCase())) { await uiAlert(`Eine Klasse "${t}" existiert bereits.`); return; }
    cls.name = t; saveClasses(); renderClassList(); renderClassDetail();
}

async function deleteClass(id) {
    const cls = classes.find(c => c.id === id);
    if (!cls) return;
    const ok = await uiConfirm(`Klasse "${cls.name}" wirklich löschen? Damit werden auch alle erfassten Anwesenheiten dieser Klasse gelöscht.`, { title: 'Klasse löschen', okLabel: 'Löschen', danger: true });
    if (!ok) return;
    withUndo(`Klasse "${cls.name}" gelöscht.`, () => {
        classes = classes.filter(c => c.id !== id);
        if (activeClassId === id) activeClassId = null;
        if (selAttendClassId === id) { selAttendClassId = null; currentSessionRecords = {}; attendanceDirty = false; updateDirtyHint(); }
        delete attendanceData[id];
        delete exams[id];
        delete pointsData[id];
        if (selPointsClassId === id) selPointsClassId = null;
        saveExams(); savePointsData();
        saveClasses(); saveAttendanceData(); renderClassList(); renderClassDetail();
    });
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
    renderPointsToggle(cls);
    renderScheduleDisplayBadges(cls);
    renderStudentList(cls);
}

function renderPointsToggle(cls) {
    const btn = document.getElementById('toggle-points-btn');
    const on = cls.collectsPoints === true;
    btn.textContent = on ? 'Aktiv' : 'Inaktiv';
    btn.className = `text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${on ? 'bg-amber-400 text-white hover:bg-amber-500' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`;
    btn.title = on ? 'Punkte-Tracker deaktivieren' : 'Punkte-Tracker aktivieren';
    btn.setAttribute('aria-pressed', String(on));
}
document.getElementById('toggle-points-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    cls.collectsPoints = cls.collectsPoints !== true;
    if (cls.collectsPoints) seedPointGoals(cls.id);
    saveClasses();
    renderPointsToggle(cls);
});

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

document.getElementById('add-student-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('student-name-input').value.trim();
    const gender = document.querySelector('input[name="student-gender"]:checked').value;
    const sporty = document.getElementById('student-sporty-input').checked;
    if (!name || !activeClassId) return;
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    if (cls.students.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        // Zwei Kinder mit gleichem Vornamen sind real möglich — nachfragen statt blockieren.
        const ok = await uiConfirm(`"${name}" ist bereits in dieser Klasse. Trotzdem hinzufügen (z.B. zweites Kind mit gleichem Namen)? Tipp: Mit Initial unterscheiden, z.B. "${name} M".`, { title: 'Doppelter Name', okLabel: 'Trotzdem hinzufügen' });
        if (!ok) return;
    }
    const classTag = document.getElementById('student-classtag-input').value.trim().slice(0, 20);
    cls.students.push({ id: stuIdCounter++, name, gender, sporty, classTag });
    saveClasses();
    document.getElementById('student-name-input').value = '';
    document.getElementById('student-sporty-input').checked = false;
    renderClassDetail();
    document.getElementById('student-name-input').focus();
});

// Hat der/die Schüler(in) erfasste Anwesenheiten? Dann beim Entfernen als "ehemalig"
// archivieren, damit die Auswertung die Historie behalten kann.
function studentHasAttendance(clsId, studentId) {
    const sessions = attendanceData[clsId];
    if (!sessions) return false;
    return Object.values(sessions).some(session => session.records && session.records[studentId]);
}
function removeStudent(studentId) {
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;
    withUndo(`"${student.name}" entfernt.`, () => {
        cls.students = cls.students.filter(s => s.id !== studentId);
        if (studentHasAttendance(cls.id, studentId)) {
            if (!Array.isArray(cls.formerStudents)) cls.formerStudents = [];
            cls.formerStudents.push({ id: student.id, name: student.name, gender: student.gender, sporty: student.sporty === true, classTag: student.classTag || '' });
        }
        saveClasses(); renderClassDetail();
    });
}

function renderStudentList(cls) {
    const ul = document.getElementById('student-list');
    ul.innerHTML = '';
    if (cls.students.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-center text-gray-400 text-sm py-8';
        li.innerHTML = '<i class="fas fa-user-plus text-2xl mb-2 opacity-30 block" aria-hidden="true"></i>Noch keine Schüler eingetragen.';
        ul.appendChild(li); return;
    }
    cls.students.forEach(s => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between bg-white p-2 rounded-lg border border-gray-100 shadow-sm fade-in';
        const left = document.createElement('div'); left.className = 'flex items-center gap-2 min-w-0';
        const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[sanitizeGender(s.gender)];
        const nameSpan = document.createElement('span'); nameSpan.className = 'text-sm text-gray-700 truncate'; nameSpan.textContent = s.name;
        left.appendChild(icon); left.appendChild(nameSpan);
        if (s.classTag) {
            const tagBadge = document.createElement('span');
            tagBadge.className = 'text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded-full flex-shrink-0';
            tagBadge.textContent = s.classTag;
            left.appendChild(tagBadge);
        }
        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-0.5 flex-shrink-0';
        const tagBtn = document.createElement('button');
        tagBtn.className = 'text-gray-200 hover:text-sky-500 text-xs p-1 transition-colors';
        tagBtn.innerHTML = '<i class="fas fa-tag" aria-hidden="true"></i>';
        tagBtn.title = s.classTag ? `Klassenkürzel "${s.classTag}" ändern` : 'Klassenkürzel setzen';
        tagBtn.setAttribute('aria-label', `Klassenkürzel von ${s.name} bearbeiten`);
        tagBtn.addEventListener('click', async () => {
            const val = await uiPrompt(`Klassenkürzel für "${s.name}" (leer = entfernen):`, { title: 'Klassenkürzel', placeholder: 'z.B. 7a', value: s.classTag || '' });
            if (val === null) return;
            s.classTag = val.trim().slice(0, 20);
            saveClasses(); renderStudentList(cls);
        });
        const sportyBtn = document.createElement('button');
        sportyBtn.className = `text-xs p-1 rounded transition-colors ${s.sporty ? 'text-emerald-500 hover:text-emerald-700' : 'text-gray-200 hover:text-emerald-400'}`;
        sportyBtn.innerHTML = '<i class="fas fa-person-running" aria-hidden="true"></i>';
        sportyBtn.title = s.sporty ? 'Sportlich (klicken zum Ändern)' : 'Nicht sportlich (klicken zum Ändern)';
        sportyBtn.setAttribute('aria-label', `${s.name}: ${s.sporty ? 'sportlich' : 'nicht sportlich'} — umschalten`);
        sportyBtn.setAttribute('aria-pressed', String(s.sporty === true));
        sportyBtn.addEventListener('click', () => { s.sporty = !s.sporty; saveClasses(); renderStudentList(cls); });
        const delBtn = document.createElement('button');
        delBtn.className = 'text-gray-200 hover:text-red-500 text-xs p-1 transition-colors';
        delBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        delBtn.title = 'Schüler(in) entfernen';
        delBtn.setAttribute('aria-label', `${s.name} entfernen`);
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
    const { added, skipped, defaults } = bulkParse(text, (name, gender, sporty, classTag) => {
        if (cls.students.find(s => s.name.toLowerCase() === name.toLowerCase())) return false;
        cls.students.push({ id: stuIdCounter++, name, gender, sporty, classTag: classTag || '' }); return true;
    });
    saveClasses(); document.getElementById('class-bulk-input').value = '';
    showBulkMsg('class-bulk-msg', added, skipped, defaults);
    setTimeout(() => document.getElementById('class-bulk-area').classList.add('hidden'), 4000);
    renderClassDetail();
});

// KLASSEN IMPORT / EXPORT
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Umlaute/Akzente für Dateinamen transliterieren — Chromium ersetzt Download-Namen
// mit Nicht-ASCII-Zeichen sonst teils durch ein generisches "download".
function safeFilePart(str, maxLen = 40) {
    return String(str)
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, maxLen) || 'export';
}

document.getElementById('export-classes-btn').addEventListener('click', async () => {
    if (classes.length === 0) { await uiAlert('Keine Klassen zum Exportieren vorhanden.'); return; }
    const data = classes.map(c => ({ name: c.name, schedule: c.schedule || [], students: c.students.map(s => ({ name: s.name, gender: s.gender, sporty: s.sporty === true, classTag: s.classTag || '' })) }));
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `klassen-export-${todayStr()}.json`);
});

document.getElementById('import-format-help-btn').addEventListener('click', () => document.getElementById('import-format-help').classList.toggle('hidden'));

const $importFileInput = document.getElementById('import-file-input');
document.getElementById('import-classes-btn').addEventListener('click', () => $importFileInput.click());
$importFileInput.addEventListener('change', () => {
    const file = $importFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
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
                        cls = { id: classIdCounter++, name, students: [], formerStudents: [], schedule }; classes.push(cls); imported++;
                    }
                    (entry.students || []).forEach(s => {
                        const sName = (typeof s === 'string' ? s : s.name || '').trim();
                        if (!sName) return;
                        if (cls.students.find(st => st.name.toLowerCase() === sName.toLowerCase())) return;
                        const gender = (typeof s === 'object' && (s.gender === 'female' || s.gender === 'male' || s.gender === 'diverse')) ? s.gender : 'female';
                        const sporty = typeof s === 'object' && s.sporty === true;
                        const classTag = (typeof s === 'object' && typeof s.classTag === 'string') ? s.classTag.slice(0, 20).trim() : '';
                        cls.students.push({ id: stuIdCounter++, name: sName, gender, sporty, classTag });
                        importedStudents++;
                    });
                });
            } else {
                parseCsvImport(reader.result).forEach(row => {
                    let cls = classes.find(c => c.name.toLowerCase() === row.className.toLowerCase());
                    if (!cls) { cls = { id: classIdCounter++, name: row.className, students: [], formerStudents: [], schedule: [] }; classes.push(cls); imported++; }
                    if (cls.students.find(st => st.name.toLowerCase() === row.studentName.toLowerCase())) return;
                    cls.students.push({ id: stuIdCounter++, name: row.studentName, gender: row.gender, sporty: row.sporty, classTag: row.classTag || '' });
                    importedStudents++;
                });
            }
            saveClasses();
            await uiAlert(`Import abgeschlossen: ${imported} neue Klasse(n), ${importedStudents} Schüler(innen) hinzugefügt. Die Seite wird neu geladen.`, 'Import');
            await flushAndReload();
        } catch (err) {
            await uiAlert('Import fehlgeschlagen: Datei konnte nicht gelesen werden. Bitte ein gültiges JSON (Klassenexport) oder eine CSV mit "Klasse;Name;Geschlecht" verwenden.', 'Import');
        }
        $importFileInput.value = '';
    };
    reader.readAsText(file);
});

// TAB 2: ANWESENHEIT
const $attendanceSelect = document.getElementById('attendance-class-select');
const $attendanceDate = document.getElementById('attendance-date-input');
let lastAttendanceSelectValue = '';
let lastAttendanceDate = '';

function updateDirtyHint() {
    document.getElementById('attendance-dirty-hint').classList.toggle('hidden', !attendanceDirty);
}
function markAttendanceDirty() {
    attendanceDirty = true;
    updateDirtyHint();
}
async function confirmDiscardAttendance() {
    if (!attendanceDirty) return true;
    const ok = await uiConfirm('Die Anwesenheit für den aktuellen Termin wurde noch nicht gespeichert. Änderungen verwerfen?', { title: 'Ungespeicherte Änderungen', okLabel: 'Verwerfen', danger: true });
    if (ok) { attendanceDirty = false; updateDirtyHint(); }
    return ok;
}
window.addEventListener('beforeunload', e => {
    if (attendanceDirty || examDirty) { e.preventDefault(); e.returnValue = ''; }
});

function refreshAttendanceSelect() {
    const sel = $attendanceSelect;
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- Klasse wählen --</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = String(cls.id); opt.textContent = `${cls.name} (${cls.students.length} SuS)`;
        sel.appendChild(opt);
    });
    if (prev && classes.find(c => String(c.id) === prev)) sel.value = prev;
    lastAttendanceSelectValue = sel.value;
    if (!$attendanceDate.value) $attendanceDate.value = todayStr();
    lastAttendanceDate = $attendanceDate.value;
}

$attendanceSelect.addEventListener('change', async function() {
    if (!(await confirmDiscardAttendance())) { this.value = lastAttendanceSelectValue; return; }
    lastAttendanceSelectValue = this.value;
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

$attendanceDate.addEventListener('change', async function() {
    if (selAttendClassId === null) { lastAttendanceDate = this.value; return; }
    if (!(await confirmDiscardAttendance())) { this.value = lastAttendanceDate; return; }
    loadAttendanceSession();
});

function loadAttendanceSession() {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const dateStr = $attendanceDate.value || todayStr();
    $attendanceDate.value = dateStr;
    lastAttendanceDate = dateStr;
    const existing = attendanceData[cls.id] && attendanceData[cls.id][dateStr];
    currentSessionRecords = {};
    cls.students.forEach(s => {
        const rec = existing && existing.records[s.id];
        currentSessionRecords[s.id] = rec ? { status: rec.status, reasonCategory: rec.reasonCategory || '', note: rec.note || '' } : { status: 'present', reasonCategory: '', note: '' };
    });
    attendanceDirty = false; updateDirtyHint();
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
    markAttendanceDirty(); renderAttendanceGrid();
});
document.getElementById('all-absent-btn').addEventListener('click', () => {
    Object.keys(currentSessionRecords).forEach(id => { currentSessionRecords[id].status = 'absent'; });
    markAttendanceDirty(); renderAttendanceGrid();
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
        const topRow = document.createElement('button');
        topRow.type = 'button';
        topRow.className = 'flex items-center gap-3 cursor-pointer w-full text-left';
        topRow.setAttribute('aria-pressed', String(present));
        topRow.setAttribute('aria-label', `${s.name}: ${present ? 'anwesend' : 'abwesend'} — klicken zum Umschalten`);
        topRow.addEventListener('click', () => { rec.status = present ? 'absent' : 'present'; markAttendanceDirty(); renderAttendanceGrid(); });
        const checkbox = document.createElement('div');
        checkbox.className = `w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${present ? 'bg-green-500 border-green-500' : 'bg-red-400 border-red-400'}`;
        checkbox.innerHTML = present ? '<i class="fas fa-check text-white text-xs" aria-hidden="true"></i>' : '<i class="fas fa-times text-white text-xs" aria-hidden="true"></i>';
        const iconSpan = document.createElement('span'); iconSpan.innerHTML = GENDER_ICONS[sanitizeGender(s.gender)];
        const nameSpan = document.createElement('span'); nameSpan.className = 'font-medium text-sm flex-1 truncate'; nameSpan.textContent = s.name;
        topRow.appendChild(checkbox); topRow.appendChild(iconSpan); topRow.appendChild(nameSpan);
        card.appendChild(topRow);
        if (!present) {
            const reasonRow = document.createElement('div');
            reasonRow.className = 'flex flex-col sm:flex-row gap-1.5 mt-2 pt-2 border-t border-red-200';
            const sel = document.createElement('select');
            sel.className = 'text-xs border border-red-200 rounded-md p-1.5 bg-white focus:outline-none focus:border-red-400';
            sel.setAttribute('aria-label', `Abwesenheitsgrund für ${s.name}`);
            sel.innerHTML = '<option value="">Grund wählen…</option>' + REASON_CATEGORIES.map(r => `<option value="${r}">${r}</option>`).join('');
            sel.value = rec.reasonCategory || '';
            sel.addEventListener('click', e => e.stopPropagation());
            sel.addEventListener('change', e => { rec.reasonCategory = e.target.value; markAttendanceDirty(); });
            const note = document.createElement('input');
            note.type = 'text'; note.placeholder = 'Notiz (optional)'; note.value = rec.note || '';
            note.setAttribute('aria-label', `Notiz zur Abwesenheit von ${s.name}`);
            note.className = 'text-xs border border-red-200 rounded-md p-1.5 flex-1 focus:outline-none focus:border-red-400';
            note.addEventListener('click', e => e.stopPropagation());
            note.addEventListener('input', e => { rec.note = e.target.value; markAttendanceDirty(); });
            reasonRow.appendChild(sel); reasonRow.appendChild(note);
            card.appendChild(reasonRow);
        }
        grid.appendChild(card);
    });
}

document.getElementById('save-attendance-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const dateStr = $attendanceDate.value || todayStr();
    if (!attendanceData[cls.id]) attendanceData[cls.id] = {};
    const records = {};
    Object.keys(currentSessionRecords).forEach(id => { records[id] = { ...currentSessionRecords[id] }; });
    attendanceData[cls.id][dateStr] = { date: dateStr, weekday: getWeekdayIndex(dateStr), records };
    saveAttendanceData();
    attendanceDirty = false; updateDirtyHint();
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
        left.setAttribute('aria-label', `Termin vom ${formatDateDisplay(session.date)} öffnen`);
        [[ 'font-medium', formatDateDisplay(session.date) ],
         [ 'text-xs text-gray-400', WEEKDAYS[session.weekday] || '' ],
         [ 'text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full', `Sem. ${getSemester(session.date)}` ],
         [ 'text-xs text-gray-400', `· ${presentN}/${totalN} anwesend` ]].forEach(([cls2, txt]) => {
            const sp = document.createElement('span'); sp.className = cls2; sp.textContent = txt; left.appendChild(sp);
        });
        left.addEventListener('click', async () => {
            if (!(await confirmDiscardAttendance())) return;
            $attendanceDate.value = session.date;
            loadAttendanceSession();
        });
        const delBtn = document.createElement('button');
        delBtn.className = 'text-gray-300 hover:text-red-500 text-xs p-1';
        delBtn.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
        delBtn.setAttribute('aria-label', `Termin vom ${formatDateDisplay(session.date)} löschen`);
        delBtn.addEventListener('click', () => {
            withUndo(`Termin vom ${formatDateDisplay(session.date)} gelöscht.`, () => {
                delete attendanceData[cls.id][session.date];
                saveAttendanceData();
                if ($attendanceDate.value === session.date) loadAttendanceSession();
                else renderAttendanceSessionsList(cls);
            });
        });
        li.appendChild(left); li.appendChild(delBtn);
        list.appendChild(li);
    });
}

// TERMIN-IMPORT (CSV aus Excel): vergangene Anwesenheitschecks in die gewählte Klasse übernehmen.
document.getElementById('attendance-import-help-btn').addEventListener('click', () => document.getElementById('attendance-import-help').classList.toggle('hidden'));
const $attendanceImportInput = document.getElementById('attendance-import-input');
document.getElementById('attendance-import-btn').addEventListener('click', async () => {
    if (selAttendClassId === null) { await uiAlert('Bitte zuerst oben eine Klasse auswählen — die Termine werden in diese Klasse importiert.', 'Termin-Import'); return; }
    $attendanceImportInput.click();
});
$attendanceImportInput.addEventListener('change', () => {
    const file = $attendanceImportInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        $attendanceImportInput.value = '';
        const cls = classes.find(c => c.id === selAttendClassId);
        if (!cls) return;
        const { rows, invalid } = parseAttendanceCsv(String(reader.result));
        if (rows.length === 0) {
            await uiAlert('Keine gültigen Zeilen gefunden. Erwartetes Format: "Datum;Name;Status;Grund;Notiz" — siehe Fragezeichen-Hilfe neben dem Import-Knopf.', 'Termin-Import');
            return;
        }
        // Namen der Klasse (inkl. ehemaliger Schüler) case-insensitiv nachschlagen.
        const byName = new Map();
        cls.students.concat(cls.formerStudents || []).forEach(s => byName.set(s.name.trim().toLowerCase(), s));
        let importedRecords = 0;
        const dates = new Set(), unknown = new Set();
        if (!attendanceData[cls.id]) attendanceData[cls.id] = {};
        rows.forEach(row => {
            const student = byName.get(row.name.trim().toLowerCase());
            if (!student) { unknown.add(row.name); return; }
            if (!attendanceData[cls.id][row.date]) {
                attendanceData[cls.id][row.date] = { date: row.date, weekday: getWeekdayIndex(row.date), records: {} };
            }
            attendanceData[cls.id][row.date].records[student.id] = {
                status: row.status,
                reasonCategory: row.status === 'absent' ? row.reasonCategory : '',
                note: row.status === 'absent' ? row.note : ''
            };
            importedRecords++;
            dates.add(row.date);
        });
        saveAttendanceData();
        // Falls der gerade angezeigte Termin betroffen ist und keine ungespeicherten
        // Änderungen offen sind, die Ansicht mit den importierten Daten auffrischen.
        if (!attendanceDirty && dates.has($attendanceDate.value)) loadAttendanceSession();
        else renderAttendanceSessionsList(cls);
        let msg = `${importedRecords} Einträge an ${dates.size} Termin(en) in "${cls.name}" importiert.`;
        if (unknown.size > 0) msg += `\n\nNicht zugeordnet (Name nicht in der Klasse): ${[...unknown].join(', ')}`;
        if (invalid.length > 0) msg += `\n\n${invalid.length} Zeile(n) übersprungen (ungültiges Datum/Status).`;
        await uiAlert(msg, 'Termin-Import');
    };
    reader.readAsText(file);
});

document.getElementById('load-to-teams-btn').addEventListener('click', async () => {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const present = cls.students.filter(s => currentSessionRecords[s.id] && currentSessionRecords[s.id].status === 'present');
    if (present.length === 0) { await uiAlert('Keine Schüler(innen) als anwesend markiert.'); return; }
    if (personsManual && persons.length > 0) {
        const ok = await uiConfirm(`Die aktuelle Teilnehmerliste (${persons.length} manuell erfasste Person(en)) wird ersetzt. Fortfahren?`, { okLabel: 'Ersetzen' });
        if (!ok) return;
    }
    persons = present.map(s => ({ id: personIdCounter++, name: s.name, gender: s.gender, sporty: s.sporty === true }));
    personsManual = false;
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
document.getElementById('stats-semester-select').addEventListener('change', renderStats);
document.getElementById('stats-classtag-select').addEventListener('change', renderStats);

document.querySelectorAll('#stats-table th[data-sort-key]').forEach(th => {
    th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (statsSort.key === key) statsSort.dir = -statsSort.dir;
        else statsSort = { key, dir: key === 'name' ? 1 : -1 };
        renderStats();
    });
});

function buildStatsRows(cls, sessions) {
    const rowFor = (s, former) => {
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
        return { student: s, former, present, absent, recorded: total, quote, reasonCounts, absences };
    };
    const rows = cls.students.map(s => rowFor(s, false));
    // Ehemalige Schüler(innen) mit erfasster Historie bleiben in der Auswertung sichtbar.
    (cls.formerStudents || []).forEach(s => {
        const row = rowFor(s, true);
        if (row.recorded > 0) rows.push(row);
    });
    return rows;
}

function sortStatsRows(rows) {
    const dir = statsSort.dir;
    const key = statsSort.key;
    return rows.slice().sort((a, b) => {
        if (key === 'name') return dir * a.student.name.localeCompare(b.student.name, 'de');
        if (key === 'classTag') {
            const cmp = (a.student.classTag || '').localeCompare(b.student.classTag || '', 'de');
            if (cmp !== 0) return dir * cmp;
            return a.student.name.localeCompare(b.student.name, 'de');
        }
        const av = a[key] === null ? -1 : a[key];
        const bv = b[key] === null ? -1 : b[key];
        if (av !== bv) return dir * (av - bv);
        return a.student.name.localeCompare(b.student.name, 'de');
    });
}

// Kürzel-Dropdown mit den in der Klasse vorkommenden Klassenkürzeln füllen;
// ausblenden, wenn die Klasse keine Kürzel nutzt.
function refreshStatsClassTagSelect(cls) {
    const wrap = document.getElementById('stats-classtag-wrap');
    const sel = document.getElementById('stats-classtag-select');
    const prev = sel.value;
    const tags = cls
        ? [...new Set(cls.students.concat(cls.formerStudents || []).map(s => s.classTag || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))
        : [];
    sel.innerHTML = '<option value="all">Alle Klassen</option>';
    tags.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
    });
    const hasUntagged = cls && cls.students.concat(cls.formerStudents || []).some(s => !s.classTag);
    if (tags.length && hasUntagged) {
        const opt = document.createElement('option');
        opt.value = '__none__'; opt.textContent = 'Ohne Kürzel';
        sel.appendChild(opt);
    }
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    wrap.classList.toggle('hidden', tags.length === 0);
    return sel.value;
}

function renderStats() {
    const id = parseInt(document.getElementById('stats-class-select').value, 10);
    const semesterFilter = document.getElementById('stats-semester-select').value; // 'all' | '1' | '2'
    const emptyEl = document.getElementById('stats-empty');
    const contentEl = document.getElementById('stats-content');
    const exportBtn = document.getElementById('export-stats-btn');
    const cls = classes.find(c => c.id === id);
    const tagFilter = refreshStatsClassTagSelect(cls); // 'all' | '__none__' | Kürzel
    let sessions = cls && attendanceData[cls.id] ? Object.values(attendanceData[cls.id]).sort((a, b) => a.date.localeCompare(b.date)) : [];
    if (semesterFilter !== 'all') sessions = sessions.filter(session => getSemester(session.date) === parseInt(semesterFilter, 10));
    if (!cls || sessions.length === 0) {
        emptyEl.classList.remove('hidden'); contentEl.classList.add('hidden'); exportBtn.classList.add('hidden');
        return;
    }
    emptyEl.classList.add('hidden'); contentEl.classList.remove('hidden'); exportBtn.classList.remove('hidden');
    document.getElementById('stats-session-count').textContent = sessions.length;

    let statsRows = sortStatsRows(buildStatsRows(cls, sessions));
    if (tagFilter === '__none__') statsRows = statsRows.filter(r => !(r.student.classTag || ''));
    else if (tagFilter !== 'all') statsRows = statsRows.filter(r => (r.student.classTag || '') === tagFilter);

    document.querySelectorAll('#stats-table th[data-sort-key]').forEach(th => {
        const active = th.dataset.sortKey === statsSort.key;
        th.setAttribute('aria-sort', active ? (statsSort.dir === 1 ? 'ascending' : 'descending') : 'none');
        th.querySelector('.sort-arrow').textContent = active ? (statsSort.dir === 1 ? '▲' : '▼') : '';
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
        if (row.former) {
            const badge = document.createElement('span');
            badge.className = 'text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full';
            badge.textContent = 'ehemalig';
            nameTd.appendChild(badge);
        }
        const tagTd = document.createElement('td');
        tagTd.className = 'px-3 py-2 text-xs text-sky-700';
        tagTd.textContent = row.student.classTag || '–';
        const presentTd = document.createElement('td'); presentTd.className = 'text-center px-3 py-2 text-green-700'; presentTd.textContent = row.present;
        const absentTd = document.createElement('td'); absentTd.className = 'text-center px-3 py-2 text-red-600'; absentTd.textContent = row.absent;
        const recordedTd = document.createElement('td');
        recordedTd.className = 'text-center px-3 py-2 text-gray-500 text-xs';
        recordedTd.textContent = `${row.recorded}/${sessions.length}`;
        recordedTd.title = `An ${row.recorded} von ${sessions.length} Terminen erfasst`;
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
        tr.appendChild(nameTd); tr.appendChild(tagTd); tr.appendChild(presentTd); tr.appendChild(absentTd); tr.appendChild(recordedTd); tr.appendChild(quoteTd); tr.appendChild(reasonsTd);
        tbody.appendChild(tr);

        if (row.absences.length > 0) {
            tr.className += ' cursor-pointer hover:bg-gray-50';
            tr.title = 'Klicken für Abwesenheits-Details';
            const detailTr = document.createElement('tr');
            detailTr.className = 'hidden bg-gray-50 border-t border-gray-100';
            const detailTd = document.createElement('td');
            detailTd.colSpan = 7;
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

    // Zusammenfassung (Ø-Zeile)
    const withQuote = statsRows.filter(r => r.quote !== null);
    const avgQuote = withQuote.length ? Math.round(withQuote.reduce((sum, r) => sum + r.quote, 0) / withQuote.length) : null;
    const totalPresent = statsRows.reduce((sum, r) => sum + r.present, 0);
    const totalAbsent = statsRows.reduce((sum, r) => sum + r.absent, 0);
    document.getElementById('stats-total-present').textContent = totalPresent;
    document.getElementById('stats-total-absent').textContent = totalAbsent;
    document.getElementById('stats-avg-quote').textContent = avgQuote === null ? '–' : `${avgQuote}%`;

    exportBtn.onclick = () => exportStatsCsv(cls, statsRows, sessions.length, semesterFilter, tagFilter);
}

function exportStatsCsv(cls, statsRows, sessionCount, semesterFilter, tagFilter) {
    const lines = [['Name', 'Klasse', 'Status', 'Anwesend', 'Abwesend', 'Erfasst (von ' + sessionCount + ')', 'Quote (%)', 'Gründe', 'Abwesenheits-Details'].map(escapeCsv).join(';')];
    statsRows.forEach(row => {
        const reasons = Object.entries(row.reasonCounts).map(([k, v]) => `${k}: ${v}`).join(', ');
        const details = (row.absences || []).map(a => `${formatDateDisplay(a.date)} ${a.reasonCategory || 'Ohne Angabe'}${a.note ? ` (${a.note})` : ''}`).join(' | ');
        lines.push([row.student.name, row.student.classTag || '', row.former ? 'ehemalig' : 'aktiv', row.present, row.absent, row.recorded, row.quote === null ? '' : row.quote, reasons, details].map(escapeCsv).join(';'));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
    const semesterSuffix = semesterFilter === '1' ? '-Semester1' : semesterFilter === '2' ? '-Semester2' : '';
    const tagSuffix = tagFilter && tagFilter !== 'all' ? `-${tagFilter === '__none__' ? 'OhneKuerzel' : safeFilePart(tagFilter)}` : '';
    downloadBlob(blob, `anwesenheit-${safeFilePart(cls.name)}${semesterSuffix}${tagSuffix}-${todayStr()}.csv`);
}

// TAB: PRÜFUNGEN / LERNZIELKONTROLLEN
const $examsSelect = document.getElementById('exams-class-select');

function refreshExamsSelect() {
    const prev = $examsSelect.value;
    $examsSelect.innerHTML = '<option value="">-- Klasse wählen --</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = String(cls.id); opt.textContent = cls.name;
        $examsSelect.appendChild(opt);
    });
    if (prev && classes.find(c => String(c.id) === prev)) { $examsSelect.value = prev; }
}

async function confirmDiscardExam() {
    if (!examDirty) return true;
    const ok = await uiConfirm('Es gibt ungespeicherte Prüfungs-Eingaben. Ohne Speichern fortfahren?', { okLabel: 'Verwerfen', danger: true });
    if (ok) { examDirty = false; updateExamDirtyHint(); }
    return ok;
}
function updateExamDirtyHint() {
    document.getElementById('exam-unsaved-hint').classList.toggle('hidden', !examDirty);
}

$examsSelect.addEventListener('change', async function() {
    if (!(await confirmDiscardExam())) { this.value = selExamClassId === null ? '' : String(selExamClassId); return; }
    const id = parseInt(this.value, 10);
    const emptyEl = document.getElementById('exams-empty');
    const contentEl = document.getElementById('exams-content');
    const createBtn = document.getElementById('create-exam-btn');
    if (isNaN(id)) {
        selExamClassId = null; selExamId = null;
        emptyEl.classList.remove('hidden'); contentEl.classList.add('hidden'); createBtn.classList.add('hidden');
        return;
    }
    selExamClassId = id; selExamId = null;
    emptyEl.classList.add('hidden'); contentEl.classList.remove('hidden'); createBtn.classList.remove('hidden');
    document.getElementById('new-exam-form').classList.add('hidden');
    renderExamList();
    renderExamDetail();
});

document.getElementById('create-exam-btn').addEventListener('click', () => {
    const form = document.getElementById('new-exam-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        document.getElementById('exam-title-input').value = '';
        document.getElementById('exam-date-input').value = todayStr();
        document.getElementById('exam-form-error').classList.add('hidden');
        document.getElementById('exam-title-input').focus();
    }
});
document.getElementById('cancel-exam-btn').addEventListener('click', () => document.getElementById('new-exam-form').classList.add('hidden'));
document.querySelectorAll('input[name="exam-mode"]').forEach(radio => radio.addEventListener('change', () => {
    document.getElementById('exam-maxpoints-wrap').classList.toggle('hidden', radio.value !== 'points' || !radio.checked);
}));

document.getElementById('save-exam-btn').addEventListener('click', async () => {
    const cls = classes.find(c => c.id === selExamClassId);
    if (!cls) return;
    const errEl = document.getElementById('exam-form-error');
    const title = document.getElementById('exam-title-input').value.trim();
    const date = document.getElementById('exam-date-input').value;
    const mode = document.querySelector('input[name="exam-mode"]:checked').value;
    const maxPoints = parseFloat(document.getElementById('exam-maxpoints-input').value);
    if (!title) { errEl.textContent = 'Bitte einen Titel angeben.'; errEl.classList.remove('hidden'); return; }
    if (!date) { errEl.textContent = 'Bitte ein Datum angeben.'; errEl.classList.remove('hidden'); return; }
    if (mode === 'points' && (!isFinite(maxPoints) || maxPoints <= 0)) { errEl.textContent = 'Bitte eine gültige Maximalpunktzahl angeben.'; errEl.classList.remove('hidden'); return; }
    if (!(await confirmDiscardExam())) return;
    if (!exams[cls.id]) exams[cls.id] = [];
    const exam = { id: examIdCounter++, title, date, mode, maxPoints: mode === 'points' ? maxPoints : null, results: {} };
    exams[cls.id].push(exam);
    saveExams();
    document.getElementById('new-exam-form').classList.add('hidden');
    selExamId = exam.id;
    renderExamList();
    renderExamDetail();
});

function renderExamList() {
    const cls = classes.find(c => c.id === selExamClassId);
    const list = document.getElementById('exam-list');
    list.innerHTML = '';
    const examList = (cls && exams[cls.id] ? exams[cls.id] : []).slice().sort((a, b) => b.date.localeCompare(a.date));
    if (examList.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-gray-400 text-xs py-2';
        li.textContent = 'Noch keine Prüfungen erfasst.';
        list.appendChild(li);
        return;
    }
    examList.forEach(exam => {
        const li = document.createElement('li');
        const isActive = exam.id === selExamId;
        li.className = `rounded-lg border-2 transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'}`;
        const btn = document.createElement('button');
        btn.className = 'w-full text-left px-3 py-2';
        const titleSpan = document.createElement('div');
        titleSpan.className = 'font-medium text-sm truncate';
        titleSpan.textContent = exam.title;
        const metaSpan = document.createElement('div');
        metaSpan.className = `text-xs ${isActive ? 'text-indigo-200' : 'text-gray-400'}`;
        const gradedCount = Object.keys(exam.results).length;
        metaSpan.textContent = `${formatDateDisplay(exam.date)} · ${gradedCount} bewertet`;
        btn.appendChild(titleSpan); btn.appendChild(metaSpan);
        btn.addEventListener('click', async () => {
            if (exam.id === selExamId) return;
            if (!(await confirmDiscardExam())) return;
            selExamId = exam.id;
            renderExamList(); renderExamDetail();
        });
        li.appendChild(btn);
        list.appendChild(li);
    });
}

function getSelectedExam() {
    const list = exams[selExamClassId];
    return list ? list.find(e => e.id === selExamId) : null;
}

// Zeilen der Ergebnistabelle: aktuelle Schüler(innen) plus Ehemalige mit erfasstem Resultat.
function examRowStudents(cls, exam) {
    const rows = cls.students.slice();
    (cls.formerStudents || []).forEach(s => {
        if (exam.results[s.id] !== undefined) rows.push({ ...s, former: true });
    });
    return rows;
}

function examGradeOf(exam, value) {
    if (typeof value !== 'number' || !isFinite(value)) return null;
    return exam.mode === 'points' ? pointsToGrade(value, exam.maxPoints) : Math.round(value * 10) / 10;
}
function gradeColorClass(grade) {
    return grade === null ? 'text-gray-300' : grade < 4 ? 'text-red-600' : 'text-green-700';
}

function renderExamDetail() {
    const cls = classes.find(c => c.id === selExamClassId);
    const exam = getSelectedExam();
    const emptyEl = document.getElementById('exam-detail-empty');
    const detailEl = document.getElementById('exam-detail');
    if (!cls || !exam) { detailEl.classList.add('hidden'); emptyEl.classList.remove('hidden'); return; }
    emptyEl.classList.add('hidden'); detailEl.classList.remove('hidden');
    document.getElementById('exam-detail-title').textContent = exam.title;
    document.getElementById('exam-detail-meta').textContent =
        `${formatDateDisplay(exam.date)} · ${exam.mode === 'points' ? `Punkte (max. ${exam.maxPoints})` : 'Noten direkt'}`;
    document.getElementById('exam-input-col-header').textContent = exam.mode === 'points' ? 'Punkte' : 'Note';
    examDirty = false; updateExamDirtyHint();

    const tbody = document.getElementById('exam-results-body');
    tbody.innerHTML = '';
    examRowStudents(cls, exam).forEach(s => {
        const tr = document.createElement('tr');
        tr.className = 'border-t border-gray-100';
        const nameTd = document.createElement('td');
        nameTd.className = 'px-3 py-1.5 flex items-center gap-2';
        nameTd.appendChild(genderIconEl(s.gender));
        const nameSpan = document.createElement('span');
        nameSpan.textContent = s.name;
        nameTd.appendChild(nameSpan);
        if (s.former) {
            const badge = document.createElement('span');
            badge.className = 'text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full';
            badge.textContent = 'ehemalig';
            nameTd.appendChild(badge);
        }
        const tagTd = document.createElement('td');
        tagTd.className = 'px-3 py-1.5 text-xs text-sky-700';
        tagTd.textContent = s.classTag || '–';
        const inputTd = document.createElement('td');
        inputTd.className = 'text-center px-3 py-1.5';
        const input = document.createElement('input');
        input.type = 'number';
        input.step = exam.mode === 'points' ? '0.5' : '0.1';
        input.min = exam.mode === 'points' ? '0' : '1';
        if (exam.mode === 'points') input.max = String(exam.maxPoints);
        else input.max = '6';
        input.className = 'w-20 border rounded-md p-1.5 text-sm text-center focus:border-indigo-500 focus:outline-none exam-result-input';
        input.dataset.studentId = String(s.id);
        input.setAttribute('aria-label', `${exam.mode === 'points' ? 'Punkte' : 'Note'} für ${s.name}`);
        if (exam.results[s.id] !== undefined) input.value = String(exam.results[s.id]);
        const gradeTd = document.createElement('td');
        gradeTd.className = 'text-center px-3 py-1.5 font-semibold exam-grade-cell';
        const updateGradeCell = () => {
            const v = input.value === '' ? null : parseFloat(input.value);
            const grade = v === null || !isFinite(v) ? null : examGradeOf(exam, v);
            gradeTd.textContent = grade === null ? '–' : grade.toFixed(1);
            gradeTd.className = `text-center px-3 py-1.5 font-semibold exam-grade-cell ${gradeColorClass(grade)}`;
        };
        input.addEventListener('input', () => { examDirty = true; updateExamDirtyHint(); updateGradeCell(); });
        updateGradeCell();
        inputTd.appendChild(input);
        tr.appendChild(nameTd); tr.appendChild(tagTd); tr.appendChild(inputTd); tr.appendChild(gradeTd);
        tbody.appendChild(tr);
    });
    renderExamStats(cls, exam);
}

document.getElementById('save-exam-results-btn').addEventListener('click', async () => {
    const cls = classes.find(c => c.id === selExamClassId);
    const exam = getSelectedExam();
    if (!cls || !exam) return;
    const invalid = [];
    const newResults = {};
    document.querySelectorAll('#exam-results-body .exam-result-input').forEach(input => {
        if (input.value === '') return;
        const v = parseFloat(input.value);
        const max = exam.mode === 'points' ? exam.maxPoints : 6;
        const min = exam.mode === 'points' ? 0 : 1;
        if (!isFinite(v) || v < min || v > max) { invalid.push(input); return; }
        newResults[input.dataset.studentId] = v;
    });
    if (invalid.length) {
        await uiAlert(`${invalid.length} Eingabe(n) sind ungültig (${exam.mode === 'points' ? `0–${exam.maxPoints} Punkte` : 'Note 1–6'}) und wurden nicht gespeichert.`, 'Prüfung');
    }
    exam.results = newResults;
    saveExams();
    examDirty = false; updateExamDirtyHint();
    renderExamList();
    renderExamStats(cls, exam);
    showToast('Prüfungsergebnisse gespeichert.');
});

// Auswertung: Ø-Note gesamt und — wenn die Gruppe Klassenkürzel nutzt — separat pro Klasse.
function renderExamStats(cls, exam) {
    const container = document.getElementById('exam-stats-rows');
    container.innerHTML = '';
    const rows = examRowStudents(cls, exam)
        .map(s => ({ student: s, grade: exam.results[s.id] !== undefined ? examGradeOf(exam, exam.results[s.id]) : null }))
        .filter(r => r.grade !== null);
    const addStatRow = (label, group) => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between gap-2 flex-wrap';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'text-xs font-medium text-indigo-900';
        labelSpan.textContent = label;
        const valSpan = document.createElement('span');
        valSpan.className = 'text-xs text-indigo-800';
        if (group.length === 0) { valSpan.textContent = 'keine Ergebnisse'; }
        else {
            const avg = group.reduce((sum, r) => sum + r.grade, 0) / group.length;
            const insufficient = group.filter(r => r.grade < 4).length;
            const min = Math.min(...group.map(r => r.grade));
            const max = Math.max(...group.map(r => r.grade));
            valSpan.textContent = `${group.length} bewertet · Ø ${avg.toFixed(2)} · min ${min.toFixed(1)} / max ${max.toFixed(1)}${insufficient ? ` · ${insufficient} ungenügend` : ''}`;
        }
        div.appendChild(labelSpan); div.appendChild(valSpan);
        container.appendChild(div);
    };
    addStatRow('Gesamt', rows);
    const tags = [...new Set(rows.map(r => r.student.classTag || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    if (tags.length) {
        tags.forEach(tag => addStatRow(`Klasse ${tag}`, rows.filter(r => (r.student.classTag || '') === tag)));
        const untagged = rows.filter(r => !(r.student.classTag || ''));
        if (untagged.length) addStatRow('Ohne Kürzel', untagged);
    }
}

document.getElementById('delete-exam-btn').addEventListener('click', async () => {
    const cls = classes.find(c => c.id === selExamClassId);
    const exam = getSelectedExam();
    if (!cls || !exam) return;
    const ok = await uiConfirm(`Prüfung "${exam.title}" vom ${formatDateDisplay(exam.date)} wirklich löschen?`, { okLabel: 'Löschen', danger: true });
    if (!ok) return;
    exams[cls.id] = exams[cls.id].filter(e => e.id !== exam.id);
    if (exams[cls.id].length === 0) delete exams[cls.id];
    saveExams();
    selExamId = null; examDirty = false; updateExamDirtyHint();
    renderExamList(); renderExamDetail();
});

// TXT-Export: eine Zeile pro Schüler(in) im Format "Name Wert" — Wert ist im
// Punkte-Modus die Punktzahl, im Noten-Modus die eingegebene Note. Mischt die
// Gruppe mehrere Klassenkürzel, wird pro Kürzel eine eigene Datei erzeugt.
document.getElementById('export-exam-btn').addEventListener('click', async () => {
    const cls = classes.find(c => c.id === selExamClassId);
    const exam = getSelectedExam();
    if (!cls || !exam) return;
    const rows = examRowStudents(cls, exam).filter(s => exam.results[s.id] !== undefined);
    if (rows.length === 0) { await uiAlert('Noch keine Ergebnisse erfasst — nichts zu exportieren.', 'Prüfung exportieren'); return; }
    const groups = new Map();
    rows.forEach(s => {
        const tag = s.classTag || '';
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(s);
    });
    const multi = groups.size > 1;
    [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'de'))
        .forEach(([tag, students], i) => {
            const lines = students
                .slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))
                .map(s => `${s.name} ${exam.results[s.id]}`);
            const tagPart = tag ? `-${safeFilePart(tag)}` : (multi ? '-ohne-kuerzel' : '');
            const fname = `pruefung-${safeFilePart(exam.title)}-${exam.date}${tagPart}.txt`;
            // Downloads leicht versetzt anstossen, damit der Browser mehrere Dateien zulässt.
            setTimeout(() => downloadBlob(new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }), fname), i * 300);
        });
    if (multi) showToast(`${groups.size} Textdateien werden heruntergeladen (eine pro Klasse). Der Browser fragt evtl. nach Erlaubnis für mehrere Downloads.`);
});

// TAB: PUNKTE (Klassenpunkte-Tracker fuer Bonusstunden)
const $pointsSelect = document.getElementById('points-class-select');
const $pointsDate = document.getElementById('points-date-input');

function getPointsData(classId) {
    if (!pointsData[classId]) pointsData[classId] = { goals: [], entries: [] };
    if (!Array.isArray(pointsData[classId].goals)) pointsData[classId].goals = [];
    if (!Array.isArray(pointsData[classId].entries)) pointsData[classId].entries = [];
    return pointsData[classId];
}

function refreshPointsSelect() {
    const prev = $pointsSelect.value;
    $pointsSelect.innerHTML = '<option value="">-- Klasse wählen --</option>';
    classes.filter(c => c.collectsPoints === true).forEach(cls => {
        const opt = document.createElement('option');
        opt.value = String(cls.id); opt.textContent = cls.name;
        $pointsSelect.appendChild(opt);
    });
    if (prev && [...$pointsSelect.options].some(o => o.value === prev)) $pointsSelect.value = prev;
    else if (selPointsClassId !== null && ![...$pointsSelect.options].some(o => o.value === String(selPointsClassId))) {
        selPointsClassId = null;
        document.getElementById('points-empty').classList.remove('hidden');
        document.getElementById('points-content').classList.add('hidden');
    }
}

$pointsSelect.addEventListener('change', function() {
    const id = parseInt(this.value, 10);
    const emptyEl = document.getElementById('points-empty');
    const contentEl = document.getElementById('points-content');
    if (isNaN(id)) {
        selPointsClassId = null;
        emptyEl.classList.remove('hidden'); contentEl.classList.add('hidden');
        return;
    }
    selPointsClassId = id;
    emptyEl.classList.add('hidden'); contentEl.classList.remove('hidden');
    if (!$pointsDate.value) $pointsDate.value = todayStr();
    renderPointsTab();
});

function renderPointsTab() {
    const cls = classes.find(c => c.id === selPointsClassId);
    if (!cls) return;
    const pd = getPointsData(cls.id);
    const total = computePointsTotal(pd.entries);
    document.getElementById('points-total').textContent = total;
    const lektionen = pd.entries.filter(e => e.type !== 'reset').length;
    const lastReset = pd.entries.filter(e => e.type === 'reset').slice(-1)[0];
    document.getElementById('points-total-meta').textContent =
        `${lektionen} Lektion(en) erfasst${lastReset ? ` · zuletzt eingelöst am ${formatDateDisplay(lastReset.date)}` : ''}`;
    renderPointsGoalCheckboxes(pd);
    renderPointsGoalsEditor(pd);
    renderPointsEntries(pd);
    updateLektionSum(pd);
}

function renderPointsGoalCheckboxes(pd) {
    const container = document.getElementById('points-goal-checkboxes');
    container.innerHTML = '';
    if (pd.goals.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-xs text-gray-400';
        p.textContent = 'Keine Ziele definiert — unten unter "Ziele & Punktwerte bearbeiten" hinzufügen.';
        container.appendChild(p);
        return;
    }
    pd.goals.forEach(goal => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 text-sm cursor-pointer bg-white rounded-md border border-gray-200 px-2.5 py-1.5 hover:border-amber-300 transition-colors';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'rounded text-amber-500 h-4 w-4 points-goal-cb';
        cb.dataset.goalId = String(goal.id);
        cb.dataset.points = String(goal.points);
        cb.addEventListener('change', () => updateLektionSum(pd));
        const text = document.createElement('span');
        text.className = 'flex-1 text-gray-700';
        text.textContent = goal.text;
        const badge = document.createElement('span');
        badge.className = 'text-xs font-bold text-amber-600 flex-shrink-0';
        badge.textContent = `+${goal.points}`;
        label.appendChild(cb); label.appendChild(text); label.appendChild(badge);
        container.appendChild(label);
    });
}

function updateLektionSum(pd) {
    let sum = 0;
    document.querySelectorAll('#points-goal-checkboxes .points-goal-cb:checked').forEach(cb => { sum += parseInt(cb.dataset.points, 10) || 0; });
    document.getElementById('points-lektion-sum').textContent = sum;
}

document.getElementById('points-save-lektion-btn').addEventListener('click', async () => {
    const cls = classes.find(c => c.id === selPointsClassId);
    if (!cls) return;
    const pd = getPointsData(cls.id);
    const date = $pointsDate.value || todayStr();
    const checked = [...document.querySelectorAll('#points-goal-checkboxes .points-goal-cb:checked')];
    const goalIds = checked.map(cb => parseInt(cb.dataset.goalId, 10));
    const points = checked.reduce((sum, cb) => sum + (parseInt(cb.dataset.points, 10) || 0), 0);
    if (goalIds.length === 0) {
        const ok = await uiConfirm('Kein Ziel angehakt — Lektion mit 0 Punkten speichern?', { okLabel: 'Speichern' });
        if (!ok) return;
    }
    const note = document.getElementById('points-note-input').value.trim().slice(0, 200);
    pd.entries.push({ id: pointsIdCounter++, type: 'lektion', date, goalIds, note, points });
    savePointsData();
    document.getElementById('points-note-input').value = '';
    renderPointsTab();
    showToast(`Lektion gespeichert: +${points} Punkte.`);
});

document.getElementById('points-reset-btn').addEventListener('click', async () => {
    const cls = classes.find(c => c.id === selPointsClassId);
    if (!cls) return;
    const pd = getPointsData(cls.id);
    const total = computePointsTotal(pd.entries);
    const ok = await uiConfirm(`Punktestand von ${total} Punkten einlösen und auf 0 zurücksetzen? Der Verlauf bleibt erhalten.`, { title: 'Punkte einlösen', okLabel: 'Einlösen' });
    if (!ok) return;
    pd.entries.push({ id: pointsIdCounter++, type: 'reset', date: todayStr() });
    savePointsData();
    renderPointsTab();
});

// Ziele-Editor: Text und Punktwert (1 oder 2) pro Ziel anpassen, Ziele ergaenzen/entfernen.
document.getElementById('points-goals-toggle-btn').addEventListener('click', () => document.getElementById('points-goals-editor').classList.toggle('hidden'));

function renderPointsGoalsEditor(pd) {
    const container = document.getElementById('points-goals-rows');
    container.innerHTML = '';
    pd.goals.forEach(goal => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-1.5';
        const input = document.createElement('input');
        input.type = 'text'; input.maxLength = 120; input.value = goal.text;
        input.className = 'flex-1 border rounded-md p-1.5 text-xs focus:border-indigo-500 focus:outline-none';
        input.addEventListener('change', () => {
            const t = input.value.trim().slice(0, 120);
            if (!t) { input.value = goal.text; return; }
            goal.text = t; savePointsData(); renderPointsGoalCheckboxes(pd);
        });
        const sel = document.createElement('select');
        sel.className = 'border rounded-md p-1.5 text-xs bg-white';
        sel.innerHTML = '<option value="1">1 Punkt</option><option value="2">2 Punkte</option>';
        sel.value = String(goal.points === 2 ? 2 : 1);
        sel.addEventListener('change', () => {
            goal.points = parseInt(sel.value, 10) === 2 ? 2 : 1;
            savePointsData(); renderPointsGoalCheckboxes(pd); updateLektionSum(pd);
        });
        const rm = document.createElement('button');
        rm.className = 'text-gray-300 hover:text-red-500 px-1';
        rm.innerHTML = '<i class="fas fa-times text-xs" aria-hidden="true"></i>';
        rm.title = 'Ziel entfernen (bereits erfasste Lektionen behalten ihre Punkte)';
        rm.addEventListener('click', () => {
            pd.goals = pd.goals.filter(g => g.id !== goal.id);
            savePointsData(); renderPointsGoalsEditor(pd); renderPointsGoalCheckboxes(pd); updateLektionSum(pd);
        });
        row.appendChild(input); row.appendChild(sel); row.appendChild(rm);
        container.appendChild(row);
    });
}

document.getElementById('points-add-goal-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === selPointsClassId);
    if (!cls) return;
    const pd = getPointsData(cls.id);
    const input = document.getElementById('points-new-goal-input');
    const text = input.value.trim().slice(0, 120);
    if (!text) return;
    const points = parseInt(document.getElementById('points-new-goal-points').value, 10) === 2 ? 2 : 1;
    pd.goals.push({ id: pointsIdCounter++, text, points });
    savePointsData();
    input.value = '';
    renderPointsGoalsEditor(pd); renderPointsGoalCheckboxes(pd);
});

function renderPointsEntries(pd) {
    const list = document.getElementById('points-entries-list');
    list.innerHTML = '';
    if (pd.entries.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-gray-400 text-xs py-2';
        li.textContent = 'Noch keine Lektionen erfasst.';
        list.appendChild(li);
        return;
    }
    const goalById = new Map(pd.goals.map(g => [g.id, g]));
    pd.entries.slice().reverse().forEach(entry => {
        const li = document.createElement('li');
        if (entry.type === 'reset') {
            li.className = 'flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800';
            const span = document.createElement('span');
            span.className = 'text-xs font-medium';
            span.textContent = `${formatDateDisplay(entry.date)} — Punkte eingelöst (Stand auf 0 gesetzt)`;
            li.appendChild(span);
        } else {
            li.className = 'bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-sm';
            const top = document.createElement('div');
            top.className = 'flex items-center justify-between gap-2';
            const left = document.createElement('span');
            left.className = 'text-sm';
            const dateB = document.createElement('span'); dateB.className = 'font-medium'; dateB.textContent = formatDateDisplay(entry.date);
            const ptsB = document.createElement('span'); ptsB.className = 'ml-2 text-xs font-bold text-amber-600'; ptsB.textContent = `+${entry.points}`;
            left.appendChild(dateB); left.appendChild(ptsB);
            top.appendChild(left);
            const delBtn = document.createElement('button');
            delBtn.className = 'text-gray-300 hover:text-red-500 text-xs p-1';
            delBtn.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
            delBtn.setAttribute('aria-label', `Lektion vom ${formatDateDisplay(entry.date)} löschen`);
            top.appendChild(delBtn);
            li.appendChild(top);
            const goalsTxt = (entry.goalIds || []).map(gid => (goalById.get(gid) || {}).text).filter(Boolean).join(', ');
            if (goalsTxt || entry.note) {
                const sub = document.createElement('p');
                sub.className = 'text-xs text-gray-400 mt-0.5';
                sub.textContent = [goalsTxt, entry.note].filter(Boolean).join(' — ');
                li.appendChild(sub);
            }
            delBtn.addEventListener('click', async () => {
                const ok = await uiConfirm(`Lektion vom ${formatDateDisplay(entry.date)} (+${entry.points} Punkte) löschen?`, { okLabel: 'Löschen', danger: true });
                if (!ok) return;
                pd.entries = pd.entries.filter(e => e.id !== entry.id);
                savePointsData(); renderPointsTab();
            });
        }
        list.appendChild(li);
    });
}

// TAB 3: TEAMS
async function addPerson(name, gender, sporty = false, { confirmDuplicate = false } = {}) {
    if (persons.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        if (!confirmDuplicate) { showAddError(`"${name}" ist bereits in der Liste.`); return false; }
        const ok = await uiConfirm(`"${name}" ist bereits in der Liste. Trotzdem hinzufügen (z.B. zweite Person mit gleichem Namen)?`, { title: 'Doppelter Name', okLabel: 'Trotzdem hinzufügen' });
        if (!ok) return false;
    }
    persons.push({ id: personIdCounter++, name, gender, sporty: sporty === true });
    personsManual = true;
    savePersons(); renderPersonList(); return true;
}
function showAddError(msg) {
    const el = document.getElementById('add-error-msg'); el.textContent = msg; el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}
function removePerson(id) {
    const p = persons.find(x => x.id === id);
    if (!p) return;
    withUndo(`"${p.name}" aus Teilnehmerliste entfernt.`, () => {
        persons = persons.filter(x => x.id !== id); savePersons(); renderPersonList();
    });
}

document.getElementById('add-person-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('person-name').value.trim();
    const gender = document.querySelector('input[name="gender"]:checked').value;
    const sporty = document.getElementById('person-sporty-input').checked;
    if (!name) return;
    const ok = await addPerson(name, gender, sporty, { confirmDuplicate: true });
    if (ok) {
        document.getElementById('person-name').value = '';
        document.getElementById('person-sporty-input').checked = false;
        document.getElementById('add-error-msg').classList.add('hidden');
    }
    document.getElementById('person-name').focus();
});

document.getElementById('clear-all-btn').addEventListener('click', async () => {
    const ok = await uiConfirm('Alle Teilnehmer löschen? Die Seite wird danach neu geladen.', { okLabel: 'Löschen', danger: true });
    if (!ok) return;
    persons = []; personsManual = false; savePersons();
    await flushAndReload();
});

function renderPersonList() {
    const list = document.getElementById('person-list');
    const emptyEl = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-all-btn');
    document.getElementById('total-count').textContent = persons.length;
    list.innerHTML = '';
    if (persons.length === 0) { list.appendChild(emptyEl); clearBtn.classList.add('hidden'); }
    else {
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
            btn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
            btn.setAttribute('aria-label', `${p.name} entfernen`);
            btn.addEventListener('click', () => removePerson(p.id));
            li.appendChild(inner); li.appendChild(btn); list.appendChild(li);
        });
    }
    refreshApartSelects();
    renderApartList();
}

document.getElementById('toggle-bulk-btn').addEventListener('click', () => document.getElementById('bulk-area').classList.toggle('hidden'));
document.getElementById('add-bulk-btn').addEventListener('click', () => {
    const text = document.getElementById('bulk-input').value.trim();
    if (!text) return;
    const { added, skipped, defaults } = bulkParse(text, (name, gender, sporty) => {
        if (persons.find(p => p.name.toLowerCase() === name.toLowerCase())) return false;
        persons.push({ id: personIdCounter++, name, gender, sporty: sporty === true });
        return true;
    });
    personsManual = true;
    savePersons(); renderPersonList();
    document.getElementById('bulk-input').value = '';
    showBulkMsg('bulk-result-msg', added, skipped, defaults);
    setTimeout(() => { document.getElementById('bulk-result-msg').classList.add('hidden'); document.getElementById('bulk-area').classList.add('hidden'); }, 4000);
});

function showBulkMsg(elId, added, skipped, defaults) {
    let msg = `${added} hinzugefügt.`;
    if (skipped  > 0) msg += ` ${skipped} übersprungen (Duplikate).`;
    if (defaults > 0) msg += ` ${defaults} ohne Angabe als "weiblich".`;
    const el = document.getElementById(elId); el.textContent = msg; el.classList.remove('hidden');
}

// "NICHT ZUSAMMEN"-REGELN
function refreshApartSelects() {
    ['apart-a', 'apart-b'].forEach(id => {
        const sel = document.getElementById(id);
        const prev = sel.value;
        sel.innerHTML = '<option value="">– Person –</option>';
        persons.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name; opt.textContent = p.name;
            sel.appendChild(opt);
        });
        if (prev && persons.find(p => p.name === prev)) sel.value = prev;
    });
}
function pairEquals(p1, p2) {
    const k = x => x.trim().toLowerCase();
    return (k(p1[0]) === k(p2[0]) && k(p1[1]) === k(p2[1])) || (k(p1[0]) === k(p2[1]) && k(p1[1]) === k(p2[0]));
}
document.getElementById('apart-add-btn').addEventListener('click', () => {
    const a = document.getElementById('apart-a').value;
    const b = document.getElementById('apart-b').value;
    if (!a || !b || a.trim().toLowerCase() === b.trim().toLowerCase()) return;
    if (apartPairs.some(p => pairEquals(p, [a, b]))) return;
    apartPairs.push([a, b]);
    saveApartPairs();
    renderApartList();
});
function renderApartList() {
    const ul = document.getElementById('apart-list');
    ul.innerHTML = '';
    if (apartPairs.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-xs text-gray-400 italic';
        li.textContent = 'Keine Regeln definiert.';
        ul.appendChild(li);
        return;
    }
    apartPairs.forEach((pair, idx) => {
        const li = document.createElement('li');
        li.className = 'inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-2 py-1 rounded-full mr-1.5 mb-1.5';
        const span = document.createElement('span');
        span.textContent = `${pair[0]} ↮ ${pair[1]}`;
        const rm = document.createElement('button');
        rm.className = 'text-amber-400 hover:text-red-500';
        rm.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        rm.setAttribute('aria-label', `Regel "${pair[0]} nicht mit ${pair[1]}" entfernen`);
        rm.addEventListener('click', () => { apartPairs.splice(idx, 1); saveApartPairs(); renderApartList(); });
        li.appendChild(span); li.appendChild(rm);
        ul.appendChild(li);
    });
}

// TEAM-GENERIERUNG
document.getElementById('generate-btn').addEventListener('click', generateTeams);
document.getElementById('regenerate-btn').addEventListener('click', generateTeams);
document.getElementById('team-mode').addEventListener('change', function() {
    document.getElementById('num-teams-label').textContent = this.value === 'size' ? 'Personen pro Team' : 'Anzahl der Teams';
});

function generateTeams() {
    const mode = document.getElementById('team-mode').value; // 'teams' | 'size'
    const inputVal = parseInt(document.getElementById('num-teams').value, 10);
    const balanceGender = document.getElementById('balance-gender').checked;
    const balanceSport = document.getElementById('balance-sport').checked;
    const errEl = document.getElementById('error-msg');
    const apartWarnEl = document.getElementById('apart-warning');
    errEl.classList.add('hidden'); apartWarnEl.classList.add('hidden');
    if (persons.length === 0) { errEl.textContent = 'Bitte füge zuerst Personen hinzu.'; errEl.classList.remove('hidden'); return; }
    let n;
    if (mode === 'size') {
        if (isNaN(inputVal) || inputVal < 1) { errEl.textContent = 'Mindestens 1 Person pro Team.'; errEl.classList.remove('hidden'); return; }
        n = Math.ceil(persons.length / inputVal);
        if (n < 2) { errEl.textContent = 'Diese Gruppengrösse ergibt weniger als 2 Teams.'; errEl.classList.remove('hidden'); return; }
    } else {
        n = inputVal;
        if (isNaN(n) || n < 2) { errEl.textContent = 'Mindestens 2 Teams erforderlich.'; errEl.classList.remove('hidden'); return; }
        if (n > persons.length) { errEl.textContent = 'Mehr Teams als Teilnehmer.'; errEl.classList.remove('hidden'); return; }
    }
    let teams = distributeTeams(persons, n, { balanceGender, balanceSport });
    if (apartPairs.length > 0) {
        const result = enforceApart(teams, apartPairs, { balanceStrict: balanceGender || balanceSport });
        teams = result.teams;
        if (result.unresolved) {
            apartWarnEl.textContent = 'Hinweis: Nicht alle "Nicht zusammen"-Regeln konnten erfüllt werden.';
            apartWarnEl.classList.remove('hidden');
        }
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
            const s = document.createElement('span'); s.title = `${cnt} ${lbl}`; s.innerHTML = `<i class="fas ${icon} ${color} mr-0.5" aria-hidden="true"></i>${cnt}<span class="sr-only"> ${lbl}</span>`; stats.appendChild(s);
        });
        const ul = document.createElement('ul'); ul.className = 'p-4 flex-grow space-y-1.5';
        team.forEach(p => {
            const li = document.createElement('li'); li.className = 'flex items-center gap-2 py-1 border-b border-gray-50 last:border-0';
            const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[sanitizeGender(p.gender)];
            const name = document.createElement('span'); name.className = 'text-gray-700 text-sm team-member-name'; name.textContent = p.name;
            li.appendChild(icon); li.appendChild(name); ul.appendChild(li);
        });
        card.appendChild(header); card.appendChild(stats); card.appendChild(ul);
        container.appendChild(card);
    });
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('print-teams-btn').addEventListener('click', () => window.print());

document.getElementById('copy-teams-btn').addEventListener('click', async () => {
    const cards = document.querySelectorAll('.team-card');
    if (!cards.length) return;
    let text = 'Generierte Teams:\n\n';
    cards.forEach((card, i) => { text += `--- Team ${i+1} ---\n`; card.querySelectorAll('.team-member-name').forEach(s => text += `- ${s.textContent.trim()}\n`); text += '\n'; });
    const orig = document.getElementById('copy-teams-btn').innerHTML;
    try {
        await navigator.clipboard.writeText(text);
        document.getElementById('copy-teams-btn').innerHTML = '<i class="fas fa-check text-green-500 mr-1" aria-hidden="true"></i> Kopiert!';
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); document.getElementById('copy-teams-btn').innerHTML = '<i class="fas fa-check text-green-500 mr-1" aria-hidden="true"></i> Kopiert!'; } catch {}
        document.body.removeChild(ta);
    }
    setTimeout(() => { document.getElementById('copy-teams-btn').innerHTML = orig; }, 2000);
});

// KOMPLETT-BACKUP (Klassen + Wochenpläne + Anwesenheitsdaten + Teilnehmerliste)
// Optional mit Passwort verschlüsselt (AES-GCM, Schlüssel via PBKDF2-SHA-256).
const PBKDF2_ITERATIONS = 210000;
const b64encode = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64decode = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function deriveBackupKey(password, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
}
async function encryptBackup(obj, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt, PBKDF2_ITERATIONS);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return {
        app: 'teamgenerator-backup', encrypted: true,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
        salt: b64encode(salt), iv: b64encode(iv), data: b64encode(ciphertext)
    };
}
async function decryptBackup(payload, password) {
    const iterations = payload.kdf && Number.isInteger(payload.kdf.iterations) ? payload.kdf.iterations : PBKDF2_ITERATIONS;
    const key = await deriveBackupKey(password, b64decode(payload.salt), iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(payload.iv) }, key, b64decode(payload.data));
    return JSON.parse(new TextDecoder().decode(plain));
}

// Serialisiert den kompletten App-Zustand (auch für die lokale Datendatei genutzt).
function buildBackupObject() {
    return {
        version: 3,
        exportedAt: new Date().toISOString(),
        classes, classIdCounter, stuIdCounter,
        attendanceData,
        persons, personIdCounter,
        apartPairs,
        exams, examIdCounter,
        pointsData, pointsIdCounter
    };
}

document.getElementById('backup-export-btn').addEventListener('click', async () => {
    const backup = buildBackupObject();
    let payload = backup;
    if (window.crypto && crypto.subtle) {
        const pw = await uiPrompt('Optional: Passwort zum Verschlüsseln des Backups. Leer lassen für unverschlüsselt.', {
            title: 'Backup herunterladen', inputType: 'password', placeholder: 'Passwort (optional)',
            hint: 'Empfohlen, da das Backup sensible Daten (Namen, Abwesenheitsgründe) enthält.', okLabel: 'Herunterladen'
        });
        if (pw === null) return;
        if (pw) {
            try { payload = await encryptBackup(backup, pw); }
            catch (e) { await uiAlert('Verschlüsselung fehlgeschlagen — Backup wurde nicht erstellt.'); return; }
        }
    }
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `klassenmanager-backup-${todayStr()}.json`);
});

const $backupFileInput = document.getElementById('backup-file-input');
document.getElementById('backup-import-btn').addEventListener('click', () => $backupFileInput.click());
$backupFileInput.addEventListener('change', () => {
    const file = $backupFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            let data = JSON.parse(reader.result);
            if (data && data.encrypted === true) {
                if (!(window.crypto && crypto.subtle)) { await uiAlert('Dieses Backup ist verschlüsselt, aber der Browser unterstützt hier keine Entschlüsselung (unsichere Umgebung?).'); return; }
                const pw = await uiPrompt('Dieses Backup ist verschlüsselt. Passwort eingeben:', { title: 'Backup wiederherstellen', inputType: 'password', okLabel: 'Entschlüsseln' });
                if (pw === null) return;
                try { data = await decryptBackup(data, pw); }
                catch (e) { await uiAlert('Entschlüsselung fehlgeschlagen — falsches Passwort oder beschädigte Datei.'); return; }
            }
            const result = validateBackup(data);
            if (!result) { await uiAlert('Ungültige Backup-Datei: Es wurde kein Komplett-Backup dieser App erkannt.'); return; }
            const ok = await uiConfirm(`Backup vom ${result.exportedAt ? formatDateDisplay(result.exportedAt.slice(0,10)) : 'unbekannten Datum'} mit ${result.classes.length} Klasse(n) wiederherstellen? Alle aktuellen Klassen und Anwesenheitsdaten werden ersetzt.`, { title: 'Backup wiederherstellen', okLabel: 'Wiederherstellen', danger: true });
            if (!ok) return;
            applyRestoredData(result);
            switchTab('classes');
            await uiAlert(`Backup wiederhergestellt: ${result.classes.length} Klasse(n).`);
        } catch (err) {
            await uiAlert('Backup konnte nicht gelesen werden (kein gültiges JSON).');
        }
        $backupFileInput.value = '';
    };
    reader.readAsText(file);
});

// Übernimmt validierte Daten (aus Backup-Import oder Datendatei) als neuen App-Zustand.
function applyRestoredData(result) {
    classes = result.classes;
    classIdCounter = result.classIdCounter;
    stuIdCounter = result.stuIdCounter;
    attendanceData = result.attendanceData;
    persons = result.persons;
    personIdCounter = result.personIdCounter;
    apartPairs = result.apartPairs || [];
    exams = result.exams || {};
    examIdCounter = result.examIdCounter || 1;
    pointsData = result.pointsData || {};
    pointsIdCounter = result.pointsIdCounter || 1;
    selPointsClassId = null;
    personsManual = false;
    activeClassId = null; selAttendClassId = null; currentSessionRecords = {};
    selExamClassId = null; selExamId = null; examDirty = false;
    attendanceDirty = false; updateDirtyHint();
    saveClasses(); saveAttendanceData(); savePersons(); saveApartPairs(); saveExams(); savePointsData();
    renderClassList(); renderClassDetail(); renderPersonList();
    $attendanceSelect.value = '';
    document.getElementById('attendance-empty').classList.remove('hidden');
    document.getElementById('attendance-content').classList.add('hidden');
    refreshStatsSelect();
}

// LOKALE DATENDATEI (File System Access API — Chrome/Edge)
// Speichert alle Daten zusätzlich automatisch in eine JSON-Datei auf der Festplatte.
// Das Datei-Handle wird in IndexedDB gemerkt, damit die Verbindung Neustarts überlebt.
const DATA_FILE_IDB = 'tg2_filestore';
const DATA_FILE_KEY = 'dataFile';
let dataFileHandle = null, fileStorageActive = false, fileWriteTimer = null, fileWriteErrorShown = false;

function fsSupported() { return 'showSaveFilePicker' in window && window.isSecureContext && 'indexedDB' in window; }

function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DATA_FILE_IDB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const req = db.transaction('handles', 'readonly').objectStore('handles').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function setFileStatus(state, detail = '') {
    const row = document.getElementById('file-storage-row');
    if (!fsSupported()) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    const text = document.getElementById('file-storage-status-text');
    document.getElementById('file-storage-connect-btn').classList.toggle('hidden', state !== 'disconnected');
    document.getElementById('file-storage-reconnect-btn').classList.toggle('hidden', state !== 'needs-permission');
    document.getElementById('file-storage-disconnect-btn').classList.toggle('hidden', state === 'disconnected');
    text.classList.toggle('text-amber-600', state === 'needs-permission' || state === 'error');
    if (state === 'disconnected') text.textContent = 'Optional: Alle Daten zusätzlich automatisch in eine lokale Datei sichern (z.B. im Dokumente-Ordner).';
    else if (state === 'connected') text.textContent = `Daten werden automatisch gespeichert in: ${detail}`;
    else if (state === 'needs-permission') text.textContent = `Datendatei "${detail}" verbunden — Zugriff bestätigen, um weiter automatisch zu speichern.`;
    else if (state === 'error') text.textContent = detail;
}

function scheduleDataFileWrite() {
    if (!fileStorageActive || !dataFileHandle) return;
    clearTimeout(fileWriteTimer);
    fileWriteTimer = setTimeout(() => { fileWriteTimer = null; writeDataFile(); }, 400);
}
async function writeDataFile() {
    if (!fileStorageActive || !dataFileHandle) return;
    try {
        const writable = await dataFileHandle.createWritable();
        await writable.write(JSON.stringify(buildBackupObject(), null, 2));
        await writable.close();
        fileWriteErrorShown = false;
        setFileStatus('connected', dataFileHandle.name);
    } catch (e) {
        setFileStatus('error', `Schreiben in "${dataFileHandle.name}" fehlgeschlagen — Daten sind weiterhin im Browser gespeichert.`);
        if (!fileWriteErrorShown) { fileWriteErrorShown = true; showToast('Datendatei konnte nicht geschrieben werden.'); }
    }
}
// Ausstehende Schreibvorgänge beim Verlassen der Seite noch anstossen.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && fileWriteTimer) { clearTimeout(fileWriteTimer); fileWriteTimer = null; writeDataFile(); }
});

// Seite neu laden, aber vorher einen evtl. ausstehenden Datendatei-Schreibvorgang
// abschliessen, damit Datei- und Browser-Stand nach dem Reload nicht auseinanderlaufen.
async function flushAndReload() {
    if (fileWriteTimer) { clearTimeout(fileWriteTimer); fileWriteTimer = null; }
    if (fileStorageActive && dataFileHandle) { try { await writeDataFile(); } catch (e) {} }
    location.reload();
}

// Gleicht Browser-Stand und Datei ab: identisch → nichts tun; Datei leer/ungültig →
// (nach Rückfrage) überschreiben; unterschiedlich → Nutzer entscheidet, welche Seite gilt.
async function syncWithDataFile() {
    let text;
    try { text = await (await dataFileHandle.getFile()).text(); }
    catch (e) { setFileStatus('error', `Datendatei "${dataFileHandle.name}" konnte nicht gelesen werden.`); return; }
    if (!text.trim()) { await writeDataFile(); return; }
    let result = null;
    try {
        const data = JSON.parse(text);
        if (data && data.encrypted === true) {
            await uiAlert('Die gewählte Datei ist ein verschlüsseltes Backup. Als automatische Datendatei bitte eine unverschlüsselte Datei verwenden (oder eine neue anlegen).');
            await disconnectDataFile();
            return;
        }
        result = validateBackup(data);
    } catch (e) {}
    if (!result) {
        const ok = await uiConfirm(`Die Datei "${dataFileHandle.name}" enthält keine gültigen Klassenmanager-Daten. Mit dem aktuellen Stand überschreiben?`, { title: 'Datendatei', okLabel: 'Überschreiben', danger: true });
        if (ok) await writeDataFile();
        else await disconnectDataFile();
        return;
    }
    const localSnap = JSON.stringify({ c: classes, a: attendanceData, p: persons, x: apartPairs });
    const fileSnap = JSON.stringify({ c: result.classes, a: result.attendanceData, p: result.persons, x: result.apartPairs });
    if (localSnap === fileSnap) { setFileStatus('connected', dataFileHandle.name); return; }
    const loadIt = await uiConfirm(
        `Die Datendatei "${dataFileHandle.name}"${result.exportedAt ? ` (Stand ${formatDateDisplay(result.exportedAt.slice(0, 10))})` : ''} unterscheidet sich vom Stand in diesem Browser.\n\n"Aus Datei laden" ersetzt den Browser-Stand. "Browser-Stand behalten" überschreibt die Datei.`,
        { title: 'Datendatei', okLabel: 'Aus Datei laden', cancelLabel: 'Browser-Stand behalten' }
    );
    if (loadIt) { applyRestoredData(result); switchTab('classes'); }
    else await writeDataFile();
    setFileStatus('connected', dataFileHandle.name);
}

async function connectDataFile() {
    let handle;
    try {
        handle = await window.showSaveFilePicker({
            suggestedName: 'klassenmanager-daten.json',
            types: [{ description: 'JSON-Datei', accept: { 'application/json': ['.json'] } }]
        });
    } catch (e) { return; } // abgebrochen
    dataFileHandle = handle;
    fileStorageActive = true;
    try { await idbSet(DATA_FILE_KEY, handle); } catch (e) {}
    await syncWithDataFile();
}
async function disconnectDataFile() {
    fileStorageActive = false;
    dataFileHandle = null;
    clearTimeout(fileWriteTimer); fileWriteTimer = null;
    try { await idbDel(DATA_FILE_KEY); } catch (e) {}
    setFileStatus('disconnected');
}
async function reconnectDataFile() {
    if (!dataFileHandle) return;
    let perm = 'denied';
    try { perm = await dataFileHandle.requestPermission({ mode: 'readwrite' }); } catch (e) {}
    if (perm !== 'granted') { setFileStatus('needs-permission', dataFileHandle.name); return; }
    fileStorageActive = true;
    await syncWithDataFile();
}
async function initDataFile() {
    if (!fsSupported()) return;
    setFileStatus('disconnected');
    try { dataFileHandle = (await idbGet(DATA_FILE_KEY)) || null; } catch (e) { dataFileHandle = null; }
    if (!dataFileHandle) return;
    let perm = 'prompt';
    try { perm = await dataFileHandle.queryPermission({ mode: 'readwrite' }); } catch (e) {}
    if (perm === 'granted') { fileStorageActive = true; await syncWithDataFile(); }
    else setFileStatus('needs-permission', dataFileHandle.name);
}
document.getElementById('file-storage-connect-btn').addEventListener('click', connectDataFile);
document.getElementById('file-storage-reconnect-btn').addEventListener('click', reconnectDataFile);
document.getElementById('file-storage-disconnect-btn').addEventListener('click', async () => {
    await disconnectDataFile();
    showToast('Datendatei getrennt — Daten bleiben im Browser gespeichert.');
});

// SERVICE WORKER (offline-fähig; nur unter https/localhost möglich)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

// INIT
loadStorage(); renderClassList(); renderClassDetail(); renderPersonList(); switchTab('classes');
// Nach einem Reload durch "Neue Klasse" die eben angelegte Klasse wieder auswählen.
try {
    const pending = sessionStorage.getItem('tg2_selectClassAfterReload');
    if (pending !== null) {
        sessionStorage.removeItem('tg2_selectClassAfterReload');
        const id = parseInt(pending, 10);
        if (classes.find(c => c.id === id)) selectClass(id);
    }
} catch (e) {}
initDataFile();
