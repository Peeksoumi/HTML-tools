// Lola · relais AIS via aisstream.io
// Cloudflare Worker + Durable Object : garde une connexion websocket ouverte vers
// aisstream.io, mémorise le dernier relevé du MMSI 227158520 et le renvoie en texte
// "lat lon vitesse cap HH:MM:SS" (même format que l'ancien worker), ou en JSON avec ?format=json.
//
// La clé d'API n'est JAMAIS dans ce fichier : elle est stockée comme secret AISSTREAM_KEY.

const MMSI = "227158520";

// Boîte autour de l'estuaire de la Loire (Nantes -> Saint-Nazaire), [lat, lon] sud-ouest puis nord-est
const BOITE = [[[47.0, -2.4], [47.45, -1.3]]];

const WS_URL = "https://stream.aisstream.io/v0/stream";

// La connexion se ferme toute seule si personne n'interroge le worker pendant ce délai
const INACTIVITE_MS = 10 * 60 * 1000;

// Délai minimal entre deux tentatives de connexion
const PAUSE_RECONNEXION_MS = 15 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    const id = env.LOLA_AIS.idFromName("lola");
    return env.LOLA_AIS.get(id).fetch(request);
  },
};

export class LolaAIS {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ws = null;
    this.connexionEnCours = null;
    this.dernierEssai = 0;
    this.derniereDemande = 0;
    this.dernier = null;
    this.etat = "déconnecté";
    this.erreur = "";
    this.messagesRecus = 0;

    // Recharge le dernier relevé mémorisé (survit aux redémarrages)
    this.state.blockConcurrencyWhile(async () => {
      this.dernier = (await this.state.storage.get("dernier")) || null;
    });
  }

  async fetch(request) {
    this.derniereDemande = Date.now();
    this.assurerConnexion();

    // Réveil périodique pour fermer la connexion si plus personne n'interroge
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + 60 * 1000);
    }

    const url = new URL(request.url);
    const enJson = url.searchParams.get("format") === "json";
    const d = this.dernier;
    const age = d ? Math.max(0, Math.round((Date.now() - d.t) / 1000)) : null;

    if (enJson) {
      return new Response(
        JSON.stringify({
          mmsi: MMSI,
          releve: d
            ? {
                lat: d.lat,
                lon: d.lon,
                vitesseNoeuds: d.vitesse,
                capDegres: d.cap,
                heureUtc: new Date(d.t).toISOString(),
                ageSecondes: age,
              }
            : null,
          connexion: this.etat,
          messagesRecusDepuisConnexion: this.messagesRecus,
          erreur: this.erreur || null,
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    if (!d) {
      return new Response(
        "attente du premier releve AIS (connexion : " + this.etat + (this.erreur ? ", " + this.erreur : "") + ")",
        { status: 503, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    const heureParis = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(d.t));

    const texte =
      d.lat.toFixed(6) + " " + d.lon.toFixed(6) + " " + d.vitesse.toFixed(1) + " " + Math.round(d.cap) + " " + heureParis;

    return new Response(texte, {
      status: 200,
      headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  assurerConnexion() {
    if (this.ws || this.connexionEnCours) return;
    if (Date.now() - this.dernierEssai < PAUSE_RECONNEXION_MS) return;
    this.dernierEssai = Date.now();
    this.connexionEnCours = this.connecter()
      .catch((e) => {
        this.etat = "erreur";
        this.erreur = String(e && e.message ? e.message : e);
      })
      .finally(() => {
        this.connexionEnCours = null;
      });
  }

  async connecter() {
    if (!this.env.AISSTREAM_KEY) {
      this.etat = "erreur";
      this.erreur = "secret AISSTREAM_KEY absent";
      return;
    }

    this.etat = "connexion";
    this.erreur = "";
    this.messagesRecus = 0;

    const reponse = await fetch(WS_URL, { headers: { Upgrade: "websocket" } });
    const ws = reponse.webSocket;
    if (!ws) throw new Error("pas de websocket (HTTP " + reponse.status + ")");

    ws.accept();

    ws.send(
      JSON.stringify({
        APIKey: this.env.AISSTREAM_KEY,
        BoundingBoxes: BOITE,
        FiltersShipMMSI: [MMSI],
        FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport"],
      })
    );

    ws.addEventListener("message", (ev) => {
      this.recevoir(ev.data);
    });

    ws.addEventListener("close", () => {
      if (this.ws === ws) {
        this.ws = null;
        this.etat = "déconnecté";
      }
    });

    ws.addEventListener("error", () => {
      if (this.ws === ws) {
        this.ws = null;
        this.etat = "erreur";
        this.erreur = "erreur websocket";
      }
    });

    this.ws = ws;
    this.etat = "connecté";
  }

  async recevoir(donnees) {
    let texte;
    try {
      texte = typeof donnees === "string" ? donnees : new TextDecoder().decode(donnees);
    } catch (e) {
      return;
    }

    let m;
    try {
      m = JSON.parse(texte);
    } catch (e) {
      return;
    }

    // aisstream signale ses refus (clé invalide, boîte invalide...) par un champ "error"
    if (m && m.error) {
      this.etat = "erreur";
      this.erreur = String(m.error);
      return;
    }

    const corps = m && m.Message && (m.Message.PositionReport || m.Message.StandardClassBPositionReport);
    if (!corps) return;

    const meta = m.MetaData || {};
    if (String(meta.MMSI !== undefined ? meta.MMSI : corps.UserID) !== MMSI) return;

    const lat = Number.isFinite(corps.Latitude) ? corps.Latitude : meta.latitude;
    const lon = Number.isFinite(corps.Longitude) ? corps.Longitude : meta.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    // Valeurs "non disponible" du standard AIS : vitesse 102.3, cap 360
    const sog = Number.isFinite(corps.Sog) && corps.Sog < 102.3 ? corps.Sog : 0;
    let cog = Number.isFinite(corps.Cog) && corps.Cog < 360 ? corps.Cog : null;
    if (cog === null) cog = Number.isFinite(corps.TrueHeading) && corps.TrueHeading < 360 ? corps.TrueHeading : 0;

    // time_utc : "2026-11-19 08:39:12.123456 +0000 UTC"
    let t = Date.parse(String(meta.time_utc || "").slice(0, 19).replace(" ", "T") + "Z");
    if (!Number.isFinite(t)) t = Date.now();

    this.messagesRecus++;
    this.dernier = { lat, lon, vitesse: sog, cap: cog, t };
    await this.state.storage.put("dernier", this.dernier);
  }

  async alarm() {
    if (Date.now() - this.derniereDemande > INACTIVITE_MS) {
      if (this.ws) {
        try {
          this.ws.close(1000, "inactif");
        } catch (e) {}
        this.ws = null;
      }
      this.etat = "déconnecté (inactif)";
      return;
    }
    await this.state.storage.setAlarm(Date.now() + 60 * 1000);
  }
}
