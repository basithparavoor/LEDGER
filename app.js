// Initialize Supabase
const SUPABASE_URL = 'https://ldiccnfpxceoqwroehij.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ULn9SF51_hIC0ekDQw4xsw_LsmGR2JX';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userRole = null;
let currentProfileName = '';
let searchTimeout;

// ADD IT RIGHT HERE:
let currentReportStudent = null; 

// DYNAMIC STATE
let PAGE_LIMIT_STUDENTS = 8;
let PAGE_LIMIT_TX = 8;
let studentPage = 1;
let txPage = 1;
let isFetchingStudents = false;
let hasMoreStudents = true;
let isFetchingTx = false;
let hasMoreTx = true;

// DYNAMIC STATE
let systemLevels = [];

// --- SESSION RESTORE ---
window.addEventListener('DOMContentLoaded', async () => {
    showLoader(true);
    await loadLevels(); // Fetch levels from DB first
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        await checkUserRole(currentUser.id);
        
        // Ensure inline styles are cleared so CSS can take over
        document.getElementById('dashboard-screen').style.display = ''; 
        
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('dashboard-screen').classList.add('active');
        document.getElementById('tx-date').valueAsDate = new Date();
        await loadStudents();
    } else {
        // THE NUKE: If not logged in, violently force the dashboard into hiding
        document.getElementById('dashboard-screen').style.display = 'none';
    }
    showLoader(false);
});
// --- UTILITIES ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '<i class="fas fa-check-circle" style="color: var(--success)"></i>' : '<i class="fas fa-exclamation-circle" style="color: var(--danger)"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3300);
}

function showLoader(show) { document.getElementById('global-loader').classList.toggle('active', show); }
function toggleMobileMenu() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('active');
}
function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

function togglePasswordVisibility(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        iconElement.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function toggleAllCheckboxes(tbodyId, masterCheckbox) {
    const checkboxes = document.querySelectorAll(`#${tbodyId} input[type="checkbox"].row-select`);
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
}
// --- LEVEL MANAGEMENT ---
async function loadLevels() {
    const { data, error } = await supabaseClient.from('levels').select('name').order('created_at');
    if (data) {
        systemLevels = data.map(l => l.name);
        renderLevelDropdowns();
    } else if (error) {
        console.error("Failed to load levels:", error);
    }
}

function renderLevelDropdowns() {
    const dropdowns = document.querySelectorAll('.dynamic-level-dropdown');
    dropdowns.forEach(select => {
        const isFilter = select.id === 'filter-level';
        select.innerHTML = isFilter ? '<option value="">All Levels</option>' : '';
        systemLevels.forEach(level => {
            select.innerHTML += `<option value="${level}">${level}</option>`;
        });
    });
}

async function addLevel() {
    const input = document.getElementById('new-level-input');
    const val = input.value.trim();
    if(val && !systemLevels.includes(val)) {
        showLoader(true);
        const { error } = await supabaseClient.from('levels').insert([{ name: val }]);
        showLoader(false);
        
        if (error) {
            showToast("Failed to add level: " + error.message, "error");
        } else {
            input.value = '';
            await loadLevels(); // Refresh from DB
            openLevelManager();
            showToast("Level Added");
        }
    }
}

function openLevelManager() {
    const list = document.getElementById('level-list');
    list.innerHTML = '';
    systemLevels.forEach((level) => {
        list.innerHTML += `
            <li style="display:flex; justify-content:space-between; align-items:center; padding: 0.8rem; background: var(--surface-solid); border-radius: 8px; border: 1px solid var(--border);">
                <span style="font-weight: 600;">${level}</span>
                <div>
                    <button class="btn-icon" style="width:28px; height:28px; padding:0; margin-right:5px;" onclick="openEditLevel('${level}')"><i class="fas fa-edit" style="font-size:0.8rem;"></i></button>
                    <button class="btn-icon delete" style="width:28px; height:28px; padding:0;" onclick="deleteLevelPrompt('${level}')"><i class="fas fa-trash" style="font-size:0.8rem;"></i></button>
                </div>
            </li>
        `;
    });
    openModal('modal-manage-levels');
}

function deleteLevelPrompt(levelName) {
    showConfirm(
        '<i class="fas fa-trash text-danger"></i> Delete Level',
        `Are you sure you want to delete the level "${levelName}"?`,
        async () => {
            showLoader(true);
            const { error } = await supabaseClient.from('levels').delete().eq('name', levelName);
            showLoader(false);
            
            if (error) showToast("Failed to delete level: " + error.message, "error");
            else {
                await loadLevels();
                openLevelManager();
                showToast("Level Deleted");
            }
        },
        true
    );
}

function openEditLevel(oldName) {
    document.getElementById('edit-level-old-name').value = oldName;
    document.getElementById('edit-level-new-name').value = oldName;
    openModal('modal-edit-level');
}

async function saveLevelEdit() {
    const oldName = document.getElementById('edit-level-old-name').value;
    const newName = document.getElementById('edit-level-new-name').value.trim();
    
    if(!newName || newName === oldName) return closeModal('modal-edit-level');
    if(systemLevels.includes(newName)) return showToast("Level name already exists!", "error");

    showLoader(true);
    
    // 1. Update the level name in the levels table
    const { error: levelErr } = await supabaseClient.from('levels').update({ name: newName }).eq('name', oldName);
    
    if (levelErr) {
        showLoader(false);
        return showToast("Failed to rename level: " + levelErr.message, "error");
    }
    
    // 2. Cascade update to all students assigned to the old level
    const { error: studentErr } = await supabaseClient.from('students').update({ level: newName }).eq('level', oldName);
    
    showLoader(false);
    
    if (studentErr) {
        showToast("Level renamed, but failed to update some students.", "warning");
    } else {
        showToast("Level and students updated successfully!");
    }
    
    closeModal('modal-edit-level');
    await loadLevels();
    openLevelManager();
    
    // Refresh student view to show the new level names instantly
    if (document.getElementById('students-section').classList.contains('active')) {
        loadStudents();
    }
}

function showConfirm(title, message, onConfirm, isDanger = false) {
    document.getElementById('confirm-title').innerHTML = title;
    document.getElementById('confirm-message').innerText = message;
    
    const btn = document.getElementById('confirm-action-btn');
    if (isDanger) {
        btn.style.background = 'var(--danger)';
        btn.style.boxShadow = '0 4px 6px -1px rgba(239, 68, 68, 0.2)';
    } else {
        btn.style.background = 'var(--primary)';
        btn.style.boxShadow = '0 4px 6px -1px var(--primary-glow)';
    }
    
    btn.onclick = () => {
        closeModal('modal-confirm');
        onConfirm();
    };
    
    openModal('modal-confirm');
}

// --- MOBILE DETAILS MODAL ---
function openMobileDetails(event, type, dataStr) {
    if (window.innerWidth > 900) return; // Only trigger on mobile
    if (event.target.closest('button') || event.target.closest('input')) return; // Ignore button/checkbox clicks
    
    const data = JSON.parse(decodeURIComponent(dataStr));
    const container = document.getElementById('mobile-detail-content');
    container.innerHTML = '';
    
    if(type === 'student') {
        const balanceColor = parseFloat(data.balance || 0) < 0 ? 'var(--danger)' : 'var(--text-main)';
        
        // Build Admin-specific action controls
        let actionControls = '';
        if (userRole === 'admin') {
            actionControls = `
                <button class="btn-secondary" style="padding: 0.5rem;" onclick="closeModal('modal-mobile-detail'); viewStudentReport('${data.id}', '${data.name.replace(/'/g, "\\'")}', ${parseFloat(data.balance || 0)})">
                    <i class="fas fa-chart-line text-emerald"></i> Report
                </button>
                <button class="btn-icon" onclick="closeModal('modal-mobile-detail'); openEditStudent('${data.id}', '${data.name.replace(/'/g, "\\'")}', '${data.roll_number || ''}', '${data.level || 'General'}', '${data.contact_info || ''}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="closeModal('modal-mobile-detail'); deleteStudent('${data.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }

        container.innerHTML = `
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Name & ID</p>
                <h4 style="font-size:1.2rem; color:var(--text-main);">${data.name}</h4>
                <p style="font-size:0.9rem; color:var(--text-muted);">${data.roll_number || 'N/A'}</p>
            </div>
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Level</p>
                <p style="font-weight:600;">${data.level || 'General'}</p>
            </div>
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Contact Info</p>
                <p style="font-weight:600;">${data.contact_info || 'N/A'}</p>
            </div>
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Current Balance</p>
                <p style="font-weight:800; font-size:1.4rem; color:${balanceColor};">₹${parseFloat(data.balance || 0).toFixed(2)}</p>
            </div>
            <!-- INJECTED MOBILE ACTIONS -->
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn-primary" style="padding: 0.5rem;" onclick="closeModal('modal-mobile-detail'); openAddTransaction('${data.id}')">
                    <i class="fas fa-plus"></i> Transaction
                </button>
                ${actionControls}
            </div>
        `;
    } else if (type === 'tx') {
        
        // Build Admin-specific transaction controls
        let txControls = '';
        if (userRole === 'admin') {
            if (data.status === 'pending') {
                txControls += `
                    <button class="btn-icon" style="color: var(--success);" onclick="closeModal('modal-mobile-detail'); updateTxStatus('${data.id}', 'verified')"><i class="fas fa-check-circle"></i></button>
                    <button class="btn-icon" style="color: var(--danger);" onclick="closeModal('modal-mobile-detail'); updateTxStatus('${data.id}', 'rejected')"><i class="fas fa-times-circle"></i></button>
                `;
            }
            txControls += `
                <button class="btn-icon" onclick="closeModal('modal-mobile-detail'); openEditTransaction('${data.id}', '${data.transaction_type}', '${data.payment_mode || 'Cash'}', '${data.amount}', '${data.remarks}', '${data.transaction_date}')"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" onclick="closeModal('modal-mobile-detail'); deleteTransaction('${data.id}')"><i class="fas fa-trash"></i></button>
            `;
        }

        container.innerHTML = `
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Student</p>
                <h4 style="font-size:1.2rem; color:var(--text-main);">${data.students.name}</h4>
                <p style="font-size:0.9rem; color:var(--text-muted);">Date: ${new Date(data.transaction_date).toLocaleDateString()}</p>
            </div>
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Type & Mode</p>
                <p style="font-weight:600; text-transform:uppercase;">${data.transaction_type} • ${data.payment_mode}</p>
            </div>
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Amount</p>
                <p style="font-weight:800; font-size:1.4rem; color:var(--primary);">₹${parseFloat(data.amount).toFixed(2)}</p>
            </div>
            <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Remarks</p>
                <p style="font-size:0.95rem; color:var(--text-main);">${data.remarks || 'None'}</p>
            </div>
             <!-- INJECTED MOBILE ACTIONS -->
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                ${txControls}
            </div>
        `;
    }
    openModal('modal-mobile-detail');
}

// --- AUTHENTICATION ---
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return showToast("Please enter email and password.", "error");

    showLoader(true);
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        showLoader(false);
        return showToast("Login Failed: " + error.message, "error");
    }
    
    currentUser = data.user;
    await checkUserRole(currentUser.id);
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('dashboard-screen').classList.add('active');
    document.getElementById('tx-date').valueAsDate = new Date();
    await loadStudents();
    showLoader(false);
}

async function checkUserRole(userId) {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) {
        userRole = data.role;
        currentProfileName = data.name || 'Staff Member';
        
        document.getElementById('user-role-badge').innerText = userRole.toUpperCase();
        document.getElementById('display-user-name').innerText = currentProfileName;
        
        if (userRole === 'admin') {
            document.getElementById('add-student-btn').style.display = 'inline-flex';
            document.getElementById('admin-users-tab').style.display = 'flex';
            // Add inside checkUserRole under if (userRole === 'admin') {
document.querySelectorAll('.admin-only-element').forEach(el => el.style.display = 'inline-flex');
        } else if (userRole === 'staff') {
            document.getElementById('staff-wallet-tab').style.display = 'flex';
        }
    } else {
        document.getElementById('user-role-badge').innerText = "STAFF";
        document.getElementById('display-user-name').innerText = currentUser.email.split('@')[0];
    }
}

// --- NAVIGATION & PAGINATION LOGIC ---
function showSection(sectionId) {
    document.querySelectorAll('.data-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active-nav'));
    
    document.getElementById(`${sectionId}-section`).classList.add('active');
    event.currentTarget.classList.add('active-nav');
    
    const titles = { 'students': 'Directory Overview', 'transactions': 'Master Ledger', 'users': 'Access Control' };
    document.getElementById('section-title').innerText = titles[sectionId];
    document.getElementById('dashboard-stats').style.display = (sectionId === 'students') ? 'grid' : 'none';

   // Handle Floating Action Button (FAB) Logic
const fab = document.getElementById('mobile-fab');
if (fab) {
    if (userRole === 'admin') {
        if (sectionId === 'students') { fab.style.display = 'flex'; fab.onclick = () => openModal('modal-add-student'); } 
        else if (sectionId === 'users') { fab.style.display = 'flex'; fab.onclick = () => openModal('modal-add-staff'); } 
        else { fab.style.display = 'none'; }
    } else {
        // Staff Mobile Logic: Show on transactions page to add globally
        if (sectionId === 'transactions') {
            fab.style.display = 'flex';
            fab.onclick = () => openGlobalAddTransaction();
        } else {
            fab.style.display = 'none';
        }
    }
}

    if(sectionId === 'students') { studentPage = 1; loadStudents(); }
    if(sectionId === 'transactions') { txPage = 1; loadTransactions(); }
    if(sectionId === 'users' && userRole === 'admin') loadUsers();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updatePageLimit(type, limit) {
    if(type === 'student') {
        PAGE_LIMIT_STUDENTS = parseInt(limit) || 8;
        studentPage = 1;
        loadStudents();
    } else if (type === 'tx') {
        PAGE_LIMIT_TX = parseInt(limit) || 8;
        txPage = 1;
        loadTransactions();
    }
}

function changePage(type, direction) {
    if(type === 'student') {
        studentPage = Math.max(1, studentPage + direction);
        loadStudents();
    } else if (type === 'tx') {
        txPage = Math.max(1, txPage + direction);
        loadTransactions();
    }
}

function debouncedSearch(type) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if(type === 'student') { studentPage = 1; loadStudents(); }
    }, 400);
}
// --- STUDENTS ---
async function loadStudents() {
    const searchTerm = document.getElementById('search-student')?.value.trim() || '';
    const levelFilter = document.getElementById('filter-level')?.value || '';
    
    // 1. Prepare main query
    let query = supabaseClient.from('students').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    let statQuery = supabaseClient.from('students').select('balance');
    
    // MULTI-FIELD SEARCH: Search across Name, Roll Number, or Contact Info
    if (searchTerm) {
        const searchFilter = `name.ilike.%${searchTerm}%,roll_number.ilike.%${searchTerm}%,contact_info.ilike.%${searchTerm}%`;
        query = query.or(searchFilter);
        statQuery = statQuery.or(searchFilter);
    }
    
    if (levelFilter) {
        query = query.eq('level', levelFilter);
        statQuery = statQuery.eq('level', levelFilter);
    }
    
    // Calculate Pagination Range
    const from = (studentPage - 1) * PAGE_LIMIT_STUDENTS;
    const to = from + PAGE_LIMIT_STUDENTS - 1;
    query = query.range(from, to);

    showLoader(true);
    // 2. Execute concurrently
    const [mainRes, statsRes] = await Promise.all([query, statQuery]);
    showLoader(false);

    const { data, count, error } = mainRes;
    const { data: statsData } = statsRes;

    const tbody = document.getElementById('students-body');
    tbody.innerHTML = '';
    
    if (error) {
        // Catch 416 Out of Bounds error and auto-correct to page 1
        if (error.code === 'PGRST103') {
            studentPage = 1;
            return loadStudents();
        }
        return showToast("Error loading students: " + error.message, "error");
    }
    if (data) {
        // Update Stats
        if(statsData) {
            const totalBal = statsData.reduce((sum, s) => sum + parseFloat(s.balance || 0), 0);
            document.getElementById('stat-total-students').innerText = statsData.length;
            document.getElementById('stat-total-balance').innerText = `₹${totalBal.toFixed(2)}`;
        }

        // Update Pagination UI Info
        const totalPages = Math.ceil((count || 0) / PAGE_LIMIT_STUDENTS) || 1;
        document.getElementById('student-page-info').innerText = `Page ${studentPage} of ${totalPages}`;
        
        if(data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--text-muted);">No records found.</td></tr>`;
            return;
        }

        data.forEach((student, index) => {
            const currentBalance = parseFloat(student.balance || 0);
            const balanceColor = currentBalance < 0 ? 'var(--danger)' : 'var(--text-main)';
            const stdLevel = student.level || 'General';
            const delay = index * 0.05;
            
            let actionControls = '';
            if (userRole === 'admin') {
                actionControls = `
                    <button class="btn-secondary" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; margin-right: 5px;" onclick="viewStudentReport('${student.id}', '${student.name.replace(/'/g, "\\'")}', ${currentBalance})">
                        <i class="fas fa-chart-line text-emerald"></i>
                    </button>
                    <button class="btn-icon" title="Edit" onclick="openEditStudent('${student.id}', '${student.name.replace(/'/g, "\\'")}', '${student.roll_number || ''}', '${stdLevel}', '${student.contact_info || ''}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" title="Delete" onclick="deleteStudent('${student.id}')"><i class="fas fa-trash"></i></button>
                `;
            }

            const studentStr = encodeURIComponent(JSON.stringify(student));

            tbody.innerHTML += `
                <tr class="row-enter mobile-tile-row" style="animation-delay: ${delay}s" onclick="openMobileDetails(event, 'student', '${studentStr}')">
                    <td data-label="Select"><input type="checkbox" class="row-select" value="${student.id}"></td>
                    <td data-label="Name & ID">
                        <div>
                            <span style="font-weight: 700; color: var(--text-main); font-size:1.05rem;">${student.name}</span>
                            <span style="font-size: 0.8rem; color: var(--text-muted); display: block;">${student.roll_number || 'No ID'}</span>
                        </div>
                    </td>
                    <td data-label="Level" class="mobile-hide"><span class="badge badge-level">${stdLevel}</span></td>
                    <td data-label="Contact" class="mobile-hide">${student.contact_info || '-'}</td>
                    <td data-label="Balance" style="color: ${balanceColor}; font-weight: 800; font-size: 1.1rem;">₹${currentBalance.toFixed(2)}</td>
                    <td data-label="Actions" class="mobile-actions">
                        <button class="btn-secondary" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; margin-right: 5px;" onclick="openAddTransaction('${student.id}')">
                            <i class="fas fa-plus text-blue"></i>
                        </button>
                        ${actionControls}
                    </td>
                </tr>
            `;
        });
    }
}


async function addStudent() {
    const name = document.getElementById('new-std-name').value;
    const roll = document.getElementById('new-std-roll').value;
    const level = document.getElementById('new-std-level').value;
    const contact = document.getElementById('new-std-contact').value;
    if(!name) return showToast("Name is required!", "error");
    
    showLoader(true);
    const { error } = await supabaseClient.from('students').insert([{ name, roll_number: roll, level: level, contact_info: contact, created_by: currentUser.id }]);
    showLoader(false);

    if (error) showToast("Error: " + error.message, "error");
    else {
        closeModal('modal-add-student');
        document.getElementById('new-std-name').value = ''; 
        showToast("Profile created successfully!");
        loadStudents();
    }
}

function openEditStudent(id, name, roll, level, contact) {
    document.getElementById('edit-std-id').value = id;
    document.getElementById('edit-std-name').value = name;
    document.getElementById('edit-std-roll').value = roll;
    document.getElementById('edit-std-level').value = level;
    document.getElementById('edit-std-contact').value = contact;
    openModal('modal-edit-student');
}

async function saveEditedStudent() {
    const id = document.getElementById('edit-std-id').value;
    const name = document.getElementById('edit-std-name').value;
    const roll = document.getElementById('edit-std-roll').value;
    const level = document.getElementById('edit-std-level').value;
    const contact = document.getElementById('edit-std-contact').value;
    
    showLoader(true);
    const { error } = await supabaseClient.from('students').update({ name, roll_number: roll, level: level, contact_info: contact }).eq('id', id);
    showLoader(false);

    if (error) showToast("Update failed: " + error.message, "error");
    else {
        closeModal('modal-edit-student');
        showToast("Profile updated.");
        loadStudents();
    }
}

// --- STUDENT SPECIFIC REPORTS & STATEMENTS ---

// 2. NOW the functions can safely use it
async function generateStatement() {
    if(!currentReportStudent) return;
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    await viewStudentReport(currentReportStudent.id, currentReportStudent.name, currentReportStudent.balance, startDate, endDate);
}

async function viewStudentReport(studentId, studentName, currentBalance, startDate = null, endDate = null) {
    currentReportStudent = { id: studentId, name: studentName, balance: currentBalance };
    document.getElementById('report-student-name').innerText = studentName;
    
    showLoader(true);
    let query = supabaseClient.from('transactions').select('*').eq('student_id', studentId).order('transaction_date', { ascending: false });
    
    if (endDate) query = query.lte('transaction_date', endDate);
    
    const { data, error } = await query;
    showLoader(false);
    if(error) return showToast("Error loading report.", "error");

    const timeline = document.getElementById('student-report-timeline');
    timeline.innerHTML = '';
    
    let periodCredit = 0;
    let periodDebit = 0;
    let openingBalance = 0;
    let filteredData = [];

    data.forEach(tx => {
        const amt = parseFloat(tx.amount);
        const isCredit = tx.transaction_type === 'credit';
        const impact = isCredit ? amt : -amt;

        if (startDate && new Date(tx.transaction_date) < new Date(startDate)) {
            openingBalance += impact;
        } else {
            filteredData.push(tx);
            if (isCredit) periodCredit += amt;
            else periodDebit += amt;
        }
    });

    const closingBalance = openingBalance + periodCredit - periodDebit;

    document.getElementById('report-total-credit').innerText = `₹${periodCredit.toFixed(2)}`;
    document.getElementById('report-total-debit').innerText = `₹${periodDebit.toFixed(2)}`;
    
    const balEl = document.getElementById('report-student-balance');
    balEl.innerHTML = startDate ? `
        <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Opening: ₹${openingBalance.toFixed(2)}</span>
        ₹${closingBalance.toFixed(2)}
    ` : `₹${currentBalance.toFixed(2)}`;
    balEl.style.color = closingBalance < 0 ? 'var(--danger)' : 'var(--text-main)';

   // ... (Keep the top half of viewStudentReport exactly the same) ...

    if(filteredData.length === 0) {
        timeline.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-muted);">No transactions in this period.</div>';
    } else {
        filteredData.forEach(tx => {
            const amount = parseFloat(tx.amount);
            const isCredit = tx.transaction_type === 'credit';
            const color = isCredit ? 'var(--success)' : 'var(--danger)';
            const icon = isCredit ? 'fa-arrow-down' : 'fa-arrow-up';
            
            // Inject Admin Actions
            let adminActions = '';
            if (userRole === 'admin') {
                adminActions = `
                    <div style="display: flex; gap: 5px; justify-content: flex-end; margin-top: 8px;">
                        <button class="btn-icon" style="width:28px; height:28px; border: 1px solid var(--border);" title="Edit" onclick="closeModal('modal-student-report'); openEditTransaction('${tx.id}', '${tx.transaction_type}', '${tx.payment_mode || 'Cash'}', '${tx.amount}', '${tx.remarks || ''}', '${tx.transaction_date}')"><i class="fas fa-edit" style="font-size:0.75rem;"></i></button>
                        <button class="btn-icon delete" style="width:28px; height:28px; border: 1px solid var(--border);" title="Delete" onclick="closeModal('modal-student-report'); deleteTransaction('${tx.id}')"><i class="fas fa-trash" style="font-size:0.75rem;"></i></button>
                    </div>
                `;
            }

            timeline.innerHTML += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding: 1rem; background: var(--surface-solid); border-radius: 12px; margin-bottom: 0.8rem; border-left: 4px solid ${color};">
                    <div style="display:flex; align-items:center; gap: 1rem;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: white; display:flex; justify-content:center; align-items:center; color:${color}; box-shadow: var(--shadow-soft);">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div>
                            <p style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${tx.payment_mode || 'Cash'}</p>
                            <p style="font-size: 0.75rem; color: var(--text-muted);">${new Date(tx.transaction_date).toLocaleDateString('en-GB')} • ${tx.remarks || 'No remarks'}</p>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <p style="font-weight: 800; font-size: 1.1rem; color: ${color};">${isCredit ? '+' : '-'}₹${amount.toFixed(2)}</p>
                        ${adminActions}
                    </div>
                </div>
            `;
        });
    }
    openModal('modal-student-report');
}

function downloadStudentReportPDF() {
    if(!currentReportStudent) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Student Financial Report", 14, 20);
    doc.setFontSize(12);
    doc.text(`Name: ${currentReportStudent.name}`, 14, 30);
    doc.text(`Current Balance: Rs. ${currentReportStudent.balance.toFixed(2)}`, 14, 38);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 46);
    
    doc.text("Exported detailed history view is not available for timelines directly. Please use global CSV export.", 14, 55);

    doc.save(`Report_${currentReportStudent.name.replace(/\s+/g, '_')}.pdf`);
    showToast("Report Downloaded Successfully!");
}

// --- TRANSACTIONS ---


function openEditTransaction(txId, type, mode, amount, remarks, date) {
    document.getElementById('tx-modal-title').innerText = "Edit Transaction";
    document.getElementById('tx-id').value = txId; 
    // Student ID not updated here, implies keeping original student
    document.getElementById('tx-type').value = type;
    document.getElementById('tx-pay-mode').value = mode;
    document.getElementById('tx-amount').value = amount;
    document.getElementById('tx-remarks').value = remarks === 'null' ? '' : remarks;
    document.getElementById('tx-date').value = date;
    openModal('modal-transaction');
}

// In AUTHENTICATION section
function logout() { 
    showConfirm(
        '<i class="fas fa-sign-out-alt text-danger"></i> Secure Logout', 
        'Are you sure you want to securely log out of the LEDGER Portal?', 
        async () => {
            await supabaseClient.auth.signOut(); 
            location.reload();
        },
        true
    );
}

// In STUDENTS section
function deleteStudent(id) {
    showConfirm(
        '<i class="fas fa-exclamation-triangle text-danger"></i> Delete Student',
        'WARNING: Deleting this student wipes all their transactions. Proceed?',
        async () => {
            showLoader(true);
            await supabaseClient.from('students').delete().eq('id', id);
            showLoader(false);
            showToast("Profile deleted.");
            loadStudents();
        },
        true
    );
}

// In TRANSACTIONS section
function deleteTransaction(txId) {
    showConfirm(
        '<i class="fas fa-undo text-danger"></i> Reverse Transaction',
        'Are you sure you want to reverse this transaction?',
        async () => {
            showLoader(true);
            await supabaseClient.from('transactions').delete().eq('id', txId);
            showLoader(false);
            showToast("Transaction reversed.");
            
            // Reload whatever screen is currently active
            if (document.getElementById('transactions-section').classList.contains('active')) {
                loadTransactions();
            } else {
                loadStudents();
            }
        },
        true
    );
}

function openAddTransaction(studentId) {
    document.getElementById('tx-modal-title').innerText = "Process Transaction";
    document.getElementById('tx-id').value = ""; 
    document.getElementById('tx-student-id').value = studentId;
    document.getElementById('tx-amount').value = "";
    document.getElementById('tx-remarks').value = "";
    document.getElementById('tx-pay-mode').value = "Cash";
    document.getElementById('tx-sent-to-admin').checked = false;
    
    // Toggle checkbox based on type
    const toggleHandover = () => {
        const isCredit = document.getElementById('tx-type').value === 'credit';
        document.getElementById('admin-handover-group').style.display = (userRole === 'staff' && isCredit) ? 'block' : 'none';
    };
    document.getElementById('tx-type').onchange = toggleHandover;
    toggleHandover();
    
    openModal('modal-transaction');
}
async function saveTransaction() {
    const txId = document.getElementById('tx-id').value;
    const studentId = document.getElementById('tx-student-id').value;
    const type = document.getElementById('tx-type').value;
    const mode = document.getElementById('tx-pay-mode').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const remarks = document.getElementById('tx-remarks').value;
    const txDate = document.getElementById('tx-date').value;
    const sentToAdmin = document.getElementById('tx-sent-to-admin').checked;
    
    if(!amount || amount <= 0) return showToast("Enter a valid amount!", "error");
    
    let txStatus = 'verified';
    if (userRole === 'staff' && type === 'credit' && sentToAdmin) {
        txStatus = 'pending';
    }

    const transactionData = {
        student_id: studentId, transaction_type: type, payment_mode: mode, 
        amount, remarks, transaction_date: txDate, created_by: currentUser?.id, 
        status: txStatus, sent_to_admin: sentToAdmin 
    };

    // OFFLINE HANDLING
    if (!navigator.onLine) {
        if (txId) return showToast("Cannot edit transactions while offline.", "error"); // Editing offline is too complex for basic queues
        
        const offlineQueue = JSON.parse(localStorage.getItem('ledger_offline_tx') || '[]');
        offlineQueue.push(transactionData);
        localStorage.setItem('ledger_offline_tx', JSON.stringify(offlineQueue));
        
        closeModal('modal-transaction');
        return showToast("Offline: Transaction queued securely.", "warning");
    }
    
    showLoader(true);
    let error;
    if (txId) {
        const res = await supabaseClient.from('transactions').update(transactionData).eq('id', txId);
        error = res.error;
    } else {
        const res = await supabaseClient.from('transactions').insert([transactionData]);
        error = res.error;
    }
    showLoader(false);
    
    if (error) showToast("Error: " + error.message, "error");
    else {
        closeModal('modal-transaction');
        showToast(txStatus === 'pending' ? "Sent to Admin for verification!" : "Transaction recorded locally!");
        loadTransactions();
    }
}

// Function to process queued transactions when back online
async function syncOfflineTransactions() {
    const offlineQueue = JSON.parse(localStorage.getItem('ledger_offline_tx') || '[]');
    if (offlineQueue.length === 0) return;

    showToast(`Syncing ${offlineQueue.length} offline transactions...`);
    showLoader(true);
    
    const { error } = await supabaseClient.from('transactions').insert(offlineQueue);
    
    showLoader(false);
    
    if (error) {
        showToast("Failed to sync offline transactions. Will retry later.", "error");
    } else {
        localStorage.removeItem('ledger_offline_tx');
        showToast("Offline transactions synced successfully!");
        if (document.getElementById('transactions-section').classList.contains('active')) {
            loadTransactions();
        }
    }
}

async function loadTransactions(isAppend = false) {
    if (isFetchingTx) return;
    isFetchingTx = true;

    try {
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        const payMode = document.getElementById('filter-pay-mode').value;
        const txLevel = document.getElementById('filter-tx-level')?.value;
        const txStatus = document.getElementById('filter-tx-status')?.value;
        
        if (!isAppend) {
            txPage = 1;
            hasMoreTx = true;
        }
        
        let query = supabaseClient.from('transactions').select('*, students!inner(name, level)', { count: 'exact' }).order('transaction_date', { ascending: false });
            
        if (userRole === 'staff') query = query.eq('created_by', currentUser.id);
        if(startDate) query = query.gte('transaction_date', startDate);
        if(endDate) query = query.lte('transaction_date', endDate);
        if(payMode) query = query.eq('payment_mode', payMode);
        if(txLevel) query = query.eq('students.level', txLevel);
        if(txStatus) query = query.eq('status', txStatus); 
        
        const from = (txPage - 1) * PAGE_LIMIT_TX;
        const to = from + PAGE_LIMIT_TX - 1;
        query = query.range(from, to);
        
        if (!isAppend) showLoader(true);
        const { data, count, error } = await query;
        if (!isAppend) showLoader(false);

        if (error) {
            if (error.code === 'PGRST103') {
                txPage = 1;
                isFetchingTx = false;
                return loadTransactions(isAppend);
            }
            throw new Error(error.message); // Send to catch block
        }

        const tbody = document.getElementById('ledger-body');
        if (!isAppend) tbody.innerHTML = '';
        
        if (data) {
            if (data.length < PAGE_LIMIT_TX) {
                hasMoreTx = false;
            }

            const totalPages = Math.ceil((count || 0) / PAGE_LIMIT_TX) || 1;
            document.getElementById('tx-page-info').innerText = `Page ${txPage} of ${totalPages}`;

            if(data.length === 0 && !isAppend) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No transactions found.</td></tr>`;
                isFetchingTx = false;
                return;
            }

            data.forEach((tx, index) => {
                const badgeClass = tx.transaction_type === 'credit' ? 'badge-credit' : 'badge-debit';
                const displayMode = tx.payment_mode || 'Cash';
                const currentStatus = tx.status || 'verified';
                const statusBadgeClass = currentStatus === 'pending' ? 'badge-pending' : (currentStatus === 'rejected' ? 'badge-rejected' : 'badge-verified');
                const delay = index * 0.05;
                
                let actionControls = '';
                if (userRole === 'admin') {
                    if (currentStatus === 'pending') {
                        actionControls += `
                            <button class="btn-icon" style="color: var(--success);" title="Verify" onclick="updateTxStatus('${tx.id}', 'verified')"><i class="fas fa-check-circle"></i></button>
                            <button class="btn-icon" style="color: var(--danger);" title="Reject" onclick="updateTxStatus('${tx.id}', 'rejected')"><i class="fas fa-times-circle"></i></button>
                        `;
                    }
                    actionControls += `
                        <button class="btn-icon" title="Edit" onclick="openEditTransaction('${tx.id}', '${tx.transaction_type}', '${displayMode}', '${tx.amount}', '${tx.remarks}', '${tx.transaction_date}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" title="Delete" onclick="deleteTransaction('${tx.id}')"><i class="fas fa-trash"></i></button>
                    `;
                }
                
                const txStr = encodeURIComponent(JSON.stringify(tx));

                tbody.innerHTML += `
                    <tr class="row-enter mobile-tile-row" style="animation-delay: ${delay}s" onclick="openMobileDetails(event, 'tx', '${txStr}')">
                        <td data-label="Select"><input type="checkbox" class="row-select" value="${tx.id}"></td>
                        <td data-label="Date" style="font-weight: 500;">${new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                        <td data-label="Student" style="font-weight: 700;">${tx.students.name}</td>
                        <td data-label="Type, Mode & Status">
                            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                <span class="badge ${badgeClass}">${tx.transaction_type.toUpperCase()}</span>
                                <span class="badge ${statusBadgeClass}">${currentStatus.toUpperCase()}</span>
                                ${tx.sent_to_admin ? '<span class="badge badge-level"><i class="fas fa-arrow-right"></i> Admin</span>' : ''}
                            </div>
                            <span class="badge badge-mode" style="display:inline-block; margin-top:4px;"><i class="fas fa-credit-card"></i> ${displayMode}</span>
                        </td>
                        <td data-label="Amount" style="font-weight: 800; font-size: 1.1rem; color: var(--text-main);">₹${parseFloat(tx.amount).toFixed(2)}</td>
                        <td data-label="Remarks" class="mobile-hide" style="color: var(--text-muted); font-size: 0.85rem;">${tx.remarks || '-'}</td>
                        <td data-label="Actions" class="mobile-actions" style="display: flex; gap: 4px;">
                            ${actionControls}
                        </td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        showToast("Error loading transactions: " + err.message, "error");
    } finally {
        isFetchingTx = false; // Always unlocks, even if the code fails
    }
}

function updateTxStatus(txId, newStatus) {
    const actionName = newStatus === 'verified' ? 'Verify' : 'Reject';
    const actionColor = newStatus === 'verified' ? 'text-emerald' : 'text-danger';
    
    showConfirm(
        `<i class="fas fa-shield-alt ${actionColor}"></i> ${actionName} Transaction`,
        `Are you sure you want to ${actionName.toLowerCase()} this transaction?`,
        async () => {
            showLoader(true);
            const { error } = await supabaseClient.from('transactions').update({ status: newStatus }).eq('id', txId);
            showLoader(false);
            
            if (error) showToast("Error: " + error.message, "error");
            else {
                showToast(`Transaction ${newStatus}!`);
                loadTransactions();
                // Optionally reload students if balance is calculated via DB triggers
                if (document.getElementById('students-section').classList.contains('active')) {
                    loadStudents();
                }
            }
        }
    );
}
// --- USERS, STAFF BALANCES & SETTLEMENTS ---
async function loadUsers() {
    const searchStaff = document.getElementById('search-staff')?.value.toLowerCase().trim() || '';
    
    const { data: profiles } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
    const { data: allTx } = await supabaseClient.from('transactions').select('created_by, transaction_type, amount, sent_to_admin, status');
    const { data: allSettlements } = await supabaseClient.from('staff_settlements').select('staff_id, amount');

    const tbody = document.getElementById('users-body');
    tbody.innerHTML = '';
    
    if(profiles) {
        profiles.forEach((user, index) => {
            const rawName = user.name || 'Unknown';
            const safeName = rawName.replace(/'/g, "\\'");
            const userEmail = user.email || 'N/A';
            
            // LOCAL SEARCH FILTER: Skip this user if they don't match the search query
            if (searchStaff && !rawName.toLowerCase().includes(searchStaff) && !userEmail.toLowerCase().includes(searchStaff)) {
                return;
            }

            let staffBalance = 0;
            
            if (allTx) {
                allTx.filter(t => t.created_by === user.id && t.status === 'verified').forEach(t => {
                    const amt = parseFloat(t.amount);
                    if (t.transaction_type === 'credit' && !t.sent_to_admin) staffBalance += amt;
                    if (t.transaction_type === 'debit') staffBalance -= amt;
                });
            }
            
            if (allSettlements) {
                allSettlements.filter(s => s.staff_id === user.id).forEach(s => {
                    staffBalance += parseFloat(s.amount);
                });
            }

            const balColor = staffBalance < 0 ? 'var(--danger)' : 'var(--text-main)';
            const delay = index * 0.05;
            
            tbody.innerHTML += `
                <tr class="row-enter" style="animation-delay: ${delay}s; ${user.role === 'suspended' ? 'opacity: 0.5;' : ''}">
                    <td data-label="Name" style="font-weight: 700;">${rawName}</td>
                    <td data-label="Identifier" style="font-weight: 500; color: var(--text-muted);">${userEmail}</td>
                    <td data-label="Access Level">
                        <select class="premium-select" style="padding:0.4rem; margin:0;" onchange="updateUserRole('${user.id}', this.value)" ${user.id === currentUser.id ? 'disabled' : ''}>
                            <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Staff</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>Suspended</option>
                        </select>
                    </td>
                    <td data-label="Wallet Balance" style="font-weight: 800; color: ${balColor};">
                        ₹${staffBalance.toFixed(2)}
                    </td>
                    <td data-label="Actions" style="display:flex; gap:0.5rem; justify-content:flex-end;">
                        <button class="btn-secondary" title="View Ledger" onclick="openStaffLedger('${user.id}', '${safeName}')"><i class="fas fa-file-invoice text-blue"></i></button>
                        ${staffBalance < 0 ? `<button class="btn-secondary" title="Settle Balance" onclick="openSettleModal('${user.id}', '${safeName}')"><i class="fas fa-hand-holding-usd text-emerald"></i></button>` : ''}
                    </td>
                </tr>
            `;
        });
    }
}

function openSettleModal(staffId, staffName) {
    document.getElementById('settle-staff-id').value = staffId;
    document.getElementById('settle-staff-name').innerText = staffName;
    document.getElementById('settle-amount').value = '';
    document.getElementById('settle-details').value = '';
    openModal('modal-settle-staff');
}

async function saveStaffSettlement() {
    const staffId = document.getElementById('settle-staff-id').value;
    const amount = parseFloat(document.getElementById('settle-amount').value);
    const details = document.getElementById('settle-details').value;
    
    if(!amount || amount <= 0) return showToast("Enter a valid amount!", "error");
    
    showLoader(true);
    const { error } = await supabaseClient.from('staff_settlements').insert([{
        staff_id: staffId, amount: amount, payment_details: details, created_by: currentUser.id
    }]);
    showLoader(false);
    
    if(error) showToast("Error: " + error.message, "error");
    else {
        closeModal('modal-settle-staff');
        showToast("Settlement recorded successfully!");
        loadUsers();
    }
}

// --- STAFF LEDGER EXPORT & VIEW ---
let currentStaffLedgerData = [];
let currentStaffLedgerName = '';

async function openStaffLedger(targetUserId, targetUserName = '') {
    const targetId = targetUserId === 'me' ? currentUser.id : targetUserId;
    currentStaffLedgerName = targetUserId === 'me' ? currentProfileName : targetUserName;
    
    document.getElementById('staff-ledger-title').innerText = targetUserId === 'me' ? 'My Wallet' : `${currentStaffLedgerName}'s Wallet`;
    
    showLoader(true);
    
    const [txRes, setRes] = await Promise.all([
        supabaseClient.from('transactions').select('*, students(name)').eq('created_by', targetId).order('transaction_date', { ascending: false }),
        supabaseClient.from('staff_settlements').select('*').eq('staff_id', targetId).order('created_at', { ascending: false })
    ]);
    
    showLoader(false);
    if(txRes.error || setRes.error) return showToast("Error loading ledger.", "error");

    const timeline = document.getElementById('staff-ledger-timeline');
    timeline.innerHTML = '';
    currentStaffLedgerData = [];
    let runningBalance = 0;

    txRes.data.forEach(tx => {
        if(tx.status !== 'verified') return;
        const amt = parseFloat(tx.amount);
        let impact = 0;
        
        if (tx.transaction_type === 'credit' && !tx.sent_to_admin) impact = amt;
        if (tx.transaction_type === 'debit') impact = -amt;
        
        if (impact !== 0) {
            runningBalance += impact;
            currentStaffLedgerData.push({
                rawTx: tx, // Store raw data for editing
                isSettlement: false,
                date: new Date(tx.transaction_date),
                title: `Student: ${tx.students?.name || 'Unknown'}`,
                desc: `${tx.transaction_type.toUpperCase()} • ${tx.payment_mode}`,
                impact: impact
            });
        }
    });

    setRes.data.forEach(s => {
        const amt = parseFloat(s.amount);
        runningBalance += amt;
        currentStaffLedgerData.push({
            rawTx: s,
            isSettlement: true,
            date: new Date(s.created_at),
            title: `Reimbursement from Admin`,
            desc: `Ref: ${s.payment_details || 'N/A'}`,
            impact: amt
        });
    });

    currentStaffLedgerData.sort((a, b) => b.date - a.date);

    const balEl = document.getElementById('staff-ledger-balance');
    balEl.innerText = `₹${runningBalance.toFixed(2)}`;
    balEl.style.color = runningBalance < 0 ? 'var(--danger)' : 'var(--text-main)';

    if(currentStaffLedgerData.length === 0) {
        timeline.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-muted);">No wallet activity found.</div>';
    } else {
        currentStaffLedgerData.forEach(item => {
            const isPositive = item.impact > 0;
            const color = isPositive ? 'var(--success)' : 'var(--danger)';
            const icon = item.title.includes('Reimbursement') ? 'fa-hand-holding-usd' : (isPositive ? 'fa-arrow-down' : 'fa-arrow-up');
            const sign = isPositive ? '+' : '';

            // Inject Admin Actions
            let adminActions = '';
            if (userRole === 'admin' && !item.isSettlement) {
                adminActions = `
                    <div style="display: flex; gap: 5px; justify-content: flex-end; margin-top: 8px;">
                        <button class="btn-icon" style="width:28px; height:28px; border: 1px solid var(--border);" title="Edit" onclick="closeModal('modal-staff-ledger'); openEditTransaction('${item.rawTx.id}', '${item.rawTx.transaction_type}', '${item.rawTx.payment_mode || 'Cash'}', '${item.rawTx.amount}', '${item.rawTx.remarks || ''}', '${item.rawTx.transaction_date}')"><i class="fas fa-edit" style="font-size:0.75rem;"></i></button>
                        <button class="btn-icon delete" style="width:28px; height:28px; border: 1px solid var(--border);" title="Delete" onclick="closeModal('modal-staff-ledger'); deleteTransaction('${item.rawTx.id}')"><i class="fas fa-trash" style="font-size:0.75rem;"></i></button>
                    </div>
                `;
            }

            timeline.innerHTML += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding: 1rem; background: var(--surface-solid); border-radius: 12px; margin-bottom: 0.8rem; border-left: 4px solid ${color};">
                    <div style="display:flex; align-items:center; gap: 1rem;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: white; display:flex; justify-content:center; align-items:center; color:${color}; box-shadow: var(--shadow-soft);">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div>
                            <p style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${item.title}</p>
                            <p style="font-size: 0.75rem; color: var(--text-muted);">${item.date.toLocaleDateString('en-GB')} • ${item.desc}</p>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <p style="font-weight: 800; font-size: 1.1rem; color: ${color};">${sign}₹${item.impact.toFixed(2)}</p>
                        ${adminActions}
                    </div>
                </div>
            `;
        });
    }
    openModal('modal-staff-ledger');
}

function downloadStaffLedgerPDF() {
    if(currentStaffLedgerData.length === 0) return showToast("No data to export", "warning");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`${currentStaffLedgerName} - Wallet Statement`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

    const tableData = currentStaffLedgerData.map(item => [
        item.date.toLocaleDateString('en-GB'),
        item.title,
        item.desc,
        `Rs. ${item.impact.toFixed(2)}`
    ]);

    doc.autoTable({
        startY: 35,
        head: [['Date', 'Description', 'Details', 'Impact']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`Wallet_Statement_${currentStaffLedgerName.replace(/\s+/g, '_')}.pdf`);
    showToast("Statement Downloaded!");
}

async function addStaff() {
    const name = document.getElementById('new-staff-name').value.trim();
    const email = document.getElementById('new-staff-email').value.trim();
    const password = document.getElementById('new-staff-pass').value;
    const role = document.getElementById('new-staff-role').value;
    
    if(!name || !email || !password) return showToast("All fields are required.", "error");
    if(password.length < 6) return showToast("Password must be at least 6 characters.", "error"); // Prevents 422 Error
    
    showLoader(true);
    
    // 1. Create User Auth
    const { data, error } = await supabaseClient.auth.signUp({ 
        email, 
        password,
        options: { data: { name: name, role: role } }
    });
    
    if(error) {
        showLoader(false);
        return showToast("Signup Error: " + error.message, "error");
    }

    // 2. Safely Create Profile only if Auth succeeded
    if (data && data.user) {
        const { error: profileError } = await supabaseClient.from('profiles').insert([{ 
            id: data.user.id, 
            email: email, 
            name: name, 
            role: role 
        }]);
        
        showLoader(false);

        if(profileError) {
            showToast("User created, but profile failed: " + profileError.message, "warning");
        } else {
            closeModal('modal-add-staff');
            showToast("Staff Member Provisioned!");
            loadUsers();
        }
    } else {
        showLoader(false);
        showToast("Signup failed. Check email or Supabase settings.", "error");
    }
}

function exportData(type, section) {
    const tableId = section === 'students' ? '#students-table' : '#transactions-table';
    const filename = `LEDGER_${section}_Export_${new Date().toISOString().split('T')[0]}`;
    const table = document.querySelector(tableId);
    
    if (type === 'excel') {
        // Use SheetJS to parse the HTML table directly into a workbook
        const wb = XLSX.utils.table_to_book(table, { sheet: "Data" });
        // Export file
        XLSX.writeFile(wb, `${filename}.xlsx`);
        showToast("Excel Exported Successfully!");
    } 
    // ... keep your existing 'csv' and 'pdf' logic below here
    if (type === 'csv') {
        const table = document.querySelector(tableId);
        let data = [];
        let rows = table.querySelectorAll("tr");
        for (let row of rows) {
            let rowData = [];
            let cells = row.querySelectorAll("th, td");
            for (let i = 1; i < cells.length - 1; i++) {
                rowData.push(cells[i].innerText.replace(/\n/g, ' '));
            }
            data.push(rowData);
        }
        let csv = Papa.unparse(data);
        let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        let link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        showToast("CSV Exported Successfully!");
        
    } else if (type === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        
        doc.setFontSize(16);
        doc.text(`LEDGER Institution - ${section.toUpperCase()} Data Export`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

        doc.autoTable({
            html: tableId,
            startY: 28,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235] },
            columns: section === 'students' ? 
                [{header: 'Name/ID', dataKey: 1}, {header: 'Level', dataKey: 2}, {header: 'Contact', dataKey: 3}, {header: 'Balance', dataKey: 4}] : 
                [{header: 'Date', dataKey: 1}, {header: 'Student', dataKey: 2}, {header: 'Type/Mode', dataKey: 3}, {header: 'Amount', dataKey: 4}, {header: 'Remarks', dataKey: 5}]
        });

        doc.save(`${filename}.pdf`);
        showToast("PDF Exported Successfully!");
    }
}

function openGlobalAddTransaction() {
    document.getElementById('tx-modal-title').innerText = "New Transaction";
    document.getElementById('tx-id').value = ""; 
    document.getElementById('tx-student-id').value = ""; // Reset
    document.getElementById('tx-amount').value = "";
    document.getElementById('tx-remarks').value = "";
    document.getElementById('tx-pay-mode').value = "Cash";
    document.getElementById('tx-sent-to-admin').checked = false;
    
    // Show the level/student selectors
    document.getElementById('global-tx-selectors').style.display = 'block';
    document.getElementById('global-tx-student').innerHTML = '<option value="">Select Level First</option>';
    document.getElementById('global-tx-student').disabled = true;
    
    openModal('modal-transaction');
}

async function loadStudentsForDropdown(level) {
    const studentSelect = document.getElementById('global-tx-student');
    if (!level) {
        studentSelect.innerHTML = '<option value="">Select Level First...</option>';
        studentSelect.disabled = true;
        return;
    }
    
    studentSelect.disabled = false;
    studentSelect.innerHTML = '<option value="">Loading...</option>';
    
    const { data, error } = await supabaseClient.from('students').select('id, name, roll_number').eq('level', level).order('name');
    
    if (data) {
        studentSelect.innerHTML = '<option value="">-- Choose Student --</option>';
        data.forEach(std => {
            studentSelect.innerHTML += `<option value="${std.id}">${std.name} (${std.roll_number || 'No ID'})</option>`;
        });
    }
}
// --- BULK DELETE LOGIC ---
let pendingBulkDeleteIds = [];
let pendingBulkDeleteTable = '';

function triggerBulkDelete() {
    // Determine which tab we are currently on
    const activeSection = document.querySelector('.data-section.active').id;
    pendingBulkDeleteTable = activeSection === 'students-section' ? 'students' : (activeSection === 'transactions-section' ? 'transactions' : null);
    
    if (!pendingBulkDeleteTable) return;

    // Grab all checked boxes in the current table
    const tbodyId = pendingBulkDeleteTable === 'students' ? 'students-body' : 'ledger-body';
    const checkedBoxes = document.querySelectorAll(`#${tbodyId} input[type="checkbox"].row-select:checked`);
    
    pendingBulkDeleteIds = Array.from(checkedBoxes).map(cb => cb.value);
    
    if (pendingBulkDeleteIds.length === 0) {
        return showToast("Please select at least one record to delete.", "warning");
    }

    // Populate the modal and show it
    document.getElementById('bulk-delete-count').innerText = pendingBulkDeleteIds.length;
    document.getElementById('bulk-delete-confirm-text').value = ''; 
    openModal('modal-bulk-delete');
}

async function executeBulkDelete() {
    // 1. Enforce the double verification
    const confirmText = document.getElementById('bulk-delete-confirm-text').value;
    if (confirmText !== 'CONFIRM') {
        return showToast("You must type CONFIRM exactly to proceed.", "error");
    }

    showLoader(true);
    
    // 2. Execute the bulk delete using Supabase .in()
    const { error } = await supabaseClient
        .from(pendingBulkDeleteTable)
        .delete()
        .in('id', pendingBulkDeleteIds);
        
    showLoader(false);

    // 3. Handle UI response
    if (error) {
        showToast("Bulk Delete Failed: " + error.message, "error");
    } else {
        closeModal('modal-bulk-delete');
        showToast(`Successfully deleted ${pendingBulkDeleteIds.length} records!`);
        
        // Uncheck the master header checkboxes
        document.querySelectorAll('thead input[type="checkbox"]').forEach(cb => cb.checked = false);
        
        // Refresh the correct data table
     // Refresh the correct data table
        if (pendingBulkDeleteTable === 'students') loadStudents();
        else loadTransactions();
    }
} // <-- This should be the final line of app.js