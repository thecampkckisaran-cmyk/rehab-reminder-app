import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('client'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// API DASHBOARD STATS
// ==========================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const { count: totalPatients, error: e1 } = await supabase.from('patients').select('*', { count: 'exact', head: true });
    if (e1) throw e1;

    const { count: dueTodayCount, error: e2 } = await supabase.from('patients').select('*', { count: 'exact', head: true }).eq('due_date', todayStr);
    if (e2) throw e2;

    const { data: sentLogs, error: e3 } = await supabase.from('reminder_logs').select('patient_id').eq('status', 'Terkirim');
    if (e3) throw e3;

    const remindedPatientIds = [...new Set(sentLogs.map(l => l.patient_id))];
    const remindedCount = remindedPatientIds.length;
    const notRemindedCount = Math.max(0, (totalPatients || 0) - remindedCount);

    const { data: recentLogs, error: e4 } = await supabase.from('reminder_logs').select('*').order('sent_at', { ascending: false }).limit(5);
    if (e4) throw e4;

    res.json({
      totalPatients: totalPatients || 0,
      dueToday: dueTodayCount || 0,
      notReminded: notRemindedCount,
      reminded: remindedCount,
      recentLogs: recentLogs || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API PESERTA REHAB (CRUD + Search + Filter)
// ==========================================
app.get('/api/patients', async (req, res) => {
  try {
    const { search, status, sort, category } = req.query;
    let query = supabase.from('patients').select('*');

    if (status && status !== 'Semua') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%,card_number.ilike.%${search}%`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (category) {
      const { data: allPatients, error: errAll } = await query;
      if (errAll) throw errAll;

      const filtered = allPatients.filter(p => {
        const pDate = new Date(p.due_date);
        pDate.setHours(0, 0, 0, 0);
        const diffTime = pDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (category === 'today') return diffDays === 0;
        if (category === 'h-1') return diffDays === 1;
        if (category === 'h-3') return diffDays === 3;
        if (category === 'overdue') return diffDays < 0;
        return true;
      });

      return res.json({ data: filtered, count: filtered.length });
    }

    if (sort === 'asc') {
      query = query.order('due_date', { ascending: true });
    } else if (sort === 'desc') {
      query = query.order('due_date', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients', async (req, res) => {
  try {
    const { name, phone_number, card_number, installment_amount, due_date, notes, status } = req.body;
    const { data, error } = await supabase
      .from('patients')
      .insert([{ name, phone_number, card_number, installment_amount, due_date, notes, status }])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone_number, card_number, installment_amount, due_date, notes, status } = req.body;
    const { data, error } = await supabase
      .from('patients')
      .update({ name, phone_number, card_number, installment_amount, due_date, notes, status })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('patients').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Peserta berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API TEMPLATE PESAN
// ==========================================
app.get('/api/templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('templates').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/templates', async (req, res) => {
  try {
    const { title, content, is_default } = req.body;
    if (is_default) {
      await supabase.from('templates').update({ is_default: false }).neq('id', 0);
    }
    const { data, error } = await supabase.from('templates').insert([{ title, content, is_default }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_default } = req.body;
    if (is_default) {
      await supabase.from('templates').update({ is_default: false }).neq('id', id);
    }
    const { data, error } = await supabase.from('templates').update({ title, content, is_default }).eq('id', id).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Template berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API RIWAYAT & LOG REMINDER
// ==========================================
app.get('/api/logs', async (req, res) => {
  try {
    const { data, error } = await supabase.from('reminder_logs').select('*').order('sent_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logs', async (req, res) => {
  try {
    const { patient_id, patient_name, phone_number, template_title, message_content, status } = req.body;
    const { data, error } = await supabase
      .from('reminder_logs')
      .insert([{ patient_id, patient_name, phone_number, template_title, message_content, status: status || 'Dibuka' }])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/logs/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('reminder_logs')
      .update({ status: 'Terkirim', confirmed_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/logs/:id - Hapus Riwayat Pengiriman
app.delete('/api/logs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('reminder_logs').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Riwayat pengiriman berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API PENGATURAN SISTEM
// ==========================================
app.get('/api/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw error;
    const settingsObj = {};
    (data || []).forEach(item => { settingsObj[item.key] = item.value; });
    res.json(settingsObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settingsMap = req.body;
    for (const [key, value] of Object.entries(settingsMap)) {
      await supabase.from('settings').upsert({ key, value: String(value) });
    }
    res.json({ message: 'Pengaturan berhasil disimpan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server REHAB Reminder berjalan di http://localhost:${port}`);
});