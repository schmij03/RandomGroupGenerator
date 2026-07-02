// STATE
let classes = [], classIdCounter = 1, stuIdCounter = 1;
let activeClassId = null, selAttendClassId = null, presentIds = new Set();
let persons = [], personIdCounter = 1;

const GENDER_ICONS = {
    female:  '<i class="fas fa-venus text-pink-500" title="Weiblich"></i>',
    male:    '<i class="fas fa-mars text-blue-500" title="Männlich"></i>',
    diverse: '<i class="fas fa-genderless text-purple-500" title="Divers"></i>'
};

// STORAGE
function saveClasses() {
    try { localStorage.setItem('tg2_classes', JSON.stringify(classes)); localStorage.setItem('tg2_classId', String(classIdCounter)); localStorage.setItem('tg2_stuId', String(stuIdCounter)); } catch(e) {}
}
function savePersons() {
    try { localStorage.setItem('tg2_persons', JSON.stringify(persons)); localStorage.setItem('tg2_personId', String(personIdCounter)); } catch(e) {}
}
function loadStorage() {
    try {
        const c = localStorage.getItem('tg2_classes');
        if (c) { classes = JSON.parse(c); classIdCounter = parseInt(localStorage.getItem('tg2_classId')||'1',10); stuIdCounter = parseInt(localStorage.getItem('tg2_stuId')||'1',10); }
        const p = localStorage.getItem('tg2_persons');
        if (p) { persons = JSON.parse(p); personIdCounter = parseInt(localStorage.getItem('tg2_personId')||'1',10); }
    } catch(e) {}
}

// TABS
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
function switchTab(tab) {
    ['classes','attendance','teams'].forEach(t => document.getElementById('tab-'+t).classList.toggle('hidden', t !== tab));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    if (tab === 'attendance') refreshAttendanceSelect();
    if (tab === 'teams') renderPersonList();
}

// TAB 1: KLASSEN
const $newClassForm = document.getElementById('new-class-form');
const $newClassName = document.getElementById('new-class-name');
const $newClassErr  = document.getElementById('new-class-error');

document.getElementById('create-class-btn').addEventListener('click', () => { $newClassForm.classList.remove('hidden'); $newClassName.focus(); });
document.getElementById('cancel-class-btn').addEventListener('click', () => { $newClassForm.classList.add('hidden'); $newClassName.value = ''; $newClassErr.classList.add('hidden'); });
document.getElementById('save-class-btn').addEventListener('click', doCreateClass);
$newClassName.addEventListener('keydown', e => { if (e.key === 'Enter') doCreateClass(); });

function doCreateClass() {
    const name = $newClassName.value.trim();
    if (!name) return;
    if (classes.find(c => c.name.toLowerCase() === name.toLowerCase())) { $newClassErr.textContent = `Eine Klasse "${name}" existiert bereits.`; $newClassErr.classList.remove('hidden'); return; }
    classes.push({ id: classIdCounter++, name, students: [] });
    saveClasses();
    $newClassForm.classList.add('hidden'); $newClassName.value = ''; $newClassErr.classList.add('hidden');
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
    if (!cls || !confirm(`Klasse "${cls.name}" wirklich löschen?`)) return;
    classes = classes.filter(c => c.id !== id);
    if (activeClassId === id) activeClassId = null;
    if (selAttendClassId === id) { selAttendClassId = null; presentIds = new Set(); }
    saveClasses(); renderClassList(); renderClassDetail();
}

function renderClassDetail() {
    const panel = document.getElementById('class-detail-panel');
    const noSel = document.getElementById('no-class-selected');
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) { panel.classList.add('hidden'); noSel.classList.remove('hidden'); return; }
    panel.classList.remove('hidden'); noSel.classList.add('hidden');
    document.getElementById('detail-class-name').textContent = cls.name;
    document.getElementById('detail-student-count').textContent = `${cls.students.length} Schüler(in)`;
    renderStudentList(cls);
}

document.getElementById('add-student-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('student-name-input').value.trim();
    const gender = document.querySelector('input[name="student-gender"]:checked').value;
    const errEl = document.getElementById('student-error-msg');
    if (!name || !activeClassId) return;
    const cls = classes.find(c => c.id === activeClassId);
    if (!cls) return;
    if (cls.students.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        errEl.textContent = `"${name}" ist bereits in dieser Klasse.`; errEl.classList.remove('hidden');
        setTimeout(() => errEl.classList.add('hidden'), 3000); return;
    }
    cls.students.push({ id: stuIdCounter++, name, gender });
    saveClasses(); document.getElementById('student-name-input').value = ''; errEl.classList.add('hidden');
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
        const left = document.createElement('div'); left.className = 'flex items-center gap-2';
        const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[s.gender];
        const nameSpan = document.createElement('span'); nameSpan.className = 'text-sm text-gray-700'; nameSpan.textContent = s.name;
        left.appendChild(icon); left.appendChild(nameSpan);
        const delBtn = document.createElement('button');
        delBtn.className = 'text-gray-200 hover:text-red-500 text-xs p-1 transition-colors';
        delBtn.innerHTML = '<i class="fas fa-times"></i>';
        delBtn.addEventListener('click', () => removeStudent(s.id));
        li.appendChild(left); li.appendChild(delBtn); ul.appendChild(li);
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
    const { added, skipped, defaults } = bulkParse(text, (name, gender) => {
        if (cls.students.find(s => s.name.toLowerCase() === name.toLowerCase())) return false;
        cls.students.push({ id: stuIdCounter++, name, gender }); return true;
    });
    saveClasses(); document.getElementById('class-bulk-input').value = '';
    showBulkMsg('class-bulk-msg', added, skipped, defaults);
    setTimeout(() => document.getElementById('class-bulk-area').classList.add('hidden'), 4000);
    renderClassDetail();
});

// KLASSEN IMPORT / EXPORT
document.getElementById('export-classes-btn').addEventListener('click', () => {
    if (classes.length === 0) { alert('Keine Klassen zum Exportieren vorhanden.'); return; }
    const data = classes.map(c => ({ name: c.name, students: c.students.map(s => ({ name: s.name, gender: s.gender })) }));
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
                    if (!cls) { cls = { id: classIdCounter++, name, students: [] }; classes.push(cls); imported++; }
                    (entry.students || []).forEach(s => {
                        const sName = (typeof s === 'string' ? s : s.name || '').trim();
                        if (!sName) return;
                        if (cls.students.find(st => st.name.toLowerCase() === sName.toLowerCase())) return;
                        const gender = (typeof s === 'object' && s.gender) ? s.gender : 'female';
                        cls.students.push({ id: stuIdCounter++, name: sName, gender });
                        importedStudents++;
                    });
                });
            } else {
                // CSV / TXT: "Klasse;Name;Geschlecht" oder "Klasse,Name,Geschlecht" pro Zeile
                const lines = reader.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                lines.forEach(line => {
                    const parts = line.split(/[;,]/).map(p => p.trim());
                    if (parts.length < 2) return;
                    const [className, studentName, genderRaw] = parts;
                    if (!className || !studentName) return;
                    let cls = classes.find(c => c.name.toLowerCase() === className.toLowerCase());
                    if (!cls) { cls = { id: classIdCounter++, name: className, students: [] }; classes.push(cls); imported++; }
                    if (cls.students.find(st => st.name.toLowerCase() === studentName.toLowerCase())) return;
                    let gender = 'female';
                    const g = (genderRaw || '').toLowerCase();
                    if (g.startsWith('m')) gender = 'male'; else if (g.startsWith('d')) gender = 'diverse';
                    cls.students.push({ id: stuIdCounter++, name: studentName, gender });
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
}

document.getElementById('attendance-class-select').addEventListener('change', function() {
    const id = parseInt(this.value, 10);
    const emptyEl = document.getElementById('attendance-empty');
    const contentEl = document.getElementById('attendance-content');
    if (isNaN(id)) {
        selAttendClassId = null; presentIds = new Set();
        emptyEl.classList.remove('hidden'); contentEl.classList.add('hidden'); return;
    }
    if (selAttendClassId !== id) {
        selAttendClassId = id;
        const cls = classes.find(c => c.id === id);
        presentIds = cls ? new Set(cls.students.map(s => s.id)) : new Set();
    }
    emptyEl.classList.add('hidden'); contentEl.classList.remove('hidden');
    renderAttendanceGrid();
});

document.getElementById('all-present-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (cls) { cls.students.forEach(s => presentIds.add(s.id)); renderAttendanceGrid(); }
});
document.getElementById('all-absent-btn').addEventListener('click', () => { presentIds = new Set(); renderAttendanceGrid(); });

function renderAttendanceGrid() {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    document.getElementById('total-students-count').textContent = cls.students.length;
    document.getElementById('present-count').textContent = presentIds.size;
    document.getElementById('load-to-teams-label').textContent = `Teams erstellen mit ${presentIds.size} Schüler${presentIds.size === 1 ? '' : 'n'}`;
    const grid = document.getElementById('attendance-grid');
    grid.innerHTML = '';
    if (cls.students.length === 0) { grid.innerHTML = '<p class="text-sm text-gray-400 col-span-full text-center py-6">Diese Klasse hat noch keine Schüler.</p>'; return; }
    cls.students.forEach(s => {
        const present = presentIds.has(s.id);
        const card = document.createElement('div');
        card.className = `attendance-card flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer select-none ${present ? 'bg-green-50 border-green-400 text-green-900' : 'bg-gray-50 border-gray-200 text-gray-400'}`;
        card.addEventListener('click', () => { if (presentIds.has(s.id)) presentIds.delete(s.id); else presentIds.add(s.id); renderAttendanceGrid(); });
        const checkbox = document.createElement('div');
        checkbox.className = `w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${present ? 'bg-green-500 border-green-500' : 'border-gray-300'}`;
        if (present) checkbox.innerHTML = '<i class="fas fa-check text-white text-xs"></i>';
        const iconSpan = document.createElement('span'); iconSpan.innerHTML = GENDER_ICONS[s.gender];
        const nameSpan = document.createElement('span'); nameSpan.className = 'font-medium text-sm flex-1 truncate'; nameSpan.textContent = s.name;
        card.appendChild(checkbox); card.appendChild(iconSpan); card.appendChild(nameSpan);
        grid.appendChild(card);
    });
}

document.getElementById('load-to-teams-btn').addEventListener('click', () => {
    const cls = classes.find(c => c.id === selAttendClassId);
    if (!cls) return;
    const present = cls.students.filter(s => presentIds.has(s.id));
    if (present.length === 0) { alert('Keine Schüler(innen) als anwesend markiert.'); return; }
    persons = present.map(s => ({ id: personIdCounter++, name: s.name, gender: s.gender }));
    savePersons();
    document.getElementById('source-banner-text').textContent = `Geladen aus "${cls.name}": ${present.length} von ${cls.students.length} Schüler(innen) anwesend.`;
    document.getElementById('source-banner').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
    switchTab('teams');
});

// TAB 3: TEAMS
function addPerson(name, gender) {
    if (persons.find(p => p.name.toLowerCase() === name.toLowerCase())) { showAddError(`"${name}" ist bereits in der Liste.`); return false; }
    persons.push({ id: personIdCounter++, name, gender }); savePersons(); renderPersonList(); return true;
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
    if (!name) return;
    const ok = addPerson(name, gender);
    if (ok) { document.getElementById('person-name').value = ''; document.getElementById('add-error-msg').classList.add('hidden'); }
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
        const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[p.gender];
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

// BULK PARSER (gemeinsam)
function bulkParse(text, addFn) {
    const entries = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    let added = 0, skipped = 0, defaults = 0;
    entries.forEach(entry => {
        let gender = 'female', cleanName = entry, hadTag = false;
        const match = entry.match(/\s+\(?([mwd])\)?$/i);
        if (match) { hadTag = true; const g = match[1].toLowerCase(); if (g==='m') gender='male'; else if (g==='d') gender='diverse'; cleanName = entry.substring(0, match.index).trim(); }
        cleanName = cleanName.replace(/[\s,:\-]+$/, '').trim();
        if (!cleanName) return;
        if (!hadTag) defaults++;
        if (addFn(cleanName, gender)) added++; else skipped++;
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
    const balance = document.getElementById('balance-gender').checked;
    const errEl = document.getElementById('error-msg');
    errEl.classList.add('hidden');
    if (persons.length === 0) { errEl.textContent = 'Bitte füge zuerst Personen hinzu.'; errEl.classList.remove('hidden'); return; }
    if (isNaN(n) || n < 2)   { errEl.textContent = 'Mindestens 2 Teams erforderlich.';  errEl.classList.remove('hidden'); return; }
    if (n > persons.length)  { errEl.textContent = 'Mehr Teams als Teilnehmer.';         errEl.classList.remove('hidden'); return; }
    let teams = Array.from({ length: n }, () => []);
    const shuf = shuffleArray(persons);
    if (balance) {
        const f = shuf.filter(p => p.gender === 'female');
        const m = shuf.filter(p => p.gender === 'male');
        const d = shuf.filter(p => p.gender === 'diverse');
        let idx = 0;
        [f, m, d].forEach(grp => grp.forEach(p => { teams[idx].push(p); idx = (idx + 1) % n; }));
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
            const icon = document.createElement('span'); icon.innerHTML = GENDER_ICONS[p.gender];
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

// INIT
loadStorage(); renderClassList(); renderClassDetail(); renderPersonList(); switchTab('classes');
