import { createClient } from '@supabase/supabase-js';

const geminiApiKey = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
    if (!geminiApiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en el servidor' });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`);
        
        if (!response.ok) {
            const errTxt = await response.text();
            return res.status(response.status).json({ 
                error: 'Error consultando modelos', 
                status: response.status,
                details: errTxt 
            });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: 'Error interno: ' + error.message });
    }
}
