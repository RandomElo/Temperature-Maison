import * as Network from 'expo-network';

export async function getURL() {

    const LAN_URL = 'http://192.168.1.31:8116/api';
    const TAILSCALE_URL = 'http://100.64.0.8:8116/api';
    const LAN_IP_PREFIXES = ['192.168.1.'];
    try {
        const ip = await Network.getIpAddressAsync();

        if (ip && LAN_IP_PREFIXES.some((prefix) => ip.startsWith(prefix))) {
            return LAN_URL;
        }
    } catch (e) {
        // En cas d'erreur, on retombe sur Tailscale par défaut
    }
    return TAILSCALE_URL;
}

function convertirHistorique(histo) {
    if (!Array.isArray(histo)) return [];
    return histo.map((pt) => ({
        timestamp: heureVersDate(pt.heure).toISOString(),
        heure: pt.heure,
        valeur: Number(pt.valeur),
    }));
}

function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function heureVersDate(heure) {
    const [h, m, s] = heure.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, s || 0, 0);
    return d;
}

function mapApiResponse(json) {
    const source = json?.donneesRetour;
    if (!Array.isArray(source)) throw new Error('Format inattendu (donneesRetour manquant)');

    const rooms = source
        .map((r, i) => {
            const histTemp = convertirHistorique(r.historiqueTemperature);
            const histHum = convertirHistorique(r.historiqueHumidite);
            const histPress = convertirHistorique(r.historiquePression);

            const lastTemp = histTemp[histTemp.length - 1];
            const lastHum = histHum[histHum.length - 1];
            const lastPress = histPress[histPress.length - 1];

            const history = histTemp.map((pt, idx) => ({
                timestamp: pt.timestamp,
                temperature: pt.valeur,
                humidity: histHum[idx] ? histHum[idx].valeur : null,
            }));

            return {
                // ⚠️ id basé sur le nom faute de mieux : demande à ajouter
                // "id: capteur.id" côté API pour un identifiant stable.
                id: r.nom ? r.nom.toLowerCase().replace(/\s+/g, '-') + '-' + i : 'piece-' + i,
                name: r.nom || 'Pièce ' + (i + 1),
                current: {
                    temperature: lastTemp ? lastTemp.valeur : (r.moyenneTemperature ? Number(r.moyenneTemperature) : null),
                    humidity: lastHum ? lastHum.valeur : (r.moyenneHumidite ? Number(r.moyenneHumidite) : null),
                    timestamp: lastTemp ? lastTemp.timestamp : new Date().toISOString(),
                },
                pressure: lastPress ? lastPress.valeur : (r.moyennePression ? Number(r.moyennePression) : null),
                history: history.filter((h) => h.temperature != null || h.humidity != null),
            };
        })
        .filter((r) => r.history.length > 0 && r.current.temperature != null);

    // --- AJOUT : données extérieures ---
    // Elles sont dupliquées sur chaque capteur côté API (même valeurs à chaque
    // itération de la boucle du backend), donc on les lit sur le premier élément.
    let exterior = null;
    const premier = source[0];
    if (premier) {
        const histTempExt = convertirHistorique(premier.historiqueTemperatureExterieur);
        const histHumExt = convertirHistorique(premier.historiqueHumiditesExterieur);

        const historyExt = histTempExt
            .map((pt, idx) => ({
                timestamp: pt.timestamp,
                temperature: pt.valeur,
                humidity: histHumExt[idx] ? histHumExt[idx].valeur : null,
            }))
            .filter((h) => h.temperature != null || h.humidity != null);

        const lastTempExt = histTempExt[histTempExt.length - 1];
        const lastHumExt = histHumExt[histHumExt.length - 1];

        if (historyExt.length > 0) {
            exterior = {
                current: {
                    temperature: lastTempExt ? lastTempExt.valeur : null,
                    humidity: lastHumExt ? lastHumExt.valeur : null,
                    timestamp: lastTempExt ? lastTempExt.timestamp : new Date().toISOString(),
                },
                history: historyExt,
            };
        }
    }

    return { rooms, exterior };
}

export async function fetchData(date) {
    const url = await getURL();
    const dateParam = toISODate(new Date(date));
    const response = await fetch(`${url}?date=${dateParam}`);
    if (!response.ok) {
        throw new Error(`Erreur API: ${response.status}`);
    }
    const json = await response.json();
    return mapApiResponse(json);
}
// Les jours passés ne changent plus : on les garde en mémoire.
const cacheJours = new Map();

// Données des 7 derniers jours se terminant à `endDate` (du plus ancien au plus récent).
// Un jour en échec vaut null.
export async function fetchWeek(endDate) {
    const aujourdhui = toISODate(new Date());
    const jours = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(endDate);
        d.setDate(d.getDate() - i);
        jours.push(d);
    }
    return Promise.all(
        jours.map(async (date) => {
            const cle = toISODate(date);
            if (cle !== aujourdhui && cacheJours.has(cle)) return { date, data: cacheJours.get(cle) };
            try {
                const data = await fetchData(date);
                if (cle !== aujourdhui) cacheJours.set(cle, data);
                return { date, data };
            } catch (e) {
                return { date, data: null };
            }
        })
    );
}
