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
let currentStudentReportData = []; // Adds a global bucket for the PDF to read

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
        // Correctly apply the "All Levels" placeholder to BOTH filter dropdowns
        if (select.id === 'filter-level' || select.id === 'filter-tx-level') {
            select.innerHTML = '<option value="">All Levels</option>';
        } else if (select.id === 'global-tx-level') {
            select.innerHTML = '<option value="">Select Level</option>';
        } else {
            select.innerHTML = ''; 
        }
        
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
        
        // CRITICAL FIX: Safe parsing so mobile doesn't crash
        const safeStudentName = data.students?.name || 'Unknown Student';

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
                <h4 style="font-size:1.2rem; color:var(--text-main);">${safeStudentName}</h4>
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
    
    // CRITICAL FIX: Strip the "Nuke" inline style so the dashboard can actually become visible
    document.getElementById('dashboard-screen').style.display = ''; 
    
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
        
        // Update Sidebar
        document.getElementById('user-role-badge').innerText = userRole.toUpperCase();
        document.getElementById('display-user-name').innerText = currentProfileName;
        
        // NEW: Update Topbar
        const topNameEl = document.getElementById('topbar-user-name');
        const topRoleEl = document.getElementById('topbar-user-role');
        if (topNameEl) topNameEl.innerText = currentProfileName;
        if (topRoleEl) topRoleEl.innerText = userRole.toUpperCase();
        
        // Admin vs Staff UI Toggle
        if (userRole === 'admin') {
            document.getElementById('add-student-btn').style.display = 'inline-flex';
            document.getElementById('admin-users-tab').style.display = 'flex';
            document.querySelectorAll('.admin-only-element').forEach(el => el.style.display = 'inline-flex');
        } else if (userRole === 'staff') {
            document.getElementById('staff-wallet-tab').style.display = 'flex';
        }
    } else {
        // Fallback if profile doesn't exist
        const fallbackName = currentUser.email.split('@')[0];
        
        // Update Sidebar Fallback
        document.getElementById('user-role-badge').innerText = "STAFF";
        document.getElementById('display-user-name').innerText = fallbackName;
        
        // Update Topbar Fallback
        const topNameEl = document.getElementById('topbar-user-name');
        const topRoleEl = document.getElementById('topbar-user-role');
        if (topNameEl) topNameEl.innerText = fallbackName;
        if (topRoleEl) topRoleEl.innerText = "STAFF";
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
            // Staff Mobile Logic: Disable FAB completely. They must click a student in the Directory to add a transaction.
            fab.style.display = 'none';
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
async function loadStudents(isAppend = false) {
    if (isFetchingStudents) return;
    isFetchingStudents = true;

    try {
        const searchTerm = document.getElementById('search-student')?.value.trim() || '';
        const levelFilter = document.getElementById('filter-level')?.value || '';
        
        if (!isAppend) {
            studentPage = 1;
            hasMoreStudents = true;
        }
        
        let query = supabaseClient.from('students').select('*', { count: 'exact' }).order('created_at', { ascending: false });
        let statQuery = supabaseClient.from('students').select('balance');
        
        if (searchTerm) {
            const searchFilter = `name.ilike.%${searchTerm}%,roll_number.ilike.%${searchTerm}%,contact_info.ilike.%${searchTerm}%`;
            query = query.or(searchFilter);
            statQuery = statQuery.or(searchFilter);
        }
        
        if (levelFilter) {
            query = query.eq('level', levelFilter);
            statQuery = statQuery.eq('level', levelFilter);
        }
        
        const from = (studentPage - 1) * PAGE_LIMIT_STUDENTS;
        const to = from + PAGE_LIMIT_STUDENTS - 1;
        query = query.range(from, to);

        if (!isAppend) showLoader(true);
        const [mainRes, statsRes] = await Promise.all([query, statQuery]);
        if (!isAppend) showLoader(false);

        const { data, count, error } = mainRes;
        const { data: statsData } = statsRes;

        if (error) {
            if (error.code === 'PGRST103') {
                studentPage = 1;
                isFetchingStudents = false;
                return loadStudents(isAppend);
            }
            throw new Error(error.message);
        }

        const tbody = document.getElementById('students-body');
        if (!isAppend) tbody.innerHTML = '';
        
        if (data) {
            if (data.length < PAGE_LIMIT_STUDENTS) {
                hasMoreStudents = false; // Stop auto-loading if we run out of data
            }

            if(statsData && !isAppend) {
                const totalBal = statsData.reduce((sum, s) => sum + parseFloat(s.balance || 0), 0);
                document.getElementById('stat-total-students').innerText = statsData.length;
                document.getElementById('stat-total-balance').innerText = `₹${totalBal.toFixed(2)}`;
            }

            const totalPages = Math.ceil((count || 0) / PAGE_LIMIT_STUDENTS) || 1;
            document.getElementById('student-page-info').innerText = `Page ${studentPage} of ${totalPages}`;
            
            if(data.length === 0 && !isAppend) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--text-muted);">No records found.</td></tr>`;
                isFetchingStudents = false;
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
    } catch (err) {
        showToast("Error loading students: " + err.message, "error");
    } finally {
        isFetchingStudents = false; // Always unlocks
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

    // Add this right under filteredData.push(tx); loop or after the loop finishes:
    currentStudentReportData = filteredData;
    
  // Add this right under filteredData.push(tx); loop or after the loop finishes:
    currentStudentReportData = filteredData;
    
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
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // --- PREMIUM HEADER GRAPHICS ---
    doc.setFillColor(37, 99, 235); // Primary Blue
    doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setFillColor(30, 64, 175); // Darker Accent Blue Stripe
    doc.rect(0, 45, pageWidth, 3, 'F');

    // Abstract Geometric Logo
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1.2);
    doc.rect(14, 14, 10, 10, 'S'); // Outline square
    doc.setFillColor(255, 255, 255);
    doc.rect(18, 18, 10, 10, 'F'); // Solid overlap square

    // Institution Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("LEDGER", 34, 25);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("INSTITUTIONAL FINANCE", 34, 32);
    
    // Document Title (Right Aligned)
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("FINANCIAL STATEMENT", pageWidth - 14, 25, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, pageWidth - 14, 32, { align: 'right' });

    // --- REPORT METADATA ---
    doc.setTextColor(15, 23, 42); // Slate Gray
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("PREPARED FOR:", 14, 60);
    
    doc.setFontSize(14);
    doc.text(currentReportStudent.name.toUpperCase(), 14, 68);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // Muted text
    doc.setFont("helvetica", "normal");
    doc.text("Current Standing Balance", 14, 76);
    
    // Big Balance Display
    doc.setTextColor(currentReportStudent.balance < 0 ? 220 : 15, currentReportStudent.balance < 0 ? 38 : 23, currentReportStudent.balance < 0 ? 38 : 42); // Red if negative, else dark
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`Rs. ${currentReportStudent.balance.toFixed(2)}`, 14, 85);

    // --- PREMIUM TABLE ---
    if(currentStudentReportData && currentStudentReportData.length > 0) {
        const tableBody = currentStudentReportData.map(tx => {
            const isCredit = tx.transaction_type === 'credit';
            return [
                new Date(tx.transaction_date).toLocaleDateString('en-GB'),
                tx.payment_mode || 'Cash',
                tx.remarks || '-',
                isCredit ? `+ ${parseFloat(tx.amount).toFixed(2)}` : `- ${parseFloat(tx.amount).toFixed(2)}`
            ];
        });

        doc.autoTable({
            startY: 95,
            head: [['DATE', 'MODE', 'REMARKS', 'AMOUNT (Rs)']],
            body: tableBody,
            theme: 'plain', // Removes default heavy borders
            headStyles: { 
                fillColor: [248, 250, 252], 
                textColor: [15, 23, 42], 
                fontStyle: 'bold',
                lineWidth: { bottom: 0.5 },
                lineColor: [203, 213, 225]
            },
            bodyStyles: {
                textColor: [51, 65, 85],
                lineWidth: { bottom: 0.1 },
                lineColor: [226, 232, 240]
            },
            alternateRowStyles: { fillColor: [252, 253, 255] },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } } // Align amount right
        });
    } else {
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "italic");
        doc.text("No transactions recorded for this period.", 14, 100);
    }

    // --- ADD FOOTERS TO ALL PAGES ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(248, 250, 252);
        doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("SECURE LEDGER EXPORT", 14, pageHeight - 6);
        doc.text(`PAGE ${i} OF ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
    }

    doc.save(`Statement_${currentReportStudent.name.replace(/\s+/g, '_')}.pdf`);
    showToast("Premium Report Downloaded!");
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

async function openAddTransaction(studentId) {
    document.getElementById('tx-modal-title').innerText = "Process Transaction";
    document.getElementById('tx-id').value = ""; 
    document.getElementById('tx-student-id').value = studentId;
    document.getElementById('tx-amount').value = "";
    document.getElementById('tx-remarks').value = "";
    document.getElementById('tx-pay-mode').value = "Cash";
    document.getElementById('tx-sent-to-admin').checked = false;
    
    // Toggle admin handover checkbox based on type
    const toggleHandover = () => {
        const isCredit = document.getElementById('tx-type').value === 'credit';
        document.getElementById('admin-handover-group').style.display = (userRole === 'staff' && isCredit) ? 'block' : 'none';
    };
    document.getElementById('tx-type').onchange = toggleHandover;
    toggleHandover();
    
    // FIX: Show the selectors and pre-fill the student data
    document.getElementById('global-tx-selectors').style.display = 'block';
    document.getElementById('global-tx-student').disabled = true;
    document.getElementById('global-tx-student').innerHTML = '<option value="">Loading...</option>';
    
    // Auto-fetch the selected student's level to populate the dropdowns
    const { data: stdData } = await supabaseClient.from('students').select('level').eq('id', studentId).single();
    
    if (stdData) {
        document.getElementById('global-tx-level').value = stdData.level;
        await loadStudentsForDropdown(stdData.level);
        document.getElementById('global-tx-student').value = studentId;
    }

    openModal('modal-transaction');
}

async function saveTransaction() {
    if (isSavingTx) return; 
    isSavingTx = true;

    const txId = document.getElementById('tx-id').value;
    const studentId = document.getElementById('tx-student-id').value;
    const type = document.getElementById('tx-type').value;
    const mode = document.getElementById('tx-pay-mode').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const remarks = document.getElementById('tx-remarks').value;
    const txDate = document.getElementById('tx-date').value;
    const sentToAdmin = document.getElementById('tx-sent-to-admin').checked;
    
    if(!amount || amount <= 0) {
        isSavingTx = false;
        return showToast("Enter a valid amount!", "error");
    }
    
    let txStatus = 'verified';
    if (userRole === 'staff' && type === 'credit' && sentToAdmin) {
        txStatus = 'pending';
    }

    // Build payload WITHOUT the student_id first
    const transactionData = {
        transaction_type: type, payment_mode: mode, 
        amount, remarks, transaction_date: txDate, created_by: currentUser?.id, 
        status: txStatus, sent_to_admin: sentToAdmin 
    };

    // CRITICAL FIX: Only attach student_id if we actually have one (prevents 400 Bad Request on Edit)
    if (studentId) {
        transactionData.student_id = studentId;
    }

    if (!navigator.onLine) {
        if (txId) {
            isSavingTx = false;
            return showToast("Cannot edit transactions while offline.", "error"); 
        }
        const offlineQueue = JSON.parse(localStorage.getItem('ledger_offline_tx') || '[]');
        offlineQueue.push(transactionData);
        localStorage.setItem('ledger_offline_tx', JSON.stringify(offlineQueue));
        closeModal('modal-transaction');
        isSavingTx = false;
        return showToast("Offline: Transaction queued securely.", "warning");
    }
    
    showLoader(true);
    let error;
    if (txId) {
        // Edit Mode (PATCH)
        const res = await supabaseClient.from('transactions').update(transactionData).eq('id', txId);
        error = res.error;
    } else {
        // Insert Mode (POST)
        const res = await supabaseClient.from('transactions').insert([transactionData]);
        error = res.error;
    }
    showLoader(false);
    
    if (error) {
        showToast("Error: " + error.message, "error");
    } else {
        closeModal('modal-transaction');
        showToast(txStatus === 'pending' ? "Sent to Admin for verification!" : "Transaction recorded!");
        
        if (document.getElementById('transactions-section').classList.contains('active')) {
            loadTransactions();
        } else if (document.getElementById('students-section').classList.contains('active')) {
            loadStudents(); 
        }
    }
    
    isSavingTx = false;
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
        
        // DYNAMIC JOIN: Use !inner ONLY when a level is selected so Supabase filters the rows correctly
        let joinString = txLevel ? '*, students!inner(name, level)' : '*, students(name, level)';
        let query = supabaseClient.from('transactions').select(joinString, { count: 'exact' }).order('transaction_date', { ascending: false });        
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
        
        if (error) {
            if (!isAppend) showLoader(false);
            if (error.code === 'PGRST103') {
                txPage = 1;
                isFetchingTx = false;
                return loadTransactions(isAppend);
            }
            throw new Error(error.message); 
        }

        // --- FAILSAFE: If Supabase Join is broken, manually fetch and attach students ---
        let finalData = data || [];
        if (finalData.length > 0 && finalData[0].students === null) {
            const studentIds = [...new Set(finalData.map(t => t.student_id).filter(id => id))];
            if (studentIds.length > 0) {
                const { data: stdData } = await supabaseClient.from('students').select('id, name, level').in('id', studentIds);
                const stdMap = {};
                if (stdData) stdData.forEach(s => stdMap[s.id] = s);
                finalData = finalData.map(t => ({
                    ...t,
                    students: stdMap[t.student_id] || { name: 'Unknown Student', level: 'General' }
                }));
            }
        }

        // --- NEW: Fetch Staff/Admin Profiles for "Processed By" column ---
        let profileMap = {};
        if (finalData.length > 0) {
            // Extract unique user IDs from the transactions
            const profileIds = [...new Set(finalData.map(t => t.created_by).filter(id => id))];
            if (profileIds.length > 0) {
                const { data: profData } = await supabaseClient.from('profiles').select('id, name').in('id', profileIds);
                if (profData) {
                    profData.forEach(p => profileMap[p.id] = p.name || 'Unknown User');
                }
            }
        }
        
        if (!isAppend) showLoader(false);

        const tbody = document.getElementById('ledger-body');
        if (!isAppend) tbody.innerHTML = '';
        
        if (finalData) {
            if (finalData.length < PAGE_LIMIT_TX) {
                hasMoreTx = false;
            }

            const totalPages = Math.ceil((count || 0) / PAGE_LIMIT_TX) || 1;
            document.getElementById('tx-page-info').innerText = `Page ${txPage} of ${totalPages}`;

            if(finalData.length === 0 && !isAppend) {
                // Expanded colspan to 8 to account for the new column
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted);">No transactions found.</td></tr>`;
                isFetchingTx = false;
                return;
            }

            finalData.forEach((tx, index) => {
                const badgeClass = tx.transaction_type === 'credit' ? 'badge-credit' : 'badge-debit';
                const displayMode = tx.payment_mode || 'Cash';
                const currentStatus = tx.status || 'verified';
                const statusBadgeClass = currentStatus === 'pending' ? 'badge-pending' : (currentStatus === 'rejected' ? 'badge-rejected' : 'badge-verified');
                const delay = index * 0.05;
                
                const studentName = tx.students?.name || 'Unknown Student';
                
                // NEW: Resolve the name of the person who processed the transaction
                const processedBy = tx.profiles?.name || profileMap[tx.created_by] || 'Admin';

                const safeRemarks = (tx.remarks || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
                
                let actionControls = '';
                if (userRole === 'admin') {
                    if (currentStatus === 'pending') {
                        actionControls += `
                            <button class="btn-icon" style="color: var(--success);" title="Verify" onclick="updateTxStatus('${tx.id}', 'verified')"><i class="fas fa-check-circle"></i></button>
                            <button class="btn-icon" style="color: var(--danger);" title="Reject" onclick="updateTxStatus('${tx.id}', 'rejected')"><i class="fas fa-times-circle"></i></button>
                        `;
                    }
                    actionControls += `
                        <button class="btn-icon" title="Edit" onclick="openEditTransaction('${tx.id}', '${tx.transaction_type}', '${displayMode}', '${tx.amount}', '${safeRemarks}', '${tx.transaction_date}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" title="Delete" onclick="deleteTransaction('${tx.id}')"><i class="fas fa-trash"></i></button>
                    `;
                }
                
                const txStr = encodeURIComponent(JSON.stringify(tx));

                tbody.innerHTML += `
                    <tr class="row-enter mobile-tile-row" style="animation-delay: ${delay}s" onclick="openMobileDetails(event, 'tx', '${txStr}')">
                        <td data-label="Select"><input type="checkbox" class="row-select" value="${tx.id}"></td>
                        <td data-label="Date" style="font-weight: 500;">${new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                        <td data-label="Student" style="font-weight: 700;">${studentName}</td>
                        <td data-label="Processed By" style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600;">${processedBy}</td>
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
                      <td data-label="Actions" class="mobile-actions" style="white-space: nowrap; width: 100px; vertical-align: middle;">
                            <div style="display: flex; gap: 8px; justify-content: flex-start; align-items: center;">
                                ${actionControls}
                            </div>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        showToast("Error loading transactions: " + err.message, "error");
    } finally {
        isFetchingTx = false; 
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
                allTx.forEach(t => {
                    if (t.status !== 'verified') return;
                    const amt = parseFloat(t.amount);
                    
                    // If this transaction was processed by THIS specific user
                    if (t.created_by === user.id) {
                        if (t.transaction_type === 'credit' && !t.sent_to_admin) staffBalance += amt;
                        if (t.transaction_type === 'debit') staffBalance -= amt;
                    }
                    
                    // NEW: If THIS user is an Admin, they receive all cash handed over by staff
                    if (user.role === 'admin') {
                        if (t.transaction_type === 'credit' && t.sent_to_admin) {
                            staffBalance += amt;
                        }
                    }
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
    
    // 1. Check if the target user is an admin
    const { data: profileData } = await supabaseClient.from('profiles').select('role').eq('id', targetId).single();
    const isTargetAdmin = profileData ? profileData.role === 'admin' : false;

    // 2. Adjust the query: REMOVED profiles(name) to prevent 400 Bad Request
    let query = supabaseClient.from('transactions').select('*, students(name)').order('transaction_date', { ascending: false });
    if (isTargetAdmin) {
        query = query.or(`created_by.eq.${targetId},sent_to_admin.eq.true`);
    } else {
        query = query.eq('created_by', targetId);
    }
    
    const [txRes, setRes] = await Promise.all([
        query,
        supabaseClient.from('staff_settlements').select('*').eq('staff_id', targetId).order('created_at', { ascending: false })
    ]);
    
    // 3. NEW: Manually fetch profile names to bypass Supabase join limitations
    let profileMap = {};
    if (txRes.data && txRes.data.length > 0) {
        const profileIds = [...new Set(txRes.data.map(t => t.created_by).filter(id => id))];
        if (profileIds.length > 0) {
            const { data: profData } = await supabaseClient.from('profiles').select('id, name').in('id', profileIds);
            if (profData) profData.forEach(p => profileMap[p.id] = p.name || 'Unknown User');
        }
    }

    showLoader(false);
    if(txRes.error || setRes.error) return showToast("Error loading ledger.", "error");

    const timeline = document.getElementById('staff-ledger-timeline');
    timeline.innerHTML = '';
    currentStaffLedgerData = [];
    let runningBalance = 0;

    // 4. Process the timeline
    txRes.data.forEach(tx => {
        if(tx.status !== 'verified') return;
        const amt = parseFloat(tx.amount);
        let impact = 0;
        let title = `Student: ${tx.students?.name || 'Unknown'}`;
        let desc = `${tx.transaction_type.toUpperCase()} • ${tx.payment_mode}`;

        if (tx.created_by === targetId) {
            // Standard transaction processed by this user
            if (tx.transaction_type === 'credit' && !tx.sent_to_admin) impact = amt;
            if (tx.transaction_type === 'debit') impact = -amt;
        } else if (isTargetAdmin && tx.sent_to_admin && tx.transaction_type === 'credit') {
            // Cash Handover received by this Admin (Uses the new manual profile map)
            impact = amt;
            title = `Handover from ${profileMap[tx.created_by] || 'Staff'}`;
            desc = `Student: ${tx.students?.name || 'Unknown'}`;
        }
        
        if (impact !== 0) {
            runningBalance += impact;
            currentStaffLedgerData.push({
                rawTx: tx, // Store raw data for editing
                isSettlement: false,
                date: new Date(tx.transaction_date),
                title: title,
                desc: desc,
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
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // --- PREMIUM HEADER GRAPHICS ---
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 45, pageWidth, 3, 'F');

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1.2);
    doc.rect(14, 14, 10, 10, 'S');
    doc.setFillColor(255, 255, 255);
    doc.rect(18, 18, 10, 10, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("LEDGER", 34, 25);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("INTERNAL OPERATIONS", 34, 32);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("STAFF WALLET RECORD", pageWidth - 14, 25, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Exported: ${new Date().toLocaleString('en-GB')}`, pageWidth - 14, 32, { align: 'right' });

    // --- REPORT METADATA ---
    doc.setTextColor(15, 23, 42); 
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("AUTHORIZED PERSONNEL:", 14, 60);
    
    doc.setFontSize(14);
    doc.text(currentStaffLedgerName.toUpperCase(), 14, 68);

    const tableData = currentStaffLedgerData.map(item => [
        item.date.toLocaleDateString('en-GB'),
        item.title,
        item.desc,
        item.impact > 0 ? `+ ${item.impact.toFixed(2)}` : `- ${Math.abs(item.impact).toFixed(2)}`
    ]);

    // --- PREMIUM TABLE ---
    doc.autoTable({
        startY: 78,
        head: [['DATE', 'REFERENCE', 'DETAILS', 'IMPACT (Rs)']],
        body: tableData,
        theme: 'plain',
        headStyles: { 
            fillColor: [248, 250, 252], 
            textColor: [15, 23, 42], 
            fontStyle: 'bold',
            lineWidth: { bottom: 0.5 },
            lineColor: [203, 213, 225]
        },
        bodyStyles: {
            textColor: [51, 65, 85],
            lineWidth: { bottom: 0.1 },
            lineColor: [226, 232, 240]
        },
        alternateRowStyles: { fillColor: [252, 253, 255] },
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
        columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } } 
    });

    // --- ADD FOOTERS TO ALL PAGES ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(248, 250, 252);
        doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("SECURE INTERNAL DOCUMENT", 14, pageHeight - 6);
        doc.text(`PAGE ${i} OF ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
    }

    doc.save(`Wallet_Statement_${currentStaffLedgerName.replace(/\s+/g, '_')}.pdf`);
    showToast("Premium Statement Downloaded!");
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
    else if (type === 'csv') {
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
    } // <--- THIS WAS THE MISSING BRACKET
  else if (type === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        
        // --- PREMIUM HEADER GRAPHICS ---
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 45, 'F');
        doc.setFillColor(30, 64, 175);
        doc.rect(0, 45, pageWidth, 3, 'F');

        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.rect(14, 14, 10, 10, 'S');
        doc.setFillColor(255, 255, 255);
        doc.rect(18, 18, 10, 10, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("LEDGER", 34, 25);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("INSTITUTIONAL FINANCE", 34, 32);

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(`${section.toUpperCase()} MASTER RECORD`, pageWidth - 14, 25, { align: 'right' });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Exported: ${new Date().toLocaleString('en-GB')}`, pageWidth - 14, 32, { align: 'right' });

        // Manually parse the table
        let tableHeaders = [];
        let tableBody = [];
        const table = document.querySelector(tableId);

        const headerCells = table.querySelectorAll("thead th");
        for (let i = 1; i < headerCells.length - 1; i++) { 
            tableHeaders.push(headerCells[i].innerText);
        }

        const rows = table.querySelectorAll("tbody tr");
        rows.forEach(row => {
            let rowData = [];
            const cells = row.querySelectorAll("td");
            if (cells.length > 2) { 
                for (let i = 1; i < cells.length - 1; i++) {
                    let cellText = cells[i].innerText.replace(/\n/g, ' • ').trim();
                    rowData.push(cellText);
                }
                tableBody.push(rowData);
            }
        });

        // --- PREMIUM TABLE ---
        doc.autoTable({
            startY: 60,
            head: [tableHeaders],
            body: tableBody,
            theme: 'plain',
            headStyles: { 
                fillColor: [248, 250, 252], 
                textColor: [15, 23, 42], 
                fontStyle: 'bold',
                lineWidth: { bottom: 0.5 },
                lineColor: [203, 213, 225]
            },
            bodyStyles: {
                textColor: [51, 65, 85],
                lineWidth: { bottom: 0.1 },
                lineColor: [226, 232, 240]
            },
            alternateRowStyles: { fillColor: [252, 253, 255] },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 }
        });

        // --- ADD FOOTERS TO ALL PAGES ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(248, 250, 252);
            doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
            doc.setTextColor(148, 163, 184);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text("SECURE MASTER DATA EXPORT", 14, pageHeight - 6);
            doc.text(`PAGE ${i} OF ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
        }

        doc.save(`${filename}.pdf`);
        showToast("Premium PDF Exported Successfully!");
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
        if (pendingBulkDeleteTable === 'students') loadStudents();
        else loadTransactions();
    }
} // <-- This safely closes the executeBulkDelete function


// --- MOBILE INFINITE SCROLL (AUTO-LOAD) ---
window.addEventListener('scroll', () => {
    // Only run auto-load logic on mobile views (screens 900px or smaller)
    if (window.innerWidth > 900) return;

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    
    // If the user scrolls within 200px of the bottom of the page
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        const activeSection = document.querySelector('.data-section.active')?.id;
        
        if (activeSection === 'students-section' && !isFetchingStudents && hasMoreStudents) {
            studentPage++;
            loadStudents(true); // Loads next batch seamlessly
        } else if (activeSection === 'transactions-section' && !isFetchingTx && hasMoreTx) {
            txPage++;
            loadTransactions(true); // Loads next batch seamlessly
        }
    }
}, { passive: true });

// --- MOBILE INFINITE SCROLL (AUTO-LOAD) ---
window.addEventListener('scroll', () => {
    // Only run auto-load logic on mobile views (screens 900px or smaller)
    if (window.innerWidth > 900) return;

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    
    // If the user scrolls within 200px of the bottom of the page
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        const activeSection = document.querySelector('.data-section.active')?.id;
        
        if (activeSection === 'students-section' && !isFetchingStudents && hasMoreStudents) {
            studentPage++;
            loadStudents(true); // Loads next batch seamlessly
        } else if (activeSection === 'transactions-section' && !isFetchingTx && hasMoreTx) {
            txPage++;
            loadTransactions(true); // Loads next batch seamlessly
        }
    }
}, { passive: true });

// --- INSTITUTION MASTER REPORT LOGIC ---

async function openMasterReportModal() {
    if (userRole !== 'admin') return showToast("Unauthorized access.", "error");

    document.getElementById('master-report-start').value = '';
    document.getElementById('master-report-end').value = '';
    
    // Hide preview container when reopening
    document.getElementById('master-report-preview-container').style.display = 'none';

    // Populate Staff Dropdown
    const staffSelect = document.getElementById('master-report-staff');
    staffSelect.innerHTML = '<option value="">All Staff / Entire Institution</option>';
    const { data: staff } = await supabaseClient.from('profiles').select('id, name');
    if (staff) {
        staff.forEach(s => staffSelect.innerHTML += `<option value="${s.id}">${s.name || 'Unknown'}</option>`);
    }

    // Populate Levels Dropdown
    const levelSelect = document.getElementById('master-report-level');
    levelSelect.innerHTML = '<option value="">All Levels</option>';
    systemLevels.forEach(l => levelSelect.innerHTML += `<option value="${l}">${l}</option>`);

    openModal('modal-master-report');
}

async function generateMasterReport(format) {
    if (userRole !== 'admin') return;

    const startDate = document.getElementById('master-report-start').value;
    const endDate = document.getElementById('master-report-end').value;
    const staffId = document.getElementById('master-report-staff').value;
    const level = document.getElementById('master-report-level').value;

    showLoader(true);

    // 1. Build Query (Only verified transactions)
    let joinString = level ? '*, students!inner(name, level)' : '*, students(name, level)';
    let query = supabaseClient.from('transactions').select(joinString).eq('status', 'verified').order('transaction_date', { ascending: false });

    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);
    if (staffId) query = query.eq('created_by', staffId);
    if (level) query = query.eq('students.level', level);

    const { data, error } = await query;

    if (error) {
        showLoader(false);
        return showToast("Error querying data: " + error.message, "error");
    }

    let finalData = data || [];

    // 2. Manually Map Profile Names (Bypass 400 Error)
    let profileMap = {};
    if (finalData.length > 0) {
        const profileIds = [...new Set(finalData.map(t => t.created_by).filter(id => id))];
        if (profileIds.length > 0) {
            const { data: profData } = await supabaseClient.from('profiles').select('id, name').in('id', profileIds);
            if (profData) profData.forEach(p => profileMap[p.id] = p.name || 'Unknown User');
        }
    }

    showLoader(false);

    if (finalData.length === 0) return showToast("No transactions found for these filters.", "warning");

    // 3. Process Data & Calculate Totals
    let totalCredit = 0;
    let totalDebit = 0;

    let csvData = [];
    let pdfBody = [];

    // Setup headers
    csvData.push(["Date", "Student", "Level", "Processed By", "Mode", "Type", "Amount", "Remarks"]);
    const pdfHeaders = [['DATE', 'STUDENT', 'LEVEL', 'PROCESSED BY', 'MODE', 'IMPACT (Rs)']];

    finalData.forEach(tx => {
        const isCredit = tx.transaction_type === 'credit';
        const amt = parseFloat(tx.amount);
        const stdName = tx.students?.name || 'Unknown';
        const stdLevel = tx.students?.level || 'General';
        const staffName = profileMap[tx.created_by] || 'Admin';
        const dateStr = new Date(tx.transaction_date).toLocaleDateString('en-GB');
        const mode = tx.payment_mode || 'Cash';
        const remarks = (tx.remarks || '-').replace(/\n/g, ' ');

        if (isCredit) totalCredit += amt; else totalDebit += amt;

        // Push to CSV
        csvData.push([dateStr, stdName, stdLevel, staffName, mode, tx.transaction_type.toUpperCase(), amt.toFixed(2), remarks]);
        
        // Push to PDF
        pdfBody.push([
            dateStr, 
            stdName, 
            stdLevel, 
            staffName, 
            mode, 
            isCredit ? `+ ${amt.toFixed(2)}` : `- ${amt.toFixed(2)}`
        ]);
    });

    const netTotal = totalCredit - totalDebit;
    const filename = `Institution_Report_${new Date().toISOString().split('T')[0]}`;

    // 4. Export Execution
    
    if (format === 'preview') {
        const previewContainer = document.getElementById('master-report-preview-container');
        const previewBody = document.getElementById('master-report-preview-body');
        const netTotalEl = document.getElementById('preview-net-total');
        
        previewBody.innerHTML = '';
        
        finalData.forEach(tx => {
            const isCredit = tx.transaction_type === 'credit';
            const amt = parseFloat(tx.amount);
            const stdName = tx.students?.name || 'Unknown';
            const staffName = profileMap[tx.created_by] || 'Admin';
            const dateStr = new Date(tx.transaction_date).toLocaleDateString('en-GB');
            const color = isCredit ? 'var(--success)' : 'var(--danger)';
            const sign = isCredit ? '+' : '-';
            
            previewBody.innerHTML += `
                <tr>
                    <td style="padding: 0.8rem; font-size: 0.85rem;">${dateStr}</td>
                    <td style="padding: 0.8rem; font-weight: 700; font-size: 0.85rem;">${stdName}</td>
                    <td style="padding: 0.8rem; font-size: 0.8rem; color: var(--text-muted);">${staffName}</td>
                    <td style="padding: 0.8rem; font-weight: 800; color: ${color}; text-align: right;">${sign}₹${amt.toFixed(2)}</td>
                </tr>
            `;
        });
        
        netTotalEl.innerText = `₹${netTotal.toFixed(2)}`;
        netTotalEl.style.color = netTotal < 0 ? 'var(--danger)' : 'var(--success)';
        previewContainer.style.display = 'block';
        
        showToast("Preview generated. Scroll down to view.");
        // We DO NOT close the modal here, so the user can see the preview!
    }
    else if (format === 'csv') {
        let csv = Papa.unparse(csvData);
        let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        let link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        showToast("Master CSV Exported Successfully!");
        closeModal('modal-master-report');
    } 
    else if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        
        // --- PREMIUM HEADER GRAPHICS ---
        doc.setFillColor(15, 23, 42); // Slate 900
        doc.rect(0, 0, pageWidth, 45, 'F');
        doc.setFillColor(37, 99, 235); // Blue Accent
        doc.rect(0, 45, pageWidth, 3, 'F');

        // Abstract Geometric Logo
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.rect(14, 14, 10, 10, 'S'); 
        doc.setFillColor(255, 255, 255);
        doc.rect(18, 18, 10, 10, 'F'); 

        // Title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("LEDGER", 34, 25);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("INSTITUTIONAL FINANCE", 34, 32);

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("MASTER FINANCIAL REPORT", pageWidth - 14, 25, { align: 'right' });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - 14, 32, { align: 'right' });

        // --- REPORT METADATA & TOTALS ---
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        
        // Left Column Meta
        doc.setFont("helvetica", "bold");
        doc.text("PARAMETERS:", 14, 58);
        doc.setFont("helvetica", "normal");
        doc.text(`Date Range: ${startDate ? new Date(startDate).toLocaleDateString() : 'All Time'} to ${endDate ? new Date(endDate).toLocaleDateString() : 'Present'}`, 14, 65);
        
        const staffSelectEl = document.getElementById('master-report-staff');
        const staffNameDisplay = staffId ? staffSelectEl.options[staffSelectEl.selectedIndex].text : 'All Staff';
        doc.text(`Filtered Staff: ${staffNameDisplay}`, 14, 71);
        doc.text(`Filtered Level: ${level || 'All Levels'}`, 14, 77);

        // Right Column Totals
        doc.setFont("helvetica", "bold");
        doc.text("REPORT AGGREGATES:", pageWidth - 70, 58);
        doc.setFont("helvetica", "normal");
        doc.text(`Total Deposits (+): Rs. ${totalCredit.toFixed(2)}`, pageWidth - 70, 65);
        doc.text(`Total Deductions (-): Rs. ${totalDebit.toFixed(2)}`, pageWidth - 70, 71);
        
        doc.setFont("helvetica", "bold");
        doc.setTextColor(netTotal < 0 ? 220 : 15, netTotal < 0 ? 38 : 23, netTotal < 0 ? 38 : 42);
        doc.text(`NET VOLUME: Rs. ${netTotal.toFixed(2)}`, pageWidth - 70, 78);

        // --- PREMIUM TABLE ---
        doc.autoTable({
            startY: 85,
            head: pdfHeaders,
            body: pdfBody,
            theme: 'plain',
            headStyles: { 
                fillColor: [248, 250, 252], 
                textColor: [15, 23, 42], 
                fontStyle: 'bold',
                lineWidth: { bottom: 0.5 },
                lineColor: [203, 213, 225]
            },
            bodyStyles: { textColor: [51, 65, 85], lineWidth: { bottom: 0.1 }, lineColor: [226, 232, 240] },
            alternateRowStyles: { fillColor: [252, 253, 255] },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
            columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } } 
        });

        // --- FOOTERS ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(248, 250, 252);
            doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
            doc.setTextColor(148, 163, 184);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text("SECURE MASTER DATA EXPORT", 14, pageHeight - 6);
            doc.text(`PAGE ${i} OF ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
        }

        doc.save(`${filename}.pdf`);
        showToast("Premium Master Report Exported!");
        closeModal('modal-master-report');
    }
}