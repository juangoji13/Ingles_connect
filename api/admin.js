export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Verificar contraseña de admin
    const adminPassword = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;
    const providedPassword = req.headers['x-admin-password'] ? req.headers['x-admin-password'].trim() : '';

    if (!adminPassword) {
      return res.status(500).json({ error: 'Configuración incompleta: ADMIN_PASSWORD no está definida en Vercel.' });
    }

    if (providedPassword !== adminPassword) {
      const first = adminPassword[0];
      const last = adminPassword[adminPassword.length - 1];
      return res.status(401).json({ 
        error: 'No autorizado', 
        debug: `Longitud: ${adminPassword.length}, Empieza por: "${first}", Termina en: "${last}"` 
      });
    }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // GET /api/admin → Listar todas las licencias
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ licenses: data });
  }

  // POST /api/admin → Crear licencia
  if (req.method === 'POST') {
    const { key, limit_questions, days } = req.body;

    if (!key || !limit_questions) {
      return res.status(400).json({ error: 'key y limit_questions son requeridos' });
    }

    const expires_at = days
      ? new Date(Date.now() + days * 86400000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('licenses')
      .insert([{ key, limit_questions: parseInt(limit_questions), used_questions: 0, expires_at }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ license: data });
  }

  // DELETE /api/admin → Eliminar licencia por key
  if (req.method === 'DELETE') {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'key es requerido' });

    const { error } = await supabase.from('licenses').delete().eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
}
