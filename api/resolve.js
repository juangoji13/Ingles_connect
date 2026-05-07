import { createClient } from '@supabase/supabase-js';

// Inicializar cliente Supabase usando variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

// Asegurarse de que las variables estén configuradas
if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
    console.error("Faltan variables de entorno");
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
    // Solo permitir peticiones POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { licenseKey, prompt, imagesBase64 } = req.body;

    if (!licenseKey) {
        return res.status(400).json({ error: 'Licencia requerida' });
    }

    if (!supabase) {
        return res.status(500).json({ error: 'El servidor no tiene configurada la base de datos' });
    }

    try {
        // 1. Validar la licencia en Supabase
        const { data: license, error: dbError } = await supabase
            .from('licenses')
            .select('*')
            .eq('key', licenseKey)
            .single();

        if (dbError || !license) {
            return res.status(403).json({ error: 'Licencia inválida o no encontrada' });
        }

        if (license.used_questions >= license.limit_questions) {
            return res.status(403).json({ error: 'Has alcanzado el límite de preguntas de tu licencia' });
        }

        // 2. Preparar el payload para Gemini 2.5 Flash
        const sys = "Eres un asistente experto en resolver tareas. Lee la pregunta y proporciona ÚNICAMENTE la respuesta correcta. No expliques nada. Si es llenar espacios, devuelve las palabras separadas por guión o coma. Si es opción múltiple, devuelve la opción correcta.";
        
        let parts = [{ text: prompt }];
        
        if (imagesBase64 && imagesBase64.length) {
            imagesBase64.forEach(b64 => {
                const mime = b64.substring(b64.indexOf(':') + 1, b64.indexOf(';'));
                const base64Data = b64.substring(b64.indexOf(',') + 1);
                parts.push({
                    inline_data: { mime_type: mime, data: base64Data }
                });
            });
        }

        const geminiBody = {
            contents: [{ parts: parts }],
            systemInstruction: { parts: [{ text: sys }] },
            generationConfig: { temperature: 0.1 }
        };

        // 3. Llamar a la API de Gemini con mecanismo de fallback
        let model = 'gemini-2.0-flash';
        let geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
        });

        // Si el modelo principal falla por alta demanda (503) o límite de cuota (429), intentar con la versión Lite
        if (!geminiRes.ok && (geminiRes.status === 503 || geminiRes.status === 429)) {
            console.log(`Modelo ${model} no disponible (${geminiRes.status}). Intentando con gemini-2.0-flash-lite...`);
            model = 'gemini-2.0-flash-lite';
            geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiBody)
            });
        }

        if (!geminiRes.ok) {
            const errTxt = await geminiRes.text();
            console.error(`Gemini Error (${geminiRes.status}):`, errTxt);
            
            // Pasar el error exacto al frontend para que el usuario pueda verlo
            let errorMsg = `Error Gemini (${geminiRes.status}): ${errTxt}`;
            if (geminiRes.status === 400 && errTxt.includes('API key not valid')) {
                errorMsg = 'La clave API de Gemini configurada en el servidor no es válida.';
            } else if (geminiRes.status === 404) {
                errorMsg = `El modelo ${model} no fue encontrado o la URL es incorrecta en v1beta.`;
            }
            
            return res.status(500).json({ error: errorMsg });
        }

        const data = await geminiRes.json();
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            console.error("Respuesta inválida de Gemini:", JSON.stringify(data));
            return res.status(500).json({ error: 'Respuesta inválida de la IA' });
        }

        const answer = data.candidates[0].content.parts[0].text.trim();

        // 4. Actualizar el contador en Supabase
        const { error: updateError } = await supabase
            .from('licenses')
            .update({ used_questions: license.used_questions + 1 })
            .eq('key', licenseKey);
            
        if (updateError) {
            console.error("Error actualizando contador de licencia:", updateError);
        }

        // 5. Devolver la respuesta al cliente
        return res.status(200).json({ answer: answer });

    } catch (error) {
        console.error("Internal Server Error:", error);
        return res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
}
