"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardarPasos = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
/**
 * POST { pasos: number, fecha: "YYYY-MM-DD" }
 * Guarda en Firestore: pasos/{fecha} → { pasos, fecha, updatedAt }
 * Usado por el Shortcut de iPhone para sincronizar Apple Health
 */
exports.guardarPasos = (0, https_1.onRequest)({ cors: true, region: 'us-central1' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const body = req.body;
    const pasos = Number(body.pasos);
    const fecha = typeof body.fecha === 'string' ? body.fecha.trim() : '';
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(pasos) || pasos < 0) {
        res.status(400).json({
            error: 'Parámetros inválidos',
            esperados: { pasos: 'número >= 0', fecha: 'YYYY-MM-DD' },
            recibidos: body,
        });
        return;
    }
    await db.collection('pasos').doc(fecha).set({
        pasos: Math.round(pasos),
        fecha,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(200).json({ success: true, pasos: Math.round(pasos), fecha });
});
//# sourceMappingURL=index.js.map