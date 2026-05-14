import { createClient } from '@supabase/supabase-js';

// Inicializar cliente Supabase usando variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Soporte para múltiples API Keys de Gemini (separadas por coma) para evadir el límite gratuito
const rawGeminiKey = process.env.GEMINI_API_KEY || "";
const geminiApiKeys = rawGeminiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);

// Asegurarse de que las variables estén configuradas
if (!supabaseUrl || !supabaseKey || geminiApiKeys.length === 0) {
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

    if (geminiApiKeys.length === 0) {
        return res.status(500).json({ error: 'Falta la configuración de las llaves de Gemini (API Keys)' });
    }

    // Seleccionar una llave de Gemini al azar para balancear la carga y evitar el límite 429
    const geminiApiKey = geminiApiKeys[Math.floor(Math.random() * geminiApiKeys.length)];

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

        // 2. Preparar el payload para Gemini (se usa gemini-2.5-flash por consistencia del usuario)
        const sys = "You are an expert English teacher solving student assignments. Follow these rules STRICTLY:\n" +
                    "1. Provide ONLY the final answer. DO NOT explain, DO NOT repeat the question, DO NOT provide context, DO NOT use introductory phrases (like 'The answer is:' or 'You should use:').\n" +
                    "2. If the question asks to fill a blank, output ONLY the word or phrase that goes in the blank.\n" +
                    "3. For multiple-choice questions, provide ONLY 'Letter. Text' (e.g., 'B. False').\n" +
                    "4. If there are multiple blanks, provide each answer on a new line. NOTHING ELSE.\n" +
                    "5. For matching, provide: 'Phrase -> Word'.\n" +
                    "6. For missing letters, provide the COMPLETE word only.\n" +
                    "7. CRITICAL: If you provide any text other than the answer itself, the student will fail. Be 100% direct.";
        
        let answer = "";

        if (imagesBase64 && imagesBase64.length > 0) {
            // LÓGICA DE GEMINI (SI HAY IMÁGENES)
            let parts = [{ text: prompt }];
            imagesBase64.forEach(b64 => {
                const mime = b64.substring(b64.indexOf(':') + 1, b64.indexOf(';'));
                const base64Data = b64.substring(b64.indexOf(',') + 1);
                parts.push({
                    inline_data: { mime_type: mime, data: base64Data }
                });
            });

            const geminiBody = {
                contents: [{ parts: parts }],
                systemInstruction: { parts: [{ text: sys }] },
                generationConfig: { temperature: 0.1 }
            };

            let model = 'gemini-2.5-flash';
            let geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiBody)
            });

            if (!geminiRes.ok && (geminiRes.status === 503 || geminiRes.status === 429)) {
                console.log(`Modelo ${model} no disponible (${geminiRes.status}). Intentando con gemini-2.5-flash-lite...`);
                model = 'gemini-2.5-flash-lite';
                geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiBody)
                });
            }

            if (!geminiRes.ok) {
                const errTxt = await geminiRes.text();
                console.error(`Gemini Error (${geminiRes.status}):`, errTxt);
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

            answer = data.candidates[0].content.parts[0].text.trim();
        } else {
            // LÓGICA DE GROQ (SOLO TEXTO)
            const groqApiKey = process.env.GROQ_API_KEY;
            
            if (!groqApiKey) {
                return res.status(500).json({ error: 'Falta la configuración de la llave de Groq (GROQ_API_KEY) en Vercel.' });
            }
            
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqApiKey}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    temperature: 0.1,
                    messages: [
                        { role: "system", content: sys },
                        { role: "user", content: prompt }
                    ]
                })
            });

            if (!groqRes.ok) {
                const errTxt = await groqRes.text();
                console.error(`Groq Error (${groqRes.status}):`, errTxt);
                return res.status(500).json({ error: `Error Groq (${groqRes.status}): ${errTxt}` });
            }

            const data = await groqRes.json();
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error("Respuesta inválida de Groq:", JSON.stringify(data));
                return res.status(500).json({ error: 'Respuesta inválida de la IA (Groq)' });
            }
            
            answer = data.choices[0].message.content.trim();
        }

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
