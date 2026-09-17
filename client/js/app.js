// ==========================================
// KREDENSIAL SUPABASE
// ==========================================
const SUPABASE_URL = 'https://gyhrzqhsitgbipqvuqkz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vsH4sTBo_bY1buaKmwT4qQ_ZYvZXf20';

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Global State
let currentPatients = [];
let currentTemplates = [];
let currentLogs = [];
let globalSettings = { default_delay: '15' };

let deleteTargetId = null;
let deleteType = null;

let currentPage = 1;
const itemsPerPage = 10;
let searchQuery = '';
let statusFilter = 'Semua';
let sortOrder = '';

// Queue State
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
      navigateTo(item.getAttribute('data-page'));
    });
  });

  document.getElementById('form-patient').addEventListener('submit', handleSavePatient);
  document.getElementById('form-template').addEventListener('submit', handleSaveTemplate);
  document.getElementById('btn-confirm-delete').addEventListener('click', handleConfirmDelete);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  fetchSettings();
  navigateTo('dashboard');
});

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
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
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

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }

async function fetchSettings() {
  try {
    if (!supabase) return;
    const { data } = await supabase.from('settings').select('*').single();
    if (data) globalSettings = data;
  } catch (e) { console.error(e); }
}

// 1. DASHBOARD PAGE
async function renderDashboardPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="card-grid">
      <div class="stat-card"><div class="stat-icon"><i data-lucide="users"></i></div><div class="stat-info"><h3 id="stat-total">0</h3><p>Total Peserta</p></div></div>
      <div class="stat-card"><div class="stat-icon"><i data-lucide="clock"></i></div><div class="stat-info"><h3 id="stat-today">0</h3><p>Jatuh Tempo Hari Ini</p></div></div>
      <div class="stat-card"><div class="stat-icon"><i data-lucide="alert-circle"></i></div><div class="stat-info"><h3 id="stat-not-reminded">0</h3><p>Belum Diingatkan</p></div></div>
      <div class="stat-card"><div class="stat-icon"><i data-lucide="check-circle-2"></i></div><div class="stat-info"><h3 id="stat-reminded">0</h3><p>Sudah Diingatkan</p></div></div>
    </div>
    <div class="table-card">
      <div class="toolbar" style="padding: 16px 20px; margin-bottom: 0;"><h3>Aktivitas Pengiriman Terbaru</h3></div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Waktu</th><th>Nama Peserta</th><th>No. WhatsApp</th><th>Status</th></tr></thead>
          <tbody id="dashboard-recent-logs"><tr><td colspan="4" class="loading-state"><i data-lucide="loader"></i> Memuat...</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  lucide.createIcons();

  try {
    if (!supabase) return;
    const { data: patients } = await supabase.from('patients').select('*');
    const { data: logs } = await supabase.from('logs').select('*').order('sent_at', { ascending: false });

    const totalPatients = patients ? patients.length : 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const dueToday = patients ? patients.filter(p => p.due_date === todayStr).length : 0;
    const remindedCount = logs ? logs.filter(l => l.status === 'Terkirim').length : 0;

    document.getElementById('stat-total').textContent = totalPatients;
    document.getElementById('stat-today').textContent = dueToday;
    document.getElementById('stat-not-reminded').textContent = Math.max(0, totalPatients - remindedCount);
    document.getElementById('stat-reminded').textContent = remindedCount;

    const tbody = document.getElementById('dashboard-recent-logs');
    if (tbody) {
      const recent = logs ? logs.slice(0, 5) : [];
      if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Belum ada aktivitas pengiriman.</td></tr>`;
      } else {
        tbody.innerHTML = recent.map(l => `
          <tr>
            <td>${new Date(l.sent_at).toLocaleString('id-ID')}</td>
            <td><strong>${escapeHtml(l.patient_name)}</strong></td>
            <td>${escapeHtml(l.phone_number)}</td>
            <td><span class="badge ${l.status === 'Terkirim' ? 'badge-success' : 'badge-warning'}">${l.status}</span></td>
          </tr>
        `).join('');
      }
    }
  } catch (err) { showToast(err.message, 'error'); }
}

// 2. PESERTA PAGE
function renderPesertaPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="toolbar">
      <div class="search-filter-group">
        <input type="text" id="search-input" class="form-control" placeholder="Cari..." value="${searchQuery}" onkeyup="handleSearch(event)">
        <select id="filter-status" class="form-control" onchange="handleFilterStatus(this.value)">
          <option value="Semua" ${statusFilter === 'Semua' ? 'selected' : ''}>Semua Status</option>
          <option value="Aktif" ${statusFilter === 'Aktif' ? 'selected' : ''}>Aktif</option>
          <option value="Non-Aktif" ${statusFilter === 'Non-Aktif' ? 'selected' : ''}>Non-Aktif</option>
        </select>
        <select id="sort-date" class="form-control" onchange="handleSortDate(this.value)">
          <option value="" ${sortOrder === '' ? 'selected' : ''}>Urutkan Jatuh Tempo</option>
          <option value="asc" ${sortOrder === 'asc' ? 'selected' : ''}>Terdekat</option>
          <option value="desc" ${sortOrder === 'desc' ? 'selected' : ''}>Terjauh</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="openAddPatientModal()"><i data-lucide="user-plus"></i> Tambah Peserta</button>
    </div>
    <div class="table-card">
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>No</th><th>Nama Peserta</th><th>No. WhatsApp</th><th>No. Kartu JKN</th><th>Nominal</th><th>Jatuh Tempo</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody id="patient-table-body"><tr><td colspan="8" class="loading-state"><i data-lucide="loader"></i> Memuat data...</td></tr></tbody>
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
    if (!supabase) return;
    let query = supabase.from('patients').select('*');
    if (statusFilter !== 'Semua') query = query.eq('status', statusFilter);
    if (sortOrder) query = query.order('due_date', { ascending: sortOrder === 'asc' });

    const { data, error } = await query;
    if (error) throw error;

    let res = data || [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      res = res.filter(p => (p.name && p.name.toLowerCase().includes(q)) || (p.phone_number && p.phone_number.includes(q)));
    }
    currentPatients = res;
    renderPatientTableData();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderPatientTableData() {
  const tbody = document.getElementById('patient-table-body');
  if (!tbody) return;
  if (currentPatients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Tidak ada data peserta ditemukan</td></tr>`;
    return;
  }
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedData = currentPatients.slice(startIdx, startIdx + itemsPerPage);

  tbody.innerHTML = paginatedData.map((p, idx) => `
    <tr>
      <td>${startIdx + idx + 1}</td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.phone_number)}</td>
      <td>${escapeHtml(p.card_number)}</td>
      <td>${formatRupiah(p.installment_amount)}</td>
      <td>${formatDateIndo(p.due_date)}</td>
      <td><span class="badge ${p.status === 'Aktif' ? 'badge-success' : 'badge-warning'}">${p.status}</span></td>
      <td>
        <button class="btn-icon-only" onclick="openEditPatientModal(${p.id})"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon-only danger" onclick="openDeleteModal('patient', ${p.id}, '${escapeHtml(p.name)}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>
  `).join('');
  lucide.createIcons();
}

function handleSearch(e) { searchQuery = e.target.value; currentPage = 1; fetchPatients(); }
function handleFilterStatus(val) { statusFilter = val; currentPage = 1; fetchPatients(); }
function handleSortDate(val) { sortOrder = val; fetchPatients(); }

function openAddPatientModal() {
  document.getElementById('patient-id').value = '';
  document.getElementById('form-patient').reset();
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
    if (id) await supabase.from('patients').update(payload).eq('id', id);
    else await supabase.from('patients').insert([payload]);
    closeModal('modal-patient');
    showToast('Berhasil disimpan!', 'success');
    fetchPatients();
  } catch (err) { showToast(err.message, 'error'); }
}

// 3. REMINDER PAGE
async function renderReminderPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="toolbar">
      <select id="reminder-category" class="form-control" onchange="loadReminderQueue()">
        <option value="today">Jatuh Tempo Hari Ini</option>
        <option value="h-1">H-1 Jatuh Tempo</option>
        <option value="h-3">H-3 Jatuh Tempo</option>
        <option value="overdue">Terlambat (Overdue)</option>
      </select>
      <select id="reminder-template" class="form-control" onchange="selectedTemplateId = this.value">
        <option value="">-- Pilih Template Pesan --</option>
      </select>
      <button class="btn btn-primary" onclick="startQueue()"><i data-lucide="play"></i> Mulai Antrean</button>
    </div>
    <div class="table-card">
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Nama Peserta</th><th>No. WhatsApp</th><th>Nominal</th><th>Jatuh Tempo</th><th>Aksi</th></tr></thead>
          <tbody id="reminder-table-body"><tr><td colspan="5">Memuat...</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  lucide.createIcons();

  try {
    const { data } = await supabase.from('templates').select('*');
    currentTemplates = data || [];
    const sel = document.getElementById('reminder-template');
    if (sel && currentTemplates.length > 0) {
      currentTemplates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title;
        sel.appendChild(opt);
      });
      selectedTemplateId = sel.value;
    }
  } catch (e) { console.error(e); }

  loadReminderQueue();
}

async function loadReminderQueue() {
  const tbody = document.getElementById('reminder-table-body');
  try {
    const { data } = await supabase.from('patients').select('*').eq('status', 'Aktif');
    reminderQueue = data || [];
    if (!tbody) return;
    tbody.innerHTML = reminderQueue.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${escapeHtml(p.phone_number)}</td>
        <td>${formatRupiah(p.installment_amount)}</td>
        <td>${formatDateIndo(p.due_date)}</td>
        <td><button class="btn btn-secondary" onclick="openWaSingle(${p.id})">Buka WA</button></td>
      </tr>
    `).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

async function openWaSingle(patientId) {
  const p = reminderQueue.find(item => item.id === patientId) || currentPatients.find(item => item.id === patientId);
  if (!p) return;

  const template = currentTemplates.find(t => String(t.id) === String(selectedTemplateId)) || currentTemplates[0];
  const msg = template ? template.content.replace(/{nama}/g, p.name) : `Pengingat REHAB BPJS`;

  try {
    await supabase.from('logs').insert([{
      patient_id: p.id,
      patient_name: p.name,
      phone_number: p.phone_number,
      template_title: template ? template.title : 'Manual',
      message_content: msg,
      status: 'Dibuka',
      sent_at: new Date().toISOString()
    }]);
  } catch (e) { console.error(e); }

  let phone = p.phone_number.replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// 4. TEMPLATE PAGE
async function renderTemplatePage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `<div class="toolbar"><h3>Template Pesan</h3><button class="btn btn-primary" onclick="openAddTemplateModal()">Tambah</button></div><div id="template-card-grid"></div>`;
  fetchTemplates();
}

async function fetchTemplates() {
  const { data } = await supabase.from('templates').select('*');
  currentTemplates = data || [];
  const grid = document.getElementById('template-card-grid');
  if (grid) {
    grid.innerHTML = currentTemplates.map(t => `<div class="table-card" style="padding:15px; margin-bottom:10px;"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.content)}</p></div>`).join('');
  }
}

function openAddTemplateModal() { openModal('modal-template'); }
async function handleSaveTemplate(e) {
  e.preventDefault();
  const payload = { title: document.getElementById('template-name').value, content: document.getElementById('template-content').value };
  await supabase.from('templates').insert([payload]);
  closeModal('modal-template');
  fetchTemplates();
}

// 5. RIWAYAT PAGE (DENGAN TOMBOL HIJAU & SINKRONISASI)
async function renderRiwayatPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="table-card">
      <div class="toolbar" style="padding: 16px 20px;"><h3>Riwayat Pengiriman</h3></div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Waktu</th><th>Nama Peserta</th><th>No. WA</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody id="logs-table-body"><tr><td colspan="5">Memuat...</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  fetchLogs();
}

async function fetchLogs() {
  const { data } = await supabase.from('logs').select('*').order('sent_at', { ascending: false });
  currentLogs = data || [];
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  tbody.innerHTML = currentLogs.map(l => `
    <tr>
      <td>${new Date(l.sent_at).toLocaleString('id-ID')}</td>
      <td><strong>${escapeHtml(l.patient_name)}</strong></td>
      <td>${escapeHtml(l.phone_number)}</td>
      <td><span class="badge ${l.status === 'Terkirim' ? 'badge-success' : 'badge-warning'}">${l.status}</span></td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          ${l.status === 'Dibuka' 
            ? `<button class="btn btn-success" style="padding:4px 10px; font-size:0.8rem;" onclick="confirmSent(${l.id})"><i data-lucide="check"></i> Set "Sudah Dikirim"</button>`
            : `<small class="text-muted"><i data-lucide="check-circle-2"></i> Konfirmasi (${l.confirmed_at ? new Date(l.confirmed_at).toLocaleTimeString('id-ID') : '-'})</small>`
          }
          <button class="btn-icon-only danger" onclick="openDeleteModal('log', ${l.id}, '${escapeHtml(l.patient_name)}')"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
  lucide.createIcons();
}

async function confirmSent(logId) {
  try {
    const { error } = await supabase
      .from('logs')
      .update({ status: 'Terkirim', confirmed_at: new Date().toISOString() })
      .eq('id', logId);

    if (error) throw error;
    showToast('Status berhasil diubah!', 'success');
    fetchLogs();
  } catch (err) { showToast(err.message, 'error'); }
}

// 6. PENGATURAN PAGE
function renderPengaturanPage() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `<div class="table-card" style="padding:20px;"><h3>Pengaturan</h3></div>`;
}

// DELETE HANDLER
function openDeleteModal(type, id, name) {
  deleteType = type;
  deleteTargetId = id;
  const targetEl = document.getElementById('delete-target-name');
  if (targetEl) targetEl.textContent = name;
  openModal('modal-delete');
}

async function handleConfirmDelete() {
  if (!deleteTargetId || !deleteType) return;
  try {
    let tableName = deleteType === 'patient' ? 'patients' : (deleteType === 'template' ? 'templates' : 'logs');
    await supabase.from(tableName).delete().eq('id', deleteTargetId);
    closeModal('modal-delete');
    showToast('Data berhasil dihapus!', 'success');

    if (deleteType === 'patient') fetchPatients();
    else if (deleteType === 'template') fetchTemplates();
    else if (deleteType === 'log') fetchLogs();
  } catch (err) { showToast(err.message, 'error'); }
}
