// Initialize Supabase
const SUPABASE_URL = 'https://ldiccnfpxceoqwroehij.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ULn9SF51_hIC0ekDQw4xsw_LsmGR2JX';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userRole = null;
let currentProfileName = '';
let searchTimeout;

// DYNAMIC STATE
let PAGE_LIMIT_STUDENTS = 8;
let PAGE_LIMIT_TX = 8;
let studentPage = 1;
let txPage = 1;

// LOCAL STORAGE LEVELS
let systemLevels = JSON.parse(localStorage.getItem('LEDGER_levels')) || ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Post-Grad'];

// --- SESSION RESTORE ---
window.addEventListener('DOMContentLoaded', async () => {
    showLoader(true);
    renderLevelDropdowns();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        await checkUserRole(currentUser.id);
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('dashboard-screen').classList.add('active');
        document.getElementById('tx-date').valueAsDate = new Date();
        await loadStudents();
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

function openLevelManager() {
    const list = document.getElementById('level-list');
    list.innerHTML = '';
    systemLevels.forEach((level, index) => {
        list.innerHTML += `
            <li style="display:flex; justify-content:space-between; align-items:center; padding: 0.8rem; background: var(--surface-solid); border-radius: 8px; border: 1px solid var(--border);">
                <span style="font-weight: 600;">${level}</span>
                <button class="btn-icon delete" style="width:28px; height:28px; padding:0;" onclick="deleteLevel(${index})"><i class="fas fa-trash" style="font-size:0.8rem;"></i></button>
            </li>
        `;
    });
    openModal('modal-manage-levels');
}

function addLevel() {
    const input = document.getElementById('new-level-input');
    const val = input.value.trim();
    if(val && !systemLevels.includes(val)) {
        systemLevels.push(val);
        localStorage.setItem('LEDGER_levels', JSON.stringify(systemLevels));
        input.value = '';
        renderLevelDropdowns();
        openLevelManager();
        showToast("Level Added");
    }
}

function deleteLevel(index) {
    systemLevels.splice(index, 1);
    localStorage.setItem('LEDGER_levels', JSON.stringify(systemLevels));
    renderLevelDropdowns();
    openLevelManager();
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
            <div>
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Current Balance</p>
                <p style="font-weight:800; font-size:1.4rem; color:${balanceColor};">₹${parseFloat(data.balance || 0).toFixed(2)}</p>
            </div>
        `;
    } else if (type === 'tx') {
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
            <div>
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Remarks</p>
                <p style="font-size:0.95rem; color:var(--text-main);">${data.remarks || 'None'}</p>
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

async function logout() { 
    if(!confirm("Are you sure you want to securely log out of the LEDGER Portal?")) return;
    await supabaseClient.auth.signOut(); 
    location.reload(); 
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

    if(window.innerWidth <= 900) toggleMobileMenu();

    if(sectionId === 'students') { studentPage = 1; loadStudents(); }
    if(sectionId === 'transactions') { txPage = 1; loadTransactions(); }
    if(sectionId === 'users' && userRole === 'admin') loadUsers();
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
    const searchTerm = document.getElementById('search-student')?.value || '';
    const levelFilter = document.getElementById('filter-level')?.value || '';
    
    let query = supabaseClient.from('students').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    
    if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
    if (levelFilter) query = query.eq('level', levelFilter);
    
    const from = (studentPage - 1) * PAGE_LIMIT_STUDENTS;
    const to = from + PAGE_LIMIT_STUDENTS - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    const tbody = document.getElementById('students-body');
    tbody.innerHTML = '';
    
    if (data) {
        updateDashboardStats(searchTerm, levelFilter);
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
            
            const adminControls = userRole === 'admin' ? `
                <button class="btn-icon" title="Edit" onclick="openEditStudent('${student.id}', '${student.name.replace(/'/g, "\\'")}', '${student.roll_number || ''}', '${stdLevel}', '${student.contact_info || ''}')"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Delete" onclick="deleteStudent('${student.id}')"><i class="fas fa-trash"></i></button>
            ` : '';

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
                        <button class="btn-secondary" style="padding: 0.4rem 0.6rem; font-size: 0.75rem;" onclick="openAddTransaction('${student.id}')">
                            <i class="fas fa-plus text-blue"></i>
                        </button>
                        <button class="btn-secondary" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; margin-right: 5px;" onclick="viewStudentReport('${student.id}', '${student.name.replace(/'/g, "\\'")}', ${currentBalance})">
                            <i class="fas fa-chart-line text-emerald"></i>
                        </button>
                        ${adminControls}
                    </td>
                </tr>
            `;
        });
    }
}

async function updateDashboardStats(search, level) {
    let statQuery = supabaseClient.from('students').select('balance');
    if (search) statQuery = statQuery.ilike('name', `%${search}%`);
    if (level) statQuery = statQuery.eq('level', level);
    
    const { data } = await statQuery;
    if(data) {
        const totalBal = data.reduce((sum, s) => sum + parseFloat(s.balance || 0), 0);
        document.getElementById('stat-total-students').innerText = data.length;
        document.getElementById('stat-total-balance').innerText = `₹${totalBal.toFixed(2)}`;
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

async function deleteStudent(id) {
    if(!confirm("⚠️ WARNING: Deleting this student wipes all their transactions. Proceed?")) return;
    showLoader(true);
    await supabaseClient.from('students').delete().eq('id', id);
    showLoader(false);
    showToast("Profile deleted.");
    loadStudents();
}

// --- STUDENT SPECIFIC REPORTS ---
let currentReportStudent = null;
async function viewStudentReport(studentId, studentName, balance) {
    currentReportStudent = { name: studentName, balance: balance };
    document.getElementById('report-student-name').innerText = studentName;
    
    const balEl = document.getElementById('report-student-balance');
    balEl.innerText = `₹${balance.toFixed(2)}`;
    balEl.style.color = balance < 0 ? 'var(--danger)' : 'var(--text-main)';
    
    showLoader(true);
    const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('student_id', studentId)
        .order('transaction_date', { ascending: false });
    
    showLoader(false);
    if(error) return showToast("Error loading report.", "error");

    const timeline = document.getElementById('student-report-timeline');
    timeline.innerHTML = '';
    
    let totalCredit = 0;
    let totalDebit = 0;

    if(data.length === 0) {
        timeline.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-muted);">No transaction history found.</div>';
    } else {
        data.forEach(tx => {
            const amount = parseFloat(tx.amount);
            if(tx.transaction_type === 'credit') totalCredit += amount;
            else totalDebit += amount;

            const isCredit = tx.transaction_type === 'credit';
            const color = isCredit ? 'var(--success)' : 'var(--danger)';
            const icon = isCredit ? 'fa-arrow-down' : 'fa-arrow-up';
            const sign = isCredit ? '+' : '-';

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
                        <p style="font-weight: 800; font-size: 1.1rem; color: ${color};">${sign}₹${amount.toFixed(2)}</p>
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('report-total-credit').innerText = `₹${totalCredit.toFixed(2)}`;
    document.getElementById('report-total-debit').innerText = `₹${totalDebit.toFixed(2)}`;
    
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
function openAddTransaction(studentId) {
    document.getElementById('tx-modal-title').innerText = "Process Transaction";
    document.getElementById('tx-id').value = ""; 
    document.getElementById('tx-student-id').value = studentId;
    document.getElementById('tx-amount').value = "";
    document.getElementById('tx-remarks').value = "";
    document.getElementById('tx-pay-mode').value = "Cash";
    openModal('modal-transaction');
}

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

async function saveTransaction() {
    const txId = document.getElementById('tx-id').value;
    const studentId = document.getElementById('tx-student-id').value;
    const type = document.getElementById('tx-type').value;
    const mode = document.getElementById('tx-pay-mode').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const remarks = document.getElementById('tx-remarks').value;
    const txDate = document.getElementById('tx-date').value;
    if(!amount || amount <= 0) return showToast("Enter a valid amount!", "error");
    
    showLoader(true);
    let error;
    if (txId) {
        const res = await supabaseClient.from('transactions').update({ transaction_type: type, payment_mode: mode, amount, remarks, transaction_date: txDate }).eq('id', txId);
        error = res.error;
    } else {
        const res = await supabaseClient.from('transactions').insert([{ student_id: studentId, transaction_type: type, payment_mode: mode, amount, remarks, transaction_date: txDate, created_by: currentUser.id }]);
        error = res.error;
    }
    showLoader(false);
    
    if (error) showToast("Error: " + error.message, "error");
    else {
        closeModal('modal-transaction');
        showToast(txId ? "Ledger updated!" : "Transaction processed!");
        loadTransactions();
        if (document.getElementById('students-section').classList.contains('active')) {
            loadStudents();
        }
    }
}

async function deleteTransaction(txId) {
    if(!confirm("Reverse this transaction?")) return;
    showLoader(true);
    await supabaseClient.from('transactions').delete().eq('id', txId);
    showLoader(false);
    showToast("Transaction reversed.");
    loadTransactions();
}

async function loadTransactions() {
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const payMode = document.getElementById('filter-pay-mode').value;
    
    let query = supabaseClient.from('transactions').select('*, students(name)', { count: 'exact' }).order('transaction_date', { ascending: false });
    if(startDate) query = query.gte('transaction_date', startDate);
    if(endDate) query = query.lte('transaction_date', endDate);
    if(payMode) query = query.eq('payment_mode', payMode);
    
    const from = (txPage - 1) * PAGE_LIMIT_TX;
    const to = from + PAGE_LIMIT_TX - 1;
    query = query.range(from, to);
    
    const { data, count } = await query;
    const tbody = document.getElementById('ledger-body');
    tbody.innerHTML = '';
    
    if (data) {
        const totalPages = Math.ceil((count || 0) / PAGE_LIMIT_TX) || 1;
        document.getElementById('tx-page-info').innerText = `Page ${txPage} of ${totalPages}`;

        if(data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No transactions found.</td></tr>`;
            return;
        }

        data.forEach((tx, index) => {
            const badgeClass = tx.transaction_type === 'credit' ? 'badge-credit' : 'badge-debit';
            const displayMode = tx.payment_mode || 'Cash';
            const delay = index * 0.05;
            
            // Add back the Edit function for transactions here
            const adminControls = userRole === 'admin' ? `
                <button class="btn-icon" title="Edit" onclick="openEditTransaction('${tx.id}', '${tx.transaction_type}', '${displayMode}', '${tx.amount}', '${tx.remarks}', '${tx.transaction_date}')"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Delete" onclick="deleteTransaction('${tx.id}')"><i class="fas fa-trash"></i></button>
            ` : '';
            
            const txStr = encodeURIComponent(JSON.stringify(tx));

            tbody.innerHTML += `
                <tr class="row-enter mobile-tile-row" style="animation-delay: ${delay}s" onclick="openMobileDetails(event, 'tx', '${txStr}')">
                    <td data-label="Select"><input type="checkbox" class="row-select" value="${tx.id}"></td>
                    <td data-label="Date" style="font-weight: 500;">${new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                    <td data-label="Student" style="font-weight: 700;">${tx.students.name}</td>
                    <td data-label="Type & Mode">
                        <div>
                            <span class="badge ${badgeClass}">${tx.transaction_type.toUpperCase()}</span>
                            <span class="badge badge-mode" style="display:block; margin-top:4px;"><i class="fas fa-credit-card"></i> ${displayMode}</span>
                        </div>
                    </td>
                    <td data-label="Amount" style="font-weight: 800; font-size: 1.1rem; color: var(--text-main);">₹${parseFloat(tx.amount).toFixed(2)}</td>
                    <td data-label="Remarks" class="mobile-hide" style="color: var(--text-muted); font-size: 0.85rem;">${tx.remarks || '-'}</td>
                    <td data-label="Actions" class="mobile-actions">
                        ${adminControls}
                    </td>
                </tr>
            `;
        });
    }
}

// --- USERS & STAFF MANAGEMENT ---
async function loadUsers() {
    const { data, error } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
    const tbody = document.getElementById('users-body');
    tbody.innerHTML = '';
    if(data) {
        data.forEach((user, index) => {
            const delay = index * 0.05;
            tbody.innerHTML += `
                <tr class="row-enter" style="animation-delay: ${delay}s; ${user.role === 'suspended' ? 'opacity: 0.5;' : ''}">
                    <td data-label="Name" style="font-weight: 700;">${user.name || 'Unknown'}</td>
                    <td data-label="Identifier" style="font-weight: 500; color: var(--text-muted);">${user.email || 'N/A'}</td>
                    <td data-label="Access Level">
                        <select class="premium-select" style="padding:0.4rem; margin:0;" onchange="updateUserRole('${user.id}', this.value)" ${user.id === currentUser.id ? 'disabled' : ''}>
                            <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Staff</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>Suspended</option>
                        </select>
                    </td>
                    <td data-label="Onboarded">${new Date(user.created_at).toLocaleDateString()}</td>
                    <td data-label="Actions">
                        ${user.id !== currentUser.id && user.role !== 'suspended' ? `<button class="btn-secondary" style="color:var(--danger);" onclick="revokeAccess('${user.id}')">Suspend</button>` : '-'}
                    </td>
                </tr>
            `;
        });
    }
}

async function addStaff() {
    const name = document.getElementById('new-staff-name').value;
    const email = document.getElementById('new-staff-email').value;
    const password = document.getElementById('new-staff-pass').value;
    const role = document.getElementById('new-staff-role').value;
    
    if(!name || !email || !password) return showToast("All fields are required.", "error");
    
    showLoader(true);
    const { data, error } = await supabaseClient.auth.signUp({ 
        email, 
        password,
        options: { data: { name: name, role: role } }
    });
    
    showLoader(false);

    if(error) {
        showToast("Error: " + error.message, "error");
    } else {
        closeModal('modal-add-staff');
        await supabaseClient.from('profiles').insert([{ id: data.user.id, email: email, name: name, role: role }]);
        showToast("Staff Member Provisioned!");
        loadUsers();
    }
}

// --- GLOBAL EXPORTS ---
function exportData(type, section) {
    const tableId = section === 'students' ? '#students-table' : '#transactions-table';
    const filename = `LEDGER_${section}_Export_${new Date().toISOString().split('T')[0]}`;
    
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