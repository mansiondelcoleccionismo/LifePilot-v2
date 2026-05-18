import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

admin.initializeApp()
const db = admin.firestore()

/**
 * POST { pasos: number, fecha: "YYYY-MM-DD" }
 * Guarda en Firestore: pasos/{fecha} → { pasos, fecha, updatedAt }
 * Usado por el Shortcut de iPhone para sincronizar Apple Health
 */
export const guardarPasos = onRequest(
  { cors: true, region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const body = req.body as { pasos?: unknown; fecha?: unknown }
    const pasos = Number(body.pasos)
    const fecha = typeof body.fecha === 'string' ? body.fecha.trim() : ''

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(pasos) || pasos < 0) {
      res.status(400).json({
        error: 'Parámetros inválidos',
        esperados: { pasos: 'número >= 0', fecha: 'YYYY-MM-DD' },
        recibidos: body,
      })
      return
    }

    await db.collection('pasos').doc(fecha).set({
      pasos:     Math.round(pasos),
      fecha,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    res.status(200).json({ success: true, pasos: Math.round(pasos), fecha })
  },
)
