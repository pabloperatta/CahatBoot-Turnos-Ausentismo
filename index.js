//prueba 2 clou run
const functions = require('@google-cloud/functions-framework');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const axios = require('axios');

// --- 1. CONFIGURACIONES ---
const dbConfig = {
    host: 'gateway01.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '4SFgiG3XJMPBg5H.root',
    password: 'C4ceetCo8oXR0ht1',
    database: 'sanidad_uns',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
};

const transporter = nodemailer.createTransport({
    host: "smtps.uns.edu.ar",
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    authMethod: "PLAIN"
});

// const WHATSAPP_TOKEN = '';
// const PHONE_NUMBER_ID = '111704695202356';
// const FLOW_ID = "1492426432562187";
// Lectura desde las variables de entorno de Cloud Run
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const FLOW_ID = process.env.FLOW_ID || "1492426432562187";
const FLOW_TURNOS_ID = process.env.FLOW_TURNOS_ID || "1722441952077691";
const FLOW_HUB_ID = process.env.FLOW_HUB_ID || "1751645145962515";

// --- 2. FUNCIONES DE APOYO Y COMUNICACIÓN ---

async function enviarMensajeWA(telefono, texto) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: telefono,
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: texto },
                footer: { text: "💡 Escribe HOLA o MENU para ver opciones" },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: { id: "btn_menu_directo", title: "📋 Menú Principal" }
                        }
                    ]
                }
            }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });
    } catch (error) {
        console.error("Error enviando WA:", error.response?.data || error.message);
    }
}

// Nueva versión adaptada a fecha_desde y fecha_hasta (YYYY-MM-DD)
function calcularFechasBloqueadas(historial) {
    let bloqueadas = [];

    for (let reg of historial) {
        if (!reg.fecha_desde || !reg.fecha_hasta) continue;

        let dIni = new Date(reg.fecha_desde + "T00:00:00");
        let dFin = new Date(reg.fecha_hasta + "T00:00:00");
        let temp = new Date(dIni);

        while (temp <= dFin) {
            bloqueadas.push(temp.toISOString().split('T')[0]);
            temp.setDate(temp.getDate() + 1);
        }
    }
    return bloqueadas;
}

// Menú Principal Interactivo (1 Sola Tarjeta de Flow Hub Unificado)
async function enviarMenuPrincipal(connection, telefono, nombre) {
    if (typeof connection === 'string') {
        nombre = telefono;
        telefono = connection;
        connection = null;
    }

    let conn = connection;
    let createdConn = false;
    if (!conn) {
        conn = await mysql.createConnection(dbConfig);
        createdConn = true;
    }

    try {
        const [historial] = await conn.execute('SELECT fecha_desde, fecha_hasta FROM ausencias_reportadas WHERE telefono = ?', [telefono]);
        const fechasOcupadas = calcularFechasBloqueadas(historial);

        const data = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: telefono,
            type: "interactive",
            interactive: {
                type: "flow",
                header: { type: "text", text: "Servicio de Medicina del Trabajo" },
                body: { text: `¡Hola ${nombre}! Presiona el botón de abajo para acceder al centro de servicios de sanidad.` },
                footer: { text: "💡 Escribe HOLA o MENU para ver este menú" },
                action: {
                    name: "flow",
                    parameters: {
                        flow_message_version: "3",
                        flow_token: telefono,
                        flow_id: FLOW_HUB_ID,
                        flow_cta: "🚀 Menú de Servicios",
                        flow_action: "navigate",
                        flow_action_payload: {
                            screen: "SCREEN_MENU",
                            data: {
                                fechas_bloqueadas: fechasOcupadas
                            }
                        }
                    }
                }
            }
        };
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, data, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
    } catch (e) {
        console.error("Error enviando Menú Hub:", e.response?.data || e.message);
    } finally {
        if (createdConn && conn) await conn.end();
    }
}

// 1. Envío de Flow de Ausentismo (Acceso directo a FORMULARIO_AUSENCIA)
async function enviarFlowAusentismo(connection, telefono, nombre) {
    let conn = connection;
    let createdConn = false;
    if (!conn) {
        conn = await mysql.createConnection(dbConfig);
        createdConn = true;
    }
    try {
        const [historial] = await conn.execute('SELECT fecha_desde, fecha_hasta FROM ausencias_reportadas WHERE telefono = ?', [telefono]);
        const fechasOcupadas = calcularFechasBloqueadas(historial);

        const data = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: telefono,
            type: "interactive",
            interactive: {
                type: "flow",
                header: { type: "text", text: "Servicio de Medicina del Trabajo" },
                body: { text: `¡Hola ${nombre}! Para registrar un Ausentismo Laboral, presiona el botón de abajo.` },
                footer: { text: "💡 Escribe HOLA o MENU para ver opciones" },
                action: {
                    name: "flow",
                    parameters: {
                        flow_message_version: "3",
                        flow_token: "token_" + Math.random().toString(36).substring(7),
                        flow_id: FLOW_ID,
                        flow_cta: "📋 Registrar Ausentismo",
                        flow_action: "navigate",
                        flow_action_payload: {
                            screen: "FORMULARIO_AUSENCIA",
                            data: {
                                fechas_bloqueadas: fechasOcupadas
                            }
                        }
                    }
                }
            }
        };
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, data, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
    } catch (e) {
        console.error("Error enviando Flow de Ausentismo:", e.response?.data || e.message);
    } finally {
        if (createdConn && conn) await conn.end();
    }
}

// 2. Envío de Flow de Turnos (Acceso directo a APPOINTMENT)
async function enviarFlowTurnos(telefono, nombre) {
    const data = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefono,
        type: "interactive",
        interactive: {
            type: "flow",
            header: { type: "text", text: "Servicio de Medicina del Trabajo" },
            body: { text: `Para solicitar o consultar Turnos Médicos, presiona el botón de abajo.` },
            footer: { text: "💡 Escribe HOLA o MENU para ver opciones" },
            action: {
                name: "flow",
                parameters: {
                    flow_message_version: "3",
                    flow_token: telefono,
                    flow_id: FLOW_TURNOS_ID,
                    flow_cta: "📅 Reservar Turno",
                    flow_action: "data_exchange"
                }
            }
        }
    };
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, data, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
    } catch (e) {
        console.error("Error enviando Flow de Turnos:", e.response?.data || e.message);
    }
}

// --- 3. LÓGICA DE ONBOARDING ---

async function manejarOnboarding(connection, telefono, texto) {
    const TIEMPO_EXPIRACION_MINUTOS = 5;
    const MAX_INTENTOS = 3;

    const [estados] = await connection.execute(
        `SELECT *, (TIMESTAMPDIFF(MINUTE, updated_at, UTC_TIMESTAMP())) as minutos_pasados 
         FROM registro_estados WHERE telefono = ?`, [telefono]
    );
    const estadoActual = estados[0];

    if (estadoActual && estadoActual.minutos_pasados >= TIEMPO_EXPIRACION_MINUTOS) {
        await connection.execute('DELETE FROM registro_estados WHERE telefono = ?', [telefono]);
        await enviarMensajeWA(telefono, "⏳ Tu sesión anterior expiró. Ingresa nuevamente tu Legajo:");
        await connection.execute('INSERT INTO registro_estados (telefono, estado, intentos) VALUES (?, ?, 0)', [telefono, 'ESPERANDO_LEGAJO']);
        return;
    }

    if (!estadoActual) {
        await enviarMensajeWA(telefono, "Bienvenido al *Servicio de Medicina del Trabajo*. Ingresa tu Legajo para identificarte:");
        await connection.execute('INSERT INTO registro_estados (telefono, estado, intentos) VALUES (?, ?, 0)', [telefono, 'ESPERANDO_LEGAJO']);
    }
    else if (estadoActual.estado === 'ESPERANDO_LEGAJO') {
        const legajo = parseInt(texto);
        if (isNaN(legajo)) return await enviarMensajeWA(telefono, "Por favor, ingresa solo números para tu legajo.");

        const [personal] = await connection.execute('SELECT email, nombre FROM personal_uns WHERE legajo = ?', [legajo]);

        if (personal.length > 0) {
            const codigo = Math.floor(100000 + Math.random() * 900000);
            const { email, nombre } = personal[0];
            const emailOculto = email.replace(/(.{2})(.*)(?=@)/, "$1***");

            try {
                await transporter.sendMail({
                    from: `"Medicina Laboral UNS" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: "Código de Verificación - Medicina Laboral",
                    html: `<div style="font-family: Arial; text-align: center; padding: 20px;">
                            <h2>Tu código de verificación</h2>
                            <p>Hola <b>${nombre}</b>, ingresá el siguiente código:</p>
                            <h1 style="color: #003399; letter-spacing: 5px;">${codigo}</h1>
                           </div>`
                });
                await enviarMensajeWA(telefono, `📬 Enviamos un código a ${emailOculto}. Ingrésalo aquí:`);
                await connection.execute(
                    'UPDATE registro_estados SET estado = ?, legajo_intentado = ?, codigo_verificacion = ?, intentos = 0 WHERE telefono = ?',
                    ['ESPERANDO_CODIGO', legajo, codigo, telefono]
                );
            } catch (err) {
                console.error("Error SMTP:", err);
                await enviarMensajeWA(telefono, "❌ Error al enviar el mail. Reintenta luego.");
            }
        } else {
            const nuevosIntentos = (estadoActual.intentos || 0) + 1;
            if (nuevosIntentos >= MAX_INTENTOS) {
                await connection.execute('DELETE FROM registro_estados WHERE telefono = ?', [telefono]);
                await enviarMensajeWA(telefono, "❌ Demasiados intentos. Escribe algo para reiniciar.");
            } else {
                await connection.execute('UPDATE registro_estados SET intentos = ? WHERE telefono = ?', [nuevosIntentos, telefono]);
                await enviarMensajeWA(telefono, `Legajo inexistente (Intento ${nuevosIntentos}/${MAX_INTENTOS}):`);
            }
        }
    }
    else if (estadoActual.estado === 'ESPERANDO_CODIGO') {
        // Validamos que el código sea correcto
        if (texto.trim() == estadoActual.codigo_verificacion) {
            try {
                // 1. Buscamos el nombre
                const [personal] = await connection.execute('SELECT nombre FROM personal_uns WHERE legajo = ?', [estadoActual.legajo_intentado]);

                // 2. LA CLAVE: Desvinculamos este teléfono de cualquier OTRO legajo de pruebas viejo
                await connection.execute('UPDATE personal_uns SET telefono_wa = NULL, validado = 0 WHERE telefono_wa = ?', [telefono]);

                // 3. Lo vinculamos al legajo nuevo
                await connection.execute('UPDATE personal_uns SET telefono_wa = ?, validado = 1 WHERE legajo = ?', [telefono, estadoActual.legajo_intentado]);

                // 4. Borramos la sesión temporal (ahora sí va a funcionar)
                await connection.execute('DELETE FROM registro_estados WHERE telefono = ?', [telefono]);

                // 5. Avisamos y enviamos el menú principal
                await enviarMensajeWA(telefono, "✅ ¡Validación exitosa!");
                await enviarMenuPrincipal(telefono, personal[0]?.nombre || "Usuario");

            } catch (errDb) {
                // Si la base de datos falla, evitamos que el bot se quede mudo
                console.error("Error crítico al guardar en BD:", errDb);
                await enviarMensajeWA(telefono, "❌ Hubo un error de base de datos al validar tu legajo. Por favor, reintenta en unos minutos.");
            }
        } else {
            // El camino si el código es incorrecto
            const nuevosIntentos = (estadoActual.intentos || 0) + 1;
            if (nuevosIntentos >= MAX_INTENTOS) {
                await connection.execute('DELETE FROM registro_estados WHERE telefono = ?', [telefono]);
                await enviarMensajeWA(telefono, "❌ Sesión cerrada por intentos fallidos. Escribe cualquier mensaje para volver a empezar.");
            } else {
                await connection.execute('UPDATE registro_estados SET intentos = ? WHERE telefono = ?', [nuevosIntentos, telefono]);
                await enviarMensajeWA(telefono, `Código incorrecto. Quedan ${MAX_INTENTOS - nuevosIntentos} intentos:`);
            }
        }
    }
}

// --- 4. WEBHOOK PRINCIPAL ---

functions.http('webhookSanidad', async (req, res) => {
    // A. Verificación del Webhook
    if (req.method === 'GET') {
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (token === 'UNS_SECRET_2026') return res.status(200).send(challenge);
        return res.sendStatus(403);
    }

    // B. Procesamiento de Mensajes Entrantes
    if (req.method === 'POST') {
        const body = req.body;
        const mensajeData = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (mensajeData) {
            const telefono = mensajeData.from;
            const connection = await mysql.createConnection(dbConfig);

            try {
                // 0. RECEPCIÓN DE RESPUESTA DE INTERACTIVOS (MENÚ PRINCIPAL: BOTONES O LISTA)
                if (mensajeData.type === 'interactive' && (mensajeData.interactive.button_reply || mensajeData.interactive.list_reply)) {
                    const itemReply = mensajeData.interactive.button_reply || mensajeData.interactive.list_reply;
                    const buttonId = itemReply.id;
                    const [usuarios] = await connection.execute('SELECT nombre FROM personal_uns WHERE telefono_wa = ? AND validado = 1', [telefono]);
                    const nombre = usuarios[0]?.nombre || "Usuario";

                    if (buttonId === 'btn_inasistencia') {
                        await enviarFlowAusentismo(connection, telefono, nombre);
                    } else if (buttonId === 'btn_turno') {
                        await enviarFlowTurnos(connection, telefono, nombre);
                    } else if (buttonId === 'btn_menu_directo') {
                        if (usuarios.length > 0) {
                            await enviarMenuPrincipal(telefono, nombre);
                        } else {
                            await manejarOnboarding(connection, telefono, "hola");
                        }
                    }
                    return res.sendStatus(200);
                }

                // 1. RECEPCIÓN DE FLOW (DATOS DEL FORMULARIO - AUSENTISMO O TURNOS)
                else if (mensajeData.type === 'interactive' && mensajeData.interactive.nfm_reply) {
                    const resp = JSON.parse(mensajeData.interactive.nfm_reply.response_json);

                    // 1.A Si es confirmación de Turno Médico
                    if (resp.tramite === 'turnos' || resp.time || (resp.status === 'success' && !resp.fecha_desde)) {
                        const turnoId = resp.time;
                        if (turnoId && turnoId !== 'none') {
                            const [usuarios] = await connection.execute('SELECT legajo FROM personal_uns WHERE telefono_wa = ? AND validado = 1', [telefono]);
                            const legajo = usuarios[0]?.legajo || null;

                            // Verificar si ya posee turno activo con este mismo profesional
                            const [profCheck] = await connection.execute('SELECT profesional_id FROM turnos WHERE id = ?', [turnoId]);
                            const profesionalId = profCheck[0]?.profesional_id;

                            if (legajo && profesionalId) {
                                const [dupCheck] = await connection.execute(
                                    `SELECT id FROM turnos WHERE personal_id = ? AND profesional_id = ? AND estado IN ('RESERVADO', 'BLOQUEADO') AND id != ? AND fecha_turno >= CURDATE()`,
                                    [legajo, profesionalId, turnoId]
                                );
                                if (dupCheck.length > 0) {
                                    await enviarMensajeWA(telefono, "⚠️ *Reserva Cancelada*\n\nYa posees un turno médico activo agendado con este mismo profesional.");
                                    return res.sendStatus(200);
                                }
                            }

                            const obsReserva = `Reservado por WA: ${telefono} | Legajo: ${legajo || 'N/A'}`;

                            await connection.execute(
                                `UPDATE turnos SET personal_id = ?, estado = 'RESERVADO', expiracion_bloqueo = NULL, observaciones = ? WHERE id = ?`,
                                [legajo, obsReserva, turnoId]
                            );

                            const [detalles] = await connection.execute(`
                                SELECT t.id, DATE_FORMAT(t.fecha_turno, '%d/%m/%Y') AS fecha, TIME_FORMAT(t.hora_turno, '%H:%i') AS hora,
                                       CONCAT(p.apellido, ', ', p.nombre) AS profesional_nombre,
                                       e.nombre AS especialidad_nombre
                                FROM turnos t
                                LEFT JOIN profesionales p ON t.profesional_id = p.id
                                LEFT JOIN especialidades e ON p.especialidad_id = e.id
                                WHERE t.id = ?
                            `, [turnoId]);

                            const d = detalles[0];
                            const msgSummary = d ?
                                `🎉 *¡Reserva de Turno Confirmada con Éxito!*\n\n` +
                                `📅 *Fecha*: ${d.fecha}\n` +
                                `⏰ *Hora*: ${d.hora} hs\n` +
                                `🩺 *Especialidad*: ${d.especialidad_nombre || 'Medicina General'}\n` +
                                `👨‍⚕️ *Profesional*: ${d.profesional_nombre || 'Profesional UNS'}\n` +
                                `🔢 *Nro. de Turno*: #${d.id}\n\n` :
                                `🎉 *¡Reserva Confirmada con Éxito!*\n\nTu turno #${turnoId} ha sido registrado correctamente en Sanidad UNS.`;

                            await enviarMensajeWA(telefono, msgSummary);
                        } else {
                            await enviarMensajeWA(telefono, "🎉 *¡Reserva Confirmada con Éxito!*\n\nTu turno ha sido registrado en Sanidad UNS.");
                        }
                        return res.sendStatus(200);
                    }

                    // 1.B Si es Ausentismo: Asegurarse de que los campos existan
                    if (!resp.fecha_desde || !resp.fecha_hasta) {
                        await enviarMensajeWA(telefono, "❌ Faltan datos de fecha. Por favor, intenta nuevamente.");
                        return res.sendStatus(200);
                    }

                    const { motivo, fecha_desde, fecha_hasta, notas, adjunta } = resp;
                    const vaAAdjuntar = (adjunta === true || adjunta === 'true');

                    // 1.1 Desarmar el rango solicitado en un array de días
                    const inicio = new Date(fecha_desde + "T00:00:00");
                    const fin = new Date(fecha_hasta + "T00:00:00");

                    let diasSolicitados = [];
                    let temp = new Date(inicio);
                    while (temp <= fin) {
                        diasSolicitados.push(temp.toISOString().split('T')[0]);
                        temp.setDate(temp.getDate() + 1);
                    }

                    // 1.2 Traer el historial para ver colisiones
                    const [historial] = await connection.execute(
                        'SELECT fecha_desde, fecha_hasta FROM ausencias_reportadas WHERE telefono = ?',
                        [telefono]
                    );
                    const diasOcupados = calcularFechasBloqueadas(historial);

                    // 1.3 Verificar si hay colisión
                    const diaConflictivo = diasSolicitados.find(dia => diasOcupados.includes(dia));

                    if (diaConflictivo) {
                        await enviarMensajeWA(telefono, `❌ *Error de validación*\n\nEl rango elegido incluye el día *${diaConflictivo}*, que ya tienes registrado.\n\nPor favor, vuelve a abrir el menú y ajusta las fechas.`);
                        return res.sendStatus(200);
                    }

                    // 1.4 Guardar si todo está OK
                    const cantDias = diasSolicitados.length;
                    const [usuarios] = await connection.execute('SELECT legajo FROM personal_uns WHERE telefono_wa = ? AND validado = 1', [telefono]);
                    const legajo = usuarios[0]?.legajo || null;
                    const estadoInicial = vaAAdjuntar ? 'ESPERANDO_CERTIFICADO' : 'PENDIENTE_SIN_CERTIFICADO';

                    await connection.execute(
                        'INSERT INTO ausencias_reportadas (telefono, motivo, fecha_desde, fecha_hasta, dias, observaciones, personal_id, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [telefono, motivo, fecha_desde, fecha_hasta, cantDias, notas || '', legajo, estadoInicial]
                    );

                    if (vaAAdjuntar) {
                        await enviarMensajeWA(telefono, "✅ Fechas registradas.\n\n📷 Ahora, por favor, envía una foto o PDF de tu certificado médico (Máx. 3 archivos).");
                    } else {
                        await enviarMensajeWA(telefono, "✅ Ausentismo registrado correctamente.\n\n");
                    }
                }

                // 2. RECEPCIÓN DE MEDIOS (IMAGEN O DOCUMENTO)
                else if (mensajeData.type === 'image' || mensajeData.type === 'document') {
                    const tipoMedio = mensajeData.type;
                    const mediaObj = mensajeData[tipoMedio];

                    if (tipoMedio === 'document' && mediaObj.mime_type !== 'application/pdf') {
                        await enviarMensajeWA(telefono, "❌ Formato no soportado. Por favor, envía solo imágenes o archivos PDF.");
                        return res.sendStatus(200);
                    }

                    const [reportes] = await connection.execute(
                        'SELECT id FROM ausencias_reportadas WHERE telefono = ? AND estado = "ESPERANDO_CERTIFICADO" ORDER BY created_at DESC LIMIT 1', [telefono]
                    );

                    if (reportes.length > 0) {
                        const reporteId = reportes[0].id;
                        const [adjuntos] = await connection.execute('SELECT COUNT(*) as total FROM adjuntos_reporte WHERE reporte_id = ?', [reporteId]);
                        const cantidadActual = adjuntos[0].total;

                        if (cantidadActual >= 3) {
                            await enviarMensajeWA(telefono, "⚠️ Límite de 3 archivos alcanzado. Escribe *LISTO* para finalizar el trámite.");
                            return res.sendStatus(200);
                        }

                        try {
                            const mediaRes = await axios.get(`https://graph.facebook.com/v18.0/${mediaObj.id}`, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

                            if (mediaRes.data.file_size > 5 * 1024 * 1024) {
                                await enviarMensajeWA(telefono, "❌ El archivo supera los 5MB permitidos. Intenta con uno más liviano.");
                                return res.sendStatus(200);
                            }

                            const fileRes = await axios.get(mediaRes.data.url, {
                                responseType: 'arraybuffer',
                                headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
                            });
                            const base64 = Buffer.from(fileRes.data).toString('base64');
                            let mimeType = tipoMedio === 'image' ? (mediaObj.mime_type || 'image/jpeg') : 'application/pdf';
                            const dataUri = `data:${mimeType};base64,${base64}`;

                            await connection.execute(
                                'INSERT INTO adjuntos_reporte (reporte_id, tipo_archivo, archivo_base64) VALUES (?, ?, ?)',
                                [reporteId, tipoMedio, dataUri]
                            );

                            const restantes = 3 - (cantidadActual + 1);
                            if (restantes > 0) {
                                await enviarMensajeWA(telefono, `✅ Archivo ${cantidadActual + 1}/3 guardado. Si terminaste, escribe *LISTO*. Si tienes más, envíalos.`);
                            } else {
                                await connection.execute('UPDATE ausencias_reportadas SET estado = "COMPLETADO" WHERE id = ?', [reporteId]);
                                await enviarMensajeWA(telefono, "🎉 Has adjuntado los 3 archivos. Trámite completado y enviado a Sanidad.");
                            }
                        } catch (err) {
                            console.error("Error descarga media:", err.message);
                            await enviarMensajeWA(telefono, "❌ Error al procesar el archivo. Reintenta.");
                        }
                    } else {
                        await enviarMensajeWA(telefono, "No tienes trámites en espera de archivos.");
                    }
                }

                // 3. RECEPCIÓN DE TEXTO
                else if (mensajeData.text) {
                    const texto = mensajeData.text.body.trim();
                    const textoUpper = texto.toUpperCase();

                    // Comando de cierre manual
                    if (textoUpper === 'LISTO') {
                        const [reportes] = await connection.execute(
                            'SELECT id FROM ausencias_reportadas WHERE telefono = ? AND estado = "ESPERANDO_CERTIFICADO" ORDER BY created_at DESC LIMIT 1', [telefono]
                        );
                        if (reportes.length > 0) {
                            const [adjuntos] = await connection.execute('SELECT COUNT(*) as total FROM adjuntos_reporte WHERE reporte_id = ?', [reportes[0].id]);
                            if (adjuntos[0].total > 0) {
                                await connection.execute('UPDATE ausencias_reportadas SET estado = "COMPLETADO" WHERE id = ?', [reportes[0].id]);
                                await enviarMensajeWA(telefono, "🎉 Trámite finalizado correctamente. Documentación recibida.\n\n💡 Escribe *HOLA* o *MENU* para volver al menú principal.");
                            } else {
                                await enviarMensajeWA(telefono, "⚠️ Aún no has enviado ninguna foto. Debes enviar el certificado antes de escribir LISTO.");
                            }
                            return res.sendStatus(200);
                        }
                    }

                    // Flujo normal de texto / Onboarding
                    await connection.execute('INSERT INTO consultas_whatsapp (telefono, mensaje) VALUES (?, ?)', [telefono, texto]);
                    const [usuarios] = await connection.execute('SELECT nombre FROM personal_uns WHERE telefono_wa = ? AND validado = 1', [telefono]);

                    if (usuarios.length > 0) {
                        await enviarMenuPrincipal(telefono, usuarios[0].nombre);
                    } else {
                        await manejarOnboarding(connection, telefono, texto);
                    }
                }
            } catch (err) {
                console.error('Error general del proceso:', err);
            } finally {
                await connection.end();
            }
        }
        return res.sendStatus(200);
    }
});