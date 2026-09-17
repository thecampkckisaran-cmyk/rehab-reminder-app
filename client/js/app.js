// Global State
let currentPatients = [];
let currentTemplates = [];
let currentLogs = [];
let globalSettings = { default_delay: '15' };

let deleteTargetId = null;
let deleteType = null; // 'patient', 'template', atau 'log'

let currentPage = 1;
const itemsPerPage = 10;
let searchQuery = '';
let statusFilter = 'Semua';
let sortOrder = '';

// Queue & Timer State
let reminderQueue = [];
let currentQueueIndex = 0;
let queueTimer = null;
let countdownValue = 0;
let isQueuePaused = false;
let selectedTemplateId = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  lucide.createIcons();

  const navItems = document.querySelectorAll('.nav-item');
  const pageTitle = document.getElementById('page-title');

  const pageTitles = {
    dashboard: 'Dashboard Overview',
    peserta: 'Manajemen Peserta REHAB',
    reminder: 'Reminder Center',
    template: 'Template Pesan WhatsApp',
    riwayat: 'Riwayat Pengiriman Reminder',
    pengaturan: 'Pengaturan Sistem'
  };

  function navigateTo(pageKey) {
    pageTitle.textContent = pageTitles[pageKey] || 'Dashboard';
    navItems.forEach(nav => {
      if (nav.getAttribute('data-page') === pageKey) nav.classList.add('active');
      else nav.classList.remove('active');
    });

    if (pageKey === 'dashboard') renderDashboardPage();
    else if (pageKey === 'peserta') renderPesertaPage();
    else if (pageKey === 'reminder') renderReminderPage();
    else if (pageKey === 'template') renderTemplatePage();
    else if (pageKey === 'riwayat') renderRiwayatPage();
    else if (pageKey === 'pengaturan') renderPengaturanPage();

    lucide.createIcons();
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageKey = item.getAttribute('data-page');
      navigateTo(pageKey);
    });
  });

  // Global Event Listeners
  document.getElementById('form-patient').addEventListener('submit', handleSavePatient);
  document.getElementById('form-template').addEventListener('submit', handleSaveTemplate);
  document.getElementById('btn-confirm-delete').addEventListener('click', handleConfirmDelete);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Initial App Load
  fetchSettings();
  navigateTo('dashboard');
});

// ==========================================
// TEMA & UTILITIES
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDateIndo(dateStr) {
  if (!dateStr) return '-';
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return new Date(dateStr).toLocaleDateString('id-ID', options);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => toast.remove(), 3500);
}

function openModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.add('active'); 
}

function closeModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.remove('active'); 
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      globalSettings = await res.json();
    }
  } catch (e) {
    console.error(e);
  }
}

// ==========================================
// 1. DASHBOARD PAGE
// ==========================================
async function renderDashboardPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="card-grid">
      <div class="stat-card">
        <div class="stat-icon"><i data-lucide="users"></i></div>
        <div class="stat-info"><h3 id="stat-total">0</h3><p>Total Peserta</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i data-lucide="clock"></i></div>
        <div class="stat-info"><h3 id="stat-today">0</h3><p>Jatuh Tempo Hari Ini</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i data-lucide="alert-circle"></i></div>
        <div class="stat-info"><h3 id="stat-not-reminded">0</h3><p>Belum Diingatkan</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i data-lucide="check-circle-2"></i></div>
        <div class="stat-info"><h3 id="stat-reminded">0</h3><p>Sudah Diingatkan</p></div>
      </div>
    </div>

    <div class="table-card">
      <div class="toolbar" style="padding: 16px 20px; margin-bottom: 0;">
        <h3>Aktivitas Pengiriman Terbaru</h3>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Nama Peserta</th>
              <th>No. WhatsApp</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="dashboard-recent-logs">
            <tr><td colspan="4" class="loading-state"><i data-lucide="loader"></i> Memuat...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  lucide.createIcons();

  try {
    const res = await fetch('/api/dashboard/stats');
    const data = await res.json();

    const elTotal = document.getElementById('stat-total');
    const elToday = document.getElementById('stat-today');
    const elNotReminded = document.getElementById('stat-not-reminded');
    const elReminded = document.getElementById('stat-reminded');
    const tbody = document.getElementById('dashboard-recent-logs');

    if (elTotal) elTotal.textContent = data.totalPatients;
    if (elToday) elToday.textContent = data.dueToday;
    if (elNotReminded) elNotReminded.textContent = data.notReminded;
    if (elReminded) elReminded.textContent = data.reminded;

    if (tbody) {
      if (data.recentLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Belum ada aktivitas pengiriman.</td></tr>`;
      } else {
        tbody.innerHTML = data.recentLogs.map(l => `
          <tr>
            <td>${new Date(l.sent_at).toLocaleString('id-ID')}</td>
            <td><strong>${escapeHtml(l.patient_name)}</strong></td>
            <td>${escapeHtml(l.phone_number)}</td>
            <td><span class="badge ${l.status === 'Terkirim' ? 'badge-success' : 'badge-warning'}">${l.status}</span></td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 2. PESERTA REHAB PAGE
// ==========================================
function renderPesertaPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="toolbar">
      <div class="search-filter-group">
        <div class="input-icon-wrapper">
          <i data-lucide="search"></i>
          <input type="text" id="search-input" class="form-control" placeholder="Cari nama, WA, no kartu..." value="${searchQuery}" onkeyup="handleSearch(event)">
        </div>
        <select id="filter-status" class="form-control" onchange="handleFilterStatus(this.value)">
          <option value="Semua" ${statusFilter === 'Semua' ? 'selected' : ''}>Semua Status</option>
          <option value="Aktif" ${statusFilter === 'Aktif' ? 'selected' : ''}>Aktif</option>
          <option value="Non-Aktif" ${statusFilter === 'Non-Aktif' ? 'selected' : ''}>Non-Aktif</option>
        </select>
        <select id="sort-date" class="form-control" onchange="handleSortDate(this.value)">
          <option value="" ${sortOrder === '' ? 'selected' : ''}>Urutkan Jatuh Tempo</option>
          <option value="asc" ${sortOrder === 'asc' ? 'selected' : ''}>Terdekat (Asc)</option>
          <option value="desc" ${sortOrder === 'desc' ? 'selected' : ''}>Terjauh (Desc)</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="openAddPatientModal()">
        <i data-lucide="user-plus"></i> Tambah Peserta
      </button>
    </div>

    <div class="table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Peserta</th>
              <th>No. WhatsApp</th>
              <th>No. Kartu JKN</th>
              <th>Nominal Cicilan</th>
              <th>Jatuh Tempo</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="patient-table-body">
            <tr><td colspan="8" class="loading-state"><i data-lucide="loader"></i> Memuat data...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination-container" id="pagination-wrapper"></div>
    </div>
  `;
  lucide.createIcons();
  fetchPatients();
}

async function fetchPatients() {
  try {
    const response = await fetch(`/api/patients?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}&sort=${sortOrder}`);
    const resData = await response.json();
    if (!response.ok) throw new Error(resData.error || 'Gagal mengambil data');
    currentPatients = resData.data || [];
    renderPatientTableData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderPatientTableData() {
  const tbody = document.getElementById('patient-table-body');
  const pagWrapper = document.getElementById('pagination-wrapper');
  if (!tbody) return;

  if (currentPatients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><i data-lucide="inbox"></i><p>Tidak ada data peserta ditemukan</p></td></tr>`;
    if (pagWrapper) pagWrapper.innerHTML = '';
    lucide.createIcons();
    return;
  }

  const totalItems = currentPatients.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedData = currentPatients.slice(startIdx, startIdx + itemsPerPage);

  tbody.innerHTML = paginatedData.map((p, idx) => `
    <tr>
      <td>${startIdx + idx + 1}</td>
      <td><strong>${escapeHtml(p.name)}</strong>${p.notes ? `<br><small class="text-muted">${escapeHtml(p.notes)}</small>` : ''}</td>
      <td>${escapeHtml(p.phone_number)}</td>
      <td>${escapeHtml(p.card_number)}</td>
      <td>${formatRupiah(p.installment_amount)}</td>
      <td>${formatDateIndo(p.due_date)}</td>
      <td><span class="badge ${p.status === 'Aktif' ? 'badge-success' : 'badge-warning'}">${p.status}</span></td>
      <td>
        <button class="btn-icon-only" onclick="openEditPatientModal(${p.id})" title="Edit"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon-only danger" onclick="openDeleteModal('patient', ${p.id}, '${escapeHtml(p.name)}')" title="Hapus"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>
  `).join('');

  if (pagWrapper) {
    pagWrapper.innerHTML = `
      <div>Menampilkan ${startIdx + 1} - ${Math.min(startIdx + itemsPerPage, totalItems)} dari ${totalItems} data</div>
      <div class="pagination-btns">
        <button class="btn btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Prev</button>
        <button class="btn btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>
      </div>
    `;
  }
  lucide.createIcons();
}

function handleSearch(e) { searchQuery = e.target.value; currentPage = 1; fetchPatients(); }
function handleFilterStatus(val) { statusFilter = val; currentPage = 1; fetchPatients(); }
function handleSortDate(val) { sortOrder = val; fetchPatients(); }
function changePage(page) { currentPage = page; renderPatientTableData(); }

function openAddPatientModal() {
  document.getElementById('patient-id').value = '';
  document.getElementById('form-patient').reset();
  document.getElementById('modal-title').textContent = 'Tambah Peserta REHAB';
  openModal('modal-patient');
}

function openEditPatientModal(id) {
  const p = currentPatients.find(item => item.id === id);
  if (!p) return;
  document.getElementById('patient-id').value = p.id;
  document.getElementById('patient-name').value = p.name;
  document.getElementById('patient-phone').value = p.phone_number;
  document.getElementById('patient-card').value = p.card_number;
  document.getElementById('patient-installment').value = p.installment_amount;
  document.getElementById('patient-due-date').value = p.due_date;
  document.getElementById('patient-status').value = p.status;
  document.getElementById('patient-notes').value = p.notes || '';
  document.getElementById('modal-title').textContent = 'Edit Data Peserta';
  openModal('modal-patient');
}

async function handleSavePatient(e) {
  e.preventDefault();
  const id = document.getElementById('patient-id').value;
  const payload = {
    name: document.getElementById('patient-name').value,
    phone_number: document.getElementById('patient-phone').value,
    card_number: document.getElementById('patient-card').value,
    installment_amount: parseFloat(document.getElementById('patient-installment').value),
    due_date: document.getElementById('patient-due-date').value,
    status: document.getElementById('patient-status').value,
    notes: document.getElementById('patient-notes').value
  };

  try {
    const url = id ? `/api/patients/${id}` : '/api/patients';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error);
    closeModal('modal-patient');
    showToast(`Peserta berhasil ${id ? 'diperbarui' : 'ditambahkan'}!`, 'success');
    fetchPatients();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 3. REMINDER CENTER PAGE
// ==========================================
async function renderReminderPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="toolbar">
      <div class="search-filter-group">
        <select id="reminder-category" class="form-control" onchange="loadReminderQueue()">
          <option value="today">Jatuh Tempo Hari Ini</option>
          <option value="h-1">H-1 Jatuh Tempo</option>
          <option value="h-3">H-3 Jatuh Tempo</option>
          <option value="overdue">Terlambat (Overdue)</option>
        </select>
        <select id="reminder-template" class="form-control" onchange="selectedTemplateId = this.value">
          <option value="">-- Pilih Template Pesan --</option>
        </select>
        <select id="reminder-delay" class="form-control">
          <option value="10">Jeda 10 Detik</option>
          <option value="15" selected>Jeda 15 Detik</option>
          <option value="20">Jeda 20 Detik</option>
          <option value="30">Jeda 30 Detik</option>
        </select>
      </div>
      <div class="search-filter-group">
        <button class="btn btn-primary" onclick="startQueue()"><i data-lucide="play"></i> Mulai Antrean</button>
        <button class="btn btn-secondary" onclick="pauseQueue()"><i data-lucide="pause"></i> Pause</button>
        <button class="btn btn-danger" onclick="stopQueue()"><i data-lucide="square"></i> Stop</button>
      </div>
    </div>

    <!-- Active Queue Card -->
    <div class="queue-control-card">
      <div class="queue-header">
        <div>
          <h3 id="queue-status-title">Status Antrean: Siap</h3>
          <p id="queue-progress-text" class="text-muted" style="font-size:0.85rem;">0 dari 0 peserta diproses</p>
        </div>
        <div class="timer-box">
          <i data-lucide="timer"></i>
          <span>Countdown: <strong id="timer-display">0s</strong></span>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all-queue" onchange="toggleSelectAllQueue(this)"></th>
              <th>Nama Peserta</th>
              <th>No. WhatsApp</th>
              <th>Nominal</th>
              <th>Jatuh Tempo</th>
              <th>Aksi Manual</th>
            </tr>
          </thead>
          <tbody id="reminder-table-body">
            <tr><td colspan="6" class="loading-state"><i data-lucide="loader"></i> Memuat antrean...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  lucide.createIcons();

  // Load Templates Select
  try {
    const resT = await fetch('/api/templates');
    const templates = await resT.json();
    currentTemplates = templates;
    const sel = document.getElementById('reminder-template');
    if (sel) {
      templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title + (t.is_default ? ' (Default)' : '');
        if (t.is_default) opt.selected = true;
        sel.appendChild(opt);
      });
      selectedTemplateId = sel.value;
    }
  } catch (e) { console.error(e); }

  loadReminderQueue();
}

async function loadReminderQueue() {
  const catEl = document.getElementById('reminder-category');
  if (!catEl) return;
  const cat = catEl.value;
  const tbody = document.getElementById('reminder-table-body');
  try {
    const res = await fetch(`/api/patients?category=${cat}`);
    const resData = await res.json();
    reminderQueue = resData.data || [];

    if (!tbody) return;

    if (reminderQueue.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><p>Tidak ada peserta pada kategori ini.</p></td></tr>`;
      const progEl = document.getElementById('queue-progress-text');
      if (progEl) progEl.textContent = `0 dari 0 peserta diproses`;
      return;
    }

    tbody.innerHTML = reminderQueue.map((p, idx) => `
      <tr>
        <td><input type="checkbox" class="queue-item-checkbox" data-id="${p.id}" checked></td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${escapeHtml(p.phone_number)}</td>
        <td>${formatRupiah(p.installment_amount)}</td>
        <td>${formatDateIndo(p.due_date)}</td>
        <td>
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="openWaSingle(${p.id})">
            <i data-lucide="external-link"></i> Buka WA
          </button>
        </td>
      </tr>
    `).join('');
    lucide.createIcons();
    const progEl = document.getElementById('queue-progress-text');
    if (progEl) progEl.textContent = `0 dari ${reminderQueue.length} peserta diproses`;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleSelectAllQueue(master) {
  document.querySelectorAll('.queue-item-checkbox').forEach(cb => cb.checked = master.checked);
}

function compileMessage(templateContent, patient) {
  return templateContent
    .replace(/{nama}/g, patient.name)
    .replace(/{nomor_peserta}/g, patient.card_number)
    .replace(/{nominal}/g, formatRupiah(patient.installment_amount))
    .replace(/{tanggal_jatuh_tempo}/g, formatDateIndo(patient.due_date));
}

async function openWaSingle(patientId) {
  const p = reminderQueue.find(item => item.id === patientId) || currentPatients.find(item => item.id === patientId);
  if (!p) return;

  const template = currentTemplates.find(t => String(t.id) === String(selectedTemplateId)) || currentTemplates[0];
  const msg = template ? compileMessage(template.content, p) : `Pengingat Tagihan REHAB BPJS untuk ${p.name}`;

  // Cek Log Duplikat Hari Ini
  try {
    const resLogs = await fetch('/api/logs');
    const logs = await resLogs.json();
    const todayStr = new Date().toISOString().split('T')[0];

    const existingLog = (logs || []).find(l => 
      String(l.patient_id) === String(p.id) && 
      l.sent_at && l.sent_at.startsWith(todayStr)
    );

    if (!existingLog) {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: p.id,
          patient_name: p.name,
          phone_number: p.phone_number,
          template_title: template ? template.title : 'Manual',
          message_content: msg,
          status: 'Dibuka'
        })
      });
    }
  } catch (e) { console.error(e); }

  // Buka Link WA
  let phone = p.phone_number.replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

// Queue Execution Logic
function startQueue() {
  const selectedCheckboxes = document.querySelectorAll('.queue-item-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    showToast('Pilih minimal satu peserta untuk antrean!', 'error');
    return;
  }

  isQueuePaused = false;
  currentQueueIndex = 0;
  const statusEl = document.getElementById('queue-status-title');
  if (statusEl) statusEl.textContent = 'Status Antrean: Berjalan...';
  processNextInQueue();
}

function pauseQueue() {
  isQueuePaused = true;
  clearInterval(queueTimer);
  const statusEl = document.getElementById('queue-status-title');
  if (statusEl) statusEl.textContent = 'Status Antrean: Di-pause';
  showToast('Antrean di-pause', 'warning');
}

function stopQueue() {
  isQueuePaused = false;
  clearInterval(queueTimer);
  currentQueueIndex = 0;
  const timerEl = document.getElementById('timer-display');
  const statusEl = document.getElementById('queue-status-title');
  if (timerEl) timerEl.textContent = '0s';
  if (statusEl) statusEl.textContent = 'Status Antrean: Dihentikan';
  showToast('Antrean dihentikan', 'error');
}

function processNextInQueue() {
  const selectedCheckboxes = Array.from(document.querySelectorAll('.queue-item-checkbox:checked'));
  const statusEl = document.getElementById('queue-status-title');
  
  if (currentQueueIndex >= selectedCheckboxes.length) {
    if (statusEl) statusEl.textContent = 'Status Antrean: Selesai';
    showToast('Seluruh antrean telah diproses!', 'success');
    return;
  }

  if (isQueuePaused) return;

  const targetId = selectedCheckboxes[currentQueueIndex].getAttribute('data-id');
  openWaSingle(parseInt(targetId));

  currentQueueIndex++;
  const progEl = document.getElementById('queue-progress-text');
  if (progEl) progEl.textContent = `${currentQueueIndex} dari ${selectedCheckboxes.length} peserta diproses`;

  const delayEl = document.getElementById('reminder-delay');
  const delaySec = delayEl ? (parseInt(delayEl.value) || 15) : 15;
  countdownValue = delaySec;
  const timerEl = document.getElementById('timer-display');
  if (timerEl) timerEl.textContent = `${countdownValue}s`;

  clearInterval(queueTimer);
  queueTimer = setInterval(() => {
    if (isQueuePaused) return;
    countdownValue--;
    if (timerEl) timerEl.textContent = `${countdownValue}s`;
    if (countdownValue <= 0) {
      clearInterval(queueTimer);
      processNextInQueue();
    }
  }, 1000);
}

// ==========================================
// 4. TEMPLATE PESAN PAGE
// ==========================================
async function renderTemplatePage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="toolbar">
      <h3>Daftar Template Pesan</h3>
      <button class="btn btn-primary" onclick="openAddTemplateModal()"><i data-lucide="plus"></i> Tambah Template</button>
    </div>
    <div class="card-grid" id="template-card-grid">
      <div class="loading-state"><i data-lucide="loader"></i> Memuat template...</div>
    </div>
  `;
  lucide.createIcons();
  fetchTemplates();
}

async function fetchTemplates() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    currentTemplates = data;
    const grid = document.getElementById('template-card-grid');
    if (!grid) return;

    if (data.length === 0) {
      grid.innerHTML = `<div class="empty-state"><p>Belum ada template pesan.</p></div>`;
      return;
    }

    grid.innerHTML = data.map(t => `
      <div class="table-card" style="padding: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h4>${escapeHtml(t.title)} ${t.is_default ? '<span class="badge badge-success">Default</span>' : ''}</h4>
          <div>
            <button class="btn-icon-only" onclick="previewTemplateModal(${t.id})"><i data-lucide="eye"></i></button>
            <button class="btn-icon-only" onclick="openEditTemplateModal(${t.id})"><i data-lucide="edit-2"></i></button>
            <button class="btn-icon-only danger" onclick="openDeleteModal('template', ${t.id}, '${escapeHtml(t.title)}')"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
        <p style="font-size:0.85rem; color:var(--text-muted); white-space:pre-wrap; background:rgba(0,0,0,0.02); padding:12px; border-radius:8px;">${escapeHtml(t.content)}</p>
      </div>
    `).join('');
    lucide.createIcons();
  } catch (err) { showToast(err.message, 'error'); }
}

function openAddTemplateModal() {
  document.getElementById('template-id').value = '';
  document.getElementById('form-template').reset();
  document.getElementById('modal-template-title').textContent = 'Tambah Template Pesan';
  openModal('modal-template');
}

function openEditTemplateModal(id) {
  const t = currentTemplates.find(item => item.id === id);
  if (!t) return;
  document.getElementById('template-id').value = t.id;
  document.getElementById('template-name').value = t.title;
  document.getElementById('template-content').value = t.content;
  document.getElementById('template-default').checked = t.is_default;
  document.getElementById('modal-template-title').textContent = 'Edit Template Pesan';
  openModal('modal-template');
}

function previewTemplateModal(id) {
  const t = currentTemplates.find(item => item.id === id);
  if (!t) return;
  const sample = { name: 'Budi Santoso', card_number: '000123456789', installment_amount: 150000, due_date: '2026-09-20' };
  const recEl = document.getElementById('wa-preview-receiver');
  const bodyEl = document.getElementById('wa-preview-body');
  if (recEl) recEl.textContent = 'Preview Template';
  if (bodyEl) bodyEl.textContent = compileMessage(t.content, sample);
  openModal('modal-wa-preview');
}

async function handleSaveTemplate(e) {
  e.preventDefault();
  const id = document.getElementById('template-id').value;
  const payload = {
    title: document.getElementById('template-name').value,
    content: document.getElementById('template-content').value,
    is_default: document.getElementById('template-default').checked
  };

  try {
    const url = id ? `/api/templates/${id}` : '/api/templates';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error);
    closeModal('modal-template');
    showToast('Template berhasil disimpan!', 'success');
    fetchTemplates();
  } catch (err) { showToast(err.message, 'error'); }
}

// ==========================================
// 5. RIWAYAT PENGIRIMAN PAGE
// ==========================================
async function renderRiwayatPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="table-card">
      <div class="toolbar" style="padding: 16px 20px; margin-bottom: 0;">
        <h3>Riwayat & Konfirmasi Pengiriman</h3>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Nama Peserta</th>
              <th>No. WhatsApp</th>
              <th>Template</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="logs-table-body">
            <tr><td colspan="6" class="loading-state"><i data-lucide="loader"></i> Memuat riwayat...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  lucide.createIcons();
  fetchLogs();
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    currentLogs = data;
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Belum ada riwayat pengiriman.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(l => `
      <tr>
        <td>${new Date(l.sent_at).toLocaleString('id-ID')}</td>
        <td><strong>${escapeHtml(l.patient_name)}</strong></td>
        <td>${escapeHtml(l.phone_number)}</td>
        <td>${escapeHtml(l.template_title || '-')}</td>
        <td><span class="badge ${l.status === 'Terkirim' ? 'badge-success' : 'badge-warning'}">${l.status}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            ${l.status === 'Dibuka' 
              ? `<button class="btn btn-success" style="padding:4px 10px; font-size:0.8rem;" onclick="confirmSent(${l.id})"><i data-lucide="check"></i> Set "Sudah Dikirim"</button>`
              : `<small class="text-muted"><i data-lucide="check-circle-2"></i> Konfirmasi (${new Date(l.confirmed_at).toLocaleTimeString('id-ID')})</small>`
            }
            <button class="btn-icon-only danger" onclick="openDeleteModal('log', ${l.id}, 'Riwayat ${escapeHtml(l.patient_name)}')" title="Hapus Riwayat">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    lucide.createIcons();
  } catch (err) { showToast(err.message, 'error'); }
}

async function confirmSent(logId) {
  try {
    const res = await fetch(`/api/logs/${logId}/confirm`, { method: 'PUT' });
    if (!res.ok) throw new Error((await res.json()).error);
    showToast('Status berhasil diubah menjadi Terkirim!', 'success');
    fetchLogs();
  } catch (err) { showToast(err.message, 'error'); }
}

// ==========================================
// 6. PENGATURAN PAGE
// ==========================================
function renderPengaturanPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="table-card" style="padding: 24px; max-width: 600px;">
      <h3 style="margin-bottom: 20px;">Pengaturan Sistem</h3>
      <form id="form-settings" onsubmit="handleSaveSettings(event)">
        <div class="form-group" style="margin-bottom: 16px;">
          <label>Default Jeda Pengiriman (Detik)</label>
          <input type="number" id="setting-delay" class="form-control" value="${globalSettings.default_delay || '15'}" required>
        </div>
        <button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Simpan Pengaturan</button>
      </form>
    </div>
  `;
  lucide.createIcons();
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const delay = document.getElementById('setting-delay').value;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_delay: delay })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    globalSettings.default_delay = delay;
    showToast('Pengaturan berhasil disimpan!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// ==========================================
// CONFIRM DELETE HANDLER (HAPUS PESERTA / TEMPLATE / LOG)
// ==========================================
function openDeleteModal(type, id, name) {
  deleteType = type;
  deleteTargetId = id;
  const targetEl = document.getElementById('delete-target-name');
  if (targetEl) targetEl.textContent = name;
  openModal('modal-delete');
}

async function handleConfirmDelete() {
  if (!deleteTargetId || !deleteType) return;
  
  let endpoint = '';
  if (deleteType === 'patient') endpoint = `/api/patients/${deleteTargetId}`;
  else if (deleteType === 'template') endpoint = `/api/templates/${deleteTargetId}`;
  else if (deleteType === 'log') endpoint = `/api/logs/${deleteTargetId}`;

  try {
    const res = await fetch(endpoint, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    closeModal('modal-delete');
    
    let itemLabel = 'Data';
    if (deleteType === 'patient') itemLabel = 'Peserta';
    else if (deleteType === 'template') itemLabel = 'Template';
    else if (deleteType === 'log') itemLabel = 'Riwayat';

    showToast(`${itemLabel} berhasil dihapus!`, 'success');

    if (deleteType === 'patient') fetchPatients();
    else if (deleteType === 'template') fetchTemplates();
    else if (deleteType === 'log') fetchLogs();

    deleteTargetId = null;
    deleteType = null;
  } catch (err) { showToast(err.message, 'error'); }
}
